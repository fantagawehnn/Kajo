/**
 * Sport classification for paddling-specific performance analysis.
 * These values match the canonical sport keys in utils.js. Unknown/custom
 * activities are deliberately excluded until their sport mapping is explicit.
 */
const PADDLING_ACTIVITY_TYPES = new Set(['Kayaking', 'C1', 'C2', 'PaddleErgo']);

export function isPaddlingPerformanceActivity(activity) {
    return PADDLING_ACTIVITY_TYPES.has(activity?.type);
}

/**
 * True only when every sample has a corresponding, finite elapsed-time value.
 * The axis must be nonnegative and strictly increasing; sample indices or
 * wall-clock timestamps are not silently treated as elapsed seconds.
 */
export function isValidElapsedTimeAxis(axis, expectedLength) {
    if (!Array.isArray(axis) || !Number.isInteger(expectedLength) || expectedLength < 2
        || axis.length !== expectedLength) return false;
    const values = axis.map(value => {
        if (value === null || value === undefined || value === '') return NaN;
        return Number(value);
    });
    return values.every(value => Number.isFinite(value) && value >= 0)
        && values.slice(1).every((value, index) => value > values[index]);
}

export function getValidatedElapsedTimeAxis(telemetry, expectedLength) {
    for (const axis of [telemetry?.metricSeriesTime, telemetry?.time]) {
        if (isValidElapsedTimeAxis(axis, expectedLength)) return axis.map(Number);
    }
    return null;
}
