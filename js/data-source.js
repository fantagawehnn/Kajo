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
