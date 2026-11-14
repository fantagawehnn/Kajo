/**
 * athlete-context.js
 *
 * Builds a compact, read-only coaching context from the authenticated user's
 * already-loaded KAJO state. This module does not call an AI service, persist
 * data, infer missing values, or perform medical assessment.
 */

const CANOE_ACTIVITY_TYPES = new Set(['Kayaking', 'C1', 'C2']);
const CHECKIN_FIELDS = [
    'sleepQuality', 'soreness', 'fatigue', 'motivation', 'stress',
    'hrv', 'rhr', 'sleepDuration', 'sleepScore', 'respiration'
];

function validDateKey(value) {
    const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

function finiteOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function pickDefined(source, keys) {
    const result = {};
    for (const key of keys) {
        const value = source?.[key];
        if (value !== null && value !== undefined && value !== '') result[key] = value;
    }
    return result;
}

function daysBetween(dateKey, asOfDate) {
    const date = validDateKey(dateKey);
    if (!date) return null;
    const start = new Date(date + 'T12:00:00');
    const end = new Date(asOfDate + 'T12:00:00');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
    return Math.round((end - start) / 86400000);
}

function summarizeActivity(activity) {
    const type = String(activity?.type ?? 'unknown');
    const duration = finiteOrNull(activity?.duration);
    const telemetry = activity?.garminTelemetry && typeof activity.garminTelemetry === 'object'
        ? activity.garminTelemetry : null;
    return {
        id: activity?.id == null ? null : String(activity.id),
        date: validDateKey(activity?.date),
        startTime: activity?.startTime ?? null,
        name: activity?.name ?? null,
        type,
        category: activity?.category ?? null,
        isCanoePerformanceActivity: CANOE_ACTIVITY_TYPES.has(type),
        durationMinutes: duration,
        distance: finiteOrNull(activity?.distance),
        perceivedEffort: finiteOrNull(activity?.perceivedEffort),
        raceFormat: activity?.raceFormat ?? null,
        source: activity?.source ?? null,
        garminTrainingLoad: finiteOrNull(activity?.garminTrainingLoad),
        hasGarminHeartRateSeries: Array.isArray(telemetry?.hr) && telemetry.hr.length > 1,
        hasGarminTelemetry: Boolean(telemetry)
    };
}

function summarizeCheckins(checkins, asOfDate, lookbackDays) {
    return Object.entries(checkins && typeof checkins === 'object' ? checkins : {})
        .map(([date, values]) => ({ date: validDateKey(date), values }))
        .filter(item => item.date && item.values && daysBetween(item.date, asOfDate) >= 0
            && daysBetween(item.date, asOfDate) < lookbackDays)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(({ date, values }) => ({
            date,
            values: pickDefined(values, CHECKIN_FIELDS),
            provenance: {
                hrv: values.hrvSource ?? values.hrvProvenance ?? null,
                rhr: values.rhrSource ?? null,
                sleep: values.sleepSource ?? null
            }
        }));
}

function summarizeHealthEvents(healthLogs, asOfDate, lookbackDays) {
    return Object.entries(healthLogs && typeof healthLogs === 'object' ? healthLogs : {})
        .filter(([date, event]) => {
            const age = daysBetween(date, asOfDate);
            return age !== null && age >= 0 && age < lookbackDays
                && ['sick', 'injured'].includes(event?.status);
        })
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, event]) => ({
            date: validDateKey(date),
            status: event.status,
            // Free-text diagnoses and notes are deliberately not exported by default.
            detailsIncluded: false
        }));
}

/**
 * @param {object} state Current KAJO state object.
 * @param {object} options Optional asOfDate, activityDays, checkinDays,
 *                         healthDays and includePlannedDays.
 * @returns {object} JSON-serializable context for a future, explicitly
 *                   authorized AI request.
 */
export function buildAthleteContext(state, options = {}) {
    const now = new Date();
    const localToday = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const asOfDate = validDateKey(options.asOfDate) || localToday;
    const activityDays = Number.isInteger(options.activityDays) ? Math.max(1, options.activityDays) : 90;
    const checkinDays = Number.isInteger(options.checkinDays) ? Math.max(1, options.checkinDays) : 28;
    const healthDays = Number.isInteger(options.healthDays) ? Math.max(1, options.healthDays) : 180;
    const plannedDays = Number.isInteger(options.includePlannedDays) ? Math.max(0, options.includePlannedDays) : 21;

    const profile = state?.profile && typeof state.profile === 'object' ? state.profile : {};
    const activities = Array.isArray(state?.rawActivities) ? state.rawActivities : [];
    const timeline = Array.isArray(state?.dailyTimeline) ? state.dailyTimeline : [];
    const races = Array.isArray(state?.races) ? state.races : [];
    const planned = Array.isArray(state?.plannedActivities) ? state.plannedActivities : [];
    const settings = state?.settings && typeof state.settings === 'object' ? state.settings : {};

    const profileFields = [
        'sport', 'discipline', 'additionalDisciplines', 'competitionFormats', 'level',
        'trainingDaysPerWeek', 'sessionsPerDay', 'gymAccess', 'equipment', 'facilities',
        'trainingAvailability', 'trainingConstraints', 'season', 'mainGoal',
        'seasonHighlights', 'trainingFocus', 'strengths', 'developmentAreas',
        'maxHr', 'thresholdHr', 'vo2max', 'vo2maxDate', 'thresholdPower',
        'thresholdPace', 'testSource', 'trainingNotes', 'knownLimitations'
    ];

    const recentActivities = activities
        .filter(activity => {
            const age = daysBetween(activity?.date, asOfDate);
            return age !== null && age >= 0 && age < activityDays;
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(summarizeActivity);

    const recentTimeline = timeline
        .filter(day => {
            const age = daysBetween(day?.date, asOfDate);
            return age !== null && age >= 0 && age < activityDays;
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(day => ({
            date: validDateKey(day.date),
            load: finiteOrNull(day.load),
            loadUnit: day.loadUnit ?? null,
            loadMode: day.loadMode ?? null,
            dataStatus: day.dataStatus ?? 'unknown',
            activityCount: finiteOrNull(day.activityCount),
            loadActivityCount: finiteOrNull(day.loadActivityCount),
            ctl: finiteOrNull(day.ctl),
            atl: finiteOrNull(day.atl),
            tsb: finiteOrNull(day.tsb),
            isProvisional: day.isProvisional === true
        }));

    const upcomingRaces = races
        .filter(race => validDateKey(race?.date) && race.date >= asOfDate)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(race => ({
            date: validDateKey(race.date),
            name: race.name ?? null,
            location: race.location ?? null,
            sport: race.sport ?? null,
            priority: ['A', 'B', 'C', 'D', 'E'].includes(race.prio) ? race.prio : null,
            target: race.target ?? null,
            routeId: race.routeId ?? null
        }));

    const plannedActivities = plannedDays > 0 ? planned
        .filter(item => {
            const daysUntil = daysBetween(item?.date, asOfDate);
            return daysUntil !== null && daysUntil <= 0 && daysUntil >= -plannedDays;
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map(item => ({
            date: validDateKey(item.date),
            name: item.name ?? null,
            type: item.type ?? null,
            category: item.category ?? null,
            durationMinutes: finiteOrNull(item.duration)
        })) : [];

    const coverageRanges = Array.isArray(settings.garminActivityCoverageRanges)
        ? settings.garminActivityCoverageRanges
            .filter(range => range?.status === 'complete')
            .map(range => ({ startDate: validDateKey(range.startDate), endDate: validDateKey(range.endDate), status: 'complete' }))
            .filter(range => range.startDate && range.endDate)
        : [];

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        asOfDate,
        scope: {
            allSportsActivityHistoryIncluded: true,
            allSportsContributeToTotalLoadAndRecovery: false,
            trainingLoadReflectsSelectedLoadSource: true,
            loadCompletenessMustBeChecked: true,
            canoePerformanceActivitiesOnly: true,
            canoeActivityTypes: [...CANOE_ACTIVITY_TYPES],
            medicalDiagnosis: false,
            rawTelemetryIncluded: false
        },
        athlete: pickDefined(profile, profileFields),
        performanceContext: {
            canoeActivities: recentActivities.filter(activity => activity.isCanoePerformanceActivity),
            allActivities: recentActivities
        },
        trainingLoad: {
            timeline: recentTimeline,
            coverageRanges,
            selectedSource: settings.trainingLoadSource ?? null
        },
        recovery: {
            checkins: summarizeCheckins(state?.dailyCheckins, asOfDate, checkinDays),
            healthEvents: summarizeHealthEvents(state?.healthLogs, asOfDate, healthDays)
        },
        season: {
            races: upcomingRaces,
            plannedActivities
        },
        dataQuality: {
            activityCountInWindow: recentActivities.length,
            canoeActivityCountInWindow: recentActivities.filter(activity => activity.isCanoePerformanceActivity).length,
            checkinDaysInWindow: summarizeCheckins(state?.dailyCheckins, asOfDate, checkinDays).length,
            timelineDaysInWindow: recentTimeline.length,
            unknownLoadDaysInWindow: recentTimeline.filter(day => day.load === null || day.dataStatus === 'unknown' || day.dataStatus === 'incomplete-activity-load').length,
            confirmedCoverageRangeCount: coverageRanges.length
        }
    };
}
