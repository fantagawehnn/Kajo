/* KAJO analysis presentation layer.
 * Reads existing state and existing calculated values only. No new load,
 * readiness, performance or baseline formulas are introduced here.
 */
import { state } from './state.js';
import { calculateReadiness, historyRingColor } from './dashboard.js';
import { getActivityTelemetrySeries, setChartEmptyState } from './charts.js';
import { getGarminCheckinMetric } from './garmin-metric-access.js';
import { readinessZone } from './metric-zones.js?v=3';
import { isPaddlingPerformanceActivity, isValidElapsedTimeAxis, resolvePaddlingPerformanceSeries } from './performance-data-quality.js';

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
    const objectiveKeys = ['hrv', 'rhr', 'sleepDuration', 'sleepScore', 'respiration', 'vo2max'];
    const value = objectiveKeys.includes(key) ? getGarminCheckinMetric(row, key) : row?.[key];
    if (['sleepQuality', 'fatigue', 'soreness', 'motivation', 'stress'].includes(key) && (!valid(value) || Number(value) < 1 || Number(value) > 5)) continue;
    if (valid(value)) return { value: Number(value), date };
  }
  return null;
}
function renderLoad() {
  const timeline = Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [];
  const last = [...timeline].filter(day => day?.date <= todayKey() && valid(day?.atl)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (!last) {
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
  const range = healthRangeWindow();
  const readinessEntry = Object.keys(state.dailyCheckins || {}).filter(date => date >= range.from && date <= range.to && date <= todayKey())
    .sort((a, b) => b.localeCompare(a))
    .map(date => ({ date, result: calculateReadiness(date) }))
    .find(entry => entry.result?.enoughData && valid(entry.result.score));
  const score = readinessEntry ? readinessEntry.result.score : null;
  setHero('recovery', score === null ? '—' : String(score), score === null ? '' : '/ 100',
    'Readiness', readinessEntry ? 'Letzter verfügbarer Wert · ' + dateLabel(readinessEntry.date) : 'Im gewählten Zeitraum liegen nicht genügend Daten für Readiness vor.',
    score === null ? 'neutral' : readinessZone(score).status);

  const objectiveEntries = [
    ['HRV', 'hrv', 'Garmin · ms', 1],
    ['Ruhepuls', 'rhr', 'Garmin · bpm', 0],
    ['Schlafdauer', 'sleepDuration', 'Garmin · h', 1],
    ['Sleep Score', 'sleepScore', 'Garmin · /100', 0],
    ['Atemfrequenz', 'respiration', 'Garmin · /min', 1]
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
      '/5', entry?.date || '', true, color);
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
let performanceChart = null;
let selectedPerformanceMetric = null;
let performanceRange = '28d';
const performanceRangeDays = { '7d': 7, '28d': 28, '3m': 90, '6m': 180, '1y': 365 };
const performanceDateKey = date => {
  const d = new Date(date);
  return Number.isFinite(d.getTime()) ? d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') : '';
};
const performanceRangeStart = () => {
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() - (performanceRangeDays[performanceRange] || 28) + 1);
  return performanceDateKey(d);
};
const performanceActivities = () => (Array.isArray(state.rawActivities) ? state.rawActivities : [])
  .filter(activity => {
    if (!isPaddlingPerformanceActivity(activity)) return false;
    const date = String(activity?.date || activity?.startTime || '').slice(0,10);
    return date && date >= performanceRangeStart() && date <= todayKey();
  }).sort((a,b) => String(a.date || a.startTime).localeCompare(String(b.date || b.startTime)));
const performanceActivityMetric = (key, label, unit) => {
  const matches = performanceActivities().map(activity => {
    const series = resolvePaddlingPerformanceSeries(activity, getActivityTelemetrySeries(activity), key);
    if (!series || !isValidElapsedTimeAxis(series.time, series.values.length)) return null;
    const values = series.values.filter(valid).map(Number);
    if (!values.length) return null;
    return { activity, series, value: values.reduce((sum,v)=>sum+v,0)/values.length,
      count: values.length, label, unit: series.unit || unit, sourceDetail: series.sourceDetail || '' };
  }).filter(Boolean);
  return matches.length ? matches[matches.length-1] : null;
};
const performanceEscape = value => String(value).replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const performanceCircle = (key,label,value,unit,detail,color='var(--kajo-status-info)') =>
  '<button type="button" class="kajo-recovery-metric kajo-performance-metric" data-performance-metric="' + performanceEscape(key) +
  '" aria-pressed="false" style="--recovery-metric-color:' + color + '" onclick="togglePerformanceMetric(\'' + performanceEscape(key) + '\')">' +
  '<span class="kajo-recovery-metric-circle"><strong>' + performanceEscape(value) + '</strong></span>' +
  '<span class="kajo-recovery-metric-label">' + performanceEscape(label) + '</span><small>' + performanceEscape(unit || detail || 'Nicht erfasst') + '</small></button>';
function renderFitness() {
  const vo2 = latestCheckin('vo2max');
  setHero('performance', vo2 ? fmt(vo2.value, 1) : '—', vo2 ? 'ml/kg/min' : '',
    'Garmin-VO₂max', vo2 ? 'Letzter verfügbarer Garmin-Schätzwert · ' + dateLabel(vo2.date) + ' · nicht automatisch paddelspezifisch' : 'Kein gültiger Garmin-VO₂max-Wert dokumentiert.');
  // No validated Garmin-specific VO2max status threshold is defined; keep the indicator neutral.
  const vo2Color = 'var(--kajo-status-info)';
  const vo2Circle = performanceCircle('vo2max','VO₂max',vo2 ? fmt(vo2.value,1) : '—','ml/kg/min',
    vo2 ? 'Garmin-Schätzwert · nicht automatisch paddelspezifisch' : 'Nicht erfasst',vo2Color);
  renderMetrics('fitness-aerobic-metrics',[vo2Circle]);
  const overview = document.getElementById('fitness-overview-view');
  const detail = document.getElementById('performance-detail-view');
  if (overview) overview.classList.remove('hidden');
  if (detail) detail.classList.add('hidden');
  selectedPerformanceMetric = null;
  document.querySelectorAll('[data-performance-metric]').forEach(button => {
    button.classList.remove('is-selected'); button.setAttribute('aria-pressed','false');
  });
  const panel = document.getElementById('performance-trend-panel');
  if (panel) panel.classList.add('hidden');
  if (performanceChart) { performanceChart.destroy(); performanceChart = null; }
}
function renderPerformanceDetail() {
  const paddleDefs = [
    ['speed','Geschwindigkeit','km/h'],
    ['hr','Herzfrequenz','bpm'],
    ['power','Leistung','W'],
    ['cadence','Kadenz','/min']
  ];
  const paddleCircles = paddleDefs.map(([key,label,unit]) => {
    const entry = performanceActivityMetric(key,label,unit);
    const displayUnit = entry ? [entry.unit, entry.sourceDetail, 'Messpunktmittel · letzte Einheit'].filter(Boolean).join(' · ') : unit;
    return performanceCircle(key,label,entry ? fmt(entry.value, key==='hr'||key==='cadence'?0:1) : '—',
      displayUnit,entry ? 'Letzte Einheit' : 'Keine Messreihe', 'var(--kajo-status-info)');
  });
  renderMetrics('performance-paddling-metrics',paddleCircles);

  const strengthGroups = new Map();
  (Array.isArray(state.strengthPBs) ? state.strengthPBs : []).forEach(record => {
    if (!record?.exercise || !valid(record.weight) || !valid(record.reps) || !record.date) return;
    if (!strengthGroups.has(String(record.exercise))) strengthGroups.set(String(record.exercise),[]);
    strengthGroups.get(String(record.exercise)).push(record);
  });
  const strengthEntries = [...strengthGroups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'de'));
  renderMetrics('performance-strength-metrics', strengthEntries.length
    ? strengthEntries.map(([exercise,records]) => {
        const latest = [...records].sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
        const key = 'strength:' + encodeURIComponent(exercise);
        return performanceCircle(key,exercise,fmt(latest.weight,1),'kg × '+latest.reps,
          records.length+' Einträge','var(--kajo-status-info)');
      })
    : ['<p class="kajo-performance-empty">Noch keine dokumentierten Kraft-Bestwerte.</p>']);
  const count = document.getElementById('performance-strength-count');
  if (count) count.textContent = strengthEntries.length ? strengthEntries.length + ' Übungen' : 'Keine Daten';
  selectedPerformanceMetric = null;
  document.querySelectorAll('[data-performance-metric]').forEach(button => {
    button.classList.remove('is-selected'); button.setAttribute('aria-pressed','false');
  });
  const panel = document.getElementById('performance-trend-panel');
  if (panel) panel.classList.add('hidden');
  if (performanceChart) { performanceChart.destroy(); performanceChart = null; }
}

export function openPerformanceDetail() {
  const overview = document.getElementById('fitness-overview-view');
  const detail = document.getElementById('performance-detail-view');
  if (!overview || !detail) return;
  overview.classList.add('hidden');
  detail.classList.remove('hidden');
  renderPerformanceDetail();
}
export function closePerformanceDetail() {
  const overview = document.getElementById('fitness-overview-view');
  const detail = document.getElementById('performance-detail-view');
  if (overview) overview.classList.remove('hidden');
  if (detail) detail.classList.add('hidden');
  selectedPerformanceMetric = null;
  document.querySelectorAll('[data-performance-metric]').forEach(button => {
    button.classList.remove('is-selected'); button.setAttribute('aria-pressed','false');
  });
  const panel = document.getElementById('performance-trend-panel');
  if (panel) panel.classList.add('hidden');
  if (performanceChart) { performanceChart.destroy(); performanceChart = null; }
}
if (typeof window !== 'undefined') {
  window.openPerformanceDetail = openPerformanceDetail;
  window.closePerformanceDetail = closePerformanceDetail;
}

function renderPerformanceTrend(key) {
  const panel = document.getElementById('performance-trend-panel');
  const canvas = document.getElementById('performance-trend-chart');
  const title = document.getElementById('performance-trend-title');
  const note = document.getElementById('performance-trend-note');
  if (!panel || !canvas) return;
  if (typeof Chart !== 'function') { panel.classList.remove('hidden'); setChartEmptyState(canvas, 'Die Diagrammbibliothek konnte nicht geladen werden. Bitte lade KAJO erneut.', true); return; }
  if (performanceChart) { performanceChart.destroy(); performanceChart = null; }
  let labels = [], values = [], heading = '', unit = '', explanation = '', color = '#38bdf8';
  if (key === 'vo2max') {
    const entries = Object.entries(state.dailyCheckins || {}).filter(([date,row]) =>
      date >= performanceRangeStart() && date <= todayKey() && getGarminCheckinMetric(row, 'vo2max') !== null)
      .sort(([a],[b])=>a.localeCompare(b));
    labels = entries.map(([date])=>dateLabel(date));
    values = entries.map(([,row])=>getGarminCheckinMetric(row, 'vo2max'));
    heading = 'VO₂max · Garmin-Schätzwert'; unit = 'ml/kg/min';
    explanation = 'Verlauf der importierten Garmin-Schätzwerte. Das Garmin-Aktivitätsprofil belegt nicht die tatsächlich ausgeübte Sportart; der Wert ist daher nicht automatisch paddelspezifisch. keine direkte Spiroergometrie oder Labordiagnostik.';
    color = '#f97316';
  } else if (key.startsWith('strength:')) {
    const exercise = decodeURIComponent(key.slice(9));
    const entries = (state.strengthPBs || []).filter(row => String(row.exercise)===exercise && valid(row.weight) && row.date)
      .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    labels = entries.map(row=>dateLabel(row.date));
    values = entries.map(row=>Number(row.weight));
    heading = exercise + ' · dokumentierte Bestwerte'; unit = 'kg';
    explanation = 'Gespeicherte Gewichtsangaben je Eintrag. Wiederholungszahlen werden nicht zu einem geschätzten Kraftscore verrechnet.';
    color = '#a78bfa';
  } else {
    const metricMeta = {speed:['Geschwindigkeit','km/h'],hr:['Herzfrequenz','bpm'],power:['Leistung','W'],cadence:['Kadenz','/min']};
    const activity = performanceActivities().slice().reverse().map(item => ({
      activity:item, series:resolvePaddlingPerformanceSeries(item, getActivityTelemetrySeries(item), key)
    })).find(item=>item.series);
    if (activity) {
      values = activity.series.values.map(value=>valid(value)?Number(value):null);
      const time = activity.series.time;
      const hasElapsedTime = isValidElapsedTimeAxis(time, values.length);
      const formatElapsed = seconds => {
        const total = Math.max(0,Math.round(Number(seconds)));
        const hours = Math.floor(total/3600);
        const minutes = Math.floor((total%3600)/60);
        const remainder = total%60;
        return hours
          ? hours+':'+String(minutes).padStart(2,'0')+':'+String(remainder).padStart(2,'0')
          : minutes+':'+String(remainder).padStart(2,'0');
      };
      labels = values.map((_,i)=>hasElapsedTime ? formatElapsed(time[i]) : 'Messpunkt '+(i+1));
      heading = metricMeta[key][0] + ' · einzelne Trainingseinheit'; unit = metricMeta[key][1];
      const date = String(activity.activity.date || activity.activity.startTime || '').slice(0,10);
      const sport = activity.activity.sport || activity.activity.type || 'Training';
      unit = activity.series.unit || metricMeta[key][1];
      const sourceNote = activity.series.conversionNote || activity.series.sourceDetail;
      explanation = (date ? dateLabel(date)+' · ' : '') + sport +
        (sourceNote ? '. ' + sourceNote + '.' : '') +
        (hasElapsedTime ? ' Zeitachse: Zeit seit Start.' : ' Keine verlässliche Zeitachse; angezeigt wird nur die Messpunktfolge.') +
        ' Verlauf innerhalb einer Einheit; kein Vergleich zwischen unterschiedlichen Strecken, Gewässern oder Bedingungen.';
      color = '#38bdf8';
    } else {
      heading = metricMeta[key]?.[0] || 'Leistungswert';
      explanation = 'Für den gewählten Zeitraum liegt keine passende Messreihe vor.';
    }
  }
  if (title) title.textContent = heading;
  if (note) note.textContent = explanation + (values.filter(valid).length ? ' Fehlende Messpunkte bleiben als Lücken erhalten.' : '');
  panel.classList.remove('hidden');
  if (!values.some(valid)) {
    setChartEmptyState(canvas, 'Für diese Kennzahl liegen im gewählten Zeitraum keine auswertbaren Messpunkte vor.', true);
    return;
  }
  setChartEmptyState(canvas, '', false);
  performanceChart = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{labels,datasets:[{label:heading,data:values,borderColor:color,backgroundColor:color+'22',
      borderWidth:2,pointRadius:values.length>1?2:4,pointHoverRadius:5,tension:.2,spanGaps:false,fill:false}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>Number(item.parsed.y).toLocaleString('de-DE',{maximumFractionDigits:2})+' '+unit}}},
      scales:{x:{grid:{display:false},ticks:{color:'#94a3b8',maxTicksLimit:8}},
        y:{grid:{color:'rgba(148,163,184,.12)'},ticks:{color:'#94a3b8'}}}}
  });
}
export function togglePerformanceMetric(key) {
  const allowed = ['vo2max','speed','hr','power','cadence'];
  if (!allowed.includes(key) && !key.startsWith('strength:')) return;
  selectedPerformanceMetric = selectedPerformanceMetric === key ? null : key;
  document.querySelectorAll('[data-performance-metric]').forEach(button => {
    const active = button.dataset.performanceMetric === selectedPerformanceMetric;
    button.classList.toggle('is-selected',active);
    button.setAttribute('aria-pressed',String(active));
  });
  const panel = document.getElementById('performance-trend-panel');
  if (panel) panel.classList.toggle('hidden',!selectedPerformanceMetric);
  if (selectedPerformanceMetric) renderPerformanceTrend(selectedPerformanceMetric);
}
export function setPerformanceRange(range) {
  if (!Object.prototype.hasOwnProperty.call(performanceRangeDays,range)) return;
  performanceRange = range;
  document.querySelectorAll('[data-performance-range]').forEach(button =>
    button.classList.toggle('is-active',button.dataset.performanceRange===range));
  if (selectedPerformanceMetric && ['vo2max','speed','hr','power','cadence'].includes(selectedPerformanceMetric))
    renderPerformanceTrend(selectedPerformanceMetric);
}
if (typeof window !== 'undefined') {
  window.togglePerformanceMetric = togglePerformanceMetric;
  window.setPerformanceRange = setPerformanceRange;
}
let healthChart = null;
let selectedHealthMetric = null;
const healthRangeDays = { '7d':7, '28d':28, '3m':90, '6m':180, '1y':365 };
const healthDateKey = date => {
  const d = new Date(date);
  return Number.isFinite(d.getTime()) ? d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') : '';
};
const healthRangeWindow = () => {
  const today = todayKey();
  if (state.activeTimeframe === 'custom') {
    const from = document.getElementById('date-from')?.value || document.getElementById('health-summary-from')?.value;
    const to = document.getElementById('date-to')?.value || document.getElementById('health-summary-to')?.value;
    if (from && to && from <= to && to <= today) return { from, to };
  }
  const days = healthRangeDays[state.activeTimeframe] || 28;
  const start = new Date(today + 'T12:00:00');
  start.setDate(start.getDate() - days + 1);
  return { from: healthDateKey(start), to: today };
};
const healthRangeDates = () => {
  const range = healthRangeWindow(), dates = [];
  const cursor = new Date(range.from + 'T12:00:00'), end = new Date(range.to + 'T12:00:00');
  for (; cursor <= end && dates.length < 500; cursor.setDate(cursor.getDate() + 1)) dates.push(healthDateKey(cursor));
  return dates;
};
const healthEntries = () => {
  const range = healthRangeWindow();
  return Object.entries(state.healthLogs||{}).filter(([date,item])=>date>=range.from&&date<=range.to&&(item?.status==='sick'||item?.status==='injured'));
};
const cycleEntries = () => {
  const range = healthRangeWindow();
  return Object.entries(state.dailyCheckins||{}).filter(([date,item])=>date>=range.from&&date<=range.to&&item?.cycle?.period===true);
};
const healthCircle = (key,label,value,detail,color) =>
  '<button type="button" class="kajo-recovery-metric kajo-health-metric" data-health-metric="'+key+
  '" aria-pressed="false" style="--health-metric-color:'+color+'" onclick="toggleHealthMetric(\''+key+'\')">'+
  '<span class="kajo-recovery-metric-circle"><strong>'+performanceEscape(value)+'</strong></span>'+
  '<span class="kajo-recovery-metric-label">'+performanceEscape(label)+'</span><small>'+performanceEscape(detail)+'</small></button>';
let selectedHealthView = 'health';
let healthRelationshipChart = null;
function renderHealth() {
  const range = healthRangeWindow();
  const events = healthEntries();
  const cycles = cycleEntries();
  const sick = events.filter(([,item])=>item.status==='sick').length;
  const injured = events.filter(([,item])=>item.status==='injured').length;
  const cycleDays = cycles.length;
  const healthDays = events.length;
  setHero('health', String(healthDays), 'Tage', 'Dokumentierte Krankheits- und Verletzungstage',
    'Krankheit: '+sick+' · Verletzung: '+injured+' · Zeitraum '+dateLabel(range.from)+' – '+dateLabel(range.to)+'. Nur dokumentierte Einträge werden gezählt; fehlende Angaben gelten nicht als gesund.', 'neutral');
  const healthRoot = document.getElementById('health-documentation-metrics');
  if (healthRoot) healthRoot.innerHTML = [
    healthCircle('sick','Krankheit',sick,'Dokumentierte Tage',sick?'#eab308':'var(--kajo-status-info)'),
    healthCircle('injured','Verletzung',injured,'Dokumentierte Tage',injured?'#ef4444':'var(--kajo-status-info)')
  ].join('');
  const cycleRoot = document.getElementById('health-cycle-metrics');
  if (cycleRoot) cycleRoot.innerHTML = healthCircle('cycle','Periodentage',cycleDays,'Dokumentierte Tage','var(--kajo-status-info)');
  document.getElementById('health-view-health')?.classList.toggle('hidden', selectedHealthView !== 'health');
  document.getElementById('health-view-cycle')?.classList.toggle('hidden', selectedHealthView !== 'cycle');
  document.getElementById('health-view-relationships')?.classList.toggle('hidden', selectedHealthView !== 'relationships');
  document.querySelectorAll('[data-health-view]').forEach(button=>{
    const active=button.dataset.healthView===selectedHealthView;
    button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
  });
  document.querySelectorAll('[data-health-range]').forEach(button=>button.classList.toggle('is-active',button.dataset.healthRange===state.activeTimeframe));
  const trendPanel=document.getElementById('health-trend-panel');
  const showTrend=(selectedHealthView==='cycle')||(selectedHealthView==='health'&&!!selectedHealthMetric);
  if(trendPanel)trendPanel.classList.toggle('hidden',!showTrend);
  if(showTrend)renderHealthTrend(selectedHealthView==='cycle'?'cycle':selectedHealthMetric);
  else if(healthChart){healthChart.destroy();healthChart=null;}
  if(selectedHealthView==='relationships')renderHealthRelationships(range);
}
export function setHealthAnalysisView(view) {
  if(!['health','cycle','relationships'].includes(view))return;
  selectedHealthView=view;
  if(view==='cycle')selectedHealthMetric='cycle';
  else if(view==='health'&&selectedHealthMetric==='cycle')selectedHealthMetric=null;
  renderHealth();
}
function healthMedian(values) {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function healthComparisonTable(title,rows,unitLabel) {
  const body=rows.map(row=>'<tr><td>'+performanceEscape(row.label)+'</td><td class="text-right">'+(row.eventMedian==null?'—':performanceEscape(fmt(row.eventMedian,1)+' '+(row.unit||unitLabel)))+'<small class="block text-slate-500">n = '+row.eventCount+'</small></td><td class="text-right">'+(row.otherMedian==null?'—':performanceEscape(fmt(row.otherMedian,1)+' '+(row.unit||unitLabel)))+'<small class="block text-slate-500">n = '+row.otherCount+'</small></td></tr>').join('');
  return '<h3 class="text-sm font-semibold text-slate-200 mb-2">'+title+'</h3><table class="w-full text-xs"><thead><tr><th class="text-left">Kennzahl</th><th class="text-right">Krankheit / Verletzung</th><th class="text-right">Kein Eintrag</th></tr></thead><tbody>'+body+'</tbody></table>';
}
function renderHealthComparisons(range) {
  const loadRoot=document.getElementById('health-load-comparison');
  const recoveryRoot=document.getElementById('health-recovery-comparison');
  const note=document.getElementById('health-comparison-note');
  const logs=state.healthLogs||{},checkins=state.dailyCheckins||{};
  const timeline=(state.dailyTimeline||[]).filter(day=>day?.date>=range.from&&day?.date<=range.to
    &&['complete','confirmed-rest'].includes(day.dataStatus)
    &&day.load!==null&&day.load!==undefined&&Number.isFinite(Number(day.load)));
  const hasLoadProvenance=timeline.every(day=>String(day.loadMode||'').trim()&&String(day.loadUnit||'').trim());
  const modes=[...new Set(timeline.map(day=>String(day.loadMode||'')+'|'+String(day.loadUnit||'')))];
  const loadRows=[];
  if(modes.length===1&&timeline.length&&hasLoadProvenance){
    const values=timeline.map(day=>({value:Number(day.load),event:['sick','injured'].includes(String(logs[day.date]?.status||''))}));
    const event=values.filter(x=>x.event).map(x=>x.value),other=values.filter(x=>!x.event).map(x=>x.value);
    loadRows.push({label:'Tägliche Trainingsbelastung',eventMedian:healthMedian(event),eventCount:event.length,otherMedian:healthMedian(other),otherCount:other.length});
    if(loadRoot)loadRoot.innerHTML=healthComparisonTable('Trainingsbelastung · '+(timeline[0].loadMode==='srpe'?'sRPE-Load':timeline[0].loadMode==='garmin-zone'?'KAJO-HF-Zonenindex':timeline[0].loadMode==='garmin-native'?'Garmin Training Load':String(timeline[0].loadMode)),loadRows,timeline[0].loadUnit);
  }else if(loadRoot){
    loadRoot.innerHTML='<p class="kajo-health-note">'+(modes.length>1?'Die Load-Modelle oder Einheiten wechseln im gewählten Zeitraum. Deshalb wird kein gemeinsamer Median berechnet.':timeline.length&&!hasLoadProvenance?'Für einige Tageswerte fehlen Modell- oder Einheitenangaben. Deshalb wird kein gemeinsamer Median berechnet.':'Es liegen keine vollständigen Tages-Load-Werte im gewählten Zeitraum vor.')+'</p>';
  }
  const definitions=[
    ['HRV','hrv','ms'],['Ruheherzfrequenz','rhr','bpm'],['Schlafscore','sleepScore','Punkte'],['Atemfrequenz','respiration','/ min']
  ];
  const rows=definitions.map(([label,key,unit])=>{
    const observations=Object.entries(checkins).filter(([date,record])=>date>=range.from&&date<=range.to)
      .map(([date,record])=>({date,value:getGarminCheckinMetric(record,key),event:['sick','injured'].includes(String(logs[date]?.status||''))}))
      .filter(item=>item.value!==null&&Number.isFinite(item.value));
    const event=observations.filter(x=>x.event).map(x=>x.value),other=observations.filter(x=>!x.event).map(x=>x.value);
    return {label,eventMedian:healthMedian(event),eventCount:event.length,otherMedian:healthMedian(other),otherCount:other.length,unit};
  }).filter(row=>row.eventCount+row.otherCount>0);
  if(recoveryRoot)recoveryRoot.innerHTML=rows.length
    ?healthComparisonTable('Garmin-Regenerationswerte',rows,'')
    :'<p class="kajo-health-note">Keine passenden Garmin-Regenerationswerte im gewählten Zeitraum dokumentiert.</p>';
  if(note){
    const eventDates=new Set(Object.entries(logs).filter(([date,item])=>date>=range.from&&date<=range.to&&['sick','injured'].includes(String(item?.status||''))).map(([date])=>date));
    note.textContent=eventDates.size+' dokumentierte Krankheit-/Verletzungstage im Zeitraum. Unterschiede zwischen den Gruppen sind deskriptiv und erlauben keine Aussage über Ursache oder Wirkung.';
  }
}
function renderHealthRelationships(range) {
  renderHealthComparisons(range);
  const canvas=document.getElementById('health-relationship-chart'),note=document.getElementById('health-relationship-note');
  if(!canvas)return;
  if(typeof Chart!=='function'){setChartEmptyState(canvas,'Die Diagrammbibliothek konnte nicht geladen werden. Bitte lade KAJO erneut.',true);return;}
  if(healthRelationshipChart){healthRelationshipChart.destroy();healthRelationshipChart=null;}
  const pairs=Object.entries(state.dailyCheckins||{})
    .filter(([date,item])=>date>=range.from&&date<=range.to&&valid(item?.cycle?.pain)&&valid(item?.cycle?.trainingImpact))
    .map(([date,item])=>({x:Number(item.cycle.pain),y:Number(item.cycle.trainingImpact),date}))
    .filter(p=>p.x>=1&&p.x<=5&&p.y>=1&&p.y<=5);
  if(note)note.textContent=pairs.length
    ? pairs.length+' Tage mit gleichzeitig dokumentierten Angaben. Jeder Punkt steht für einen Tag. Die Darstellung beschreibt eine zeitliche Gemeinsamkeit, keinen ursächlichen Effekt. Fehlende Angaben werden nicht ergänzt.'
    : 'Für den gewählten Zeitraum liegen noch keine Tage mit gleichzeitig dokumentierten Angaben zu Beschwerden und Trainingseinfluss vor.';
  if(!pairs.length){setChartEmptyState(canvas,'Keine Tage mit gleichzeitig dokumentierten Angaben zu Beschwerden und Trainingseinfluss im gewählten Zeitraum.',true);return;}
  setChartEmptyState(canvas,'',false);
  healthRelationshipChart=new Chart(canvas.getContext('2d'),{type:'scatter',
    data:{datasets:[{label:'Dokumentierte Tage',data:pairs,backgroundColor:'#e879a9',pointRadius:5,pointHoverRadius:7}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>{const p=item.raw;return 'Schmerzen: '+p.x+'/5 · Trainingseinfluss: '+p.y+'/5 · '+dateLabel(p.date);}}}},
      scales:{x:{min:1,max:5,title:{display:true,text:'Schmerzen / Beschwerden (1–5)',color:'#94a3b8'},ticks:{color:'#94a3b8',stepSize:1},grid:{color:'rgba(148,163,184,.12)'}},
        y:{min:1,max:5,title:{display:true,text:'Trainingseinfluss (1–5)',color:'#94a3b8'},ticks:{color:'#94a3b8',stepSize:1},grid:{color:'rgba(148,163,184,.12)'}}}}
  });
}
function renderHealthTrend(key) {
  const panel=document.getElementById('health-trend-panel');
  const canvas=document.getElementById('health-trend-chart');
  const title=document.getElementById('health-trend-title');
  const noteEl=document.getElementById('health-trend-note');
  if(!panel||!canvas)return;
  if(typeof Chart!=='function'){panel.classList.remove('hidden');setChartEmptyState(canvas,'Die Diagrammbibliothek konnte nicht geladen werden. Bitte lade KAJO erneut.',true);return;}
  if(healthChart){healthChart.destroy();healthChart=null;}
  const dates=healthRangeDates();
  const labels=dates.map(date=>new Date(date+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}));
  let datasets=[],heading='',explanation='',type='bar',max=1;
  if(key==='sick'||key==='injured'){
    const status=key;
    const label=status==='sick'?'Krankheit':'Verletzung';
    const entries=state.healthLogs||{};
    const values=dates.map(date=>entries[date]?.status===status?1:null);
    heading=label+' · dokumentierte Tage';
    explanation='Dargestellt sind ausschließlich Tage mit einem gespeicherten '+label.toLowerCase()+'seintrag. Tage ohne Balken sind nicht dokumentiert und dürfen nicht als gesund interpretiert werden.';
    datasets=[{label,data:values,backgroundColor:status==='sick'?'#eab308':'#ef4444',borderRadius:4,maxBarThickness:18}];
  }else if(key==='cycle'){
    const checkins=state.dailyCheckins||{};
    const period=dates.map(date=>checkins[date]?.cycle?.period===true?0:null);
    const pain=dates.map(date=>valid(checkins[date]?.cycle?.pain)?Number(checkins[date].cycle.pain):null);
    const impact=dates.map(date=>valid(checkins[date]?.cycle?.trainingImpact)?Number(checkins[date].cycle.trainingImpact):null);
    heading='Zyklus · Beschwerden und Trainingseinfluss';
    explanation='Die Linien zeigen dokumentierte Schmerzen und Trainingsbeeinträchtigung auf der erfassten fünfstufigen Skala (1–5) an allen erfassten Zyklustagen – nicht nur während der Menstruation. Kleine rosafarbene Markierungen auf der Nulllinie kennzeichnen Periodentage, ohne sie als Beschwerdewert darzustellen. Fehlende Angaben bleiben Lücken. Keine medizinische Interpretation oder Ableitung von Eisprung und Zyklusphasen.';
    type='line';max=5;
    datasets=[
      {label:'Periodentag',data:period,borderColor:'#be789f',backgroundColor:'#be789f',pointBackgroundColor:'#be789f',pointBorderColor:'#be789f',pointRadius:period.map(v=>v===null?0:6),pointHoverRadius:7,pointStyle:'rectRot',showLine:false},
      {label:'Schmerzen',data:pain,borderColor:'#e879a9',backgroundColor:'#e879a922',pointRadius:3,tension:.15,spanGaps:false},
      {label:'Trainingsbeeinträchtigung',data:impact,borderColor:'#f59e0b',backgroundColor:'#f59e0b22',pointRadius:3,tension:.15,spanGaps:false}
    ];
  }
  const hasValues=datasets.some(dataset=>dataset.data.some(valid));
  if(title)title.textContent=heading;
  if(noteEl)noteEl.textContent=explanation;
  panel.classList.remove('hidden');
  if(!hasValues){setChartEmptyState(canvas,'Für diesen Zeitraum liegen keine passenden Gesundheits- oder Zyklusmesswerte vor.',true);if(noteEl)noteEl.textContent+=' Fehlende Angaben werden nicht ergänzt oder als Nullwerte interpretiert.';return;}
  setChartEmptyState(canvas,'',false);
  healthChart=new Chart(canvas.getContext('2d'),{
    type,data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:datasets.length>1,labels:{color:'#94a3b8',usePointStyle:true,boxWidth:8}},
        tooltip:{callbacks:{label:item=>item.dataset.label==='Periodentag'?'Periodentag dokumentiert':item.dataset.label+': '+(item.parsed.y==null?'—':item.parsed.y+(key==='cycle'?' / 5':' dokumentiert'))}}},
      scales:{x:{grid:{display:false},ticks:{color:'#94a3b8',maxTicksLimit:9}},
        y:{beginAtZero:true,max,ticks:{color:'#94a3b8',stepSize:1},
          grid:{color:'rgba(148,163,184,.12)'}}}}
  });
}
export function toggleHealthMetric(key){
  if(!['sick','injured','cycle'].includes(key))return;
  if(key==='cycle'){setHealthAnalysisView('cycle');return;}
  selectedHealthView='health';
  selectedHealthMetric=selectedHealthMetric===key?null:key;
  document.querySelectorAll('[data-health-metric]').forEach(button=>{
    const active=button.dataset.healthMetric===selectedHealthMetric;
    button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));
  });
  const panel=document.getElementById('health-trend-panel');
  if(panel)panel.classList.toggle('hidden',!selectedHealthMetric);
  if(selectedHealthMetric)renderHealthTrend(selectedHealthMetric);
  document.getElementById('health-view-health')?.classList.remove('hidden');
  document.getElementById('health-view-cycle')?.classList.add('hidden');
  document.getElementById('health-view-relationships')?.classList.add('hidden');
  document.querySelectorAll('[data-health-view]').forEach(button=>{const active=button.dataset.healthView==='health';button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
}
export function setHealthRange(range){
  if(range==='custom'){
    const wasCustom=state.activeTimeframe==='custom';
    const from=document.getElementById('health-summary-from'),to=document.getElementById('health-summary-to');
    const current=healthRangeWindow();
    if(from&&(!wasCustom||!from.value))from.value=current.from;
    if(to&&(!wasCustom||!to.value))to.value=current.to;
    const feedback=document.getElementById('health-summary-custom-feedback');
    if(feedback)feedback.textContent='';
    document.getElementById('health-summary-custom-range')?.classList.remove('hidden');
    state.activeTimeframe='custom';state.metricHistoryRange='custom';
    document.querySelectorAll('[data-health-range]').forEach(button=>button.classList.toggle('is-active',button.dataset.healthRange==='custom'));
    renderHealth();window.kajoRenderHealthAnalysis?.();return;
  }
  if(!Object.prototype.hasOwnProperty.call(healthRangeDays,range))return;
  document.getElementById('health-summary-custom-range')?.classList.add('hidden');
  if(typeof window.setTimeframe==='function')window.setTimeframe(range);
  else {state.activeTimeframe=range;state.metricHistoryRange=range;}
  renderHealth();
}
export function applyHealthCustomRange(){
  const from=document.getElementById('health-summary-from')?.value;
  const to=document.getElementById('health-summary-to')?.value;
  const feedback=document.getElementById('health-summary-custom-feedback');
  if(!from||!to||from>to||to>todayKey()){
    if(feedback)feedback.textContent='Bitte wähle einen gültigen Zeitraum bis einschließlich heute.';
    return;
  }
  if(feedback)feedback.textContent='';
  const loadFrom=document.getElementById('date-from'),loadTo=document.getElementById('date-to');
  if(loadFrom)loadFrom.value=from;if(loadTo)loadTo.value=to;
  state.activeTimeframe='custom';state.metricHistoryRange='custom';
  document.getElementById('health-summary-custom-range')?.classList.add('hidden');
  if(typeof window.applyCustomDateRange==='function')window.applyCustomDateRange();
  else {renderHealth();window.kajoRenderHealthAnalysis?.();}
  renderHealth();
}
if(typeof window!=='undefined'){
  window.toggleHealthMetric=toggleHealthMetric;
  window.setHealthAnalysisView=setHealthAnalysisView;
  window.setHealthRange=setHealthRange;
  window.applyHealthCustomRange=applyHealthCustomRange;
  window.kajoRenderHealthMetrics=renderHealth;
}
function setupSharedPeriod() {
  if (!state.metricHistoryRange) state.metricHistoryRange = state.activeTimeframe || '3m';
  const target = document.getElementById('analysis-shared-period');
  const buttons = document.getElementById('analysis-period-buttons');
  if (target && buttons && buttons.parentElement !== target) target.appendChild(buttons);
  const labels = { '7d': '7 T', '28d': '28 T', '3m': '3 M', '6m': '6 M', '1y': '1 J' };
  setText('analysis-period-label', labels[state.activeTimeframe] || 'Individueller Zeitraum');
}
export function renderAnalysisPageUI(subpage = 'load') {
  setupSharedPeriod();
  renderLoad();
  renderRecovery();
  renderFitness();
  renderHealth();
  const note = document.getElementById('health-history-baseline-note');
  if (note) note.textContent = 'Persönlicher Normalbereich noch nicht verfügbar: Neue Intervals-Wellnesswerte werden als RMSSD und manuelle HRV-Eingaben als eigene Quelle gekennzeichnet. Ältere Messwerte ohne Quellenmetadaten bleiben jedoch unbekannt und werden nicht nachträglich zugeordnet. Manuelle HRV-Werte haben keine bestätigte Messmethode; nur eindeutig als Intervals-RMSSD gekennzeichnete Werte eignen sich für eine ln(RMSSD)-Reihe. Eine adaptive Baseline benötigt zusätzlich eine verbindlich festgelegte Statistik und Mindestdatenbasis.';
}
