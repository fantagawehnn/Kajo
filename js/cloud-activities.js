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
    let deletionRows = [];
    try {
        for (let offset = 0; ; offset += 500) {
            const { data, error } = await client.from('activity_deletions')
                .select('record_id,garmin_activity_id')
                .eq('user_id', userId)
                .order('record_id', { ascending: true })
                .range(offset, offset + 499);
            if (error) {
                // A missing/unavailable tombstone table is not an empty deletion
                // history. Fail closed so stale activities cannot be uploaded.
                throw cloudActivityQueryError(error, 'Cloud-Aktivitäten: Löschkennzeichnungen prüfen');
            }
            deletionRows.push(...(data || []));
            if (!data || data.length < 500) break;
        }
    } catch (error) {
        throw cloudActivityQueryError(error, 'Cloud-Aktivitäten: Löschkennzeichnungen prüfen');
    }
    const deletedRecordIds = new Set(deletionRows.map(row => String(row.record_id)));
    const deletedGarminIds = new Set(deletionRows.map(row => String(row.garmin_activity_id || '')).filter(Boolean));
    const activeRows = rows.filter(row => !deletedRecordIds.has(row.record_id)
        && !deletedGarminIds.has(String(row.record_id).replace(/^garmin-/, '')));
    const baseline = cloudActivityHashes.get(userId) || new Map();
    const changedRows = [];
    const nextHashes = new Map();
    for (const row of activeRows) {
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
    return { uploaded, total: rows.length, active: activeRows.length, skippedDeleted: rows.length - activeRows.length, changed: changedRows.length, batches: batches.length };
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
    // Use small, sequential keyset pages: OFFSET becomes increasingly expensive
    // for large accounts and can time out on later pages.
    const requestedPageSize = Math.floor(Number(options.pageSize) || 25);
    const pageSize = Math.min(50, Math.max(1, requestedPageSize));
    const { count, error: countError } = await client
        .from('activities')
        .select('record_id', { count: 'exact', head: true })
        .eq('user_id', userId);
    if (countError) throw cloudActivityQueryError(countError, 'Cloud-Aktivitäten: Anzahl der Datensätze (COUNT)');

    const records = [];
    if (Number.isFinite(count)) {
        let lastRecordId = null;
        while (records.length < count) {
            let query = client
                .from('activities')
                .select('record_id,payload,updated_at')
                .eq('user_id', userId);
            if (lastRecordId !== null) query = query.gt('record_id', lastRecordId);
            const { data, error } = await query
                .order('record_id', { ascending: true })
                .limit(pageSize);
            if (error) {
                throw cloudActivityQueryError(
                    error,
                    'Cloud-Aktivitäten: Datensatzseite nach record_id ' + (lastRecordId ?? '(Anfang)')
                );
            }
            const page = Array.isArray(data) ? data : [];
            if (page.length === 0) break;
            records.push(...page);
            lastRecordId = String(page[page.length - 1].record_id);
        }
        if (records.length !== count) {
            throw new Error('Der Cloud-Aktivitätsabruf war während der schlüsselbasierten Seitenabfrage nicht konsistent. Es wurde kein unvollständiger Datenstand übernommen; bitte erneut synchronisieren.');
        }
    } else {
        let lastRecordId = null;
        for (;;) {
            let query = client
                .from('activities')
                .select('record_id,payload,updated_at')
                .eq('user_id', userId);
            if (lastRecordId !== null) query = query.gt('record_id', lastRecordId);
            const { data, error } = await query
                .order('record_id', { ascending: true })
                .limit(pageSize);
            if (error) {
                throw cloudActivityQueryError(
                    error,
                    'Cloud-Aktivitäten: sequenzielle Datensatzseite nach record_id ' + (lastRecordId ?? '(Anfang)')
                );
            }
            const page = Array.isArray(data) ? data : [];
            if (page.length === 0) break;
            records.push(...page);
            lastRecordId = String(page[page.length - 1].record_id);
            if (page.length < pageSize) break;
        }
    }

    const hashes = new Map();
    const computedHashes = await Promise.all(records.map(row => hashActivityPayload(row.payload)));
    records.forEach((row, index) => {
        if (computedHashes[index]) hashes.set(String(row.record_id), computedHashes[index]);
    });
    if (hashes.size || records.length === 0) cloudActivityHashes.set(userId, hashes);
    const updatedAtValues = records.map(row => row?.updated_at).filter(value => typeof value === 'string');
    const syncCursor = updatedAtValues.sort().at(-1) || null;
    Object.defineProperty(records, 'syncCursor', { value: syncCursor, enumerable: false });
    return records;
}

/**
 * Liefert den neuesten Änderungszeitpunkt, ohne Aktivitäts-Payloads zu laden.
 * Diese kleine Abfrage erkennt auch Änderungen, die nur in der Aktivitäten-
 * Tabelle und nicht im versionierten user_data-Snapshot stattfinden.
 */
export async function getCloudActivityWatermark(client, userId) {
    requireClient(client);
    if (!userId) throw new Error('Für den Cloud-Aktivitätsstand fehlt die Benutzer-ID.');
    const { data, error } = await client
        .from('activities')
        .select('updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw cloudActivityQueryError(error, 'Cloud-Aktivitäten: Änderungszeitpunkt prüfen');
    return data?.updated_at || null;
}

/**
 * Lädt nur seit einem bestätigten Zeitstempel geänderte Aktivitäts-Payloads.
 * Ein Zeitfenster von 60 Sekunden wird absichtlich überlappt: Dadurch werden
 * auch Transaktionen erfasst, deren Commit erst nach dem vorherigen Abruf
 * sichtbar wurde. Doppelte Zeilen sind durch record_id sicher zusammenführbar.
 */
export async function fetchCloudActivityDelta(client, userId, since, options = {}) {
    requireClient(client);
    if (!userId) throw new Error('Für den Cloud-Aktivitätsabruf fehlt die Benutzer-ID.');
    const sinceMs = Date.parse(since);
    if (!Number.isFinite(sinceMs)) throw new Error('Für den Delta-Abruf fehlt ein gültiger Synchronisierungszeitpunkt.');

    const watermark = await getCloudActivityWatermark(client, userId);
    if (!watermark) return { rows: [], cursor: since };
    const watermarkMs = Date.parse(watermark);
    if (!Number.isFinite(watermarkMs)) throw new Error('Die Cloud hat einen ungültigen Aktivitätszeitpunkt geliefert.');

    const overlapStart = new Date(Math.max(0, sinceMs - 60000)).toISOString();
    const requestedPageSize = Math.floor(Number(options.pageSize) || 50);
    const pageSize = Math.min(100, Math.max(1, requestedPageSize));
    const rows = [];
    let offset = 0;

    for (;;) {
        const { data, error } = await client
            .from('activities')
            .select('record_id,payload,updated_at')
            .eq('user_id', userId)
            .gte('updated_at', overlapStart)
            .lte('updated_at', watermark)
            .order('updated_at', { ascending: true })
            .order('record_id', { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error) throw cloudActivityQueryError(error, 'Cloud-Aktivitäten: Delta-Seite ab ' + overlapStart);
        const page = Array.isArray(data) ? data : [];
        rows.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
    }

    return {
        rows,
        // Ein später sichtbarer, aber früher gestarteter Commit darf den
        // bestätigten Cursor nicht rückwärts bewegen.
        cursor: watermarkMs > sinceMs ? watermark : since
    };
}

/**
 * Baut den vollständigen bekannten Cloud-Aktivitätsstand aus dem zuletzt
 * bestätigten Basis-Snapshot und den neu geladenen Delta-Zeilen auf.
 */
export function mergeCloudActivityRows(userId, baselineActivities, deltaRows) {
    const rows = new Map();
    for (const row of prepareCloudActivityRows(userId, Array.isArray(baselineActivities) ? baselineActivities : [])) {
        rows.set(row.record_id, row);
    }
    for (const row of Array.isArray(deltaRows) ? deltaRows : []) {
        if (!row?.record_id) continue;
        if (row.deleted_at) {
            rows.set(String(row.record_id), { ...row, payload: null });
            continue;
        }
        if (!row?.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) continue;
        rows.set(String(row.record_id), row);
    }
    return Array.from(rows.values());
}

/**
 * Merges split cloud rows into the legacy snapshot collection.
 * Table rows override same-ID snapshot entries; unmatched legacy entries remain
 * available until a complete upload has been confirmed.
 */
export function mergeCloudActivities(snapshotActivities, cloudRows, allowedRecordIds = null) {
    const merged = new Map();
    const rows = Array.isArray(cloudRows) ? cloudRows : [];
    const deleted = new Set(rows.filter(row => row?.deleted_at).map(row => String(row.record_id)));
    for (const activity of Array.isArray(snapshotActivities) ? snapshotActivities : []) {
        if (activity && typeof activity === 'object') {
            const id = getActivityRecordId(activity);
            if (!deleted.has(id)) merged.set(id, activity);
        }
    }
    const allowed = Array.isArray(allowedRecordIds) ? new Set(allowedRecordIds.map(String)) : null;
    for (const row of rows) {
        if (!row?.record_id || row.deleted_at || !row?.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) continue;
        if (allowed && !allowed.has(String(row.record_id))) continue;
        merged.set(String(row.record_id), row.payload);
    }
    return Array.from(merged.values());
}

export function getCloudActivityIds(userId, activities) {
    return prepareCloudActivityRows(userId, activities).map(row => row.record_id);
}
