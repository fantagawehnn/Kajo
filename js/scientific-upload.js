/**
 * KAJO Scientific Library – isolierter TUS-Upload-Baustein.
 *
 * Dieser Baustein ist absichtlich noch nicht in der UI verdrahtet.
 * Er darf erst aktiviert werden, wenn Datenbankmigrationen, privater
 * Storage-Bucket, Storage-Policies, Function-Secrets und Deployment
 * geprüft und freigegeben wurden.
 *
 * Keine Service-Role-Credentials im Browser. Die bestehende Supabase-
 * Sitzung wird für Storage verwendet; die Edge Function authentifiziert
 * Nutzeraktionen erneut serverseitig.
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
const TUS_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];
const EXPECTED_BUCKET = 'kajo-scientific-documents';

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

    if (file.type !== 'application/pdf' || file.size <= 0) {
        throw new Error('INVALID_PDF_FILE');
    }
}

async function getFreshAccessToken() {
    if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
        throw new Error('AUTHENTICATION_REQUIRED');
    }
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

/**
 * Erstellt ein Upload-Intent und startet TUS.
 * Die Funktion wird derzeit von keinem UI-Element aufgerufen.
 *
 * @returns {Promise<{documentId: string, promise: Promise<object>, abort: Function}>}
 */
export async function startScientificPdfUpload({ file, source, onProgress, onStatus } = {}) {
    if (!file || !(file instanceof File)) throw new Error('PDF_FILE_REQUIRED');
    if (file.type !== 'application/pdf' || !file.size) throw new Error('INVALID_PDF_FILE');
    if (!source || typeof source.title !== 'string' || !source.title.trim()) {
        throw new Error('DOCUMENT_TITLE_REQUIRED');
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabase) {
        throw new Error('SUPABASE_NOT_CONFIGURED');
    }

    onStatus?.('Erstelle geschütztes Upload-Intent …');
    const intent = await invokeIngestion({
        action: 'create-upload-intent',
        source,
        file: { mime_type: 'application/pdf', size_bytes: file.size }
    });
    validateIntent(intent, file);

    const tus = await loadTusClient();
    const initialToken = await getFreshAccessToken();

    let resolveUpload;
    let rejectUpload;
    let settled = false;
    const completion = new Promise((resolve, reject) => {
        resolveUpload = resolve;
        rejectUpload = reject;
    });

    const upload = new tus.Upload(file, {
        endpoint: TUS_ENDPOINT,
        chunkSize: TUS_CHUNK_SIZE,
        retryDelays: TUS_RETRY_DELAYS,
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
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
            // Access Tokens können während eines großen Uploads ablaufen.
            // Vor jedem TUS-Request wird deshalb die aktuelle Sitzung gelesen.
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
        onError: (error) => {
            if (settled) return;
            settled = true;
            onStatus?.('Upload fehlgeschlagen. Das Dokument wurde noch nicht bestätigt.');
            rejectUpload(error instanceof Error ? error : new Error('TUS_UPLOAD_FAILED'));
        },
        onSuccess: async () => {
            if (settled) return;
            onStatus?.('Upload übertragen. Prüfe Datei und Eigentum serverseitig …');
            try {
                const confirmation = await invokeIngestion({
                    action: 'confirm-upload',
                    document_id: intent.document_id
                });
                if (confirmation?.processing_status !== 'uploaded' ||
                    confirmation?.document_id !== intent.document_id) {
                    throw new Error('UPLOAD_CONFIRMATION_MISSING');
                }

                const statusResult = await invokeIngestion({
                    action: 'get-document-status',
                    document_id: intent.document_id
                });
                if (statusResult?.document?.id !== intent.document_id ||
                    statusResult?.document?.processing_status !== 'uploaded') {
                    throw new Error('UPLOAD_STATUS_NOT_CONFIRMED');
                }

                settled = true;
                onStatus?.('PDF wurde übertragen und serverseitig bestätigt.');
                resolveUpload({
                    documentId: intent.document_id,
                    processingStatus: statusResult.document.processing_status
                });
            } catch (error) {
                settled = true;
                onStatus?.('Upload übertragen, aber serverseitig noch nicht bestätigt. Bitte Status erneut abrufen.');
                rejectUpload(error);
            }
        }
    });

    onStatus?.('PDF wird sicher übertragen …');
    upload.start();

    return {
        documentId: intent.document_id,
        promise: completion,
        abort: () => upload.abort()
    };
}
