/* Central access to Garmin-origin sensor time series.
 * Generic activity.telemetry is retained for data preservation. It is only
 * eligible through getActivityTelemetry when the activity explicitly records
 * FIT-file provenance; ambiguous legacy telemetry remains excluded.
 */
export function isGarminActivity(activity) {
    return activity?.source === 'garmin'
        || activity?.sourceRefs?.garminActivityId != null
        || activity?.garminData != null
        || (Array.isArray(activity?.sources) && activity.sources.includes('garmin'))
        || activity?.garminFitImported === true
        || activity?.garminTrainingLoad != null;
}

export function getGarminTelemetry(activity) {
    if (!isGarminActivity(activity)) return null;
    const telemetry = activity?.garminTelemetry;
    return telemetry && typeof telemetry === 'object' ? telemetry : null;
}

/** Mark legacy generic telemetry as excluded from analysis without deleting it.
 * Its provenance cannot be proven from the generic field alone. Preserving it
 * avoids destructive loss while the central accessor remains Garmin-only.
 */
export function sanitizeGarminActivityTelemetry(activity) {
    if (!isGarminActivity(activity) || activity.telemetry == null
        || activity.dataOrigin?.legacyTelemetryExcluded?.policy === 'garmin-only-time-series') return false;
    activity.dataOrigin = {
        ...(activity.dataOrigin || {}),
        legacyTelemetryExcluded: {
            reason: 'unverified-source',
            policy: 'garmin-only-time-series',
            excludedAt: new Date().toISOString()
        }
    };
    return true;
}


/* Activity-level telemetry may also come from an explicitly identified FIT-file
 * import. Do not use generic legacy telemetry unless its FIT provenance is
 * explicit; Garmin-linked telemetry remains the preferred source.
 */
export function getActivityTelemetry(activity) {
    const garminTelemetry = getGarminTelemetry(activity);
    if (garminTelemetry) return garminTelemetry;
    const explicitFitSource = activity?.source === 'fit'
        || (Array.isArray(activity?.sources) && activity.sources.includes('fit'));
    if (!explicitFitSource) return null;
    const telemetry = activity?.telemetry;
    return telemetry && typeof telemetry === 'object' ? telemetry : null;
}


/**
 * Return the Garmin heart-rate series in the normalized shape used by
 * training-load and zone calculations. Garmin Activity Details JSON can store
 * sensor streams under metricSeries (for example directHeartRate) rather than
 * the legacy top-level hr/time arrays.
 */
function normalizeGarminTimeAxis(values) {
    if (!Array.isArray(values) || values.length < 2) return null;
    const numeric = values.map(value => {
        if (value === null || value === undefined || value === '') return NaN;
        return Number(value);
    });
    if (!numeric.every(Number.isFinite)
        || !numeric.slice(1).every((value, index) => value > numeric[index])) return null;

    // Garmin Activity Details JSON liefert absolute Unix-Zeitstempel in ms.
    // Für Berechnungen wird daraus eine relative Sekundenachse ab Sample 0.
    const first = numeric[0];
    if (first >= 1e12 && first <= 4e12) {
        const seconds = numeric.map(value => (value - first) / 1000);
        return seconds.every(Number.isFinite) ? seconds : null;
    }
    // Unix-Zeitstempel in Sekunden (ältere/alternative Garmin-Payloads).
    if (first >= 1e9 && first <= 4e9) {
        const seconds = numeric.map(value => value - first);
        return seconds.every(Number.isFinite) ? seconds : null;
    }
    // Bereits relative Sekunden.
    return numeric;
}

/**
 * Return the most complete Garmin heart-rate series in the normalized shape
 * used by training-load and zone calculations. Prefer a series with a matching,
 * strictly increasing time axis; keep a value-only fallback for the zone view's
 * explicitly limited duration-based estimate.
 */
export function getGarminHeartRateSeries(activity) {
    const telemetry = getGarminTelemetry(activity);
    if (!telemetry) return null;
    const validValues = values => Array.isArray(values) && values.length >= 2
        && values.filter(value => value !== null && value !== undefined && value !== ''
            && Number.isFinite(Number(value)) && Number(value) >= 30 && Number(value) <= 250).length >= 2;
    const validSeries = [];
    const addCandidate = (hr, key, specificTime, specificTimeSource) => {
        if (!validValues(hr)) return;
        const axes = [
            [specificTime, specificTimeSource],
            [telemetry.metricSeriesTime, 'metricSeriesTime'],
            [telemetry.time, 'time']
        ];
        let time = null;
        let timeSource = null;
        for (const [axis, source] of axes) {
            if (!Array.isArray(axis) || axis.length !== hr.length) continue;
            const normalized = normalizeGarminTimeAxis(axis);
            if (!normalized) continue;
            time = normalized;
            timeSource = source;
            break;
        }
        validSeries.push({ hr, time, source: key, timeSource });
    };

    addCandidate(telemetry.hr, 'hr', telemetry.time, 'time');

    const metricSeries = telemetry.metricSeries && typeof telemetry.metricSeries === 'object'
        ? telemetry.metricSeries : {};
    for (const [key, metric] of Object.entries(metricSeries)) {
        const descriptor = (String(key) + ' ' + String(metric?.label || '')).toLowerCase().replace(/[_-]+/g, ' ');
        if (!/(heart.?rate|heartrate|(^|\s)hr($|\s)|puls|herzfrequenz)/.test(descriptor)) continue;
        addCandidate(metric?.values, 'metricSeries:' + key, metric?.time, 'metric.time');
    }

    return validSeries.find(candidate => Array.isArray(candidate.time)) || validSeries[0] || null;
}
