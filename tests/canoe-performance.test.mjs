import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanoePerformanceSummary } from '../js/canoe-performance.js';

test('separates K1, C1 and C2 and keeps non-canoe sports out', () => {
    const result = buildCanoePerformanceSummary([
        { id: 1, date: '2026-01-01', type: 'Kayaking', duration: 60, distance: 12, raceFormat: 'classic' },
        { id: 2, date: '2026-01-02', type: 'C1', duration: 45, raceFormat: 'sprint' },
        { id: 3, date: '2026-01-03', type: 'C2', duration: 30 },
        { id: 4, date: '2026-01-04', type: 'Run', duration: 50 },
        { id: 5, date: '2026-01-05', type: 'PaddleErgo', duration: 40 }
    ]);

    assert.equal(result.activityCount, 3);
    assert.deepEqual(result.byDiscipline.map(row => row.activityCount), [1, 1, 1]);
    assert.equal(result.byDiscipline[0].durationMinutes, 60);
    assert.equal(result.byDiscipline[1].sprintCount, 1);
    assert.equal(result.byDiscipline[2].unspecifiedFormatCount, 1);
});

test('does not infer formats or compare sessions across different conditions', () => {
    const result = buildCanoePerformanceSummary([
        { date: '2026-02-01', type: 'Kayaking', raceFormat: 'sprint', avgSpeed: 12, routeId: 'A', waterConditions: { type: 'wildwater', level: 140, levelUnit: 'cm', discharge: 18 } },
        { date: '2026-02-02', type: 'Kayaking', raceFormat: 'sprint', avgSpeed: 13, routeId: 'A', waterConditions: { type: 'wildwater', level: 145, levelUnit: 'cm', discharge: 18 } },
        { date: '2026-02-03', type: 'Kayaking', avgSpeed: 14, routeId: 'A', waterConditions: { type: 'wildwater', level: 140, levelUnit: 'cm', discharge: 18 } }
    ]);

    assert.equal(result.comparableGroups.length, 3);
    assert.equal(result.dataQuality.activitiesWithUnspecifiedFormat, 1);
    assert.equal(result.comparableGroups.every(group => group.activityCount === 1), true);
});

test('applies inclusive date filters and preserves missing metrics', () => {
    const result = buildCanoePerformanceSummary([
        { date: '2026-03-01', type: 'C1', duration: 40 },
        { date: '2026-03-02', type: 'C1', duration: 50 },
        { date: '2026-03-03', type: 'C1', duration: 60 }
    ], { from: '2026-03-02', to: '2026-03-03' });

    assert.equal(result.activityCount, 2);
    assert.equal(result.byDiscipline[1].durationMinutes, 110);
    assert.equal(result.comparableGroups[0].averageSpeedKmh.count, 0);
    assert.equal(result.comparableGroups[0].averageSpeedKmh.mean, null);
});
