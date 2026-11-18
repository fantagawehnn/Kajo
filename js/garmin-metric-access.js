/**
 * Read-only accessors for Garmin-owned daily metrics.
 * Unprovenanced legacy values are deliberately excluded from objective views.
 */
const validNumber = value => value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value));

const GARMIN_FIELDS = {
    rhr: 'garminRhr',
    sleepDuration: 'garminSleepDuration',
    sleepScore: 'garminSleepScore',
    respiration: 'garminRespiration'
};

export function getGarminCheckinMetric(checkin, key) {
    if (!checkin || typeof checkin !== 'object') return null;

    let value = null;
    if (key === 'hrv') {
        value = checkin.garminHrv
            ?? (checkin.measurementSources?.hrv?.source === 'garmin' ? checkin.hrv : null);
    } else if (key === 'vo2max') {
        // Prefer the dedicated field; retain explicitly marked legacy archive values.
        value = checkin.garminVo2max
            ?? (checkin.vo2maxSource === 'garmin-estimate' ? checkin.vo2max : null);
    } else if (Object.prototype.hasOwnProperty.call(GARMIN_FIELDS, key)) {
        value = checkin[GARMIN_FIELDS[key]];
    } else {
        return null;
    }

    return validNumber(value) ? Number(value) : null;
}
