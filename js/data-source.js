/* Central access to Garmin-origin sensor time series.
 * Generic activity.telemetry is retained for data preservation, but is never
 * used as a fallback because its historical provenance may be ambiguous.
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
