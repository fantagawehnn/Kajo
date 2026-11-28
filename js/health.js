/* ============================================================
 * health.js – Täglicher Check-in, Gesundheitsstatus, Krankheit/Verletzung
 * (Die Anzeige der Tageswerte steckt in dashboard.js → inspectDay,
 *  die Kalender-Darstellung in calendar.js.)
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage, flushLocalPersistence } from './storage.js?v=8';
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
        ['input-weight', 'weight']
    ];
    fields.forEach(([id, key]) => {
        const input = document.getElementById(id);
        if (!input) return;
        const hasValue = current[key] !== null && current[key] !== undefined && current[key] !== '';
        input.value = hasValue ? current[key] : (input.type === 'range' ? input.defaultValue : '');
        if (['sleepQuality', 'soreness', 'fatigue', 'motivation', 'stress'].includes(key)) {
            // A slider's HTML default is only a visual starting point, not a user response.
            input.dataset.checkinTouched = 'false';
            if (!input.dataset.checkinTouchBound) {
                input.addEventListener('input', () => { input.dataset.checkinTouched = 'true'; });
                input.dataset.checkinTouchBound = 'true';
            }
        }
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
    if (pain) {
        pain.value = cycle.pain ?? 0;
        pain.dataset.cycleTouched = 'false';
        if (!pain.dataset.cycleTouchBound) {
            pain.addEventListener('input', () => { pain.dataset.cycleTouched = 'true'; });
            pain.dataset.cycleTouchBound = 'true';
        }
    }
    const impact = document.getElementById('input-cycle-impact');
    if (impact) {
        impact.value = cycle.trainingImpact ?? 0;
        impact.dataset.cycleTouched = 'false';
        if (!impact.dataset.cycleTouchBound) {
            impact.addEventListener('input', () => { impact.dataset.cycleTouched = 'true'; });
            impact.dataset.cycleTouchBound = 'true';
        }
    }
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

    // Das Dashboard kann ohne geöffnetes bzw. vollständig gerendertes Check-in-Formular
    // aktualisiert werden. Fehlende optionale Formularelemente dürfen die Initialisierung
    // der übrigen App deshalb nicht abbrechen.
    const valueLabels = [
        ['input-sleep-quality', 'lbl-sleep'],
        ['input-soreness', 'lbl-soreness'],
        ['input-fatigue', 'lbl-fatigue'],
        ['input-motivation', 'lbl-motivation'],
        ['input-stress', 'lbl-stress'],
        ['input-cycle-pain', 'lbl-cycle-pain'],
        ['input-cycle-impact', 'lbl-cycle-impact']
    ];

    valueLabels.forEach(([inputId, labelId]) => {
        const input = document.getElementById(inputId);
        const label = document.getElementById(labelId);
        if (input && label) label.textContent = input.value;
    });
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
    // Zyklusbeschwerden und Trainingseinfluss können an jedem Zyklustag auftreten.
    // Die Detailfelder bleiben deshalb unabhängig von der Periodenmarkierung sichtbar.
    const section = document.getElementById('cycle-details');
    if (section) {
        section.classList.remove('hidden');
        section.style.display = 'block';
        section.setAttribute('aria-hidden', 'false');
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
    const existing = state.dailyCheckins[todayStr] || {};
    const scaleUpdates = {};
    const scaleFields = [
        ['input-sleep-quality', 'sleepQuality'],
        ['input-soreness', 'soreness'],
        ['input-fatigue', 'fatigue'],
        ['input-motivation', 'motivation'],
        ['input-stress', 'stress']
    ];
    for (const [inputId, key] of scaleFields) {
        const input = document.getElementById(inputId);
        const wasRecorded = Object.prototype.hasOwnProperty.call(existing, key)
            && existing[key] !== null && existing[key] !== undefined && existing[key] !== '';
        const wasTouched = input?.dataset?.checkinTouched === 'true';
        if (!wasRecorded && !wasTouched) continue;
        const value = Number.parseInt(input?.value, 10);
        if (!Number.isInteger(value) || value < 1 || value > 5) {
            alert('Bitte prüfe deine Self-Monitoring-Angaben. Die Skalen müssen zwischen 1 und 5 liegen.');
            return;
        }
        scaleUpdates[key] = value;
    }
    const weightEnabled = document.getElementById('input-weight-enabled')?.checked === true;
    const weightRaw = document.getElementById('input-weight')?.value.trim() || '';
    const weightVal = weightEnabled && weightRaw !== '' ? Number(weightRaw) : NaN;
    if (weightEnabled && weightRaw !== '' && (!Number.isFinite(weightVal) || weightVal <= 0)) {
        alert('Bitte gib ein gültiges Körpergewicht größer als 0 kg ein.');
        return;
    }
    const isSick = document.getElementById('input-sick')?.checked === true;
    const hDiag = document.getElementById('input-health-diagnosis')?.value.trim() || '';

    // Garmin-Gesundheitswerte werden ausschließlich synchronisiert und hier nicht editiert.
    const checkin = {
        ...existing,
        ...scaleUpdates,
        weight: weightEnabled && Number.isFinite(weightVal) ? weightVal : existing.weight
    };
    const cycleSection = document.getElementById('cycle-checkin-section');
    const cycleEnabled = cycleSection && !cycleSection.classList.contains('hidden');
    if (cycleEnabled) {
        const period = document.getElementById('input-period')?.checked === true;
        const bleeding = document.getElementById('input-cycle-bleeding')?.value || '';
        const painInput = document.getElementById('input-cycle-pain');
        const impactInput = document.getElementById('input-cycle-impact');
        const notes = document.getElementById('input-cycle-notes')?.value || '';
        const symptoms = [...document.querySelectorAll('#cycle-symptoms input:checked')].map(el => el.value);
        const painTouched = painInput?.dataset?.cycleTouched === 'true';
        const impactTouched = impactInput?.dataset?.cycleTouched === 'true';
        const hasCycleEntry = period || bleeding !== '' || notes.trim() !== '' || symptoms.length > 0
            || painTouched || impactTouched
            || (existing.cycle && (existing.cycle.pain != null || existing.cycle.trainingImpact != null
                || existing.cycle.notes || (existing.cycle.symptoms || []).length));
        if (hasCycleEntry) {
            checkin.cycle = {
                ...existing.cycle,
                period,
                bleeding,
                ...(painTouched || existing.cycle?.pain != null ? { pain: Number(painInput?.value || 0) } : {}),
                ...(impactTouched || existing.cycle?.trainingImpact != null ? { trainingImpact: Number(impactInput?.value || 0) } : {}),
                notes,
                symptoms
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


// Eigenständige Periodenverwaltung in der Gesundheitsdaten-Ansicht.
let editingPeriodRange = null;
function getManagedPeriodRanges() {
    const days = Object.keys(state.dailyCheckins || {})
        .filter(date => state.dailyCheckins[date]?.cycle?.period === true)
        .sort();
    const ranges = [];
    for (const date of days) {
        const last = ranges[ranges.length - 1];
        const next = last ? new Date(last.end + 'T12:00:00') : null;
        if (last && next) {
            next.setDate(next.getDate() + 1);
            if (toLocalDateString(next) === date) { last.end = date; last.days++; continue; }
        }
        ranges.push({ start: date, end: date, days: 1 });
    }
    return ranges.sort((a, b) => b.start.localeCompare(a.start));
}
function formatPeriodDate(date) {
    return new Date(date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function renderManagedPeriods() {
    const list = document.getElementById('kajo-period-list');
    if (!list) return;
    const today = toLocalDateString();
    ['kajo-period-start','kajo-period-end'].forEach(id => { const input=document.getElementById(id); if(input) input.max=today; });
    const ranges = getManagedPeriodRanges();
    const count = document.getElementById('kajo-period-count');
    if (count) count.textContent = ranges.length + (ranges.length === 1 ? ' Zeitraum' : ' Zeiträume');
    list.replaceChildren();
    if (!ranges.length) {
        const empty=document.createElement('p'); empty.className='kajo-period-empty'; empty.textContent='Noch keine Periodentage eingetragen.'; list.appendChild(empty); return;
    }
    ranges.forEach(range => {
        const card=document.createElement('article'); card.className='kajo-period-entry';
        const copy=document.createElement('div'); copy.className='kajo-period-entry-copy';
        const title=document.createElement('strong'); title.textContent=range.start===range.end?formatPeriodDate(range.start):formatPeriodDate(range.start)+' – '+formatPeriodDate(range.end);
        const meta=document.createElement('span'); meta.textContent=range.days+' '+(range.days===1?'Tag':'Tage');
        copy.append(title,meta);
        const edit=document.createElement('button'); edit.type='button'; edit.className='kajo-period-edit'; edit.textContent='Bearbeiten'; edit.addEventListener('click',()=>editPeriodRange(range.start,range.end));
        card.append(copy,edit); list.appendChild(card);
    });
}
export function editPeriodRange(start,end) {
    editingPeriodRange={start,end};
    document.getElementById('kajo-period-start').value=start;
    document.getElementById('kajo-period-end').value=end;
    document.getElementById('kajo-period-form-title').textContent='Zeitraum bearbeiten';
    document.getElementById('kajo-period-form-hint').textContent='Passe Beginn oder Ende an oder entferne den Zeitraum vollständig.';
    document.getElementById('kajo-period-cancel').classList.remove('hidden');
    document.getElementById('kajo-period-delete').classList.remove('hidden');
    document.getElementById('kajo-period-feedback').textContent='';
    document.getElementById('kajo-period-start').scrollIntoView({behavior:'smooth',block:'center'});
}
export function cancelPeriodEdit() {
    editingPeriodRange=null;
    document.getElementById('kajo-period-start').value='';
    document.getElementById('kajo-period-end').value='';
    document.getElementById('kajo-period-form-title').textContent='Periode eintragen';
    document.getElementById('kajo-period-form-hint').textContent='Wähle den ersten und letzten Periodentag.';
    document.getElementById('kajo-period-cancel').classList.add('hidden');
    document.getElementById('kajo-period-delete').classList.add('hidden');
    document.getElementById('kajo-period-feedback').textContent='';
}
function setPeriodFlag(date,enabled) {
    const entry=state.dailyCheckins[date];
    if (enabled) {
        const next={...(entry||{})}; next.cycle={...(next.cycle||{}),period:true}; state.dailyCheckins[date]=next;
    } else if(entry?.cycle) {
        const cycle={...entry.cycle}; delete cycle.period;
        if(Object.keys(cycle).length) entry.cycle=cycle; else delete entry.cycle;
        if(Object.keys(entry).length) state.dailyCheckins[date]=entry; else delete state.dailyCheckins[date];
    }
}
function applyPeriodRange(start,end,enabled) {
    const date=new Date(start+'T12:00:00'),last=new Date(end+'T12:00:00');
    while(date<=last){setPeriodFlag(toLocalDateString(date),enabled);date.setDate(date.getDate()+1);}
}
export function deleteManagedPeriod() {
    if(!editingPeriodRange)return;
    const range={...editingPeriodRange};
    const snapshot={};
    const cursor=new Date(range.start+'T12:00:00'),last=new Date(range.end+'T12:00:00');
    while(cursor<=last){
        const date=toLocalDateString(cursor),entry=state.dailyCheckins[date];
        snapshot[date]=entry?{...entry,cycle:entry.cycle?{...entry.cycle}:undefined}:null;
        cursor.setDate(cursor.getDate()+1);
    }
    applyPeriodRange(range.start,range.end,false);
    if(saveDataToLocalStorage()!==true){
        Object.entries(snapshot).forEach(([date,entry])=>{if(entry)state.dailyCheckins[date]=entry;else delete state.dailyCheckins[date];});
        document.getElementById('kajo-period-feedback').textContent='Der Zeitraum konnte nicht gelöscht werden. Bitte prüfe deine Anmeldung.';
        return;
    }
    cancelPeriodEdit();
    renderManagedPeriods();
    refreshAll();
}
export function saveManagedPeriod() {
    const start=document.getElementById('kajo-period-start').value;
    const end=document.getElementById('kajo-period-end').value;
    const today=toLocalDateString(), feedback=document.getElementById('kajo-period-feedback');
    if(!start||!end||start>end||end>today){feedback.textContent='Bitte wähle einen gültigen Zeitraum bis einschließlich heute.';return;}
    const previous=editingPeriodRange;
    const snapshot={};
    const snapshotStart=previous&&previous.start<start?previous.start:start;
    const snapshotEnd=previous&&previous.end>end?previous.end:end;
    const cursor=new Date(snapshotStart+'T12:00:00'),last=new Date(snapshotEnd+'T12:00:00');
    while(cursor<=last){
        const date=toLocalDateString(cursor),entry=state.dailyCheckins[date];
        snapshot[date]=entry?{...entry,cycle:entry.cycle?{...entry.cycle}:undefined}:null;
        cursor.setDate(cursor.getDate()+1);
    }
    if(previous) applyPeriodRange(previous.start,previous.end,false);
    applyPeriodRange(start,end,true);
    const saved=saveDataToLocalStorage();
    if(saved!==true){
        Object.entries(snapshot).forEach(([date,entry])=>{if(entry)state.dailyCheckins[date]=entry;else delete state.dailyCheckins[date];});
        feedback.textContent='Die Änderungen konnten nicht gespeichert werden. Bitte prüfe deine Anmeldung und versuche es erneut.';
        return;
    }
    cancelPeriodEdit();
    renderManagedPeriods();
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

export async function saveRetroactiveHealthLog() {
    const saveButton = document.getElementById('health-log-save-button');
    if (saveButton?.disabled) return;

    const dateFromStr = document.getElementById('health-log-date-from').value;
    const dateToStr = document.getElementById('health-log-date-to').value;
    const status = document.getElementById('health-log-status').value;
    const diagnosis = document.getElementById('health-log-diagnosis').value.trim() || (status === 'sick' ? 'Infekt' : 'Verletzung');

    const curr = parseLocalDate(dateFromStr);
    const end = parseLocalDate(dateToStr);
    if (!dateFromStr || !dateToStr || Number.isNaN(curr.getTime()) || Number.isNaN(end.getTime()) || curr > end) {
        alert('Bitte prüfe den eingetragenen Zeitraum.');
        return;
    }
    if (!['healthy', 'sick', 'injured'].includes(status)) {
        alert('Bitte wähle einen gültigen Gesundheitsstatus.');
        return;
    }

    const previous = {};
    const changedDates = [];
    const cursor = new Date(curr);
    while (cursor <= end) {
        const date = toLocalDateString(cursor);
        previous[date] = Object.prototype.hasOwnProperty.call(state.healthLogs, date)
            ? { exists: true, value: state.healthLogs[date] }
            : { exists: false };
        if (status !== 'healthy') state.healthLogs[date] = { status, diagnosis };
        else delete state.healthLogs[date];
        changedDates.push(date);
        cursor.setDate(cursor.getDate() + 1);
    }

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Speichert …';
    }

    try {
        if (saveDataToLocalStorage() !== true) {
            throw new Error('Für dein Konto ist kein aktiver Datenspeicher verfügbar. Bitte melde dich erneut an.');
        }
    } catch (error) {
        changedDates.forEach(date => {
            if (previous[date].exists) state.healthLogs[date] = previous[date].value;
            else delete state.healthLogs[date];
        });
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Speichern';
        }
        alert('Nicht gespeichert: ' + (error?.message || 'Der lokale Speichervorgang ist fehlgeschlagen.'));
        return;
    }

    // Der lokale Speichervorgang ist synchron bestätigt. Die Oberfläche wird
    // sofort aktualisiert; IndexedDB und Cloud werden im Hintergrund geprüft,
    // damit ein langsamer Cloud-Request den Speichern-Button nicht blockiert.
    refreshAll();
    closeHealthLogModal();

    if (saveButton) saveButton.textContent = 'Gespeichert';
    void flushLocalPersistence().catch(error => {
        console.error('Zusätzliche lokale IndexedDB-Sicherung fehlgeschlagen; der localStorage-Eintrag bleibt erhalten:', error);
        alert('Der Gesundheitseintrag wurde lokal gespeichert. Die zusätzliche IndexedDB-Sicherung ist fehlgeschlagen.');
    }).finally(() => {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Speichern';
        }
    });
}
