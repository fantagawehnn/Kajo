/* KAJO V2 Training Load analysis.
 * Uses the central calculation pipeline; this module only selects the model
 * and renders its existing results. No load formulas are duplicated here.
 */
import { state } from './state.js';
import { computePerformanceTimeline } from './calculations.js';
import { renderAnalysisInsights } from './analysis-insights.js';

let detail = false;
let selectedMetric = 'ctl';
let selectedModel = 'primary';
let dailyMeasure = 'load';
const charts = Object.create(null);
const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const fmt = value => valid(value) ? Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '—';
const meta = {
  ctl: ['CTL', 'Chronische Trainingsbelastung', 'Langfristige, exponentiell gewichtete Belastungsentwicklung mit einer Zeitkonstante von 42 Tagen.'],
  atl: ['ATL', 'Akute Trainingsbelastung', 'Kurzfristige, exponentiell gewichtete Belastungsentwicklung mit einer Zeitkonstante von 7 Tagen.'],
  tsb: ['TSB', 'Trainingssaldo', 'Differenz zwischen CTL und ATL. Modellierte Belastungsbilanz, keine direkte Leistungsmessung.']
};
const periodCounts = { '7d': 7, '28d': 28, '3m': 90, '6m': 180, '1y': 365 };

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value == null ? '' : String(value);
}
function setVisible(id, visible) {
  document.getElementById(id)?.classList.toggle('hidden', !visible);
}
function filteredRows(timeline) {
  const all = Array.isArray(timeline) ? timeline.filter(row => row?.date) : [];
  const range = state.activeTimeframe || '3m';
  if (range === 'custom') {
    const from = document.getElementById('date-from')?.value;
    const to = document.getElementById('date-to')?.value;
    if (from && to && from <= to) return all.filter(row => row.date >= from && row.date <= to);
  }
  const count = periodCounts[range];
  return count ? all.slice(-count) : all;
}
function computeModelTimeline(model) {
  const settings = { ...(state.settings || {}), trainingLoadSource: model === 'srpe' ? 'srpe' : model === 'garmin' ? 'garmin' : 'auto' };
  return computePerformanceTimeline(state.rawActivities, settings, state.profile);
}
function latestModelDay(timeline) {
  return [...(timeline || [])].reverse().find(x =>
    ['ctl', 'atl', 'tsb'].every(key => valid(x[key]))
    && ['complete', 'confirmed-rest'].includes(x.dataStatus)
  ) || null;
}
function getSource(day) {
  const labels = {
    'garmin-native': ['Garmin Training Load', 'Garmin-eigene Trainingsbelastung. Nicht mit dem HF-Zonenindex oder sRPE addieren.'],
    'garmin-zone': ['KAJO-HF-Zonenindex', 'KAJO-Berechnung aus gewichteter Zeit in Herzfrequenzzonen. Kein nativer Garmin Training Load und kein Edwards TRIMP.'],
    srpe: ['sRPE-Load', 'Subjektive Belastung aus dokumentierter Dauer und RPE.'],
    'garmin-unavailable': ['Garmin-Load nicht berechenbar', 'Es liegen keine durchgängig auswertbaren Garmin-Load-Werte für die berechnete Zeitreihe vor.']
  };
  return labels[day?.loadMode] || ['Keine eindeutige Belastungsquelle', 'Für diese Zeitreihe ist keine eindeutige Berechnungsbasis hinterlegt.'];
}
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}
function chartBase(canvasId, key, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart !== 'function') return null;
  destroyChart(key);
  charts[key] = new Chart(canvas.getContext('2d'), config);
  return charts[key];
}
function chartOptions(points, titleLabel) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#a9b5c2', usePointStyle: true, boxWidth: 8, font: { size: 10 } } },
      tooltip: { callbacks: {
        title: items => points[items[0]?.dataIndex]?.date || '',
        label: item => titleLabel(item.dataset.label, item.parsed.y)
      } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#7d8a98', maxTicksLimit: 8, maxRotation: 0 } },
      y: { grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#7d8a98', maxTicksLimit: 5 } }
    }
  };
}
function renderRings(timeline) {
  const last = latestModelDay(timeline);
  ['ctl', 'atl', 'tsb'].forEach(key => {
    setText('training-load-value-' + key, fmt(last?.[key]));
    const button = document.querySelector('[data-training-load-metric="' + key + '"]');
    if (button) button.disabled = !valid(last?.[key]);
  });
  const source = getSource(last);
  setText('training-load-source-title', source[0]);
  setText('training-load-source-description', source[1]);
  const coverage = last?.loadCoverage;
  setText('training-load-coverage', coverage?.eligibleActivityCount
    ? 'Datenabdeckung: ' + (coverage.loadedActivityCount ?? 0) + ' von ' + coverage.eligibleActivityCount + ' berücksichtigten Aktivitäten; ' + (coverage.excludedActivityCount ?? 0) + ' ohne passenden Load-Wert.'
    : 'Für diese Berechnungsbasis liegt keine Aktivitätsabdeckung vor.');
  setText('training-load-model-date', last
    ? 'Modellstand ' + new Date(last.date + 'T12:00:00').toLocaleDateString('de-DE') + (last.isProvisional ? ' · vorläufig' : '')
    : 'Kein berechenbarer Modellstand');
  setVisible('training-load-no-data', !last);
  if (!last) {
    const hasSessionLoads = (timeline || []).some(row => row.dataStatus === 'activity-load-only' && valid(row.load));
    const note = document.getElementById('training-load-no-data');
    if (note) {
      const heading = note.querySelector('strong');
      const paragraph = note.querySelector('p');
      if (heading) heading.textContent = hasSessionLoads ? 'Tagesload vorhanden · Trend noch nicht berechenbar' : 'Keine auswertbare Belastungszeitreihe';
      if (paragraph) paragraph.textContent = hasSessionLoads
        ? 'Die Load-Werte deiner erfassten Einheiten werden im Tagesdiagramm angezeigt. Für CTL, ATL und TSB fehlen bestätigte Aktivitätszeiträume; unbekannte Tage werden nicht als Ruhetage angenommen.'
        : 'Für diese Berechnungsbasis liegen im ausgewählten Zeitraum keine vollständigen CTL-, ATL- und TSB-Werte vor. Prüfe die Datenabdeckung und die gewählte Modellbasis.';
    }
  }
  setVisible('training-load-content', true);
}
function renderPrimaryCharts(timeline) {
  const points = filteredRows(timeline);
  const labels = points.map(row => new Date(row.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
  const complete = row => ['complete', 'confirmed-rest'].includes(row.dataStatus);
  chartBase('training-load-atl-ctl-chart', 'atlCtl', {
    type: 'line',
    data: { labels, datasets: [
      { label: 'ATL · kurzfristig', data: points.map(row => complete(row) && valid(row.atl) ? Number(row.atl) : null), borderColor: '#D64A4A', backgroundColor: 'rgba(214,74,74,.06)', borderWidth: 2.4, pointRadius: 0, pointHitRadius: 8, tension: .25, spanGaps: false },
      { label: 'CTL · langfristig', data: points.map(row => complete(row) && valid(row.ctl) ? Number(row.ctl) : null), borderColor: '#6DA8F7', backgroundColor: 'rgba(109,168,247,.06)', borderWidth: 2.2, pointRadius: 0, pointHitRadius: 8, tension: .25, spanGaps: false }
    ] },
    options: chartOptions(points, (label, value) => label + ': ' + fmt(value))
  });
  chartBase('training-load-tsb-chart', 'tsb', {
    type: 'line',
    data: { labels, datasets: [{
      label: 'TSB · CTL − ATL',
      data: points.map(row => complete(row) && valid(row.tsb) ? Number(row.tsb) : null),
      borderColor: '#D7A64A', backgroundColor: 'rgba(215,166,74,.12)',
      borderWidth: 2.2, pointRadius: 0, pointHitRadius: 8, tension: .25, fill: true, spanGaps: false
    }] },
    options: {
      ...chartOptions(points, (label, value) => label + ': ' + fmt(value)),
      plugins: { ...chartOptions(points, (label, value) => label + ': ' + fmt(value)).plugins, legend: { display: false } },
      scales: { ...chartOptions(points, (label, value) => label + ': ' + fmt(value)).scales,
        y: { ...chartOptions(points, (label, value) => label + ': ' + fmt(value)).scales.y, grid: { color: context => context.tick.value === 0 ? 'rgba(215,166,74,.55)' : 'rgba(148,163,184,.10)', lineWidth: context => context.tick.value === 0 ? 1.5 : 1 }, ticks: { color: '#7d8a98' } } }
    }
  });
  renderDailyChart(timeline);
}
function activityDate(activity) {
  return typeof activity?.date === 'string' ? activity.date.slice(0, 10) : '';
}
function aggregateDailyDuration(points) {
  const byDate = new Map();
  (state.rawActivities || []).forEach(activity => {
    const date = activityDate(activity);
    if (!date) return;
    if (!byDate.has(date)) byDate.set(date, { total: 0, complete: true, count: 0 });
    const row = byDate.get(date);
    const duration = Number(activity.duration);
    if (activity.duration === null || activity.duration === undefined || activity.duration === '' || !Number.isFinite(duration) || duration < 0) row.complete = false;
    else row.total += duration;
    row.count++;
  });
  return points.map(point => {
    const item = byDate.get(point.date);
    if (item) return item.complete ? Number((item.total / 60).toFixed(2)) : null;
    return point.dataStatus === 'confirmed-rest' ? 0 : null;
  });
}
function renderDailyChart(timeline) {
  const points = filteredRows(timeline);
  const isDuration = dailyMeasure === 'duration';
  const values = isDuration ? aggregateDailyDuration(points) : points.map(row =>
    ['complete', 'confirmed-rest', 'activity-load-only'].includes(row.dataStatus) && valid(row.load) ? Number(row.load) : null
  );
  const labels = points.map(row => new Date(row.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
  const unit = isDuration ? 'h' : (points.find(row => valid(row.loadUnit))?.loadUnit || 'Load');
  chartBase('training-load-daily-chart', 'daily', {
    type: 'bar',
    data: { labels, datasets: [{
      label: isDuration ? 'Trainingszeit' : 'Täglicher Load',
      data: values,
      backgroundColor: isDuration ? 'rgba(47,164,126,.82)' : 'rgba(109,168,247,.82)',
      borderRadius: 4, maxBarThickness: 18, borderSkipped: false
    }] },
    options: {
      ...chartOptions(points, (label, value) => label + ': ' + fmt(value) + ' ' + unit),
      plugins: { ...chartOptions(points, (label, value) => label + ': ' + fmt(value) + ' ' + unit).plugins, legend: { display: false } },
      scales: { ...chartOptions(points, (label, value) => label + ': ' + fmt(value) + ' ' + unit).scales,
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#7d8a98', maxTicksLimit: 4 } } }
    }
  });
  setText('training-load-daily-unit', isDuration ? 'Stunden pro Tag' : 'Load-Punkte pro Tag · Modellwert');
}
function isoWeekKey(dateString) {
  const date = new Date(dateString + 'T12:00:00');
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function renderVolumeCharts() {
  const buckets = new Map();
  const today = new Date();
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  const range = state.activeTimeframe || '3m';
  let from = periodCounts[range] ? new Date(today) : null;
  if (from) from.setDate(from.getDate() - periodCounts[range] + 1);
  const fromKey = from ? [from.getFullYear(), String(from.getMonth() + 1).padStart(2, '0'), String(from.getDate()).padStart(2, '0')].join('-') : '';
  const customFrom = document.getElementById('date-from')?.value;
  const customTo = document.getElementById('date-to')?.value;
  const startKey = range === 'custom' && customFrom && customTo && customFrom <= customTo ? customFrom : fromKey;
  const endKey = range === 'custom' && customFrom && customTo && customFrom <= customTo ? customTo : todayKey;
  (state.rawActivities || []).forEach(activity => {
    const date = activityDate(activity);
    if (!date || (startKey && date < startKey) || (endKey && date > endKey)) return;
    const week = isoWeekKey(date);
    if (!buckets.has(week)) buckets.set(week, { minutes: 0, durationComplete: true, sessions: 0 });
    const item = buckets.get(week);
    const duration = Number(activity.duration);
    if (activity.duration === null || activity.duration === undefined || activity.duration === '' || !Number.isFinite(duration) || duration < 0) item.durationComplete = false;
    else item.minutes += duration;
    item.sessions++;
  });
  const sorted = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  const labels = sorted.map(([week]) => {
    const date = new Date(week + 'T12:00:00');
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  });
  const hours = sorted.map(([, item]) => item.durationComplete ? Number((item.minutes / 60).toFixed(1)) : null);
  const sessions = sorted.map(([, item]) => item.sessions);
  chartBase('training-load-weekly-hours-chart', 'weeklyHours', {
    type: 'bar', data: { labels, datasets: [{ label: 'Trainingszeit (h)', data: hours, backgroundColor: 'rgba(109,168,247,.82)', borderRadius: 4, maxBarThickness: 22 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => valid(item.parsed.y) ? fmt(item.parsed.y) + ' h' : 'Dauer unvollständig' } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#7d8a98' } }, y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#7d8a98' } } } }
  });
  chartBase('training-load-weekly-sessions-chart', 'weeklySessions', {
    type: 'bar', data: { labels, datasets: [{ label: 'Einheiten', data: sessions, backgroundColor: 'rgba(47,164,126,.82)', borderRadius: 4, maxBarThickness: 22 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => fmt(item.parsed.y) + ' Einheiten' } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#7d8a98' } }, y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#7d8a98', precision: 0 } } } }
  });
}
function renderCompareCharts() {
  const garmin = filteredRows(computeModelTimeline('garmin'));
  const srpe = filteredRows(computeModelTimeline('srpe'));
  const renderCompare = (canvasId, key, points, label) => {
    const labels = points.map(row => new Date(row.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
    const validRows = points.some(row => valid(row.ctl) || valid(row.atl));
    if (!validRows) {
      destroyChart(key);
      setText(canvasId + '-note', 'Für dieses Modell liegen im ausgewählten Zeitraum keine vollständigen Belastungswerte vor.');
      return;
    }
    setText(canvasId + '-note', label + ' · eigene Skala; absolute Werte sind nicht mit dem anderen Modell gleichzusetzen.');
    chartBase(canvasId, key, {
      type: 'line', data: { labels, datasets: [
        { label: 'ATL', data: points.map(row => ['complete', 'confirmed-rest'].includes(row.dataStatus) && valid(row.atl) ? row.atl : null), borderColor: '#D64A4A', borderWidth: 2, pointRadius: 0, tension: .25, spanGaps: false },
        { label: 'CTL', data: points.map(row => ['complete', 'confirmed-rest'].includes(row.dataStatus) && valid(row.ctl) ? row.ctl : null), borderColor: '#6DA8F7', borderWidth: 2, pointRadius: 0, tension: .25, spanGaps: false }
      ] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#a9b5c2', usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { title: items => points[items[0]?.dataIndex]?.date || '', label: item => item.dataset.label + ': ' + fmt(item.parsed.y) } } },
        scales: { x: { grid: { display: false }, ticks: { color: '#7d8a98', maxTicksLimit: 7 } }, y: { grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#7d8a98' } } } }
    });
  };
  renderCompare('training-load-compare-garmin-chart', 'compareGarmin', garmin, 'Garmin / KAJO-HF-Zonenindex');
  renderCompare('training-load-compare-srpe-chart', 'compareSrpe', srpe, 'sRPE-Load');
}
function updateModelNavigation() {
  document.querySelectorAll('[data-training-load-model]').forEach(button => {
    const active = button.dataset.trainingLoadModel === selectedModel;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function updateDailyNavigation() {
  document.querySelectorAll('[data-training-load-daily-measure]').forEach(button => {
    const active = button.dataset.trainingLoadDailyMeasure === dailyMeasure;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
export function setTrainingLoadModel(model) {
  if (!['primary', 'srpe', 'compare'].includes(model)) return;
  selectedModel = model;
  detail = false;
  setVisible('training-load-overview', true);
  setVisible('training-load-metric-detail', false);
  updateModelNavigation();
  renderTrainingLoadView();
}
export function setTrainingLoadDailyMeasure(measure) {
  if (!['load', 'duration'].includes(measure)) return;
  dailyMeasure = measure;
  updateDailyNavigation();
  const timeline = selectedModel === 'srpe' ? computeModelTimeline('srpe') : computeModelTimeline('primary');
  renderDailyChart(timeline);
}
function renderDetailChart(metric) {
  const canvasId = detail ? 'training-load-metric-chart' : 'training-load-detail-chart';
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart !== 'function') return;
  const points = filteredRows(selectedModel === 'srpe' ? computeModelTimeline('srpe') : computeModelTimeline('primary'));
  if (!points.some(row => valid(row[metric]))) {
    setText(detail ? 'training-load-metric-chart-note' : 'training-load-chart-note', 'Für diese Kennzahl liegen im ausgewählten Zeitraum keine auswertbaren Werte vor.');
    return;
  }
  chartBase(canvasId, detail ? 'detail' : 'primaryDetail', {
    type: 'line', data: { labels: points.map(row => new Date(row.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })),
      datasets: [{ label: meta[metric][0], data: points.map(row => ['complete', 'confirmed-rest'].includes(row.dataStatus) && valid(row[metric]) ? Number(row[metric]) : null),
        borderColor: '#6DA8F7', backgroundColor: 'rgba(109,168,247,.10)', borderWidth: 2, pointRadius: 0, pointHitRadius: 9, tension: .25, fill: true, spanGaps: false }] },
    options: chartOptions(points, (label, value) => label + ': ' + fmt(value))
  });
}
export function setTrainingLoadChartMetric(metric) {
  if (!meta[metric]) return;
  selectedMetric = metric;
  document.querySelectorAll('[data-training-load-chart-metric]').forEach(button => {
    const active = button.dataset.trainingLoadChartMetric === metric;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderDetailChart(metric);
}
export function openTrainingLoadMetric(metric) {
  if (!meta[metric] || !valid(latestModelDay(computeModelTimeline(selectedModel === 'srpe' ? 'srpe' : 'primary'))?.[metric])) return;
  detail = true;
  setVisible('training-load-overview', false);
  setVisible('training-load-metric-detail', true);
  setText('training-load-detail-title', meta[metric][1]);
  setText('training-load-detail-description', meta[metric][2]);
  renderDetailChart(metric);
  document.getElementById('analysis-subpage-load')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
export function closeTrainingLoadMetric() {
  detail = false;
  setVisible('training-load-metric-detail', false);
  setVisible('training-load-overview', true);
  renderTrainingLoadView();
}
export function renderTrainingLoadView() {
  const period = { '7d': '7 Tage', '28d': '28 Tage', '3m': '90 Tage', '6m': '180 Tage', '1y': '1 Jahr', custom: 'Individueller Zeitraum' };
  setText('training-load-period-label', period[state.activeTimeframe] || 'Aktueller Zeitraum');
  updateModelNavigation();
  updateDailyNavigation();
  const compare = selectedModel === 'compare';
  setVisible('training-load-standard-analysis', !compare);
  setVisible('training-load-compare-analysis', compare);
  if (compare) {
    renderCompareCharts();
    return;
  }
  const model = selectedModel === 'srpe' ? 'srpe' : 'primary';
  const timeline = computeModelTimeline(model);
  renderRings(timeline);
  renderPrimaryCharts(timeline);
  renderVolumeCharts();
  const last = latestModelDay(timeline);
  const source = getSource(last);
  setText('training-load-selected-model-label', selectedModel === 'srpe' ? 'sRPE-Load' : 'Belastungsbilanz · ' + source[0]);
  const primaryInsight = selectedModel === 'primary'
    && latestModelDay(state.dailyTimeline)?.loadMode === last?.loadMode;
  setVisible('training-load-insight-panel', Boolean(primaryInsight));
  if (primaryInsight) {
    renderAnalysisInsights();
    const sourceInsight = document.getElementById('analysis-load-insight');
    const targetInsight = document.getElementById('training-load-insight');
    if (sourceInsight && targetInsight) targetInsight.innerHTML = sourceInsight.innerHTML;
  }
}
