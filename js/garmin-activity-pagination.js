const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_CONCURRENCY = 3;

function isRetryableDatabaseError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || error || '').toLowerCase();
    return ['57014', '53300', '40001', '40P01'].includes(code)
        || /statement timeout|deadlock detected|too many connections|temporarily unavailable|fetch failed|gateway timeout|service unavailable/.test(message)
        || [502, 503, 504].includes(Number(error?.status || error?.statusCode));
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPageWithRetry(fetchPage, offset, pageSize, maxRetries, retryDelayMs) {
    for (let attempt = 0; ; attempt++) {
        const result = await fetchPage(offset, pageSize);
        if (!result?.error) return Array.isArray(result?.data) ? result.data : [];
        if (attempt >= maxRetries || !isRetryableDatabaseError(result.error)) throw result.error;
        await wait(retryDelayMs * (attempt + 1));
    }
}

/**
 * Loads rows in bounded pages. Supplying totalCount enables bounded parallel
 * reads; without it, the backwards-compatible sequential pagination is used.
 * fetchPage(offset, limit) must return the Supabase { data, error } shape.
 */
export async function loadGarminActivityPages(fetchPage, options = {}) {
    if (typeof fetchPage !== 'function') throw new TypeError('fetchPage muss eine Funktion sein.');

    const pageSize = Math.max(1, Math.floor(Number(options.pageSize) || DEFAULT_PAGE_SIZE));
    const maxRetries = Math.max(0, Math.floor(Number(options.maxRetries ?? DEFAULT_MAX_RETRIES)));
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
    const totalCount = Number.isFinite(options.totalCount) ? Math.max(0, Math.floor(options.totalCount)) : null;
    const concurrency = Math.min(4, Math.max(1, Math.floor(Number(options.concurrency) || DEFAULT_CONCURRENCY)));
    const rows = [];

    if (totalCount !== null) {
        const offsets = [];
        for (let offset = 0; offset < totalCount; offset += pageSize) offsets.push(offset);
        for (let index = 0; index < offsets.length; index += concurrency) {
            const batch = offsets.slice(index, index + concurrency);
            const pages = await Promise.all(batch.map(offset =>
                fetchPageWithRetry(fetchPage, offset, pageSize, maxRetries, retryDelayMs)
            ));
            for (const page of pages) rows.push(...page);
        }
        if (rows.length !== totalCount) {
            throw new Error('Der paginierte Garmin-Datenabruf war nicht vollständig. Es wurde kein unvollständiger Datenstand übernommen; bitte erneut synchronisieren.');
        }
        return rows;
    }

    for (let offset = 0; ; offset += pageSize) {
        const page = await fetchPageWithRetry(fetchPage, offset, pageSize, maxRetries, retryDelayMs);
        rows.push(...page);
        if (page.length < pageSize) break;
    }

    return rows;
}
