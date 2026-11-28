import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCsvDurationMinutes } from '../js/import-normalizers.js';

test('converts short CSV activity durations from seconds to minutes', () => {
    assert.equal(normalizeCsvDurationMinutes(600), 10);
    assert.equal(normalizeCsvDurationMinutes(1800), 30);
});

test('rounds fractional minutes and rejects missing or invalid durations', () => {
    assert.equal(normalizeCsvDurationMinutes(90), 2);
    assert.equal(normalizeCsvDurationMinutes(0), null);
    assert.equal(normalizeCsvDurationMinutes(-60), null);
    assert.equal(normalizeCsvDurationMinutes(''), null);
    assert.equal(normalizeCsvDurationMinutes('not-a-duration'), null);
});
