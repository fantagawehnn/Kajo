/**
 * Merge local and cloud athlete profiles without discarding information.
 * Non-empty local values win on true field conflicts; missing local values
 * are filled from the cloud copy.
 */
function hasProfileValue(value) {
    return value !== undefined && value !== null
        && !(typeof value === 'string' && value.trim() === '');
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
    }
    return value;
}

function sameValue(left, right) {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function mergeProfileSnapshots(localProfile, cloudProfile) {
    const local = localProfile && typeof localProfile === 'object' && !Array.isArray(localProfile) ? localProfile : {};
    const cloud = cloudProfile && typeof cloudProfile === 'object' && !Array.isArray(cloudProfile) ? cloudProfile : {};
    const merged = { ...cloud };
    const conflicts = [];

    for (const [key, value] of Object.entries(local)) {
        if (!hasProfileValue(value)) continue;
        if (hasProfileValue(cloud[key]) && !sameValue(value, cloud[key])) conflicts.push(key);
        merged[key] = value;
    }

    return {
        profile: merged,
        conflicts,
        cloudNeedsUpdate: !sameValue(merged, cloud)
    };
}
