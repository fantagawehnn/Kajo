import { loadGarminActivityPages } from './garmin-activity-pagination.js';

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_CONCURRENCY = 3;

/**
 * Loads the two independent Garmin history tables in parallel. Every query is
 * explicitly scoped to the authenticated user and counted pagination rejects
 * incomplete results instead of displaying misleading totals.
 */
export async function loadGarminSyncHistoryData(supabase, userId, options = {}) {
    if (!supabase || typeof supabase.from !== 'function') {
        throw new TypeError('Die Garmin-Datenbankverbindung ist nicht verfügbar.');
    }
    if (typeof userId !== 'string' || !userId.trim()) {
        throw new TypeError('Für die Garmin-Historie ist eine gültige Benutzer-ID erforderlich.');
    }

    const pageSize = Math.max(1, Math.floor(Number(options.pageSize) || DEFAULT_PAGE_SIZE));
    const concurrency = Math.min(4, Math.max(1, Math.floor(Number(options.concurrency) || DEFAULT_CONCURRENCY)));

    const countRows = async (table, column) => {
        const { count, error } = await supabase.from(table)
            .select(column, { count: 'exact', head: true })
            .eq('user_id', userId);
        if (error) throw error;
        return Number.isFinite(count) ? count : null;
    };

    const [healthCount, activityCount] = await Promise.all([
        countRows('garmin_health_records', 'record_date'),
        countRows('garmin_activities', 'start_time')
    ]);

    const [healthRows, activityRows] = await Promise.all([
        loadGarminActivityPages((offset, limit) => supabase.from('garmin_health_records')
            .select('data_type,record_date')
            .eq('user_id', userId)
            .order('record_date', { ascending: true })
            .range(offset, offset + limit - 1), {
                pageSize, totalCount: healthCount, concurrency
            }),
        loadGarminActivityPages((offset, limit) => supabase.from('garmin_activities')
            .select('start_time')
            .eq('user_id', userId)
            .order('start_time', { ascending: true })
            .range(offset, offset + limit - 1), {
                pageSize, totalCount: activityCount, concurrency
            })
    ]);

    return { healthRows, activityRows };
}
