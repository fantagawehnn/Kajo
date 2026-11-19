/* KAJO analysis presentation layer.
 * Reads existing state and existing calculated values only. No new load,
 * readiness, performance or baseline formulas are introduced here.
 */
import { state } from './state.js';
import { calculateReadiness, historyRingColor } from './dashboard.js';
import { getActivityTelemetrySeries } from './charts.js';
import { getGarminCheckinMetric } from './garmin-metric-access.js';
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
  if (!panel || !canvas || typeof Chart !== 'function') return;
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
    canvas.classList.add('hidden');
    return;
  }
  canvas.classList.remove('hidden');
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
let healthRange = '28d';
const healthRangeDays = { '7d':7, '28d':28, '3m':90, '6m':180, '1y':365 };
const healthDateKey = date => {
  const d = new Date(date);
  return Number.isFinite(d.getTime()) ? d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') : '';
};
const healthRangeStart = () => {
  const d = new Date(todayKey()+'T12:00:00');
  d.setDate(d.getDate()-(healthRangeDays[healthRange]||28)+1);
  return healthDateKey(d);
};
const healthEntries = () => Object.entries(state.healthLogs||{})
  .filter(([date,item])=>date>=healthRangeStart()&&date<=todayKey()&&(item?.status==='sick'||item?.status==='injured'));
const cycleEntries = () => Object.entries(state.dailyCheckins||{})
  .filter(([date,item])=>date>=healthRangeStart()&&date<=todayKey()&&item?.cycle?.period===true);
const healthCircle = (key,label,value,detail,color) =>
  '<button type="button" class="kajo-recovery-metric kajo-health-metric" data-health-metric="'+key+
  '" aria-pressed="false" style="--health-metric-color:'+color+'" onclick="toggleHealthMetric(\''+key+'\')">'+
  '<span class="kajo-recovery-metric-circle"><strong>'+performanceEscape(value)+'</strong></span>'+
  '<span class="kajo-recovery-metric-label">'+performanceEscape(label)+'</span><small>'+performanceEscape(detail)+'</small></button>';
function renderHealth() {
  const events = healthEntries();
  const cycles = cycleEntries();
  const sick = events.filter(([,item])=>item.status==='sick').length;
  const injured = events.filter(([,item])=>item.status==='injured').length;
  const cycleDays = cycles.length;
  renderMetrics('health-documentation-metrics',[
    healthCircle('sick','Krankheit',sick,'Dokumentierte Tage',sick?'#eab308':'var(--kajo-status-info)'),
    healthCircle('injured','Verletzung',injured,'Dokumentierte Tage',injured?'#ef4444':'var(--kajo-status-info)'),
    healthCircle('cycle','Zyklus',cycleDays,'Dokumentierte Zyklustage','var(--kajo-status-info)')
  ]);
  selectedHealthMetric = null;
  document.querySelectorAll('[data-health-metric]').forEach(button=>{
    button.classList.remove('is-selected');button.setAttribute('aria-pressed','false');
  });
  const panel=document.getElementById('health-trend-panel');
  if(panel)panel.classList.add('hidden');
  if(healthChart){healthChart.destroy();healthChart=null;}
}
function renderHealthTrend(key) {
  const panel=document.getElementById('health-trend-panel');
  const canvas=document.getElementById('health-trend-chart');
  const title=document.getElementById('health-trend-title');
  const noteEl=document.getElementById('health-trend-note');
  if(!panel||!canvas||typeof Chart!=='function')return;
  if(healthChart){healthChart.destroy();healthChart=null;}
  const dates=[];
  const end=new Date(todayKey()+'T12:00:00');
  const count=healthRangeDays[healthRange]||28;
  for(let i=count-1;i>=0;i--){
    const d=new Date(end);d.setDate(d.getDate()-i);
    dates.push(healthDateKey(d));
  }
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
    const pain=dates.map(date=>checkins[date]?.cycle?.period===true&&valid(checkins[date].cycle.pain)?Number(checkins[date].cycle.pain):null);
    const impact=dates.map(date=>checkins[date]?.cycle?.period===true&&valid(checkins[date].cycle.trainingImpact)?Number(checkins[date].cycle.trainingImpact):null);
    heading='Zyklus · dokumentierte Angaben';
    explanation='Schmerzen und Trainingsbeeinträchtigung stammen aus den manuellen Zyklusangaben (Skala 0–10). Fehlende Einträge werden als Lücken dargestellt; es erfolgt keine medizinische Interpretation.';
    type='line';max=10;
    datasets=[
      {label:'Schmerzen',data:pain,borderColor:'#e879a9',backgroundColor:'#e879a922',pointRadius:3,tension:.15,spanGaps:false},
      {label:'Trainingsbeeinträchtigung',data:impact,borderColor:'#f59e0b',backgroundColor:'#f59e0b22',pointRadius:3,tension:.15,spanGaps:false}
    ];
  }
  const hasValues=datasets.some(dataset=>dataset.data.some(valid));
  if(title)title.textContent=heading;
  if(noteEl)noteEl.textContent=explanation;
  panel.classList.remove('hidden');
  if(!hasValues){canvas.classList.add('hidden');if(noteEl)noteEl.textContent+=' Für den gewählten Zeitraum liegen keine passenden Messwerte vor.';return;}
  canvas.classList.remove('hidden');
  healthChart=new Chart(canvas.getContext('2d'),{
    type,data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:datasets.length>1,labels:{color:'#94a3b8',usePointStyle:true,boxWidth:8}},
        tooltip:{callbacks:{label:item=>item.dataset.label+': '+(item.parsed.y==null?'—':item.parsed.y+(key==='cycle'?' / 10':' dokumentiert'))}}},
      scales:{x:{grid:{display:false},ticks:{color:'#94a3b8',maxTicksLimit:9}},
        y:{beginAtZero:true,max,ticks:{color:'#94a3b8',stepSize:key==='cycle'?2:1},
          grid:{color:'rgba(148,163,184,.12)'}}}}
  });
}
export function toggleHealthMetric(key){
  if(!['sick','injured','cycle'].includes(key))return;
  selectedHealthMetric=selectedHealthMetric===key?null:key;
  document.querySelectorAll('[data-health-metric]').forEach(button=>{
    const active=button.dataset.healthMetric===selectedHealthMetric;
    button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));
  });
  const panel=document.getElementById('health-trend-panel');
  if(panel)panel.classList.toggle('hidden',!selectedHealthMetric);
  if(selectedHealthMetric)renderHealthTrend(selectedHealthMetric);
}
export function setHealthRange(range){
  if(!Object.prototype.hasOwnProperty.call(healthRangeDays,range))return;
  healthRange=range;
  document.querySelectorAll('[data-health-range]').forEach(button=>button.classList.toggle('is-active',button.dataset.healthRange===range));
  if(selectedHealthMetric)renderHealthTrend(selectedHealthMetric);
}
if(typeof window!=='undefined'){
  window.toggleHealthMetric=toggleHealthMetric;
  window.setHealthRange=setHealthRange;
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
  renderFitness();
  renderHealth();
  const note = document.getElementById('health-history-baseline-note');
  if (note) note.textContent = 'Persönlicher Normalbereich noch nicht verfügbar: Neue Intervals-Wellnesswerte werden als RMSSD und manuelle HRV-Eingaben als eigene Quelle gekennzeichnet. Ältere Messwerte ohne Quellenmetadaten bleiben jedoch unbekannt und werden nicht nachträglich zugeordnet. Manuelle HRV-Werte haben keine bestätigte Messmethode; nur eindeutig als Intervals-RMSSD gekennzeichnete Werte eignen sich für eine ln(RMSSD)-Reihe. Eine adaptive Baseline benötigt zusätzlich eine verbindlich festgelegte Statistik und Mindestdatenbasis.';
}
