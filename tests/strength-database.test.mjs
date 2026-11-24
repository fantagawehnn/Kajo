import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStrengthRecords, groupStrengthRecords } from '../js/strength-database.js';

test('extracts every valid set from completed weight-training activities', () => {
    const records = extractStrengthRecords([{
        id: 'a1', type: 'WeightTraining', date: '2026-11-20', name: 'Gym',
        exercises: [{ name: 'Kniebeugen', sets: [{ reps: 8, weight: 60 }, { reps: 6, weight: 70 }] }]
    }]);
    assert.equal(records.length, 2);
    assert.equal(records[0].weight, 70);
    assert.equal(records[1].reps, 8);
    assert.equal(records[0].source, 'activity');
});

test('ignores planned sessions, other sports and invalid sets', () => {
    const records = extractStrengthRecords([
        { id: 'planned', type: 'WeightTraining', planned: true, date: '2026-11-20', exercises: [{ name: 'Bench', sets: [{ reps: 8, weight: 50 }] }] },
        { id: 'run', type: 'Run', date: '2026-11-20', exercises: [{ name: 'Bench', sets: [{ reps: 8, weight: 50 }] }] },
        { id: 'bad', type: 'WeightTraining', date: '2026-11-20', exercises: [{ name: 'Bench', sets: [{ reps: 0, weight: 50 }, { reps: 8, weight: '' }] }] }
    ]);
    assert.equal(records.length, 0);
});

test('groups exercise names case-insensitively and calculates the highest weight', () => {
    const records = extractStrengthRecords([
        { id: 'a', type: 'WeightTraining', date: '2026-11-19', exercises: [{ name: 'Bankdrücken', sets: [{ reps: 8, weight: 50 }] }] },
        { id: 'b', type: 'WeightTraining', date: '2026-11-20', exercises: [{ name: 'bankdrücken', sets: [{ reps: 5, weight: 60 }] }] }
    ]);
    const groups = groupStrengthRecords(records);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].entries.length, 2);
    assert.equal(groups[0].best.weight, 60);
});

test('keeps historical manually entered PBs visible', () => {
    const records = extractStrengthRecords([], [{ id: 'old', exercise: 'Kreuzheben', date: '2025-01-01', weight: 90, reps: 3 }]);
    assert.equal(records.length, 1);
    assert.equal(records[0].source, 'legacy');
});
