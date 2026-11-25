const DAY_MS = 24 * 60 * 60 * 1000;

export function parseGarminActivitySeenMap(rawValue) {
    if (typeof rawValue !== 'string' || !rawValue) return {};
    try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(
            Object.entries(parsed).filter(([id, updatedAt]) =>
                id && typeof updatedAt === 'string' && Number.isFinite(Date.parse(updatedAt))
            )
        );
    } catch {
        return {};
    }
}

export function getGarminActivityRowsNeedingPayload(metadataRows, seenAtById, locallyAvailableIds = new Set()) {
    return metadataRows.filter(row => {
        const id = String(row?.garmin_activity_id ?? '');
        const updatedAt = row?.updated_at;
        return id && typeof updatedAt === 'string' &&
            (seenAtById[id] !== updatedAt || !locallyAvailableIds.has(id));
    });
}

export function mergeGarminActivitySeenMap(seenAtById, metadataRows, latestUpdatedAt) {
    const latestMs = Date.parse(String(latestUpdatedAt || ''));
    const retentionStart = Number.isFinite(latestMs) ? latestMs - DAY_MS : 0;
    const next = {};

    for (const [id, updatedAt] of Object.entries(seenAtById)) {
        const timestamp = Date.parse(updatedAt);
        if (Number.isFinite(timestamp) && timestamp >= retentionStart) next[id] = updatedAt;
    }

    for (const row of metadataRows) {
        const id = String(row?.garmin_activity_id ?? '');
        const updatedAt = row?.updated_at;
        const timestamp = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN;
        if (id && Number.isFinite(timestamp) && timestamp >= retentionStart) next[id] = updatedAt;
    }

    return next;
}
