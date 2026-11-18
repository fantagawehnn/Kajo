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

/**
 * Resolve only explicitly identified paddling sensor series to display units.
 * Garmin raw speed is reported as m/s; the scaleFactor metadata is retained by
 * the source but is not multiplied into the value. Display conversion is m/s × 3.6.
 * Device-reported power remains a device value and is not treated as validated
 * paddling power or laboratory performance.
 */
export function resolvePaddlingPerformanceSeries(activity, seriesList, metricKey) {
    if (!isPaddlingPerformanceActivity(activity) || !Array.isArray(seriesList)) return null;

    const standard = seriesList.find(series => series?.key === metricKey);
    if (standard && isValidElapsedTimeAxis(standard.time, standard.values?.length)) {
        return {
            ...standard,
            unit: standard.unit || ({ speed: 'km/h', hr: 'bpm', power: 'W', cadence: '/min' }[metricKey] || ''),
            sourceDetail: String(standard.label || '').includes('Gerätemesswert') ? 'Gerätemesswert' : ''
        };
    }

    const rawDefinitions = {
        speed: { key: 'directSpeed', sourceUnit: 'mps', unit: 'km/h', multiplier: 3.6, note: 'Quellwert m/s, für die Anzeige in km/h mit 3,6 umgerechnet' },
        power: { key: 'directPower', sourceUnit: 'watt', unit: 'W', multiplier: 1, note: 'Garmin-Gerätemesswert, keine unabhängig validierte Paddelleistung' },
        cadence: { key: 'directStrokeCadence', sourceUnit: 'strokesPerMinute', unit: '/min', multiplier: 1, note: 'Garmin-Schlagfrequenz' }
    };
    const definition = rawDefinitions[metricKey];
    if (!definition) return null;
    const raw = seriesList.find(series => series?.key === definition.key && series.unit === definition.sourceUnit);
    if (!raw || !Array.isArray(raw.values)) return standard || null;
    return {
        ...raw,
        key: metricKey,
        unit: definition.unit,
        values: raw.values.map(value => value === null || value === undefined || value === ''
            || !Number.isFinite(Number(value)) ? null : Number(value) * definition.multiplier),
        sourceDetail: 'Gerätemesswert',
        conversionNote: definition.note
    };
}
