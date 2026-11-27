/* ============================================================
 * health-data.js – Gesundheitsdaten und persönliche Verläufe
 * Nutzt ausschließlich tatsächlich gespeicherte Tageswerte.
 * Keine fehlenden Werte werden ergänzt oder als 0 interpretiert.
 * ============================================================ */

import { state } from './state.js';
import { showChartPointReadout } from './chart-readout.js';
import { getGarminCheckinMetric, getGarminHrvMeasurementIdentity, getComparableGarminHrvValue } from './garmin-metric-access.js';

const METRICS = [
  { key:'hrv', label:'Herzfrequenzvariabilität', short:'HRV', unit:'ms', group:'Regeneration', icon:'activity', color:'#38bdf8', decimals:0 },
  { key:'rhr', label:'Ruheherzfrequenz', short:'Ruhepuls', unit:'bpm', group:'Herz-Kreislauf', icon:'heart-pulse', color:'#fb7185', decimals:0 },
  { key:'sleepScore', label:'Schlafscore', short:'Sleep Score', unit:'/ 100', group:'Schlaf', icon:'moon-star', color:'#a78bfa', decimals:0 },
  { key:'sleepDuration', label:'Schlafdauer', short:'Schlafdauer', unit:'h', group:'Schlaf', icon:'bed-double', color:'#818cf8', decimals:1 },
  { key:'respiration', label:'Atemfrequenz', short:'Atemfrequenz', unit:'/min', group:'Atmung', icon:'wind', color:'#2dd4bf', decimals:1 },
  { key:'bodyBattery', label:'Body Battery', short:'Body Battery', unit:'Punkte', group:'Regeneration', icon:'battery-full', color:'#34d399', decimals:0 },
  { key:'vo2max', label:'VO₂max', short:'VO₂max', unit:'ml/kg/min', group:'Leistungsfähigkeit', icon:'gauge', color:'#f97316', decimals:1 },
  { key:'spo2', label:'Sauerstoffsättigung', short:'SpO₂', unit:'%', group:'Atmung', icon:'droplets', color:'#60a5fa', decimals:1 },
  { key:'garminStress', label:'Stresslevel (Garmin)', short:'Stress', unit:'Punkte', group:'Belastung', icon:'brain', color:'#f59e0b', decimals:0 },
  { key:'steps', label:'Schritte', short:'Schritte', unit:'', group:'Aktivität', icon:'footprints', color:'#84cc16', decimals:0 },
  { key:'fitnessAge', label:'Fitnessalter', short:'Fitnessalter', unit:'Jahre', group:'Leistungsfähigkeit', icon:'calendar-clock', color:'#c084fc', decimals:1 },
  { key:'weight', label:'Körpergewicht', short:'Gewicht', unit:'kg', group:'Körperwerte', icon:'scale', color:'#94a3b8', decimals:1 }
];

let selectedMetric = null;
let selectedRange = '28d';
let healthChart = null;

function valid(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function dateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
}
function metricValue(row, key) {
  if (!row) return null;
  const garminKeys = {
    hrv: 'garminHrv', rhr: 'garminRhr', sleepScore: 'garminSleepScore',
    sleepDuration: 'garminSleepDuration', respiration: 'garminRespiration',
    bodyBattery: 'garminBodyBattery', spo2: 'garminSpo2',
    garminStress: 'garminStress', steps: 'garminSteps',
    fitnessAge: 'garminFitnessAge', weight: 'garminWeight'
  };
  const raw = key === 'vo2max'
    ? getGarminCheckinMetric(row, 'vo2max')
    : key === 'hrv'
      ? getComparableGarminHrvValue(row)
      : row[garminKeys[key] || key];
  return valid(raw) ? Number(raw) : null;
}
function median(values) {
  const sorted = values.filter(valid).map(Number).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}
export function getPersonalHealthBaseline(key, date, checkins = state.dailyCheckins) {
  const end = new Date(date + 'T12:00:00');
  if (!Number.isFinite(end.getTime())) return null;
  const start = new Date(end);
  start.setDate(start.getDate()-90);
  const from = dateKey(start);
  const currentIdentity = key === 'hrv' ? getGarminHrvMeasurementIdentity(checkins?.[date]) : null;
  const values = Object.entries(checkins || {})
    .filter(([day, row]) => day < date && day >= from
      && (key !== 'hrv' || getGarminHrvMeasurementIdentity(row) === currentIdentity))
    .map(([,row]) => metricValue(row,key))
    .filter(valid);
  return values.length >= 5 ? median(values) : null;
}
function personalBaseline(key, date) {
  return getPersonalHealthBaseline(key, date, state.dailyCheckins);
}
function rangeWindow() {
  const end = todayKey();
  if (selectedRange === 'custom') {
    const from = document.getElementById('kajo-health-from')?.value;
    const to = document.getElementById('kajo-health-to')?.value;
    if (from && to && from <= to) return { from, to };
  }
  const days = ({'7d':7,'28d':28,'3m':90,'6m':180,'1y':365})[selectedRange] || 28;
  const start = new Date(end + 'T12:00:00');
  start.setDate(start.getDate()-days+1);
  return { from:dateKey(start), to:end };
}
function dateRange(from,to) {
  const out=[];
  const cursor=new Date(from+'T12:00:00');
  const end=new Date(to+'T12:00:00');
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(end.getTime()) || cursor>end) return out;
  for(;cursor<=end;cursor.setDate(cursor.getDate()+1)) out.push(dateKey(cursor));
  return out;
}
function format(value, metric) {
  if (!valid(value)) return '—';
  return Number(value).toLocaleString('de-DE',{maximumFractionDigits:metric.decimals});
}
function signedPercent(value) {
  if (!valid(value)) return '—';
  const n=Number(value);
  return (n>0?'+':'') + n.toLocaleString('de-DE',{maximumFractionDigits:1}) + ' %';
}
function latestValue(key, until=todayKey()) {
  const rows=Object.entries(state.dailyCheckins || {})
    .filter(([day,row])=>day<=until && valid(metricValue(row,key)))
    .sort((a,b)=>b[0].localeCompare(a[0]));
  return rows.length ? {date:rows[0][0],value:metricValue(rows[0][1],key)} : null;
}
function metricCards() {
  const root=document.getElementById('kajo-health-metric-list');
  if (!root) return;
  const groups=new Map();
  METRICS.forEach(metric=>{
    const latest=latestValue(metric.key);
    if (!groups.has(metric.group)) groups.set(metric.group,[]);
    groups.get(metric.group).push({metric,latest});
  });
  root.innerHTML=[...groups.entries()].map(([group,items])=>{
    const cards=items.map(({metric,latest})=>{
      const baseline=latest ? personalBaseline(metric.key,latest.date) : null;
      const delta=baseline && baseline!==0 && latest ? (latest.value-baseline)/baseline*100 : null;
      const noData=!latest;
      const sourceHint=metric.key==='vo2max' ? (latest ? 'Garmin-Schätzung · ' : '') : (latest ? 'Garmin · ' : '');
      const status=noData?'Keine Werte vorhanden':sourceHint+(baseline===null?'Persönliche Baseline noch offen':signedPercent(delta)+' zum persönlichen Median');
      return `<button type="button" class="kajo-health-data-card ${noData?'is-empty':''}" onclick="openGarminHealthMetric('${metric.key}')" style="--health-metric-color:${metric.color}">
        <span class="kajo-health-data-icon"><i data-lucide="${metric.icon}"></i></span>
        <span class="kajo-health-data-copy"><strong>${metric.short}</strong><small>${metric.label}</small><em>${status}</em></span>
        <span class="kajo-health-data-value"><b>${latest?format(latest.value,metric):'—'}</b><small>${latest?metric.unit:'Keine Tageswerte in KAJO'}</small></span>
      </button>`;
    }).join('');
    return `<section class="kajo-health-data-group"><h2>${group}</h2><div class="kajo-health-data-grid">${cards}</div></section>`;
  }).join('');
  try { globalThis.lucide?.createIcons?.(); } catch (_) {}
}
function renderRangeControls() {
  document.querySelectorAll('[data-kajo-health-range]').forEach(button=>{
    const active=button.dataset.kajoHealthRange===selectedRange;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  document.getElementById('kajo-health-custom-range')?.classList.toggle('hidden',selectedRange!=='custom');
}
function renderDetail() {
  const metric=METRICS.find(item=>item.key===selectedMetric);
  if (!metric) return;
  const today=todayKey();
  ['kajo-health-from','kajo-health-to'].forEach(id=>{ const input=document.getElementById(id); if(input) input.max=today; });
  const window=rangeWindow();
  const dates=dateRange(window.from,window.to);
  const values=dates.map(day=>metricValue(state.dailyCheckins?.[day],metric.key));
  let latest=null;
  for(let i=dates.length-1;i>=0;i--) if(valid(values[i])) { latest={date:dates[i],value:values[i]};break; }
  const baseline=latest?personalBaseline(metric.key,latest.date):null;
  const delta=baseline!==null && baseline!==0 && latest ? (latest.value-baseline)/baseline*100 : null;
  document.getElementById('kajo-health-detail-title').textContent=metric.label;
  document.getElementById('kajo-health-detail-unit').textContent=metric.unit;
  document.getElementById('kajo-health-detail-current').textContent=latest?format(latest.value,metric):'—';
  document.getElementById('kajo-health-detail-date').textContent=latest?'Letzter Messwert · '+new Date(latest.date+'T12:00:00').toLocaleDateString('de-DE'):'Im gewählten Zeitraum keine Messung';
  document.getElementById('kajo-health-detail-baseline').textContent=baseline===null?'Persönlicher Normalbereich noch nicht verfügbar':'Persönlicher 90-Tage-Median: '+format(baseline,metric)+' '+metric.unit;
  document.getElementById('kajo-health-detail-delta').textContent=delta===null?'Noch keine normierte Abweichung berechenbar':signedPercent(delta)+' gegenüber deinem persönlichen Median';
  document.getElementById('kajo-health-detail-count').textContent=values.filter(valid).length+' Messwerte im Zeitraum';
  const isGarminEstimate=metric.key==='vo2max' && latest && getGarminCheckinMetric(state.dailyCheckins?.[latest.date], 'vo2max') !== null;
  document.getElementById('kajo-health-detail-note').textContent=(isGarminEstimate?'Garmin-VO₂max-Schätzung; kein direkt gemessener Diagnostikwert. Das Garmin-Aktivitätsprofil bestätigt nicht die tatsächlich ausgeübte Sportart. ':'')+'Die normierte Abweichung beschreibt den Abstand zum persönlichen Median. Sie ist keine medizinische Bewertung und keine allgemeine Leistungsnorm.';
  const labels=dates.map(day=>new Date(day+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'}));
  const baselineSeries=dates.map(day=>personalBaseline(metric.key,day));
  const canvas=document.getElementById('kajo-health-detail-chart');
  if (healthChart) { healthChart.destroy(); healthChart=null; }
  if (canvas && typeof Chart==='function') {
    const datasets=[{label:metric.label,data:values,borderColor:metric.color,backgroundColor:metric.color+'20',fill:true,tension:.25,borderWidth:2.5,pointRadius:0,pointHoverRadius:4,spanGaps:false}];
    if (baselineSeries.some(valid)) datasets.push({label:'Persönlicher Median (90 Tage)',data:baselineSeries,borderColor:'#94a3b8',backgroundColor:'transparent',borderDash:[5,5],fill:false,tension:0,borderWidth:1.5,pointRadius:0,spanGaps:false});
    healthChart=new Chart(canvas.getContext('2d'),{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},onHover:(event,elements,chart)=>{const active=chart.getElementsAtEventForMode(event,'index',{intersect:false},true).filter(item=>item.datasetIndex===0);if(active.length)showChartPointReadout(canvas,chart,active[0].index,{title:metric.label,unit:metric.unit,formatValue:value=>format(value,metric)});},onClick:(event,elements,chart)=>{const active=chart.getElementsAtEventForMode(event,'index',{intersect:false},true).filter(item=>item.datasetIndex===0);if(active.length)showChartPointReadout(canvas,chart,active[0].index,{title:metric.label,unit:metric.unit,formatValue:value=>format(value,metric)});},plugins:{legend:{display:datasets.length>1,labels:{color:'#94a3b8',usePointStyle:true,boxWidth:7,boxHeight:7}},tooltip:{enabled:false}},scales:{x:{grid:{display:false},ticks:{color:'#94a3b8',maxTicksLimit:8,maxRotation:0}},y:{grid:{color:'rgba(148,163,184,.12)'},ticks:{color:'#94a3b8',maxTicksLimit:5}}}}});
  }
  renderRangeControls();
}
export function renderGarminHealthData() {
  metricCards();
  const overview=document.getElementById('kajo-health-data-overview');
  const detail=document.getElementById('kajo-health-data-detail');
  if (overview) overview.classList.toggle('hidden',Boolean(selectedMetric));
  if (detail) detail.classList.toggle('hidden',!selectedMetric);
  if (selectedMetric) renderDetail();
}
export function openGarminHealthMetric(key) {
  if (!METRICS.some(item=>item.key===key)) return;
  selectedMetric=key;
  selectedRange='28d';
  renderGarminHealthData();
}
export function closeGarminHealthMetric() {
  selectedMetric=null;
  if (healthChart) { healthChart.destroy(); healthChart=null; }
  renderGarminHealthData();
}
export function setGarminHealthRange(range) {
  if (!['7d','28d','3m','6m','1y','custom'].includes(range)) return;
  selectedRange=range;
  if (range==='custom') {
    const window=rangeWindow();
    const from=document.getElementById('kajo-health-from');
    const to=document.getElementById('kajo-health-to');
    if (from && !from.value) from.value=window.from;
    if (to && !to.value) to.value=todayKey();
  }
  renderDetail();
}
export function applyGarminHealthCustomRange() {
  const from=document.getElementById('kajo-health-from')?.value;
  const to=document.getElementById('kajo-health-to')?.value;
  if (!from || !to || from>to || to>todayKey()) {
    const note=document.getElementById('kajo-health-detail-count');
    if (note) note.textContent='Bitte wähle einen gültigen Zeitraum bis einschließlich heute.';
    return;
  }
  selectedRange='custom';
  renderDetail();
}
