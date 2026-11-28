import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=8';
import { sportsCatalog, typeColorMap, getSportsCatalog, escapeHtml } from './utils.js';
import { getAdaptiveRestingHr, calculateHeartRateReserveZones } from './training-load.js?v=4';


const TELEMETRY_OPTIONS = {
  Kayaking: [
    ['hr', 'Herzfrequenz'], ['speed', 'Geschwindigkeit (Gerätemesswert)'],
    ['power', 'Leistung (Gerätemesswert)'], ['cadence', 'Frequenz / Zugfrequenz'],
    ['altitude', 'Höhe'], ['respiration', 'Atemfrequenz'],
    ['temperature', 'Temperatur'], ['bodyBattery', 'Body Battery'], ['pace', 'Pace']
  ],
  C1: [
    ['hr', 'Herzfrequenz'], ['speed', 'Geschwindigkeit (Gerätemesswert)'],
    ['power', 'Leistung (Gerätemesswert)'], ['cadence', 'Frequenz / Zugfrequenz'],
    ['altitude', 'Höhe'], ['respiration', 'Atemfrequenz'],
    ['temperature', 'Temperatur'], ['bodyBattery', 'Body Battery'], ['pace', 'Pace']
  ],
  C2: [
    ['hr', 'Herzfrequenz'], ['speed', 'Geschwindigkeit (Gerätemesswert)'],
    ['power', 'Leistung (Gerätemesswert)'], ['cadence', 'Frequenz / Zugfrequenz'],
    ['altitude', 'Höhe'], ['respiration', 'Atemfrequenz'],
    ['temperature', 'Temperatur'], ['bodyBattery', 'Body Battery'], ['pace', 'Pace']
  ],
  PaddleErgo: [
    ['hr', 'Herzfrequenz'], ['speed', 'Geschwindigkeit (Gerätemesswert)'],
    ['power', 'Leistung (Gerätemesswert)'], ['cadence', 'Frequenz / Zugfrequenz'],
    ['altitude', 'Höhe'], ['respiration', 'Atemfrequenz'],
    ['temperature', 'Temperatur'], ['bodyBattery', 'Body Battery'], ['pace', 'Pace']
  ],
  Run: [
    ['hr', 'Herzfrequenz'], ['pace', 'Pace'], ['speed', 'Geschwindigkeit'],
    ['cadence', 'Schrittfrequenz'], ['altitude', 'Höhe'],
    ['respiration', 'Atemfrequenz'], ['temperature', 'Temperatur'],
    ['groundcontacttime', 'Bodenkontaktzeit'], ['verticaloscillation', 'Vertikale Bewegung'],
    ['stridelength', 'Schrittlänge'], ['verticalratio', 'Vertikales Verhältnis']
  ],
  Ride: [
    ['hr', 'Herzfrequenz'], ['speed', 'Geschwindigkeit'], ['power', 'Leistung'],
    ['cadence', 'Trittfrequenz'], ['altitude', 'Höhe'],
    ['respiration', 'Atemfrequenz'], ['temperature', 'Temperatur'], ['grade', 'Steigung']
  ],
  Swim: [
    ['hr', 'Herzfrequenz'], ['pace', 'Pace'], ['cadence', 'Zugfrequenz'],
    ['swolf', 'SWOLF'], ['stroke', 'Schwimmstil / Zugtyp'],
    ['respiration', 'Atemfrequenz']
  ],
  WeightTraining: [
    ['hr', 'Herzfrequenz'], ['respiration', 'Atemfrequenz'], ['bodyBattery', 'Body Battery']
  ],
  Workout: [
    ['hr', 'Herzfrequenz'], ['speed', 'Geschwindigkeit'], ['power', 'Leistung'],
    ['cadence', 'Frequenz'], ['altitude', 'Höhe'], ['respiration', 'Atemfrequenz'],
    ['temperature', 'Temperatur'], ['bodyBattery', 'Body Battery']
  ]
};
const TELEMETRY_SPORT_LABELS = {
  Kayaking: 'K1', C1: 'C1', C2: 'C2', PaddleErgo: 'Paddelergometer',
  Run: 'Laufen', Ride: 'Radfahren', Swim: 'Schwimmen',
  WeightTraining: 'Krafttraining', Workout: 'Allg. Fitness'
};

function renderTelemetrySettings() {
  const box = document.getElementById('settings-telemetry-list');
  if (!box) return;
  const saved = state.settings?.telemetryMetrics || {};
  box.innerHTML = Object.entries(TELEMETRY_OPTIONS).map(([sport, options]) => {
    const configured = Array.isArray(saved[sport]) ? new Set(saved[sport]) : null;
    const selectedCount = configured ? options.filter(([key]) => configured.has(key)).length : options.length;
    return `<details class="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden" data-telemetry-sport="${sport}">
      <summary class="flex items-center justify-between gap-3 px-3 py-3 cursor-pointer list-none">
        <span class="min-w-0"><strong class="block text-xs text-white">${TELEMETRY_SPORT_LABELS[sport]}</strong>
        <small class="block mt-1 text-[10px] text-slate-500">${configured ? selectedCount + ' von ' + options.length + ' ausgewählt' : 'Alle verfügbaren Werte'}</small></span>
        <span class="text-[10px] text-slate-500">Anpassen ▾</span>
      </summary>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 pb-3">
        ${options.map(([key, label]) => `<label class="flex items-center gap-2 rounded-lg bg-slate-900/70 px-2.5 py-2 text-[11px] text-slate-300">
          <input type="checkbox" data-telemetry-metric="${key}" ${!configured || configured.has(key) ? 'checked' : ''} class="h-4 w-4 accent-cyan-500">
          <span>${label}</span>
        </label>`).join('')}
        <button type="button" data-telemetry-all class="sm:col-span-2 justify-self-start text-[10px] text-cyan-400">Alle Werte dieser Sportart anzeigen</button>
      </div>
    </details>`;
  }).join('');
  box.insertAdjacentHTML('beforeend', `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p id="settings-telemetry-save-status" class="hidden text-[11px] text-emerald-400" role="status" aria-live="polite"></p>
      <button type="button" onclick="saveTelemetrySettings()" class="w-full sm:w-auto rounded-lg bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400">Telemetrie-Einstellungen speichern</button>
    </div>`);
  box.querySelectorAll('[data-telemetry-all]').forEach(button => button.addEventListener('click', () => {
    const details = button.closest('[data-telemetry-sport]');
    details?.querySelectorAll('[data-telemetry-metric]').forEach(input => { input.checked = true; });
  }));
}

function findRecordedMaxHr(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return [];
  const found = [];
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
    if (['maxhr','maxheartrate','maximumheartrate','maxheart_rate','maxheartratebpm'].includes(normalized)) {
      const number = Number(item);
      if (Number.isFinite(number) && number >= 80 && number <= 240) found.push(number);
    } else if (item && typeof item === 'object') {
      found.push(...findRecordedMaxHr(item, depth + 1));
    }
  }
  return found;
}

function detectMaxHr() {
  const profileValue = Number(state.profile?.maxHr);
  if (Number.isFinite(profileValue) && profileValue >= 80 && profileValue <= 240) {
    return { value: profileValue, source: 'Athletenprofil' };
  }
  const values = (Array.isArray(state.rawActivities) ? state.rawActivities : [])
    .flatMap(activity => findRecordedMaxHr(activity));
  if (values.length) return { value: Math.max(...values), source: 'höchster dokumentierter Aktivitätswert' };
  return { value: null, source: 'Noch kein geeigneter Wert vorhanden' };
}


export function previewHeartRateZones() {
  const maxHr = Number(document.getElementById('kajo-zone-maxhr')?.value);
  const windowDays = Number(document.getElementById('kajo-zone-rhr-window')?.value) || 14;
  const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
  const resting = getAdaptiveRestingHr(state.dailyCheckins || {}, today, windowDays, state.profile || {});
  const zones = resting?.value != null ? calculateHeartRateReserveZones(maxHr, resting.value) : null;
  const status = document.getElementById('kajo-zone-rhr-status');
  const preview = document.getElementById('kajo-zone-preview');
  if (status) status.textContent = resting?.value != null
    ? 'Adaptive Ruhe-HF: ' + resting.value + ' bpm · ' + resting.readingCount + '/' + resting.windowDays + ' Tageswerte'
      + (resting.source === 'profile-fallback' ? ' · statischer Profil-Fallback' : ' · 14-Tage-Median (bzw. gewählter Rückblick)')
      + (resting.quality === 'limited' ? ' · eingeschränkte Datenbasis' : '')
    : 'Keine adaptive Ruhe-HF verfügbar. Mindestens 60 % der Tage (mindestens drei Messwerte) oder ein Profilwert sind erforderlich.';
  if (preview) preview.textContent = zones
    ? 'Z1 bis ' + zones[0] + ' · Z2 bis ' + zones[1] + ' · Z3 bis ' + zones[2] + ' · Z4 bis ' + zones[3] + ' · Z5 darüber'
    : 'Aktuell nicht berechenbar: Bitte HFmax und Ruhe-HF-Daten prüfen.';
}

const sportColorPalette = [
  { label: 'Wildwater C1/K1 – Signalrot', color: '#E53935' },
  { label: 'Swimming – Ozeanblau', color: '#1E88E5' },
  { label: 'Cycling – Grün', color: '#43A047' },
  { label: 'Running – Orange', color: '#FB8C00' },
  { label: 'Strength / Gym – Purpur', color: '#8E24AA' },
  { label: 'Rowing / Canoeing – Cyan', color: '#00ACC1' },
  { label: 'Running Trail – Gelb', color: '#FDD835' },
  { label: 'Cardio / HIIT – Magenta', color: '#D81B60' },
  { label: 'Cross-Training – Indigo', color: '#3949AB' },
  { label: 'Outdoor / Adventure – Erdbraun', color: '#5D4037' }
];
function settingsColorDots(currentColor, inputAttribute) {
  const current = String(currentColor || '#64748b').toUpperCase();
  const palette = sportColorPalette.map(item => item.color);
  if (!palette.includes(current)) palette.unshift(current);
  const dots = palette.map(color => {
    const label = sportColorPalette.find(item => item.color === color)?.label || 'Eigene Farbe';
    return `<button type="button" data-color-option="${color}" onclick="selectSettingsColor(this)" title="${escapeHtml(label)}" aria-label="Farbe ${escapeHtml(label)}" aria-pressed="${color === current}" class="h-4 w-4 rounded-full border border-white/20 transition-transform hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${color === current ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950' : ''}" style="background-color:${color}"></button>`;
  }).join('');
  return `<div class="flex flex-wrap items-center gap-2 min-w-0" role="group" aria-label="Farbe auswählen">${dots}<input ${inputAttribute} type="hidden" value="${escapeHtml(current)}"></div>`;
}

export function selectSettingsColor(button) {
  const row = button?.closest('[data-sport-row], [data-category-row]');
  const input = row?.querySelector('[data-color-hex], [data-color]');
  if (!row || !input) return;
  input.value = button.dataset.colorOption || '';
  row.querySelectorAll('[data-color-option]').forEach(option => {
    const selected = option === button;
    option.classList.toggle('ring-2', selected);
    option.classList.toggle('ring-white', selected);
    option.classList.toggle('ring-offset-2', selected);
    option.classList.toggle('ring-offset-slate-950', selected);
    option.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function sportColorEditor(color) {
  return settingsColorDots(color, 'data-color-hex aria-label="Sportartfarbe"');
}
const slug = value => String(value||'sport').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'custom';

function renderRows() {
  const sports = getSportsCatalog();
  const selectedSports = new Set(Array.isArray(state.settings?.enabledSports) ? state.settings.enabledSports : Object.keys(sports));
  const categories = { ...typeColorMap, ...(state.settings?.categories||{}) };
  const sportBox = document.getElementById('settings-sports-list');
  const catBox = document.getElementById('settings-categories-list');
  const zoneBox = document.getElementById('settings-zones-list');
  if (!sportBox || !catBox || !zoneBox) return;
  renderTelemetrySettings();
  const loadSource = document.getElementById('training-load-source');
  if (loadSource) loadSource.value = state.settings?.trainingLoadSource === 'srpe' ? 'srpe' : 'kajo-zone';
  sportBox.innerHTML = Object.entries(sports).map(([key,v]) => `<div class="grid grid-cols-[auto_minmax(0,1fr)_minmax(145px,1fr)_auto] gap-2 items-center rounded-lg border border-slate-800 bg-slate-950/60 p-2" data-sport-row data-key="${key}"><input data-enabled type="checkbox" ${selectedSports.has(key) ? 'checked' : ''} aria-label="Sportart ${escapeHtml(v.label)} im Kalender verwenden" class="h-4 w-4 accent-sky-500"><input data-label value="${escapeHtml(v.label)}" class="min-w-0 w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white">${sportColorEditor(v.color)}${key.startsWith('custom-') ? '<button type="button" data-remove class="text-xs text-rose-400" title="Entfernen">×</button>' : '<span class="text-[10px] text-slate-600">Standard</span>'}</div>`).join('');
  catBox.innerHTML = Object.entries(categories).map(([key,v]) => `<div class="grid grid-cols-[minmax(0,1fr)_minmax(110px,auto)_auto] gap-2 items-center" data-category-row data-key="${key}"><input data-label value="${escapeHtml(v.label)}" class="min-w-0 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white">${settingsColorDots(v.color, 'data-color aria-label="Trainingskategorienfarbe"')}${key.startsWith('custom-') ? '<button type="button" data-remove class="text-xs text-rose-400" title="Entfernen">×</button>' : '<span class="text-[10px] text-slate-600">Standard</span>'}</div>`).join('');
  const activeSports = Object.fromEntries(Object.entries(sports).filter(([key]) => selectedSports.has(key)));
  for (const id of ['modal-edit-sport-select','plan-sport']) { const select=document.getElementById(id); if(select){ const current=select.value; select.innerHTML=Object.entries(activeSports).map(([key,v])=>`<option value="${escapeHtml(key)}">${escapeHtml(v.label)}</option>`).join(''); if(current&&sports[current])select.value=current; } }
  for (const id of ['modal-edit-type-select','plan-category']) { const select=document.getElementById(id); if(select){ const current=select.value; select.innerHTML=Object.entries(categories).map(([key,v])=>`<option value="${escapeHtml(key)}">${escapeHtml(v.label)}</option>`).join(''); if(current&&categories[current])select.value=current; } }
  const detected = detectMaxHr();
  const zoneSettings = state.settings?.heartRateZoneSettings || {};
  const windowDays = Number(zoneSettings.restingHrWindowVersion) >= 2
    ? Math.min(28, Math.max(3, Number(zoneSettings.restingHrWindowDays) || 14)) : 14;
  const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
  const adaptiveRhr = getAdaptiveRestingHr(state.dailyCheckins || {}, today, windowDays, state.profile || {});
  const adaptiveZones = adaptiveRhr?.value != null ? calculateHeartRateReserveZones(detected.value, adaptiveRhr.value) : null;
  const zonePreview = adaptiveZones
    ? 'Z1 bis ' + adaptiveZones[0] + ' · Z2 bis ' + adaptiveZones[1] + ' · Z3 bis ' + adaptiveZones[2] + ' · Z4 bis ' + adaptiveZones[3] + ' · Z5 darüber'
    : 'Aktuell nicht berechenbar: HFmax oder ausreichende Ruhe-HF-Daten fehlen.';
  const rhrStatus = adaptiveRhr?.value != null
    ? 'Adaptive Ruhe-HF: ' + adaptiveRhr.value + ' bpm · ' + adaptiveRhr.readingCount + '/' + adaptiveRhr.windowDays + ' Tageswerte'
      + (adaptiveRhr.source === 'profile-fallback' ? ' · statischer Profil-Fallback' : ' · Median der letzten Tage')
      + (adaptiveRhr.quality === 'limited' ? ' · eingeschränkte Datenbasis' : '')
    : 'Keine adaptive Ruhe-HF verfügbar. Mindestens 60 % der Tage (mindestens drei Messwerte) oder ein Ruhe-HF-Profilwert sind erforderlich.';
  zoneBox.innerHTML = `<div class="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div><p class="text-sm font-semibold text-white">Automatische Herzfrequenzzonen</p>
        <p class="mt-1 text-[11px] text-slate-400">Herzfrequenzreserve (Karvonen): HFmax minus adaptive Ruhe-HF. Keine manuell hinterlegten oder laktatbasierten Zonengrenzen.</p></div>
      <span class="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300">5 Zonen</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
        <label for="kajo-zone-maxhr" class="text-[11px] font-medium text-slate-300">Maximale Herzfrequenz</label>
        <div class="mt-2 flex items-center gap-2"><input id="kajo-zone-maxhr" type="number" min="100" max="240" step="1" oninput="previewHeartRateZones()" value="${detected.value ?? ''}" placeholder="z. B. 201" class="w-28 bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white"><span class="text-xs text-slate-400">bpm</span></div>
        <p class="mt-2 text-[10px] leading-relaxed text-slate-500">Quelle: ${escapeHtml(detected.source)}. Die HFmax bleibt als stabiler Profilwert erhalten und wird nicht aus der Ruhe-HF abgeleitet.</p>
      </div>
      <div class="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
        <label for="kajo-zone-rhr-window" class="text-[11px] font-medium text-slate-300">Rückblick für stabile Trainingszonen</label>
        <div class="mt-2 flex items-center gap-2"><select id="kajo-zone-rhr-window" onchange="previewHeartRateZones()" class="w-28 bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white">
          ${[7,10,14,21,28].map(days => `<option value="${days}" ${days===windowDays?'selected':''}>${days} Tage</option>`).join('')}
        </select><span class="text-xs text-slate-400">Tageswerte</span></div>
        <p class="mt-2 text-[10px] leading-relaxed text-slate-500">Verwendet wird der Median gültiger Ruhe-HF-Tageswerte bis einschließlich des Aktivitätstags. Mindestens 60 % der Tage (mindestens drei Messwerte) sind erforderlich.</p>
      </div>
    </div>
    <div class="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-2">
      <p id="kajo-zone-rhr-status" class="text-[11px] text-slate-300">${escapeHtml(rhrStatus)}</p>
      <p id="kajo-zone-preview" class="text-[11px] font-semibold text-white">${escapeHtml(zonePreview)}</p>
      <p class="text-[10px] text-slate-500">Zonengrenzen: 60 %, 70 %, 80 % und 90 % der Herzfrequenzreserve. Bei weniger als drei Tagesmessungen wird – falls hinterlegt – die statische Ruhe-HF aus dem Athletenprofil als gekennzeichneter Fallback verwendet.</p>
    </div>
    <div class="pt-2 border-t border-slate-800">
      <p class="text-[10px] leading-relaxed text-slate-400 mb-2">Jede Aktivität erhält die zu ihrem Datum passende adaptive Ruhe-HF. Historische Aktivitäten werden daher mit dem jeweiligen zurückliegenden Fenster berechnet und nicht mit dem heutigen Ruhepuls überschrieben.</p>
      <button type="button" onclick="saveSettings()" class="w-full rounded-xl bg-sky-500 px-4 py-3 text-xs font-bold text-slate-950 hover:bg-sky-400">Automatische Zonen-Einstellungen speichern</button>
    </div>
  </div>`;
  sportBox.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => btn.closest('[data-sport-row]').remove()));
  catBox.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => btn.closest('[data-category-row]').remove()));
}

export function initializeSettings() { renderRows(); }
let editingCalendarSeasonId = null;

function getCalendarSeasonCollection() {
  const current = state.settings || {};
  let seasons = Array.isArray(current.calendarSeasons) ? current.calendarSeasons.filter(item => item && typeof item === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(item.start || '') && /^\d{4}-\d{2}-\d{2}$/.test(item.end || '') && item.start <= item.end) : [];
  if (!seasons.length && current.calendarSeason?.start && current.calendarSeason?.end) { const legacy=current.calendarSeason; seasons=[{id:'season-legacy',name:legacy.name||'Saison',start:legacy.start,end:legacy.end}]; }
  let activeId=current.activeCalendarSeasonId; if(!seasons.some(item=>item.id===activeId))activeId=seasons.at(-1)?.id||null;
  return {seasons,activeId};
}
function persistCalendarSeasonCollection(seasons,activeId) {
  const active=seasons.find(item=>item.id===activeId)||null;
  state.settings={...(state.settings||{}),calendarSeasons:seasons,activeCalendarSeasonId:activeId,...(active?{calendarSeason:{name:active.name,start:active.start,end:active.end}}:{})};
  if(!active)delete state.settings.calendarSeason; saveDataToLocalStorage();
}
function calendarSeasonStats(season) {
  const within=item=>item?.date>=season.start&&item?.date<=season.end;
  const health=Object.entries(state.healthLogs||{}).filter(([date,item])=>date>=season.start&&date<=season.end&&(item?.status==='sick'||item?.status==='injured'));
  return {training:(state.rawActivities||[]).filter(within).length,planned:(state.plannedActivities||[]).filter(within).length,races:(state.races||[]).filter(within).length,sick:health.filter(([,item])=>item.status==='sick').length,injured:health.filter(([,item])=>item.status==='injured').length};
}
export function renderCalendarSeasonSettings() {
  const {seasons,activeId}=getCalendarSeasonCollection();
  const name=document.getElementById('calendar-season-name'),start=document.getElementById('calendar-season-start'),end=document.getElementById('calendar-season-end'),status=document.getElementById('calendar-season-status'),list=document.getElementById('calendar-season-list'),saveButton=document.getElementById('calendar-season-save-button');
  const editing=seasons.find(item=>item.id===editingCalendarSeasonId);
  if(name&&!editingCalendarSeasonId)name.value=''; if(start&&!editingCalendarSeasonId)start.value=''; if(end&&!editingCalendarSeasonId)end.value='';
  if(editing){if(name)name.value=editing.name||'';if(start)start.value=editing.start;if(end)end.value=editing.end;}
  if(saveButton)saveButton.textContent=editing?'Änderungen speichern':'Saison hinzufügen';
  if(status)status.textContent=seasons.length?seasons.length+(seasons.length===1?' Saison gespeichert.':' Saisons gespeichert.')+' · '+(seasons.find(item=>item.id===activeId)?.name||'Keine aktive Saison')+' ist im Kalender ausgewählt.':'Noch keine Saison angelegt. Lege deine erste Saison an.';
  if(list)list.innerHTML=seasons.length?seasons.slice().sort((a,b)=>b.start.localeCompare(a.start)).map(season=>{
    const stats=calendarSeasonStats(season),active=season.id===activeId,id=escapeHtml(season.id);
    return '<article class="rounded-xl border '+(active?'border-sky-500/60 bg-sky-950/20':'border-slate-800 bg-slate-950/50')+' p-3 space-y-2">'+
      '<div class="flex flex-wrap items-start justify-between gap-2"><div><div class="flex flex-wrap items-center gap-2"><strong class="text-sm text-slate-100">'+escapeHtml(season.name||'Saison')+'</strong>'+(active?'<span class="text-[10px] rounded-full bg-sky-500/15 text-sky-300 px-2 py-1">Aktiv im Kalender</span>':'')+'</div><p class="text-xs text-slate-400">'+season.start+' – '+season.end+'</p></div><div class="flex flex-wrap gap-1">'+
      (active?'':'<button type="button" class="kajo-settings-secondary" data-season-id="'+id+'" onclick="setCalendarSeasonActive(this.dataset.seasonId)">Anzeigen</button>')+
      '<button type="button" class="kajo-settings-secondary" data-season-id="'+id+'" onclick="editCalendarSeason(this.dataset.seasonId)">Bearbeiten</button><button type="button" class="kajo-settings-secondary" data-season-id="'+id+'" onclick="deleteCalendarSeason(this.dataset.seasonId)">Löschen</button></div></div>'+
      '<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-slate-400"><span><strong class="block text-slate-200">'+stats.training+'</strong>Training</span><span><strong class="block text-slate-200">'+stats.planned+'</strong>Geplant</span><span><strong class="block text-slate-200">'+stats.races+'</strong>Wettkämpfe</span><span><strong class="block text-slate-200">'+stats.sick+'</strong>Krankheitstage</span><span><strong class="block text-slate-200">'+stats.injured+'</strong>Verletzungstage</span></div></article>';
  }).join(''):'<p class="text-xs text-slate-500">Deine gespeicherten Saisons werden hier gesammelt angezeigt.</p>';
}
export function newCalendarSeason(){editingCalendarSeasonId=null;const name=document.getElementById('calendar-season-name'),start=document.getElementById('calendar-season-start'),end=document.getElementById('calendar-season-end');if(name)name.value='';if(start)start.value='';if(end)end.value='';renderCalendarSeasonSettings();}
export function editCalendarSeason(id){const {seasons}=getCalendarSeasonCollection();if(!seasons.some(item=>item.id===id))return;editingCalendarSeasonId=id;renderCalendarSeasonSettings();}
export function setCalendarSeasonActive(id){const {seasons}=getCalendarSeasonCollection();if(!seasons.some(item=>item.id===id))return;persistCalendarSeasonCollection(seasons,id);editingCalendarSeasonId=null;renderCalendarSeasonSettings();refreshAll();}
export function saveCalendarSeason(){
  const name=document.getElementById('calendar-season-name')?.value.trim()||'Saison',start=document.getElementById('calendar-season-start')?.value||'',end=document.getElementById('calendar-season-end')?.value||'';
  if(!start||!end){alert('Bitte lege Saisonstart und Saisonende fest.');return;}if(start>end){alert('Das Saisonende muss am oder nach dem Saisonstart liegen.');return;}
  const {seasons}=getCalendarSeasonCollection(),id=editingCalendarSeasonId||('season-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)),next={id,name,start,end};
  const updated=editingCalendarSeasonId?seasons.map(item=>item.id===id?next:item):[...seasons,next];persistCalendarSeasonCollection(updated,id);editingCalendarSeasonId=null;renderCalendarSeasonSettings();refreshAll();
}
export function deleteCalendarSeason(id){
  const {seasons,activeId}=getCalendarSeasonCollection(),targetId=id||activeId,target=seasons.find(item=>item.id===targetId);if(!target)return;
  if(!confirm('Möchtest du die Saison "'+(target.name||'Saison')+'" wirklich löschen?'))return;
  const remaining=seasons.filter(item=>item.id!==targetId),nextActive=targetId===activeId?(remaining.at(-1)?.id||null):activeId;persistCalendarSeasonCollection(remaining,nextActive);
  if(editingCalendarSeasonId===targetId)editingCalendarSeasonId=null;if(state.activeCalendarFormat==='season'&&!nextActive)state.activeCalendarFormat='month';renderCalendarSeasonSettings();refreshAll();
}
export function openSettingsModal() {
  renderRows();renderCalendarSeasonSettings();
  document.getElementById('settings-modal')?.classList.remove('hidden');
}
export function closeSettingsModal() { document.getElementById('settings-modal')?.classList.add('hidden'); }
export function addCustomSport() {
  const label = prompt('Name der neuen Sportart:');
  if (!label?.trim()) return;
  const key = 'custom-' + slug(label);
  const box = document.getElementById('settings-sports-list');
  if (box.querySelector(`[data-key="${key}"]`)) { alert('Diese Sportart existiert bereits.'); return; }
  box.insertAdjacentHTML('beforeend', `<div class="grid grid-cols-[auto_minmax(0,1fr)_minmax(145px,1fr)_auto] gap-2 items-center rounded-lg border border-slate-800 bg-slate-950/60 p-2" data-sport-row data-key="${key}"><input data-enabled type="checkbox" checked aria-label="Sportart ${escapeHtml(label.trim())} im Kalender verwenden" class="h-4 w-4 accent-sky-500"><input data-label value="${escapeHtml(label.trim())}" class="min-w-0 w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white">${sportColorEditor(sportColorPalette[box.children.length%sportColorPalette.length].color)}<button type="button" data-remove class="text-xs text-rose-400">×</button></div>`);
  box.lastElementChild.querySelector('[data-remove]').addEventListener('click',e=>e.currentTarget.closest('[data-sport-row]').remove());
}
export function addCustomCategory() {
  const label = prompt('Name der neuen Trainingslegende:');
  if (!label?.trim()) return;
  const key = 'custom-' + slug(label);
  const box = document.getElementById('settings-categories-list');
  if (box.querySelector(`[data-key="${key}"]`)) { alert('Diese Kategorie existiert bereits.'); return; }
  const color = sportColorPalette[box.children.length % sportColorPalette.length].color;
  box.insertAdjacentHTML('beforeend', `<div class="grid grid-cols-[minmax(0,1fr)_minmax(110px,auto)_auto] gap-2 items-center" data-category-row data-key="${key}"><input data-label value="${escapeHtml(label.trim())}" class="min-w-0 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white">${settingsColorDots(color, 'data-color aria-label="Trainingskategorienfarbe"')}<button type="button" data-remove class="text-xs text-rose-400">×</button></div>`);
  box.lastElementChild.querySelector('[data-remove]').addEventListener('click',e=>e.currentTarget.closest('[data-category-row]').remove());
}
export function saveTelemetrySettings() {
  const telemetryMetrics = { ...(state.settings?.telemetryMetrics || {}) };
  const cards = [...document.querySelectorAll('#settings-telemetry-list [data-telemetry-sport]')];
  if (!cards.length) {
    alert('Die Telemetrie-Einstellungen konnten nicht gefunden werden. Bitte öffne die Einstellungen erneut.');
    return;
  }
  cards.forEach(card => {
    const sport = card.dataset.telemetrySport;
    telemetryMetrics[sport] = [...card.querySelectorAll('[data-telemetry-metric]:checked')]
      .map(input => input.dataset.telemetryMetric);
  });
  state.settings = { ...state.settings, telemetryMetrics };
  saveDataToLocalStorage();
  cards.forEach(card => {
    const count = card.querySelectorAll('[data-telemetry-metric]:checked').length;
    const total = card.querySelectorAll('[data-telemetry-metric]').length;
    const summary = card.querySelector('summary small');
    if (summary) summary.textContent = count + ' von ' + total + ' ausgewählt';
  });
  const status = document.getElementById('settings-telemetry-save-status');
  if (status) {
    status.textContent = 'Telemetrie-Einstellungen gespeichert.';
    status.classList.remove('hidden');
  }
}

export function saveSettings() {
  const sports = {}, categories = {};
  const trainingLoadSource = document.getElementById('training-load-source')?.value || 'kajo-zone';
  const telemetryMetrics = { ...(state.settings?.telemetryMetrics || {}) };
  if (!['kajo-zone', 'srpe'].includes(trainingLoadSource)) { alert('Bitte wähle eine gültige Trainingsbelastungsquelle.'); return; }
  // Legacy-Zonengrenzen bleiben für ältere Datensätze erhalten; die aktive
  // Berechnung verwendet ausschließlich das adaptive Herzfrequenzreserve-Modell.
  const zones = { ...(state.settings?.heartRateZones || {}) };
  const zoneMethods = { ...(state.settings?.heartRateZoneMethods || {}), global: 'karvonen-adaptive' };
  const zoneThresholds = { ...(state.settings?.heartRateThresholds || {}) };
  let invalidSportColor = false;
  const enabledSports = [];
  document.querySelectorAll('#settings-sports-list [data-sport-row]').forEach(row => {
    const key = row.dataset.key;
    const label = row.querySelector('[data-label]').value.trim();
    const colorInput = row.querySelector('[data-color-hex]');
    const color = colorInput?.value.trim() || '';
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) { invalidSportColor = true; colorInput?.classList.add('border-rose-500'); return; }
    if (label) {
      sports[key] = { label, color: color.toUpperCase() };
      if (row.querySelector('[data-enabled]')?.checked) enabledSports.push(key);
    }
  });
  if (invalidSportColor) { alert('Bitte gib für jede Sportart einen gültigen Hex-Farbcode im Format #RRGGBB ein.'); return; }
  if (!enabledSports.length) { alert('Bitte wähle mindestens eine Sportart für den Kalender aus.'); return; }
  document.querySelectorAll('#settings-categories-list [data-category-row]').forEach(row => { const key=row.dataset.key,label=row.querySelector('[data-label]').value.trim(),color=row.querySelector('[data-color]').value;if(label)categories[key]={...(typeColorMap[key]||{bg:'bg-slate-900',text:'text-slate-200',border:'border-slate-700',bar:'bg-slate-500'}),label,color}; });
  const maxHrInput = document.getElementById('kajo-zone-maxhr');
  const maxHrRaw = maxHrInput?.value.trim() || '';
  let zoneMaxHr = null;
  if (maxHrRaw) {
    zoneMaxHr = Number(maxHrRaw);
    if (!Number.isFinite(zoneMaxHr) || zoneMaxHr < 100 || zoneMaxHr > 240) {
      alert('Die maximale Herzfrequenz muss zwischen 100 und 240 bpm liegen.');
      return;
    }
  }
  const windowDays = Number(document.getElementById('kajo-zone-rhr-window')?.value || state.settings?.heartRateZoneSettings?.restingHrWindowDays || 14);
  if (!Number.isInteger(windowDays) || windowDays < 3 || windowDays > 28) {
    alert('Der Rückblick für die adaptive Ruhe-HF muss zwischen 3 und 28 Tagen liegen.');
    return;
  }
  if (zoneMaxHr !== null) state.profile = { ...state.profile, maxHr: zoneMaxHr };
  const heartRateZoneSettings = {
    method: 'karvonen-adaptive',
    restingHrWindowDays: windowDays,
    restingHrWindowVersion: 2
  };
  const knownActivityTypes = new Set([
    ...Object.keys(sports),
    ...(Array.isArray(state.rawActivities) ? state.rawActivities.map(activity => activity?.type).filter(Boolean) : [])
  ]);
  Object.keys(zones).forEach(key => { if (key !== 'global' && !knownActivityTypes.has(key)) delete zones[key]; });
  Object.keys(zoneThresholds).forEach(key => { if (!sports[key]) delete zoneThresholds[key]; });
  const activeSportsForSelect = Object.fromEntries(Object.entries(sports).filter(([key]) => enabledSports.includes(key)));
  for(const [id,items] of [['modal-edit-sport-select',activeSportsForSelect],['plan-sport',activeSportsForSelect],['modal-edit-type-select',categories],['plan-category',categories]]){const select=document.getElementById(id);if(select){const current=select.value;select.innerHTML=Object.entries(items).map(([key,v])=>'<option value="'+escapeHtml(key)+'">'+escapeHtml(v.label)+'</option>').join('');if(items[current])select.value=current;}}
  document.querySelectorAll('#settings-telemetry-list [data-telemetry-sport]').forEach(card => {
    const sport = card.dataset.telemetrySport;
    const selected = [...card.querySelectorAll('[data-telemetry-metric]:checked')]
      .map(input => input.dataset.telemetryMetric);
    telemetryMetrics[sport] = selected;
  });
  state.settings={...state.settings,sports,enabledSports,categories,heartRateZones:zones,heartRateZoneMethods:zoneMethods,heartRateThresholds:zoneThresholds,heartRateZoneSettings,trainingLoadSource,telemetryMetrics};
  saveDataToLocalStorage();
  closeSettingsModal();
  refreshAll();
}
