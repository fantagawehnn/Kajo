import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=3';
import { sportsCatalog, typeColorMap, getSportsCatalog, escapeHtml } from './utils.js';
import { getAdaptiveRestingHr, calculateHeartRateReserveZones } from './training-load.js';


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

const ZONE_METHODS = {
  manual: { label: 'Manuell' },
  maxhr_myprocoach: { label: '% HFmax – 5-Zonen-Modell' }
};

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

function getZoneBoundaries(method, base) {
  const percentages = method === 'maxhr_myprocoach' ? [0.73, 0.80, 0.87, 0.93] : null;
  if (!percentages || !Number.isFinite(Number(base)) || Number(base) <= 0) return null;
  return percentages.map(percent => Math.round(Number(base) * percent));
}

export function previewHeartRateZones() {
  const maxHr = Number(document.getElementById('kajo-zone-maxhr')?.value);
  const windowDays = Number(document.getElementById('kajo-zone-rhr-window')?.value) || 7;
  const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
  const resting = getAdaptiveRestingHr(state.dailyCheckins || {}, today, windowDays, state.profile || {});
  const zones = resting?.value != null ? calculateHeartRateReserveZones(maxHr, resting.value) : null;
  const status = document.getElementById('kajo-zone-rhr-status');
  const preview = document.getElementById('kajo-zone-preview');
  if (status) status.textContent = resting?.value != null
    ? 'Adaptive Ruhe-HF: ' + resting.value + ' bpm · ' + resting.readingCount + '/' + resting.windowDays + ' Tageswerte'
      + (resting.source === 'profile-fallback' ? ' · statischer Profil-Fallback' : ' · Median der letzten Tage')
      + (resting.quality === 'limited' ? ' · eingeschränkte Datenbasis' : '')
    : 'Keine adaptive Ruhe-HF verfügbar. Mindestens drei gültige Tageswerte oder ein Profilwert sind erforderlich.';
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
function sportColorEditor(color) {
  const current = String(color || '#64748b').toUpperCase();
  const preset = sportColorPalette.some(item => item.color === current);
  const options = sportColorPalette.map(item =>
    `<option value="${item.color}" ${item.color === current ? 'selected' : ''}>${item.label}</option>`
  ).join('');
  return `<div class="grid grid-cols-1 gap-1 min-w-0">
    <select data-color-preset onchange="if(this.value !== 'custom') this.parentElement.querySelector('[data-color-hex]').value=this.value" class="w-full min-w-0 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white">
      <option value="custom" ${preset ? '' : 'selected'}>Eigener Hex-Code</option>${options}
    </select>
    <input data-color-hex type="text" value="${escapeHtml(current)}" maxlength="7" placeholder="#RRGGBB" aria-label="Eigener Hex-Farbcode" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono">
  </div>`;
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
  if (loadSource) loadSource.value = state.settings?.trainingLoadSource || 'auto';
  sportBox.innerHTML = Object.entries(sports).map(([key,v]) => `<div class="grid grid-cols-[auto_minmax(0,1fr)_minmax(145px,1fr)_auto] gap-2 items-center rounded-lg border border-slate-800 bg-slate-950/60 p-2" data-sport-row data-key="${key}"><input data-enabled type="checkbox" ${selectedSports.has(key) ? 'checked' : ''} aria-label="Sportart ${escapeHtml(v.label)} im Kalender verwenden" class="h-4 w-4 accent-sky-500"><input data-label value="${escapeHtml(v.label)}" class="min-w-0 w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white">${sportColorEditor(v.color)}${key.startsWith('custom-') ? '<button type="button" data-remove class="text-xs text-rose-400" title="Entfernen">×</button>' : '<span class="text-[10px] text-slate-600">Standard</span>'}</div>`).join('');
  catBox.innerHTML = Object.entries(categories).map(([key,v]) => `<div class="grid grid-cols-[1fr_76px_auto] gap-2 items-center" data-category-row data-key="${key}"><input data-label value="${escapeHtml(v.label)}" class="min-w-0 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"><input data-color type="color" value="${v.color||'#64748b'}" class="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg">${key.startsWith('custom-') ? '<button type="button" data-remove class="text-xs text-rose-400" title="Entfernen">×</button>' : '<span class="text-[10px] text-slate-600">Standard</span>'}</div>`).join('');
  const activeSports = Object.fromEntries(Object.entries(sports).filter(([key]) => selectedSports.has(key)));
  for (const id of ['modal-edit-sport-select','plan-sport']) { const select=document.getElementById(id); if(select){ const current=select.value; select.innerHTML=Object.entries(activeSports).map(([key,v])=>`<option value="${escapeHtml(key)}">${escapeHtml(v.label)}</option>`).join(''); if(current&&sports[current])select.value=current; } }
  for (const id of ['modal-edit-type-select','plan-category']) { const select=document.getElementById(id); if(select){ const current=select.value; select.innerHTML=Object.entries(categories).map(([key,v])=>`<option value="${escapeHtml(key)}">${escapeHtml(v.label)}</option>`).join(''); if(current&&categories[current])select.value=current; } }
  const detected = detectMaxHr();
  const zoneSettings = state.settings?.heartRateZoneSettings || {};
  const windowDays = Math.min(28, Math.max(3, Number(zoneSettings.restingHrWindowDays) || 7));
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
    : 'Keine adaptive Ruhe-HF verfügbar. Mindestens drei gültige Tageswerte im Rückblickfenster oder ein Ruhe-HF-Profilwert sind erforderlich.';
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
        <label for="kajo-zone-rhr-window" class="text-[11px] font-medium text-slate-300">Rückblick für adaptive Ruhe-HF</label>
        <div class="mt-2 flex items-center gap-2"><select id="kajo-zone-rhr-window" onchange="previewHeartRateZones()" class="w-28 bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white">
          ${[7,10,14,21,28].map(days => `<option value="${days}" ${days===windowDays?'selected':''}>${days} Tage</option>`).join('')}
        </select><span class="text-xs text-slate-400">Tageswerte</span></div>
        <p class="mt-2 text-[10px] leading-relaxed text-slate-500">Verwendet wird der Median gültiger Ruhe-HF-Tageswerte bis einschließlich des Aktivitätstags. Mindestens drei Messwerte sind erforderlich.</p>
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
export function openSettingsModal() {
  renderRows();
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
  box.insertAdjacentHTML('beforeend', `<div class="grid grid-cols-[1fr_76px_auto] gap-2 items-center" data-category-row data-key="${key}"><input data-label value="${escapeHtml(label.trim())}" class="min-w-0 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"><input data-color type="color" value="${sportColorPalette[box.children.length % sportColorPalette.length]}" class="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg"><button type="button" data-remove class="text-xs text-rose-400">×</button></div>`);
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
  const trainingLoadSource = document.getElementById('training-load-source')?.value || 'auto';
  const telemetryMetrics = { ...(state.settings?.telemetryMetrics || {}) };
  if (!['auto', 'srpe'].includes(trainingLoadSource)) { alert('Bitte wähle eine gültige Trainingsbelastungsquelle.'); return; }
  // Vorhandene Zonengrenzen übernehmen, damit eine einzelne Änderung
  // nicht die übrigen Werte derselben oder anderer Sportarten verwirft.
  const zones = { ...(state.settings?.heartRateZones || {}) };
  const zoneMethods = {};
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
  const windowDays = Number(document.getElementById('kajo-zone-rhr-window')?.value || state.settings?.heartRateZoneSettings?.restingHrWindowDays || 7);
  if (!Number.isInteger(windowDays) || windowDays < 3 || windowDays > 28) {
    alert('Der Rückblick für die adaptive Ruhe-HF muss zwischen 3 und 28 Tagen liegen.');
    return;
  }
  if (zoneMaxHr !== null) state.profile = { ...state.profile, maxHr: zoneMaxHr };
  const heartRateZoneSettings = {
    method: 'karvonen-adaptive',
    restingHrWindowDays: windowDays
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
