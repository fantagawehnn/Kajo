import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=2';
import { sportsCatalog, typeColorMap, getSportsCatalog, escapeHtml } from './utils.js';


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
  const base = document.getElementById('kajo-zone-maxhr')?.value;
  const boundaries = getZoneBoundaries('maxhr_myprocoach', base);
  if (!boundaries || boundaries.some((value, index) => value < 40 || value > 240 || (index > 0 && value <= boundaries[index - 1]))) {
    alert('Bitte hinterlege eine plausible maximale Herzfrequenz zwischen 80 und 240 bpm.');
    return;
  }
  boundaries.forEach((value, index) => {
    const input = document.querySelector(`[data-zone-index="${index}"]`);
    if (input) input.value = value;
  });
  const note = document.getElementById('kajo-zone-note');
  if (note) note.textContent = 'Automatischer Vorschlag eingetragen. Du kannst jede Grenze jetzt manuell anpassen.';
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
  const loadSource = document.getElementById('training-load-source');
  if (loadSource) loadSource.value = state.settings?.trainingLoadSource || 'auto';
  sportBox.innerHTML = Object.entries(sports).map(([key,v]) => `<div class="grid grid-cols-[auto_minmax(0,1fr)_minmax(145px,1fr)_auto] gap-2 items-center rounded-lg border border-slate-800 bg-slate-950/60 p-2" data-sport-row data-key="${key}"><input data-enabled type="checkbox" ${selectedSports.has(key) ? 'checked' : ''} aria-label="Sportart ${escapeHtml(v.label)} im Kalender verwenden" class="h-4 w-4 accent-sky-500"><input data-label value="${escapeHtml(v.label)}" class="min-w-0 w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white">${sportColorEditor(v.color)}${key.startsWith('custom-') ? '<button type="button" data-remove class="text-xs text-rose-400" title="Entfernen">×</button>' : '<span class="text-[10px] text-slate-600">Standard</span>'}</div>`).join('');
  catBox.innerHTML = Object.entries(categories).map(([key,v]) => `<div class="grid grid-cols-[1fr_76px_auto] gap-2 items-center" data-category-row data-key="${key}"><input data-label value="${escapeHtml(v.label)}" class="min-w-0 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"><input data-color type="color" value="${v.color||'#64748b'}" class="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg">${key.startsWith('custom-') ? '<button type="button" data-remove class="text-xs text-rose-400" title="Entfernen">×</button>' : '<span class="text-[10px] text-slate-600">Standard</span>'}</div>`).join('');
  const activeSports = Object.fromEntries(Object.entries(sports).filter(([key]) => selectedSports.has(key)));
  for (const id of ['modal-edit-sport-select','plan-sport']) { const select=document.getElementById(id); if(select){ const current=select.value; select.innerHTML=Object.entries(activeSports).map(([key,v])=>`<option value="${escapeHtml(key)}">${escapeHtml(v.label)}</option>`).join(''); if(current&&sports[current])select.value=current; } }
  for (const id of ['modal-edit-type-select','plan-category']) { const select=document.getElementById(id); if(select){ const current=select.value; select.innerHTML=Object.entries(categories).map(([key,v])=>`<option value="${escapeHtml(key)}">${escapeHtml(v.label)}</option>`).join(''); if(current&&categories[current])select.value=current; } }
  const detected = detectMaxHr();
  const storedZones = state.settings?.heartRateZones || {};
  const legacyZoneValues = storedZones.global || Object.values(storedZones).find(values =>
    Array.isArray(values) && values.filter(value => value !== null && value !== undefined).length === 4
  ) || [];
  const automaticBoundaries = detected.value ? getZoneBoundaries('maxhr_myprocoach', detected.value) : [];
  const displayedZones = legacyZoneValues.length ? legacyZoneValues : (automaticBoundaries || []);
  zoneBox.innerHTML = `<div class="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div><p class="text-sm font-semibold text-white">Deine Herzfrequenzzonen</p>
        <p class="mt-1 text-[11px] text-slate-400">Ein gemeinsames Zonenprofil statt einer separaten Liste für jede Sportart.</p></div>
      <span class="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300">5 Zonen</span>
    </div>
    <div class="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
      <div class="flex items-center justify-between gap-2"><label for="kajo-zone-maxhr" class="text-[11px] font-medium text-slate-300">Erkannte maximale Herzfrequenz</label><span class="text-[10px] text-slate-500">${escapeHtml(detected.source)}</span></div>
      <div class="mt-2 flex items-center gap-2"><input id="kajo-zone-maxhr" type="number" min="80" max="240" step="1" value="${detected.value ?? ''}" placeholder="z. B. 190" class="w-28 bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white"><span class="text-xs text-slate-400">bpm</span>
      <button type="button" onclick="previewHeartRateZones()" class="ml-auto rounded-lg bg-sky-500/10 px-3 py-2 text-[11px] font-semibold text-sky-300">Zonen automatisch berechnen</button></div>
      <p class="mt-2 text-[10px] leading-relaxed text-slate-500">Die automatische Erkennung nutzt zuerst den Wert aus deinem Athletenprofil, andernfalls den höchsten in importierten Aktivitäten dokumentierten Maximalpuls. Das ist ein Ausgangswert und kein Ersatz für eine validierte Leistungsdiagnostik.</p>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      ${[1,2,3,4].map((n,i)=>`<label class="text-[10px] text-slate-400">Z${n} bis (bpm)<input data-zone-index="${i}" type="number" min="40" max="240" step="1" value="${displayedZones[i] ?? ''}" placeholder="bpm" class="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"></label>`).join('')}
    </div>
    <p class="text-[10px] text-slate-500">Z5 beginnt oberhalb der Z4-Grenze. Alle vier Grenzen können manuell angepasst werden.</p>
    <p id="kajo-zone-note" class="text-[10px] text-slate-400">${legacyZoneValues.length ? 'Gespeicherte Zonengrenzen geladen.' : (automaticBoundaries?.length ? 'Automatischer Vorschlag anhand der erkannten HFmax. Bitte prüfen und bei Bedarf anpassen.' : 'Noch keine HFmax erkannt. Trage einen Wert ein und berechne die Zonen oder gib die Grenzen manuell ein.')}</p>
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
export function saveSettings() {
  const sports = {}, categories = {};
  const trainingLoadSource = document.getElementById('training-load-source')?.value || 'auto';
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
  const zoneInputs = [...document.querySelectorAll('#settings-zones-list [data-zone-index]')];
  const enteredZones = [null, null, null, null];
  zoneInputs.forEach(input => {
    const index = Number(input.dataset.zoneIndex);
    const raw = input.value.trim();
    enteredZones[index] = raw === '' ? null : Number(raw);
  });
  const entered = enteredZones.filter(value => value !== null);
  if (entered.some(value => !Number.isFinite(value) || value < 40 || value > 240)) {
    alert('Herzfrequenz-Grenzen müssen zwischen 40 und 240 bpm liegen.');
    return;
  }
  if (entered.some((value, index) => index > 0 && value <= entered[index - 1])) {
    alert('Die Herzfrequenz-Grenzen müssen von Z1 bis Z4 aufsteigend sein.');
    return;
  }
  const maxHrInput = document.getElementById('kajo-zone-maxhr');
  const maxHrRaw = maxHrInput?.value.trim() || '';
  let zoneMaxHr = null;
  if (maxHrRaw) {
    zoneMaxHr = Number(maxHrRaw);
    if (!Number.isFinite(zoneMaxHr) || zoneMaxHr < 80 || zoneMaxHr > 240) {
      alert('Die maximale Herzfrequenz muss zwischen 80 und 240 bpm liegen.');
      return;
    }
  }
  if (entered.length) {
    zones.global = enteredZones;
    // Bestehende Auswertungen arbeiten weiterhin mit sportbezogenen Schlüsseln.
    // Das gemeinsame Profil wird deshalb für die vorhandenen Sportarten gespiegelt.
    for (const key of Object.keys(sports)) zones[key] = [...enteredZones];
  } else {
    delete zones.global;
  }
  if (zoneMaxHr !== null) state.profile = { ...state.profile, maxHr: zoneMaxHr };
  zoneMethods.global = entered.length ? 'manual' : 'maxhr_myprocoach';

  // Entfernte Sportarten sollen keine verwaisten Zoneneinstellungen behalten.
  Object.keys(zones).forEach(key => { if (key !== 'global' && !sports[key]) delete zones[key]; });
  Object.keys(zoneThresholds).forEach(key => { if (!sports[key]) delete zoneThresholds[key]; });
  const activeSportsForSelect = Object.fromEntries(Object.entries(sports).filter(([key]) => enabledSports.includes(key)));
  for(const [id,items] of [['modal-edit-sport-select',activeSportsForSelect],['plan-sport',activeSportsForSelect],['modal-edit-type-select',categories],['plan-category',categories]]){const select=document.getElementById(id);if(select){const current=select.value;select.innerHTML=Object.entries(items).map(([key,v])=>'<option value="'+escapeHtml(key)+'">'+escapeHtml(v.label)+'</option>').join('');if(items[current])select.value=current;}}
  state.settings={...state.settings,sports,enabledSports,categories,heartRateZones:zones,heartRateZoneMethods:zoneMethods,heartRateThresholds:zoneThresholds,trainingLoadSource};
  saveDataToLocalStorage();
  closeSettingsModal();
  refreshAll();
}
