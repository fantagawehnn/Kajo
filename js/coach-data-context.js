/**
 * Erstellt den fachlich relevanten, datensparsamen Kontext für eine Coach-Anfrage.
 * Nutzt ausschließlich bereits vorhandene KAJO-Daten und berechnete Kennzahlen.
 * Roh-Telemetrie, GPS, Nutzer-IDs, Gewicht und Zyklusdaten werden nicht übertragen.
 */
import { buildAthleteContext } from './coach-context.js';

const ACTIVITY_FIELDS = [
    'date', 'name', 'type', 'category', 'duration', 'distance',
    'hr', 'avgHr', 'averageHr', 'averageHeartRate', 'maxHr', 'maxHR',
    'maxHeartRate', 'avgPower', 'averagePower', 'maxPower', 'avgSpeed',
    'averageSpeed', 'maxSpeed', 'strokeRate', 'avgStrokeRate', 'cadence',
    'perceivedEffort', 'source', 'sources', 'raceFormat', 'discipline',
    'waterType', 'garminTrainingLoad'
];
const CHECKIN_FIELDS = [
    'hrv', 'rhr', 'sleepDuration', 'sleepScore', 'sleepQuality',
    'fatigue', 'soreness', 'motivation', 'stress', 'respiration'
];
const TIMELINE_FIELDS = [
    'date', 'load', 'tss', 'activityCount', 'loadActivityCount',
    'loadMode', 'loadUnit', 'loadCoverage', 'dataStatus',
    'ctl', 'atl', 'tsb', 'formPct', 'acwr', 'statusLabel', 'isProvisional'
];

function pick(source, fields) {
    const result = {};
    for (const key of fields) {
        if (source && Object.prototype.hasOwnProperty.call(source, key)
            && source[key] !== undefined) result[key] = source[key];
    }
    return result;
}

function dateSpan(records, getDate) {
    const dates = records.map(getDate).filter(value =>
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
    ).map(value => value.slice(0, 10)).sort();
    return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
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
    const activities = Array.isArray(state.rawActivities) ? state.rawActivities : [];
    const timeline = Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [];
    const checkins = state.dailyCheckins && typeof state.dailyCheckins === 'object'
        ? state.dailyCheckins : {};
    const checkinEntries = Object.entries(checkins).map(([date, value]) => ({
        date, ...pick(value, CHECKIN_FIELDS)
    })).filter(item => CHECKIN_FIELDS.some(key => item[key] !== undefined && item[key] !== null && item[key] !== ''));

    return {
        schemaVersion: 1,
        question: String(question || '').trim(),
        athlete: buildAthleteContext(state.profile),
        dataCoverage: {
            activities: {
                count: activities.length,
                dateRange: dateSpan(activities, item => item?.date),
                summarizedFields: ACTIVITY_FIELDS
            },
            calculatedLoadTimeline: {
                count: timeline.length,
                dateRange: dateSpan(timeline, item => item?.date),
                source: 'KAJO computePerformanceTimeline'
            },
            checkIns: {
                count: checkinEntries.length,
                dateRange: dateSpan(checkinEntries, item => item.date)
            },
            healthEvents: {
                count: Object.keys(state.healthLogs || {}).length
            },
            plannedSessions: {
                count: Array.isArray(state.plannedActivities) ? state.plannedActivities.length : 0
            },
            races: {
                count: Array.isArray(state.races) ? state.races.length : 0
            },
            strengthSessions: {
                count: Array.isArray(state.strengthLogs) ? state.strengthLogs.length : 0
            }
        },
        training: {
            activities: activities.map(item => pick(item, ACTIVITY_FIELDS)),
            calculatedLoadTimeline: timeline.map(item => pick(item, TIMELINE_FIELDS)),
            plannedSessions: sanitizePlanned(Array.isArray(state.plannedActivities) ? state.plannedActivities : []),
            strengthSessions: sanitizeStrength(Array.isArray(state.strengthLogs) ? state.strengthLogs : []),
            strengthPersonalBests: sanitizeStrength(Array.isArray(state.strengthPBs) ? state.strengthPBs : [])
        },
        recovery: {
            dailyCheckIns: checkinEntries
        },
        health: {
            documentedEvents: sanitizeHealthLogs(state.healthLogs || {})
        },
        competitions: {
            races: sanitizeRaces(Array.isArray(state.races) ? state.races : [])
        },
        calculationSettings: {
            trainingLoadSource: state.settings?.trainingLoadSource ?? null,
            heartRateZones: state.settings?.heartRateZones ?? {}
        }
    };
}
