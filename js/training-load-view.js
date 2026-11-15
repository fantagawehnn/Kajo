/* KAJO V2 – HR-zone training-load analysis.
 * All zone calculations are centralized in training-load.js.
 * This view deliberately excludes sRPE and CTL/ATL/TSB until sufficient
 * subjective session ratings are available and the model choice is revisited.
 */
import { state } from './state.js';
import { getHeartRateZoneAnalysis } from './training-load.js?v=3';

let selectedModel = 'kajo';
const charts = Object.create(null);
const periodCounts = { '7d': 7, '28d': 28, '3m': 90, '6m': 180, '1y': 365 };
const fmt = value => Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const zoneNames = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value == null ? '' : String(value);
}
function setVisible(id, visible) {
  document.getElementById(id)?.classList.toggle('hidden', !visible);
}
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}
function chartBase(id, key, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart !== 'function') return;
  destroyChart(key);
  charts[key] = new Chart(canvas.getContext('2d'), config);
}
function selectedActivities() {
  const all = Array.isArray(state.rawActivities) ? state.rawActivities : [];
  const range = state.activeTimeframe || '3m';
  if (range === 'custom') {
    const from = document.getElementById('date-from')?.value;
    const to = document.getElementById('date-to')?.value;
    return from && to && from <= to ? all.filter(a => String(a?.date || '').slice(0,10) >= from && String(a?.date || '').slice(0,10) <= to) : all;
  }
  const days = periodCounts[range];
  if (!days) return all;
  const cutoff = new Date();
  cutoff.setHours(0,0,0,0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  const key = [cutoff.getFullYear(), String(cutoff.getMonth()+1).padStart(2,'0'), String(cutoff.getDate()).padStart(2,'0')].join('-');
  return all.filter(a => String(a?.date || '').slice(0,10) >= key);
}
function renderCoverage(analysis) {
  const c = analysis.coverage;
  setText('training-load-source-title', selectedModel === 'kajo' ? 'KAJO-HF-Zonenindex' : selectedModel === 'edwards' ? 'Edwards TRIMP' : 'Vergleich der HF-Zonenmodelle');
  setText('training-load-source-description', selectedModel === 'kajo'
    ? 'Gewichtete Zeit in automatisch berechneten Herzfrequenzreserve-Zonen (Karvonen). Die Ruheherzfrequenz wird als Median der letzten konfigurierten Tage angepasst; die HFmax stammt aus deinem Athletenprofil.'
    : selectedModel === 'edwards'
      ? 'Gewichtete Zeit in fünf festen Bereichen relativ zur maximalen Herzfrequenz: 50–60 %, 60–70 %, 70–80 %, 80–90 % und ≥90 %. Zeit unter 50 % wird nicht gewertet.'
      : 'KAJO nutzt adaptive Herzfrequenzreserve-Zonen; Edwards nutzt feste Prozentbereiche der HFmax.');
  setText('training-load-coverage', 'Garmin-Aktivitäten im Zeitraum: ' + c.garminActivityCount
    + ' · KAJO berechenbar: ' + c.activitiesWithKajoZones
    + ' · Edwards berechenbar: ' + c.activitiesWithEdwards
    + (c.activitiesWithoutUsableAdaptiveRhr ? ' · KAJO ohne adaptive Ruhe-HF: ' + c.activitiesWithoutUsableAdaptiveRhr : '')
    + (c.activitiesWithoutUsableEdwardsMaxHr ? ' · Edwards ohne gültige HFmax/Zone: ' + c.activitiesWithoutUsableEdwardsMaxHr : ''));
  const maxHr = Number(state.profile?.maxHr);
  setText('training-load-edwards-maxhr-note', Number.isFinite(maxHr) && maxHr >= 100 && maxHr <= 240
    ? 'Für Edwards und die Herzfrequenzreserve verwendet: HFmax ' + maxHr + ' bpm aus deinem Athletenprofil.'
    : 'Die Zonenberechnung ist nicht möglich: In deinem Athletenprofil ist keine gültige HFmax hinterlegt.');
}
function renderZoneChart(analysis) {
  const keys = selectedModel === 'compare' ? ['kajo','edwards'] : [selectedModel];
  const colors = { kajo: '#6DA8F7', edwards: '#2FA47E' };
  const datasets = keys.map(key => ({
    label: key === 'kajo' ? 'KAJO' : 'Edwards',
    data: analysis[key].zonesMinutes,
    backgroundColor: colors[key],
    borderRadius: 4,
    maxBarThickness: 34
  }));
  chartBase('training-load-zone-chart', 'zoneChart', {
    type: 'bar',
    data: { labels: zoneNames, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: keys.length > 1, labels: { color: '#a9b5c2', usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: item => item.dataset.label + ' · ' + fmt(item.parsed.y) + ' min' } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#7d8a98' } },
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#7d8a98' }, title: { display: true, text: 'Minuten', color: '#7d8a98' } } }
    }
  });
  const total = keys.map(key => key === 'kajo' ? 'KAJO: ' : 'Edwards: ')
    .map((label, i) => label + fmt(analysis[keys[i]].totalZoneMinutes) + ' min · gewichteter Index ' + fmt(analysis[keys[i]].weightedLoad)).join('  |  ');
  setText('training-load-zone-totals', total || 'Keine auswertbaren HF-Zonendaten im Zeitraum.');
}
function renderDailyChart(analysis) {
  const keys = selectedModel === 'compare' ? ['kajo','edwards'] : [selectedModel];
  const maps = Object.fromEntries(keys.map(key => [key, new Map(analysis[key].daily.map(row => [row.date, row.value]))]));
  const dates = [...new Set(keys.flatMap(key => analysis[key].daily.map(row => row.date)))].sort();
  const labels = dates.map(date => new Date(date + 'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}));
  const colors = { kajo: '#6DA8F7', edwards: '#2FA47E' };
  chartBase('training-load-daily-chart', 'dailyChart', {
    type: 'line',
    data: { labels, datasets: keys.map(key => ({
      label: key === 'kajo' ? 'KAJO-HF-Zonenindex' : 'Edwards TRIMP',
      data: dates.map(date => maps[key].has(date) ? maps[key].get(date) : null),
      borderColor: colors[key], backgroundColor: colors[key] + '22',
      borderWidth: 2, pointRadius: 2, tension: .2, spanGaps: false
    })) },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: keys.length > 1, labels: { color: '#a9b5c2', usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { title: items => dates[items[0]?.dataIndex] || '', label: item => item.dataset.label + ': ' + fmt(item.parsed.y) + ' Punkte' } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#7d8a98', maxTicksLimit: 8, maxRotation: 0 } },
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#7d8a98' } } } }
  });
}
function renderActivityList(analysis) {
  const node = document.getElementById('training-load-activity-list');
  if (!node) return;
  node.replaceChildren();
  const rows = [...analysis.records].sort((a,b) => b.date.localeCompare(a.date)).slice(0,12);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-slate-500';
    empty.textContent = 'Keine Aktivitäten mit auswertbaren Garmin-HF-Zeitreihen im ausgewählten Zeitraum.';
    node.appendChild(empty);
    return;
  }
  rows.forEach(item => {
    const row = document.createElement('div');
    row.className = 'flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 py-2 text-xs';
    const left = document.createElement('span');
    left.className = 'text-slate-300';
    left.textContent = item.date + ' · ' + item.sport;
    const right = document.createElement('span');
    right.className = 'text-slate-400 text-right';
    const values = [];
    if (item.kajo && (selectedModel === 'kajo' || selectedModel === 'compare')) values.push('KAJO ' + fmt(item.kajo.value));
    if (item.edwards && (selectedModel === 'edwards' || selectedModel === 'compare')) values.push('Edwards ' + fmt(item.edwards.value));
    right.textContent = values.join(' · ') || 'Nicht berechenbar';
    row.append(left,right);
    node.appendChild(row);
  });
}
export function setTrainingLoadModel(model) {
  if (!['kajo','edwards','compare'].includes(model)) return;
  selectedModel = model;
  document.querySelectorAll('[data-training-load-model]').forEach(button => {
    const active = button.dataset.trainingLoadModel === model;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderTrainingLoadView();
}
export function setTrainingLoadDailyMeasure() { /* Kept as a compatibility bridge; no sRPE/duration switch in the HR-zone view. */ }
export function setTrainingLoadChartMetric() {}
export function openTrainingLoadMetric() {}
export function closeTrainingLoadMetric() { renderTrainingLoadView(); }
export function renderTrainingLoadView() {
  const period = { '7d': '7 Tage', '28d': '28 Tage', '3m': '90 Tage', '6m': '180 Tage', '1y': '1 Jahr', custom: 'Individueller Zeitraum' };
  setText('training-load-period-label', period[state.activeTimeframe] || 'Aktueller Zeitraum');
  const analysis = getHeartRateZoneAnalysis(selectedActivities(), state.settings || {}, state.profile || {}, state.dailyCheckins || {});
  renderCoverage(analysis);
  renderZoneChart(analysis);
  renderDailyChart(analysis);
  renderActivityList(analysis);
  setText('training-load-zone-method-note', selectedModel === 'compare'
    ? 'Die Zonenbezeichnungen Z1–Z5 sind zwischen den Modellen nicht physiologisch identisch. KAJO verwendet adaptive Prozentanteile der Herzfrequenzreserve (HFmax minus adaptive Ruhe-HF); Edwards feste Prozentbereiche der HFmax. Werte und Zeitverteilungen daher als unterschiedliche Modellperspektiven betrachten.'
    : selectedModel === 'edwards'
      ? 'Edwards-Grenzen sind feste Prozentbereiche der HFmax und keine individuell gemessenen Schwellen. Zeit unter 50 % HFmax bleibt außerhalb der fünf Edwards-Zonen.'
      : 'Der KAJO-Index verwendet die Herzfrequenzreserve: HFmax minus adaptiver Ruhe-HF. Die Ruhe-HF wird als Median der verfügbaren Tageswerte im konfigurierten Rückblickfenster berechnet; bei zu wenigen Messungen wird ein hinterlegter Profilwert gekennzeichnet als Fallback verwendet.');
  setVisible('training-load-standard-analysis', true);
  setVisible('training-load-compare-analysis', false);
  setVisible('training-load-content', true);
  setVisible('training-load-no-data', analysis.records.length === 0);
}
