/**
 * Cloud storage for complete activity records.
 *
 * Activities are stored one row per user/activity so large FIT payloads do not
 * inflate the versioned user_data JSON document.
 */

function requireClient(client) {
    if (!client?.from) throw new Error('Supabase ist für die Aktivitätssynchronisierung nicht verfügbar.');
}

function getActivityRecordId(activity) {
    const value = activity?.id
        ?? activity?.activityId
        ?? activity?.sourceRefs?.garminActivityId
        ?? activity?.garminData?.activityId;
    if (value == null || String(value).trim() === '') {
        throw new Error('Eine Aktivität besitzt keine stabile ID. Der Cloud-Transfer wurde abgebrochen, damit kein Datensatz ausgelassen wird.');
    }
    return String(value);
}

function getActivityDate(activity) {
    const candidates = [
        activity?.date,
        activity?.startDate,
        activity?.startTimeLocal,
        activity?.start_time,
        activity?.startTime,
        activity?.start_date
    ];
    for (const value of candidates) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const match = value.match(/^\d{4}-\d{2}-\d{2}/);
        if (match) return match[0];
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }
    return null;
}

export function prepareCloudActivityRows(userId, activities) {
    if (!userId) throw new Error('Für die Aktivitätssynchronisierung fehlt die Benutzer-ID.');
    if (!Array.isArray(activities)) throw new Error('Aktivitäten müssen als Liste übergeben werden.');

    const seen = new Set();
    return activities.map(activity => {
        if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
            throw new Error('Eine Aktivität besitzt kein gültiges Datenobjekt. Der Cloud-Transfer wurde abgebrochen.');
        }
        const recordId = getActivityRecordId(activity);
        if (seen.has(recordId)) {
            throw new Error('Die Aktivitäts-ID "' + recordId + '" kommt mehrfach vor. Der Cloud-Transfer wurde abgebrochen.');
        }
        seen.add(recordId);
        return {
            user_id: userId,
            record_id: recordId,
            activity_date: getActivityDate(activity),
            payload: activity
        };
    });
}

function splitIntoBatches(rows, maxBytes = 750000) {
    const batches = [];
    let batch = [];
    let bytes = 2;
    for (const row of rows) {
        const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length + 1;
        if (batch.length && bytes + rowBytes > maxBytes) {
            batches.push(batch);
            batch = [];
            bytes = 2;
        }
        batch.push(row);
        bytes += rowBytes;
    }
    if (batch.length) batches.push(batch);
    return batches;
}

/**
 * Upserts sequentially and verifies every batch through returned record IDs.
 * Existing rows are never deleted. Re-running the transfer is safe.
 */
export async function syncCloudActivities(client, userId, activities) {
    requireClient(client);
    const rows = prepareCloudActivityRows(userId, activities);
    const batches = splitIntoBatches(rows);
    let uploaded = 0;

    for (const batch of batches) {
        const expected = new Set(batch.map(row => row.record_id));
        const { data, error } = await client
            .from('activities')
            .upsert(batch, { onConflict: 'user_id,record_id' })
            .select('record_id');
        if (error) throw error;

        const returned = new Set((data || []).map(row => String(row.record_id)));
        const missing = Array.from(expected).filter(id => !returned.has(id));
        if (missing.length) {
            throw new Error('Cloud-Readback unvollständig: ' + missing.length + ' Aktivitäten fehlen in einem übertragenen Paket.');
        }
        uploaded += returned.size;
    }

    return { uploaded, total: rows.length, batches: batches.length };
}

/** Loads all activity rows in bounded pages; RLS restricts results to the user. */
export async function fetchCloudActivities(client, userId) {
    requireClient(client);
    if (!userId) throw new Error('Für den Cloud-Abruf fehlt die Benutzer-ID.');

    const pageSize = 500;
    const records = [];
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client
            .from('activities')
            .select('record_id,payload')
            .eq('user_id', userId)
            .order('record_id', { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = Array.isArray(data) ? data : [];
        records.push(...page);
        if (page.length < pageSize) break;
    }
    return records;
}

/**
 * Merges split cloud rows into the legacy snapshot collection.
 * Table rows override same-ID snapshot entries; unmatched legacy entries remain
 * available until a complete upload has been confirmed.
 */
export function mergeCloudActivities(snapshotActivities, cloudRows, allowedRecordIds = null) {
    const merged = new Map();
    for (const activity of Array.isArray(snapshotActivities) ? snapshotActivities : []) {
        if (activity && typeof activity === 'object') merged.set(getActivityRecordId(activity), activity);
    }
    const allowed = Array.isArray(allowedRecordIds) ? new Set(allowedRecordIds.map(String)) : null;
    for (const row of Array.isArray(cloudRows) ? cloudRows : []) {
        if (!row?.record_id || !row?.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) continue;
        if (allowed && !allowed.has(String(row.record_id))) continue;
        merged.set(String(row.record_id), row.payload);
    }
    return Array.from(merged.values());
}

export function getCloudActivityIds(userId, activities) {
    return prepareCloudActivityRows(userId, activities).map(row => row.record_id);
}
