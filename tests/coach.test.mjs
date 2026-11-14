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

console.log('Coach intent and load-window tests passed.');
