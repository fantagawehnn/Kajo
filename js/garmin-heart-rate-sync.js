const HEART_RATE_IMPORT_STATUS_VERSION = 1;
const NO_DATA_RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function countValidHeartRateSamples(heartRate, time) {
    if (!Array.isArray(heartRate) || !Array.isArray(time) || heartRate.length !== time.length) return 0;
    let count = 0;
    for (let index = 0; index < heartRate.length; index++) {
        const bpm = Number(heartRate[index]);
        const seconds = Number(time[index]);
        if (Number.isFinite(bpm) && bpm >= 30 && bpm <= 250
            && Number.isFinite(seconds) && seconds >= 0) count++;
    }
    return count;
}

export function shouldSkipHeartRateRetry(status, now = Date.now()) {
    if (!status || status.parserVersion !== HEART_RATE_IMPORT_STATUS_VERSION) return false;
    if (!['no_hr_data', 'insufficient_hr_data'].includes(status.status)) return false;
    const checkedAt = Date.parse(status.checkedAt || '');
    return Number.isFinite(checkedAt) && now - checkedAt >= 0
        && now - checkedAt < NO_DATA_RETRY_AFTER_MS;
}
