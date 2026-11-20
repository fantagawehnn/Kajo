/**
 * Cloud persistence for complete Garmin activity telemetry.
 *
 * Existing cloud telemetry is immutable during incremental uploads.
 * Only activity IDs are checked; existing measurement series are never re-read
 * or overwritten by this upload path.
 */
const TABLE = 'garmin_activity_telemetry';

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
    return /^\d+$/.test(id) ? id : null;
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
        if (!/^\d+$/.test(id) || records.has(id) || !telemetry || typeof telemetry !== 'object') continue;
        if (Object.keys(telemetry).length) records.set(id, { garmin_activity_id: id, telemetry });
    }

    return Array.from(records.values());
}

async function fetchRowsByActivityIds(supabase, userId, activityIds) {
    const uniqueIds = Array.from(new Set((Array.isArray(activityIds) ? activityIds : [])
        .map(value => String(value ?? '').replace(/^garmin-/, ''))
        .filter(value => /^\d+$/.test(value))));
    const rows = [];
    const QUERY_BATCH_SIZE = 100;
    for (let offset = 0; offset < uniqueIds.length; offset += QUERY_BATCH_SIZE) {
        const idBatch = uniqueIds.slice(offset, offset + QUERY_BATCH_SIZE);
        const { data, error } = await supabase
            .from(TABLE)
            .select('garmin_activity_id, telemetry')
            .eq('user_id', userId)
            .in('garmin_activity_id', idBatch);
        if (error) throw error;
        rows.push(...(Array.isArray(data) ? data : []));
    }
    return rows;
}

/**
 * Lädt ausschließlich die Telemetrie der vom Aufrufer ausgewählten Aktivitäten.
 * Die Aktivitäts-IDs werden aus dem 90-Tage-Fenster der geladenen Aktivitäten
 * ermittelt; ältere Cloud-Messreihen werden dabei nicht angefragt.
 */
export async function loadGarminTelemetryForActivityIds(supabase, userId, activityIds = []) {
    const id = requireContext(supabase, userId);
    const rows = await fetchRowsByActivityIds(supabase, id, activityIds);
    return rows.map(row => ({
        garmin_activity_id: String(row.garmin_activity_id),
        telemetry: row.telemetry
    }));
}

/**
 * Loads only cloud timestamps for selected activity IDs. This lets the
 * analysis backfill detect telemetry uploaded after a cached "unavailable"
 * result without downloading the full measurement arrays for every activity.
 */
export async function loadGarminTelemetryMetadataForActivityIds(supabase, userId, activityIds = []) {
    const id = requireContext(supabase, userId);
    const uniqueIds = Array.from(new Set((Array.isArray(activityIds) ? activityIds : [])
        .map(value => String(value ?? '').replace(/^garmin-/, ''))
        .filter(value => /^\d+$/.test(value))));
    const rows = [];
    const QUERY_BATCH_SIZE = 100;

    for (let offset = 0; offset < uniqueIds.length; offset += QUERY_BATCH_SIZE) {
        const idBatch = uniqueIds.slice(offset, offset + QUERY_BATCH_SIZE);
        const { data, error } = await supabase
            .from(TABLE)
            .select('garmin_activity_id, created_at')
            .eq('user_id', id)
            .in('garmin_activity_id', idBatch);
        if (error) throw error;
        rows.push(...(Array.isArray(data) ? data : []));
    }

    return rows.map(row => ({
        garmin_activity_id: String(row.garmin_activity_id),
        created_at: row.created_at || null
    }));
}

export async function uploadMissingGarminTelemetry(supabase, userId, candidateRecords = []) {
    const id = requireContext(supabase, userId);
    const candidates = new Map();
    for (const record of Array.isArray(candidateRecords) ? candidateRecords : []) {
        const activityId = String(record?.garmin_activity_id ?? '').replace(/^garmin-/, '');
        if (!/^\d+$/.test(activityId) || !record?.telemetry || typeof record.telemetry !== 'object') continue;
        candidates.set(activityId, record.telemetry);
    }

    const candidateIds = Array.from(candidates.keys());
    const existingIds = new Set();
    const QUERY_BATCH_SIZE = 100;
    const INSERT_BATCH_SIZE = 25;

    // Beim Upload werden nur Aktivitäts-IDs abgefragt, niemals bereits gespeicherte Messreihen.
    for (let offset = 0; offset < candidateIds.length; offset += QUERY_BATCH_SIZE) {
        const idBatch = candidateIds.slice(offset, offset + QUERY_BATCH_SIZE);
        const { data, error } = await supabase
            .from(TABLE)
            .select('garmin_activity_id')
            .eq('user_id', id)
            .in('garmin_activity_id', idBatch);
        if (error) throw error;
        for (const row of Array.isArray(data) ? data : []) {
            existingIds.add(String(row.garmin_activity_id));
        }
    }

    const missingRecords = candidateIds
        .filter(activityId => !existingIds.has(activityId))
        .map(activityId => ({
            user_id: id,
            garmin_activity_id: activityId,
            telemetry: candidates.get(activityId)
        }));

    let uploaded = 0;
    for (let offset = 0; offset < missingRecords.length; offset += INSERT_BATCH_SIZE) {
        const batch = missingRecords.slice(offset, offset + INSERT_BATCH_SIZE);
        const { error } = await supabase.from(TABLE).upsert(batch, {
            onConflict: 'user_id,garmin_activity_id',
            ignoreDuplicates: true
        });
        if (error) throw error;
        uploaded += batch.length;
    }

    // Bereits vorhandene IDs gelten als vorhanden; neue IDs werden separat bestätigt.
    let verifiedNew = 0;
    const insertedIds = missingRecords.map(record => record.garmin_activity_id);
    for (let offset = 0; offset < insertedIds.length; offset += QUERY_BATCH_SIZE) {
        const idBatch = insertedIds.slice(offset, offset + QUERY_BATCH_SIZE);
        const { data, error } = await supabase
            .from(TABLE)
            .select('garmin_activity_id')
            .eq('user_id', id)
            .in('garmin_activity_id', idBatch);
        if (error) throw error;
        verifiedNew += new Set((Array.isArray(data) ? data : [])
            .map(row => String(row.garmin_activity_id))).size;
    }

    const verified = existingIds.size + verifiedNew;
    if (verified !== candidateIds.length) {
        throw new Error('Cloud-Readback unvollständig: ' + (candidateIds.length - verified) + ' Telemetrie-Datensätze fehlen.');
    }

    return {
        uploaded,
        candidates: candidates.size,
        skippedExisting: existingIds.size,
        updated: 0,
        verified
    };
}

export async function syncGarminTelemetryToCloud(supabase, userId, candidateRecords = []) {
    const id = requireContext(supabase, userId);

    // Erst IDs prüfen und ausschließlich tatsächlich fehlende Messreihen speichern.
    // Vorhandene Telemetrie wird dabei weder geladen noch überschrieben.
    const uploadResult = await uploadMissingGarminTelemetry(supabase, id, candidateRecords);

    // Nur die für diesen Transfer relevanten IDs zurücklesen. Ein Vollabruf
    // der gesamten Telemetrie-Tabelle ist beim App-Start nicht erforderlich.
    const candidateIds = Array.from(new Set(
        (Array.isArray(candidateRecords) ? candidateRecords : [])
            .map(record => String(record?.garmin_activity_id ?? '').replace(/^garmin-/, ''))
            .filter(activityId => /^\d+$/.test(activityId))
    ));
    const cloudRows = await fetchRowsByActivityIds(supabase, id, candidateIds);
    const cloudIds = new Set(cloudRows.map(row => String(row.garmin_activity_id)));
    const missing = candidateIds.filter(activityId => !cloudIds.has(activityId));
    if (missing.length) {
        throw new Error('Cloud-Readback unvollständig: ' + missing.length + ' Telemetrie-Datensätze fehlen.');
    }

    return {
        records: cloudRows.map(row => ({
            garmin_activity_id: String(row.garmin_activity_id),
            telemetry: row.telemetry
        })),
        uploaded: uploadResult.uploaded,
        existing: uploadResult.skippedExisting,
        total: cloudRows.length,
        verified: uploadResult.verified
    };
}
