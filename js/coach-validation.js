/** Validate an ISO calendar date that is a Monday. */
export function isValidWeekStartDate(value) {
    const text = String(value ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const date = new Date(text + 'T12:00:00Z');
    return Number.isFinite(date.getTime())
        && date.toISOString().slice(0, 10) === text
        && date.getUTCDay() === 1;
}
