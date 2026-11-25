/**
 * Cloud storage for complete activity records.
 *
 * Activities are stored one row per user/activity so large FIT payloads do not
 * inflate the versioned user_data JSON document.
 */

const cloudActivityHashes = new Map();

async function hashActivityPayload(payload) {
    if (!globalThis.crypto?.subtle?.digest) return null;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function requireClient(client) {
    if (!client?.from) throw new Error('Supabase ist für die Aktivitätssynchronisierung nicht verfügbar.');
}

function cloudActivityQueryError(error, stage) {
    const wrapped = new Error(stage + ': ' + (error?.message || 'Unbekannter Datenbankfehler.'));
    wrapped.name = 'CloudActivityQueryError';
    wrapped.kajoStage = stage;
    wrapped.code = error?.code ?? null;
    wrapped.details = error?.details ?? null;
    wrapped.hint = error?.hint ?? null;
    wrapped.cause = error;
    return wrapped;
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

export function getActivityConflictLabel(activity) {
    if (!activity || typeof activity !== 'object') return 'Trainingseinheit';
    const date = getActivityDate(activity);
    const dateLabel = date
        ? new Date(date + 'T12:00:00').toLocaleDateString('de-DE')
        : 'Datum nicht verfügbar';
    const name = activity.name || activity.title || activity.sport || activity.type || 'Trainingseinheit';
    return name + ' · ' + dateLabel;
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
    const baseline = cloudActivityHashes.get(userId) || new Map();
    const changedRows = [];
    const nextHashes = new Map();
    for (const row of rows) {
        const hash = await hashActivityPayload(row.payload);
        if (hash) nextHashes.set(row.record_id, hash);
        if (!hash || baseline.get(row.record_id) !== hash) changedRows.push(row);
    }
    const batches = splitIntoBatches(changedRows);
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

    if (nextHashes.size) {
        for (const [id, hash] of nextHashes) baseline.set(id, hash);
        cloudActivityHashes.set(userId, baseline);
    }
    return { uploaded, total: rows.length, changed: changedRows.length, batches: batches.length };
}

/**
 * Lädt alle Aktivitätszeilen vollständig, aber mit begrenzter Parallelität.
 * Der exakte Count verhindert, dass bei parallelen Seiten ein unvollständiger
 * Datenstand unbemerkt in den konfliktbewussten Abgleich gelangt.
 */
export async function fetchCloudActivities(client, userId, options = {}) {
    requireClient(client);
    if (!userId) throw new Error('Für den Cloud-Abruf fehlt die Benutzer-ID.');

    // Activity payloads can be large (including long interval/workout arrays).
    // Keep each PostgREST JSON aggregation small enough to avoid statement timeouts.
    const pageSize = Math.max(1, Math.floor(Number(options.pageSize) || 100));
    const concurrency = Math.min(2, Math.max(1, Math.floor(Number(options.concurrency) || 2)));
    const { count, error: countError } = await client
        .from('activities')
        .select('record_id', { count: 'exact', head: true })
        .eq('user_id', userId);
    if (countError) throw cloudActivityQueryError(countError, 'Cloud-Aktivitäten: Anzahl der Datensätze (COUNT)');

    // Supabase liefert bei einem nicht verfügbaren Count ggf. null. In diesem
    // Fall bleibt der bewährte sequenzielle Abruf als sicherer Fallback erhalten.
    const records = [];
    if (Number.isFinite(count)) {
        const offsets = [];
        for (let offset = 0; offset < count; offset += pageSize) offsets.push(offset);
        for (let index = 0; index < offsets.length; index += concurrency) {
            const batch = offsets.slice(index, index + concurrency);
            const pages = await Promise.all(batch.map(async offset => {
                const { data, error } = await client
                    .from('activities')
                    .select('record_id,payload')
                    .eq('user_id', userId)
                    .order('record_id', { ascending: true })
                    .range(offset, offset + pageSize - 1);
                if (error) {
                    throw cloudActivityQueryError(
                        error,
                        'Cloud-Aktivitäten: Datensatzseite ab Offset ' + offset
                    );
                }
                return Array.isArray(data) ? data : [];
            }));
            for (const page of pages) records.push(...page);
        }
        if (records.length !== count) {
            throw new Error('Der Cloud-Aktivitätsabruf war während der parallelen Seitenabfrage nicht konsistent. Es wurde kein unvollständiger Datenstand übernommen; bitte erneut synchronisieren.');
        }
    } else {
        for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await client
                .from('activities')
                .select('record_id,payload')
                .eq('user_id', userId)
                .order('record_id', { ascending: true })
                .range(offset, offset + pageSize - 1);
            if (error) {
                throw cloudActivityQueryError(
                    error,
                    'Cloud-Aktivitäten: sequenzielle Datensatzseite ab Offset ' + offset
                );
            }
            const page = Array.isArray(data) ? data : [];
            records.push(...page);
            if (page.length < pageSize) break;
        }
    }

    const hashes = new Map();
    const computedHashes = await Promise.all(records.map(row => hashActivityPayload(row.payload)));
    records.forEach((row, index) => {
        if (computedHashes[index]) hashes.set(String(row.record_id), computedHashes[index]);
    });
    if (hashes.size || records.length === 0) cloudActivityHashes.set(userId, hashes);
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
