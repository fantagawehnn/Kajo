/**
 * Erstellt den fachlich relevanten, datensparsamen Kontext für eine Coach-Anfrage.
 * Nutzt ausschließlich vorhandene KAJO-Daten und bereits berechnete Kennzahlen.
 * Die Auswahl richtet sich nach der Fragestellung; Saison- und Langzeitanalysen
 * behalten ausdrücklich die vollständige verfügbare Historie.
 */
import { buildAthleteContext } from './coach-context.js';
import { buildCoachAnalysisSummary } from './coach-analysis.js';

const ACTIVITY_FIELDS = [
    'date', 'name', 'type', 'category', 'duration', 'distance',
    'hr', 'avgHr', 'averageHr', 'averageHeartRate', 'maxHr', 'maxHR',
    'maxHeartRate', 'avgPower', 'averagePower', 'maxPower', 'avgSpeed',
    'averageSpeed', 'maxSpeed', 'strokeRate', 'avgStrokeRate', 'cadence',
    'perceivedEffort', 'source', 'sources', 'raceFormat', 'discipline',
    'waterType', 'garminTrainingLoad'
];
const CHECKIN_FIELDS = [
    'hrv', 'rhr', 'sleepDuration', 'sleepScore', 'sleepQuality', 'vo2max',
    'fatigue', 'soreness', 'motivation', 'stress', 'respiration'
];
const TIMELINE_FIELDS = [
    'date', 'load', 'tss', 'activityCount', 'loadActivityCount',
    'loadMode', 'loadUnit', 'loadCoverage', 'dataStatus',
    'ctl', 'atl', 'tsb', 'formPct', 'acwr', 'statusLabel', 'isProvisional'
];

const LIMITS = {
    activities: 500,
    timeline: 500,
    checkIns: 180,
    strengthSessions: 200,
    races: 200
};

function pick(source, fields) {
    const result = {};
    for (const key of fields) {
        if (source && Object.prototype.hasOwnProperty.call(source, key)
            && source[key] !== undefined) result[key] = source[key];
    }
    return result;
}

function dateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
    return value.slice(0, 10);
}

function localDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function shiftDate(dateString, days) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);
    return localDate(date);
}

function dateSpan(records, getDate) {
    const dates = records.map(item => dateOnly(getDate(item))).filter(Boolean).sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

function selectWindow(records, getDate, from, to, limit) {
    const dated = [];
    const undated = [];
    for (const record of records) {
        const date = dateOnly(getDate(record));
        if (!date) {
            undated.push(record);
        } else if ((!from || date >= from) && (!to || date <= to)) {
            dated.push(record);
        }
    }
    dated.sort((a, b) => (dateOnly(getDate(b)) || '').localeCompare(dateOnly(getDate(a)) || ''));
    const selected = [...dated, ...undated];
    return {
        records: selected.slice(0, limit),
        matchedCount: selected.length,
        undatedCount: undated.length,
        truncated: selected.length > limit
    };
}

function classifyQuestion(question, today) {
    const q = String(question || '').toLocaleLowerCase('de');
    const fullHistory = /\b(saisonrückblick|saisonanalyse|gesamte trainingshistorie|gesamte historie|gesamten verlauf|über die gesamte saison|ganze saison|seit saisonbeginn|langfristig|langfristige entwicklung)\b/.test(q)
        || /\b(analysiere|analysier|bewerte|rückblick|verlauf|entwicklung)\b.{0,40}\bsaison\b/.test(q)
        || /\bsaison\s+20\d{2}\b/.test(q);
    const healthFocused = /\b(krank|krankheit|infekt|verletz|beschwerd|symptom|gesundheit|schmerz|fieber)\b/.test(q);
    const recoveryFocused = /\b(regeneration|erholung|recovery|hrv|schlaf|müdigkeit|muskelkater|ruhepuls|stress)\b/.test(q);
    const strengthFocused = /\b(krafttraining|kraft|gym|stärke|strength|übungen|personal best|bestleistung)\b/.test(q);
    const planningFocused = /\b(plan|planung|nächste woche|kommende woche|morgen|übermorgen|trainingseinheit|einheit heute)\b/.test(q);
    const performanceFocused = /\b(entwicklung|leistungsentwicklung|performance|vo2max|schwelle|fortschritt|trend|belastung)\b/.test(q);

    if (fullHistory) {
        return { mode: 'full_history', from: null, to: null, checkInDays: null, includeHealth: healthFocused };
    }

    let days = 90;
    let mode = 'recent_training';
    if (healthFocused) {
        days = 180;
        mode = 'health_review';
    } else if (recoveryFocused) {
        days = 42;
        mode = 'recovery_review';
    } else if (strengthFocused) {
        days = 180;
        mode = 'strength_review';
    } else if (planningFocused) {
        days = 56;
        mode = 'training_planning';
    } else if (performanceFocused) {
        days = 180;
        mode = 'performance_trend';
    }

    return {
        mode,
        from: shiftDate(today, -days),
        to: null,
        checkInDays: performanceFocused ? 180 : recoveryFocused || healthFocused ? 60 : 30,
        includeHealth: healthFocused
    };
}

function sanitizeHealthLogs(logs = {}) {
    return Object.entries(logs).map(([date, value]) => ({
        date,
        ...pick(value, ['status', 'diagnosis', 'notes', 'description', 'startDate', 'endDate'])
    })).filter(item => item.status || item.diagnosis || item.notes || item.description);
}

function sanitizeRaces(races = []) {
    return races.map(race => ({
        ...pick(race, ['name', 'date', 'location', 'prio', 'label', 'sport', 'target']),
        results: Array.isArray(race.results) ? race.results.map(result =>
            pick(result, ['discipline', 'format', 'rank', 'time', 'gap', 'partner'])
        ) : []
    }));
}

function sanitizePlanned(planned = []) {
    return planned.map(item => pick(item, [
        'date', 'name', 'type', 'duration', 'targetTss', 'category', 'desc'
    ]));
}

function sanitizeStrength(records = []) {
    const omit = new Set(['id', 'userId', 'user_id', 'telemetry', 'gps', 'route', 'cycle', 'bodyWeight']);
    const walk = (value, depth = 0) => {
        if (depth > 5 || value == null || typeof value !== 'object') {
            return typeof value === 'function' ? undefined : value;
        }
        if (Array.isArray(value)) return value.map(item => walk(item, depth + 1));
        const output = {};
        for (const [key, item] of Object.entries(value)) {
            if (omit.has(key) || /token|password|secret|email/i.test(key)) continue;
            const clean = walk(item, depth + 1);
            if (clean !== undefined) output[key] = clean;
        }
        return output;
    };
    return walk(records);
}

/**
 * @param {object} appState aktueller KAJO-State
 * @param {string} question konkrete Nutzerfrage
 */
export function buildCoachRequestContext(appState, question) {
    const state = appState && typeof appState === 'object' ? appState : {};
    const today = localDate(new Date());
    const scope = classifyQuestion(question, today);
    const activities = Array.isArray(state.rawActivities) ? state.rawActivities : [];
    const timeline = Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [];
    const checkins = state.dailyCheckins && typeof state.dailyCheckins === 'object'
        ? state.dailyCheckins : {};
    const planned = Array.isArray(state.plannedActivities) ? state.plannedActivities : [];
    const strength = Array.isArray(state.strengthLogs) ? state.strengthLogs : [];
    const races = Array.isArray(state.races) ? state.races : [];

    const selectedActivities = selectWindow(activities, item => item?.date, scope.from, scope.to, LIMITS.activities);
    const selectedTimeline = selectWindow(timeline, item => item?.date, scope.from, scope.to, LIMITS.timeline);
    const checkInFrom = scope.checkInDays === null ? null : shiftDate(today, -scope.checkInDays);
    const selectedCheckIns = selectWindow(
        Object.entries(checkins).map(([date, value]) => ({ date, ...pick(value, CHECKIN_FIELDS) }))
            .filter(item => CHECKIN_FIELDS.some(key => item[key] !== undefined && item[key] !== null && item[key] !== '')),
        item => item.date,
        checkInFrom,
        today,
        LIMITS.checkIns
    );
    const selectedStrength = selectWindow(strength, item => item?.date, scope.from, today, LIMITS.strengthSessions);

    const plannedWindow = selectWindow(
        planned,
        item => item?.date,
        shiftDate(today, -14),
        shiftDate(today, 42),
        LIMITS.activities
    );
    const raceWindow = scope.mode === 'full_history'
        ? selectWindow(races, item => item?.date, null, null, LIMITS.races)
        : selectWindow(races, item => item?.date, shiftDate(today, -365), shiftDate(today, 365), LIMITS.races);

    const healthEvents = scope.includeHealth ? sanitizeHealthLogs(state.healthLogs || {}) : [];
    const strengthRelevant = scope.mode === 'full_history' || scope.mode === 'strength_review';
    const selectedActivityRecords = selectedActivities.records.map(item => pick(item, ACTIVITY_FIELDS));
    const selectedTimelineRecords = selectedTimeline.records.map(item => pick(item, TIMELINE_FIELDS));
    const selectedCheckInRecords = selectedCheckIns.records;
    const selectedPlannedRecords = sanitizePlanned(plannedWindow.records);

    return {
        schemaVersion: 2,
        question: String(question || '').trim(),
        contextSelection: {
            mode: scope.mode,
            selectedFrom: scope.from,
            selectedTo: scope.to || today,
            historyPolicy: scope.mode === 'full_history'
                ? 'complete_available_history'
                : 'question_relevant_rolling_window',
            limits: LIMITS
        },
        athlete: buildAthleteContext(state.profile),
        dataCoverage: {
            activities: {
                availableCount: activities.length,
                includedCount: selectedActivities.records.length,
                matchedCount: selectedActivities.matchedCount,
                truncated: selectedActivities.truncated,
                undatedIncluded: selectedActivities.undatedCount,
                availableDateRange: dateSpan(activities, item => item?.date),
                includedDateRange: dateSpan(selectedActivities.records, item => item?.date),
                summarizedFields: ACTIVITY_FIELDS
            },
            calculatedLoadTimeline: {
                availableCount: timeline.length,
                includedCount: selectedTimeline.records.length,
                matchedCount: selectedTimeline.matchedCount,
                truncated: selectedTimeline.truncated,
                availableDateRange: dateSpan(timeline, item => item?.date),
                includedDateRange: dateSpan(selectedTimeline.records, item => item?.date),
                source: 'KAJO computePerformanceTimeline'
            },
            checkIns: {
                availableCount: Object.keys(checkins).length,
                includedCount: selectedCheckIns.records.length,
                truncated: selectedCheckIns.truncated,
                includedDateRange: dateSpan(selectedCheckIns.records, item => item.date)
            },
            healthEvents: {
                availableCount: Object.keys(state.healthLogs || {}).length,
                includedCount: healthEvents.length,
                includedForThisQuestion: scope.includeHealth
            },
            plannedSessions: {
                availableCount: planned.length,
                includedCount: plannedWindow.records.length,
                includedDateRange: dateSpan(plannedWindow.records, item => item?.date)
            },
            races: {
                availableCount: races.length,
                includedCount: raceWindow.records.length,
                truncated: raceWindow.truncated
            },
            strengthSessions: {
                availableCount: strength.length,
                includedCount: strengthRelevant ? selectedStrength.records.length : 0,
                truncated: strengthRelevant && selectedStrength.truncated
            }
        },
        training: {
            activities: selectedActivityRecords,
            calculatedLoadTimeline: selectedTimelineRecords,
            plannedSessions: selectedPlannedRecords,
            strengthSessions: strengthRelevant ? sanitizeStrength(selectedStrength.records) : [],
            strengthPersonalBests: strengthRelevant
                ? sanitizeStrength(Array.isArray(state.strengthPBs) ? state.strengthPBs : [])
                : []
        },
        recovery: {
            dailyCheckIns: selectedCheckIns.records
        },
        health: {
            documentedEvents: healthEvents
        },
        competitions: {
            races: sanitizeRaces(raceWindow.records)
        },
        analysisSummary: buildCoachAnalysisSummary({
            activities: selectedActivities.records,
            timeline: selectedTimelineRecords,
            checkIns: selectedCheckInRecords,
            plannedSessions: selectedPlannedRecords,
            today,
            settings: state.settings || {},
            profile: state.profile || {}
        }),
        calculationSettings: {
            trainingLoadSource: state.settings?.trainingLoadSource ?? null,
            heartRateZones: state.settings?.heartRateZones ?? {}
        }
    };
}
