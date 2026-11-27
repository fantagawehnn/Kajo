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
        value = checkin.garminVo2maxSource === 'garmin-export-metrics-max-met'
            ? checkin.garminVo2max
            : (checkin.vo2maxSource === 'garmin-estimate' ? checkin.vo2max : null);
    } else if (Object.prototype.hasOwnProperty.call(GARMIN_FIELDS, key)) {
        value = checkin[GARMIN_FIELDS[key]];
    } else {
        return null;
    }

    return validNumber(value) ? Number(value) : null;
}


function getHrvMetadata(checkin) {
    return checkin?.measurementSources?.garminHrv
        || (checkin?.measurementSources?.hrv?.source === 'garmin' ? checkin.measurementSources.hrv : null);
}
function getCanonicalHrvUnit(checkin) {
    const unit = String(getHrvMetadata(checkin)?.unit || 'ms').trim().toLowerCase();
    if (['ms', 'millisecond', 'milliseconds'].includes(unit)) return 'ms';
    if (['s', 'sec', 'second', 'seconds'].includes(unit)) return 's';
    return null;
}
export function getComparableGarminHrvValue(checkin) {
    const value = getGarminCheckinMetric(checkin, 'hrv');
    if (!validNumber(value) || Number(value) <= 0) return null;
    const unit = getCanonicalHrvUnit(checkin);
    if (unit === 'ms') return Number(value);
    if (unit === 's') return Number(value) * 1000;
    return null;
}
export function getGarminHrvMeasurementIdentity(checkin) {
    const value = getComparableGarminHrvValue(checkin);
    if (!validNumber(value) || Number(value) <= 0) return null;
    const dedicated = checkin?.garminHrv !== null && checkin?.garminHrv !== undefined && checkin?.garminHrv !== '';
    const metadata = getHrvMetadata(checkin);
    return [
        String(metadata?.source || (dedicated ? 'garmin' : 'legacy')).toLowerCase(),
        String(metadata?.metric || 'unspecified').trim().toLowerCase(),
        getCanonicalHrvUnit(checkin)
    ].join(':');
}
export function getComparableGarminHrvSeries(checkins, dates) {
    const records = checkins && typeof checkins === 'object' ? checkins : {};
    const observations = (Array.isArray(dates) ? dates : []).map(date => ({
        date, value: getComparableGarminHrvValue(records[date]),
        identity: getGarminHrvMeasurementIdentity(records[date])
    }));
    const identity = [...observations].reverse().find(item => item.identity && item.value !== null)?.identity || null;
    const byDate = new Map(observations.map(item => [item.date, identity && item.identity === identity ? item.value : null]));
    return { identity, byDate, values: observations.map(item => identity && item.identity === identity ? item.value : null) };
}
