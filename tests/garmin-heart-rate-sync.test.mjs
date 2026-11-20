import test from 'node:test';
import assert from 'node:assert/strict';
import { countValidHeartRateSamples, shouldSkipHeartRateRetry } from '../js/garmin-heart-rate-sync.js';

test('counts only paired, plausible heart-rate samples and timestamps', () => {
    assert.equal(countValidHeartRateSamples([120, null, 260, 135], [0, 1, 2, 3]), 2);
    assert.equal(countValidHeartRateSamples([120, 130], [0]), 0);
    assert.equal(countValidHeartRateSamples([120, 130], [-1, 2]), 1);
});

test('does not retry a FIT file without heart-rate data for 30 days', () => {
    const now = Date.parse('2026-11-20T08:00:00Z');
    assert.equal(shouldSkipHeartRateRetry({
        status: 'no_hr_data', checkedAt: '2026-11-19T08:00:00Z', parserVersion: 1
    }, now), true);
    assert.equal(shouldSkipHeartRateRetry({
        status: 'no_hr_data', checkedAt: '2026-10-01T08:00:00Z', parserVersion: 1
    }, now), false);
});

test('retries unknown, technical, expired, and older-parser statuses', () => {
    const now = Date.parse('2026-11-20T08:00:00Z');
    assert.equal(shouldSkipHeartRateRetry(null, now), false);
    assert.equal(shouldSkipHeartRateRetry({
        status: 'download_error', checkedAt: '2026-11-19T08:00:00Z', parserVersion: 1
    }, now), false);
    assert.equal(shouldSkipHeartRateRetry({
        status: 'no_hr_data', checkedAt: '2026-11-19T08:00:00Z', parserVersion: 0
    }, now), false);
});
