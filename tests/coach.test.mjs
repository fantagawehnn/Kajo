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

console.log('Coach intent tests passed.');
