/* Pure helpers for Garmin Complete Export imports. */
export function classifyGarminExportFile(path) {
    const value = String(path || '').toLowerCase();
    if (/summarizedactivities|activitydetails/.test(value)) return 'activities';
    if (/fitnessagedata|metricsmaxmet|vo2|max.?met|benchmark/.test(value)) return 'performance';
    if (/sleep|hrv|heart.?rate|healthstatus|stress|spo2|body.?battery|wellness/.test(value)) return 'recovery';
    if (/weight|hydration|nutrition|calorie/.test(value)) return 'body-nutrition';
    if (/trainingplan|_workout\.json|workout/.test(value)) return 'training-plans';
    return 'other';
}

function activityTypeLabel(record) {
    const value = record?.activityType;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        return value.typeKey ?? value.type ?? value.sportTypeKey ?? value.sportType ?? null;
    }
    return null;
}

export function collectGarminSummaryActivities(value, output = [], depth = 0) {
    if (!value || typeof value !== 'object' || depth > 14) return output;
    if (Array.isArray(value)) {
        for (const item of value) collectGarminSummaryActivities(item, output, depth + 1);
        return output;
    }
    for (const [key, child] of Object.entries(value)) {
        if (key.toLowerCase() === 'summarizedactivitiesexport' && Array.isArray(child)) {
            for (const activity of child) {
                if (activity && typeof activity === 'object' && !Array.isArray(activity)) output.push(activity);
            }
        } else if (child && typeof child === 'object') {
            collectGarminSummaryActivities(child, output, depth + 1);
        }
    }
    return output;
}

function parseStart(record) {
    const localValue = record?.startTimeLocal;
    const candidates = [
        [record?.startTimeGmt, true],
        [record?.startTimeGMT, true],
        [record?.startTime, false],
        [record?.beginTimestamp, false],
        [localValue, false]
    ];
    let startTime = null;
    for (const [value, assumeUtc] of candidates) {
        if (value === null || value === undefined || value === '') continue;
        let date;
        if (typeof value === 'number') {
            date = new Date(value > 1e12 ? value : value * 1000);
        } else {
            const source = String(value);
            const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(source);
            date = new Date(assumeUtc && !hasZone ? source + 'Z' : source);
        }
        if (Number.isFinite(date.getTime())) {
            startTime = date.toISOString();
            break;
        }
    }

    let localDate = null;
    if (typeof localValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(localValue)) {
        localDate = localValue.slice(0, 10);
    } else if (localValue !== null && localValue !== undefined && localValue !== '') {
        const localParsed = typeof localValue === 'number'
            ? new Date(localValue > 1e12 ? localValue : localValue * 1000)
            : new Date(localValue);
        if (Number.isFinite(localParsed.getTime())) localDate = localParsed.toISOString().slice(0, 10);
    }
    const fallbackDate = startTime ? startTime.slice(0, 10) : null;
    return { startTime, date: localDate || fallbackDate };
}

function durationMinutes(value) {
    let seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    if (seconds > 259200) seconds /= 1000;
    return Number.isFinite(seconds) && seconds > 0 ? Number((seconds / 60).toFixed(2)) : null;
}

function firstFinite(...values) {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const number = Number(value);
        if (Number.isFinite(number)) return number;
    }
    return null;
}

/*
 * Garmin activity-profile labels are retained as source metadata only.
 * The normalized KAJO sport is inferred from the activity name, not from the
 * Garmin profile label, because a profile does not prove which sport occurred.
 */
export function mapGarminExportActivity(record, inferSport, inferCategory) {
    if (!record || typeof record !== 'object') return null;
    const rawId = record.activityId ?? record.id;
    const id = String(rawId ?? '');
    if (!/^\d+$/.test(id)) return null;

    const name = String(record.activityName ?? record.name ?? 'Garmin-Aktivität');
    const sourceSportLabel = activityTypeLabel(record);
    const start = parseStart(record);
    const duration = durationMinutes(record.duration ?? record.elapsedDuration ?? record.movingDuration);
    const distanceMeters = firstFinite(record.distance);
    const averageHeartRate = firstFinite(record.avgHr, record.averageHR, record.avgHeartRate);
    const maxHeartRate = firstFinite(record.maxHr, record.maxHR, record.maxHeartRate);

    return {
        id: 'garmin-' + id,
        source: 'garmin',
        sources: ['garmin'],
        sourceId: id,
        sourceRefs: { garminActivityId: id },
        startTime: start.startTime,
        date: start.date,
        name,
        type: typeof inferSport === 'function' ? inferSport(name, '') : 'Workout',
        category: typeof inferCategory === 'function' ? inferCategory(name, '') : 'other',
        duration,
        distance: distanceMeters !== null && distanceMeters > 0 ? Number((distanceMeters / 1000).toFixed(3)) : null,
        hr: averageHeartRate,
        maxHr: maxHeartRate,
        garminSportLabel: sourceSportLabel,
        garminTrainingLoad: firstFinite(record.trainingLoad, record.activityTrainingLoad, record.aerobicTrainingLoad),
        garminAerobicTrainingEffect: firstFinite(record.aerobicTrainingEffect, record.trainingEffect),
        garminAnaerobicTrainingEffect: firstFinite(record.anaerobicTrainingEffect),
        garminCalories: firstFinite(record.calories, record.activeCalories),
        garminAverageSpeed: firstFinite(record.avgSpeed, record.averageSpeed),
        garminMaxSpeed: firstFinite(record.maxSpeed, record.maximumSpeed),
        garminElevationGain: firstFinite(record.elevationGain, record.totalElevationGain),
        garminElevationLoss: firstFinite(record.elevationLoss, record.totalElevationLoss),
        garminAveragePower: firstFinite(record.avgPower, record.averagePower),
        garminMaxPower: firstFinite(record.maxPower, record.maximumPower),
        garminNormalizedPower: firstFinite(record.normPower, record.normalizedPower),
        telemetry: null,
        garminExportImported: true
    };
}
