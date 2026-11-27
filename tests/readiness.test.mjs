import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateReadiness, buildTrainingRecommendation } from '../js/readiness.js';

const day = '2026-11-18';
const history = {};
for (let index = 1; index <= 14; index++) {
    const date = new Date(day + 'T12:00:00');
    date.setDate(date.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    history[key] = {
        garminHrv: 60 + (index % 3) - 1,
        garminRhr: 48 + (index % 2),
        garminRespiration: 14 + (index % 2) * 0.2,
        garminSleepDuration: 8
    };
}

function makeState(overrides = {}) {
    return {
        dailyCheckins: { ...history, ...(overrides.dailyCheckins || {}) },
        healthLogs: overrides.healthLogs || {},
        dailyTimeline: overrides.dailyTimeline || [],
        plannedActivities: overrides.plannedActivities || []
    };
}

test('readiness requires at least two independent domains', () => {
    const oneDomain = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminRhr: 48 } }
    });
    const result = calculateReadiness(day, oneDomain);
    assert.equal(result.score, null);
    assert.equal(result.domainCount, 1);
    assert.equal(result.enoughData, false);
});

test('individual physiological baseline uses recent history and ignores future readings', () => {
    const source = makeState({
        dailyCheckins: {
            [day]: { garminHrv: 75, garminSleepScore: 90 }
        },
        dailyTimeline: [{ date: day, load: 100, ctl: 20, atl: 40, acwr: 2.0 }]
    });
    const result = calculateReadiness(day, source);
    const hrv = result.objective.find(item => item.key === 'hrv');
    assert.ok(hrv);
    assert.equal(hrv.baseline, 60);
    assert.equal(hrv.score, 70);
    assert.equal(result.score, 79); // Baseline physiology plus strong sleep score
});

test('HRV baseline does not mix explicit Garmin provenance with legacy values', () => {
    const legacyHistory = Object.fromEntries(Object.entries(history).map(([date, record]) => [
        date,
        {
            hrv: record.garminHrv,
            garminRhr: record.garminRhr,
            garminRespiration: record.garminRespiration,
            garminSleepDuration: record.garminSleepDuration
        }
    ]));
    const source = makeState({
        dailyCheckins: {
            ...legacyHistory,
            [day]: {
                garminHrv: 75,
                garminSleepScore: 90,
                measurementSources: {
                    garminHrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' }
                }
            }
        }
    });
    const result = calculateReadiness(day, source);
    assert.equal(result.objective.some(item => item.key === 'hrv'), false);
    assert.deepEqual(
        result.baselineRequirements.find(item => item.key === 'hrv'),
        { key: 'hrv', label: 'HRV', observations: 0, required: 12 }
    );
});

test('HRV baseline uses matching source, metric identity and unit', () => {
    const garminHistory = Object.fromEntries(Object.entries(history).map(([date, record]) => [
        date,
        {
            ...record,
            measurementSources: {
                garminHrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' }
            }
        }
    ]));
    const source = makeState({
        dailyCheckins: {
            ...garminHistory,
            [day]: {
                garminHrv: 75,
                garminSleepScore: 90,
                measurementSources: {
                    garminHrv: { source: 'garmin', metric: 'unspecified', unit: 'ms' }
                }
            }
        }
    });
    const result = calculateReadiness(day, source);
    const hrv = result.objective.find(item => item.key === 'hrv');
    assert.ok(hrv);
    assert.equal(hrv.observations, 14);
    assert.deepEqual(hrv.measurementSource, {
        source: 'garmin', metric: 'unspecified', unit: 'ms'
    });
});

test('manual health values are not used as Garmin recovery data', () => {
    const source = makeState({
        dailyCheckins: {
            [day]: {
                hrv: 75,
                rhr: 45,
                respiration: 13,
                sleepDuration: 8,
                sleepScore: 95,
                measurementSources: {
                    hrv: { source: 'manual', metric: 'unspecified', unit: 'ms' }
                }
            }
        }
    });
    const result = calculateReadiness(day, source);
    assert.equal(result.objective.length, 0);
    assert.equal(result.domains.physiology, null);
    assert.equal(result.domains.sleep, null);
});

test('sleep duration and sleep score are not counted twice in the sleep domain', () => {
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepDuration: 4, garminSleepScore: 90, sleepQuality: 4 } }
    });
    const result = calculateReadiness(day, source);
    assert.equal(result.objective.filter(item => item.key === 'sleepDuration').length, 0);
    assert.equal(result.objective.filter(item => item.key === 'sleepScore').length, 1);
    assert.equal(result.domains.sleep, 90);
});

test('missing subjective check-in values remain missing, not negative', () => {
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90 } }
    });
    const result = calculateReadiness(day, source);
    assert.equal(result.subjective.length, 0);
    assert.equal(result.domains.subjective, null);
    assert.equal(result.domainCount, 2);
});

test('training load and ACWR are kept outside the readiness composite', () => {
    const lowLoad = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90, sleepQuality: 3 } },
        dailyTimeline: [{ date: day, load: 20, ctl: 20, atl: 20, acwr: 1 }]
    });
    const highLoad = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90, sleepQuality: 3 } },
        dailyTimeline: [{ date: day, load: 200, ctl: 20, atl: 40, acwr: 2 }]
    });
    assert.equal(calculateReadiness(day, lowLoad).score, calculateReadiness(day, highLoad).score);
});

test('illness overrides a favourable readiness score in the recommendation', () => {
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 95, sleepQuality: 5, motivation: 5 } },
        healthLogs: { [day]: { status: 'sick', diagnosis: 'Erkältung' } }
    });
    const recommendation = buildTrainingRecommendation(day, [{ date: day, name: 'Intervalle', duration: 60 }], source);
    assert.equal(recommendation.decision, 'health-review');
    assert.match(recommendation.title, /Gesundheit/);
});

test('a marked adverse physiological deviation is not averaged away by good sleep and wellness', () => {
    const source = makeState({
        dailyCheckins: {
            [day]: { garminHrv: 45, garminSleepScore: 95, sleepQuality: 5, motivation: 5, fatigue: 1, soreness: 1, stress: 1 }
        }
    });
    const recommendation = buildTrainingRecommendation(day, [{ date: day, name: 'Intervalle', duration: 60, category: 'interval' }], source);
    assert.equal(recommendation.decision, 'modify');
    assert.match(recommendation.title, /anpassen/);
});

test('insufficient data does not produce a false training clearance', () => {
    const source = makeState({ dailyCheckins: { [day]: { garminHrv: 60 } } });
    const recommendation = buildTrainingRecommendation(day, [{ date: day, name: 'Intervalle' }], source);
    assert.equal(recommendation.decision, 'insufficient-data');
    assert.match(recommendation.title, /nicht sicher beurteilbar/);
});

test('stale training-load status is not used as current-day context', () => {
    const staleDate = new Date(day + 'T12:00:00');
    staleDate.setDate(staleDate.getDate() - 3);
    const staleKey = staleDate.toISOString().slice(0, 10);
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90, sleepQuality: 4 } },
        dailyTimeline: [{ date: staleKey, load: 200, ctl: 20, atl: 50, tsb: -30, statusLabel: 'Hohe Ermüdung' }]
    });
    const recommendation = buildTrainingRecommendation(day, [{ date: day, name: 'Technik', duration: 45, category: 'tech' }], source);
    assert.doesNotMatch(recommendation.detail, /Belastungsmodell zeigt/);
});

test('planned target load is not equated with Garmin or KAJO load units', () => {
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90, sleepQuality: 4 } }
    });
    const recommendation = buildTrainingRecommendation(day, [{
        date: day, name: 'Intervalle', duration: 60, category: 'interval', targetTss: 100
    }], source);
    assert.doesNotMatch(recommendation.detail, /100|Garmin-Load|KAJO-Load/);
});

test('multiple planned sessions are explicitly considered in the daily recommendation', () => {
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90, sleepQuality: 4 } }
    });
    const planned = [
        { date: day, name: 'Morgens K1', duration: 60, time: '08:00' },
        { date: day, name: 'Abends Kraft', duration: 45, time: '18:00' }
    ];
    const recommendation = buildTrainingRecommendation(day, planned, source);
    assert.match(recommendation.detail, /zweite Einheit/);
    assert.match(recommendation.detail, /Morgens K1/);
    assert.match(recommendation.detail, /Abends Kraft/);
});


test('a planned lactate or strength test becomes the main daily load, not an invented training load', () => {
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90, sleepQuality: 4 } },
        plannedActivities: [
            { date: day, name: 'Laktattest', category: 'diagnostic-lactate', duration: null, targetTss: null },
            { date: day, name: 'K1 locker', category: 'ga', duration: 45 }
        ]
    });
    const recommendation = buildTrainingRecommendation(day, source.plannedActivities, source);
    assert.equal(recommendation.decision, 'assessment-day');
    assert.match(recommendation.title, /Leistungsdiagnostik/);
    assert.match(recommendation.detail, /Keine zusätzliche intensive/);
    assert.doesNotMatch(recommendation.detail, /Garmin-Load|geschätzte Belastung/);
});

test('the day before a planned diagnostic test receives a reduced-load recommendation', () => {
    const tomorrow = new Date(day + 'T12:00:00');
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90, sleepQuality: 4 } },
        plannedActivities: [
            { date: tomorrowKey, name: 'Krafttest', category: 'diagnostic-strength' },
            { date: day, name: 'Intervalle', category: 'interval', duration: 60 }
        ]
    });
    const recommendation = buildTrainingRecommendation(day, source.plannedActivities, source);
    assert.equal(recommendation.decision, 'assessment-preparation');
    assert.match(recommendation.title, /reduzieren/);
    assert.match(recommendation.detail, /schweres Krafttraining/);
});

test('illness still overrides a planned diagnostic test', () => {
    const source = makeState({
        healthLogs: { [day]: { status: 'sick' } },
        plannedActivities: [{ date: day, name: 'Laktattest', category: 'diagnostic-lactate' }]
    });
    const recommendation = buildTrainingRecommendation(day, source.plannedActivities, source);
    assert.equal(recommendation.decision, 'health-review');
});


test('dashboard recommendation is short, actionable and does not repeat readiness metrics', () => {
    const source = makeState({
        dailyCheckins: { [day]: { garminHrv: 60, garminSleepScore: 90, sleepQuality: 4 } }
    });
    const recommendation = buildTrainingRecommendation(day, [{
        date: day, name: 'K1 Intervalle', duration: 60, category: 'interval'
    }], source);
    assert.match(recommendation.detail, /K1 Intervalle/);
    assert.match(recommendation.detail, /wie geplant|reduzier|lockere Technik/);
    assert.doesNotMatch(recommendation.detail, /Readiness|HRV|Ruheherzfrequenz|Garmin-Load|ATL|CTL|TSB|Body Battery/);
    assert.ok(recommendation.detail.length < 260);
});


test('readiness converts supported seconds-based HRV to milliseconds before scoring', () => {
    const secondsHistory = Object.fromEntries(Object.entries(history).map(([date, record]) => [
        date,
        { ...record, garminHrv: record.garminHrv / 1000,
            measurementSources: { garminHrv: { source: 'garmin', metric: 'rmssd', unit: 's' } } }
    ]));
    const source = makeState({ dailyCheckins: {
        ...secondsHistory,
        [day]: { garminHrv: 0.075, garminSleepScore: 90,
            measurementSources: { garminHrv: { source: 'garmin', metric: 'rmssd', unit: 's' } } }
    }});
    const result = calculateReadiness(day, source);
    const hrv = result.objective.find(item => item.key === 'hrv');
    assert.ok(hrv);
    assert.equal(hrv.value, 75);
    assert.equal(hrv.baseline, 60);
});

test('readiness excludes unsupported HRV units rather than treating them as milliseconds', () => {
    const source = makeState({ dailyCheckins: {
        [day]: { garminHrv: 75, garminSleepScore: 90,
            measurementSources: { garminHrv: { source: 'garmin', metric: 'rmssd', unit: 'unknown-unit' } } }
    }});
    const result = calculateReadiness(day, source);
    assert.equal(result.objective.some(item => item.key === 'hrv'), false);
});
