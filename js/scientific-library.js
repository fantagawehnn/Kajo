/**
 * KAJO Scientific Library – lokaler PDF-Extraktions-PoC.
 *
 * Bewusst noch keine Upload- oder Persistenzfunktion:
 * - PDF wird ausschließlich im Browser verarbeitet.
 * - Es werden keine PDF-Daten oder extrahierten Texte an Server gesendet.
 * - Chunks bleiben nur im Arbeitsspeicher und werden beim Verlassen verworfen.
 * - Persistenz wird erst ergänzt, wenn Schema, Storage-Bucket und Edge-Function
 *   um sichere Upload-/Batch-/Abschlussaktionen erweitert wurden.
 */

const PDFJS_VERSION = '6.5.438';
const PDFJS_MODULE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const PROVISIONAL_CHUNK_CHARS = 3200;
const MAX_EXTRACTION_PAGES = 10000;
const MAX_EXTRACTION_CHUNKS = 20000;
const MAX_EXTRACTED_CHARACTERS = 20000000;

let pdfJsPromise = null;
let activeFile = null;
let activeChunks = [];
let isExtracting = false;
let activePdf = null;
let extractionRunId = 0;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function setStatus(message, tone = 'neutral') {
    const status = document.getElementById('scientific-library-status');
    if (!status) return;
    const tones = {
        neutral: 'border-slate-700 bg-slate-950 text-slate-300',
        success: 'border-emerald-800 bg-emerald-950/30 text-emerald-200',
        warning: 'border-amber-800 bg-amber-950/30 text-amber-200',
        error: 'border-rose-800 bg-rose-950/30 text-rose-200'
    };
    status.className = `rounded-xl border p-3 text-xs leading-relaxed ${tones[tone] || tones.neutral}`;
    status.textContent = message;
}

function loadPdfJs() {
    if (!pdfJsPromise) {
        pdfJsPromise = import(PDFJS_MODULE_URL).then(pdfjs => {
            pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
            return pdfjs;
        }).catch(error => {
            pdfJsPromise = null;
            throw error;
        });
    }
    return pdfJsPromise;
}

function normalizePageText(items) {
    return (items || [])
        .map(item => {
            if (!item || typeof item.str !== 'string') return '';
            return item.str + (item.hasEOL ? '\n' : ' ');
        })
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function splitPageIntoChunks(text, pageNumber, startIndex) {
    const chunks = [];
    const paragraphs = text.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
    let current = '';

    const pushCurrent = () => {
        const value = current.trim();
        if (!value) return;
        chunks.push({
            chunkIndex: startIndex + chunks.length,
            pageStart: pageNumber,
            pageEnd: pageNumber,
            text: value
        });
        current = '';
    };

    for (const paragraph of paragraphs.length ? paragraphs : [text]) {
        let remaining = paragraph;
        while (remaining.length > PROVISIONAL_CHUNK_CHARS) {
            const limit = PROVISIONAL_CHUNK_CHARS;
            let cut = remaining.lastIndexOf(' ', limit);
            if (cut < Math.floor(limit * 0.6)) cut = limit;
            const part = remaining.slice(0, cut).trim();
            if (part) {
                if (current) pushCurrent();
                chunks.push({
                    chunkIndex: startIndex + chunks.length,
                    pageStart: pageNumber,
                    pageEnd: pageNumber,
                    text: part
                });
            }
            remaining = remaining.slice(cut).trim();
        }
        if (!remaining) continue;
        if (!current) current = remaining;
        else if (current.length + remaining.length + 2 <= PROVISIONAL_CHUNK_CHARS) current += '\n\n' + remaining;
        else {
            pushCurrent();
            current = remaining;
        }
    }
    pushCurrent();
    return chunks;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cancelCurrentExtraction() {
    extractionRunId++;
    isExtracting = false;
    const currentPdf = activePdf;
    activePdf = null;
    if (currentPdf) void currentPdf.destroy().catch(() => {});
}

function resetPreview() {
    cancelCurrentExtraction();
    activeFile = null;
    activeChunks = [];
    const input = document.getElementById('scientific-pdf-file');
    if (input) input.value = '';
    const meta = document.getElementById('scientific-library-file-meta');
    if (meta) meta.replaceChildren();
    const results = document.getElementById('scientific-library-results');
    if (results) results.replaceChildren();
    const preview = document.getElementById('scientific-library-chunk-preview');
    if (preview) preview.replaceChildren();
    const button = document.getElementById('scientific-library-extract');
    if (button) { button.disabled = false; button.textContent = 'PDF lokal analysieren'; }
    const progress = document.getElementById('scientific-library-progress');
    if (progress) progress.textContent = '';
    setStatus('Noch kein Dokument ausgewählt. Die Auswahl und Extraktion erfolgen lokal im Browser.', 'neutral');
}

function renderFileMeta(file, pageCount, charCount) {
    const target = document.getElementById('scientific-library-file-meta');
    if (!target) return;
    target.replaceChildren();
    const entries = [
        ['Datei', file.name],
        ['Größe', formatBytes(file.size)],
        ['Seiten', String(pageCount)],
        ['Extrahierte Zeichen', charCount.toLocaleString('de-DE')]
    ];
    entries.forEach(([label, value]) => {
        const card = element('div', 'rounded-xl border border-slate-800 bg-slate-950/70 p-3');
        card.append(element('p', 'text-[10px] uppercase tracking-wide text-slate-500', label));
        card.append(element('p', 'mt-1 break-words text-sm font-semibold text-slate-100', value));
        target.append(card);
    });
}

function renderChunkPreview(chunks) {
    const target = document.getElementById('scientific-library-chunk-preview');
    if (!target) return;
    target.replaceChildren();
    if (!chunks.length) {
        target.append(element('p', 'text-xs text-slate-500', 'Es wurden keine Textabschnitte gefunden.'));
        return;
    }
    const heading = element('div', 'mb-2 flex items-center justify-between gap-3');
    heading.append(element('h3', 'text-sm font-semibold text-white', 'Chunk-Vorschau'));
    heading.append(element('span', 'text-[10px] text-slate-500', `${chunks.length} Abschnitte · vorläufige Aufteilung`));
    target.append(heading);

    chunks.slice(0, 6).forEach(chunk => {
        const card = element('article', 'rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2');
        const meta = element('div', 'flex items-center justify-between gap-2');
        meta.append(element('span', 'text-[10px] font-semibold text-cyan-300', `Chunk ${chunk.chunkIndex + 1}`));
        meta.append(element('span', 'text-[10px] text-slate-500', `PDF-Seite ${chunk.pageStart}`));
        card.append(meta);
        card.append(element('p', 'whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300', chunk.text.slice(0, 1100) + (chunk.text.length > 1100 ? ' …' : '')));
        target.append(card);
    });
    if (chunks.length > 6) {
        target.append(element('p', 'text-[10px] text-slate-500', `Weitere ${chunks.length - 6} Chunks wurden lokal erzeugt, werden hier aber nicht vollständig angezeigt.`));
    }
}

async function extractSelectedPdf() {
    if (isExtracting) return;
    const input = document.getElementById('scientific-pdf-file');
    const file = input?.files?.[0];
    if (!file) {
        setStatus('Bitte wähle zuerst eine PDF-Datei aus.', 'warning');
        return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setStatus('Diese Datei wird nicht als PDF erkannt. Bitte wähle eine PDF-Datei.', 'error');
        return;
    }

    const button = document.getElementById('scientific-library-extract');
    const progress = document.getElementById('scientific-library-progress');
    isExtracting = true;
    const runId = ++extractionRunId;
    activeFile = file;
    activeChunks = [];
    if (button) {
        button.disabled = true;
        button.textContent = 'Extraktion läuft …';
    }
    if (progress) progress.textContent = 'PDF.js wird geladen …';
    setStatus('Die PDF wird lokal im Browser gelesen. Es findet kein Upload statt.', 'neutral');

    let pdf = null;
    try {
        const pdfjs = await loadPdfJs();
        if (runId !== extractionRunId) return;
        if (progress) progress.textContent = 'PDF wird geöffnet …';
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (runId !== extractionRunId) return;
        const loadingTask = pdfjs.getDocument({
            data: bytes,
            isEvalSupported: false,
            useSystemFonts: true
        });
        pdf = await loadingTask.promise;
        if (runId !== extractionRunId) { await pdf.destroy(); return; }
        activePdf = pdf;
        const pageCount = pdf.numPages;
        if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_EXTRACTION_PAGES) {
            throw new Error('PDF_PAGE_LIMIT');
        }
        let totalChars = 0;
        const chunks = [];

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
            if (runId !== extractionRunId) return;
            if (progress) progress.textContent = `Seite ${pageNumber} von ${pageCount} wird extrahiert …`;
            const page = await pdf.getPage(pageNumber);
            if (runId !== extractionRunId) return;
            const textContent = await page.getTextContent();
            if (runId !== extractionRunId) return;
            const pageText = normalizePageText(textContent.items);
            totalChars += pageText.length;
            if (totalChars > MAX_EXTRACTED_CHARACTERS) throw new Error('PDF_CHARACTER_LIMIT');
            if (pageText) chunks.push(...splitPageIntoChunks(pageText, pageNumber, chunks.length));
            if (chunks.length > MAX_EXTRACTION_CHUNKS) throw new Error('PDF_CHUNK_LIMIT');
            page.cleanup?.();
        }

        if (runId !== extractionRunId) return;
        activeChunks = chunks;
        renderFileMeta(file, pageCount, totalChars);
        renderChunkPreview(chunks);

        const resultTarget = document.getElementById('scientific-library-results');
        if (resultTarget) {
            resultTarget.replaceChildren();
            const summary = element('div', 'rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1');
            summary.append(element('p', 'text-sm font-semibold text-white', chunks.length ? 'Extraktion abgeschlossen' : 'Kein maschinenlesbarer Text gefunden'));
            summary.append(element('p', 'text-xs text-slate-400', `${pageCount} Seiten geprüft · ${chunks.length} Chunks erzeugt · ${totalChars.toLocaleString('de-DE')} Zeichen`));
            resultTarget.append(summary);
            if (!chunks.length) {
                resultTarget.append(element('p', 'text-xs text-amber-200', 'Das PDF enthält möglicherweise nur Scans oder geschützte Inhalte. OCR ist im aktuellen MVP nicht vorgesehen.'));
            }
        }
        if (chunks.length) {
            setStatus('Lokale Extraktion abgeschlossen. Die Chunks liegen nur im Arbeitsspeicher dieser Browser-Sitzung und wurden nicht gespeichert oder übertragen.', 'success');
        } else {
            setStatus('Die PDF wurde geöffnet, aber es konnte kein Text extrahiert werden. Keine Daten wurden gespeichert oder übertragen.', 'warning');
        }
        if (progress) progress.textContent = 'Abgeschlossen';
    } catch (error) {
        if (runId !== extractionRunId) return;
        console.error('Scientific PDF preview failed:', error);
        const limitMessages = {
            PDF_PAGE_LIMIT: 'Das PDF überschreitet das aktuelle Limit von 10.000 Seiten.',
            PDF_CHARACTER_LIMIT: 'Das PDF überschreitet das aktuelle Extraktionslimit von 20 Millionen Zeichen.',
            PDF_CHUNK_LIMIT: 'Das PDF erzeugt mehr als 20.000 Textabschnitte und kann im aktuellen MVP nicht verarbeitet werden.'
        };
        setStatus(error?.name === 'PasswordException'
            ? 'Das PDF ist passwortgeschützt. Geschützte Dokumente werden im MVP nicht verarbeitet.'
            : (limitMessages[error?.message] || 'Die PDF konnte nicht zuverlässig extrahiert werden. Bitte prüfe, ob die Datei intakt und nicht verschlüsselt ist.'), 'error');
        if (progress) progress.textContent = 'Extraktion fehlgeschlagen';
    } finally {
        if (runId === extractionRunId) {
            try { await pdf?.destroy?.(); } catch (_) {}
            activePdf = null;
            isExtracting = false;
            if (button) {
                button.disabled = false;
                button.textContent = 'PDF lokal analysieren';
            }
        }
    }
}

export function clearScientificLibraryPreview() {
    resetPreview();
}

export function renderScientificLibraryView() {
    const root = document.getElementById('scientific-library-root');
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    const fileInput = document.getElementById('scientific-pdf-file');
    fileInput?.addEventListener('change', () => {
        cancelCurrentExtraction();
        const button = document.getElementById('scientific-library-extract');
        if (button) { button.disabled = false; button.textContent = 'PDF lokal analysieren'; }
        const progress = document.getElementById('scientific-library-progress');
        if (progress) progress.textContent = '';
        const file = fileInput.files?.[0];
        if (!file) return;
        activeFile = file;
        activeChunks = [];
        document.getElementById('scientific-library-results')?.replaceChildren();
        document.getElementById('scientific-library-file-meta')?.replaceChildren();
        document.getElementById('scientific-library-chunk-preview')?.replaceChildren();
        setStatus(`${file.name} ausgewählt (${formatBytes(file.size)}). Noch nicht hochgeladen.`, 'neutral');
    });
    document.getElementById('scientific-library-extract')?.addEventListener('click', extractSelectedPdf);
    document.getElementById('scientific-library-reset')?.addEventListener('click', resetPreview);
}
