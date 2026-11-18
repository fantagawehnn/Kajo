function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function findNestedWeightRecord(value, visited = new Set()) {
    if (!value || typeof value !== 'object' || visited.has(value)) return null;
    visited.add(value);
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findNestedWeightRecord(item, visited);
            if (found) return found;
        }
        return null;
    }
    if (value.latestWeight && typeof value.latestWeight === 'object') return value.latestWeight;
    if (Array.isArray(value.allWeightMetrics) && value.allWeightMetrics.length) {
        return value.allWeightMetrics.find(item => item && typeof item === 'object') || null;
    }
    for (const child of Object.values(value)) {
        const found = findNestedWeightRecord(child, visited);
        if (found) return found;
    }
    return null;
}

/**
 * Normalizes Garmin Connect weight payloads to kilograms.
 * Garmin's totalAverage.weight/latestWeight.weight values are stored in grams.
 * The nested sourceType (e.g. MANUAL) is retained for provenance.
 */
export function normalizeGarminWeight(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const measurement = findNestedWeightRecord(payload);
    const sourceType = typeof measurement?.sourceType === 'string' && measurement.sourceType.trim()
        ? measurement.sourceType.trim()
        : null;

    const directKg = finiteNumber(payload.weightInKilograms ?? payload.weightKg);
    if (directKg !== null && directKg > 0 && directKg <= 400) {
        return { value: directKg, sourceType };
    }

    const averageGrams = finiteNumber(payload.totalAverage?.weight);
    const latestGrams = finiteNumber(measurement?.weight);
    const grams = averageGrams ?? latestGrams;
    if (grams === null || grams <= 0) return null;

    const kilograms = grams / 1000;
    if (kilograms <= 0 || kilograms > 400) return null;
    return { value: kilograms, sourceType };
}

/** Counts imported metric fields, not the measurementSources metadata container. */
export function countGarminMetricUpdates(updates) {
    return Object.keys(updates || {}).filter(key => key !== 'measurementSources').length;
}

/** Classifies a normalized Garmin value against the existing Garmin-only field. */
export function classifyGarminMetricUpdate(existingValue, nextValue) {
    if (existingValue === null || existingValue === undefined || existingValue === '') return 'added';
    return Number(existingValue) === Number(nextValue) ? 'unchanged' : 'updated';
}
