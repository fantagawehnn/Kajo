/**
 * cloud-sync.js
 *
 * Explizite, versionsgeschützte Supabase-Synchronisierung.
 * Dieses Modul wird zunächst nur vorbereitet und NICHT automatisch gestartet.
 * Erst nach Ausführung der Datenbankmigration und einem kontrollierten
 * Erstabgleich darf es in den App-Lebenszyklus eingebunden werden.
 */

import { supabase } from './supabase-client.js';

function requireSupabase() {
    if (!supabase) throw new Error('Supabase ist nicht konfiguriert.');
}

function cloudSnapshotQueryError(error, stage) {
    const wrapped = new Error(stage + ': ' + (error?.message || 'Unbekannter Datenbankfehler.'));
    wrapped.name = 'CloudSnapshotQueryError';
    wrapped.kajoStage = stage;
    wrapped.code = error?.code ?? null;
    wrapped.details = error?.details ?? null;
    wrapped.hint = error?.hint ?? null;
    wrapped.cause = error;
    return wrapped;
}

function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('Der Cloud-Datenstand muss ein JSON-Objekt sein.');
    }
    return snapshot;
}

/**
 * Lädt ausschließlich den Datensatz des aktuell angemeldeten Nutzers.
 * Gibt version 0 und data null zurück, wenn noch kein Cloud-Datensatz existiert.
 */
export async function fetchCloudSnapshot() {
    requireSupabase();

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw cloudSnapshotQueryError(authError, 'Cloud-Snapshot: angemeldeten Benutzer prüfen (auth.getUser)');
    const userId = authData?.user?.id;
    if (!userId) throw new Error('Für die Cloud-Synchronisierung ist eine Anmeldung erforderlich.');

    const { data, error } = await supabase
        .from('user_data')
        .select('user_id, data, version, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw cloudSnapshotQueryError(error, 'Cloud-Snapshot: user_data-Datensatz lesen');
    if (!data) return { userId, data: null, version: 0, updatedAt: null };

    return {
        userId,
        data: validateSnapshot(data.data),
        version: Number(data.version || 1),
        updatedAt: data.updated_at || null
    };
}

/**
 * Liest nur Versionsmetadaten des Cloud-Snapshots. Damit kann die App prüfen,
 * ob ihr bestätigter lokaler Basisstand noch aktuell ist, ohne das gesamte
 * user_data-JSON bei jedem lokalen Speichervorgang erneut zu übertragen.
 */
export async function fetchCloudSnapshotMetadata() {
    requireSupabase();

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw cloudSnapshotQueryError(authError, 'Cloud-Snapshot-Metadaten: angemeldeten Benutzer prüfen (auth.getUser)');
    const userId = authData?.user?.id;
    if (!userId) throw new Error('Für die Cloud-Synchronisierung ist eine Anmeldung erforderlich.');

    const { data, error } = await supabase
        .from('user_data')
        .select('user_id, version, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw cloudSnapshotQueryError(error, 'Cloud-Snapshot-Metadaten: Version lesen');
    return {
        userId,
        version: Number(data?.version || 0),
        updatedAt: data?.updated_at || null
    };
}

/**
 * Speichert nur dann, wenn die erwartete Version noch aktuell ist.
 * Bei einem Konflikt wird NICHT automatisch überschrieben.
 */
export async function saveCloudSnapshot(snapshot, expectedVersion, expectedUserId) {
    requireSupabase();
    validateSnapshot(snapshot);

    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new Error('Ungültige erwartete Cloud-Version.');
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData?.user?.id) throw new Error('Für die Cloud-Synchronisierung ist eine Anmeldung erforderlich.');
    if (expectedUserId && authData.user.id !== expectedUserId) {
        throw new Error('Das angemeldete Konto hat sich geändert. Der Upload wurde zum Schutz deiner Daten abgebrochen.');
    }

    const { data, error } = await supabase.rpc('save_user_data', {
        p_data: snapshot,
        p_expected_version: expectedVersion
    });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result.saved !== 'boolean') {
        throw new Error('Die Cloud hat eine unerwartete Antwort auf den Speichervorgang zurückgegeben.');
    }

    if (!result.saved) {
        return {
            saved: false,
            conflict: true,
            currentVersion: Number(result.current_version || 0),
            currentUpdatedAt: result.current_updated_at || null
        };
    }

    return {
        saved: true,
        conflict: false,
        currentVersion: Number(result.current_version),
        currentUpdatedAt: result.current_updated_at || null
    };
}
