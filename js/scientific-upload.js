/**
 * KAJO Scientific Library – isolierter TUS-Upload-Baustein.
 *
 * Noch nicht in der UI verdrahtet. Aktivierung erst nach Einrichtung und
 * Freigabe von Migrationen, privatem Storage-Bucket, Policies und Function.
 *
 * Keine Service-Role-Credentials im Browser. Upload-URLs und Resume-Metadaten
 * bleiben lokal im Browser und werden an Nutzer, Dokument und Datei gebunden.
 */

import { supabase } from './supabase-client.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const TUS_VERSION = '4.3.1';
const TUS_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/tus-js-client@${TUS_VERSION}/dist/tus.min.js`;
const SUPABASE_HOST = new URL(SUPABASE_URL).hostname;
const STORAGE_HOST = SUPABASE_HOST.endsWith('.supabase.co')
    ? SUPABASE_HOST.replace(/\.supabase\.co$/, '.storage.supabase.co')
    : SUPABASE_HOST;
const TUS_ENDPOINT = `https://${STORAGE_HOST}/storage/v1/upload/resumable`;
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const HASH_CHUNK_SIZE = 4 * 1024 * 1024;
const TUS_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];
const EXPECTED_BUCKET = 'kajo-scientific-documents';
const RESUME_KEY_PREFIX = 'kajo:scientific-upload:v1:';

let tusClientPromise = null;

function loadTusClient() {
    if (globalThis.tus?.Upload) return Promise.resolve(globalThis.tus);
    if (tusClientPromise) return tusClientPromise;

    tusClientPromise = new Promise((resolve, reject) => {
        document.querySelector('script[data-kajo-tus-client="true"]')?.remove();
        const script = document.createElement('script');

        const fail = () => {
            tusClientPromise = null;
            reject(new Error('TUS_CLIENT_LOAD_FAILED'));
        };

        script.addEventListener('error', fail, { once: true });
        script.addEventListener('load', () => {
            if (globalThis.tus?.Upload) resolve(globalThis.tus);
            else fail();
        }, { once: true });

        script.src = TUS_SCRIPT_URL;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.dataset.kajoTusClient = 'true';
        document.head.append(script);
    });

    return tusClientPromise;
}

function assertPdf(file) {
    if (!(file instanceof File) || file.type !== 'application/pdf' || file.size <= 0) {
        throw new Error('INVALID_PDF_FILE');
    }
}

function validateIntent(intent, file) {
    if (!intent || typeof intent !== 'object' ||
        typeof intent.document_id !== 'string' ||
        typeof intent.storage_path !== 'string' ||
        intent.bucket_id !== EXPECTED_BUCKET ||
        typeof intent.upload_intent_expires_at !== 'string') {
        throw new Error('INVALID_UPLOAD_INTENT');
    }

    const expiresAt = Date.parse(intent.upload_intent_expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new Error('UPLOAD_INTENT_EXPIRED');
    }
    assertPdf(file);
}

async function getAuthenticatedUser() {
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) throw new Error('AUTHENTICATION_REQUIRED');
    return data.user;
}

async function getFreshAccessToken() {
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error('AUTHENTICATION_REQUIRED');
    return data.session.access_token;
}

async function invokeIngestion(actionBody) {
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { data, error } = await supabase.functions.invoke('scientific-ingestion', {
        body: actionBody
    });
    if (error) throw new Error('SCIENTIFIC_INGESTION_REQUEST_FAILED');
    return data;
}

function resumeStorageKey(userId, documentId) {
    return `${RESUME_KEY_PREFIX}${userId}:${documentId}`;
}

function saveResumeRecord(record) {
    try {
        localStorage.setItem(
            resumeStorageKey(record.userId, record.documentId),
            JSON.stringify(record)
        );
        return true;
    } catch {
        return false;
    }
}

function readResumeRecord(userId, documentId) {
    try {
        const raw = localStorage.getItem(resumeStorageKey(userId, documentId));
        if (!raw) return null;
        const record = JSON.parse(raw);
        if (record?.userId !== userId || record?.documentId !== documentId) return null;
        return record;
    } catch {
        return null;
    }
}

function removeResumeRecord(userId, documentId) {
    try {
        localStorage.removeItem(resumeStorageKey(userId, documentId));
    } catch {
        // Local storage can be unavailable in restricted browser contexts.
    }
}

/**
 * Content-bound fingerprint: SHA-256 over ordered SHA-256 digests of 4-MiB
 * slices. This avoids loading the entire PDF into memory and distinguishes
 * files that merely share name, size and lastModified metadata.
 */
async function createContentFingerprint(file) {
    if (!globalThis.crypto?.subtle) throw new Error('SECURE_FILE_HASH_UNAVAILABLE');

    const chunkDigests = [];
    for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE) {
        const bytes = await file.slice(offset, Math.min(offset + HASH_CHUNK_SIZE, file.size)).arrayBuffer();
        chunkDigests.push(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    }

    const joined = new Uint8Array(chunkDigests.length * 32);
    chunkDigests.forEach((digest, index) => joined.set(digest, index * 32));
    const finalDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
    const hex = Array.from(finalDigest, byte => byte.toString(16).padStart(2, '0')).join('');
    return hex;
}

function createFingerprint(userId, documentId) {
    return async (file) => {
        const contentHash = await createContentFingerprint(file);
        return `kajo-scientific-v1:${userId}:${documentId}:${file.size}:${contentHash}`;
    };
}

function buildUploadOptions({ intent, userId, initialToken, onProgress, onSettled }) {
    return {
        endpoint: TUS_ENDPOINT,
        chunkSize: TUS_CHUNK_SIZE,
        retryDelays: TUS_RETRY_DELAYS,
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,
        fingerprint: createFingerprint(userId, intent.document_id),
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${initialToken}`,
            'x-upsert': 'false'
        },
        metadata: {
            bucketName: intent.bucket_id,
            objectName: intent.storage_path,
            contentType: 'application/pdf',
            cacheControl: '3600'
        },
        onBeforeRequest: async (request) => {
            const token = await getFreshAccessToken();
            request.setHeader('Authorization', `Bearer ${token}`);
            request.setHeader('apikey', SUPABASE_ANON_KEY);
            request.setHeader('x-upsert', 'false');
        },
        onProgress: (uploadedBytes, totalBytes) => {
            onProgress?.({
                uploadedBytes,
                totalBytes,
                percentage: totalBytes > 0 ? Math.min(100, uploadedBytes / totalBytes * 100) : 0
            });
        },
        onError: (error) => onSettled?.('error', error),
        onSuccess: () => onSettled?.('success')
    };
}

async function confirmAndReadStatus(documentId) {
    const confirmation = await invokeIngestion({
        action: 'confirm-upload',
        document_id: documentId
    });
    if (confirmation?.processing_status !== 'uploaded' ||
        confirmation?.document_id !== documentId) {
        throw new Error('UPLOAD_CONFIRMATION_MISSING');
    }

    const statusResult = await invokeIngestion({
        action: 'get-document-status',
        document_id: documentId
    });
    if (statusResult?.document?.id !== documentId ||
        statusResult?.document?.processing_status !== 'uploaded') {
        throw new Error('UPLOAD_STATUS_NOT_CONFIRMED');
    }
    return statusResult.document;
}

function createCompletionController({ documentId, userId, onProgress, onStatus, upload }) {
    let resolveUpload;
    let rejectUpload;
    let settled = false;
    let tusFinished = false;

    const promise = new Promise((resolve, reject) => {
        resolveUpload = resolve;
        rejectUpload = reject;
    });

    const finish = async (kind, error) => {
        if (settled) return;
        if (kind === 'error') {
            settled = true;
            onStatus?.('Upload fehlgeschlagen. Das Dokument wurde noch nicht bestätigt.');
            rejectUpload(error instanceof Error ? error : new Error('TUS_UPLOAD_FAILED'));
            return;
        }

        tusFinished = true;
        onStatus?.('Upload übertragen. Prüfe Datei und Eigentum serverseitig …');
        try {
            const document = await confirmAndReadStatus(documentId);
            settled = true;
            removeResumeRecord(userId, documentId);
            onStatus?.('PDF wurde übertragen und serverseitig bestätigt.');
            resolveUpload({
                documentId,
                processingStatus: document.processing_status
            });
        } catch (confirmationError) {
            settled = true;
            onStatus?.('Upload übertragen, aber serverseitig noch nicht bestätigt. Bitte Status erneut abrufen.');
            rejectUpload(confirmationError);
        }
    };

    const abort = async () => {
        if (settled || tusFinished) return;
        settled = true;
        try {
            await upload.abort();
        } finally {
            const error = new Error('UPLOAD_ABORTED');
            error.name = 'AbortError';
            rejectUpload(error);
        }
    };

    return { promise, abort, finish };
}

/**
 * Erstellt ein Upload-Intent und startet einen neuen TUS-Upload.
 * Das Modul ist derzeit nicht mit der UI verbunden.
 */
export async function startScientificPdfUpload({ file, source, onProgress, onStatus } = {}) {
    assertPdf(file);
    if (!source || typeof source.title !== 'string' || !source.title.trim()) {
        throw new Error('DOCUMENT_TITLE_REQUIRED');
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabase) {
        throw new Error('SUPABASE_NOT_CONFIGURED');
    }

    const user = await getAuthenticatedUser();
    onStatus?.('Erstelle geschütztes Upload-Intent …');
    const intent = await invokeIngestion({
        action: 'create-upload-intent',
        source,
        file: { mime_type: 'application/pdf', size_bytes: file.size }
    });
    validateIntent(intent, file);

    const record = {
        userId: user.id,
        documentId: intent.document_id,
        fileName: file.name,
        fileSize: file.size,
        fileLastModified: file.lastModified,
        expiresAt: intent.upload_intent_expires_at,
        createdAt: new Date().toISOString()
    };
    const canPersistResume = saveResumeRecord(record);

    const tus = await loadTusClient();
    if (!tus.isSupported) throw new Error('TUS_NOT_SUPPORTED');
    if (canPersistResume && !tus.canStoreURLs) {
        removeResumeRecord(user.id, intent.document_id);
    }

    const initialToken = await getFreshAccessToken();
    let finishUpload;
    const upload = new tus.Upload(file, buildUploadOptions({
        intent,
        userId: user.id,
        initialToken,
        onProgress,
        onSettled: (...args) => finishUpload?.(...args)
    }));
    const controller = createCompletionController({
        documentId: intent.document_id,
        userId: user.id,
        onProgress,
        onStatus,
        upload
    });

    finishUpload = controller.finish;

    onStatus?.(canPersistResume && tus.canStoreURLs
        ? 'PDF wird übertragen. Eine sichere Wiederaufnahme wird vorbereitet …'
        : 'PDF wird übertragen. Wiederaufnahme ist in diesem Browser nicht verfügbar …');
    upload.start();

    return {
        documentId: intent.document_id,
        promise: controller.promise,
        abort: controller.abort
    };
}

/**
 * Gibt lokal gespeicherte, noch nicht abgelaufene Resume-Metadaten des
 * aktuell angemeldeten Nutzers zurück. Es werden keine Upload-URLs ausgegeben.
 */
export async function listResumableScientificUploads() {
    const user = await getAuthenticatedUser();
    const records = [];
    try {
        const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
        for (const key of keys) {
            if (!key?.startsWith(`${RESUME_KEY_PREFIX}${user.id}:`)) continue;
            try {
                const record = JSON.parse(localStorage.getItem(key));
                if (record?.userId !== user.id || !record?.documentId) continue;
                if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= Date.now()) {
                    removeResumeRecord(user.id, record.documentId);
                    continue;
                }
                records.push({
                    documentId: record.documentId,
                    fileName: record.fileName,
                    fileSize: record.fileSize,
                    createdAt: record.createdAt,
                    expiresAt: record.expiresAt
                });
            } catch {
                // Ungültige lokale Metadaten werden ignoriert.
            }
        }
    } catch {
        throw new Error('RESUME_STORAGE_UNAVAILABLE');
    }
    return records;
}

/**
 * Setzt einen unterbrochenen Upload nach erneuter Dateiauswahl fort.
 * Nutzer-ID, Dokumentstatus, Intent-Ablauf, Dateimetadaten und Dateiinhalt
 * müssen übereinstimmen. Es wird niemals automatisch ein neuer TUS-Upload
 * angelegt, wenn keine passende vorherige Session gefunden wird.
 */
export async function resumeScientificPdfUpload({
    file,
    documentId,
    onProgress,
    onStatus
} = {}) {
    assertPdf(file);
    if (typeof documentId !== 'string' || !documentId) throw new Error('DOCUMENT_ID_REQUIRED');

    const user = await getAuthenticatedUser();
    const record = readResumeRecord(user.id, documentId);
    if (!record) throw new Error('RESUME_RECORD_NOT_FOUND');
    if (record.fileName !== file.name ||
        record.fileSize !== file.size ||
        record.fileLastModified !== file.lastModified) {
        throw new Error('SELECTED_FILE_DOES_NOT_MATCH_RESUME_RECORD');
    }
    if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= Date.now()) {
        removeResumeRecord(user.id, documentId);
        throw new Error('UPLOAD_INTENT_EXPIRED');
    }

    onStatus?.('Prüfe Dokumentstatus und Upload-Berechtigung …');
    const statusResult = await invokeIngestion({
        action: 'get-document-status',
        document_id: documentId
    });
    const document = statusResult?.document;
    if (!document || document.id !== documentId) throw new Error('DOCUMENT_NOT_FOUND');
    if (document.processing_status === 'uploaded') {
        removeResumeRecord(user.id, documentId);
        return {
            documentId,
            promise: Promise.resolve({ documentId, processingStatus: 'uploaded' }),
            abort: async () => {}
        };
    }
    if (document.processing_status !== 'pending') throw new Error('DOCUMENT_NOT_AWAITING_UPLOAD');
    if (!document.upload_intent_expires_at ||
        Date.parse(document.upload_intent_expires_at) <= Date.now()) {
        removeResumeRecord(user.id, documentId);
        throw new Error('UPLOAD_INTENT_EXPIRED');
    }

    const tus = await loadTusClient();
    if (!tus.isSupported || !tus.canStoreURLs) throw new Error('RESUME_STORAGE_UNAVAILABLE');

    const intent = {
        document_id: documentId,
        bucket_id: EXPECTED_BUCKET,
        storage_path: null,
        upload_intent_expires_at: document.upload_intent_expires_at
    };

    // For resume, the object path is already embedded in the saved TUS URL
    // and metadata. The client fingerprint is bound to user + document + bytes.
    const initialToken = await getFreshAccessToken();
    let finishUpload;
    const upload = new tus.Upload(file, {
        ...buildUploadOptions({
            intent,
            userId: user.id,
            initialToken,
            onProgress,
            onSettled: (...args) => finishUpload?.(...args)
        }),
        metadata: undefined
    });

    onStatus?.('Suche eine passende, zuvor gestartete TUS-Session …');
    // If the TUS transfer completed but the browser closed before confirmation,
    // confirm the existing Storage object before looking for a resumable URL.
    try {
        const alreadyUploaded = await confirmAndReadStatus(documentId);
        removeResumeRecord(user.id, documentId);
        return {
            documentId,
            promise: Promise.resolve({ documentId, processingStatus: alreadyUploaded.processing_status }),
            abort: async () => {}
        };
    } catch {
        // A pending object without a completed TUS session is handled below.
    }

    const previousUploads = await upload.findPreviousUploads();
    const matching = previousUploads.filter(previous =>
        previous.metadata?.bucketName === EXPECTED_BUCKET &&
        previous.metadata?.contentType === 'application/pdf' &&
        typeof previous.metadata?.objectName === 'string' &&
        previous.metadata.objectName.endsWith(`/${documentId}/original.pdf`)
    );
    if (matching.length !== 1) throw new Error('MATCHING_TUS_SESSION_NOT_FOUND');

    upload.resumeFromPreviousUpload(matching[0]);
    const controller = createCompletionController({
        documentId,
        userId: user.id,
        onProgress,
        onStatus,
        upload
    });
    finishUpload = controller.finish;
    onStatus?.('Unterbrochener PDF-Upload wird fortgesetzt …');
    upload.start();

    return {
        documentId,
        promise: controller.promise,
        abort: controller.abort
    };
}
