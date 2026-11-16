export function isManualLapTrigger(trigger) {
    if (trigger === 0 || trigger === '0') return true;
    return typeof trigger === 'string' && trigger.toLowerCase().replace(/[-_\s]/g, '') === 'manual';
}

// FIT lap_trigger marks how a lap ended. A manual marker therefore closes
// the preceding lap and starts the next segment; automatic distance/time laps
// between two manual markers remain splits of one test interval.
export function deriveSFormTestSegments(laps = []) {
    if (!Array.isArray(laps) || laps.length < 2) return [];
    const boundaries = [];
    laps.forEach((lap, index) => {
        if (isManualLapTrigger(lap?.lapTrigger ?? lap?.lap_trigger ?? lap?.trigger)) boundaries.push(index);
    });
    const segments = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
        const startLapIndex = boundaries[i] + 1;
        const endLapIndex = boundaries[i + 1];
        if (startLapIndex > endLapIndex) continue;
        segments.push({
            index: segments.length + 1,
            startLapIndex,
            endLapIndex,
            lapIndexes: Array.from({ length: endLapIndex - startLapIndex + 1 }, (_, offset) => startLapIndex + offset),
            boundaryStartLapIndex: boundaries[i],
            boundaryEndLapIndex: boundaries[i + 1],
            complete: true
        });
    }
    return segments;
}

export function summarizeTestSegment(segment, laps = []) {
    const selected = (segment?.lapIndexes || []).map(index => laps[index]).filter(Boolean);
    const durations = selected.map(lap => Number(lap?.durationSeconds ?? lap?.duration))
        .filter(value => Number.isFinite(value) && value > 0);
    const distances = selected.map(lap => Number(lap?.distance))
        .filter(value => Number.isFinite(value) && value > 0);
    const durationSeconds = durations.length === selected.length && selected.length ? durations.reduce((sum, value) => sum + value, 0) : null;
    const distanceMeters = distances.length === selected.length && selected.length ? distances.reduce((sum, value) => sum + value, 0) : null;
    return {
        durationSeconds,
        distanceMeters,
        averageSpeedKmh: durationSeconds !== null && distanceMeters !== null
            ? distanceMeters / durationSeconds * 3.6 : null,
        splitCount: selected.length
    };
}
