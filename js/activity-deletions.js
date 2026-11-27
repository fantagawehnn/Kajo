import { getUserLocalSetting, setUserLocalSetting } from './storage.js?v=6';

export const ACTIVITY_DELETION_OUTBOX_KEY = 'activityDeletionOutbox';

function parseDate(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

export function getActivityDeletionDate(activity) {
    for (const value of [
        activity?.date,
        activity?.startDate,
        activity?.startTimeLocal,
        activity?.startTime,
        activity?.start_time,
        activity?.start_date
    ]) {
        const date = parseDate(value);
        if (date) return date;
    }
    return null;
}

export function getActivityDeletionRecordId(activity) {
    const value = activity?.id
        ?? activity?.activityId
        ?? activity?.sourceRefs?.garminActivityId
        ?? activity?.garminData?.activityId;
    return value == null || !String(value).trim() ? null : String(value);
}

export function getActivityDeletionGarminId(activity) {
    const value = activity?.sourceRefs?.garminActivityId
        ?? activity?.garminData?.activityId
        ?? activity?.garminTelemetry?.activityId
        ?? ((activity?.source === 'garmin' || (Array.isArray(activity?.sources) && activity.sources.includes('garmin')))
            ? activity?.id
            : null)
        ?? (String(activity?.id ?? '').startsWith('garmin-')
            ? String(activity.id).slice('garmin-'.length)
            : null);
    const id = String(value ?? '').replace(/^garmin-/, '');
    return /^\d+$/.test(id) ? id : null;
}

export function buildActivityDeletionTombstone(activity, today) {
    if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
        throw new Error('today muss ein gültiges Datum im Format YYYY-MM-DD sein.');
    }
    const recordId = getActivityDeletionRecordId(activity);
    const activityDate = getActivityDeletionDate(activity);
    if (!recordId || !activityDate || activityDate >= today) return null;
    return {
        record_id: recordId,
        activity_date: activityDate,
        garmin_activity_id: getActivityDeletionGarminId(activity)
    };
}

function readOutbox() {
    const raw = getUserLocalSetting(ACTIVITY_DELETION_OUTBOX_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(row => row && typeof row.record_id === 'string'
            && typeof row.activity_date === 'string'
            && /^\d{4}-\d{2}-\d{2}$/.test(row.activity_date));
    } catch {
        throw new Error('Die lokale Löschwarteschlange ist beschädigt. Bitte nicht erneut synchronisieren, bevor sie geprüft wurde.');
    }
}

export function queueActivityDeletionTombstone(activity, today) {
    const tombstone = buildActivityDeletionTombstone(activity, today);
    if (!tombstone) return null;
    const pending = readOutbox();
    const next = new Map(pending.map(row => [row.record_id, row]));
    next.set(tombstone.record_id, tombstone);
    setUserLocalSetting(ACTIVITY_DELETION_OUTBOX_KEY, JSON.stringify([...next.values()]));
    return tombstone;
}

export async function syncPendingActivityDeletionTombstones(client, userId) {
    if (!client?.from) throw new Error('Supabase ist für die Aktivitäts-Löschsynchronisierung nicht verfügbar.');
    if (!userId) throw new Error('Für die Aktivitäts-Löschsynchronisierung fehlt die Benutzer-ID.');
    const pending = readOutbox();
    if (!pending.length) return { uploaded: 0, pending: 0 };

    const rows = pending.map(row => ({ ...row, user_id: userId }));
    const { error: uploadError } = await client
        .from('activity_deletions')
        .upsert(rows, { onConflict: 'user_id,record_id', ignoreDuplicates: true });
    if (uploadError) throw uploadError;

    const ids = rows.map(row => row.record_id);
    const { data: confirmedRows, error: verifyError } = await client
        .from('activity_deletions')
        .select('record_id')
        .eq('user_id', userId)
        .in('record_id', ids);
    if (verifyError) throw verifyError;
    const confirmed = new Set((confirmedRows || []).map(row => String(row.record_id)));
    const missing = ids.filter(id => !confirmed.has(id));
    if (missing.length) throw new Error('Die Cloud hat nicht alle Aktivitätslöschungen bestätigt (' + missing.length + ').');

    const current = readOutbox();
    const remaining = current.filter(row => !confirmed.has(row.record_id));
    setUserLocalSetting(ACTIVITY_DELETION_OUTBOX_KEY, JSON.stringify(remaining));
    return { uploaded: confirmed.size, pending: remaining.length };
}

export async function fetchActivityDeletionTombstones(client, userId) {
    if (!client?.from) throw new Error('Supabase ist für den Aktivitätsabruf nicht verfügbar.');
    if (!userId) throw new Error('Für den Aktivitätsabruf fehlt die Benutzer-ID.');
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client
            .from('activity_deletions')
            .select('record_id,garmin_activity_id,activity_date,deleted_at')
            .eq('user_id', userId)
            .order('record_id', { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return rows;
}
