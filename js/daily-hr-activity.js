import { state, refreshAll } from './state.js';
import { supabase } from './supabase-client.js';
import { getEnabledSportsCatalog, escapeHtml, toLocalDateString } from './utils.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { selectGarminDailyHeartRateWindow } from './daily-heart-rate.js';

const $ = id => document.getElementById(id);
const value = id => $(id)?.value?.trim() ?? '';
let preview = null;
let previewBusy = false;

function localDateTimeMs(date, time) {
    const parsed = new Date(date + 'T' + time + ':00');
    return parsed.getTime();
}

function setStatus(message, error = false) {
    const output = $('daily-hr-activity-status');
    if (!output) return;
    output.textContent = message;
    output.classList.toggle('text-rose-300', error);
    output.classList.toggle('text-slate-300', !error);
    output.hidden = !message;
}

function resetPreview(message = 'Bitte wähle Datum, Start- und Endzeit und lade zunächst die HF-Aufzeichnung.') {
    preview = null;
    const create = $('daily-hr-activity-create');
    if (create) create.disabled = true;
    setStatus(message);
}

function getWindow() {
    const date = value('daily-hr-activity-date');
    const startTime = value('daily-hr-activity-start');
    const endTime = value('daily-hr-activity-end');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !startTime || !endTime) {
        throw new Error('Bitte wähle Datum, Startzeit und Endzeit aus.');
    }
    const startMs = localDateTimeMs(date, startTime);
    const endMs = localDateTimeMs(date, endTime);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        throw new Error('Die Endzeit muss nach der Startzeit liegen.');
    }
    if (endMs - startMs > 24 * 60 * 60 * 1000) {
        throw new Error('Der ausgewählte Zeitraum darf höchstens 24 Stunden umfassen.');
    }
    return { date, startTime, endTime, startMs, endMs };
}

function renderSports(selected = 'Kayaking') {
    const select = $('daily-hr-activity-sport');
    if (!select) return;
    const catalog = getEnabledSportsCatalog();
    const order = ['Kayaking', 'C1', 'C2', 'PaddleErgo', 'Run', 'Ride', 'Swim', 'WeightTraining', 'Workout'];
    const keys = [...order.filter(key => catalog[key]), ...Object.keys(catalog).filter(key => !order.includes(key))];
    select.innerHTML = keys.map(key => '<option value="' + escapeHtml(key) + '">' +
        escapeHtml(catalog[key].label || key) + '</option>').join('');
    if (keys.includes(selected)) select.value = selected;
}

export function openDailyHrActivityModal(date = '') {
    const modal = $('daily-hr-activity-modal');
    if (!modal) return;
    $('daily-hr-activity-date').value = date || state.selectedCalendarDay || toLocalDateString();
    $('daily-hr-activity-start').value = '';
    $('daily-hr-activity-end').value = '';
    $('daily-hr-activity-name').value = '';
    $('daily-hr-activity-distance').value = '';
    renderSports('Kayaking');
    resetPreview();
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

export function closeDailyHrActivityModal() {
    $('daily-hr-activity-modal')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    preview = null;
    previewBusy = false;
}

export function invalidateDailyHrActivityPreview() {
    if (previewBusy) return;
    resetPreview('Zeitraum geändert. Bitte lade die HF-Aufzeichnung erneut.');
}

export async function previewDailyHrActivity() {
    if (previewBusy) return;
    let window;
    try {
        window = getWindow();
    } catch (error) {
        setStatus(error.message, true);
        return;
    }
    if (!supabase) {
        setStatus('Die Verbindung zu Garmin-Daten ist nicht verfügbar.', true);
        return;
    }
    previewBusy = true;
    const button = $('daily-hr-activity-preview');
    if (button) { button.disabled = true; button.textContent = 'HF-Daten werden geladen …'; }
    setStatus('Lese die gespeicherte Garmin-Tages-HF-Aufzeichnung …');
    try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth?.user?.id) throw new Error('Bitte melde dich an, um deine Garmin-Daten abzurufen.');

        const { data, error } = await supabase
            .from('garmin_health_records')
            .select('record_date,payload')
            .eq('data_type', 'heart_rate')
            .eq('record_date', window.date)
            .eq('record_key', 'daily')
            .maybeSingle();
        if (error) throw error;
        if (!data?.payload || data.payload.no_data === true) {
            throw new Error('Für diesen Tag ist keine Garmin-Tages-HF-Aufzeichnung gespeichert.');
        }
        const samples = selectGarminDailyHeartRateWindow([data], window.startMs, window.endMs);
        if (samples.length < 2) {
            throw new Error('Im gewählten Zeitraum wurden weniger als zwei gültige HF-Messpunkte gefunden. Prüfe Start- und Endzeit.');
        }
        preview = { ...window, samples };
        const create = $('daily-hr-activity-create');
        if (create) create.disabled = false;
        const first = new Date(samples[0].timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const last = new Date(samples[samples.length - 1].timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const gaps = samples.slice(1).map((sample, index) => (sample.timestampMs - samples[index].timestampMs) / 1000);
        const longGaps = gaps.filter(seconds => seconds > 30).length;
        const maxGap = gaps.length ? Math.max(...gaps) : 0;
        setStatus(samples.length + ' HF-Messpunkte gefunden (' + first + '–' + last + '). ' +
            'Größte Messlücke: ' + Math.round(maxGap) + ' s; ' + longGaps +
            ' Zeitabstände liegen über 30 s. Solche Lücken werden in der HF-Zonen-Load-Berechnung nicht hochgerechnet. ' +
            'Es werden ausschließlich vorhandene Messpunkte übernommen.');
    } catch (error) {
        preview = null;
        const create = $('daily-hr-activity-create');
        if (create) create.disabled = true;
        setStatus(error?.message || 'Die Tages-HF-Aufzeichnung konnte nicht geladen werden.', true);
    } finally {
        previewBusy = false;
        if (button) { button.disabled = false; button.textContent = 'HF-Aufzeichnung laden'; }
    }
}

export function createDailyHrActivity() {
    try {
        const selection = getWindow();
        if (!preview || preview.date !== selection.date || preview.startMs !== selection.startMs
            || preview.endMs !== selection.endMs || preview.samples.length < 2) {
            throw new Error('Bitte lade die HF-Aufzeichnung für den aktuellen Zeitraum erneut.');
        }
        const type = value('daily-hr-activity-sport') || 'Kayaking';
        const catalog = getEnabledSportsCatalog();
        const distanceRaw = value('daily-hr-activity-distance');
        let distance = null;
        if (distanceRaw) {
            distance = Number(distanceRaw);
            if (!Number.isFinite(distance) || distance < 0 || distance > 1000) {
                throw new Error('Bitte gib eine gültige Distanz zwischen 0 und 1.000 ein.');
            }
            if (type === 'Swim') distance /= 1000;
        }
        const startIso = new Date(selection.startMs).toISOString();
        const endIso = new Date(selection.endMs).toISOString();
        const existing = (state.rawActivities || []).some(activity =>
            activity.dailyHeartRateImported === true
            && activity.startTime === startIso && activity.endTime === endIso);
        if (existing) throw new Error('Für diesen Zeitraum existiert bereits eine rekonstruierte HF-Aktivität.');

        const hr = preview.samples.map(sample => sample.hr);
        const time = preview.samples.map(sample => Math.round((sample.timestampMs - selection.startMs) / 1000 * 10) / 10);
        const durationMinutes = Math.round((selection.endMs - selection.startMs) / 60000 * 100) / 100;
        const averageHr = Math.round(hr.reduce((sum, value) => sum + value, 0) / hr.length);
        const maxHr = Math.max(...hr);
        const sportLabel = catalog[type]?.label || type;
        const activity = {
            id: 'daily-hr-' + selection.startMs,
            source: 'manual',
            manual: true,
            dailyHeartRateImported: true,
            date: selection.date,
            name: (value('daily-hr-activity-name') || sportLabel + ' – Garmin-Tages-HF').slice(0, 120),
            type,
            category: 'ga',
            duration: durationMinutes,
            startTime: startIso,
            startTimeLocal: selection.date + 'T' + selection.startTime + ':00',
            endTime: endIso,
            endTimeLocal: selection.date + 'T' + selection.endTime + ':00',
            hr: averageHr,
            maxHr,
            ...(distance !== null && !['WeightTraining', 'Workout'].includes(type) ? { distance } : {}),
            telemetry: {
                hr,
                time,
                source: 'garmin-daily-heart-rate',
                timeUnit: 'elapsed_seconds',
                startTimeIso: startIso,
                endTimeIso: endIso,
                durationSeconds: (selection.endMs - selection.startMs) / 1000,
                sampleCount: hr.length
            },
            dataOrigin: {
                heartRateSeries: {
                    source: 'garmin_health_records',
                    dataType: 'heart_rate',
                    method: 'dailyHeartRate',
                    recordDate: selection.date,
                    sampleCount: hr.length,
                    timeUnit: 'elapsed_seconds',
                    importedAt: new Date().toISOString(),
                    selectedStart: startIso,
                    selectedEnd: endIso
                }
            }
        };

        state.rawActivities = Array.isArray(state.rawActivities) ? state.rawActivities : [];
        state.rawActivities.push(activity);
        if (saveDataToLocalStorage() === false) {
            state.rawActivities = state.rawActivities.filter(item => item !== activity);
            throw new Error('Die Aktivität konnte nicht gespeichert werden. Bitte prüfe deine Anmeldung.');
        }
        refreshAll();
        closeDailyHrActivityModal();
        window.openCSVDetailsModal?.(encodeURIComponent(String(activity.id)));
    } catch (error) {
        setStatus(error?.message || 'Die Aktivität konnte nicht erstellt werden.', true);
    }
}
