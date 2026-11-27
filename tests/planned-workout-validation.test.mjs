import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOptionalPlanInteger } from '../js/planned-workout-validation.js';

test('keeps empty optional values empty', () => {
    assert.equal(parseOptionalPlanInteger('', 'Dauer', { min: 1, max: 1440 }), null);
    assert.equal(parseOptionalPlanInteger('  ', 'Load'), null);
});

test('preserves explicit zero instead of replacing it with a default', () => {
    assert.equal(parseOptionalPlanInteger('0', 'Load'), 0);
});

test('accepts valid duration and load values', () => {
    assert.equal(parseOptionalPlanInteger('60', 'Dauer', { min: 1, max: 1440 }), 60);
    assert.equal(parseOptionalPlanInteger('70', 'Load'), 70);
});

test('rejects zero duration, negative values, decimals and out-of-range duration', () => {
    assert.throws(() => parseOptionalPlanInteger('0', 'Dauer', { min: 1, max: 1440 }), /Dauer/);
    assert.throws(() => parseOptionalPlanInteger('-1', 'Load'), /Load/);
    assert.throws(() => parseOptionalPlanInteger('12.5', 'Dauer', { min: 1, max: 1440 }), /Dauer/);
    assert.throws(() => parseOptionalPlanInteger('1441', 'Dauer', { min: 1, max: 1440 }), /Dauer/);
});
