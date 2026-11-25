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


/**
 * Stable identity for a Garmin HRV measurement series.
 * Different source metrics or units must not be mixed in a trend or baseline.
 */
export function getGarminHrvMeasurementIdentity(checkin) {
    const value = getGarminCheckinMetric(checkin, 'hrv');
    if (!validNumber(value) || Number(value) <= 0) return null;

    const dedicatedGarminValue = checkin?.garminHrv !== null
        && checkin?.garminHrv !== undefined && checkin?.garminHrv !== '';
    const metadata = checkin?.measurementSources?.garminHrv
        || (checkin?.measurementSources?.hrv?.source === 'garmin'
            ? checkin.measurementSources.hrv : null);

    if (!metadata || typeof metadata !== 'object') {
        return dedicatedGarminValue ? 'garmin:unspecified:ms' : 'legacy:unspecified:ms';
    }

    return [
        String(metadata.source || (dedicatedGarminValue ? 'garmin' : 'unknown')).toLowerCase(),
        String(metadata.metric || 'unspecified').toLowerCase(),
        String(metadata.unit || 'ms').toLowerCase()
    ].join(':');
}

/**
 * Return HRV values for one comparable series across the supplied dates.
 * The most recent valid source/metric/unit identity is selected; observations
 * with a different identity remain null rather than being combined.
 */
export function getComparableGarminHrvSeries(checkins, dates) {
    const records = checkins && typeof checkins === 'object' ? checkins : {};
    const observations = (Array.isArray(dates) ? dates : []).map(date => {
        const record = records[date];
        const value = getGarminCheckinMetric(record, 'hrv');
        return {
            date,
            value: validNumber(value) && Number(value) > 0 ? Number(value) : null,
            identity: getGarminHrvMeasurementIdentity(record)
        };
    });
    const identity = [...observations].reverse()
        .find(item => item.identity && item.value !== null)?.identity || null;
    const byDate = new Map(observations.map(item => [
        item.date,
        identity && item.identity === identity ? item.value : null
    ]));
    return {
        identity,
        byDate,
        values: observations.map(item => identity && item.identity === identity ? item.value : null)
    };
}
