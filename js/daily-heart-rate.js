/**
 * Pure helpers for the Garmin Connect daily heart-rate record.
 * The stored heartRateValues rows are descriptor-indexed arrays; no samples
 * are interpolated or generated here.
 */
export function extractGarminDailyHeartRateSamples(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
    const descriptors = Array.isArray(payload.heartRateValueDescriptors)
        ? payload.heartRateValueDescriptors : [];
    const timestampIndex = descriptors.find(item => /^(timestamp|time)$/i.test(String(item?.key || '')))?.index;
    const heartRateIndex = descriptors.find(item => /^(heartrate|heart_rate|hr|pulse)$/i.test(String(item?.key || '')))?.index;
    if (!Number.isInteger(timestampIndex) || timestampIndex < 0
        || !Number.isInteger(heartRateIndex) || heartRateIndex < 0
        || !Array.isArray(payload.heartRateValues)) return [];

    const samples = [];
    for (const row of payload.heartRateValues) {
        if (!Array.isArray(row)) continue;
        const rawTimestamp = Number(row[timestampIndex]);
        const heartRate = Number(row[heartRateIndex]);
        if (!Number.isFinite(rawTimestamp) || !Number.isFinite(heartRate)
            || heartRate < 30 || heartRate > 250) continue;
        // Garmin dailyHeartRate currently stores Unix milliseconds. Seconds
        // are accepted as a defensive compatibility path for older records.
        const timestampMs = rawTimestamp >= 1e12 ? rawTimestamp
            : rawTimestamp >= 1e9 ? rawTimestamp * 1000 : NaN;
        if (!Number.isFinite(timestampMs)) continue;
        samples.push({ timestampMs, hr: heartRate });
    }
    return samples;
}

export function selectGarminDailyHeartRateWindow(records, startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
    const byTimestamp = new Map();
    for (const record of Array.isArray(records) ? records : []) {
        const samples = extractGarminDailyHeartRateSamples(record?.payload);
        for (const sample of samples) {
            if (sample.timestampMs < startMs || sample.timestampMs > endMs) continue;
            byTimestamp.set(sample.timestampMs, sample.hr);
        }
    }
    return [...byTimestamp.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([timestampMs, hr]) => ({ timestampMs, hr }));
}
