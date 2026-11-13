/* KAJO V2 – Analyse-Hauptübersicht. Reads existing domain outputs and central timeline; no new training calculations. */
import { state } from './state.js';

let chart = null;
let selectedMetric = 'ctl';
const definitions = {
  ctl: { label: 'CTL', unit: 'AU', description: 'Langfristige modellierte Belastungsentwicklung', requiresCompleteDay: true },
  atl: { label: 'ATL', unit: 'AU', description: 'Kurzfristige modellierte Belastungsentwicklung', requiresCompleteDay: true },
  tsb: { label: 'TSB', unit: 'AU', description: 'Modellierter Belastungssaldo', requiresCompleteDay: true },
  activityCount: { label: 'Aktivitäten', unit: 'pro Tag', description: 'Erfasste Trainingseinheiten pro Tag', requiresCompleteDay: false }
};
const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value ?? ''; };
const periodRows = () => {
  const rows = Array.isArray(state.dailyTimeline) ? state.dailyTimeline.filter(day => day?.date) : [];
  const range = state.activeTimeframe || '3m';
  if (range === 'custom') {
    const from = document.getElementById('date-from')?.value;
    const to = document.getElementById('date-to')?.value;
    return from && to && from <= to ? rows.filter(day => day.date >= from && day.date <= to) : rows;
  }
  const days = ({ '7d': 7, '28d': 28, '3m': 90, '6m': 180, '1y': 365 })[range];
  return days ? rows.slice(-days) : rows;
};
function heroValue(domain) {
  const value = document.getElementById('analysis-' + domain + '-hero-value')?.textContent?.trim() || '—';
  const unit = document.getElementById('analysis-' + domain + '-hero-unit')?.textContent?.trim() || '';
  const status = document.getElementById('analysis-' + domain + '-hero-status')?.textContent?.trim() || '';
  const note = document.getElementById(domain + '-hero-note')?.textContent?.trim() || '';
  const ring = document.getElementById(domain + '-hero-ring');
  return { value, unit, status, note, tone: ring?.dataset?.status || 'neutral' };
}
function renderDomainCards() {
  for (const domain of ['load', 'recovery', 'performance', 'health']) {
    const data = heroValue(domain);
    setText('analysis-overview-' + domain + '-value', data.value);
    setText('analysis-overview-' + domain + '-unit', data.unit);
    setText('analysis-overview-' + domain + '-status', data.status);
    setText('analysis-overview-' + domain + '-note', data.note || 'Noch keine ergänzende Einordnung verfügbar.');
    const card = document.querySelector('[data-analysis-domain="' + domain + '"]');
    if (card) card.dataset.status = data.tone;
  }
}
function assessmentText(id) {
  const root = document.getElementById(id);
  const value = root?.textContent?.replace(/\s+/g, ' ').trim() || '';
  return value ? value.slice(0, 230) + (value.length > 230 ? '…' : '') : 'Für diesen Bereich liegt derzeit keine ergänzende datenbasierte Einordnung vor.';
}
function renderAssessment() {
  const target = document.getElementById('analysis-overview-assessment');
  if (!target) return;
  const items = [
    ['Training Load', 'analysis-load-insight'],
    ['Recovery', 'analysis-recovery-insight'],
    ['Performance', 'analysis-fitness-insight'],
    ['Health', 'analysis-health-insight']
  ];
  target.replaceChildren();
  for (const [label, source] of items) {
    const item = document.createElement('article');
    item.className = 'kajo-analysis-assessment-item';
    const title = document.createElement('strong');
    title.textContent = label;
    const body = document.createElement('p');
    body.textContent = assessmentText(source);
    item.append(title, body);
    target.append(item);
  }
}
function updateMetricButtons(metric) {
  document.querySelectorAll('[data-analysis-overview-metric]').forEach(button => {
    const active = button.dataset.analysisOverviewMetric === metric;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}
function drawTrend(metric) {
  const canvas = document.getElementById('analysis-overview-trend-chart');
  if (!canvas || typeof Chart !== 'function') return;
  const definition = definitions[metric];
  const rows = periodRows();
  const supported = rows.some(day => valid(day[metric]));
  const note = document.getElementById('analysis-overview-trend-note');
  if (chart) { chart.destroy(); chart = null; }
  if (!supported) {
    if (note) note.textContent = 'Für diese Kennzahl liegen im ausgewählten Zeitraum keine auswertbaren Werte vor.';
    return;
  }
  const data = rows.map(day => {
    if (!valid(day[metric])) return null;
    if (definition.requiresCompleteDay && !['complete', 'confirmed-rest'].includes(day.dataStatus)) return null;
    return Number(day[metric]);
  });
  if (note) note.textContent = definition.description + ' · Fehlende oder unvollständige Tage bleiben als Datenlücken sichtbar.';
  chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: rows.map(day => new Date(day.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })),
      datasets: [{ label: definition.label, data, borderColor: '#6DA8F7', backgroundColor: 'rgba(109,168,247,.10)', borderWidth: 2, pointRadius: 0, pointHitRadius: 8, tension: .24, fill: true, spanGaps: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => rows[items[0].dataIndex]?.date || '', label: item => definition.label + ': ' + (valid(item.parsed.y) ? Number(item.parsed.y).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' ' + definition.unit : '—') } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8, maxRotation: 0 } },
        y: { grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#94a3b8', maxTicksLimit: 5 } }
      }
    }
  });
}
export function setAnalysisOverviewMetric(metric) {
  if (!definitions[metric]) return;
  selectedMetric = metric;
  updateMetricButtons(metric);
  drawTrend(metric);
}
export function renderAnalysisOverview() {
  renderDomainCards();
  renderAssessment();
  const labels = { '7d': 'Letzte 7 Tage', '28d': 'Letzte 28 Tage', '3m': 'Letzte 90 Tage', '6m': 'Letzte 180 Tage', '1y': 'Letztes Jahr', custom: 'Individueller Zeitraum' };
  setText('analysis-overview-trend-period', labels[state.activeTimeframe] || 'Aktueller Zeitraum');
  const rows = periodRows();
  for (const metric of Object.keys(definitions)) {
    const button = document.querySelector('[data-analysis-overview-metric="' + metric + '"]');
    if (button) button.hidden = !rows.some(day => valid(day[metric]));
  }
  if (!rows.some(day => valid(day[selectedMetric]))) {
    selectedMetric = rows.some(day => valid(day.ctl)) ? 'ctl'
      : rows.some(day => valid(day.atl)) ? 'atl'
      : rows.some(day => valid(day.tsb)) ? 'tsb' : 'activityCount';
  }
  updateMetricButtons(selectedMetric);
  drawTrend(selectedMetric);
}
