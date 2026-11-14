/* KAJO analysis presentation layer.
 * Reads existing state and existing calculated values only. No new load,
 * readiness, performance or baseline formulas are introduced here.
 */
import { state } from './state.js';
import { calculateReadiness, historyRingColor } from './dashboard.js';

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
const metric = (label, value, detail = '', action = '') => action
  ? `<button type="button" class="kajo-analysis-metric kajo-analysis-metric-link" onclick="${action}" aria-label="${label}: ${value}. Verlauf öffnen">
      <span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}<span class="kajo-analysis-metric-hint" aria-hidden="true">Verlauf ansehen ↗</span>
    </button>`
  : `<div class="kajo-analysis-metric">
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
  setHero('load', fmt(last.atl), last.loadUnit || 'Load-Punkte', 'Kurzfristige Belastung · ATL', mode + ' · Modellwert zum ' + dateLabel(last.date) + '. Kein künstlicher Gesamt-Score.', 'neutral');
  const balance = String(last.loadMode || '').startsWith('garmin')
    ? (valid(last.formPct) ? fmt(last.formPct) + ' %' : '—')
    : fmt(last.tsb);
  renderMetrics('load-analysis-metrics', [
    metric('CTL', fmt(last.ctl), 'langfristige Belastung', "openTrainingMetric('fitness')"),
    metric('ATL', fmt(last.atl), 'kurzfristige Belastung', "openTrainingMetric('atl')"),
    metric(last.loadMode?.startsWith('garmin') ? 'Relativer Saldo' : 'TSB', balance, '', "openTrainingMetric('form')"),
    metric('ACWR', fmt(last.acwr), '', "openTrainingMetric('acwr')")
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
function recoveryCircleMetric(label, key, value, unit = '', date = '', interactive = true, color = 'var(--kajo-status-info)') {
  const detail = date ? 'Letzter Wert · ' + dateLabel(date) : 'Nicht erfasst';
  const action = interactive
    ? ` onclick="toggleRecoveryMetric('${key}')"`
    : ' disabled aria-disabled="true"';
  return '<button type="button" class="kajo-recovery-metric' + (interactive ? '' : ' is-unavailable') +
    '" data-recovery-metric="' + key + '" aria-pressed="false" style="--recovery-metric-color:' + color + '"' +
    ' aria-label="' + label + ': ' + value + (unit ? ' ' + unit : '') + '"' + action + '>' +
    '<span class="kajo-recovery-metric-circle"><strong>' + value + '</strong></span>' +
    '<span class="kajo-recovery-metric-label">' + label + '</span>' +
    '<small>' + (unit || detail) + '</small>' +
    '</button>';
}
function renderRecovery() {
  // Keep the existing aggregate value available to the analysis overview only.
  // Its visual summary is intentionally not rendered on the Recovery detail page.
  const readiness = calculateReadiness(todayKey());
  const score = readiness.enoughData ? readiness.score : null;
  setHero('recovery', score === null ? '—' : String(score), score === null ? '' : '/ 100',
    'Readiness', '', score === null ? 'neutral' : score >= 80 ? 'good' : score >= 60 ? 'attention' : 'critical');

  const objectiveEntries = [
    ['HRV', 'hrv', 'ms', 1],
    ['Ruhepuls', 'rhr', 'bpm', 0],
    ['Schlafdauer', 'sleepDuration', 'h', 1],
    ['Sleep Score', 'sleepScore', '/100', 0],
    ['Atemfrequenz', 'respiration', '/min', 1]
  ];
  renderMetrics('recovery-analysis-metrics', objectiveEntries.map(([label, key, unit, digits]) => {
    const entry = latestCheckin(key);
    const color = entry ? historyRingColor(key, entry.value, entry.date) : 'var(--kajo-status-info)';
    return recoveryCircleMetric(label, key, entry ? fmt(entry.value, digits) : '—',
      unit, entry?.date || '', true, color);
  }));

  const subjectiveEntries = [
    ['Schlafqualität', 'sleepQuality'],
    ['Müdigkeit', 'fatigue'],
    ['Muskelkater', 'soreness'],
    ['Motivation', 'motivation'],
    ['Subjektiver Stress', 'stress']
  ];
  renderMetrics('recovery-subjective-metrics', subjectiveEntries.map(([label, key]) => {
    const entry = latestCheckin(key);
    const color = entry ? historyRingColor(key, entry.value, entry.date) : 'var(--kajo-status-info)';
    return recoveryCircleMetric(label, key, entry ? fmt(entry.value, 0) : '—',
      '/10', entry?.date || '', true, color);
  }));

  const objectiveRoot = document.getElementById('recovery-analysis-metrics');
  if (objectiveRoot) {
    let availabilityNote = document.getElementById('recovery-garmin-availability-note');
    if (!availabilityNote) {
      availabilityNote = document.createElement('p');
      availabilityNote.id = 'recovery-garmin-availability-note';
      availabilityNote.className = 'kajo-recovery-data-note';
      objectiveRoot.insertAdjacentElement('afterend', availabilityNote);
    }
    availabilityNote.textContent = 'Body Battery – Garmin-Import noch nicht angebunden. Garmin-Stress und SpO₂ werden als Garmin-Datensätze gespeichert, sind aber noch nicht als tägliche Recovery-Verläufe integriert.';
  }
  const objective = document.getElementById('recovery-objective-count');
  const subjective = document.getElementById('recovery-subjective-count');
  if (objective) objective.textContent = objectiveEntries.length + ' Messwerte';
  if (subjective) subjective.textContent = subjectiveEntries.length + ' Angaben';
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
    metric('VO₂max', vo2 ? fmt(vo2.value, 1) : '—', vo2 ? 'Letzter Wert · ' + dateLabel(vo2.date) : 'Nicht erfasst', "openHealthMetric('vo2max')"),
    metric('Geschwindigkeit', '—', 'Keine methodisch vergleichbare Zeitreihe eingebunden'),
    metric('Leistung', '—', 'Keine methodisch vergleichbare Zeitreihe eingebunden'),
    metric('HF-Drift / HRR60', '—', 'Noch nicht als Analysewerte eingebunden')
  ]);
}
let healthChart = null;
function renderHealthTimeline() {
  const canvas = document.getElementById('analysis-health-timeline');
  if (!canvas || typeof Chart !== 'function') return;
  const labels = [], dateKeys = [], sick = [], injured = [];
  const end = new Date(todayKey() + 'T12:00:00');
  for (let i = 27; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    dateKeys.push(key);
    labels.push(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    sick.push(state.healthLogs?.[key]?.status === 'sick' ? 1 : 0);
    injured.push(state.healthLogs?.[key]?.status === 'injured' ? 1 : 0);
  }
  const detail = document.getElementById('health-timeline-selection');
  const showDay = index => {
    if (!detail || index < 0 || index >= dateKeys.length) return;
    const key = dateKeys[index];
    const entry = state.healthLogs?.[key];
    const status = entry?.status === 'sick' ? 'Krankheit dokumentiert'
      : entry?.status === 'injured' ? 'Verletzung dokumentiert'
      : 'Kein Krankheits- oder Verletzungseintrag dokumentiert';
    detail.textContent = new Date(key + 'T12:00:00').toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    }) + ' · ' + status + (entry?.diagnosis ? ' · ' + entry.diagnosis : '');
  };
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
      onClick: (_event, elements) => {
        if (elements.length) showDay(elements[0].index);
      },
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
  const from = new Date(todayKey() + 'T12:00:00'); from.setDate(from.getDate() - 27);
  const fromKey = from.getFullYear() + '-' + String(from.getMonth() + 1).padStart(2, '0') + '-' + String(from.getDate()).padStart(2, '0');
  const entries = Object.entries(state.healthLogs || {}).filter(([date, item]) => date >= fromKey && date <= todayKey() && (item?.status === 'sick' || item?.status === 'injured'));
  const sick = entries.filter(([, item]) => item.status === 'sick').length;
  const injured = entries.filter(([, item]) => item.status === 'injured').length;
  setHero('health', '—', '', 'Trainingsverfügbarkeit nicht berechenbar',
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
  if (target && buttons && buttons.parentElement !== target) target.appendChild(buttons);
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
  if (note) note.textContent = 'Persönlicher Normalbereich noch nicht verfügbar: Neue Intervals-Wellnesswerte werden als RMSSD und manuelle HRV-Eingaben als eigene Quelle gekennzeichnet. Ältere Messwerte ohne Quellenmetadaten bleiben jedoch unbekannt und werden nicht nachträglich zugeordnet. Manuelle HRV-Werte haben keine bestätigte Messmethode; nur eindeutig als Intervals-RMSSD gekennzeichnete Werte eignen sich für eine ln(RMSSD)-Reihe. Eine adaptive Baseline benötigt zusätzlich eine verbindlich festgelegte Statistik und Mindestdatenbasis.';
}
