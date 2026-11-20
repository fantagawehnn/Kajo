import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachRequestContext } from '../js/coach-data-context.js';
import { buildCoachAnalysisSummary } from '../js/coach-analysis.js';

function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function offsetDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return localDate(date);
}

test('natural-language request for last season selects complete available history', () => {
    const oldDate = offsetDate(-240);
    const futureDate = offsetDate(7);
    const context = buildCoachRequestContext({
        rawActivities: [
            { date: oldDate, name: 'Historische Einheit', type: 'C1', duration: 75 },
            { date: futureDate, name: 'Zukünftige Fehlzuordnung', type: 'C1', duration: 75 }
        ]
    }, 'Analysiere meine letzte Saison');

    assert.equal(context.contextSelection.mode, 'full_history');
    assert.equal(context.contextSelection.historyPolicy, 'complete_available_history');
    assert.equal(context.training.activities.length, 1);
    assert.equal(context.training.activities[0].date, oldDate);
    assert.equal(context.dataCoverage.activities.includedCount, 1);
    assert.equal(context.dataCoverage.activities.matchedCount, 1);
});

test('retrospective activity and load windows exclude future records while planned sessions remain future-inclusive', () => {
    const futureDate = offsetDate(3);
    const context = buildCoachRequestContext({
        rawActivities: [
            { date: offsetDate(-1), name: 'Abgeschlossene Einheit', type: 'C1', duration: 60 },
            { date: futureDate, name: 'Falsch datierte Aktivität', type: 'C1', duration: 60 }
        ],
        dailyTimeline: [
            { date: offsetDate(-1), load: 40, dataStatus: 'complete' },
            { date: futureDate, load: 90, dataStatus: 'complete' }
        ],
        plannedActivities: [
            { date: futureDate, name: 'Geplante Einheit', type: 'C1', duration: 60 }
        ]
    }, 'Wie war mein Training in letzter Zeit?');

    assert.equal(context.contextSelection.mode, 'recent_training');
    assert.deepEqual(context.training.activities.map(item => item.name), ['Abgeschlossene Einheit']);
    assert.deepEqual(context.training.calculatedLoadTimeline.map(item => item.date), [offsetDate(-1)]);
    assert.deepEqual(context.training.plannedSessions.map(item => item.name), ['Geplante Einheit']);
});

test('Garmin heart-rate telemetry is summarized locally and not forwarded as raw series', () => {
    const context = buildCoachRequestContext({
        rawActivities: [{
            date: offsetDate(-1),
            name: 'Garmin C1 Einheit',
            type: 'C1',
            source: 'garmin',
            duration: 1,
            garminTelemetry: {
                hr: [145, 150, 160, 170],
                time: [0, 20, 40, 60]
            }
        }],
        profile: { maxHr: 200, restingHr: 50 }
    }, 'Analysiere meine letzte Saison');

    const serialized = JSON.stringify(context);
    assert.equal(context.training.activities.length, 1);
    assert.equal('garminTelemetry' in context.training.activities[0], false);
    assert.match(serialized, /heartRateZoneDistribution/);
    assert.equal(
        context.analysisSummary.heartRateZoneDistribution.analyzedActivities,
        1
    );
    assert.equal(
        context.analysisSummary.heartRateZoneDistribution.groups[0].activityCount,
        1
    );
    assert.equal(serialized.includes('"hr":[145,150,160,170]'), false);
});

test('heart-rate zone summary remains explicitly empty when no usable Garmin telemetry exists', () => {
    const context = buildCoachRequestContext({
        rawActivities: [{
            date: offsetDate(-1),
            name: 'Einheit ohne HF-Daten',
            type: 'C1',
            source: 'garmin',
            duration: 60
        }]
    }, 'Analysiere meine letzte Saison');

    assert.equal(context.analysisSummary.heartRateZoneDistribution.analyzedActivities, 0);
    assert.deepEqual(context.analysisSummary.heartRateZoneDistribution.groups, []);
});


test('weekly volume reports correct ISO calendar week numbers and Monday-Sunday ranges', () => {
    const summary = buildCoachAnalysisSummary({
        activities: [
            { date: '2026-11-02', type: 'C1', duration: 60 },
            { date: '2026-11-09', type: 'C1', duration: 45 },
            { date: '2026-11-16', type: 'C1', duration: 30 }
        ],
        today: '2026-11-18'
    });
    assert.deepEqual(
        summary.activitySummary.weeklyVolume.map(week => [
            week.isoWeekLabel, week.weekStarting, week.weekEnding
        ]),
        [
            ['KW 45', '2026-11-02', '2026-11-08'],
            ['KW 46', '2026-11-09', '2026-11-15'],
            ['KW 47', '2026-11-16', '2026-11-22']
        ]
    );
});

test('coach context flags a health event that overlaps a competition date without inferring participation', () => {
    const context = buildCoachRequestContext({
        healthLogs: {
            '2026-11-16': {
                status: 'ill',
                diagnosis: 'Lungenentzündung'
            }
        },
        races: [{
            name: 'WM/EM',
            date: '2026-11-16',
            results: []
        }]
    }, 'Analysiere meine Krankheit und den Wettkampf');
    assert.equal(context.dataIntegrity.healthCompetitionOverlaps.length, 1);
    assert.equal(context.dataIntegrity.healthCompetitionOverlaps[0].date, '2026-11-16');
    assert.equal(context.dataIntegrity.healthCompetitionOverlaps[0].healthDiagnosis, 'Lungenentzündung');
    assert.match(context.dataIntegrity.healthCompetitionOverlaps[0].interpretation, /Teilnahme/);
});


test('Coach context preserves Garmin HRV and its measurement provenance', () => {
    const context = buildCoachRequestContext({
        dailyCheckins: {
            [offsetDate(-1)]: {
                hrv: 72,
                garminHrv: 72,
                rhr: 49,
                garminRhr: 49,
                measurementSources: {
                    hrv: { source: 'garmin', metric: 'overnight_avg', unit: 'ms' }
                }
            }
        }
    }, 'Analysiere meine Regeneration und HRV');

    const checkin = context.recovery.dailyCheckIns[0];
    assert.equal(checkin.garminHrv, 72);
    assert.equal(checkin.measurementSources.hrv.unit, 'ms');
    assert.equal(checkin.garminRhr, 49);
});

test('Coach context forwards dedicated Garmin sleep and daily health metrics with provenance', () => {
    const context = buildCoachRequestContext({
        dailyCheckins: {
            [offsetDate(-1)]: {
                garminSleepDuration: 7.5,
                garminSleepScore: 88,
                garminRespiration: 15,
                garminStress: 24,
                garminBodyBattery: 91,
                garminSpo2: 97,
                garminWeight: 61.2,
                garminSteps: 8200,
                garminFitnessAge: 23,
                measurementSources: {
                    garminSleepDuration: { source: 'garmin', metric: 'sleep_duration', unit: 'h' }
                }
            }
        }
    }, 'Analysiere meine Regeneration und Gesundheit');

    const checkin = context.recovery.dailyCheckIns[0];
    assert.equal(checkin.garminSleepDuration, 7.5);
    assert.equal(checkin.garminSleepScore, 88);
    assert.equal(checkin.garminRespiration, 15);
    assert.equal(checkin.garminBodyBattery, 91);
    assert.equal(checkin.garminSpo2, 97);
    assert.equal(checkin.garminWeight, 61.2);
    assert.equal(checkin.garminSteps, 8200);
    assert.equal(checkin.garminFitnessAge, 23);
});

test('Coach recovery summary separates HRV ms from resting heart rate bpm without double counting', () => {
    const summary = buildCoachAnalysisSummary({
        checkIns: [
            {
                date: '2026-11-17',
                hrv: 72,
                garminHrv: 72,
                rhr: 49,
                garminRhr: 49,
                measurementSources: {
                    hrv: { source: 'intervals', metric: 'rmssd', unit: 'ms' }
                }
            },
            {
                date: '2026-11-18',
                hrv: 66,
                rhr: 54,
                measurementSources: {
                    hrv: { source: 'intervals', metric: 'rmssd', unit: 'ms' }
                }
            },
            {
                date: '2026-11-19',
                hrv: 60,
                rhr: 52
            }
        ]
    });
    const metrics = summary.recoveryCheckInSummary.metrics;

    assert.deepEqual(metrics.hrvMs, {
        mean: 69,
        count: 2,
        unit: 'ms',
        sourceCounts: { garmin: 1, intervals: 1 }
    });
    assert.deepEqual(metrics.rhrBpm, {
        mean: 51.7,
        count: 3,
        unit: 'bpm',
        sourceCounts: { garmin: 1, checkin: 2 }
    });
    assert.equal(metrics.hrv, undefined);
    assert.equal(metrics.rhr, undefined);
    assert.match(summary.recoveryCheckInSummary.metricRules.hrvMs, /ms/);
    assert.match(summary.recoveryCheckInSummary.metricRules.rhrBpm, /bpm/);
});

test('recovery summary prefers Garmin sleep metrics and reports observed check-in coverage', () => {
    const summary = buildCoachAnalysisSummary({
        checkIns: [
            { date: '2026-11-19', garminSleepDuration: 7.5, sleepDuration: 6.8, garminSleepScore: 88, sleepScore: 70, garminRespiration: 15, garminStress: 24, garminBodyBattery: 91, garminSpo2: 97 },
            { date: '2026-11-20', sleepDuration: 8.0, sleepScore: 82 }
        ]
    });
    const recovery = summary.recoveryCheckInSummary;

    assert.deepEqual(recovery.metrics.sleepDuration, {
        mean: 7.8, count: 2, unit: 'h', sourceCounts: { garmin: 1, checkin: 1 }
    });
    assert.deepEqual(recovery.metrics.sleepScore, {
        mean: 85, count: 2, unit: 'points', sourceCounts: { garmin: 1, checkin: 1 }
    });
    assert.deepEqual(recovery.metrics.respiration, {
        mean: 15, count: 1, unit: 'breaths/min', sourceCounts: { garmin: 1 }
    });
    assert.equal(recovery.dataQuality.observedCheckInCount, 2);
    assert.equal(recovery.dataQuality.metrics.sleepDuration.observedCount, 2);
    assert.equal(recovery.dataQuality.metrics.spo2.absentFromObservedCheckIns, 1);
    assert.match(recovery.dataQuality.interpretationLimit, /Synchronisationsproblem/);
});
