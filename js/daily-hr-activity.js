import { state, refreshAll } from './state.js';
import { supabase } from './supabase-client.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { selectGarminDailyHeartRateWindow } from './daily-heart-rate.js';
import { getGarminTelemetryActivityId } from './garmin-cloud-telemetry.js?v=5';
import { getGarminHeartRateSeries } from './data-source.js';

const $ = id => document.getElementById(id);
const value = id => $(id)?.value?.trim() ?? '';
let preview = null;
let previewBusy = false;

function localDateTimeMs(date, time) {
    return new Date(date + 'T' + time + ':00').getTime();
}

function dateAndTime(value) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const pad = number => String(number).padStart(2, '0');
    return {
        date: date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()),
        time: pad(date.getHours()) + ':' + pad(date.getMinutes())
    };
}

function setStatus(message, error = false) {
    const output = $('daily-hr-activity-status');
    if (!output) return;
    output.textContent = message;
    output.classList.toggle('hidden', !message);
    output.hidden = !message;
    output.classList.toggle('text-rose-300', error);
    output.classList.toggle('text-slate-300', !error);
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

function selectedActivity() {
    const activity = state.selectedActivityForModal;
    if (!activity) throw new Error('Es ist keine Aktivität geöffnet.');
    if (!getGarminTelemetryActivityId(activity)) {
        throw new Error('Diese Aktivität besitzt keine eindeutige Garmin-Aktivitäts-ID. Eine Zuordnung der Tages-HF wäre deshalb nicht sicher möglich.');
    }
    return activity;
}

function existingHeartRate(activity) {
    const series = getGarminHeartRateSeries(activity);
    return Array.isArray(series?.hr) && series.hr.length >= 2;
}

export function openDailyHrActivityModal() {
    const modal = $('daily-hr-activity-modal');
    if (!modal) return;
    let activity;
    try {
        activity = selectedActivity();
    } catch (error) {
        window.alert(error.message);
        return;
    }
    const start = dateAndTime(activity.startTimeLocal || activity.start_time_local || activity.startTime || activity.start_time);
    const end = dateAndTime(activity.endTimeLocal || activity.end_time_local || activity.endTime || activity.end_time);
    const durationMinutes = Number(activity.duration);
    const fallbackEnd = start && Number.isFinite(durationMinutes) && durationMinutes > 0
        ? new Date(new Date(start.date + 'T' + start.time + ':00').getTime() + durationMinutes * 60000)
        : null;
    const date = String(activity.date || start?.date || '').slice(0, 10);
    $('daily-hr-activity-date').value = date;
    $('daily-hr-activity-start').value = start?.time || '';
    $('daily-hr-activity-end').value = end?.time || (fallbackEnd && Number.isFinite(fallbackEnd.getTime())
        ? String(fallbackEnd.getHours()).padStart(2, '0') + ':' + String(fallbackEnd.getMinutes()).padStart(2, '0') : '');
    const activityLabel = activity.name || activity.type || 'Aktivität';
    $('daily-hr-activity-target').textContent = activityLabel + ' · ' + date;
    preview = null;
    const attach = $('daily-hr-activity-create');
    if (attach) attach.disabled = true;
    if (existingHeartRate(activity)) {
        setStatus('Für diese Aktivität ist bereits eine HF-Zeitreihe vorhanden. Sie wird nicht überschrieben.', true);
        if (attach) attach.disabled = true;
    } else {
        setStatus('Prüfe Start- und Endzeit. Die HF-Reihe wird anschließend dieser bestehenden Garmin-Aktivität zugeordnet.');
    }
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
    preview = null;
    const attach = $('daily-hr-activity-create');
    if (attach) attach.disabled = true;
    setStatus('Zeitraum geändert. Bitte lade die HF-Aufzeichnung erneut.');
}

export async function previewDailyHrActivity() {
    if (previewBusy) return;
    let window;
    let activity;
    try {
        window = getWindow();
        activity = selectedActivity();
        if (existingHeartRate(activity)) throw new Error('Diese Aktivität besitzt bereits eine HF-Zeitreihe. Sie wird nicht überschrieben.');
        const activityDate = String(activity.date || window.date).slice(0, 10);
        if (window.date !== activityDate) throw new Error('Das Datum muss zum Trainingstag der geöffneten Aktivität passen (' + activityDate + ').');
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
        preview = { ...window, samples, activityId: String(activity.id) };
        const attach = $('daily-hr-activity-create');
        if (attach) attach.disabled = false;
        const gaps = samples.slice(1).map((sample, index) => (sample.timestampMs - samples[index].timestampMs) / 1000);
        const longGaps = gaps.filter(seconds => seconds > 30).length;
        const maxGap = gaps.length ? Math.max(...gaps) : 0;
        setStatus(samples.length + ' HF-Messpunkte gefunden. Größte Messlücke: ' + Math.round(maxGap)
            + ' s; ' + longGaps + ' Zeitabstände liegen über 30 s. Fehlende Werte werden nicht ergänzt.');
    } catch (error) {
        preview = null;
        const attach = $('daily-hr-activity-create');
        if (attach) attach.disabled = true;
        setStatus(error?.message || 'Die Tages-HF-Aufzeichnung konnte nicht geladen werden.', true);
    } finally {
        previewBusy = false;
        if (button) { button.disabled = false; button.textContent = 'HF-Aufzeichnung laden'; }
    }
}

export function createDailyHrActivity() {
    try {
        const selection = getWindow();
        const activity = selectedActivity();
        if (!preview || preview.date !== selection.date || preview.startMs !== selection.startMs
            || preview.endMs !== selection.endMs || preview.activityId !== String(activity.id)
            || preview.samples.length < 2) {
            throw new Error('Bitte lade die HF-Aufzeichnung für die aktuell geöffnete Aktivität erneut.');
        }
        if (existingHeartRate(activity)) throw new Error('Diese Aktivität besitzt inzwischen bereits eine HF-Zeitreihe. Es wurde nichts überschrieben.');
        const hr = preview.samples.map(sample => sample.hr);
        const time = preview.samples.map(sample => Math.round((sample.timestampMs - selection.startMs) / 1000 * 10) / 10);
        const averageHr = Math.round(hr.reduce((sum, value) => sum + value, 0) / hr.length);
        const maxHr = Math.max(...hr);
        const previous = activity.dailyHeartRateSeries;
        activity.dailyHeartRateSeries = {
            hr,
            time,
            source: 'garmin-daily-heart-rate',
            timeUnit: 'elapsed_seconds',
            sampleCount: hr.length,
            startTimeIso: new Date(selection.startMs).toISOString(),
            endTimeIso: new Date(selection.endMs).toISOString(),
            averageHr,
            maxHr,
            attachedAt: new Date().toISOString()
        };
        activity.dataOrigin = {
            ...(activity.dataOrigin || {}),
            dailyHeartRateSeries: {
                source: 'garmin_health_records',
                dataType: 'heart_rate',
                method: 'dailyHeartRate',
                recordDate: selection.date,
                sampleCount: hr.length,
                selectedStart: activity.dailyHeartRateSeries.startTimeIso,
                selectedEnd: activity.dailyHeartRateSeries.endTimeIso
            }
        };
        if (saveDataToLocalStorage() === false) {
            if (previous) activity.dailyHeartRateSeries = previous;
            else delete activity.dailyHeartRateSeries;
            throw new Error('Die HF-Zeitreihe konnte nicht gespeichert werden. Bitte prüfe deine Anmeldung.');
        }
        preview = null;
        closeDailyHrActivityModal();
        refreshAll();
        // Keep the same activity detail open and redraw its newly attached series.
        const current = (state.rawActivities || []).find(item => String(item.id) === String(activity.id));
        if (current) {
            state.selectedActivityForModal = current;
            window.openCSVDetailsModal?.(encodeURIComponent(String(current.id)));
        }
    } catch (error) {
        setStatus(error?.message || 'Die HF-Zeitreihe konnte nicht ergänzt werden.', true);
    }
}
