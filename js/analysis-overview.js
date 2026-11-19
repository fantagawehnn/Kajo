/* KAJO V2 – Analyseübersicht
 * Präsentationsschicht: nutzt vorhandene Werte und Datenquellen.
 * Keine neuen Belastungs-, Fitness-, Recovery- oder Health-Scores.
 */
import { state } from './state.js';
import { getSportsCatalog, escapeHtml } from './utils.js';
import { renderHeartRateZoneDistribution } from './charts.js';
import { calculatePeriodSummary } from './period-summary.js';
import { getVisibleActivities } from './activity-groups.js';
import { getGarminCheckinMetric } from './garmin-metric-access.js';

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
const dateLabel = key => new Date(key + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const COLORS = { load: '#D32F2F', recovery: '#1E88E5', performance: '#39C98A', health: '#F2B84B' };
let trendChart = null;
let activityChart = null;
let selectedMetrics = new Set(['load', 'recovery', 'performance']);
let activityMeasure = 'duration';

function sourceHero(domain) {
  const value = document.getElementById('analysis-' + domain + '-hero-value')?.textContent?.trim() || '—';
  const unit = document.getElementById('analysis-' + domain + '-hero-unit')?.textContent?.trim() || '';
  return { value, unit };
}
function renderCircle(domain) {
  const data = sourceHero(domain);
  setText('analysis-overview-' + domain + '-value', data.value);
  setText('analysis-overview-' + domain + '-unit', data.unit);
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
function buildSeries(dates) {
  const timeline = new Map((state.dailyTimeline || []).map(day => [day.date, day]));
  const checkins = state.dailyCheckins || {};
  const load = dates.map(date => {
    const day = timeline.get(date);
    return day && valid(day.load) ? Number(day.load) : null;
  });
  const recovery = dates.map(date => valid(checkins[date]?.garminHrv ?? (checkins[date]?.measurementSources?.hrv?.source === 'garmin' ? checkins[date]?.hrv : null)) ? Number(checkins[date]?.garminHrv ?? checkins[date]?.hrv) : null);
  const performance = dates.map(date => getGarminCheckinMetric(checkins[date], 'vo2max'));
  // Health availability is deliberately not inferred from illness/injury logs.
  // No continuous availability series exists in the current data model.
  const health = dates.map(() => null);
  return [
    { key: 'load', label: 'Load · Tagesload', unit: (state.dailyTimeline || []).slice(-1)[0]?.loadUnit || 'Load-Punkte', raw: load, color: COLORS.load },
    { key: 'recovery', label: 'Recovery · HRV', unit: 'ms', raw: recovery, color: COLORS.recovery },
    { key: 'performance', label: 'Performance · Garmin-VO₂max', unit: 'ml/kg/min', raw: performance, color: COLORS.performance },
    { key: 'health', label: 'Health · nicht berechenbar', unit: '', raw: health, color: COLORS.health, unavailable: true }
  ];
}
function toRelativeIndex(raw) {
  const baseline = raw.find(value => valid(value) && Number(value) > 0);
  if (!valid(baseline)) return { values: raw.map(() => null), baseline: null };
  return {
    baseline: Number(baseline),
    values: raw.map(value => valid(value) ? Number((Number(value) / Number(baseline) * 100).toFixed(2)) : null)
  };
}
function updateMetricSwitch() {
  document.querySelectorAll('[data-overview-metric]').forEach(button => {
    const key = button.dataset.overviewMetric;
    const active = selectedMetrics.has(key);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('is-unavailable', key === 'health');
    button.disabled = key === 'health';
  });
}
function renderTrendChart() {
  const canvas = document.getElementById('analysis-overview-trend-chart');
  if (!canvas || typeof Chart !== 'function') return;
  if (trendChart) trendChart.destroy();
  const dates = rangeDates(currentRange());
  const labels = dates.map(dateLabel);
  const series = buildSeries(dates);
  const datasets = series.map(item => {
    const indexed = toRelativeIndex(item.raw);
    return {
      label: item.label,
      data: indexed.values,
      rawValues: item.raw,
      baseline: indexed.baseline,
      unit: item.unit,
      borderColor: item.color,
      backgroundColor: item.color,
      borderWidth: 2.2,
      tension: .22,
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 0,
      spanGaps: false,
      fill: false,
      hidden: !selectedMetrics.has(item.key)
    };
  });
  const hasValues = datasets.some(dataset => dataset.data.some(valid) && !dataset.hidden);
  const textColor = cssColor('--kajo-text-secondary', '#94a3b8');
  trendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        title: { display: !hasValues, text: 'Keine auswertbaren Messwerte im gewählten Zeitraum', color: textColor, font: { size: 11, weight: 'normal' } },
        tooltip: { callbacks: {
          title: items => items.length ? new Date(dates[items[0].dataIndex] + 'T12:00:00').toLocaleDateString('de-DE') : '',
          label: context => {
            const dataset = context.dataset;
            const raw = dataset.rawValues?.[context.dataIndex];
            const index = context.parsed.y;
            if (!valid(raw) || !valid(index)) return dataset.label + ': keine Messung';
            const change = Number(index) - 100;
            const sign = change > 0 ? '+' : '';
            return dataset.label + ': ' + fmt(raw) + (dataset.unit ? ' ' + dataset.unit : '') +
              ' · ' + sign + fmt(change) + ' % zum ersten Messwert';
          }
        } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 9, maxRotation: 0 } },
        y: { grid: { color: 'rgba(148,163,184,.12)' }, ticks: { color: textColor, maxTicksLimit: 5 }, title: { display: true, text: 'Index · erster Messwert = 100', color: textColor, font: { size: 9 } } }
      }
    }
  });
  const healthNote = 'Health: keine kontinuierliche Trainingsverfügbarkeit berechenbar. Dokumentierte Krankheits- und Verletzungseinträge werden nicht als täglicher Score interpretiert.';
  setText('analysis-overview-trend-note',
    'Jede Reihe wird im gewählten Zeitraum auf ihren ersten gültigen Messwert = 100 normiert. Die Linien zeigen relative Veränderungen innerhalb der jeweiligen Kennzahl; ihre Höhe ist nicht dimensionsübergreifend vergleichbar. Garmin-VO₂max ist eine Schätzung; das Garmin-Aktivitätsprofil bestätigt nicht die tatsächlich ausgeübte Sportart und ist daher nicht automatisch paddelspezifisch. ' + healthNote);
  updateMetricSwitch();
}
export function setAnalysisOverviewMetric(metric) {
  if (!['load', 'recovery', 'performance', 'health'].includes(metric)) return;
  if (selectedMetrics.has(metric)) {
    if (selectedMetrics.size === 1) return;
    selectedMetrics.delete(metric);
  } else selectedMetrics.add(metric);
  renderTrendChart();
}
function getActivitiesInRange(dates) {
  const source = Array.isArray(state.rawActivities) ? state.rawActivities : [];
  const seen = new Set();
  return source.filter(item => {
    const date = String(item?.date || '').slice(0, 10);
    if (!date || date < dates[0] || date > dates[dates.length - 1]) return false;
    const stableId = item.garminActivityId || item.externalId || item.id;
    const key = stableId != null && stableId !== '' ? 'id:' + stableId :
      [date, item.type, item.startTime || item.startTimeLocal || '', item.name || '', item.duration ?? ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function updateActivitySwitch() {
  document.querySelectorAll('[data-overview-activity-measure]').forEach(button => {
    const active = button.dataset.overviewActivityMeasure === activityMeasure;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
export function setAnalysisOverviewActivityMeasure(measure) {
  if (!['duration', 'sessions'].includes(measure)) return;
  activityMeasure = measure;
  renderActivityChart();
}
function renderActivityChart() {
  const canvas = document.getElementById('analysis-overview-activity-chart');
  if (!canvas || typeof Chart !== 'function') return;
  if (activityChart) activityChart.destroy();
  const dates = rangeDates(currentRange());
  const activities = getActivitiesInRange(dates);
  const catalog = getSportsCatalog();
  const bySport = new Map();
  activities.forEach(item => {
    const key = item.type || 'Other';
    if (!bySport.has(key)) bySport.set(key, []);
    bySport.get(key).push(item);
  });
  const validDuration = item => item.duration !== null && item.duration !== undefined &&
    item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0;
  const entries = [...bySport.entries()].map(([key, items]) => {
    const complete = items.every(validDuration);
    return {
      key, items, complete,
      label: catalog[key]?.label || key,
      color: catalog[key]?.color || catalog.Other?.color || '#64748b',
      minutes: complete ? items.reduce((sum, item) => sum + Number(item.duration), 0) : null,
      sessions: items.length
    };
  }).filter(item => activityMeasure === 'sessions' || item.complete);
  const values = entries.map(item => activityMeasure === 'sessions' ? item.sessions : Number((item.minutes / 60).toFixed(2)));
  const labels = entries.map(item => item.label);
  const colors = entries.map(item => item.color);
  const totalSessions = activities.length;
  const completeSports = entries.length;
  const incompleteSports = [...bySport.values()].filter(items => !items.every(validDuration)).length;
  const totalDuration = entries.reduce((sum, item) => sum + (item.minutes || 0), 0);
  const note = !activities.length ? 'Keine gespeicherten Aktivitäten im gewählten Zeitraum.' :
    activityMeasure === 'sessions'
      ? totalSessions + ' dokumentierte Einheiten · Verteilung nach Anzahl der Aktivitäten.'
      : fmt(totalDuration / 60) + ' h · vollständige Dauern aus ' + completeSports + ' Sportarten' +
        (incompleteSports ? ' · ' + incompleteSports + ' Sportarten wegen fehlender Dauer nicht in der Verteilung' : '');
  setText('analysis-overview-activity-note', note);
  const textColor = cssColor('--kajo-text-secondary', '#94a3b8');
  const totalValue = values.reduce((sum, value) => sum + value, 0);
  const sportDatasets = entries.map((item, index) => ({
    label: item.label,
    data: [values[index]],
    backgroundColor: item.color,
    borderWidth: 0,
    barThickness: 22,
    categoryPercentage: 0.72,
    barPercentage: 0.9
  }));
  activityChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: [''], datasets: sportDatasets },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          beginAtZero: true,
          max: totalValue || undefined,
          display: false,
          grid: { display: false },
          ticks: { display: false }
        },
        y: { stacked: true, display: false, grid: { display: false } }
      },
      plugins: {
        legend: { display: false },
        title: { display: !values.length, text: activityMeasure === 'duration' && activities.length ? 'Keine vollständigen Dauern verfügbar' : 'Noch keine Trainingsaktivitäten erfasst', color: textColor, font: { size: 11, weight: 'normal' } },
        tooltip: { callbacks: { label: context => {
          const value = Number(context.parsed.x || 0);
          const share = totalValue > 0 ? value / totalValue * 100 : 0;
          return context.dataset.label + ': ' + fmt(value) + (activityMeasure === 'sessions' ? ' Einheiten' : ' h') + ' · ' + share.toFixed(1) + ' %';
        } } }
      }
    }
  });
  const legend = document.getElementById('analysis-overview-activity-legend');
  if (legend) legend.innerHTML = entries.map(item => {
    const value = activityMeasure === 'sessions' ? item.sessions + ' Einheiten' : fmt(item.minutes / 60) + ' h';
    return '<div class="kajo-analysis-distribution-row"><span class="kajo-analysis-distribution-label"><i style="background:' +
      escapeHtml(item.color) + '"></i>' + escapeHtml(item.label) + '</span><strong>' + value + '</strong></div>';
  }).join('') || '<p class="kajo-analysis-chart-note">Für diese Darstellung liegen keine auswertbaren Werte vor.</p>';
  updateActivitySwitch();
}

function renderPeriodSummary() {
  const root = document.getElementById('analysis-period-summary');
  const note = document.getElementById('analysis-period-summary-note');
  if (!root) return;
  const range = currentRange();
  // Use the same de-duplicated, grouped activity view as the period charts.
  const summaryActivities = getVisibleActivities(getActivitiesInRange(rangeDates(range)));
  const summary = calculatePeriodSummary({
    activities: summaryActivities, races: state.races, healthLogs: state.healthLogs,
    from: range.from, to: range.to
  });
  if (!summary.validRange) {
    root.innerHTML = '';
    if (note) note.textContent = 'Bitte einen gültigen Zeitraum auswählen.';
    return;
  }
  const duration = summary.durationMinutes === null ? '—' : fmt(summary.durationMinutes / 60) + ' h';
  const durationDetail = summary.durationCount
    ? 'Dauer für ' + summary.durationCount + ' / ' + summary.activityCount + ' Einheiten erfasst'
    : 'Keine auswertbaren Dauern';
  const cards = [
    ['Einheiten', summary.activityCount, 'Dokumentierte Aktivitäten'],
    ['Trainingstage', summary.trainingDays, 'Tage mit mindestens einer Aktivität'],
    ['Erfasste Trainingszeit', duration, durationDetail],
    ['Wettkämpfe', summary.raceCount, summary.resultCount + ' Starts mit Ergebnis'],
    ['Podien / Siege', summary.podiumCount + ' / ' + summary.winCount, 'Nur dokumentierte Platzierungen'],
    ['Krankheit / Verletzung', summary.sickDays + ' / ' + summary.injuredDays, 'Dokumentierte Tage']
  ];
  root.innerHTML = cards.map(([label, value, detail]) =>
    '<div class="kajo-insight-metric"><span>' + escapeHtml(label) + '</span><strong>' +
    escapeHtml(String(value)) + '</strong><small>' + escapeHtml(detail) + '</small></div>'
  ).join('');
  if (note) {
    const incompleteDuration = summary.durationCount < summary.activityCount;
    note.textContent = 'Zeitraum ' + dateLabel(range.from) + ' – ' + dateLabel(range.to) +
      '. Trainingstage zählen nur Tage mit gespeicherten Aktivitäten; fehlende Einträge werden nicht als Ruhetage interpretiert.' +
      (incompleteDuration ? ' Die Trainingszeit ist unvollständig, weil nicht für alle Einheiten eine Dauer vorliegt.' : '');
  }
  const canoeRoot = document.getElementById('analysis-period-canoe-summary');
  const canoeNote = document.getElementById('analysis-period-canoe-note');
  if (canoeRoot) {
    const canoe = summary.canoeCount ? [
      ['K1', summary.canoeClasses.K1, 'Dokumentierte K1-Einheiten'],
      ['C1', summary.canoeClasses.C1, 'Dokumentierte C1-Einheiten'],
      ['C2', summary.canoeClasses.C2, 'Dokumentierte C2-Einheiten'],
      ['Classic', summary.canoeFormats.classic, 'Explizit als Classic markiert'],
      ['Sprint', summary.canoeFormats.sprint, 'Explizit als Sprint markiert'],
      ['Wildwasser / Flachwasser', summary.canoeWaterTypes.wildwater + ' / ' + summary.canoeWaterTypes.flatwater, 'Explizit dokumentierter Gewässertyp']
    ] : [];
    canoeRoot.innerHTML = canoe.map(([label, value, detail]) =>
      '<div class="kajo-insight-metric"><span>' + escapeHtml(label) + '</span><strong>' +
      escapeHtml(String(value)) + '</strong><small>' + escapeHtml(detail) + '</small></div>'
    ).join('') || '<p class="kajo-analysis-chart-note">Keine Kanuaktivitäten im gewählten Zeitraum.</p>';
  }
  if (canoeNote) {
    canoeNote.textContent = summary.canoeCount
      ? 'Kanuaktivitäten: ' + summary.canoeCount + ' · Rennformat bei ' +
        (summary.canoeCount - summary.canoeFormatUnspecifiedCount) + ' / ' + summary.canoeCount +
        ' Einheiten hinterlegt · Gewässertyp bei ' +
        (summary.canoeCount - summary.canoeWaterTypeUnspecifiedCount) + ' / ' + summary.canoeCount +
        ' Einheiten hinterlegt. Nicht zugeordnete Einheiten bleiben unklassifiziert.'
      : 'Die Kanu-Aufschlüsselung erscheint, sobald im Zeitraum Kanuaktivitäten dokumentiert sind.';
  }
}

function renderIntensityDistribution() {
  const dates = rangeDates(currentRange());
  const activities = getActivitiesInRange(dates);
  renderHeartRateZoneDistribution(activities, {
    canvasId: 'analysis-overview-intensity-chart',
    noteId: 'analysis-overview-intensity-note',
    summaryId: 'analysis-overview-intensity-summary',
    fromDate: dates[0],
    toDate: dates[dates.length - 1],
    chartKey: 'analysisOverviewZoneChartInstance'
  });
}
export function renderAnalysisOverview() {
  for (const domain of ['load', 'recovery', 'performance', 'health']) renderCircle(domain);
  renderTrendChart();
  renderActivityChart();
  renderIntensityDistribution();
  renderPeriodSummary();
}
