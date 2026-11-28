import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=8';
import { getEnabledSportsCatalog, toLocalDateString, escapeHtml } from './utils.js';

let pendingExercises = [];
const CANOE = new Set(['Kayaking', 'C1', 'C2']);
const PADDLE = new Set(['Kayaking', 'C1', 'C2', 'PaddleErgo']);
const $ = id => document.getElementById(id);
const val = id => $(id)?.value?.trim() ?? '';
const visible = (id, show) => $(id)?.classList.toggle('hidden', !show);

function optionalNumber(id, min, max, integer = false) {
    const raw = val(id);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
        throw new Error('Bitte prüfe den eingetragenen Wert: ' + id);
    }
    return n;
}
function parsePace(raw, label) {
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[2]) > 59) throw new Error(label + ' bitte im Format mm:ss eingeben, z. B. 05:30.');
    return Number(match[1]) * 60 + Number(match[2]);
}
function renderSports(selected = 'Kayaking') {
    const select = $('manual-activity-sport');
    if (!select) return;
    const catalog = getEnabledSportsCatalog();
    const order = ['Kayaking','C1','C2','PaddleErgo','Run','Ride','Swim','WeightTraining','Workout'];
    const keys = [...order.filter(key => catalog[key]), ...Object.keys(catalog).filter(key => !order.includes(key))];
    select.innerHTML = keys.map(key => '<option value="' + escapeHtml(key) + '">' + escapeHtml(catalog[key].label || key) + '</option>').join('');
    if (keys.includes(selected)) select.value = selected;
    else if (keys.length) select.value = keys[0];
}
export function updateManualActivityFields() {
    const type = val('manual-activity-sport') || 'Workout';
    const canoe = CANOE.has(type), paddle = PADDLE.has(type);
    visible('manual-canoe-fields', canoe);
    visible('manual-c2-partner-field', type === 'C2');
    visible('manual-paddle-fields', paddle);
    visible('manual-run-fields', type === 'Run');
    visible('manual-ride-fields', type === 'Ride');
    visible('manual-swim-fields', type === 'Swim');
    visible('manual-strength-fields', type === 'WeightTraining');
    visible('manual-distance-field', !['WeightTraining','Workout'].includes(type));
    if ($('manual-distance-label')) $('manual-distance-label').textContent = type === 'Swim' ? 'Distanz (m)' : 'Distanz (km)';
    if ($('manual-paddle-metric-title')) $('manual-paddle-metric-title').textContent = type === 'PaddleErgo' ? 'Ergometerwerte' : 'Paddelwerte';
}
export function openManualActivityModal(date = '') {
    if (!$('manual-activity-modal')) return;
    const selectedDate = date || ((['day','month'].includes(state.activeCalendarFormat) && state.selectedCalendarDay)
        ? state.selectedCalendarDay : toLocalDateString(state.currentCalendarDate || new Date()));
    $('manual-activity-date').value = selectedDate || toLocalDateString();
    ['manual-activity-time','manual-activity-name','manual-activity-distance','manual-activity-avg-hr','manual-activity-max-hr','manual-activity-note',
     'manual-canoe-format','manual-canoe-water-type','manual-canoe-level','manual-canoe-discharge','manual-canoe-note','manual-c2-partner',
     'manual-paddle-speed','manual-paddle-power','manual-paddle-rate','manual-run-pace','manual-run-cadence','manual-run-elevation',
     'manual-ride-speed','manual-ride-power','manual-ride-cadence','manual-ride-elevation','manual-swim-pace','manual-swim-swolf',
     'manual-swim-rate','manual-swim-style','manual-swim-pool-length','manual-swim-length-count',
     'manual-strength-exercise','manual-strength-reps','manual-strength-weight'].forEach(id => { if ($(id)) $(id).value = ''; });
    $('manual-activity-category').value = 'ga';
    $('manual-activity-duration').value = '';
    $('manual-activity-rpe').value = '';
    pendingExercises = [];
    renderExerciseList();
    renderSports('Kayaking');
    updateManualActivityFields();
    $('manual-activity-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}
export function closeManualActivityModal() {
    $('manual-activity-modal')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}
export function addManualActivityExerciseSet() {
    const name = val('manual-strength-exercise'), repsRaw = val('manual-strength-reps'), weightRaw = val('manual-strength-weight');
    const reps = Number(repsRaw), weight = Number(weightRaw);
    if (!name) return alert('Bitte gib eine Übung an.');
    if (!repsRaw || !Number.isInteger(reps) || reps < 1 || reps > 100) return alert('Bitte gib 1 bis 100 Wiederholungen an.');
    if (!weightRaw || !Number.isFinite(weight) || weight < 0 || weight > 1000) return alert('Bitte gib ein gültiges Gewicht zwischen 0 und 1000 kg an.');
    let exercise = pendingExercises.find(item => item.name.toLowerCase() === name.toLowerCase());
    if (!exercise) { exercise = { name, sets: [] }; pendingExercises.push(exercise); }
    exercise.sets.push({ reps, weight });
    ['manual-strength-exercise','manual-strength-reps','manual-strength-weight'].forEach(id => $(id).value = '');
    renderExerciseList();
}
export function removeManualActivityExerciseSet(exerciseIndex, setIndex = -1) {
    const exercise = pendingExercises[Number(exerciseIndex)];
    if (!exercise?.sets?.length) return;
    exercise.sets.splice(setIndex < 0 ? exercise.sets.length - 1 : Number(setIndex), 1);
    if (!exercise.sets.length) pendingExercises.splice(Number(exerciseIndex), 1);
    renderExerciseList();
}
function renderExerciseList() {
    const target = $('manual-strength-list');
    if (!target) return;
    target.innerHTML = pendingExercises.length ? pendingExercises.map((exercise, index) =>
        '<div class="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-xs"><div><strong class="text-white">' +
        escapeHtml(exercise.name) + '</strong><span class="ml-2 text-slate-400">' +
        exercise.sets.map(set => set.reps + ' × ' + set.weight + ' kg').join(' · ') +
        '</span></div><button type="button" class="text-rose-300" onclick="removeManualActivityExerciseSet(' + index + ',-1)">Letzten Satz entfernen</button></div>'
    ).join('') : '<p class="text-[11px] text-slate-500">Noch keine Übungen eingetragen.</p>';
}
export function saveManualActivity() {
    try {
        const date = val('manual-activity-date'), type = val('manual-activity-sport');
        const duration = optionalNumber('manual-activity-duration', 1, 1440, true);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bitte wähle ein gültiges Trainingsdatum.');
        if (duration === null) throw new Error('Bitte trage die Trainingsdauer in Minuten ein.');
        const avgHr = optionalNumber('manual-activity-avg-hr', 30, 250, true);
        const maxHr = optionalNumber('manual-activity-max-hr', 30, 250, true);
        if (avgHr !== null && maxHr !== null && maxHr < avgHr) throw new Error('Die maximale Herzfrequenz darf nicht unter der durchschnittlichen Herzfrequenz liegen.');
        const rpe = optionalNumber('manual-activity-rpe', 0, 10, true);
        const activity = {
            id: 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2,8),
            source: 'manual', manual: true, date, name: (val('manual-activity-name') || 'Trainingseinheit').slice(0,120),
            type, category: val('manual-activity-category') || 'ga', duration
        };
        const time = val('manual-activity-time');
        if (time) activity.startTime = activity.startTimeLocal = date + 'T' + time + ':00';
        const distance = optionalNumber('manual-activity-distance', 0, 1000);
        if (distance !== null && !['WeightTraining','Workout'].includes(type)) activity.distance = type === 'Swim' ? distance / 1000 : distance;
        if (avgHr !== null) activity.hr = avgHr;
        if (maxHr !== null) activity.maxHr = maxHr;
        if (rpe !== null) { activity.perceivedEffort = rpe; activity.sRpeLoad = duration * rpe; }
        if (val('manual-activity-note')) activity.perceivedNote = val('manual-activity-note').slice(0,2000);

        if (CANOE.has(type)) {
            const format = val('manual-canoe-format'), waterType = val('manual-canoe-water-type');
            const level = optionalNumber('manual-canoe-level',0,100000), discharge = optionalNumber('manual-canoe-discharge',0,100000);
            if (format) activity.raceFormat = format;
            if (waterType || level !== null || discharge !== null || val('manual-canoe-note')) {
                activity.waterConditions = {};
                if (waterType) activity.waterConditions.type = waterType;
                if (level !== null) { activity.waterConditions.level = level; activity.waterConditions.levelUnit = 'cm'; }
                if (discharge !== null) activity.waterConditions.discharge = discharge;
                if (val('manual-canoe-note')) activity.waterConditions.note = val('manual-canoe-note').slice(0,200);
            }
            if (type === 'C2' && val('manual-c2-partner')) activity.trainingPartner = val('manual-c2-partner').slice(0,100);
        }
        if (PADDLE.has(type)) {
            const speed = optionalNumber('manual-paddle-speed',0,100), power = optionalNumber('manual-paddle-power',0,3000), rate = optionalNumber('manual-paddle-rate',0,300);
            if (speed !== null) activity.avgSpeed = speed;
            if (power !== null) activity.avgPower = power;
            if (rate !== null) activity.strokeRate = rate;
        }
        if (type === 'Run') {
            const pace = parsePace(val('manual-run-pace'),'Die Lauf-Pace');
            const cadence = optionalNumber('manual-run-cadence',0,300), elevation = optionalNumber('manual-run-elevation',0,100000);
            if (pace !== null) activity.avgPaceSecondsPerKm = pace;
            if (cadence !== null) activity.cadence = cadence;
            if (elevation !== null) activity.elevationGain = elevation;
        }
        if (type === 'Ride') {
            const speed = optionalNumber('manual-ride-speed',0,150), power = optionalNumber('manual-ride-power',0,3000);
            const cadence = optionalNumber('manual-ride-cadence',0,300), elevation = optionalNumber('manual-ride-elevation',0,100000);
            if (speed !== null) activity.avgSpeed = speed;
            if (power !== null) activity.avgPower = power;
            if (cadence !== null) activity.cadence = cadence;
            if (elevation !== null) activity.elevationGain = elevation;
        }
        if (type === 'Swim') {
            const pace = parsePace(val('manual-swim-pace'),'Die Schwimm-Pace');
            const swolf = optionalNumber('manual-swim-swolf',1,300,true), rate = optionalNumber('manual-swim-rate',0,300);
            const pool = optionalNumber('manual-swim-pool-length',5,100,true), lengths = optionalNumber('manual-swim-length-count',1,10000,true);
            if (pace !== null) activity.avgPaceSecondsPer100m = pace;
            if (swolf !== null) activity.swolf = swolf;
            if (rate !== null) activity.strokeRate = rate;
            if (pool !== null) activity.poolLengthMeters = pool;
            if (lengths !== null) activity.swimLengthCount = lengths;
            if (val('manual-swim-style')) activity.swimStroke = val('manual-swim-style');
        }
        if (type === 'WeightTraining' && pendingExercises.length) activity.exercises = pendingExercises.map(item => ({name:item.name,sets:item.sets.map(set=>({...set}))}));
        state.rawActivities = Array.isArray(state.rawActivities) ? state.rawActivities : [];
        if (state.rawActivities.some(item => item.manual === true && item.date === date && item.name === activity.name && item.type === type && item.duration === duration)) {
            if (!confirm('Eine sehr ähnliche manuelle Einheit ist bereits vorhanden. Trotzdem speichern?')) return;
        }
        state.rawActivities.push(activity);
        saveDataToLocalStorage();
        closeManualActivityModal();
        refreshAll();
        window.openCSVDetailsModal?.(encodeURIComponent(String(activity.id)));
    } catch (error) { alert(error?.message || 'Die Trainingseinheit konnte nicht gespeichert werden.'); }
}
