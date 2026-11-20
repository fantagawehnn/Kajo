import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshUnavailableGarminAnalysis } from '../js/garmin-analysis-cache.js';

test('refreshes an unavailable cache when cloud telemetry was created later', () => {
    const cache = { status: 'unavailable', checkedAt: 1_000, retryAfter: 86_401_000 };
    assert.equal(shouldRefreshUnavailableGarminAnalysis(cache, new Date(2_000).toISOString()), true);
});

test('keeps an unavailable cache when cloud telemetry predates its check', () => {
    const cache = { status: 'unavailable', checkedAt: 2_000, retryAfter: 86_402_000 };
    assert.equal(shouldRefreshUnavailableGarminAnalysis(cache, new Date(1_000).toISOString()), false);
});

test('supports legacy caches without checkedAt by deriving the check time from retryAfter', () => {
    const cache = { status: 'unavailable', retryAfter: 86_401_000 };
    assert.equal(shouldRefreshUnavailableGarminAnalysis(cache, new Date(2_000).toISOString()), true);
    assert.equal(shouldRefreshUnavailableGarminAnalysis(cache, new Date(500).toISOString()), false);
});

test('does not refresh successful caches or invalid cloud timestamps', () => {
    assert.equal(shouldRefreshUnavailableGarminAnalysis({ status: 'available', checkedAt: 1_000 }, new Date(2_000).toISOString()), false);
    assert.equal(shouldRefreshUnavailableGarminAnalysis({ status: 'unavailable', checkedAt: 1_000 }, 'not-a-date'), false);
    assert.equal(shouldRefreshUnavailableGarminAnalysis(null, new Date(2_000).toISOString()), false);
});
