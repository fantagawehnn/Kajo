import { supabase } from './supabase-client.js';

function setStatus(message, isError = false) {
    const node = document.getElementById('kajo-connect-device-status');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('text-rose-300', isError);
    node.classList.toggle('text-emerald-300', !isError);
}

function formatDate(value) {
    if (!value) return 'Noch nicht verwendet';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Nicht verfügbar' : date.toLocaleString('de-DE');
}

export async function renderKajoConnectDevices() {
    const list = document.getElementById('kajo-connect-device-list');
    if (!list) return;
    list.replaceChildren();

    if (!supabase) {
        setStatus('Die KAJO-Verbindung ist nicht verfügbar.', true);
        return;
    }

    setStatus('Gekoppelte Geräte werden geladen …');
    try {
        const { data, error } = await supabase.functions.invoke('kajo-connect', {
            body: { action: 'list-devices' }
        });
        if (error) throw error;
        const devices = Array.isArray(data?.devices) ? data.devices : [];
        if (!devices.length) {
            setStatus('Noch keine Garmin-Uhr mit diesem Konto gekoppelt.');
            return;
        }

        const active = devices.filter(device => !device.revoked_at).length;
        setStatus(active + ' aktive Geräte' + (devices.length > active ? ' · ' + (devices.length - active) + ' widerrufen' : ''));

        devices.forEach(device => {
            const card = document.createElement('div');
            card.className = 'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3';

            const info = document.createElement('div');
            info.className = 'min-w-0';
            const name = document.createElement('strong');
            name.className = 'block text-sm text-white';
            name.textContent = device.device_label || 'KAJO Connect';
            const meta = document.createElement('p');
            meta.className = 'mt-1 text-xs text-slate-400';
            meta.textContent = 'Verbunden: ' + formatDate(device.created_at) + ' · Zuletzt aktiv: ' + formatDate(device.last_seen_at);
            const state = document.createElement('p');
            state.className = 'mt-1 text-[11px] ' + (device.revoked_at ? 'text-rose-300' : 'text-emerald-300');
            state.textContent = device.revoked_at ? 'Zugriff widerrufen' : 'Aktiv';
            info.append(name, meta, state);
            card.appendChild(info);

            if (!device.revoked_at) {
                const revoke = document.createElement('button');
                revoke.type = 'button';
                revoke.className = 'shrink-0 rounded-lg border border-rose-900/70 px-3 py-2 text-xs text-rose-300 hover:bg-rose-950/40';
                revoke.textContent = 'Gerät widerrufen';
                revoke.addEventListener('click', () => revokeKajoConnectDevice(device.id));
                card.appendChild(revoke);
            }
            list.appendChild(card);
        });
    } catch (error) {
        console.error('KAJO Connect: Geräte konnten nicht geladen werden:', error);
        setStatus('Geräteliste konnte nicht geladen werden: ' + (error?.message || 'Unbekannter Fehler'), true);
    }
}

export async function claimKajoConnectPairing() {
    const input = document.getElementById('kajo-connect-pairing-code');
    const button = document.getElementById('kajo-connect-claim-button');
    const code = String(input?.value || '').replace(/\s/g, '');
    if (!/^\d{12}$/.test(code)) {
        setStatus('Bitte gib den zwölfstelligen Code von deiner Garmin-Uhr ein.', true);
        input?.focus();
        return;
    }
    if (!supabase) {
        setStatus('Die KAJO-Verbindung ist nicht verfügbar.', true);
        return;
    }

    if (button) button.disabled = true;
    setStatus('Kopplung wird bestätigt …');
    try {
        const { data, error } = await supabase.functions.invoke('kajo-connect', {
            body: { action: 'claim-pairing', code }
        });
        if (error) throw error;
        if (!data?.ok || data.status !== 'claimed') {
            throw new Error(data?.error || 'Die Uhr konnte nicht gekoppelt werden.');
        }
        if (input) input.value = '';
        setStatus('Kopplung bestätigt. Die Uhr verbindet sich jetzt automatisch.');
        await renderKajoConnectDevices();
    } catch (error) {
        console.error('KAJO Connect: Kopplung fehlgeschlagen:', error);
        setStatus(error?.message || 'Kopplung fehlgeschlagen. Bitte prüfe den Code und versuche es erneut.', true);
    } finally {
        if (button) button.disabled = false;
    }
}

export async function revokeKajoConnectDevice(deviceId) {
    if (!supabase || typeof deviceId !== 'string' || !deviceId) return;
    if (!window.confirm('Möchtest du den Zugriff dieser Uhr auf dein KAJO-Konto wirklich widerrufen?')) return;
    setStatus('Gerätezugriff wird widerrufen …');
    try {
        const { data, error } = await supabase.functions.invoke('kajo-connect', {
            body: { action: 'revoke-device', deviceId }
        });
        if (error) throw error;
        if (!data?.ok || data.status !== 'revoked') {
            throw new Error(data?.error || 'Der Gerätezugriff konnte nicht widerrufen werden.');
        }
        setStatus('Gerätezugriff wurde widerrufen.');
        await renderKajoConnectDevices();
    } catch (error) {
        console.error('KAJO Connect: Gerätezugriff konnte nicht widerrufen werden:', error);
        setStatus(error?.message || 'Widerruf fehlgeschlagen.', true);
    }
}
