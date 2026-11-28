/**
 * CSV export fields moving_time, elapsed_time and duration_seconds are seconds.
 * KAJO stores activity duration in whole minutes, consistently with FIT/GPX imports.
 */
export function normalizeCsvDurationMinutes(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return Math.round(seconds / 60);
}
