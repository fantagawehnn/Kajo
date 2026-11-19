export const PADDLE_ACTIVITY_TYPES = Object.freeze(['Kayaking', 'C1', 'C2', 'PaddleErgo']);

const DEFAULT_METRICS = Object.freeze({
    Kayaking: ['hr', 'speed', 'strokeRate', 'cadence'],
    C1: ['hr', 'speed', 'strokeRate', 'cadence'],
    C2: ['hr', 'speed', 'strokeRate', 'cadence'],
    PaddleErgo: ['hr', 'speed', 'strokeRate', 'cadence'],
    Run: ['hr', 'pace', 'speed', 'cadence', 'altitude'],
    Ride: ['hr', 'speed', 'power', 'cadence', 'altitude'],
    Swim: ['hr', 'swimPace', 'strokeRate', 'cadence', 'swolf'],
    WeightTraining: ['hr']
});

export function getDefaultActivityTelemetryMetrics(sportType, availableKeys = []) {
    const available = new Set(Array.isArray(availableKeys) ? availableKeys : []);
    const preferred = DEFAULT_METRICS[sportType] || ['hr', 'speed'];
    const selected = preferred.filter(key => available.has(key)
        || (key === 'strokeRate' && available.has('cadence'))
        || (key === 'cadence' && available.has('strokeRate')));
    if (selected.length) return [...new Set(selected)];
    if (available.has('hr')) return ['hr'];
    return availableKeys.length ? [availableKeys[0]] : [];
}

export function normalizeFitSpeed(values) {
    return {
        values: (Array.isArray(values) ? values : []).map(value => {
            if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return null;
            return Number((Number(value) * 3.6).toFixed(3));
        }),
        unit: 'km/h',
        sourceUnit: 'm/s'
    };
}

export function normalizeMetricSpeed(values, unit) {
    const sourceUnit = String(unit || '').trim().toLowerCase().replace(/\s+/g, '');
    if (/^(m\/s|m·s-1|mps|meter\/second|meters\/second)$/.test(sourceUnit)) {
        return {
            values: (Array.isArray(values) ? values : []).map(value => {
                if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return null;
                return Number((Number(value) * 3.6).toFixed(3));
            }),
            unit: 'km/h',
            sourceUnit: unit
        };
    }
    if (/^(km\/h|kmh|kph)$/.test(sourceUnit)) {
        return { values: (Array.isArray(values) ? values : []).map(value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)), unit: 'km/h', sourceUnit: unit };
    }
    return {
        values: (Array.isArray(values) ? values : []).map(value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)),
        unit: typeof unit === 'string' ? unit : '',
        sourceUnit: unit || null
    };
}
