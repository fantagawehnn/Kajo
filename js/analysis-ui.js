/* KAJO analysis presentation layer.
 * Reads existing state and existing calculated values only. No new load,
 * readiness, performance or baseline formulas are introduced here.
 */
import { state } from './state.js';
import { calculateReadiness } from './dashboard.js';

const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const fmt = (value, digits = 1) => valid(value)
  ? Number(value).toLocaleString('de-DE', { maximumFractionDigits: digits })
  : '—';
const todayKey = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const dateLabel = key => key ? new Date(key + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const setText = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value == null ? '' : String(value);
};
const setHero = (domain, value, unit, status, note, stateName = 'neutral') => {
  setText('analysis-' + domain + '-hero-value', value);
  setText('analysis-' + domain + '-hero-unit', unit);
  setText('analysis-' + domain + '-hero-status', status);
  setText(domain + '-hero-note', note);
  const ring = document.getElementById(domain + '-hero-ring');
  if (ring) ring.dataset.status = stateName;
};
const metric = (label, value, detail = '') => `
  <div class="kajo-analysis-metric">
    <span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}
  </div>`;
const renderMetrics = (id, items) => {
  const root = document.getElementById(id);
  if (root) root.innerHTML = items.join('');
};
function latestCheckin(key) {
  const entries = Object.entries(state.dailyCheckins || {}).sort(([a], [b]) => b.localeCompare(a));
  for (const [date, row] of entries) {
    let value = row?.[key];
    if (key === 'sleepDuration') value = row?.sleepDuration ?? (Number(row?.sleep) > 5 ? row.sleep : null);
    if (valid(value)) return { value: Number(value), date };
  }
  return null;
}
function renderLoad() {
  const timeline = Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [];
  const last = timeline[timeline.length - 1];
  if (!last || !valid(last.atl)) {
    setHero('load', '—', '', 'Keine auswertbare Belastung', 'ATL ist nicht berechenbar, solange kein gültiger Belastungsverlauf vorliegt.');
    renderMetrics('load-analysis-metrics', [
      metric('CTL', '—'), metric('ATL', '—'), metric('Belastungssaldo', '—'), metric('ACWR', '—')
    ]);
    return;
  }
  const mode = last.loadMode === 'garmin-native' ? 'Garmin Training Load'
    : last.loadMode === 'garmin-zone' ? 'Garmin-HF-Zonenindex'
    : last.loadMode === 'srpe' ? 'sRPE-Load'
    : last.loadMode || 'Belastungsmodell';
  setHero('load', fmt(last.atl), 'ATL', 'Kurzfristige Belastung', mode + ' · Modellwert zum ' + dateLabel(last.date) + '. Kein künstlicher Gesamt-Score.', 'neutral');
  const balance = String(last.loadMode || '').startsWith('garmin')
    ? (valid(last.formPct) ? fmt(last.formPct) + ' %' : '—')
    : fmt(last.tsb);
  renderMetrics('load-analysis-metrics', [
    metric('CTL', fmt(last.ctl), 'langfristige Belastung'),
    metric('ATL', fmt(last.atl), 'kurzfristige Belastung'),
    metric(last.loadMode?.startsWith('garmin') ? 'Relativer Saldo' : 'TSB', balance),
    metric('ACWR', fmt(last.acwr))
  ]);
  const activities = Array.isArray(state.rawActivities) ? state.rawActivities : [];
  const garminValues = activities.filter(activity => valid(activity.garminTrainingLoad)).length;
  const srpeValues = activities.filter(activity => valid(activity.sRpeLoad)).length;
  renderMetrics('load-analysis-sources', [
    metric('Garmin Training Load', String(garminValues), 'Aktivitäten mit separatem Garmin-Wert'),
    metric('Edwards TRIMP', '—', 'Kein eigenständiges Datenfeld nachgewiesen'),
    metric('sRPE-Load', String(srpeValues), 'Aktivitäten mit separatem sRPE-Wert')
  ]);
}
function renderRecovery() {
  if (!state.healthHistoryMetric) state.healthHistoryMetric = 'hrv';
  const readiness = calculateReadiness();
  const today = todayKey();
  const current = state.dailyCheckins?.[today] || {};
  const score = readiness.score;
  setHero('recovery', score === null ? '—' : String(score), score === null ? '' : '/ 100',
    score === null ? 'Noch nicht ausreichend erfasst' : 'Bestehende Readiness',
    score === null ? readiness.dataQuality : 'Bestehendes KAJO-Modell · ' + readiness.dataQuality + '. Kein medizinischer Messwert.', 'neutral');
  const entries = [
    ['HRV', current.hrv, 'ms', 'hrv'],
    ['Ruhepuls', current.rhr, 'bpm', 'rhr'],
    ['Schlafdauer', current.sleepDuration ?? (Number(current.sleep) > 5 ? current.sleep : null), 'h', 'sleepDuration'],
    ['Sleep Score', current.sleepScore, '/ 100', 'sleepScore'],
    ['Body Battery', current.bodyBattery, '', 'bodyBattery'],
    ['Stress', current.stress, '/ 10', 'stress'],
    ['Müdigkeit', current.fatigue, '/ 10', 'fatigue'],
    ['Muskelkater', current.soreness, '/ 10', 'soreness']
  ];
  renderMetrics('recovery-analysis-metrics', entries.map(([label, value, unit, key]) =>
    metric(label, valid(value) ? fmt(value, key === 'sleepDuration' ? 1 : 0) + (unit ? ' ' + unit : '') : '—',
      valid(value) ? 'Heute' : 'Heute nicht erfasst')));
}
function renderPerformance() {
  const vo2 = latestCheckin('vo2max');
  if (vo2) {
    setHero('performance', fmt(vo2.value, 1), 'ml/kg/min', 'VO₂max · importierter Wellnesswert',
      'Messart und diagnostische Herkunft sind im vorhandenen Datenfeld nicht getrennt ausgewiesen. Deshalb keine Gleichsetzung mit einer direkten Leistungsdiagnostik.', 'neutral');
  } else {
    setHero('performance', '—', '', 'Keine direkte Leistungskennzahl verfügbar',
      'CTL bleibt ein Belastungs-/Fitnessindikator und wird nicht als gemessene Performance ausgegeben.', 'neutral');
  }
  renderMetrics('performance-analysis-metrics', [
    metric('VO₂max', vo2 ? fmt(vo2.value, 1) : '—', vo2 ? 'Letzter Wert · ' + dateLabel(vo2.date) : 'Nicht erfasst'),
    metric('Geschwindigkeit', '—', 'Keine methodisch vergleichbare Zeitreihe eingebunden'),
    metric('Leistung', '—', 'Keine methodisch vergleichbare Zeitreihe eingebunden'),
    metric('HF-Drift / HRR60', '—', 'Noch nicht als Analysewerte eingebunden')
  ]);
}
let healthChart = null;
function renderHealthTimeline() {
  const canvas = document.getElementById('analysis-health-timeline');
  if (!canvas || typeof Chart !== 'function') return;
  const labels = [], sick = [], injured = [];
  const end = new Date(todayKey() + 'T12:00:00');
  for (let i = 27; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    labels.push(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
    sick.push(state.healthLogs?.[key]?.status === 'sick' ? 1 : 0);
    injured.push(state.healthLogs?.[key]?.status === 'injured' ? 1 : 0);
  }
  if (healthChart) healthChart.destroy();
  healthChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Krankheit', data: sick, backgroundColor: '#eab308', stack: 'events' },
      { label: 'Verletzung', data: injured, backgroundColor: '#ef4444', stack: 'events' }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#94a3b8', usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { title: items => items.length ? labels[items[0].dataIndex] : '',
          label: item => item.dataset.label + ': ' + (item.parsed.y ? 'dokumentiert' : 'kein Eintrag') } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8 } },
        y: { stacked: true, beginAtZero: true, max: 2, ticks: { display: false, stepSize: 1 }, grid: { color: 'rgba(148,163,184,.10)' } }
      }
    }
  });
}
function renderHealth() {
  const from = new Date(todayKey() + 'T12:00:00'); from.setDate(from.getDate() - 27);\n  const fromKey = from.getFullYear() + '-' + String(from.getMonth() + 1).padStart(2, '0') + '-' + String(from.getDate()).padStart(2, '0');\n  const entries = Object.entries(state.healthLogs || {}).filter(([date, item]) => date >= fromKey && date <= todayKey() && (item?.status === 'sick' || item?.status === 'injured'));
  const sick = entries.filter(([, item]) => item.status === 'sick').length;
  const injured = entries.filter(([, item]) => item.status === 'injured').length;
  setHero('health', '—', '', 'Noch nicht berechenbar',
    'Eine belastbare Trainingsverfügbarkeit kann erst ausgewiesen werden, wenn Gesundheits- und Planungsdaten für denselben Zeitraum vollständig verknüpft sind.', 'neutral');
  renderMetrics('health-analysis-metrics', [
    metric('Krankheitstage', String(sick), 'Dokumentierte Einträge'),
    metric('Verletzungstage', String(injured), 'Dokumentierte Einträge'),
    metric('Gesundheitseinträge', String(entries.length)),
    metric('Trainingsverfügbarkeit', '—', 'Datenbasis nicht ausreichend')
  ]);
  renderHealthTimeline();
}
function setupSharedPeriod() {
  if (!state.metricHistoryRange) state.metricHistoryRange = state.activeTimeframe || '3m';
  const target = document.getElementById('analysis-shared-period');
  const buttons = document.getElementById('analysis-period-buttons');
  const custom = document.getElementById('custom-date-box');
  if (target && buttons && buttons.parentElement !== target) target.appendChild(buttons);
  if (target && custom && custom.parentElement !== target) target.appendChild(custom);
  const labels = { '7d': 'Letzte 7 Tage', '28d': 'Letzte 28 Tage', '3m': 'Letzte 90 Tage', '6m': 'Letzte 180 Tage', '1y': 'Letztes Jahr' };
  setText('analysis-period-label', labels[state.activeTimeframe] || 'Individueller Zeitraum');
}
export function renderAnalysisPageUI(subpage = 'load') {
  setupSharedPeriod();
  renderLoad();
  renderRecovery();
  renderPerformance();
  renderHealth();
  const note = document.getElementById('health-history-baseline-note');
  if (note) note.textContent = 'Persönlicher Normalbereich noch nicht verfügbar: Die statistische Methode für eine robuste, adaptive Baseline ist noch nicht festgelegt. Es wird daher kein Normalbereich vorgetäuscht.';
}
