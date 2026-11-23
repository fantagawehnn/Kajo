import { supabase } from './supabase-client.js';
import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';

const KAJO_CONNECT_METRICS = [
    ['speedNow', 'Aktuelle Geschwindigkeit'],
    ['speedAvg', 'Durchschnittsgeschwindigkeit'],
    ['speedMax', 'Maximalgeschwindigkeit'],
    ['heartRate', 'Herzfrequenz'],
    ['heartRateZone', 'Herzfrequenzzone'],
    ['heartRateAvg', 'Durchschnittliche Herzfrequenz'],
    ['heartRateMax', 'Maximale Herzfrequenz'],
    ['distance', 'Distanz'],
    ['elapsed', 'Trainingszeit'],
    ['calories', 'Kalorien'],
    ['cadence', 'Kadenz'],
    ['power', 'Leistung'],
    ['trainingEffect', 'Training Effect'],
    ['altitude', 'Höhe'],
    ['ascent', 'Anstieg'],
    ['descent', 'Abstieg'],
    ['gpsAccuracy', 'GPS-Genauigkeit']
];

let displayLayoutsDraft = null;
let activeDisplayLayout = 0;

function normalizeDisplayLayouts(value) {
    const source = Array.isArray(value) ? value : [];
    const allowed = new Set(KAJO_CONNECT_METRICS.map(([id]) => id));
    return [0, 1, 2].map(index => {
        const layout = source[index] && typeof source[index] === 'object' ? source[index] : {};
        const seen = new Set();
        const metrics = (Array.isArray(layout.metrics) ? layout.metrics : [])
            .filter(metric => {
                if (!metric || typeof metric.id !== 'string' || !allowed.has(metric.id) || seen.has(metric.id)) return false;
                seen.add(metric.id);
                return true;
            })
            .slice(0, 4)
            .map(metric => ({
                id: metric.id,
                size: ['small', 'medium', 'large'].includes(metric.size) ? metric.size : 'medium'
            }));
        return {
            id: 'layout-' + (index + 1),
            name: 'Datenseite ' + (index + 1),
            metrics
        };
    });
}

function getDisplayLayoutsDraft() {
    if (!displayLayoutsDraft) {
        displayLayoutsDraft = normalizeDisplayLayouts(state.settings?.kajoConnectDisplayLayouts);
    }
    return displayLayoutsDraft;
}

function createConfigElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
}

function setConfigStatus(message, isError = false) {
    const node = document.getElementById('kajo-connect-layout-status');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('text-rose-300', isError);
    node.classList.toggle('text-emerald-300', !isError);
}

export function renderKajoConnectDisplayConfig() {
    const root = document.getElementById('kajo-connect-layout-editor');
    if (!root) return;
    const layouts = getDisplayLayoutsDraft();
    const layout = layouts[activeDisplayLayout];
    root.replaceChildren();

    const tabs = createConfigElement('div', 'grid grid-cols-3 gap-2');
    layouts.forEach((item, index) => {
        const tab = createConfigElement('button',
            'rounded-lg border px-3 py-2 text-xs font-semibold ' + (index === activeDisplayLayout
                ? 'border-cyan-500 bg-cyan-950/50 text-cyan-200'
                : 'border-slate-700 bg-slate-900 text-slate-400'),
            item.name);
        tab.type = 'button';
        tab.addEventListener('click', () => {
            activeDisplayLayout = index;
            renderKajoConnectDisplayConfig();
        });
        tabs.appendChild(tab);
    });
    root.appendChild(tabs);

    const description = createConfigElement('p', 'text-xs leading-relaxed text-slate-400',
        'Wähle bis zu vier Kennzahlen. Reihenfolge und Größe gelten nur für diese Datenseite.');
    root.appendChild(description);

    const list = createConfigElement('div', 'space-y-2');
    KAJO_CONNECT_METRICS.forEach(([id, label]) => {
        const selectedIndex = layout.metrics.findIndex(metric => metric.id === id);
        const selected = selectedIndex >= 0;
        const row = createConfigElement('div',
            'flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3');
        const left = createConfigElement('label', 'flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-200');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selected;
        checkbox.disabled = !selected && layout.metrics.length >= 4;
        checkbox.className = 'h-4 w-4 accent-cyan-500';
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                layout.metrics.push({ id, size: 'medium' });
            } else {
                layout.metrics = layout.metrics.filter(metric => metric.id !== id);
            }
            renderKajoConnectDisplayConfig();
        });
        left.append(checkbox, createConfigElement('span', 'truncate', label));
        row.appendChild(left);

        if (selected) {
            const controls = createConfigElement('div', 'flex items-center gap-1');
            const size = document.createElement('select');
            size.className = 'min-w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white';
            [['small', 'Klein'], ['medium', 'Mittel'], ['large', 'Groß']].forEach(([value, title]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = title;
                size.appendChild(option);
            });
            size.value = layout.metrics[selectedIndex].size;
            size.setAttribute('aria-label', label + ' – Größe');
            size.addEventListener('change', () => {
                layout.metrics[selectedIndex].size = size.value;
            });
            controls.appendChild(size);

            [['↑', -1, 'Nach oben'], ['↓', 1, 'Nach unten']].forEach(([symbol, direction, title]) => {
                const move = createConfigElement('button', 'rounded-md border border-slate-700 px-2.5 py-2 text-xs text-slate-200 hover:bg-slate-800', symbol);
                move.type = 'button';
                move.title = title;
                move.disabled = selectedIndex + direction < 0 || selectedIndex + direction >= layout.metrics.length;
                move.addEventListener('click', () => {
                    const target = selectedIndex + direction;
                    [layout.metrics[selectedIndex], layout.metrics[target]] = [layout.metrics[target], layout.metrics[selectedIndex]];
                    renderKajoConnectDisplayConfig();
                });
                controls.appendChild(move);
            });
            row.appendChild(controls);
        }
        list.appendChild(row);
    });
    root.appendChild(list);

    const footer = createConfigElement('div', 'flex flex-wrap items-center justify-between gap-2');
    footer.appendChild(createConfigElement('span', 'text-xs text-slate-500',
        layout.metrics.length + ' / 4 Kennzahlen ausgewählt'));
    const save = createConfigElement('button', 'kajo-settings-primary', 'Uhr-Konfiguration speichern');
    save.type = 'button';
    save.addEventListener('click', saveKajoConnectDisplayConfig);
    footer.appendChild(save);
    root.appendChild(footer);
}

export function saveKajoConnectDisplayConfig() {
    try {
        const layouts = normalizeDisplayLayouts(getDisplayLayoutsDraft());
        state.settings = { ...(state.settings || {}), kajoConnectDisplayLayouts: layouts };
        if (!saveDataToLocalStorage()) {
            throw new Error('Der angemeldete Kontospeicher ist nicht verfügbar.');
        }
        displayLayoutsDraft = layouts;
        setConfigStatus('Konfiguration lokal gespeichert. Bei aktiver Cloud-Synchronisierung wird sie auch in deinem KAJO-Konto gesichert.');
    } catch (error) {
        setConfigStatus(error?.message || 'Konfiguration konnte nicht gespeichert werden.', true);
    }
}

window.addEventListener('endurance:user-ready', () => {
    displayLayoutsDraft = null;
    activeDisplayLayout = 0;
    renderKajoConnectDisplayConfig();
});

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
