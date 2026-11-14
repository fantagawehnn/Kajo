/**
 * Canoe-specific performance summary.
 *
 * This module describes only recorded K1/C1/C2 sessions. Complementary sports
 * and paddle ergometer sessions are intentionally excluded from canoe results.
 * It does not infer missing race formats, conditions, routes or performance data.
 */

const CANOE_TYPES = new Set(['Kayaking', 'C1', 'C2']);
const FORMATS = new Set(['sprint', 'classic']);

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function dateKey(value) {
    const match = String(value ?? '').match(/^(\\d{4}-\\d{2}-\\d{2})/);
    return match ? match[1] : null;
}

function firstNumber(activity, keys, minimum = -Infinity) {
    for (const key of keys) {
        const value = numberOrNull(activity?.[key]);
        if (value !== null && value > minimum) return value;
    }
    return null;
}

function conditionDetails(activity) {
    const water = activity?.waterConditions && typeof activity.waterConditions === 'object'
        ? activity.waterConditions : {};
    const route = activity?.routeId ?? activity?.route ?? null;
    const level = numberOrNull(water.level);
    const discharge = numberOrNull(water.discharge);
    return [
        route == null || route === '' ? 'route:unknown' : 'route:' + String(route),
        'water:' + (water.type || 'unknown'),
        'level:' + (level === null ? 'unknown' : String(level) + ':' + (water.levelUnit || 'cm')),
        'flow:' + (discharge === null ? 'unknown' : String(discharge))
    ].join('|');
}

function metricSummary(items, keys, minimum = -Infinity) {
    const values = items.map(item => firstNumber(item, keys, minimum)).filter(value => value !== null);
    return {
        count: values.length,
        mean: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null
    };
}

/**
 * @param {Array<object>} activities All recorded activities.
 * @param {{from?: string, to?: string}} options Inclusive local date range.
 */
export function buildCanoePerformanceSummary(activities, options = {}) {
    const source = Array.isArray(activities) ? activities : [];
    const from = dateKey(options.from);
    const to = dateKey(options.to);
    const canoe = source.filter(activity => {
        if (!CANOE_TYPES.has(activity?.type)) return false;
        const date = dateKey(activity?.date);
        if (!date) return false;
        return (!from || date >= from) && (!to || date <= to);
    }).sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const byDiscipline = ['Kayaking', 'C1', 'C2'].map(type => {
        const rows = canoe.filter(item => item.type === type);
        const durations = rows.map(item => numberOrNull(item.duration)).filter(value => value !== null && value > 0);
        const distances = rows.map(item => numberOrNull(item.distance)).filter(value => value !== null && value > 0);
        return {
            type,
            activityCount: rows.length,
            documentedDurationCount: durations.length,
            durationMinutes: durations.length ? Number(durations.reduce((sum, value) => sum + value, 0).toFixed(1)) : null,
            documentedDistanceCount: distances.length,
            distanceKm: distances.length ? Number(distances.reduce((sum, value) => sum + value, 0).toFixed(2)) : null,
            sprintCount: rows.filter(item => item.raceFormat === 'sprint').length,
            classicCount: rows.filter(item => item.raceFormat === 'classic').length,
            unspecifiedFormatCount: rows.filter(item => !FORMATS.has(item.raceFormat)).length
        };
    });

    const groups = new Map();
    canoe.forEach(activity => {
        const format = FORMATS.has(activity.raceFormat) ? activity.raceFormat : 'unspecified';
        const key = [activity.type, format, conditionKey(activity)].join('::');
        if (!groups.has(key)) groups.set(key, { type: activity.type, raceFormat: format, conditionKey: conditionKey(activity), activities: [] });
        groups.get(key).activities.push(activity);
    });

    const comparableGroups = [...groups.values()].map(group => {
        const rows = group.activities;
        return {
            type: group.type,
            raceFormat: group.raceFormat,
            conditionKey: group.conditionKey,
            activityCount: rows.length,
            dateFrom: dateKey(rows[0].date),
            dateTo: dateKey(rows[rows.length - 1].date),
            averageSpeedKmh: metricSummary(rows, ['avgSpeed', 'averageSpeed', 'speed'], 0),
            averagePowerW: metricSummary(rows, ['avgPower', 'averagePower', 'power'], 0),
            strokeRatePerMinute: metricSummary(rows, ['strokeRate', 'avgStrokeRate', 'cadence'], 0),
            averageHeartRateBpm: metricSummary(rows, ['avgHr', 'averageHr', 'averageHeartRate', 'hr'], 0)
        };
    }).sort((a, b) => a.type.localeCompare(b.type) || a.raceFormat.localeCompare(b.raceFormat)
        || a.conditionKey.localeCompare(b.conditionKey));

    const metricCounts = {
        averageSpeed: canoe.filter(item => firstNumber(item, ['avgSpeed', 'averageSpeed', 'speed'], 0) !== null).length,
        averagePower: canoe.filter(item => firstNumber(item, ['avgPower', 'averagePower', 'power'], 0) !== null).length,
        strokeRate: canoe.filter(item => firstNumber(item, ['strokeRate', 'avgStrokeRate', 'cadence'], 0) !== null).length,
        averageHeartRate: canoe.filter(item => firstNumber(item, ['avgHr', 'averageHr', 'averageHeartRate', 'hr'], 0) !== null).length,
        duration: canoe.filter(item => firstNumber(item, ['duration'], 0) !== null).length,
        distance: canoe.filter(item => firstNumber(item, ['distance'], 0) !== null).length
    };

    return {
        period: { from: from || null, to: to || null },
        activityCount: canoe.length,
        byDiscipline,
        comparableGroups,
        dataQuality: {
            activitiesWithoutDate: source.filter(item => CANOE_TYPES.has(item?.type) && !dateKey(item?.date)).length,
            activitiesWithUnspecifiedFormat: canoe.filter(item => !FORMATS.has(item.raceFormat)).length,
            activitiesWithUnspecifiedWaterType: canoe.filter(item => !item?.waterConditions?.type).length,\n            activitiesWithoutComparableConditions: canoe.filter(item => !conditionDetails(item).comparable).length,\n            comparableGroupCount: comparableGroups.filter(group => group.comparable).length,
            metricCounts,
            note: 'Nur Einheiten mit dokumentierter Strecke, Distanz und Gewässertyp werden als vergleichbar markiert. Wildwasservergleiche benötigen zusätzlich Pegel und Abfluss. Fehlende Angaben werden nicht ergänzt.'
        }
    };
}
