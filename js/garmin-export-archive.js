import { extractGarminVo2MaxRecords, summarizeGarminVo2MaxRecords } from './garmin-performance-archive.js';
import { supabase } from './supabase-client.js';
import { SUPABASE_ANON_KEY } from './supabase-config.js';

const BUCKET = 'garmin-exports';
const PROJECT_ID = 'zgvargkfzgekokuisarv';
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

let tusLoadPromise = null;
function ensureTusLoaded() {
    if (globalThis.tus?.Upload) return Promise.resolve(globalThis.tus);
    if (!tusLoadPromise) {
        tusLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js';
            script.async = true;
            script.onload = () => globalThis.tus?.Upload
                ? resolve(globalThis.tus)
                : reject(new Error('Der resumierbare Upload-Dienst ist nicht verfügbar.'));
            script.onerror = () => reject(new Error('Der resumierbare Upload-Dienst konnte nicht geladen werden.'));
            document.head.appendChild(script);
        }).catch(error => {
            tusLoadPromise = null;
            throw error;
        });
    }
    return tusLoadPromise;
}

// Supabase Free projects have a global per-object limit of 50 MB.
// Keep each stored part below that ceiling; the complete archive may be larger.
const ARCHIVE_PART_BYTES = 40 * 1024 * 1024;
const MAX_FIELD_PATHS_PER_CATEGORY = 500;

const ACTIVITY_FIELD_GROUPS = {
    id: { label: 'Garmin-Aktivitäts-ID', keys: ['activityId', 'id'] },
    startTime: { label: 'Startzeit', keys: ['startTimeGmt', 'startTimeGMT', 'startTimeLocal', 'beginTimestamp'] },
    duration: { label: 'Dauer', keys: ['duration', 'elapsedDuration', 'movingDuration'] },
    distance: { label: 'Distanz', keys: ['distance'] },
    averageHeartRate: { label: 'Durchschnittliche Herzfrequenz', keys: ['avgHr', 'averageHR'] },
    maxHeartRate: { label: 'Maximale Herzfrequenz', keys: ['maxHr', 'maxHR'] },
    calories: { label: 'Kalorien', keys: ['calories'] },
    aerobicTrainingEffect: { label: 'Aerober Training Effect', keys: ['aerobicTrainingEffect'] },
    anaerobicTrainingEffect: { label: 'Anaerober Training Effect', keys: ['anaerobicTrainingEffect'] },
    averageSpeed: { label: 'Durchschnittsgeschwindigkeit', keys: ['avgSpeed'] },
    maxSpeed: { label: 'Maximalgeschwindigkeit', keys: ['maxSpeed'] },
    elevationGain: { label: 'Höhengewinn', keys: ['elevationGain'] },
    elevationLoss: { label: 'Höhenverlust', keys: ['elevationLoss'] },
    splits: { label: 'Runden / Splits', keys: ['splits'] },
    splitSummaries: { label: 'Runden-Zusammenfassungen', keys: ['splitSummaries'] },
    sportType: { label: 'Sportart-Kennung', keys: ['activityType'] },
    activityName: { label: 'Aktivitätsname (nur Feldprüfung)', keys: ['activityName'] },
    averagePower: { label: 'Durchschnittsleistung', keys: ['avgPower'] },
    maxPower: { label: 'Maximalleistung', keys: ['maxPower'] },
    normalizedPower: { label: 'Normalisierte Leistung', keys: ['normPower'] },
    vo2max: { label: 'VO₂max-Feld', keys: ['VO2MaxValue'] }
};

function createActivityFieldAudit() {
    return {
        records: 0,
        fields: Object.fromEntries(Object.entries(ACTIVITY_FIELD_GROUPS).map(([key, group]) => [
            key, { label: group.label, present: 0, sourceKeys: {}, types: {} }
        ]))
    };
}

function recordActivityFieldAudit(activity, audit) {
    if (!audit || !activity || typeof activity !== 'object') return;
    audit.records++;
    for (const [groupKey, group] of Object.entries(ACTIVITY_FIELD_GROUPS)) {
        const result = audit.fields[groupKey];
        let found = false;
        for (const sourceKey of group.keys) {
            if (!Object.prototype.hasOwnProperty.call(activity, sourceKey) || activity[sourceKey] == null) continue;
            found = true;
            result.sourceKeys[sourceKey] = (result.sourceKeys[sourceKey] || 0) + 1;
            const value = activity[sourceKey];
            const type = Array.isArray(value) ? 'array' : typeof value;
            result.types[type] = (result.types[type] || 0) + 1;
        }
        if (found) result.present++;
    }
}

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
    let importId = null;
    let storagePath = null;
    try {
        setStatus('Upload-Dienst wird vorbereitet …');
        await ensureTusLoaded();
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
                ? '<ul class="mt-2 space-y-1">' + fieldRows.map(field => '<li class="break-all text-[10px] text-slate-300"><span class="text-cyan-300">' + escapeHtml(garminCategoryLabel(field.category)) + '</span> · ' + escapeHtml(field.path) + ' <span class="text-slate-500">(' + escapeHtml(Object.keys(field.types || {}).join(', ')) + ' · ' + Number(field.occurrences || 0) + ' Treffer)</span></li>').join('') + '</ul>'
                : '';
            const comparison = preview?.activityComparison;
            const comparisonText = comparison
                ? '<p class="mt-2 text-[10px] text-cyan-200">Aktivitätsabgleich (nur Vorschau): ' + Number(comparison.archiveRecords || 0) + ' Archivdatensätze · ' + Number(comparison.uniqueArchiveIds || 0) + ' eindeutige IDs · ' + Number(comparison.alreadyExisting || 0) + ' bereits vorhanden · ' + Number(comparison.newActivities || 0) + ' neu · ' + Number(comparison.duplicateArchiveIds || 0) + ' doppelte Archiv-IDs · ' + Number(comparison.existingWithoutDetails || 0) + ' vorhandene Aktivitäten ohne Detaildatensatz</p>'
                : '';
            const activityAudit = preview?.activityFieldAudit;
            const activityAuditRows = activityAudit?.fields ? Object.values(activityAudit.fields).filter(field => Number(field.present || 0) > 0).sort((a, b) => Number(b.present || 0) - Number(a.present || 0)) : [];
            const activityAuditList = activityAuditRows.length
                ? '<ul class="mt-2 space-y-1">' + activityAuditRows.map(field => {
                    const sourceKeys = Object.entries(field.sourceKeys || {}).sort((a, b) => b[1] - a[1]).map(([key, count]) => escapeHtml(key) + ' (' + Number(count) + ')').join(', ');
                    const types = Object.keys(field.types || {}).join(', ');
                    return '<li class="break-words text-[10px] text-slate-300">' + escapeHtml(field.label) + ': <span class="text-cyan-200">' + Number(field.present || 0) + '/' + Number(activityAudit.records || 0) + '</span> · ' + sourceKeys + ' · Typ: ' + escapeHtml(types) + '</li>';
                }).join('') + '</ul>'
                : '';
            const activityAuditText = activityAuditRows.length
                ? '<details class="mt-2"><summary class="cursor-pointer text-[10px] font-semibold text-cyan-200">Aktivitätsfelder prüfen (' + activityAuditRows.length + ' Feldgruppen)</summary><p class="mt-1 text-[10px] text-slate-400">Nur Feldnamen, Vorkommen und Datentypen – keine Messwerte oder GPS-Daten.</p>' + activityAuditList + '</details>'
                : '';
            const performanceSummary = preview?.performanceSummary;
            const performanceText = performanceSummary ? '<p class="mt-2 text-[10px] text-emerald-200">Garmin-VO₂max im Export: ' + Number(performanceSummary.count || 0) + ' Messpunkte' + (performanceSummary.dateFrom && performanceSummary.dateTo ? ' · ' + performanceSummary.dateFrom + ' bis ' + performanceSummary.dateTo : '') + ' · Garmin-Aktivitätskennung (keine bestätigte tatsächliche Sportart): ' + Object.entries(performanceSummary.sports || {}).map(([sport, count]) => escapeHtml(sport) + ' (' + Number(count) + ')').join(', ') + ' · Beim Import werden fehlende Tageswerte als Garmin-Schätzung ergänzt</p><p class="mt-1 text-[10px] text-amber-200">Hinweis zur Einordnung: Garmin-Kennungen wie RUNNING beschreiben das verwendete Aktivitätsprofil. Sie belegen nicht, welche Sportart tatsächlich ausgeübt wurde. Ein Laufprofil kann beispielsweise auch zur Aufzeichnung eines Paddeltrainings verwendet werden. Die VO₂max-Werte werden deshalb nicht automatisch als lauf- oder paddelspezifische Leistungswerte interpretiert.</p>' : '';
            const dataImport = item.manifest?.dataImport;
            const importComplete = dataImport?.status === 'complete';
            const importHasWarnings = dataImport?.status === 'complete_with_warnings';
            const fileCategoryText = Object.entries(dataImport?.fileCounts || {}).map(([category, count]) => escapeHtml(garminCategoryLabel(category)) + ': ' + Number(count)).join(' · ');
            const dataImportText = dataImport
                ? '<p class="mt-2 text-[10px] ' + (importComplete ? 'text-emerald-200' : 'text-amber-200') + '">Datenimport: ' + Number(dataImport.storedFileRows || 0) + ' Quelldateien gesichert · ' + Number(dataImport.jsonFiles || 0) + ' JSON-Dateien verarbeitet · ' + Number(dataImport.activities?.added || 0) + ' neue Aktivitäten · ' + Number(dataImport.activityIndexRowsAdded || 0) + ' Garmin-IDs im Sync-Index · ' + Number(dataImport.vo2maxRecords || 0) + ' VO₂max-Datensätze · ' + Number(dataImport.vo2maxDailyValuesAdded || 0) + ' Tageswerte ergänzt · ' + Number(dataImport.vo2maxAmbiguousDates || 0) + ' mehrdeutige Tage ausgelassen' + (Number(dataImport.warningCount || 0) ? ' · ' + Number(dataImport.warningCount) + ' Hinweise' : '') + '</p><p class="mt-1 text-[10px] text-slate-400">Dateikategorien: ' + fileCategoryText + '</p><p class="mt-1 text-[10px] text-slate-400">FIT-, GPX- und sonstige Binärdateien bleiben bytegenau im privaten Originalarchiv; alle auslesbaren JSON-Quelldateien werden separat gesichert.</p>'
                : '';
            const previewText = preview ? '<p class="mt-2 text-[10px] text-cyan-200">Analyse: ' + Number(preview.jsonFiles || 0) + ' JSON-Dateien · ' + Number(preview.nestedArchives || 0) + ' Unterarchive · ' + inventory.length + ' Feldpfade erkannt' + (preview.dateFrom && preview.dateTo ? ' · Messdaten: ' + preview.dateFrom + ' bis ' + preview.dateTo : '') + '</p>' + comparisonText + activityAuditText + performanceText + dataImportText + (fieldRows.length ? '<details class="mt-2"><summary class="cursor-pointer text-[10px] font-semibold text-cyan-200">Erkannte Datenfelder anzeigen (' + inventory.length + ')</summary>' + fieldList + '</details>' : '') : '';
            const analyzeButton = item.status === 'indexed' && preview?.analysisVersion !== 8 ? "<button type=\"button\" onclick=\"analyzeGarminExportArchive('" + String(item.id).replace(/[^a-f0-9-]/gi, '') + "')\" class=\"mt-2 rounded-lg bg-cyan-700/70 px-3 py-1.5 text-[10px] font-semibold text-white\">Feldanalyse aktualisieren</button>" : '';
            const importButton = item.status === 'indexed' && preview?.analysisVersion === 8 && !importComplete
                ? "<button type=\"button\" onclick=\"importGarminExportArchive('" + String(item.id).replace(/[^a-f0-9-]/gi, '') + "')\" class=\"mt-2 ml-2 rounded-lg bg-emerald-700/80 px-3 py-1.5 text-[10px] font-semibold text-white\">" + (importHasWarnings ? 'Import mit Hinweisen erneut prüfen' : dataImport?.status ? 'Import fortsetzen' : 'Alle Daten in KAJO importieren') + "</button>"
                : '';
            const status = item.status === 'indexed' ? 'Archiv gesichert · ' + files + ' Dateien katalogisiert'
                : item.status === 'uploaded' ? 'Archiv gesichert · Verzeichnis ausstehend'
                : item.status === 'failed' ? 'Upload fehlgeschlagen' : 'Upload läuft';
            const date = new Date(item.created_at).toLocaleString('de-DE');
            const safeName = String(item.original_file_name || 'Garmin-Export').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
            return '<div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div class="flex items-center justify-between gap-3"><span class="truncate text-xs font-semibold text-slate-200">' + safeName + '</span><span class="shrink-0 text-[10px] text-slate-400">' + size + ' MB</span></div><p class="mt-1 text-[10px] text-slate-400">' + status + ' · ' + date + '</p>' + previewText + analyzeButton + importButton + '</div>';
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
    if (/summarizedactivities|activitydetails/.test(value)) return 'activities';
    if (/fitnessagedata|metricsmaxmet|vo2|max.?met|benchmark/.test(value)) return 'performance';
    if (/sleep|hrv|heart.?rate|healthstatus|stress|spo2|body.?battery|wellness/.test(value)) return 'recovery';
    if (/weight|hydration|nutrition|calorie/.test(value)) return 'body-nutrition';
    if (/trainingplan|_workout.json|workout/.test(value)) return 'training-plans';
    return 'other';
}

function classifyGarminFieldCategory(filePath, fieldPath, fallback) {
    // Garmin's UDSFile bundles several daily domains into one JSON file.
    // Classify individual fields by their explicit semantic names rather than
    // treating the entire file as an undifferentiated "other" category.
    if (!/udsfile/i.test(String(filePath || ''))) return fallback;
    const field = String(fieldPath || '').toLowerCase();
    if (/bodybattery|alldaystress|stresslevel|restingheartrate|currentdayrestingheartrate|spo2|pulseox|hrv|sleep/.test(field)) return 'recovery';
    if (/hydration|kilocalorie|calorie|bmr|sweatloss|nutrition/.test(field)) return 'body-nutrition';
    if (/activeseconds|highlyactiveseconds|floorsascended|floorsdescended|dailystepgoal|stepcount/.test(field)) return 'daily-activity';
    return fallback;
}

function garminCategoryLabel(category) {
    return ({
        activities: 'Aktivitäten',
        performance: 'Leistung',
        recovery: 'Regeneration',
        'body-nutrition': 'Körper & Ernährung',
        'training-plans': 'Trainingspläne',
        'daily-activity': 'Tagesaktivität',
        other: 'Sonstige'
    })[category] || category;
}

function collectGarminFields(value, category, filePath, inventory, budget, path = '', depth = 0, inventoryBudget = { counts: {}, truncated: [] }) {
    if (budget.count >= 25000 || depth > 9) return;
    budget.count++;
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (path) {
        const fieldCategory = classifyGarminFieldCategory(filePath, path, category);
        const key = fieldCategory + '|' + path;
        const currentCount = inventoryBudget.counts[fieldCategory] || 0;
        if (inventory[key] || currentCount < MAX_FIELD_PATHS_PER_CATEGORY) {
            const isNewField = !inventory[key];
            const field = inventory[key] || (inventory[key] = { category: fieldCategory, path, types: {}, occurrences: 0, files: [] });
            if (isNewField) inventoryBudget.counts[fieldCategory] = currentCount + 1;
            field.types[type] = (field.types[type] || 0) + 1;
            field.occurrences++;
            if (field.files.length < 5 && !field.files.includes(filePath)) field.files.push(filePath);
        } else if (!inventoryBudget.truncated.includes(fieldCategory)) {
            inventoryBudget.truncated.push(fieldCategory);
        }
    }
    if (Array.isArray(value)) {
        value.slice(0, 10).forEach(item => collectGarminFields(item, category, filePath, inventory, budget, path ? path + '[]' : '[]', depth + 1, inventoryBudget));
        return;
    }
    if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            collectGarminFields(item, category, filePath, inventory, budget, path ? path + '.' + String(key).slice(0, 100) : String(key).slice(0, 100), depth + 1, inventoryBudget);
            if (budget.count >= 25000) break;
        }
    }
}

function collectSummarizedActivities(value, output, audit = null, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12) return;
    if (Array.isArray(value)) {
        for (const item of value) collectSummarizedActivities(item, output, audit, depth + 1);
        return;
    }
    for (const [key, item] of Object.entries(value)) {
        if (key.toLowerCase() === 'summarizedactivitiesexport' && Array.isArray(item)) {
            for (const activity of item) {
                if (!activity || typeof activity !== 'object' || Array.isArray(activity)) continue;
                recordActivityFieldAudit(activity, audit);
                const id = activity.activityId ?? activity.id;
                if (id === null || id === undefined || !/^[0-9]+$/.test(String(id))) continue;
                output.push({
                    id: String(id),
                    hasStart: activity.startTimeGmt != null || activity.startTimeGMT != null || activity.startTimeLocal != null,
                    hasDuration: activity.duration != null || activity.elapsedDuration != null,
                    hasDistance: activity.distance != null,
                    hasSplits: Array.isArray(activity.splits) && activity.splits.length > 0,
                    hasSplitSummaries: Array.isArray(activity.splitSummaries) && activity.splitSummaries.length > 0
                });
            }
        } else if (item && typeof item === 'object') {
            collectSummarizedActivities(item, output, audit, depth + 1);
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
                collectGarminFields(parsed, category, path, summary.fieldInventory, { count: 0 }, '', 0, summary.fieldInventoryBudget);
                if (category === 'activities') collectSummarizedActivities(parsed, summary.activityRecords, summary.activityFieldAudit);
                if (category === 'performance') summary.performanceRecords.push(...extractGarminVo2MaxRecords(parsed, path));
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
            analysisVersion: 8,
            analyzedAt: new Date().toISOString(),
            jsonFiles: 0,
            nestedArchives: 0,
            categories: {},
            topLevelRecords: {},
            fieldInventory: {},
            fieldInventoryBudget: { counts: {}, truncated: [] },
            activityRecords: [],
            activityFieldAudit: createActivityFieldAudit(),
            performanceRecords: [],
            otherFiles: {},
            dates: [],
            errors: []
        };
        setAnalysisStatus('JSON-Dateien, Datenfelder und Unterarchive werden geprüft …');
        await inspectGarminZip(zip, '', summary);
        const archiveActivityIds = new Set(summary.activityRecords.map(record => record.id));
        const { data: existingActivityRows, error: existingActivityError } = await supabase
            .from('garmin_activities')
            .select('garmin_activity_id')
            .eq('user_id', userId)
            .limit(5000);
        if (existingActivityError) throw existingActivityError;
        const existingActivityIds = new Set((existingActivityRows || []).map(row => String(row.garmin_activity_id)));
        const { data: detailRows, error: detailError } = await supabase
            .from('garmin_activity_details')
            .select('garmin_activity_id')
            .eq('user_id', userId)
            .limit(5000);
        if (detailError) throw detailError;
        const detailIds = new Set((detailRows || []).map(row => String(row.garmin_activity_id)));
        const uniqueRecords = new Map();
        for (const record of summary.activityRecords) {
            if (!uniqueRecords.has(record.id)) uniqueRecords.set(record.id, record);
        }
        const uniqueArchiveRecords = [...uniqueRecords.values()];
        summary.activityComparison = {
            archiveRecords: summary.activityRecords.length,
            uniqueArchiveIds: archiveActivityIds.size,
            duplicateArchiveIds: summary.activityRecords.length - archiveActivityIds.size,
            alreadyExisting: uniqueArchiveRecords.filter(record => existingActivityIds.has(record.id)).length,
            newActivities: uniqueArchiveRecords.filter(record => !existingActivityIds.has(record.id)).length,
            existingWithoutDetails: uniqueArchiveRecords.filter(record => existingActivityIds.has(record.id) && !detailIds.has(record.id)).length,
            recordsWithStartTime: uniqueArchiveRecords.filter(record => record.hasStart).length,
            recordsWithDuration: uniqueArchiveRecords.filter(record => record.hasDuration).length,
            recordsWithDistance: uniqueArchiveRecords.filter(record => record.hasDistance).length,
            recordsWithSplits: uniqueArchiveRecords.filter(record => record.hasSplits).length,
            recordsWithSplitSummaries: uniqueArchiveRecords.filter(record => record.hasSplitSummaries).length,
            comparisonAt: new Date().toISOString()
        };
        delete summary.activityRecords;
        summary.performanceRecords = [...new Map(summary.performanceRecords.map(record => [
            [record.date, record.sport || '', record.subSport || '', record.value].join('|'), record
        ])).values()].sort((a, b) => a.date.localeCompare(b.date));
        summary.performanceSummary = summarizeGarminVo2MaxRecords(summary.performanceRecords);
        summary.fieldInventoryLimits = {
            perCategory: MAX_FIELD_PATHS_PER_CATEGORY,
            counts: summary.fieldInventoryBudget.counts,
            truncatedCategories: summary.fieldInventoryBudget.truncated
        };
        delete summary.fieldInventoryBudget;
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
        setAnalysisStatus('Aktivitätsabgleich und Feldanalyse abgeschlossen. Es wurde nur eine Zählvorschau gespeichert; keine Aktivitäten oder Messwerte wurden importiert oder überschrieben.');
        if (status) status.className = 'text-xs text-emerald-300';
        await renderGarminExportArchiveHistory();
    } catch (error) {
        console.error('[KAJO Garmin-Archivanalyse]', error);
        setAnalysisStatus('Archiv-Analyse fehlgeschlagen: ' + String(error?.message || error));
        if (status) status.className = 'text-xs text-rose-300';
    }
}
