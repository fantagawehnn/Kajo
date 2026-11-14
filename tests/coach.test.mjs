import assert from 'node:assert/strict';
import { classifyCoachIntent, buildLocalCoachReply } from '../js/coach.js';

assert.equal(classifyCoachIntent('Wie hoch war meine Trainingsbelastung?'), 'load');
assert.equal(classifyCoachIntent('Wie war meine Regeneration und mein Schlaf?'), 'recovery');
assert.equal(classifyCoachIntent('Wann ist mein nächster Wettkampf?'), 'competition');
assert.equal(classifyCoachIntent('Zeig mir meine Kanu-Trainingshistorie'), 'activities');
assert.equal(classifyCoachIntent('Hallo Coach'), 'overview');
assert.equal(classifyCoachIntent(''), 'overview');

const context = {
    performanceContext: {
        allActivities: [{ date: '2026-11-10', type: 'Run' }, { date: '2026-11-11', type: 'C1', name: 'C1 Einheit' }],
        canoeActivities: [{ date: '2026-11-11', type: 'C1', name: 'C1 Einheit' }]
    },
    trainingLoad: {
        selectedSource: 'garmin',
        timeline: [
            { date: '2026-11-10', load: null, dataStatus: 'unknown', loadUnit: null, loadMode: null, ctl: null, atl: null, tsb: null },
            { date: '2026-11-11', load: 80, dataStatus: 'complete', loadUnit: 'AU', loadMode: 'garmin', ctl: 40, atl: 50, tsb: -10 }
        ]
    },
    recovery: {
        checkins: [{
            date: '2026-11-11',
            values: { sleepDuration: 8, fatigue: 3, hrv: 72 },
            provenance: { hrv: { source: 'manual', metric: 'unspecified', unit: 'ms' } }
        }],
        healthEvents: []
    },
    season: {
        races: [{ name: 'Testwettkampf', date: '2026-12-01', priority: 'A', location: 'Testort' }],
        plannedActivities: [{ date: '2026-11-15', name: 'Grundlagentraining' }]
    }
};

const loadReply = buildLocalCoachReply(context, 'Wie ist meine Trainingsbelastung?');
assert.match(loadReply, /Trainingsbelastung/);
assert.match(loadReply, /Quelle: garmin/);
assert.match(loadReply, /unbekannter oder unvollständiger Belastung|unvollständiger Belastung/);
assert.doesNotMatch(loadReply, /Ruhetag oder Belastung 0 wird/);

const recoveryReply = buildLocalCoachReply(context, 'Wie ist meine Erholung?');
assert.match(recoveryReply, /Schlafdauer 8,0 h/);
assert.match(recoveryReply, /HRV 72/);
assert.match(recoveryReply, /keine medizinische Beurteilung/);
assert.match(recoveryReply, /Noch kein zeitlicher Vergleich/);

const comparableRecoveryReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    performanceContext: { allActivities: [], canoeActivities: [] },
    trainingLoad: { selectedSource: 'garmin-native', timeline: [] },
    recovery: {
        checkins: [
            { date: '2026-11-01', values: { hrv: 60, rhr: 52, sleepDuration: 7 }, provenance: {
                hrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' },
                rhr: { source: 'garmin', metric: 'resting-heart-rate', unit: 'bpm' },
                sleepDuration: { source: 'garmin', metric: 'sleep-duration', unit: 'h' }
            }},
            { date: '2026-11-08', values: { hrv: 65, rhr: 50, sleepDuration: 8 }, provenance: {
                hrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' },
                rhr: { source: 'garmin', metric: 'resting-heart-rate', unit: 'bpm' },
                sleepDuration: { source: 'garmin', metric: 'sleep-duration', unit: 'h' }
            }}
        ],
        healthEvents: []
    },
    season: { races: [], plannedActivities: [] }
}, 'Wie ist meine Erholung?');
assert.match(comparableRecoveryReply, /HRV: 60,00 → 65,00 ms/);
assert.match(comparableRecoveryReply, /Ruhepuls: 52,00 → 50,00 bpm/);
assert.match(comparableRecoveryReply, /Schlafdauer: 7,00 → 8,00 h/);
assert.match(comparableRecoveryReply, /rein deskriptiv/);

const incompatibleRecoveryReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    performanceContext: { allActivities: [], canoeActivities: [] },
    trainingLoad: { selectedSource: 'garmin-native', timeline: [] },
    recovery: {
        checkins: [
            { date: '2026-11-01', values: { hrv: 60 }, provenance: { hrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' } }},
            { date: '2026-11-08', values: { hrv: 65 }, provenance: { hrv: { source: 'manual', metric: 'unspecified', unit: 'ms' } }}
        ],
        healthEvents: []
    },
    season: { races: [], plannedActivities: [] }
}, 'Wie ist meine Erholung?');
assert.match(incompatibleRecoveryReply, /Noch kein zeitlicher Vergleich/);
assert.doesNotMatch(incompatibleRecoveryReply, /HRV: 60,00 → 65,00/);

const raceReply = buildLocalCoachReply(context, 'Was steht als nächster Wettkampf an?');
assert.match(raceReply, /Testwettkampf am 2026-12-01 \(Priorität A\)/);
assert.match(raceReply, /Grundlagentraining/);

const activityReply = buildLocalCoachReply(context, 'Zeig meine Aktivitäten');
assert.match(activityReply, /Aktivitäten im betrachteten Zeitraum: 2/);
assert.match(activityReply, /Kanu-Performanceeinheiten .*: 1/);



// Load windows must be complete and use one consistent source before totals/comparisons are shown.
function dateOffset(dateKey, offset) {
    const date = new Date(dateKey + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}
const fullTimeline = [];
for (let offset = -96; offset <= 0; offset++) {
    fullTimeline.push({
        date: dateOffset('2026-11-14', offset),
        load: offset >= -6 ? 20 : 10,
        loadMode: 'garmin-native',
        loadUnit: 'AU',
        dataStatus: 'complete',
        ctl: 40,
        atl: 45,
        tsb: -5
    });
}
const fullLoadReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    trainingLoad: { selectedSource: 'garmin-native', timeline: fullTimeline },
    performanceContext: { allActivities: [], canoeActivities: [] },
    recovery: { checkins: [], healthEvents: [] },
    season: { races: [], plannedActivities: [] }
}, 'Wie ist meine Trainingsbelastung?');
assert.match(fullLoadReply, /7 Tage .*vollständig/);
assert.match(fullLoadReply, /Belastungssumme 140,0/);
assert.match(fullLoadReply, /28 Tage .*vollständig/);
assert.match(fullLoadReply, /90 Tage .*vollständig/);
assert.match(fullLoadReply, /Vergleich der letzten 7 Tage mit den 7 Tagen davor: 70,0 Belastungseinheiten höher/);

const gapTimeline = fullTimeline.filter(day => day.date !== '2026-11-10');
const gapReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    trainingLoad: { selectedSource: 'garmin-native', timeline: gapTimeline },
    performanceContext: { allActivities: [], canoeActivities: [] },
    recovery: { checkins: [], healthEvents: [] },
    season: { races: [], plannedActivities: [] }
}, 'Wie ist meine Trainingsbelastung?');
assert.match(gapReply, /7 Tage .*unvollständig/);
assert.match(gapReply, /keine vollständige Belastungssumme ausgewiesen/);
assert.match(gapReply, /Vergleich mit den vorherigen 7 Tagen ist nicht belastbar möglich/);
assert.doesNotMatch(gapReply, /Belastungssumme 130,0/);

const mixedSourceTimeline = fullTimeline.map(day => day.date >= '2026-11-08'
    ? { ...day, loadMode: day.date === '2026-11-08' ? 'srpe' : 'garmin-native' }
    : day);
const mixedSourceReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    trainingLoad: { selectedSource: 'garmin-native', timeline: mixedSourceTimeline },
    performanceContext: { allActivities: [], canoeActivities: [] },
    recovery: { checkins: [], healthEvents: [] },
    season: { races: [], plannedActivities: [] }
}, 'Wie ist meine Trainingsbelastung?');
assert.match(mixedSourceReply, /7 Tage .*unvollständig/);
assert.match(mixedSourceReply, /keine einheitliche Quelle/);
assert.match(mixedSourceReply, /Vergleich mit den vorherigen 7 Tagen ist nicht belastbar möglich/);

const missingSourceTimeline = fullTimeline.map(day => day.date === '2026-11-12'
    ? { ...day, loadMode: null }
    : day);
const missingSourceReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    trainingLoad: { selectedSource: 'garmin-native', timeline: missingSourceTimeline },
    performanceContext: { allActivities: [], canoeActivities: [] },
    recovery: { checkins: [], healthEvents: [] },
    season: { races: [], plannedActivities: [] }
}, 'Wie ist meine Trainingsbelastung?');
assert.match(missingSourceReply, /7 Tage .*unvollständig/);
assert.match(missingSourceReply, /keine vollständige Belastungssumme ausgewiesen/);


const activityDetailReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    performanceContext: {
        allActivities: [
            { date: '2026-11-01', type: 'C1', name: 'C1 Einheit', isCanoePerformanceActivity: true, durationMinutes: 60 },
            { date: '2026-11-03', type: 'Run', name: 'Lauf', isCanoePerformanceActivity: false, durationMinutes: 30 },
            { date: '2026-10-01', type: 'C1', isCanoePerformanceActivity: true, durationMinutes: 50 }
        ],
        canoeActivities: [
            { date: '2026-11-01', type: 'C1', name: 'C1 Einheit', isCanoePerformanceActivity: true, durationMinutes: 60 }
        ]
    },
    trainingLoad: { selectedSource: 'garmin', resolvedMode: 'garmin-native', documentedSessionRpeByDay: [
        { date: '2026-11-12', recordedActivityCount: 1, activitiesWithSessionRpe: 1, activitiesMissingSessionRpe: 0, documentedLoadAU: 175, allRecordedActivitiesHaveSessionRpe: true },
        { date: '2026-11-13', recordedActivityCount: 1, activitiesWithSessionRpe: 0, activitiesMissingSessionRpe: 1, documentedLoadAU: null, allRecordedActivitiesHaveSessionRpe: false }
    ], loadCoverageByActivityType: [
        { type: 'C1', isCanoePerformanceActivity: true, activityCount: 1, loadAvailableCount: 1, loadMissingCount: 0 },
        { type: 'Run', isCanoePerformanceActivity: false, activityCount: 1, loadAvailableCount: 0, loadMissingCount: 1 }
    ], timeline: [] },
    recovery: { checkins: [], healthEvents: [] },
    season: { races: [], plannedActivities: [] }
}, 'Zeig meine Aktivitäten');
assert.match(activityDetailReply, /Aktivitäten der letzten 28 Tage/);
assert.ok(activityDetailReply.includes('Kanu-Performance: 1 Einheiten; 1,0 h dokumentiert bei 1/1 Einheiten'));
assert.ok(activityDetailReply.includes('Ergänzende Sportarten: 1 Einheiten; 0,5 h dokumentiert bei 1/1 Einheiten'));
assert.match(activityDetailReply, /weder eine Belastungssumme/);
assert.match(activityDetailReply, /Belastungswert für 1\/1 Einheiten vorhanden/);
assert.match(activityDetailReply, /Belastungswert für 0\/1 Einheiten vorhanden/);
assert.match(activityDetailReply, /175,0 AU aus 1\/1 dokumentierten Einheiten/);
assert.match(activityDetailReply, /kein gültiger sRPE-Wert für 1 dokumentierte Einheit/);

const modelTrendReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    trainingLoad: { selectedSource: 'garmin-native', timeline: fullTimeline.map((day, index) => ({
        ...day, ctl: 40 + index, atl: 45 + index * 2, tsb: -5 - index
    })) },
    performanceContext: { allActivities: [], canoeActivities: [] },
    recovery: { checkins: [], healthEvents: [] },
    season: { races: [], plannedActivities: [] }
}, 'Wie ist meine Trainingsbelastung?');
assert.match(modelTrendReply, /Modellveränderung über 7 Tage .*CTL \+7,0, ATL \+14,0, TSB -7,0/);
assert.match(modelTrendReply, /kein direkt gemessener Ermüdungs- oder Formwert/);

const modelGapTimeline = fullTimeline.map(day => day.date === '2026-11-10'
    ? { ...day, ctl: null, atl: null, tsb: null, load: null, dataStatus: 'unknown' }
    : day);
const modelGapReply = buildLocalCoachReply({
    asOfDate: '2026-11-14',
    trainingLoad: { selectedSource: 'garmin-native', timeline: modelGapTimeline },
    performanceContext: { allActivities: [], canoeActivities: [] },
    recovery: { checkins: [], healthEvents: [] },
    season: { races: [], plannedActivities: [] }
}, 'Wie ist meine Trainingsbelastung?');
assert.ok(modelGapReply.includes('CTL-/ATL-/TSB-Veränderung über 7 Tage nicht ausgewiesen'));
console.log('Coach intent, load-window, model-trend and activity-volume tests passed.');

const pairedTimeline = [];
for (let offset = -10; offset <= 0; offset++) {
    pairedTimeline.push({
        date: dateOffset('2026-11-14', offset),
        load: offset % 2 === 0 ? 20 : 40,
        loadMode: 'garmin-native',
        loadUnit: 'Garmin Load',
        dataStatus: 'complete',
        ctl: 40, atl: 45, tsb: -5
    });
}
const pairedRecoveryContext = {
    asOfDate: '2026-11-14',
    performanceContext: { allActivities: [], canoeActivities: [] },
    trainingLoad: { selectedSource: 'garmin-native', timeline: pairedTimeline },
    recovery: {
        checkins: [
            { date: '2026-11-10', values: { hrv: 60 }, provenance: { hrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' } }},
            { date: '2026-11-12', values: { hrv: 65 }, provenance: { hrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' } }},
            { date: '2026-11-14', values: { hrv: 58 }, provenance: { hrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' } }}
        ],
        healthEvents: []
    },
    season: { races: [], plannedActivities: [] }
};
const pairedRecoveryReply = buildLocalCoachReply(pairedRecoveryContext, 'Wie ist meine Erholung?');
assert.match(pairedRecoveryReply, /Belastung am Vortag und Check-in am Folgetag/);
assert.match(pairedRecoveryReply, /HRV: 3 passende Tage/);
assert.match(pairedRecoveryReply, /keine statistische Zusammenhangsanalyse/);
assert.match(pairedRecoveryReply, /weist keine Korrelation, Ursache/);

const pairedGapContext = {
    ...pairedRecoveryContext,
    trainingLoad: {
        selectedSource: 'garmin-native',
        timeline: pairedTimeline.filter(day => !['2026-11-11', '2026-11-13'].includes(day.date))
    }
};
const pairedGapReply = buildLocalCoachReply(pairedGapContext, 'Wie ist meine Erholung?');
assert.match(pairedGapReply, /Keine belastbare Gegenüberstellung von Vortagesbelastung/);
assert.doesNotMatch(pairedGapReply, /HRV: 3 passende Tage/);

const pairedMixedSourceContext = {
    ...pairedRecoveryContext,
    recovery: {
        ...pairedRecoveryContext.recovery,
        checkins: pairedRecoveryContext.recovery.checkins.map((item, index) => index === 2
            ? { ...item, provenance: { hrv: { source: 'manual', metric: 'unspecified', unit: 'ms' } } }
            : item)
    }
};
const pairedMixedSourceReply = buildLocalCoachReply(pairedMixedSourceContext, 'Wie ist meine Erholung?');
assert.match(pairedMixedSourceReply, /Keine belastbare Gegenüberstellung von Vortagesbelastung/);
assert.doesNotMatch(pairedMixedSourceReply, /HRV: 3 passende Tage/);

const pairedMixedLoadUnitContext = {
    ...pairedRecoveryContext,
    trainingLoad: {
        selectedSource: 'garmin-native',
        timeline: pairedTimeline.map(day => day.date === '2026-11-13'
            ? { ...day, loadUnit: 'EA-HF-Punkte' }
            : day)
    }
};
const pairedMixedLoadUnitReply = buildLocalCoachReply(pairedMixedLoadUnitContext, 'Wie ist meine Erholung?');
assert.match(pairedMixedLoadUnitReply, /Keine belastbare Gegenüberstellung von Vortagesbelastung/);
assert.doesNotMatch(pairedMixedLoadUnitReply, /HRV: 3 passende Tage/);
