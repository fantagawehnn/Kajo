/* KAJO V2 – Analyseübersicht
 * Präsentationsschicht: nutzt vorhandene Werte und Datenquellen.
 * Keine neuen Belastungs-, Fitness-, Recovery- oder Health-Scores.
 */
import { state } from './state.js';
import { getSportsCatalog, escapeHtml } from './utils.js';
import { renderHeartRateZoneDistribution, setChartEmptyState } from './charts.js';
import { calculatePeriodSummary } from './period-summary.js';
import { getVisibleActivities } from './activity-groups.js';
import { getGarminCheckinMetric } from './garmin-metric-access.js';
import { calculateReadiness } from './readiness.js';

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
let formChart = null;
let activityChart = null;
let selectedMetrics = new Set(['load', 'recovery', 'performance']);
let healthMarkersVisible = true;
let activityMeasure = 'duration';

function sourceHero(domain) {
  const value = document.getElementById('analysis-' + domain + '-hero-value')?.textContent?.trim() || '—';
  const unit = document.getElementById('analysis-' + domain + '-hero-unit')?.textContent?.trim() || '';
  const status = document.getElementById('analysis-' + domain + '-hero-status')?.textContent?.trim() || '';
  const note = document.getElementById(domain + '-hero-note')?.textContent?.trim() || '';
  return { value, unit, status, note };
}
function renderCircle(domain) {
  const data = sourceHero(domain);
  setText('analysis-overview-' + domain + '-value', data.value);
  setText('analysis-overview-' + domain + '-unit', data.unit);
  if (domain === 'recovery') {
    const detail = [data.status, data.note].filter(Boolean).join(' · ');
    setText('analysis-overview-recovery-detail', detail || 'Readiness · / 100');
  }
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
  const readiness = dates.map(date => {
    if (date > todayKey() || !checkins[date]) return null;
    const result = calculateReadiness(date, state);
    return result?.enoughData && valid(result.score) ? Number(result.score) : null;
  });
  const performance = dates.map(date => getGarminCheckinMetric(checkins[date], 'vo2max'));
  return [
    { key: 'load', label: 'Load · Tagesload', unit: (state.dailyTimeline || []).slice(-1)[0]?.loadUnit || 'Load-Punkte', raw: load, color: COLORS.load },
    { key: 'recovery', label: 'Recovery · HRV', unit: 'ms', raw: recovery, color: COLORS.recovery },
    { key: 'readiness', label: 'Recovery · Readiness', unit: '/ 100', raw: readiness, color: '#34D399' },
    { key: 'performance', label: 'Fitness · Garmin-VO₂max', unit: 'ml/kg/min', raw: performance, color: COLORS.performance }
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
    const active = key === 'health' ? healthMarkersVisible : selectedMetrics.has(key);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.classList.remove('is-unavailable');
    button.disabled = false;
  });
}
function renderFormTrendChart() {
  const canvas = document.getElementById('analysis-overview-form-chart');
  if (!canvas) return;
  if (formChart) { formChart.destroy(); formChart = null; }
  if (typeof Chart !== 'function') {
    setChartEmptyState(canvas, 'Die Diagrammbibliothek konnte nicht geladen werden. Bitte lade KAJO erneut.', true);
    return;
  }
  const dates = rangeDates(currentRange());
  const timeline = new Map((state.dailyTimeline || []).map(day => [day.date, day]));
  const rows = dates.map(date => timeline.get(date) || null);
  const latest = [...rows].reverse().find(row => row && (valid(row.ctl) || valid(row.atl) || valid(row.tsb) || valid(row.formPct)));
  if (!latest) {
    setChartEmptyState(canvas, 'Für den gewählten Zeitraum liegt kein berechenbarer CTL-/ATL-/Formverlauf vor.', true);
    setText('analysis-overview-form-note', 'Unbekannte Tage unterbrechen die Belastungsberechnung. Sie werden weder als Ruhetage noch als Nullbelastung ergänzt.');
    return;
  }
  const mode = latest.loadMode || 'load-model';
  const garminMode = mode === 'garmin-native' || mode === 'garmin-zone';
  const compatible = row => row && (row.loadMode || 'load-model') === mode;
  const ctl = rows.map(row => compatible(row) && valid(row.ctl) ? Number(row.ctl) : null);
  const atl = rows.map(row => compatible(row) && valid(row.atl) ? Number(row.atl) : null);
  const form = rows.map(row => {
    if (!compatible(row)) return null;
    const value = garminMode ? row.formPct : row.tsb;
    return valid(value) ? Number(value) : null;
  });
  const hasAny = ctl.some(valid) || atl.some(valid) || form.some(valid);
  if (!hasAny) {
    setChartEmptyState(canvas, 'Für den gewählten Zeitraum liegen keine kompatiblen Modellwerte vor.', true);
    return;
  }
  setChartEmptyState(canvas, '', false);
  const textColor = cssColor('--kajo-text-secondary', '#94a3b8');
  const formLabel = garminMode ? 'Garmin-Form · relativ zu CTL (%)' : 'TSB · CTL minus ATL (' + (latest.loadUnit || 'Load-Punkte') + ')';
  const datasets = [
    { label: 'CTL · langfristig', data: ctl, borderColor: '#6DA8F7', backgroundColor: '#6DA8F7', borderWidth: 2.2, tension: .22, pointRadius: 0, pointHitRadius: 8, spanGaps: false, yAxisID: 'y' },
    { label: 'ATL · kurzfristig', data: atl, borderColor: '#D98AB5', backgroundColor: '#D98AB5', borderWidth: 2, tension: .22, pointRadius: 0, pointHitRadius: 8, spanGaps: false, yAxisID: 'y' },
    { label: formLabel, data: form, borderColor: '#A78BFA', backgroundColor: '#A78BFA', borderWidth: 2.2, tension: .18, pointRadius: 0, pointHitRadius: 8, spanGaps: false, yAxisID: garminMode ? 'y1' : 'y' }
  ];
  formChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: dates.map(dateLabel), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: textColor, boxWidth: 12, usePointStyle: true, font: { size: 10 } } },
        tooltip: { callbacks: { title: items => items.length ? new Date(dates[items[0].dataIndex] + 'T12:00:00').toLocaleDateString('de-DE') : '' } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 9, maxRotation: 0 } },
        y: { position: 'left', grid: { color: 'rgba(148,163,184,.10)' }, ticks: { color: textColor }, title: { display: true, text: 'CTL / ATL · ' + (latest.loadUnit || 'Load-Punkte'), color: textColor, font: { size: 9 } } },
        ...(garminMode ? { y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: textColor }, title: { display: true, text: 'Form · %', color: textColor, font: { size: 9 } } } : {})
      }
    }
  });
  setText('analysis-overview-form-note',
    'Dargestellt wird ausschließlich der zuletzt verwendete Belastungsmodus (' + mode + '). CTL und ATL zeigen die langfristige bzw. kurzfristige Belastungsentwicklung. ' +
    (garminMode
      ? 'Der Garmin-Formwert ist relativ zu CTL und wird deshalb auf einer eigenen Prozentachse dargestellt; er ist nicht mit TSB gleichzusetzen.'
      : 'TSB entspricht CTL minus ATL und nutzt dieselbe Load-Einheit. ') +
    'Modelllücken bleiben sichtbar; Werte verschiedener Load-Quellen werden nicht in einer Linie vermischt.');
}
function renderHealthMarkers(dates) {
  const root = document.getElementById('analysis-overview-health-markers');
  if (!root) return;
  if (!healthMarkersVisible) { root.innerHTML = ''; root.style.display = 'none'; root.classList.add('hidden'); return; }
  const logs = state.healthLogs || {};
  const buttons = dates.map((date,index) => {
    const item = logs[date];
    if (!['sick','injured'].includes(item?.status)) return '';
    const illness = item.status === 'sick';
    const label = illness ? 'Erkrankung' : 'Verletzung';
    const color = illness ? '#eab308' : '#ef4444';
    return '<button type="button" data-health-date="'+date+'" aria-label="'+label+' am '+date+'" title="'+label+' · '+date+'" style="grid-column:'+(index+1)+';justify-self:center;width:18px;height:18px;border-radius:50%;font-size:9px;font-weight:800;color:'+(illness?'#0f172a':'#fff')+';background:'+color+';border:1px solid rgba(255,255,255,.45);cursor:pointer">'+(illness?'K':'V')+'</button>';
  }).filter(Boolean);
  root.classList.remove('hidden');
  root.style.display = 'grid';
  root.style.gridTemplateColumns = 'repeat('+dates.length+',minmax(0,1fr))';
  root.style.alignItems = 'center';
  root.style.minHeight = '24px';
  root.innerHTML = buttons.join('') || '<span style="grid-column:1/-1;text-align:center;font-size:10px;color:#64748b">Keine Ereignisse dokumentiert · Gesundheitsstatus nicht beurteilbar</span>';
  root.querySelectorAll('[data-health-date]').forEach(button => button.addEventListener('click', () => {
    const date = button.dataset.healthDate, item = logs[date] || {};
    const label = item.status === 'sick' ? 'Erkrankung' : 'Verletzung';
    const detail = document.getElementById('analysis-overview-health-event');
    if (!detail) return;
    detail.textContent = label+' · '+new Date(date+'T12:00:00').toLocaleDateString('de-DE')+' · '+(item.diagnosis || 'Keine weitere Beschreibung dokumentiert');
    detail.classList.remove('hidden');
  }));
}
function renderReadinessBreakdown(dates) {
  const root = document.getElementById('analysis-readiness-breakdown');
  if (!root) return;
  const checkins = state.dailyCheckins || {};
  const entry = [...dates].reverse().filter(date => date <= todayKey() && checkins[date])
    .map(date => ({ date, result: calculateReadiness(date, state) }))
    .find(item => item.result?.enoughData && valid(item.result.score));
  if (!entry) {
    root.innerHTML = '<p class="kajo-analysis-chart-note">Im gewählten Zeitraum liegt kein Readiness-Tageswert vor, der die Mindestanforderungen von mindestens zwei verfügbaren Bereichen erfüllt. Fehlende Bereiche werden nicht als Nullwerte gewertet.</p>';
    return;
  }
  const { date, result } = entry;
  const domainLabels = { physiology: 'Physiologie', sleep: 'Schlaf', subjective: 'Subjektives Befinden' };
  const domainCards = Object.entries(domainLabels).map(([key, label]) => {
    const score = result.domains?.[key];
    return '<div class="kajo-analysis-availability-row"><div><strong>' + label + '</strong><small>' +
      (score === null || score === undefined ? 'Keine ausreichenden Daten für diesen Bereich' : 'Bereichswert aus den verfügbaren Einzelindikatoren') +
      '</small></div><span>' + (valid(score) ? Math.round(Number(score)) + ' / 100' : '—') + '</span></div>';
  }).join('');
  const units = { hrv: 'ms', rhr: 'bpm', respiration: '/min', sleepDuration: 'h', sleepScore: '/100' };
  const renderItems = (items, kind) => items.length ? items.map(item => {
    const unit = units[item.key] || (kind === 'subjective' ? '/ 5' : '');
    const baseline = valid(item.baseline)
      ? ' · persönliche Baseline (Median): ' + fmt(item.baseline) + (unit ? ' ' + unit : '') +
        (valid(item.observations) ? ' aus ' + item.observations + ' Messungen' : '')
      : '';
    const score = valid(item.score) ? ' · Teilscore ' + Math.round(Number(item.score)) + ' / 100' : '';
    const value = valid(item.value) ? fmt(item.value) + (unit ? ' ' + unit : '') : '—';
    return '<div class="kajo-analysis-availability-row"><div><strong>' + escapeHtml(item.label) + '</strong><small>' +
      (kind === 'subjective' ? 'Subjektiver Check-in' : 'Messwert') + baseline + score +
      '</small></div><span>' + value + '</span></div>';
  }).join('') : '<p class="kajo-analysis-chart-note">Keine Werte in diesem Bereich in die Berechnung eingeflossen.</p>';
  root.innerHTML =
    '<div class="kajo-analysis-availability">' +
    '<div class="kajo-analysis-availability-row"><div><strong>Readiness</strong><small>' +
    escapeHtml(result.dataQuality || '') + ' · ' + escapeHtml(result.dataMode || '') +
    '</small></div><span><strong>' + Math.round(Number(result.score)) + ' / 100</strong></span></div>' +
    '<div class="kajo-analysis-chart-note" style="margin:10px 0 6px">Bereichswerte · ' + escapeHtml(new Date(date + 'T12:00:00').toLocaleDateString('de-DE')) + '</div>' +
    domainCards +
    '<div class="kajo-analysis-chart-note" style="margin:12px 0 6px">Einbezogene objektive Messwerte</div>' +
    renderItems(result.objective || [], 'objective') +
    '<div class="kajo-analysis-chart-note" style="margin:12px 0 6px">Einbezogene subjektive Angaben</div>' +
    renderItems(result.subjective || [], 'subjective') +
    '</div>' +
    '<p class="kajo-analysis-chart-note">Berechnung gemäß bestehendem Readiness-Modell: Physiologie 40 %, Schlaf 30 %, subjektives Befinden 30 %; nicht verfügbare Bereiche werden aus der Gewichtung herausgenommen und die übrigen Gewichte angepasst. Mindestens zwei Bereiche müssen verfügbar sein. Der Wert ist ein Orientierungsindex, keine medizinische Diagnose und keine automatische Trainingsfreigabe.</p>';
}
function renderHealthEventContext(dates) {
  const root = document.getElementById('analysis-health-event-context');
  if (!root) return;
  const timeline = new Map((state.dailyTimeline || []).map(day => [day.date, day]));
  const checkins = state.dailyCheckins || {};
  const events = Object.entries(state.healthLogs || {})
    .filter(([date, item]) => date >= dates[0] && date <= dates[dates.length - 1] && ['sick', 'injured'].includes(item?.status))
    .sort(([a], [b]) => b.localeCompare(a));
  if (!events.length) {
    root.innerHTML = '<p class="kajo-analysis-chart-note">Im gewählten Zeitraum sind keine Krankheits- oder Verletzungsereignisse dokumentiert. Daraus lässt sich kein unauffälliger Gesundheitsstatus ableiten.</p>';
    return;
  }
  const cards = events.slice(0, 8).map(([date, item]) => {
    const day = timeline.get(date);
    const checkin = checkins[date] || {};
    const hrv = checkin.garminHrv ?? (checkin.measurementSources?.hrv?.source === 'garmin' ? checkin.hrv : null);
    const readiness = date <= todayKey() && checkin ? calculateReadiness(date, state) : null;
    const label = item.status === 'sick' ? 'Erkrankung' : 'Verletzung';
    const load = day && valid(day.load)
      ? fmt(day.load) + ' ' + escapeHtml(day.loadUnit || 'Load-Punkte') + (day.loadMode ? ' · ' + escapeHtml(day.loadMode) : '')
      : 'Kein auswertbarer Tagesload';
    const recovery = valid(hrv) && Number(hrv) > 0 ? fmt(hrv) + ' ms Garmin-HRV' : 'Keine eindeutig zugeordnete Garmin-HRV';
    const readinessValue = readiness?.enoughData && valid(readiness.score)
      ? Math.round(Number(readiness.score)) + ' / 100'
      : 'Kein ausreichender Readiness-Wert';
    const detail = item.diagnosis ? ' · ' + escapeHtml(item.diagnosis) : '';
    return '<div class="kajo-analysis-availability-row"><div><strong>' +
      escapeHtml(label) + ' · ' + escapeHtml(new Date(date + 'T12:00:00').toLocaleDateString('de-DE')) +
      '</strong><small>Gleicher Kalendertag' + detail + '<br>Load: ' + load +
      '<br>Recovery: ' + recovery + '<br>Readiness: ' + readinessValue +
      '</small></div><span>' + (item.status === 'sick' ? 'K' : 'V') + '</span></div>';
  }).join('');
  root.innerHTML = '<div class="kajo-analysis-availability">' + cards + '</div>' +
    (events.length > 8 ? '<p class="kajo-analysis-chart-note">' + (events.length - 8) + ' weitere dokumentierte Ereignistage sind im Zeitraum vorhanden.</p>' : '') +
    '<p class="kajo-analysis-chart-note">Die Werte beschreiben ausschließlich Daten desselben Kalendertags. Sie zeigen zeitliche Koexistenz, keinen ursächlichen Zusammenhang. Load-Methoden und Einheiten bleiben entsprechend ihrer jeweiligen Datenquelle gekennzeichnet; fehlende Werte werden nicht ergänzt.</p>';
}

function averageRanks(values) {
  const sorted = values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value);
  const ranks=Array(values.length);
  for(let start=0;start<sorted.length;){let end=start+1;while(end<sorted.length&&sorted[end].value===sorted[start].value)end++;
    const rank=((start+1)+end)/2;for(let i=start;i<end;i++)ranks[sorted[i].index]=rank;start=end;}
  return ranks;
}
function spearmanCorrelation(pairs,key) {
  const rows=pairs.filter(pair=>valid(pair.load)&&valid(pair[key]));
  if(rows.length<10)return {n:rows.length,value:null,reason:'Für eine vorsichtige explorative Einordnung sind mindestens 10 vollständige Wertepaarungen erforderlich.'};
  const x=averageRanks(rows.map(pair=>Number(pair.load))),y=averageRanks(rows.map(pair=>Number(pair[key])));
  const mx=x.reduce((a,b)=>a+b,0)/x.length,my=y.reduce((a,b)=>a+b,0)/y.length;
  let numerator=0,sx=0,sy=0;
  for(let i=0;i<x.length;i++){const dx=x[i]-mx,dy=y[i]-my;numerator+=dx*dy;sx+=dx*dx;sy+=dy*dy;}
  const denominator=Math.sqrt(sx*sy);
  return denominator>0?{n:rows.length,value:numerator/denominator,reason:''}:{n:rows.length,value:null,reason:'Keine ausreichende Streuung für eine Rangkorrelation.'};
}
function renderLoadRecoveryAssociation(dates) {
  const root=document.getElementById('analysis-load-recovery-association');if(!root)return;
  const dateSet=new Set(dates),timeline=new Map((state.dailyTimeline||[]).map(day=>[day.date,day]));
  const checkins=state.dailyCheckins||{},pairs=[];
  for(const date of dates){
    const day=timeline.get(date);
    if(!day||!['complete','confirmed-rest'].includes(day.dataStatus)||!valid(day.load)||!day.loadMode||!day.loadUnit)continue;
    const next=new Date(date+'T12:00:00');next.setDate(next.getDate()+1);
    const nextDate=[next.getFullYear(),String(next.getMonth()+1).padStart(2,'0'),String(next.getDate()).padStart(2,'0')].join('-');
    if(!dateSet.has(nextDate)||nextDate>todayKey())continue;
    const item=checkins[nextDate]||{},rawHrv=item.garminHrv??(item.measurementSources?.hrv?.source==='garmin'?item.hrv:null);
    const readiness=item?calculateReadiness(nextDate,state):null;
    pairs.push({load:Number(day.load),mode:String(day.loadMode),unit:String(day.loadUnit),
      hrv:valid(rawHrv)&&Number(rawHrv)>0?Number(rawHrv):null,
      readiness:readiness?.enoughData&&valid(readiness.score)?Number(readiness.score):null});
  }
  if(!pairs.length){root.innerHTML='<p class="kajo-analysis-chart-note">Keine vollständigen Load-Folgetag-Paare mit eindeutigem Load-Modell und Einheit vorhanden. Eine statistische Auswertung wird nicht berechnet.</p>';return;}
  if(new Set(pairs.map(p=>p.mode+'|'+p.unit)).size!==1){root.innerHTML='<p class="kajo-analysis-chart-note">Im Zeitraum kommen mehrere Load-Modelle oder Einheiten vor. Diese Werte werden nicht vermischt; eine gemeinsame Rangkorrelation wird nicht berechnet.</p>';return;}
  const render=(label,result)=>'<div class="kajo-analysis-availability-row"><div><strong>'+label+'</strong><small>Spearman-Rangkorrelation · n = '+result.n+(result.reason?'<br>'+escapeHtml(result.reason):'')+'</small></div><span>'+(valid(result.value)?'rₛ = '+Number(result.value).toLocaleString('de-DE',{maximumFractionDigits:2}):'—')+'</span></div>';
  root.innerHTML='<div class="kajo-analysis-availability">'+render('Load an Tag D ↔ Garmin-HRV an D+1',spearmanCorrelation(pairs,'hrv'))+render('Load an Tag D ↔ Readiness an D+1',spearmanCorrelation(pairs,'readiness'))+'</div>'+
    '<p class="kajo-analysis-chart-note">Nur vollständige Folgetag-Paare desselben Load-Modells ('+escapeHtml(pairs[0].mode)+', '+escapeHtml(pairs[0].unit)+') werden verwendet. Spearman beschreibt einen monotonen Zusammenhang, nicht dessen Ursache. Es werden weder Signifikanz noch Trainingseffekt behauptet. Readiness enthält physiologische Messwerte einschließlich HRV; beide Ergebnisse sind daher nicht unabhängig voneinander.</p>';
}

function renderNextDayContext(dates) {
  const root = document.getElementById('analysis-next-day-context');
  if (!root) return;
  const timeline = new Map((state.dailyTimeline || []).map(day => [day.date, day]));
  const checkins = state.dailyCheckins || {};
  const dateSet = new Set(dates);
  const pairs = [];
  for (const date of dates) {
    const day = timeline.get(date);
    if (!day || !['complete', 'confirmed-rest'].includes(day.dataStatus) || !valid(day.load)) continue;
    const next = new Date(date + 'T12:00:00');
    next.setDate(next.getDate() + 1);
    const nextDate = [next.getFullYear(), String(next.getMonth() + 1).padStart(2, '0'), String(next.getDate()).padStart(2, '0')].join('-');
    if (!dateSet.has(nextDate) || nextDate > todayKey()) continue;
    const checkin = checkins[nextDate] || {};
    const hrv = checkin.garminHrv ?? (checkin.measurementSources?.hrv?.source === 'garmin' ? checkin.hrv : null);
    const readiness = checkins[nextDate] ? calculateReadiness(nextDate, state) : null;
    const hasHrv = valid(hrv) && Number(hrv) > 0;
    const hasReadiness = readiness?.enoughData && valid(readiness.score);
    pairs.push({
      date, nextDate, load: Number(day.load), unit: day.loadUnit || 'Load-Punkte',
      mode: day.loadMode || 'Belastungsmodell',
      hrv: hasHrv ? Number(hrv) : null,
      readiness: hasReadiness ? Number(readiness.score) : null
    });
  }
  const hrvPairs = pairs.filter(item => valid(item.hrv));
  const readinessPairs = pairs.filter(item => valid(item.readiness));
  if (!pairs.length) {
    root.innerHTML = '<p class="kajo-analysis-chart-note">Im gewählten Zeitraum gibt es keine auswertbaren Load-Tage mit einem Folgetag innerhalb desselben Zeitraums. Für diese Gegenüberstellung werden keine Werte ergänzt.</p>';
    return;
  }
  const rows = pairs.slice(-10).reverse().map(item =>
    '<div class="kajo-analysis-availability-row"><div><strong>Load · ' +
    escapeHtml(new Date(item.date + 'T12:00:00').toLocaleDateString('de-DE')) +
    ' → Folgetag · ' + escapeHtml(new Date(item.nextDate + 'T12:00:00').toLocaleDateString('de-DE')) +
    '</strong><small>' + fmt(item.load) + ' ' + escapeHtml(item.unit) + ' · ' + escapeHtml(item.mode) +
    '<br>Folgetag HRV: ' + (valid(item.hrv) ? fmt(item.hrv) + ' ms' : 'keine Garmin-HRV') +
    ' · Readiness: ' + (valid(item.readiness) ? Math.round(item.readiness) + ' / 100' : 'nicht ausreichend belegt') +
    '</small></div><span>+1 Tag</span></div>'
  ).join('');
  root.innerHTML =
    '<div class="kajo-analysis-availability">' + rows + '</div>' +
    '<p class="kajo-analysis-chart-note">Datenabdeckung im Zeitraum: ' + pairs.length + ' Load-Folgetag-Paare · davon ' +
    hrvPairs.length + ' mit Garmin-HRV und ' + readinessPairs.length + ' mit ausreichend belegter Readiness. Angezeigt werden die letzten ' +
    Math.min(10, pairs.length) + ' Paare. Es werden nur aufeinanderfolgende Kalendertage innerhalb des gewählten Zeitraums verglichen.</p>' +
    '<p class="kajo-analysis-chart-note">Dies ist eine zeitliche Gegenüberstellung (Load an Tag D, Recovery an Tag D+1), keine statistische Korrelation und kein Nachweis eines Trainingseffekts. Load-Modelle und Einheiten können sich unterscheiden und werden deshalb pro Tag ausgewiesen. Fehlende HRV- oder Readiness-Werte bleiben offen.</p>';
}
function renderDataAvailability(dates) {
  const root = document.getElementById('analysis-data-availability');
  const note = document.getElementById('analysis-data-availability-note');
  if (!root) return;
  const timeline = new Map((state.dailyTimeline || []).map(day => [day.date, day]));
  const checkins = state.dailyCheckins || {};
  const activities = getActivitiesInRange(dates);
  const loadDays = dates.filter(date => { const day = timeline.get(date); return day && valid(day.load); }).length;
  const hrvDays = dates.filter(date => {
    const item = checkins[date] || {};
    const value = item.garminHrv ?? (item.measurementSources?.hrv?.source === 'garmin' ? item.hrv : null);
    return valid(value) && Number(value) > 0;
  }).length;
  const vo2Days = dates.filter(date => valid(getGarminCheckinMetric(checkins[date], 'vo2max'))).length;
  const healthEntries = Object.entries(state.healthLogs || {}).filter(([date, item]) => date >= dates[0] && date <= dates[dates.length - 1] && ['sick', 'injured'].includes(item?.status));
  const rows = [
    ['Training Load', loadDays + ' / ' + dates.length + ' Tagen', loadDays ? 'Tageswerte vorhanden; unbekannte Tage bleiben offen' : 'Keine auswertbaren Tageswerte im Zeitraum'],
    ['Recovery · HRV', hrvDays + ' Messtagen', hrvDays ? 'Eindeutig als Garmin-HRV zugeordnete Werte' : 'Keine eindeutig zugeordneten Garmin-HRV-Werte'],
    ['Performance · VO₂max', vo2Days + ' Messtagen', vo2Days ? 'Garmin-Schätzwerte; keine direkte Leistungsdiagnostik' : 'Keine Garmin-VO₂max-Werte im Zeitraum'],
    ['Health', healthEntries.length + ' dokumentierte Ereignistage', healthEntries.length ? 'Erfasste Krankheits- oder Verletzungseinträge' : 'Keine Ereignisse dokumentiert; Gesundheitsstatus daraus nicht ableitbar'],
    ['Training', activities.length + ' Aktivitäten', activities.length ? 'Gespeicherte Aktivitäten nach Duplikatprüfung' : 'Keine gespeicherten Aktivitäten im Zeitraum']
  ];
  root.innerHTML = rows.map(([label, value, detail]) =>
    '<div class="kajo-analysis-availability-row"><div><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(detail) + '</small></div><span>' + escapeHtml(value) + '</span></div>'
  ).join('');
  if (note) note.textContent = 'Die Angaben beschreiben ausschließlich die im gewählten Zeitraum gespeicherten Daten. Sie sind keine Bewertung der Trainingsqualität oder des Gesundheitszustands. Nicht dokumentierte Werte werden nicht als Nullwerte, Ruhetage oder unauffällige Befunde interpretiert.';
}
function renderTrendChart() {
  const canvas = document.getElementById('analysis-overview-trend-chart');
  if (!canvas) return;
  if (typeof Chart !== 'function') { setChartEmptyState(canvas, 'Die Diagrammbibliothek konnte nicht geladen werden. Bitte lade KAJO erneut.', true); return; }
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
      pointRadius: context => valid(context.raw) ? 2.5 : 0,
      pointHoverRadius: 4,
      pointHitRadius: 7,
      spanGaps: false,
      fill: false,
      hidden: !selectedMetrics.has(item.key)
    };
  });
  const hasValues = datasets.some(dataset => dataset.data.some(valid) && !dataset.hidden);
  if (!hasValues) {
    setChartEmptyState(canvas, 'Für die ausgewählten Kennzahlen liegen im gewählten Zeitraum keine Messwerte vor.', true);
    renderHealthMarkers(dates);
    setText('analysis-overview-trend-note', 'Das Diagramm bleibt bewusst ohne künstliche Nullwerte. Wähle einen längeren Zeitraum oder eine andere Kennzahl, sofern dafür Daten vorliegen.');
    updateMetricSwitch();
    return;
  }
  setChartEmptyState(canvas, '', false);
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
  renderHealthMarkers(dates);
  const healthNote = 'Health zeigt ausschließlich dokumentierte Erkrankungen (K) und Verletzungen (V), keinen Score. Fehlende Einträge werden nicht als gesund interpretiert.';
  setText('analysis-overview-trend-note',
    'Jede Reihe wird im gewählten Zeitraum auf ihren ersten gültigen Messwert = 100 normiert. Die Linien zeigen relative Veränderungen innerhalb der jeweiligen Kennzahl; ihre Höhe ist nicht dimensionsübergreifend vergleichbar. Im Tooltip bleibt zusätzlich der Originalwert sichtbar. Readiness ist ein zusammengesetzter Orientierungswert aus verfügbaren Recovery-Domänen und enthält unter anderem physiologische Daten wie HRV; HRV und Readiness sind deshalb keine unabhängigen Messgrößen. Fehlende Readiness-Tage bedeuten, dass die Mindestdatenanforderungen nicht erfüllt waren. Garmin-VO₂max ist eine Schätzung; das Garmin-Aktivitätsprofil bestätigt nicht die tatsächlich ausgeübte Sportart und ist daher nicht automatisch paddelspezifisch. ' + healthNote);
  updateMetricSwitch();
}
export function setAnalysisOverviewMetric(metric) {
  if (!['load', 'recovery', 'performance', 'health'].includes(metric)) return;
  if (metric === 'health') {
    healthMarkersVisible = !healthMarkersVisible;
    renderHealthMarkers(rangeDates(currentRange()));
    updateMetricSwitch();
    return;
  }
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
  if (!canvas) return;
  if (typeof Chart !== 'function') { setChartEmptyState(canvas, 'Die Diagrammbibliothek konnte nicht geladen werden. Bitte lade KAJO erneut.', true); return; }
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
  if (!entries.length) {
    const legend = document.getElementById('analysis-overview-activity-legend');
    if (legend) legend.innerHTML = '';
    const message = !activities.length ? 'Keine Trainingsaktivitäten im gewählten Zeitraum dokumentiert.' : 'Aktivitäten sind vorhanden, aber für diese Darstellung fehlen vollständige Dauern. Wechsle zu „Einheiten“, um die dokumentierten Aktivitäten zu sehen.';
    setChartEmptyState(canvas, message, true);
    setText('analysis-overview-activity-note', message + ' Fehlende Werte werden nicht als 0 dargestellt.');
    updateActivitySwitch();
    return;
  }
  setChartEmptyState(canvas, '', false);
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
  renderDataAvailability(rangeDates(currentRange()));
  renderReadinessBreakdown(rangeDates(currentRange()));
  renderHealthEventContext(rangeDates(currentRange()));
  renderNextDayContext(rangeDates(currentRange()));
  renderLoadRecoveryAssociation(rangeDates(currentRange()));
  renderTrendChart();
  renderFormTrendChart();
  renderActivityChart();
  renderIntensityDistribution();
  renderPeriodSummary();
}
