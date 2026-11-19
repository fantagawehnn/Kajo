/* Pure parser for Garmin Connect export performance records.
 * Only the explicitly named VO2max field is treated as VO2max.
 * MET values and fitness-age values remain separate and are not converted.
 * Garmin sport/subSport fields are retained as source labels only; they do not
 * prove which sport the athlete actually performed during that session.
 */
function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function optionalString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
export function extractGarminVo2MaxRecords(value, filePath = '') {
    if (!/MetricsMaxMetData/i.test(String(filePath))) return [];
    const records = new Map();
    const visited = new Set();
    function walk(node, depth = 0) {
        if (!node || typeof node !== 'object' || depth > 12 || visited.has(node)) return;
        visited.add(node);
        if (Array.isArray(node)) {
            node.forEach(item => walk(item, depth + 1));
            return;
        }
        const date = node.calendarDate;
        const vo2Max = node.vo2MaxValue;
        if (validDate(date) && typeof vo2Max === 'number' && Number.isFinite(vo2Max) && vo2Max > 0) {
            const sport = optionalString(node.sport);
            const subSport = optionalString(node.subSport);
            const updateTimestamp = optionalString(node.updateTimestamp);
            const record = {
                date, value: vo2Max, unit: 'ml/kg/min', sport, subSport,
                source: 'garmin-export-metrics-max-met', updateTimestamp
            };
            const key = [date, sport || '', subSport || '', vo2Max].join('|');
            const previous = records.get(key);
            if (!previous || String(updateTimestamp || '') > String(previous.updateTimestamp || '')) records.set(key, record);
        }
        Object.values(node).forEach(child => walk(child, depth + 1));
    }
    walk(value);
    return [...records.values()].sort((a, b) =>
        a.date.localeCompare(b.date) ||
        String(a.sport || '').localeCompare(String(b.sport || '')) ||
        String(a.subSport || '').localeCompare(String(b.subSport || ''))
    );
}
export function summarizeGarminVo2MaxRecords(records = []) {
    const validRecords = (Array.isArray(records) ? records : []).filter(record =>
        record && validDate(record.date) && typeof record.value === 'number' &&
        Number.isFinite(record.value) && record.value > 0
    );
    const sports = {};
    validRecords.forEach(record => {
        const label = record.sport || 'nicht zugeordnet';
        sports[label] = (sports[label] || 0) + 1;
    });
    const dates = validRecords.map(record => record.date).sort();
    return { count: validRecords.length, dateFrom: dates[0] || null, dateTo: dates[dates.length - 1] || null, sports };
}
