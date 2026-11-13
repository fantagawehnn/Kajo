/* KAJO V2 – Analyseübersicht
 * Nutzt vorhandene Kennzahlen und Bewertungslogiken. Keine neuen
 * Belastungs-, Fitness-, Recovery- oder Gesundheits-Scores.
 */
import { state } from './state.js';
import { getSportsCatalog } from './utils.js';
import { historyRingColor } from './dashboard.js';

const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.textContent = value ?? '';
};
const todayKey = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const fmt = value => valid(value) ? Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '—';
const dateLabel = key => {
  const d = new Date(key + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};
let trendChart = null;
let activityChart = null;
let selectedMetric = 'load';

function sourceHero(domain) {
  const value = document.getElementById('analysis-' + domain + '-hero-value')?.textContent?.trim() || '—';
  const unit = document.getElementById('analysis-' + domain + '-hero-unit')?.textContent?.trim() || '';
  const ring = document.getElementById(domain + '-hero-ring');
  return { value, unit, tone: ring?.dataset?.status || 'neutral' };
}
function renderCircle(domain) {
  const data = sourceHero(domain);
  setText('analysis-overview-' + domain + '-value', data.value);
  setText('analysis-overview-' + domain + '-unit', data.unit);
  const ring = document.getElementById('overview-' + domain + '-ring');
  if (ring) ring.dataset.status = data.tone;
}
function latestCheckin(key) {
  const entries = Object.entries(state.dailyCheckins || {}).sort(([a], [b]) => b.localeCompare(a));
  for (const [date, row] of entries) if (valid(row?.[key])) return { date, value: Number(row[key]) };
  return null;
}
function toneFromCssColor(color) {
  const value = String(color || '');
  if (value.includes('status-good')) return 'good';
  if (value.includes('status-attention')) return 'attention';
  if (value.includes('status-critical')) return 'critical';
  return 'neutral';
}
function renderCircleStatus(domain, label, tone) {
  const ring = document.getElementById('overview-' + domain + '-ring');
  const status = document.getElementById('analysis-overview-' + domain + '-status');
  if (ring) ring.dataset.status = tone || 'neutral';
  if (status) {
    status.textContent = label;
    status.dataset.status = tone || 'neutral';
  }
}
function renderShortStatuses() {
  const timeline = Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [];
  const latestLoad = timeline[timeline.length - 1] || null;
  let loadLabel = 'Nicht bewertbar', loadTone = 'neutral';
  if (latestLoad && valid(latestLoad.atl) && latestLoad.load != null) {
    const labels = {
      'Hohe Ermüdung': ['Ermüdet', 'critical'],
      'Belastung': ['Belastet', 'attention'],
      'Ausgeglichen': ['Ausgeglichen', 'good'],
      'Frisch': ['Frisch', 'good'],
      'Tapering': ['Tapering', 'neutral']
    };
    const mapped = labels[latestLoad.statusLabel];
    if (mapped && !['srpe', 'garmin-unavailable'].includes(latestLoad.loadMode)) [loadLabel, loadTone] = mapped;
    else if (latestLoad.statusLabel === 'Modellwert') loadLabel = 'Modellwert';
    else if (latestLoad.statusLabel === 'Keine Load-Quelle') loadLabel = 'Keine Load-Quelle';
    else if (latestLoad.statusLabel === 'Keine relative Basis') loadLabel = 'Keine Basis';
  } else if (latestLoad?.dataStatus === 'unknown' || latestLoad?.dataStatus === 'incomplete-activity-load') {
    loadLabel = 'Datenlücke';
  }
  renderCircleStatus('load', loadLabel, loadTone);

  const hrv = latestCheckin('hrv');
  let recoveryLabel = hrv ? 'Keine Basis' : 'Nicht erfasst';
  let recoveryTone = 'neutral';
  if (hrv) {
    recoveryTone = toneFromCssColor(historyRingColor('hrv', hrv.value, hrv.date));
    recoveryLabel = ({ good: 'Stabil', attention: 'Abweichung', critical: 'Auffällig', neutral: 'Keine Basis' })[recoveryTone];
  }
  renderCircleStatus('recovery', recoveryLabel, recoveryTone);

  renderCircleStatus('performance', latestCheckin('vo2max') ? 'Importwert · Quelle offen' : 'Nicht erfasst', 'neutral');

  // Health availability is not yet calculated from matched planned and completed
  // training time. Illness/injury log entries alone are not an availability score.
  renderCircleStatus('health', 'Nicht berechenbar', 'neutral');
}
function currentRange() {
  const to = todayKey();
  if (state.activeTimeframe === 'custom') {
    const fromInput = document.getElementById('date-from')?.value;
    const toInput = document.getElementById('date-to')?.value;
    if (fromInput && toInput && fromInput <= toInput) return { from: fromInput, to: toInput };
  }
  const days = ({ '7d': 7, '28d': 28, '3m': 90, '6m': 180, '1y': 365 })[state.activeTimeframe] || 90;
  const fromDate = new Date(to + 'T12:00:00');
  fromDate.setDate(fromDate.getDate() - days + 1);
  const from = fromDate.getFullYear() + '-' + String(fromDate.getMonth() + 1).padStart(2, '0') + '-' + String(fromDate.getDate()).padStart(2, '0');
  return { from, to };
}
function rangeDates(range) {
  const dates = [];
  const current = new Date(range.from + 'T12:00:00');
  const end = new Date(range.to + 'T12:00:00');
  while (current <= end && dates.length < 400) {
    dates.push(current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0'));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
function cssColor(token, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}
function updateMetricSwitch() {
  document.querySelectorAll('[data-overview-metric]').forEach(button => {
    const active = button.dataset.overviewMetric === selectedMetric;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function renderTrendChart() {
  const canvas = document.getElementById('analysis-overview-trend-chart');
  if (!canvas || typeof Chart !== 'function') return;
  if (trendChart) trendChart.destroy();
  const range = currentRange();
  const dates = rangeDates(range);
  const labels = dates.map(dateLabel);
  const timeline = new Map((state.dailyTimeline || []).map(day => [day.date, day]));
  const checkins = state.dailyCheckins || {};
  const health = state.healthLogs || {};
  const lastLoad = (state.dailyTimeline || []).slice(-1)[0];
  let dataset;
  let note = '';
  let yTitle = '';
  let hasValues = false;

  if (selectedMetric === 'load') {
    const values = dates.map(date => {
      const day = timeline.get(date);
      return day && day.load != null && valid(day.atl) ? Number(day.atl) : null;
    });
    hasValues = values.some(valid);
    const unit = lastLoad?.loadUnit || 'Load-Punkte';
    dataset = { label: 'ATL · kurzfristige Belastung', data: values, borderColor: '#6DA8F7', backgroundColor: 'rgba(109,168,247,.10)', borderWidth: 2.2, tension: .25, pointRadius: dates.length > 90 ? 0 : 2, pointHoverRadius: 5, spanGaps: false };
    yTitle = unit;
    note = 'ATL · kurzfristige Belastung. Quelle und Einheit richten sich nach der aktiven Belastungsberechnungsbasis.';
  } else if (selectedMetric === 'recovery') {
    const values = dates.map(date => valid(checkins[date]?.hrv) ? Number(checkins[date].hrv) : null);
    hasValues = values.some(valid);
    dataset = { label: 'HRV', data: values, borderColor: '#6DA8F7', backgroundColor: 'rgba(109,168,247,.10)', borderWidth: 2.2, tension: .25, pointRadius: dates.length > 90 ? 0 : 2, pointHoverRadius: 5, spanGaps: false };
    yTitle = 'ms';
    note = 'Gespeicherte HRV-Messwerte. Unterschiedliche Messquellen werden nicht nachträglich vereinheitlicht; fehlende Messungen bleiben Lücken.';
  } else if (selectedMetric === 'performance') {
    const values = dates.map(date => valid(checkins[date]?.vo2max) ? Number(checkins[date].vo2max) : null);
    hasValues = values.some(valid);
    dataset = { label: 'VO₂max', data: values, borderColor: '#6DA8F7', backgroundColor: 'rgba(109,168,247,.10)', borderWidth: 2.2, tension: .25, pointRadius: dates.length > 90 ? 0 : 3, pointHoverRadius: 6, spanGaps: false };
    yTitle = 'ml/kg/min';
    note = 'Importierte Wellnesswerte. Messart und diagnostische Herkunft sind im Datenfeld nicht getrennt ausgewiesen; keine Gleichsetzung mit direkter Leistungsdiagnostik.';
  } else {
    const values = dates.map(date => {
      const entry = health[date];
      return entry?.status === 'sick' || entry?.status === 'injured' ? 1 : null;
    });
    hasValues = values.some(valid);
    dataset = {
      label: 'Dokumentierte Gesundheitsereignisse',
      data: values,
      showLine: false,
      pointRadius: values.map(value => value === null ? 0 : 5),
      pointHoverRadius: 7,
      pointStyle: dates.map(date => health[date]?.status === 'injured' ? 'rectRot' : 'triangle'),
      pointBackgroundColor: dates.map(date => health[date]?.status === 'injured' ? cssColor('--kajo-status-attention', '#F2B84B') : cssColor('--kajo-status-critical', '#F16B6B')),
      pointBorderColor: dates.map(date => health[date]?.status === 'injured' ? cssColor('--kajo-status-attention', '#F2B84B') : cssColor('--kajo-status-critical', '#F16B6B'))
    };
    yTitle = '';
    note = 'Nur dokumentierte Krankheits- und Verletzungseinträge. Die Darstellung ist keine medizinische Bewertung.';
  }
  const textColor = cssColor('--kajo-text-secondary', '#94a3b8');
  const gridColor = 'rgba(148,163,184,.12)';
  const isHealth = selectedMetric === 'health';
  trendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        title: { display: !hasValues, text: 'Keine passenden Daten im gewählten Zeitraum', color: textColor, font: { size: 11, weight: 'normal' } },
        tooltip: { callbacks: {
          title: items => items.length ? new Date(dates[items[0].dataIndex] + 'T12:00:00').toLocaleDateString('de-DE') : '',
          label: context => {
            if (isHealth) {
              const entry = health[dates[context.dataIndex]];
              return entry ? (entry.status === 'sick' ? 'Krankheit' : 'Verletzung') + (entry.diagnosis ? ': ' + entry.diagnosis : '') : 'Kein Eintrag';
            }
            return dataset.label + ': ' + (context.parsed.y == null ? '—' : fmt(context.parsed.y) + (yTitle ? ' ' + yTitle : ''));
          }
        } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 9, maxRotation: 0 } },
        y: isHealth
          ? { display: false, min: 0, max: 2, grid: { display: false } }
          : { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 5 }, title: { display: true, text: yTitle, color: textColor, font: { size: 9 } } }
      }
    }
  });
  setText('analysis-overview-trend-note', note);
  updateMetricSwitch();
}
export function setAnalysisOverviewMetric(metric) {
  if (!['load', 'recovery', 'performance', 'health'].includes(metric)) return;
  selectedMetric = metric;
  renderTrendChart();
}
function renderActivityChart() {
  const canvas = document.getElementById('analysis-overview-activity-chart');
  if (!canvas || typeof Chart !== 'function') return;
  if (activityChart) activityChart.destroy();
  const dates = rangeDates(currentRange());
  const labels = dates.map(dateLabel);
  const source = Array.isArray(state.rawActivities) ? state.rawActivities : [];
  const seen = new Set();
  const activities = source.filter(item => {
    const date = String(item?.date || '').slice(0, 10);
    if (!date || date < dates[0] || date > dates[dates.length - 1]) return false;
    const stableId = item.garminActivityId || item.externalId || item.id;
    const key = stableId != null && stableId !== '' ? 'id:' + stableId : [date, item.type, item.startTime || item.startTimeLocal || '', item.name || '', item.duration ?? ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const byDate = new Map();
  activities.forEach(item => {
    const date = String(item.date).slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(item);
  });
  const catalog = getSportsCatalog();
  const sports = [...new Set(activities.map(item => item.type || 'Other'))];
  const validDuration = item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) >= 0;
  const completeDates = new Set([...byDate.entries()].filter(([, items]) => items.every(validDuration)).map(([date]) => date));
  const datasets = sports.map(type => ({
    label: catalog[type]?.label || type || 'Weitere',
    data: dates.map(date => {
      const items = byDate.get(date);
      if (!items?.length || !completeDates.has(date)) return null;
      return items.filter(item => (item.type || 'Other') === type).reduce((sum, item) => sum + Number(item.duration), 0);
    }),
    backgroundColor: catalog[type]?.color || catalog.Other?.color || '#64748b',
    borderRadius: 3,
    maxBarThickness: 18,
    stack: 'duration'
  }));
  const minutes = activities.filter(item => completeDates.has(String(item.date).slice(0, 10)) && validDuration(item)).reduce((sum, item) => sum + Number(item.duration), 0);
  const incompleteCount = [...byDate.keys()].filter(date => !completeDates.has(date)).length;
  const note = activities.length
    ? activities.length + ' Aktivitäten · ' + fmt(minutes / 60) + ' h mit vollständiger Dauer' + (incompleteCount ? ' · Dauer an ' + incompleteCount + ' Tagen unvollständig' : '')
    : 'Keine gespeicherten Aktivitäten im gewählten Zeitraum.';
  setText('analysis-overview-activity-note', note + ' · Sportartenfarben kennzeichnen die Aktivität; fehlende Dauern werden nicht als 0 dargestellt.');
  const textColor = cssColor('--kajo-text-secondary', '#94a3b8');
  activityChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: sports.length > 1, position: 'bottom', labels: { color: textColor, boxWidth: 9, boxHeight: 9, font: { size: 9 }, padding: 12 } },
        title: { display: !activities.length, text: 'Noch keine Trainingsaktivitäten erfasst', color: textColor, font: { size: 11, weight: 'normal' } },
        tooltip: { callbacks: { label: context => context.dataset.label + ': ' + fmt(context.parsed.y) + ' min' } }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 9, maxRotation: 0 } },
        y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(148,163,184,.12)' }, ticks: { color: textColor, maxTicksLimit: 5 }, title: { display: true, text: 'Trainingsdauer · min', color: textColor, font: { size: 9 } } }
      }
    }
  });
}
function renderDetailedAnalysis() {
  const root = document.getElementById('analysis-overview-detail-content');
  if (!root) return;
  const range = currentRange();
  const timeline = Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [];
  const latest = [...timeline].reverse().find(day => day && day.date >= range.from && day.date <= range.to);
  const checkins = Object.entries(state.dailyCheckins || {})
    .filter(([date]) => date >= range.from && date <= range.to)
    .sort(([a], [b]) => b.localeCompare(a));
  const hrvRow = checkins.find(([, row]) => valid(row?.hrv));
  const vo2Row = checkins.find(([, row]) => valid(row?.vo2max));
  const hrv = hrvRow ? { date: hrvRow[0], value: Number(hrvRow[1].hrv) } : null;
  const vo2 = vo2Row ? { date: vo2Row[0], value: Number(vo2Row[1].vo2max) } : null;
  const healthEntries = Object.entries(state.healthLogs || {})
    .filter(([date, item]) => date >= range.from && date <= range.to && ['sick', 'injured'].includes(item?.status));
  const parts = [];

  if (latest?.load != null && valid(latest.atl)) {
    const label = latest.statusLabel && latest.statusLabel !== 'Modellwert'
      ? latest.statusLabel.toLowerCase()
      : 'Belastungswert vorhanden';
    parts.push('Belastung: ' + label + ' (ATL ' + fmt(latest.atl) + ').');
  } else if (latest?.dataStatus === 'unknown' || latest?.dataStatus === 'incomplete-activity-load') {
    parts.push('Belastung: zuletzt unvollständige Datenabdeckung; fehlende Tage werden nicht als Ruhetage gewertet.');
  } else {
    parts.push('Belastung: aktuell keine belastbare Einordnung möglich.');
  }

  if (hrv) parts.push('Letzter gespeicherter HRV-Wert: ' + fmt(hrv.value) + ' ms (' + dateLabel(hrv.date) + ').');
  if (vo2) parts.push('Letzter gespeicherter VO₂max-Wert: ' + fmt(vo2.value) + ' ml/kg/min (' + dateLabel(vo2.date) + ').');
  if (healthEntries.length) {
    const sick = healthEntries.filter(([, item]) => item.status === 'sick').length;
    const injured = healthEntries.filter(([, item]) => item.status === 'injured').length;
    parts.push('Dokumentierte Einträge im Zeitraum: ' + sick + ' Krankheit, ' + injured + ' Verletzung.');
  }

  root.textContent = parts.length
    ? parts.slice(0, 3).join(' ')
    : 'Für den gewählten Zeitraum liegen noch nicht genügend zusammenhängende Daten für eine Einordnung vor.';
}
export function renderAnalysisOverview() {
  for (const domain of ['load', 'recovery', 'performance']) renderCircle(domain);
  const health = sourceHero('health');
  const hasAvailability = valid(health.value) && health.value !== '—';
  setText('analysis-overview-health-value', hasAvailability ? health.value : '—');
  setText('analysis-overview-health-unit', hasAvailability ? health.unit : '');
  renderShortStatuses();
  renderTrendChart();
  renderActivityChart();
  renderDetailedAnalysis();
}
