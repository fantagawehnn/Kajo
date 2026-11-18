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
    if (!target || !supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) return;
    const { data, error } = await supabase.from('garmin_export_imports')
        .select('id, original_file_name, file_size_bytes, status, manifest, created_at')
        .eq('user_id', auth.user.id).order('created_at', { ascending: false }).limit(10);
    if (error) {
        target.textContent = 'Archivübersicht konnte nicht geladen werden.';
        return;
    }
    if (!data?.length) {
        target.textContent = 'Noch kein vollständiger Garmin-Export gespeichert.';
        return;
    }
    target.innerHTML = data.map(item => {
        const size = (Number(item.file_size_bytes || 0) / (1024 * 1024)).toFixed(1);
        const files = Number(item.manifest?.entryCount || 0);
        const status = item.status === 'indexed' ? 'Archiv gesichert · ' + files + ' Dateien katalogisiert'
            : item.status === 'uploaded' ? 'Archiv gesichert · Verzeichnis ausstehend'
            : item.status === 'failed' ? 'Upload fehlgeschlagen' : 'Upload läuft';
        const date = new Date(item.created_at).toLocaleString('de-DE');
        return '<div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div class="flex items-center justify-between gap-3"><span class="truncate text-xs font-semibold text-slate-200"></span><span class="shrink-0 text-[10px] text-slate-400">' + size + ' MB</span></div><p class="mt-1 text-[10px] text-slate-400">' + status + ' · ' + date + '</p></div>';
    }).map((html, index) => html.replace('<span class="truncate text-xs font-semibold text-slate-200"></span>', '<span class="truncate text-xs font-semibold text-slate-200">' + String(data[index].original_file_name).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])) + '</span>')).join('');
}
