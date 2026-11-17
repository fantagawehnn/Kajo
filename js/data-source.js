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
        || activity?.garminTrainingLoad != null
        || activity?.dailyHeartRateImported === true;
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
    if (!isGarminActivity(activity) || activity.dailyHeartRateImported === true || activity.telemetry == null
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
    const explicitFitSource = activity?.dailyHeartRateImported === true
        || activity?.source === 'fit'
        || (Array.isArray(activity?.sources) && activity.sources.includes('fit'));
    if (!explicitFitSource) return null;
    const telemetry = activity?.telemetry;
    return telemetry && typeof telemetry === 'object' ? telemetry : null;
}


/**
 * Return the Garmin heart-rate series in the normalized shape used by
 * training-load and zone calculations. Prefer a complete, aligned time series
 * over an earlier HR-only candidate so a partial top-level array cannot mask
 * a usable metricSeries entry.
 */
export function getGarminHeartRateSeries(activity) {
    // Verwende exakt denselben provenance-geprüften Zugriff wie die Aktivitätenansicht:
    // Garmin-Telemetrie bevorzugt, explizit als FIT markierte Telemetrie als Fallback.
    const telemetry = getActivityTelemetry(activity);
    if (!telemetry) return null;

    const validValues = values => Array.isArray(values) && values.length >= 2
        && values.filter(value => value !== null && value !== undefined && value !== ''
            && Number.isFinite(Number(value)) && Number(value) >= 30 && Number(value) <= 250).length >= 2;
    const validTime = (time, length) => Array.isArray(time) && time.length === length
        && time.every(value => value !== null && value !== '' && Number.isFinite(Number(value)))
        && time.slice(1).every((value, index) => Number(value) > Number(time[index]));

    const candidates = [];
    if (validValues(telemetry.hr)) {
        candidates.push({
            hr: telemetry.hr,
            time: validTime(telemetry.time, telemetry.hr.length) ? telemetry.time : null,
            source: 'hr'
        });
    }

    const metricSeries = telemetry.metricSeries && typeof telemetry.metricSeries === 'object'
        ? telemetry.metricSeries : {};
    for (const [key, metric] of Object.entries(metricSeries)) {
        const descriptor = (String(key) + ' ' + String(metric?.label || '')).toLowerCase().replace(/[_-]+/g, ' ');
        if (!/(heart.?rate|heartrate|(^|\s)hr($|\s)|puls|herzfrequenz)/.test(descriptor)
            || !validValues(metric?.values)) continue;
        const axisCandidates = [metric.time, telemetry.metricSeriesTime, telemetry.time];
        const time = axisCandidates.find(axis => validTime(axis, metric.values.length)) || null;
        candidates.push({ hr: metric.values, time, source: 'metricSeries:' + key });
    }

    // A complete series is required by Load. If none has an aligned time axis,
    // retain the best HR-only candidate so duration-based zone distribution
    // can still be calculated where the activity duration is valid.
    return candidates.find(candidate => candidate.time) || candidates[0] || null;
}


/** Structural statistics for a numeric time axis. Values are not converted and
 * no unit is inferred: callers must confirm the unit from source metadata.
 */
export function summarizeTimeAxis(axis) {
    if (!Array.isArray(axis) || axis.length < 2) {
        return { valid: false, pointCount: Array.isArray(axis) ? axis.length : 0, intervalCount: 0 };
    }
    const values = axis.map(Number);
    if (!values.every(Number.isFinite) || !values.slice(1).every((value, index) => value > values[index])) {
        return { valid: false, pointCount: axis.length, intervalCount: 0 };
    }
    const intervals = values.slice(1).map((value, index) => value - values[index]).sort((a, b) => a - b);
    const median = intervals.length % 2
        ? intervals[Math.floor(intervals.length / 2)]
        : (intervals[intervals.length / 2 - 1] + intervals[intervals.length / 2]) / 2;
    return {
        valid: true,
        pointCount: values.length,
        intervalCount: intervals.length,
        minInterval: intervals[0],
        medianInterval: median,
        maxInterval: intervals[intervals.length - 1],
        span: values[values.length - 1] - values[0],
        intervalsAtMost30: intervals.filter(value => value <= 30).length,
        intervalsOver30: intervals.filter(value => value > 30).length,
        intervalSumAtMost30: intervals.filter(value => value <= 30).reduce((sum, value) => sum + value, 0),
        intervalSumOver30: intervals.filter(value => value > 30).reduce((sum, value) => sum + value, 0)
    };
}
