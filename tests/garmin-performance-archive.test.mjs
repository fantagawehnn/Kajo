import test from 'node:test';
import assert from 'node:assert/strict';
import { extractGarminVo2MaxRecords, summarizeGarminVo2MaxRecords } from '../js/garmin-performance-archive.js';
const fixture = [
    { calendarDate: '2026-01-01', vo2MaxValue: 54.2, maxMet: 17.5, sport: 'RUNNING', subSport: 'GENERIC', updateTimestamp: '2026-01-01T08:00:00Z' },
    { calendarDate: '2026-01-02', vo2MaxValue: 52.8, maxMet: 16.9, sport: 'CYCLING', subSport: 'ROAD', updateTimestamp: '2026-01-02T08:00:00Z' },
    { calendarDate: '2026-01-02', vo2MaxValue: 52.8, maxMet: 16.9, sport: 'CYCLING', subSport: 'ROAD', updateTimestamp: '2026-01-02T09:00:00Z' },
    { calendarDate: '2026-02-30', vo2MaxValue: 55, sport: 'RUNNING' },
    { calendarDate: '2026-01-03', vo2MaxValue: 0, sport: 'RUNNING' },
    { calendarDate: '2026-01-04', vo2MaxValue: 101, sport: 'RUNNING' },
    { calendarDate: '2026-01-05', vo2MaxValue: '56', sport: 'RUNNING' },
    { calendarDate: '2026-01-06', maxMet: 18, sport: 'RUNNING' }
];
test('extracts only explicit numeric Garmin VO2max records from MetricsMaxMetData files', () => {
    const result = extractGarminVo2MaxRecords(fixture, 'DI_CONNECT/DI-Connect-Metrics/MetricsMaxMetData_20260101.json');
    assert.equal(result.length, 3);
    assert.deepEqual(result.map(item => [item.date, item.value, item.sport]), [
        ['2026-01-01', 54.2, 'RUNNING'], ['2026-01-02', 52.8, 'CYCLING'], ['2026-01-04', 101, 'RUNNING']
    ]);
    assert.equal(result[1].unit, 'ml/kg/min');
    assert.equal(result[1].source, 'garmin-export-metrics-max-met');
    // RUNNING is retained as Garmin's source activity-profile label only;
    // it must not be converted into a claim about the athlete's actual sport.
    assert.equal(result[0].sport, 'RUNNING');
    assert.equal(result[0].subSport, 'GENERIC');
});
test('does not interpret MET or fitness-age fields as VO2max', () => {
    assert.deepEqual(extractGarminVo2MaxRecords([
        { calendarDate: '2026-01-01', maxMet: 18, fitnessAge: '22' }
    ], 'MetricsMaxMetData.json'), []);
});
test('does not parse similarly named fields from other Garmin files', () => {
    assert.deepEqual(extractGarminVo2MaxRecords(fixture, 'fitnessAgeData.json'), []);
});
test('summarizes available records without inventing missing sport labels', () => {
    assert.deepEqual(summarizeGarminVo2MaxRecords([
        { date: '2026-01-01', value: 54.2, sport: 'RUNNING' },
        { date: '2026-01-02', value: 52.8, sport: 'CYCLING' },
        { date: '2026-01-03', value: 53, sport: null }
    ]), {
        count: 3, dateFrom: '2026-01-01', dateTo: '2026-01-03',
        sports: { RUNNING: 1, CYCLING: 1, 'nicht zugeordnet': 1 }
    });
});

test('keeps distinct same-day measurements instead of silently choosing one', () => {
    const result = extractGarminVo2MaxRecords([
        { calendarDate: '2026-03-01', vo2MaxValue: 51, sport: 'RUNNING' },
        { calendarDate: '2026-03-01', vo2MaxValue: 52, sport: 'RUNNING' }
    ], 'MetricsMaxMetData_20260301.json');
    assert.deepEqual(result.map(item => item.value), [51, 52]);
});
