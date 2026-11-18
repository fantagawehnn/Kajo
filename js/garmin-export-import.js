import { supabase } from './supabase-client.js';
import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { inferSport, inferCategory } from './activities.js';
import { extractGarminVo2MaxRecords } from './garmin-performance-archive.js';
import { SUPABASE_ANON_KEY } from './supabase-config.js';
import {
    classifyGarminExportFile,
    collectGarminSummaryActivities,
    mapGarminExportActivity
} from './garmin-export-import-core.js';

const BUCKET = 'garmin-exports';
const PROJECT_ID = 'zgvargkfzgekokuisarv';
const LARGE_JSON_BYTES = 750 * 1024;
const TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;
const FILE_BATCH_SIZE = 25;
const PERFORMANCE_BATCH_SIZE = 100;
let activeImportId = null;

function setImportStatus(message, percent = null, kind = 'info') {
    const status = document.getElementById('garmin-archive-status');
    const progress = document.getElementById('garmin-archive-progress');
    const fill = document.getElementById('garmin-archive-progress-fill');
    if (status) {
        status.textContent = message;
        status.className = 'text-xs ' + (kind === 'error' ? 'text-rose-300' : kind === 'success' ? 'text-emerald-300' : 'text-slate-300');
    }
    if (progress) progress.classList.toggle('hidden', percent === null);
    if (fill && percent !== null) fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
}

function safeStoragePath(path) {
    return String(path || 'garmin-file.json').split('/').map(part =>
        encodeURIComponent(part.replace(/\.\./g, '_')).replace(/%2F/gi, '_')
    ).join('/');
}

async function uploadJsonObject(objectPath, blob) {
    if (blob.size <= TUS_THRESHOLD_BYTES) {
        const { error } = await supabase.storage.from(BUCKET).upload(objectPath, blob, {
            contentType: 'application/json',
            upsert: true,
            cacheControl: '3600'
        });
        if (error) throw error;
        return;
    }
    if (typeof tus === 'undefined' || typeof tus.Upload !== 'function') {
        throw new Error('Der resumierbare Upload-Dienst ist für eine große JSON-Datei nicht verfügbar.');
    }
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
    await new Promise((resolve, reject) => {
        const upload = new tus.Upload(blob, {
            endpoint: 'https://' + PROJECT_ID + '.storage.supabase.co/storage/v1/upload/resumable',
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: { authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: {
                bucketName: BUCKET,
                objectName: objectPath,
                contentType: 'application/json',
                cacheControl: '3600'
            },
            chunkSize: 6 * 1024 * 1024,
            onError: reject,
            onSuccess: resolve
        });
        upload.findPreviousUploads().then(previous => {
            if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
            upload.start();
        }).catch(reject);
    });
}

function topLevelRecordCount(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 1;
}

function dateBounds(value, budget = { count: 0 }, output = []) {
    if (!value || typeof value !== 'object' || budget.count > 12000) return output;
    budget.count++;
    if (Array.isArray(value)) {
        for (const item of value) dateBounds(item, budget, output);
        return output;
    }
    for (const [key, item] of Object.entries(value)) {
        if (/date|time|timestamp/i.test(key) && !/birth|created|updated|modified|upload|export/i.test(key)
            && (typeof item === 'string' || typeof item === 'number')) {
            const parsed = typeof item === 'number'
                ? new Date(item > 1e12 ? item : item * 1000)
                : new Date(item);
            if (Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() >= 2000 && parsed.getUTCFullYear() <= 2100) {
                output.push(parsed.toISOString().slice(0, 10));
            }
        }
        if (item && typeof item === 'object') dateBounds(item, budget, output);
    }
    return output;
}

function getExistingActivityId(activity) {
    const explicit = activity?.sourceRefs?.garminActivityId ?? activity?.garminData?.activityId;
    if (explicit !== null && explicit !== undefined) {
        const id = String(explicit).replace(/^garmin-/, '');
        return /^\d+$/.test(id) ? id : null;
    }
    if (activity?.source === 'garmin' || (Array.isArray(activity?.sources) && activity.sources.includes('garmin'))) {
        const id = String(activity?.id ?? '').replace(/^garmin-/, '');
        return /^\d+$/.test(id) ? id : null;
    }
    return null;
}

function mergeArchiveActivity(existing, incoming) {
    if (!existing.garminData) existing.garminData = incoming.garminData;
    if (!existing.sourceRefs?.garminActivityId) {
        existing.sourceRefs = { ...(existing.sourceRefs || {}), garminActivityId: incoming.sourceRefs.garminActivityId };
    }
    for (const key of [
        'startTime', 'date', 'duration', 'distance', 'hr', 'maxHr',
        'garminTrainingLoad', 'garminAerobicTrainingEffect', 'garminAnaerobicTrainingEffect',
        'garminCalories', 'garminAverageSpeed', 'garminMaxSpeed', 'garminElevationGain',
        'garminElevationLoss', 'garminAveragePower', 'garminMaxPower', 'garminNormalizedPower'
    ]) {
        if ((existing[key] === null || existing[key] === undefined || existing[key] === '') && incoming[key] !== null) {
            existing[key] = incoming[key];
        }
    }
    if (!existing.garminSportLabel && incoming.garminSportLabel) existing.garminSportLabel = incoming.garminSportLabel;
    existing.garminExportImported = true;
}

async function updateImportManifest(importId, userId, manifest, dataImport) {
    const nextManifest = { ...(manifest || {}), dataImport };
    const { error } = await supabase.from('garmin_export_imports')
        .update({ manifest: nextManifest })
        .eq('id', importId)
        .eq('user_id', userId);
    if (error) throw error;
    return nextManifest;
}

async function insertInBatches(table, rows, size, conflict = null) {
    for (let offset = 0; offset < rows.length; offset += size) {
        const batch = rows.slice(offset, offset + size);
        let request = supabase.from(table).insert(batch);
        if (conflict) request = supabase.from(table).upsert(batch, { onConflict: conflict, ignoreDuplicates: true });
        const { error } = await request;
        if (error) throw error;
    }
}

async function processZip(zip, prefix, context, depth = 0) {
    if (depth > 5) {
        context.errors.push({ file: prefix || '[archive]', reason: 'Verschachtelungstiefe über dem unterstützten Limit.' });
        return;
    }
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    for (const entry of entries) {
        const sourcePath = prefix ? prefix + '/' + entry.name : entry.name;
        const extension = sourcePath.includes('.') ? sourcePath.split('.').pop().toLowerCase() : '';
        if (extension === 'zip') {
            context.nestedArchives++;
            try {
                const bytes = await entry.async('uint8array');
                const nested = await JSZip.loadAsync(bytes, { checkCRC32: false });
                await processZip(nested, sourcePath, context, depth + 1);
            } catch (error) {
                context.errors.push({ file: sourcePath, reason: String(error?.message || error).slice(0, 180) });
            }
            continue;
        }

        context.totalFiles++;
        const category = classifyGarminExportFile(sourcePath);
        context.categories[category] = (context.categories[category] || 0) + 1;
        const row = {
            user_id: context.userId,
            import_id: context.importId,
            source_path: sourcePath,
            category,
            file_extension: extension || null,
            file_size_bytes: Number(entry._data?.uncompressedSize || 0),
            record_count: null,
            date_from: null,
            date_to: null,
            is_json: extension === 'json',
            payload: null,
            storage_path: null,
            parse_error: null,
            retained_in_original_archive: true
        };

        if (extension === 'json') {
            context.jsonFiles++;
            try {
                const raw = await entry.async('string');
                const parsed = JSON.parse(raw);
                row.record_count = topLevelRecordCount(parsed);
                const dates = dateBounds(parsed);
                dates.sort();
                row.date_from = dates[0] || null;
                row.date_to = dates[dates.length - 1] || null;
                row.retained_in_original_archive = false;

                const summaries = collectGarminSummaryActivities(parsed);
                if (summaries.length) context.activities.push(...summaries);
                const vo2Records = extractGarminVo2MaxRecords(parsed, sourcePath);
                if (vo2Records.length) context.performanceRecords.push(...vo2Records);

                if (!context.existingPaths.has(sourcePath)) {
                    if (new TextEncoder().encode(raw).byteLength <= LARGE_JSON_BYTES) {
                        row.payload = parsed;
                    } else {
                        const objectPath = context.userId + '/' + context.importId + '/data/' + safeStoragePath(sourcePath);
                        await uploadJsonObject(objectPath, new Blob([raw], { type: 'application/json' }));
                        row.storage_path = objectPath;
                    }
                    context.fileRows.push(row);
                }
            } catch (error) {
                row.parse_error = String(error?.message || error).slice(0, 220);
                row.retained_in_original_archive = true;
                context.errors.push({ file: sourcePath, reason: row.parse_error });
                if (!context.existingPaths.has(sourcePath)) context.fileRows.push(row);
            }
        } else if (!context.existingPaths.has(sourcePath)) {
            context.fileRows.push(row);
        }

        if (context.fileRows.length >= FILE_BATCH_SIZE) {
            await insertInBatches('garmin_export_data_files', context.fileRows, FILE_BATCH_SIZE);
            context.insertedFiles += context.fileRows.length;
            context.fileRows = [];
        }
        if (context.totalFiles % 10 === 0) {
            const ratio = context.totalExpectedFiles > 0
                ? Math.min(1, context.totalFiles / context.totalExpectedFiles) : 0;
            setImportStatus(
                'Garmin-Dateien werden übernommen … ' + context.totalFiles + ' Dateien geprüft',
                12 + Math.round(ratio * 76)
            );
        }
    }
}

function importActivitiesIntoApp(records) {
    const byId = new Map();
    for (const activity of Array.isArray(state.rawActivities) ? state.rawActivities : []) {
        const id = getExistingActivityId(activity);
        if (id && !byId.has(id)) byId.set(id, activity);
    }
    let added = 0;
    let enriched = 0;
    for (const raw of records) {
        const mapped = mapGarminExportActivity(raw, inferSport, inferCategory);
        if (!mapped) continue;
        const existing = byId.get(mapped.sourceRefs.garminActivityId);
        if (existing) {
                const hadArchiveData = existing.garminExportImported === true;
            mergeArchiveActivity(existing, mapped);
            if (!hadArchiveData) enriched++;
            continue;
        }
        state.rawActivities.push(mapped);
        byId.set(mapped.sourceRefs.garminActivityId, mapped);
        added++;
    }
    return { added, enriched };
}

export async function importGarminExportArchive(importId) {
    if (activeImportId) {
        setImportStatus('Ein Garmin-Import läuft bereits. Bitte warte, bis dieser abgeschlossen ist.');
        return;
    }
    activeImportId = importId;
    let userId = null;
    let manifest = {};
    let item = null;
    const context = {
        userId: null,
        importId,
        existingPaths: new Set(),
        fileRows: [],
        insertedFiles: 0,
        totalFiles: 0,
        jsonFiles: 0,
        nestedArchives: 0,
        categories: {},
        activities: [],
        performanceRecords: [],
        errors: []
    };

    try {
        if (typeof JSZip === 'undefined') throw new Error('ZIP-Parser ist nicht verfügbar. Bitte KAJO neu laden.');
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        userId = auth?.user?.id;
        if (!userId) throw new Error('Bitte melde dich zuerst bei KAJO an.');
        context.userId = userId;

        const { data, error } = await supabase.from('garmin_export_imports')
            .select('id, user_id, status, manifest')
            .eq('id', importId)
            .eq('user_id', userId)
            .single();
        if (error) throw error;
        item = data;
        manifest = item.manifest || {};
        if (item.status !== 'indexed') throw new Error('Das Originalarchiv ist noch nicht vollständig gesichert und indexiert.');
        if (manifest.analysisPreview?.analysisVersion !== 8) {
            throw new Error('Bitte aktualisiere zuerst die Garmin-Feldanalyse auf Version 8.');
        }

        const { data: existingRows, error: existingError } = await supabase.from('garmin_export_data_files')
            .select('source_path')
            .eq('user_id', userId)
            .eq('import_id', importId)
            .limit(5000);
        if (existingError) throw existingError;
        context.existingPaths = new Set((existingRows || []).map(row => String(row.source_path)));

        context.totalExpectedFiles = Number(manifest.entryCount || 0);
        const parts = manifest.archiveStorage?.parts;
        if (!Array.isArray(parts) || !parts.length) throw new Error('Die gespeicherten Archiv-Teilstücke fehlen.');
        const blobs = [];
        for (let index = 0; index < parts.length; index++) {
            setImportStatus('Originalarchiv wird aus deinem KAJO-Konto geladen … Teil ' + (index + 1) + ' von ' + parts.length,
                Math.round((index / parts.length) * 10));
            const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(parts[index].path);
            if (downloadError) throw downloadError;
            blobs.push(blob);
        }

        setImportStatus('Archiv wird auf dem Laptop geöffnet und vollständig ausgelesen …', 12);
        const archiveBlob = new Blob(blobs, { type: 'application/zip' });
        const zip = await JSZip.loadAsync(archiveBlob, { checkCRC32: false });
        await updateImportManifest(importId, userId, manifest, {
            status: 'in_progress',
            startedAt: new Date().toISOString(),
            importedFileCountBefore: context.existingPaths.size
        });

        await processZip(zip, '', context);
        if (context.fileRows.length) {
            await insertInBatches('garmin_export_data_files', context.fileRows, FILE_BATCH_SIZE);
            context.insertedFiles += context.fileRows.length;
            context.fileRows = [];
        }

        const uniqueActivities = new Map();
        for (const record of context.activities) {
            const id = String(record.activityId ?? record.id ?? '');
            if (/^\d+$/.test(id) && !uniqueActivities.has(id)) uniqueActivities.set(id, record);
        }
        const activityImport = importActivitiesIntoApp([...uniqueActivities.values()]);

        const uniquePerformance = new Map();
        for (const record of context.performanceRecords) {
            const key = [record.date, record.sport || '', record.subSport || '', record.value].join('|');
            uniquePerformance.set(key, record);
        }
        const performanceRows = [...uniquePerformance.entries()].map(([recordKey, record]) => ({
            user_id: userId,
            import_id: importId,
            record_key: recordKey,
            record_date: record.date,
            value: record.value,
            unit: record.unit || 'ml/kg/min',
            sport_label: record.sport,
            sub_sport_label: record.subSport,
            source: record.source,
            source_update_timestamp: record.updateTimestamp,
            source_file: 'MetricsMaxMetData'
        }));
        const { data: existingPerformanceRows, error: existingPerformanceError } = await supabase
            .from('garmin_export_performance_records')
            .select('record_key')
            .eq('user_id', userId)
            .eq('import_id', importId)
            .limit(2000);
        if (existingPerformanceError) throw existingPerformanceError;
        const existingPerformanceKeys = new Set((existingPerformanceRows || []).map(row => String(row.record_key)));
        const missingPerformanceRows = performanceRows.filter(row => !existingPerformanceKeys.has(row.record_key));
        if (missingPerformanceRows.length) {
            await insertInBatches('garmin_export_performance_records', missingPerformanceRows, PERFORMANCE_BATCH_SIZE);
        }

        const performanceVerified = await supabase.from('garmin_export_performance_records')
            .select('record_key')
            .eq('user_id', userId)
            .eq('import_id', importId)
            .limit(2000);
        if (performanceVerified.error) throw performanceVerified.error;
        if ((performanceVerified.data || []).length !== uniquePerformance.size) {
            throw new Error('Die VO₂max-Datensätze konnten nach dem Speichern nicht vollständig bestätigt werden.');
        }

        if (activityImport.added || activityImport.enriched) {
            if (!saveDataToLocalStorage()) throw new Error('Die importierten Aktivitäten konnten nicht lokal gesichert werden.');
            refreshAll();
            const cloudSaved = await new Promise(resolve => {
                window.dispatchEvent(new CustomEvent('endurance:data-save-immediate', { detail: { resolve } }));
            });
            if (cloudSaved !== true) throw new Error('Die Aktivitäten wurden lokal gespeichert, aber die Cloud-Synchronisierung wurde nicht bestätigt. Bitte den Import nach Prüfung erneut starten.');
        }

        const fileCounts = { ...context.categories };
        const completedAt = new Date().toISOString();
        const dataImport = {
            status: context.errors.length ? 'complete_with_warnings' : 'complete',
            completedAt,
            files: context.totalFiles,
            jsonFiles: context.jsonFiles,
            nestedArchives: context.nestedArchives,
            storedFileRows: context.existingPaths.size + context.insertedFiles,
            fileCounts,
            activities: activityImport,
            vo2maxRecords: uniquePerformance.size,
            warnings: context.errors.slice(0, 30),
            warningCount: context.errors.length
        };
        await updateImportManifest(importId, userId, manifest, dataImport);
        setImportStatus(
            'Import abgeschlossen: ' + dataImport.jsonFiles + ' JSON-Dateien verarbeitet · ' +
            dataImport.storedFileRows + ' Datei-Einträge gesichert · ' + activityImport.added +
            ' neue Aktivitäten · ' + performanceRows.length + ' VO₂max-Datensätze. ' +
            (context.errors.length ? context.errors.length + ' Dateien mit Hinweisen.' : 'Keine Importfehler.'),
            100,
            context.errors.length ? 'info' : 'success'
        );
        const { renderGarminExportArchiveHistory } = await import('./garmin-export-archive.js?v=4');
        await renderGarminExportArchiveHistory();
    } catch (error) {
        console.error('[KAJO Garmin-Komplettimport]', error);
        const message = String(error?.message || error);
        if (userId && item) {
            try {
                await updateImportManifest(importId, userId, manifest, {
                    status: 'partial',
                    failedAt: new Date().toISOString(),
                    error: message.slice(0, 300),
                    storedFileRows: context.existingPaths.size + context.insertedFiles
                });
            } catch (_) {}
        }
        setImportStatus('Import nicht vollständig abgeschlossen: ' + message + ' Bereits bestätigte Daten bleiben erhalten. Du kannst den Import fortsetzen.', null, 'error');
    } finally {
        activeImportId = null;
    }
}
