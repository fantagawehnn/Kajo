import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannedStrengthExercise, normalizePlannedStrengthExercises } from '../js/planned-strength.js';

test('creates a planned strength exercise with optional target weight', () => {
    assert.deepEqual(createPlannedStrengthExercise({ name: ' Kniebeugen ', sets: '4', reps: '6', weight: '80.5' }), {
        name: 'Kniebeugen', sets: 4, reps: 6, weight: 80.5
    });
    assert.deepEqual(createPlannedStrengthExercise({ name: 'Plank', sets: 3, reps: 30, weight: '' }), {
        name: 'Plank', sets: 3, reps: 30, weight: null
    });
});

test('rejects incomplete or out-of-range exercise targets', () => {
    assert.throws(() => createPlannedStrengthExercise({ name: '', sets: 3, reps: 8 }), /Übungsnamen/);
    assert.throws(() => createPlannedStrengthExercise({ name: 'Kniebeugen', sets: 0, reps: 8 }), /Sätze/);
    assert.throws(() => createPlannedStrengthExercise({ name: 'Kniebeugen', sets: 3, reps: 101 }), /Wiederholungen/);
    assert.throws(() => createPlannedStrengthExercise({ name: 'Kniebeugen', sets: 3, reps: 8, weight: -1 }), /Zielgewicht/);
});

test('normalizes stored exercises and ignores malformed legacy entries', () => {
    assert.deepEqual(normalizePlannedStrengthExercises([
        { name: 'Bankdrücken', sets: 3, reps: 10, weight: 50 },
        { name: '', sets: 3, reps: 10 },
        { name: 'Klimmzüge', sets: 4, reps: 6 }
    ]), [
        { name: 'Bankdrücken', sets: 3, reps: 10, weight: 50 },
        { name: 'Klimmzüge', sets: 4, reps: 6, weight: null }
    ]);
});
