/* ============================================================
 * health.js – Täglicher Check-in, Gesundheitsstatus, Krankheit/Verletzung
 * (Die Anzeige der Tageswerte steckt in dashboard.js → inspectDay,
 *  die Kalender-Darstellung in calendar.js.)
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js';
import { toLocalDateString, parseLocalDate } from './utils.js';

export function loadCheckinInputs() {
    const todayStr = state.selectedDashboardDate || toLocalDateString();
    const current = state.dailyCheckins[todayStr] || {};
    const dateLabel = document.getElementById('checkin-selected-date');
    if (dateLabel) dateLabel.textContent = todayStr === toLocalDateString() ? 'Heute' : new Date(todayStr + 'T12:00:00').toLocaleDateString('de-DE');
    const fields = [
        ['input-sleep-quality', 'sleepQuality'],
        ['input-soreness', 'soreness'],
        ['input-fatigue', 'fatigue'],
        ['input-motivation', 'motivation'],
        ['input-stress', 'stress'],
        ['input-hrv', 'hrv'],
        ['input-rhr', 'rhr'],
        ['input-sleep-duration', 'sleepDuration'],
        ['input-sleep-score', 'sleepScore'],
        ['input-respiration', 'respiration'],
        ['input-weight', 'weight']
    ];
    fields.forEach(([id, key]) => {
        const input = document.getElementById(id);
        if (!input) return;
        const hasValue = current[key] !== null && current[key] !== undefined && current[key] !== '';
        input.value = hasValue ? current[key] : (input.type === 'range' ? input.defaultValue : '');
    });
    const healthLog = state.healthLogs[todayStr] || {};
    const sickInput = document.getElementById('input-sick');
    if (sickInput) sickInput.checked = healthLog.status === 'sick';
    const diagnosisInput = document.getElementById('input-health-diagnosis');
    if (diagnosisInput) diagnosisInput.value = healthLog.status === 'sick' ? (healthLog.diagnosis || '') : '';
    const weightToggle = document.getElementById('input-weight-enabled');
    if (weightToggle) weightToggle.checked = current.weight !== null && current.weight !== undefined && current.weight !== '';
    toggleCheckinOptionalFields();
    const cycleSection = document.getElementById('cycle-checkin-section');
    const periodToggle = document.getElementById('period-checkin-toggle');
    const cycleEnabled = state.profile?.gender === 'female' && state.profile?.cycleTrackingEnabled === true;
    if (cycleSection) {
        cycleSection.classList.toggle('hidden', !cycleEnabled);
        cycleSection.style.display = cycleEnabled ? 'block' : 'none';
    }
    if (periodToggle) {
        periodToggle.classList.toggle('hidden', !cycleEnabled);
        periodToggle.style.display = cycleEnabled ? 'flex' : 'none';
    }
    const cycle = current.cycle || {};
    const periodInput = document.getElementById('input-period');
    if (periodInput) periodInput.checked = cycle.period === true;
    const bleeding = document.getElementById('input-cycle-bleeding');
    if (bleeding) bleeding.value = cycle.bleeding || '';
    const pain = document.getElementById('input-cycle-pain');
    if (pain) pain.value = cycle.pain ?? 0;
    const impact = document.getElementById('input-cycle-impact');
    if (impact) impact.value = cycle.trainingImpact ?? 0;
    const notes = document.getElementById('input-cycle-notes');
    if (notes) notes.value = cycle.notes || '';
    document.querySelectorAll('#cycle-symptoms input').forEach(el => { el.checked = (cycle.symptoms || []).includes(el.value); });
    toggleCycleFields();
    updateCheckin();
}

function checkinScaleColor(score) {
    if (score <= 20) return '#a855f7'; // Lila
    if (score <= 40) return '#ef4444'; // Rot
    if (score <= 60) return '#f97316'; // Orange
    if (score <= 80) return '#eab308'; // Gelb
    return '#22c55e'; // Grün
}

function updateCheckinSliderFills() {
    document.querySelectorAll('.checkin-range').forEach(slider => {
        const min = Number(slider.min || 0);
        const max = Number(slider.max || 100);
        const value = Number(slider.value);
        const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;
        slider.style.setProperty('--range-progress', progress + '%');
        const reverse = ['input-soreness', 'input-fatigue', 'input-stress', 'input-cycle-pain', 'input-cycle-impact'].includes(slider.id);
        const quality = reverse ? 100 - progress : progress;
        const color = checkinScaleColor(quality);
        slider.style.setProperty('--range-fill-color', color);
        const label = document.getElementById(({ 'input-sleep-quality':'lbl-sleep', 'input-soreness':'lbl-soreness', 'input-fatigue':'lbl-fatigue', 'input-motivation':'lbl-motivation', 'input-stress':'lbl-stress', 'input-cycle-pain':'lbl-cycle-pain', 'input-cycle-impact':'lbl-cycle-impact' })[slider.id]);
        if (label) label.style.color = color;
    });
}

export function updateCheckin() {
    updateCheckinSliderFills();
    const sleep = document.getElementById('input-sleep-quality').value;
    const soreness = document.getElementById('input-soreness').value;
    const fatigue = document.getElementById('input-fatigue').value;
    const motivation = document.getElementById('input-motivation').value;
    const stress = document.getElementById('input-stress').value;

    document.getElementById('lbl-sleep').textContent = sleep;
    document.getElementById('lbl-soreness').textContent = soreness;
    document.getElementById('lbl-fatigue').textContent = fatigue;
    document.getElementById('lbl-motivation').textContent = motivation;
    document.getElementById('lbl-stress').textContent = stress;
    const pain = document.getElementById('input-cycle-pain');
    const impact = document.getElementById('input-cycle-impact');
    const painLabel = document.getElementById('lbl-cycle-pain');
    const impactLabel = document.getElementById('lbl-cycle-impact');
    if (pain && painLabel) painLabel.textContent = pain.value;
    if (impact && impactLabel) impactLabel.textContent = impact.value;
}

export function toggleCheckinOptionalFields() {
    const sick = document.getElementById('input-sick');
    const sickDetails = document.getElementById('sick-details');
    if (sickDetails) sickDetails.classList.toggle('hidden', !sick?.checked);
    const weight = document.getElementById('input-weight-enabled');
    const weightDetails = document.getElementById('weight-details');
    if (weightDetails) weightDetails.classList.toggle('hidden', !weight?.checked);
}

export function toggleCycleFields() {
    const section = document.getElementById('cycle-details');
    const period = document.getElementById('input-period');
    if (section && period) {
        const showDetails = period.checked === true;
        section.classList.toggle('hidden', !showDetails);
        section.style.display = showDetails ? 'block' : 'none';
        section.setAttribute('aria-hidden', String(!showDetails));
    }
}

export function openDailyCheckinModal() {
    const modal = document.getElementById("daily-checkin-modal");
    const content = document.getElementById("daily-checkin-modal-content");
    const panel = document.getElementById("daily-checkin-panel");

    if (!modal || !content || !panel) {
        console.error("Check-in-Fenster konnte nicht geöffnet werden: Modal-Element fehlt.", {
            modalFound: Boolean(modal),
            contentFound: Boolean(content),
            panelFound: Boolean(panel)
        });
        return;
    }

    // Das Formular zuerst aus dem ggf. ausgeblendeten Dashboard-Detailbereich lösen.
    if (panel.parentElement !== content) content.appendChild(panel);

    // Das Dialogfenster unabhängig von der nachfolgenden Formularbefüllung öffnen.
    delete modal.dataset.saved;
    modal.hidden = false;
    modal.classList.remove("hidden");
    modal.style.setProperty("display", "block", "important");
    modal.style.setProperty("visibility", "visible", "important");
    modal.style.setProperty("pointer-events", "auto", "important");
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.zIndex = "2000";
    modal.style.display = "block";
    modal.style.visibility = "visible";
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("kajo-modal-open");

    // Ein Fehler beim Laden einzelner Check-in-Werte darf das Öffnen nicht verhindern.
    try {
        loadCheckinInputs();
    } catch (error) {
        console.error("Check-in-Felder konnten nicht vollständig geladen werden:", error);
    }
}

export function discardDailyCheckin() {
    const modal = document.getElementById("daily-checkin-modal");
    if (!modal) return;
    // Nicht gespeicherte Formularänderungen werden verworfen. Beim nächsten Öffnen
    // lädt loadCheckinInputs() wieder ausschließlich die gespeicherten Tagesdaten.
    modal.classList.add("hidden");
    modal.hidden = true;
    modal.style.setProperty("display", "none", "important");
    modal.style.setProperty("visibility", "hidden", "important");
    modal.style.setProperty("pointer-events", "none", "important");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("kajo-modal-open");
    delete modal.dataset.saved;
}

export function closeDailyCheckinModal() {
    const modal = document.getElementById("daily-checkin-modal");
    if (!modal) return;
    // Das Check-in-Fenster wird ausschließlich nach erfolgreichem Speichern geschlossen.
    if (!modal.classList.contains("hidden") && !modal.dataset.saved) return;
    modal.classList.add("hidden");
    modal.hidden = true;
    modal.style.setProperty("display", "none", "important");
    modal.style.setProperty("visibility", "hidden", "important");
    modal.style.setProperty("pointer-events", "none", "important");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("kajo-modal-open");
    delete modal.dataset.saved;
}

export function saveCheckin() {
    const todayStr = state.selectedDashboardDate || toLocalDateString();
    const sleep = parseInt(document.getElementById('input-sleep-quality').value);
    const soreness = parseInt(document.getElementById('input-soreness').value);
    const fatigue = parseInt(document.getElementById('input-fatigue').value);
    const motivation = parseInt(document.getElementById('input-motivation').value);
    const stress = parseInt(document.getElementById('input-stress').value);
    const weightEnabled = document.getElementById('input-weight-enabled')?.checked === true;
    const weightRaw = document.getElementById('input-weight')?.value.trim() || '';
    const weightVal = weightEnabled && weightRaw !== '' ? Number(weightRaw) : NaN;
    if (weightEnabled && weightRaw !== '' && (!Number.isFinite(weightVal) || weightVal <= 0)) {
        alert('Bitte gib ein gültiges Körpergewicht größer als 0 kg ein.');
        return;
    }
    const manualFields = [
        ['input-hrv', 'hrv', value => value > 0],
        ['input-rhr', 'rhr', value => value > 0],
        ['input-sleep-duration', 'sleepDuration', value => value > 0 && value <= 24],
        ['input-sleep-score', 'sleepScore', value => value >= 0 && value <= 100],
        ['input-respiration', 'respiration', value => value >= 4 && value <= 60]
    ];
    const wearableUpdates = {};
    for (const [inputId, key, isValid] of manualFields) {
        const input = document.getElementById(inputId);
        const raw = input?.value?.trim() || '';
        if (raw === '') continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || !isValid(value)) {
            alert('Bitte prüfe die manuellen Wearable-Werte: HRV und Ruhepuls müssen positiv sein, Schlafdauer zwischen 0 und 24 Stunden und Schlafscore zwischen 0 und 100 und Atemfrequenz zwischen 4 und 60 Atemzügen/min liegen.');
            return;
        }
        wearableUpdates[key] = value;
    }

    const isSick = document.getElementById('input-sick')?.checked === true;
    const hDiag = document.getElementById('input-health-diagnosis')?.value.trim() || '';

    // Preserve sync data like HRV, rhr if they exist
    const existing = state.dailyCheckins[todayStr] || {};
    
    const measurementSources = { ...(existing.measurementSources || {}) };
    const manualMeasurementMeta = {
        hrv: { source: 'manual', metric: 'unspecified', unit: 'ms' },
        rhr: { source: 'manual', metric: 'resting-heart-rate', unit: 'bpm' },
        sleepDuration: { source: 'manual', metric: 'sleep-duration', unit: 'h' },
        sleepScore: { source: 'manual', metric: 'sleep-score', unit: 'score-0-100' },
        respiration: { source: 'manual', metric: 'respiration-rate', unit: 'breaths/min' }
    };
    for (const key of Object.keys(wearableUpdates)) {
        measurementSources[key] = manualMeasurementMeta[key];
    }
    const checkin = {
        ...existing,
        sleepQuality: sleep,
        soreness, fatigue, motivation, stress,
        ...wearableUpdates,
        ...(Object.keys(measurementSources).length ? { measurementSources } : {}),
        weight: weightEnabled && Number.isFinite(weightVal) ? weightVal : existing.weight
    };
    const cycleSection = document.getElementById('cycle-checkin-section');
    const cycleEnabled = cycleSection && !cycleSection.classList.contains('hidden');
    if (cycleEnabled) {
        if (document.getElementById('input-period')?.checked) {
            checkin.cycle = {
                period: true,
                bleeding: document.getElementById('input-cycle-bleeding')?.value || '',
                pain: Number(document.getElementById('input-cycle-pain')?.value || 0),
                trainingImpact: Number(document.getElementById('input-cycle-impact')?.value || 0),
                notes: document.getElementById('input-cycle-notes')?.value || '',
                symptoms: [...document.querySelectorAll('#cycle-symptoms input:checked')].map(el => el.value)
            };
        } else {
            delete checkin.cycle;
        }
    }
    const previousCheckin = state.dailyCheckins[todayStr];
    const previousHealthLog = state.healthLogs[todayStr];
    state.dailyCheckins[todayStr] = checkin;

    if (isSick) {
        state.healthLogs[todayStr] = { status: 'sick', diagnosis: hDiag || 'Erkrankung' };
    } else if (state.healthLogs[todayStr]?.status === 'sick') {
        delete state.healthLogs[todayStr];
    }

    let saved = false;
    try {
        saved = saveDataToLocalStorage() === true;
    } catch (error) {
        console.error('Täglicher Check-in konnte nicht gespeichert werden:', error);
        alert('Der Check-in konnte nicht gespeichert werden. Bitte prüfe deine Anmeldung und versuche es erneut.');
        if (previousCheckin === undefined) delete state.dailyCheckins[todayStr];
        else state.dailyCheckins[todayStr] = previousCheckin;
        if (previousHealthLog === undefined) delete state.healthLogs[todayStr];
        else state.healthLogs[todayStr] = previousHealthLog;
        return;
    }

    if (!saved) {
        if (previousCheckin === undefined) delete state.dailyCheckins[todayStr];
        else state.dailyCheckins[todayStr] = previousCheckin;
        if (previousHealthLog === undefined) delete state.healthLogs[todayStr];
        else state.healthLogs[todayStr] = previousHealthLog;
        alert('Der Check-in wurde nicht gespeichert. Bitte melde dich erneut an und versuche es dann noch einmal.');
        return;
    }

    const checkinModal = document.getElementById('daily-checkin-modal');
    if (checkinModal) checkinModal.dataset.saved = 'true';
    closeDailyCheckinModal();
    refreshAll();
}

export function openHealthLogModal() { document.getElementById('health-modal').classList.remove('hidden'); }

export function openHealthLogForDate(dStr) {
    document.getElementById('health-log-date-from').value = dStr;
    document.getElementById('health-log-date-to').value = dStr;
    const current = state.healthLogs[dStr];
    if (current) {
        document.getElementById('health-log-status').value = current.status;
        document.getElementById('health-log-diagnosis').value = current.diagnosis || '';
    } else {
        document.getElementById('health-log-status').value = 'sick';
        document.getElementById('health-log-diagnosis').value = '';
    }
    openHealthLogModal();
}

export function closeHealthLogModal() { document.getElementById('health-modal').classList.add('hidden'); }

export function saveRetroactiveHealthLog() {
    const dateFromStr = document.getElementById('health-log-date-from').value;
    const dateToStr = document.getElementById('health-log-date-to').value;
    const status = document.getElementById('health-log-status').value;
    const diagnosis = document.getElementById('health-log-diagnosis').value || (status === 'sick' ? 'Infekt' : 'Verletzung');

    let curr = parseLocalDate(dateFromStr);
    const end = parseLocalDate(dateToStr);

    while (curr <= end) {
        const dStr = toLocalDateString(curr);
        if (status !== 'healthy') {
            state.healthLogs[dStr] = { status, diagnosis };
        } else {
            delete state.healthLogs[dStr];
        }
        curr.setDate(curr.getDate() + 1);
    }

    saveDataToLocalStorage();
    refreshAll();
    closeHealthLogModal();
}
