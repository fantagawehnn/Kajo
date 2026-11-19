const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

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

/**
 * Loads a user's Garmin activity previews in bounded pages.
 * fetchPage(offset, limit) must return the Supabase { data, error } shape.
 */
export async function loadGarminActivityPages(fetchPage, options = {}) {
    if (typeof fetchPage !== 'function') throw new TypeError('fetchPage muss eine Funktion sein.');

    const pageSize = Math.max(1, Math.floor(Number(options.pageSize) || DEFAULT_PAGE_SIZE));
    const maxRetries = Math.max(0, Math.floor(Number(options.maxRetries ?? DEFAULT_MAX_RETRIES)));
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
    const rows = [];

    for (let offset = 0; ; offset += pageSize) {
        let result = null;
        for (let attempt = 0; ; attempt++) {
            result = await fetchPage(offset, pageSize);
            if (!result?.error) break;
            if (attempt >= maxRetries || !isRetryableDatabaseError(result.error)) {
                throw result.error;
            }
            await wait(retryDelayMs * (attempt + 1));
        }

        const page = Array.isArray(result?.data) ? result.data : [];
        rows.push(...page);
        if (page.length < pageSize) break;
    }

    return rows;
}
