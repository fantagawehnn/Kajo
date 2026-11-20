import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshUnavailableGarminAnalysis } from '../js/garmin-analysis-cache.js';
import { loadGarminTelemetryMetadataForActivityIds } from '../js/garmin-cloud-telemetry.js';

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

test('loads only telemetry metadata and normalizes selected activity IDs', async () => {
    const calls = [];
    const supabase = {
        from(table) {
            assert.equal(table, 'garmin_activity_telemetry');
            return {
                select(fields) {
                    assert.equal(fields, 'garmin_activity_id, created_at');
                    return this;
                },
                eq(field, value) {
                    assert.equal(field, 'user_id');
                    assert.equal(value, 'user-1');
                    return this;
                },
                async in(field, ids) {
                    assert.equal(field, 'garmin_activity_id');
                    calls.push(ids);
                    return {
                        data: [{ garmin_activity_id: '123', created_at: '2026-11-20T10:00:00Z' }],
                        error: null
                    };
                }
            };
        }
    };
    const result = await loadGarminTelemetryMetadataForActivityIds(
        supabase, 'user-1', ['garmin-123', '123', 'invalid']
    );
    assert.deepEqual(calls, [['123']]);
    assert.deepEqual(result, [{
        garmin_activity_id: '123',
        created_at: '2026-11-20T10:00:00Z'
    }]);
});
