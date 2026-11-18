import { supabase } from './supabase-client.js';
import { SUPABASE_ANON_KEY } from './supabase-config.js';

const BUCKET = 'garmin-exports';
const PROJECT_ID = 'zgvargkfzgekokuisarv';
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
// Supabase Free projects have a global per-object limit of 50 MB.
// Keep each stored part below that ceiling; the complete archive may be larger.
const ARCHIVE_PART_BYTES = 40 * 1024 * 1024;

function safeFileName(name) {
    return String(name || 'garmin-export.zip').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
}

function setStatus(message, percent = null, kind = 'info') {
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

async function buildArchiveManifest(file) {
    if (typeof JSZip === 'undefined') throw new Error('ZIP-Parser ist nicht verfügbar.');
    const zip = await JSZip.loadAsync(file, { checkCRC32: false });
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    const byExtension = {};
    let totalUncompressedBytes = 0;
    let nestedArchives = 0;
    const files = entries.map(entry => {
        const path = entry.name;
        const ext = path.includes('.') ? path.split('.').pop().toLowerCase() : '[ohne Endung]';
        byExtension[ext] = (byExtension[ext] || 0) + 1;
        if (ext === 'zip') nestedArchives++;
        const size = Number(entry._data?.uncompressedSize || 0);
        totalUncompressedBytes += size;
        return { path, extension: ext, uncompressedBytes: size, nestedArchive: ext === 'zip' };
    });
    return {
        archiveFileName: file.name,
        archiveBytes: file.size,
        indexedAt: new Date().toISOString(),
        entryCount: files.length,
        totalUncompressedBytes,
        nestedArchives,
        byExtension,
        files
    };
}

function uploadArchivePart(blob, objectName, token, onProgress) {
    return new Promise((resolve, reject) => {
        const upload = new tus.Upload(blob, {
            endpoint: 'https://' + PROJECT_ID + '.storage.supabase.co/storage/v1/upload/resumable',
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: { authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: {
                bucketName: BUCKET,
                objectName,
                contentType: 'application/octet-stream',
                cacheControl: '3600'
            },
            chunkSize: 6 * 1024 * 1024,
            onError: reject,
            onProgress,
            onSuccess: resolve
        });
        upload.findPreviousUploads().then(previous => {
            if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
            upload.start();
        }).catch(reject);
    });
}

export async function uploadGarminExportArchive(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    event.target.value = '';

    if (!supabase) {
        setStatus('Supabase ist nicht konfiguriert. Der Export wurde nicht hochgeladen.', null, 'error');
        return;
    }
    if (!/\.zip$/i.test(file.name)) {
        setStatus('Bitte wähle den vollständigen Garmin-Export als ZIP-Datei aus.', null, 'error');
        return;
    }
    if (file.size > MAX_ARCHIVE_BYTES) {
        setStatus('Die ZIP-Datei überschreitet das aktuell unterstützte Limit von 512 MB.', null, 'error');
        return;
    }
    if (typeof tus === 'undefined' || typeof tus.Upload !== 'function') {
        setStatus('Der sichere Upload-Dienst konnte nicht geladen werden. Bitte lade KAJO neu.', null, 'error');
        return;
    }

    let importId = null;
    let storagePath = null;
    try {
        setStatus('Konto und Uploadberechtigung werden geprüft …');
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const userId = auth?.user?.id;
        if (!userId) throw new Error('Bitte melde dich zuerst bei KAJO an.');

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        storagePath = userId + '/' + stamp + '-' + safeFileName(file.name);
        const { data: row, error: rowError } = await supabase.from('garmin_export_imports').insert({
            user_id: userId,
            original_file_name: file.name,
            storage_path: storagePath,
            file_size_bytes: file.size,
            content_type: file.type || 'application/zip',
            status: 'uploading'
        }).select('id').single();
        if (rowError) throw rowError;
        importId = row.id;

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const token = sessionData?.session?.access_token;
        if (!token) throw new Error('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');

        const partCount = Math.ceil(file.size / ARCHIVE_PART_BYTES);
        const parts = [];
        setStatus('Originalarchiv wird in ' + partCount + ' sichere Teilstücke zerlegt und gespeichert …', 0);
        for (let index = 0; index < partCount; index++) {
            const start = index * ARCHIVE_PART_BYTES;
            const end = Math.min(file.size, start + ARCHIVE_PART_BYTES);
            const partNumber = String(index + 1).padStart(4, '0');
            const objectName = storagePath + '.part-' + partNumber;
            const blob = file.slice(start, end, 'application/octet-stream');
            await uploadArchivePart(blob, objectName, token, (uploaded) => {
                const overall = ((start + uploaded) / file.size) * 100;
                setStatus('Originalarchiv wird gespeichert … Teil ' + (index + 1) + '/' + partCount + ' · ' + overall.toFixed(1) + '%', overall);
            });
            parts.push({ path: objectName, bytes: blob.size, index });
        }

        setStatus('Alle Archivteile sind gespeichert. Dateiverzeichnis wird erstellt …', 100);
        let manifest;
        try {
            manifest = await buildArchiveManifest(file);
        } catch (manifestError) {
            manifest = {
                archiveFileName: file.name,
                archiveBytes: file.size,
                indexedAt: new Date().toISOString(),
                indexingError: String(manifestError?.message || manifestError)
            };
        }
        manifest.archiveStorage = {
            strategy: 'ordered-parts',
            partSizeBytes: ARCHIVE_PART_BYTES,
            partCount: parts.length,
            parts
        };
        const status = manifest.files ? 'indexed' : 'uploaded';
        const { error: updateError } = await supabase.from('garmin_export_imports').update({
            status,
            manifest,
            indexed_at: manifest.files ? new Date().toISOString() : null
        }).eq('id', importId).eq('user_id', userId);
        if (updateError) throw updateError;

        const countText = manifest.files
            ? manifest.entryCount + ' Dateien gefunden, darunter ' + manifest.nestedArchives + ' weitere ZIP-Archive.'
            : 'Das Originalarchiv ist gesichert; das Dateiverzeichnis konnte nicht automatisch erstellt werden.';
        setStatus('Erfolgreich: ' + countText + ' Das Originalarchiv ist vollständig und in der richtigen Reihenfolge in deinem Benutzerkonto gespeichert.', null, 'success');
        await renderGarminExportArchiveHistory();
    } catch (error) {
        console.error('[KAJO Garmin-Archivimport]', error);
        if (importId) {
            try {
                await supabase.from('garmin_export_imports').update({ status: 'failed' }).eq('id', importId);
            } catch (_) {}
        }
        const rawMessage = String(error?.message || 'Unbekannter Fehler');
        const message = /413|maximum size exceeded/i.test(rawMessage)
            ? 'Supabase hat auch ein Archivteil abgelehnt. Bitte prüfe das globale Storage-Limit deines Projekts. Details: ' + rawMessage
            : rawMessage;
        setStatus('Import fehlgeschlagen: ' + message, null, 'error');
    }
}

export async function renderGarminExportArchiveHistory() {
    const target = document.getElementById('garmin-archive-history');
    if (!target) return;
    target.textContent = 'Archivübersicht wird geladen …';
    if (!supabase) {
        target.textContent = 'Die Datenbankverbindung ist nicht verfügbar.';
        return;
    }
    try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth?.user?.id) {
            target.textContent = 'Bitte melde dich an, um deine gesicherten Garmin-Archive zu sehen.';
            return;
        }
        const { data, error } = await supabase.from('garmin_export_imports')
            .select('id, original_file_name, file_size_bytes, status, manifest, created_at')
            .eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        if (!data?.length) {
            target.textContent = 'Noch kein vollständiger Garmin-Export gespeichert.';
            return;
        }
        target.innerHTML = data.map(item => {
            const size = (Number(item.file_size_bytes || 0) / (1024 * 1024)).toFixed(1);
            const files = Number(item.manifest?.entryCount || 0);
            const preview = item.manifest?.analysisPreview;
            const inventory = preview?.fieldInventory ? Object.values(preview.fieldInventory) : [];
            const fieldRows = inventory.slice().sort((a, b) => Number(b.occurrences || 0) - Number(a.occurrences || 0)).slice(0, 30);
            const fieldList = fieldRows.length
                ? '<ul class="mt-2 space-y-1">' + fieldRows.map(field => '<li class="break-all text-[10px] text-slate-300"><span class="text-cyan-300">' + escapeHtml(field.category) + '</span> · ' + escapeHtml(field.path) + ' <span class="text-slate-500">(' + escapeHtml(Object.keys(field.types || {}).join(', ')) + ' · ' + Number(field.occurrences || 0) + ' Treffer)</span></li>').join('') + '</ul>'
                : '';
            const previewText = preview ? '<p class="mt-2 text-[10px] text-cyan-200">Analyse: ' + Number(preview.jsonFiles || 0) + ' JSON-Dateien · ' + Number(preview.nestedArchives || 0) + ' Unterarchive · ' + inventory.length + ' Feldpfade erkannt' + (preview.dateFrom && preview.dateTo ? ' · Messdaten: ' + preview.dateFrom + ' bis ' + preview.dateTo : '') + '</p>' + (fieldRows.length ? '<details class="mt-2"><summary class="cursor-pointer text-[10px] font-semibold text-cyan-200">Erkannte Datenfelder anzeigen (' + inventory.length + ')</summary>' + fieldList + '</details>' : '') : '';
            const analyzeButton = item.status === 'indexed' && !preview?.fieldInventory ? "<button type=\"button\" onclick=\"analyzeGarminExportArchive('" + String(item.id).replace(/[^a-f0-9-]/gi, '') + "')\" class=\"mt-2 rounded-lg bg-cyan-700/70 px-3 py-1.5 text-[10px] font-semibold text-white\">Datenfelder erkennen</button>" : '';
            const status = item.status === 'indexed' ? 'Archiv gesichert · ' + files + ' Dateien katalogisiert'
                : item.status === 'uploaded' ? 'Archiv gesichert · Verzeichnis ausstehend'
                : item.status === 'failed' ? 'Upload fehlgeschlagen' : 'Upload läuft';
            const date = new Date(item.created_at).toLocaleString('de-DE');
            const safeName = String(item.original_file_name || 'Garmin-Export').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
            return '<div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div class="flex items-center justify-between gap-3"><span class="truncate text-xs font-semibold text-slate-200">' + safeName + '</span><span class="shrink-0 text-[10px] text-slate-400">' + size + ' MB</span></div><p class="mt-1 text-[10px] text-slate-400">' + status + ' · ' + date + '</p>' + previewText + analyzeButton + '</div>';
        }).join('');
    } catch (error) {
        console.error('Garmin-Archivübersicht konnte nicht geladen werden:', error);
        target.textContent = 'Archivübersicht konnte nicht geladen werden: ' + String(error?.message || error);
    }
}


// Read-only first pass: reconstruct the split archive, inspect JSON structure,
// and save only a compact metadata preview. No raw health values are imported.
function classifyGarminPath(path) {
    const value = String(path || '').toLowerCase();
    // Match concrete export filenames before broad topic words. In particular,
    // "fitnessAgeData" is a wellness/performance file, not an activity file.
    if (/summarizedactivities|activitydetails|activity/.test(value)) return 'activities';
    if (/fitnessagedata|metricsmaxmet|vo2|max.?met|benchmark/.test(value)) return 'performance';
    if (/sleep|hrv|heart.?rate|healthstatus|stress|spo2|body.?battery|wellness/.test(value)) return 'recovery';
    if (/weight|hydration|nutrition|calorie/.test(value)) return 'body-nutrition';
    if (/trainingplan|_workout.json|workout/.test(value)) return 'training-plans';
    return 'other';
}

function collectGarminFields(value, category, filePath, inventory, budget, path = '', depth = 0) {
    if (budget.count >= 25000 || depth > 9) return;
    budget.count++;
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (path) {
        const key = category + '|' + path;
        if (inventory[key] || Object.keys(inventory).length < 500) {
            const field = inventory[key] || (inventory[key] = { category, path, types: {}, occurrences: 0, files: [] });
            field.types[type] = (field.types[type] || 0) + 1;
            field.occurrences++;
            if (field.files.length < 5 && !field.files.includes(filePath)) field.files.push(filePath);
        }
    }
    if (Array.isArray(value)) {
        value.slice(0, 10).forEach(item => collectGarminFields(item, category, filePath, inventory, budget, path ? path + '[]' : '[]', depth + 1));
        return;
    }
    if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            collectGarminFields(item, category, filePath, inventory, budget, path ? path + '.' + String(key).slice(0, 100) : String(key).slice(0, 100), depth + 1);
            if (budget.count >= 25000) break;
        }
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function collectDateValues(value, output, budget, filePath = '') {
    if (!value || typeof value !== 'object' || budget.count > 25000) return;
    const sourcePath = String(filePath || '').toLowerCase();
    // Profile metadata and workout definitions are not historical measurement
    // records and must not widen the reported training/health data period.
    if (/customer_data|di-connect-user|trainingplan|_workout.json/.test(sourcePath)) return;
    budget.count++;
    if (Array.isArray(value)) {
        for (const item of value) collectDateValues(item, output, budget, filePath);
        return;
    }
    for (const [key, item] of Object.entries(value)) {
        const fieldName = String(key).toLowerCase();
        const isDateField = /date|time|timestamp/i.test(key);
        const isMetadataDate = /birth|created|updated|modified|deleted|expiry|expiration|upload|export/i.test(fieldName);
        if (isDateField && !isMetadataDate && (typeof item === 'string' || typeof item === 'number')) {
            const parsed = typeof item === 'number'
                ? new Date(item > 1e12 ? item : item * 1000)
                : new Date(item);
            const timestamp = parsed.getTime();
            // Future plan entries and malformed clocks are not historical
            // measurements. A one-day tolerance avoids timezone-edge effects.
            if (Number.isFinite(timestamp) && parsed.getUTCFullYear() >= 2000 && parsed.getUTCFullYear() <= 2100
                && timestamp <= Date.now() + 24 * 60 * 60 * 1000) {
                output.push(parsed.toISOString().slice(0, 10));
            }
        }
        if (item && typeof item === 'object') collectDateValues(item, output, budget, filePath);
    }
}

async function inspectGarminZip(zip, prefix, summary, depth = 0) {
    if (depth > 4) return;
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    for (const entry of entries) {
        const path = prefix ? prefix + '/' + entry.name : entry.name;
        const extension = path.split('.').pop().toLowerCase();
        if (extension === 'zip') {
            summary.nestedArchives++;
            try {
                const bytes = await entry.async('uint8array');
                const nested = await JSZip.loadAsync(bytes, { checkCRC32: false });
                await inspectGarminZip(nested, path, summary, depth + 1);
            } catch (error) {
                summary.errors.push({ file: path, reason: String(error?.message || error).slice(0, 180) });
            }
        } else if (extension === 'json') {
            summary.jsonFiles++;
            const category = classifyGarminPath(path);
            summary.categories[category] = (summary.categories[category] || 0) + 1;
            try {
                const raw = await entry.async('string');
                const parsed = JSON.parse(raw);
                const recordCount = Array.isArray(parsed) ? parsed.length
                    : parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 1;
                summary.topLevelRecords[category] = (summary.topLevelRecords[category] || 0) + recordCount;
                collectGarminFields(parsed, category, path, summary.fieldInventory, { count: 0 });
                const dates = [];
                collectDateValues(parsed, dates, { count: 0 }, path);
                for (const date of dates) summary.dates.push(date);
            } catch (error) {
                summary.errors.push({ file: path, reason: String(error?.message || error).slice(0, 180) });
            }
        } else {
            const ext = extension || '[ohne Endung]';
            summary.otherFiles[ext] = (summary.otherFiles[ext] || 0) + 1;
        }
    }
}

export async function analyzeGarminExportArchive(importId) {
    const status = document.getElementById('garmin-archive-status');
    const progress = document.getElementById('garmin-archive-progress');
    const fill = document.getElementById('garmin-archive-progress-fill');
    const setAnalysisStatus = message => {
        if (status) { status.textContent = message; status.className = 'text-xs text-slate-300'; }
        if (progress) progress.classList.remove('hidden');
        if (fill) fill.style.width = '0%';
    };
    try {
        if (typeof JSZip === 'undefined') throw new Error('ZIP-Parser ist nicht verfügbar. Bitte KAJO neu laden.');
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const userId = auth?.user?.id;
        if (!userId) throw new Error('Bitte melde dich erneut bei KAJO an.');
        const { data: item, error } = await supabase.from('garmin_export_imports')
            .select('id, user_id, storage_path, manifest, status')
            .eq('id', importId).eq('user_id', userId).single();
        if (error) throw error;
        if (item.status !== 'indexed') throw new Error('Das Archiv ist noch nicht vollständig indexiert.');
        const parts = item.manifest?.archiveStorage?.parts;
        if (!Array.isArray(parts) || !parts.length) throw new Error('Die Archiv-Teilstücke fehlen im Manifest.');
        const blobs = [];
        for (let i = 0; i < parts.length; i++) {
            setAnalysisStatus('Archiv wird geladen … Teil ' + (i + 1) + ' von ' + parts.length);
            const { data, error: downloadError } = await supabase.storage.from(BUCKET).download(parts[i].path);
            if (downloadError) throw downloadError;
            blobs.push(data);
            if (fill) fill.style.width = Math.round(((i + 1) / parts.length) * 35) + '%';
        }
        setAnalysisStatus('Archiv wird zusammengesetzt und geöffnet …');
        const archiveBlob = new Blob(blobs, { type: 'application/zip' });
        const zip = await JSZip.loadAsync(archiveBlob, { checkCRC32: false });
        const summary = {
            analyzedAt: new Date().toISOString(),
            jsonFiles: 0,
            nestedArchives: 0,
            categories: {},
            topLevelRecords: {},
            fieldInventory: {},
            otherFiles: {},
            dates: [],
            errors: []
        };
        setAnalysisStatus('JSON-Dateien, Datenfelder und Unterarchive werden geprüft …');
        await inspectGarminZip(zip, '', summary);
        summary.dates.sort();
        summary.dateFrom = summary.dates[0] || null;
        summary.dateTo = summary.dates[summary.dates.length - 1] || null;
        delete summary.dates;
        summary.errorCount = summary.errors.length;
        summary.errors = summary.errors.slice(0, 20);
        const nextManifest = { ...item.manifest, analysisPreview: summary };
        const { error: saveError } = await supabase.from('garmin_export_imports')
            .update({ manifest: nextManifest })
            .eq('id', importId).eq('user_id', userId);
        if (saveError) throw saveError;
        if (fill) fill.style.width = '100%';
        setAnalysisStatus('Feldanalyse abgeschlossen. Erkannte Datenfelder und Zeiträume wurden katalogisiert; es wurden keine Messwerte importiert oder als Rohwerte gespeichert.');
        if (status) status.className = 'text-xs text-emerald-300';
        await renderGarminExportArchiveHistory();
    } catch (error) {
        console.error('[KAJO Garmin-Archivanalyse]', error);
        setAnalysisStatus('Archiv-Analyse fehlgeschlagen: ' + String(error?.message || error));
        if (status) status.className = 'text-xs text-rose-300';
    }
}
