const UNAVAILABLE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A negative analysis cache must be reconsidered when its cloud telemetry was
 * uploaded after the cache was created. Older caches have no checkedAt field;
 * their original timestamp is reconstructed from the 24-hour retry window.
 */
export function shouldRefreshUnavailableGarminAnalysis(cache, cloudTelemetryCreatedAt) {
    if (cache?.status !== 'unavailable') return false;
    const cloudCreatedAt = Date.parse(cloudTelemetryCreatedAt || '');
    if (!Number.isFinite(cloudCreatedAt)) return false;

    const explicitCheckedAt = Number(cache.checkedAt);
    const inferredCheckedAt = Number(cache.retryAfter) - UNAVAILABLE_RETRY_WINDOW_MS;
    const checkedAt = Number.isFinite(explicitCheckedAt) && explicitCheckedAt > 0
        ? explicitCheckedAt
        : Number.isFinite(inferredCheckedAt) && inferredCheckedAt > 0
            ? inferredCheckedAt : 0;

    return cloudCreatedAt > checkedAt;
}
