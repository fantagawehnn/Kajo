/**
 * Cloud persistence for complete Garmin activity telemetry.
 *
 * Records are immutable per user/activity. The database primary key and
 * ignoreDuplicates writes ensure a retry never replaces an existing record.
 */
const TABLE = 'garmin_activity_telemetry';
const PAGE_SIZE = 250;

function requireContext(supabase, userId) {
    if (!supabase) throw new Error('Supabase ist nicht verfügbar.');
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('Für die Garmin-Cloud-Telemetrie fehlt die Benutzer-ID.');
    }
    return userId.trim();
}

export function getGarminTelemetryActivityId(activity) {
    const rawId = activity?.sourceRefs?.garminActivityId
        ?? activity?.garminData?.activityId
        ?? activity?.id;
    const id = String(rawId ?? '').replace(/^garmin-/, '');
    return /^\\d+$/.test(id) ? id : null;
}

export function extractGarminTelemetryRecords(activities, telemetryStore = {}) {
    const records = new Map();
    const stored = telemetryStore && typeof telemetryStore === 'object' ? telemetryStore : {};

    for (const activity of Array.isArray(activities) ? activities : []) {
        const id = getGarminTelemetryActivityId(activity);
        if (!id) continue;
        const current = activity?.garminTelemetry && typeof activity.garminTelemetry === 'object'
            ? activity.garminTelemetry : {};
        const separated = stored[id] && typeof stored[id] === 'object' ? stored[id] : {};
        const telemetry = {
            ...current,
            ...(Object.keys(separated).length ? {
                metricSeries: {
                    ...(current.metricSeries || {}),
                    ...(separated.metricSeries || {})
                },
                metricSeriesTime: current.metricSeriesTime || separated.metricSeriesTime || undefined
            } : {})
        };
        if (Object.keys(telemetry).length) records.set(id, { garmin_activity_id: id, telemetry });
    }

    for (const [rawId, telemetry] of Object.entries(stored)) {
        const id = String(rawId).replace(/^garmin-/, '');
        if (!/^\\d+$/.test(id) || records.has(id) || !telemetry || typeof telemetry !== 'object') continue;
        if (Object.keys(telemetry).length) records.set(id, { garmin_activity_id: id, telemetry });
    }

    return Array.from(records.values());
}

async function fetchAllRows(supabase, userId) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase
            .from(TABLE)
            .select('garmin_activity_id, telemetry')
            .eq('user_id', userId)
            .order('garmin_activity_id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const page = Array.isArray(data) ? data : [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
    }
    return rows;
}

export async function syncGarminTelemetryToCloud(supabase, userId, candidateRecords = []) {
    const id = requireContext(supabase, userId);
    const existingRows = await fetchAllRows(supabase, id);
    const existingIds = new Set(existingRows.map(row => String(row.garmin_activity_id)));
    const uniqueCandidates = new Map();

    for (const record of Array.isArray(candidateRecords) ? candidateRecords : []) {
        const activityId = String(record?.garmin_activity_id ?? '').replace(/^garmin-/, '');
        if (!/^\\d+$/.test(activityId) || !record?.telemetry || typeof record.telemetry !== 'object') continue;
        if (!existingIds.has(activityId)) uniqueCandidates.set(activityId, {
            user_id: id,
            garmin_activity_id: activityId,
            telemetry: record.telemetry
        });
    }

    let uploaded = 0;
    // Small sequential writes avoid oversized requests and database statement timeouts.
    for (const row of uniqueCandidates.values()) {
        const { error } = await supabase
            .from(TABLE)
            .upsert(row, {
                onConflict: 'user_id,garmin_activity_id',
                ignoreDuplicates: true
            });
        if (error) throw error;
        uploaded += 1;
    }

    const cloudRows = await fetchAllRows(supabase, id);
    return {
        records: cloudRows.map(row => ({
            garmin_activity_id: String(row.garmin_activity_id),
            telemetry: row.telemetry
        })),
        uploaded,
        existing: existingRows.length,
        total: cloudRows.length
    };
}
