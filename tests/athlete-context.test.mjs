import assert from 'node:assert/strict';
import { buildAthleteContext } from '../js/athlete-context.js';

const state = {
  profile: { discipline: 'Kanu-Wildwasserrennsport', vo2max: 58 },
  rawActivities: [
    { id: 'canoe-1', date: '2026-11-13', type: 'Kayaking', duration: 60, source: 'garmin',
      garminTelemetry: { hr: [110, 120] }, garminTrainingLoad: 75 },
    { id: 'run-1', date: '2026-11-12', type: 'Run', duration: 35, perceivedEffort: 5 },
    { id: 'old-1', date: '2026-08-01', type: 'Kayaking', duration: 50 }
  ],
  dailyTimeline: [
    { date: '2026-11-13', load: 75, loadUnit: 'AU', loadMode: 'garmin-native', dataStatus: 'complete', ctl: 42, atl: 55 },
    { date: '2026-11-12', load: null, dataStatus: 'unknown' }
  ],
  dailyCheckins: {
    '2026-11-13': { sleepDuration: 8, sleepQuality: 7, hrv: 65, weight: 62, manualNote: 'private' },
    '2026-10-01': { fatigue: 8 }
  },
  healthLogs: {
    '2026-11-10': { status: 'sick', diagnosis: 'private diagnosis' },
    '2026-11-11': { status: 'recovered', diagnosis: 'old' }
  },
  races: [
    { date: '2026-11-20', name: 'World Cup', location: 'Place', prio: 'B', target: 'Final' },
    { date: '2026-11-21', name: 'Invalid priority', prio: 'Z' },
    { date: '2026-10-01', name: 'Past race', prio: 'A' }
  ],
  plannedActivities: [
    { date: '2026-11-15', name: 'Easy paddle', type: 'Kayaking', duration: 45 },
    { date: '2026-12-20', name: 'Too far', type: 'Running', duration: 30 }
  ],
  settings: {
    trainingLoadSource: 'garmin-native',
    garminActivityCoverageRanges: [
      { startDate: '2026-11-01', endDate: '2026-11-13', status: 'complete' },
      { startDate: '2026-11-14', endDate: '2026-11-14', status: 'incomplete' }
    ]
  }
};

const context = buildAthleteContext(state, { asOfDate: '2026-11-14' });

assert.equal(context.schemaVersion, 1);
assert.equal(context.asOfDate, '2026-11-14');
assert.equal(context.athlete.vo2max, 58);
assert.equal(context.performanceContext.canoeActivities.length, 1);
assert.equal(context.performanceContext.allActivities.length, 2);
assert.equal(context.performanceContext.canoeActivities[0].hasGarminHeartRateSeries, true);
assert.equal(context.performanceContext.canoeActivities[0].garminTrainingLoad, 75);
assert.equal(context.trainingLoad.timeline[0].load, null);
assert.equal(context.trainingLoad.timeline[0].dataStatus, 'unknown');
assert.equal(context.trainingLoad.coverageRanges.length, 1);
assert.equal(context.recovery.checkins.length, 1);
assert.equal(context.recovery.checkins[0].values.weight, undefined);
assert.equal(context.recovery.checkins[0].values.manualNote, undefined);
assert.equal(context.recovery.healthEvents.length, 1);
assert.equal(context.recovery.healthEvents[0].detailsIncluded, false);
assert.equal(JSON.stringify(context).includes('private diagnosis'), false);
assert.equal(JSON.stringify(context).includes('private'), false);
assert.equal(context.season.races.length, 2);
assert.equal(context.season.races[0].priority, 'B');
assert.equal(context.season.races[1].priority, null);
assert.equal(context.season.plannedActivities.length, 1);
assert.equal(context.scope.allSportsContributeToTotalLoadAndRecovery, true);
assert.equal(context.scope.medicalDiagnosis, false);

const empty = buildAthleteContext({}, { asOfDate: '2026-11-14' });
assert.deepEqual(empty.performanceContext.allActivities, []);
assert.deepEqual(empty.recovery.checkins, []);
assert.deepEqual(empty.season.races, []);
assert.equal(empty.dataQuality.unknownLoadDaysInWindow, 0);

console.log('Athlete context tests passed.');
