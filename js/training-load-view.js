/* KAJO V2 Training Load detail view. Presentation only; central calculations remain untouched. */
import { state } from './state.js';
import { renderAnalysisInsights } from './analysis-insights.js';

let detail = false;
let selected = 'ctl';
let chartRef = null;
const meta = {
  ctl: ['CTL', 'Chronische Trainingsbelastung', 'Langfristige, exponentiell gewichtete Belastungsentwicklung mit einer Zeitkonstante von 42 Tagen.'],
  atl: ['ATL', 'Akute Trainingsbelastung', 'Kurzfristige, exponentiell gewichtete Belastungsentwicklung mit einer Zeitkonstante von 7 Tagen.'],
  tsb: ['TSB', 'Trainingssaldo', 'Differenz zwischen CTL und ATL. Modellierte Belastungsbilanz, keine direkte Leistungsmessung.']
};
const valid = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const fmt = v => valid(v) ? Number(v).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '—';
const rows = () => Array.isArray(state.dailyTimeline) ? state.dailyTimeline.filter(x => x?.date) : [];

function filteredRows() {
  const all = rows();
  const range = state.activeTimeframe || '3m';
  const count = ({ '7d': 7, '28d': 28, '3m': 90, '6m': 180, '1y': 365 })[range];
  if (range === 'custom') {
    const from = document.getElementById('date-from')?.value;
    const to = document.getElementById('date-to')?.value;
    if (from && to && from <= to) return all.filter(x => x.date >= from && x.date <= to);
  }
  return count ? all.slice(-count) : all;
}
function latestModelDay() {
  return [...rows()].reverse().find(x => ['ctl', 'atl', 'tsb'].every(k => valid(x[k]))) || null;
}
function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value == null ? '' : String(value);
}
function getSource(day) {
  const labels = {
    'garmin-native': ['Garmin Training Load', 'Garmin-eigene Belastungswerte. Nicht mit KAJO-HF-Zonenindex, TSS oder sRPE addieren.'],
    'garmin-zone': ['KAJO-HF-Zonenindex', 'KAJO-Berechnung aus gewichteter Zeit in Herzfrequenzzonen. Kein Garmin Training Load und kein TSS.'],
    srpe: ['sRPE-Load', 'Subjektive Belastung aus Dauer und RPE.'],
    'external-tss': ['Externe TSS-Daten', 'Externe TSS-Werte werden als eigene Belastungsquelle verarbeitet.'],
    'garmin-unavailable': ['Garmin-Daten nicht auswertbar', 'Garmin-Daten erkannt, aber keine passenden Load-Werte verfügbar.']
  };
  return labels[day?.loadMode] || ['Keine eindeutige Belastungsquelle', 'Keine eindeutige Belastungsquelle im Modellverlauf hinterlegt.'];
}
function renderChart(metric) {
  const canvas = document.getElementById(detail ? 'training-load-metric-chart' : 'training-load-detail-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const points = filteredRows();
  if (chartRef) { chartRef.destroy(); chartRef = null; }
  const noteId = detail ? 'training-load-metric-chart-note' : 'training-load-chart-note';
  if (!points.some(x => valid(x[metric]))) {
    setText(noteId, 'Für diese Kennzahl liegen im ausgewählten Zeitraum keine auswertbaren Werte vor.');
    return;
  }
  setText(noteId, 'Modellierter Verlauf · Tagesendwerte · keine direkte Leistungsmessung.');
  chartRef = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: points.map(x => new Date(x.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })),
      datasets: [{
        label: meta[metric][0],
        data: points.map(x => valid(x[metric]) ? Number(x[metric]) : null),
        borderColor: '#6DA8F7',
        backgroundColor: 'rgba(109,168,247,.10)',
        borderWidth: 2, pointRadius: 0, pointHitRadius: 9, tension: .25, fill: true, spanGaps: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: items => points[items[0].dataIndex]?.date || '',
          label: item => meta[metric][0] + ': ' + fmt(item.parsed.y)
        } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8, maxRotation: 0 } },
        y: { grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: '#94a3b8', maxTicksLimit: 5 } }
      }
    }
  });
}
function updateSwitches(metric) {
  document.querySelectorAll('[data-training-load-chart-metric]').forEach(button => {
    const active = button.dataset.trainingLoadChartMetric === metric;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}
export function setTrainingLoadChartMetric(metric) {
  if (!meta[metric]) return;
  selected = metric;
  updateSwitches(metric);
  renderChart(metric);
}
export function openTrainingLoadMetric(metric) {
  if (!meta[metric] || !valid(latestModelDay()?.[metric])) return;
  detail = true;
  document.getElementById('training-load-overview')?.classList.add('hidden');
  document.getElementById('training-load-metric-detail')?.classList.remove('hidden');
  setText('training-load-detail-title', meta[metric][1]);
  setText('training-load-detail-description', meta[metric][2]);
  renderChart(metric);
  document.getElementById('analysis-subpage-load')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
export function closeTrainingLoadMetric() {
  const wasDetail = detail;
  detail = false;
  document.getElementById('training-load-metric-detail')?.classList.add('hidden');
  document.getElementById('training-load-overview')?.classList.remove('hidden');
  if (wasDetail) renderChart(selected);
}
export function renderTrainingLoadView() {
  const last = latestModelDay();
  const periods = { '7d': '7 Tage', '28d': '28 Tage', '3m': '3 Monate', '6m': '6 Monate', '1y': '1 Jahr', custom: 'Individueller Zeitraum' };
  setText('training-load-period-label', periods[state.activeTimeframe] || 'Aktueller Zeitraum');
  setText('training-load-model-date', last
    ? 'Modellstand ' + new Date(last.date + 'T12:00:00').toLocaleDateString('de-DE') + (last.isProvisional ? ' · vorläufig' : '')
    : 'Kein berechenbarer Modellstand');
  ['ctl', 'atl', 'tsb'].forEach(metric => {
    setText('training-load-value-' + metric, fmt(last?.[metric]));
    const button = document.querySelector('[data-training-load-metric="' + metric + '"]');
    if (button) button.disabled = !valid(last?.[metric]);
  });
  const source = getSource(last);
  setText('training-load-source-title', source[0]);
  setText('training-load-source-description', source[1]);
  const coverage = last?.loadCoverage;
  setText('training-load-coverage', coverage?.eligibleActivityCount
    ? 'Abdeckung: ' + (coverage.loadedActivityCount ?? 0) + ' von ' + coverage.eligibleActivityCount + ' berücksichtigten Aktivitäten; ' + (coverage.excludedActivityCount ?? 0) + ' ohne passenden Wert.'
    : 'Für diese Berechnungsbasis ist keine Abdeckungsinformation hinterlegt.');
  const noData = !last;
  document.getElementById('training-load-no-data')?.classList.toggle('hidden', !noData);
  document.getElementById('training-load-content')?.classList.toggle('hidden', noData);
  if (noData) {
    if (chartRef) { chartRef.destroy(); chartRef = null; }
    closeTrainingLoadMetric();
    return;
  }
  renderAnalysisInsights();
  const insight = document.getElementById('analysis-load-insight');
  const target = document.getElementById('training-load-insight');
  if (insight && target) target.innerHTML = insight.innerHTML;
  selected = 'ctl';
  updateSwitches('ctl');
  closeTrainingLoadMetric();
  renderChart('ctl');
}
