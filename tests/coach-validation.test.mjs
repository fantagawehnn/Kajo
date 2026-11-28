import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidWeekStartDate } from '../js/coach-validation.js';

test('accepts valid ISO Mondays as weekly plan starts', () => {
    assert.equal(isValidWeekStartDate('2027-01-04'), true);
    assert.equal(isValidWeekStartDate('2026-11-23'), true);
});

test('rejects malformed, impossible and non-Monday dates', () => {
    assert.equal(isValidWeekStartDate('2027-01-05'), false);
    assert.equal(isValidWeekStartDate('2027-02-30'), false);
    assert.equal(isValidWeekStartDate('2027-1-04'), false);
    assert.equal(isValidWeekStartDate(''), false);
});
