/* ============================================================
 * dashboard.js – KPI-Karten, Belastungs-Zone, Analyse-Text, Tages-Inspektor
 * (Die Diagramme selbst liegen in charts.js.)
 * ============================================================ */

import { state } from './state.js';
import { formatDateDDMMYY, escapeHtml, formatKm, getSportsCatalog, getTypeColorMap } from './utils.js';
import { getActivityDisplayColor } from './home-activity-colors.js?v=1';
import { getTrainingLoadData } from './training-load.js';
import { loadCheckinInputs } from './health.js';
import { saveDataToLocalStorage, getUserLocalSetting } from './storage.js?v=5';
import { showChartPointReadout } from './chart-readout.js';
import { getGarminCheckinMetric } from './garmin-metric-access.js';
import { calculateReadiness, buildTrainingRecommendation } from './readiness.js?v=2';
import { readinessZone, classifyPersonalMetric, classifySleepDuration, classifyGarminSleepScore, classifySubjective, classifyTrainingBalance, classifyAcwr } from './metric-zones.js?v=3';
export { calculateReadiness } from './readiness.js';

function getHomeActivityDisplayMode() {
    if (state.calendarDisplayMode !== 'sport' && state.calendarDisplayMode !== 'training') {
        try {
            state.calendarDisplayMode = getUserLocalSetting('calendarDisplayMode') === 'training' ? 'training' : 'sport';
        } catch {
            state.calendarDisplayMode = 'sport';
        }
    }
    return state.calendarDisplayMode;
}

function localTodayKey() {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,v));}
const STATUS_COLORS = { good:'var(--kajo-status-good)', attention:'var(--kajo-status-attention)', critical:'var(--kajo-status-critical)', info:'var(--kajo-status-info)' };
function fiveLevelColor(score){const zone=readinessZone(score);return STATUS_COLORS[zone.status]||STATUS_COLORS.info;}
function median(values){const a=values.slice().sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function validNumber(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));}
export function renderReadinessDashboard(dateKey=localTodayKey(), updateDetails=true){
  const r=calculateReadiness(dateKey);
  const value=document.getElementById('kpi-readiness');
  const status=document.getElementById('kpi-readiness-status');
  const details=document.getElementById('readiness-details');
  if(!value||!status||(updateDetails&&!details))return;
  value.textContent=r.score===null?'—':r.score;
  status.textContent=r.score===null?'Noch nicht genügend Messdaten':r.dataQuality;
  const tile=(label,score,count,total,color)=>'<div class="bg-slate-950 rounded-xl p-3 border border-slate-800"><div class="text-[10px] text-slate-500 uppercase">'+label+'</div><div class="text-xl font-bold '+color+'">'+(score===null?'—':score+'/100')+'</div><div class="text-[10px] text-slate-500">'+count+'/'+total+(label==='Objektiv'?' Messgrößen':' Angaben')+'</div></div>';
  if(updateDetails) {
    const domainValue = value => value === null || value === undefined ? '—' : Math.round(value) + '/100';
    const domainLine = [
      ['Physiologie', r.domains?.physiology],
      ['Schlaf', r.domains?.sleep],
      ['Befinden', r.domains?.subjective]
    ].map(([label, score]) => '<span>'+label+': <strong>'+domainValue(score)+'</strong></span>').join(' · ');
    details.innerHTML='<div class="grid grid-cols-2 gap-3">'+
      tile('Objektiv',r.objectiveScore,r.objectiveCount,4,'text-sky-400')+
      tile('Subjektiv',r.subjectiveScore,r.subjectiveCount,6,'text-emerald-400')+
      '</div><p class="mt-2 text-[10px] text-slate-300">'+domainLine+'</p>'+
      '<p class="mt-1 text-[10px] text-slate-400">'+escapeHtml(r.dataMode)+' · '+escapeHtml(r.dataQuality)+
      ' · Trainingsbelastung wird separat beurteilt und nicht in den Readiness-Wert eingerechnet. Basisgewichtung: Physiologie 40 %, Schlaf 30 %, Befinden 30 %; fehlende Bereiche werden nicht ersetzt. Interner Orientierungsindex, keine validierte Trainingsfreigabe.</p>'+
      (r.baselineRequirements?.length ? '<p class="mt-1 text-[10px] text-amber-300">Noch nicht in der Wertung (persönliche Basis benötigt): '+r.baselineRequirements.map(item=>escapeHtml(item.label)+' '+item.observations+'/'+item.required).join(', ')+'.</p>' : '');
  }
}
export function updateZoneGaugeMarker(currentTSB, mode = 'tss') {
    const gaugeText = document.getElementById('zone-gauge-text');
    const marker = document.getElementById('zone-gauge-marker');
    const clamped = Math.min(Math.max(currentTSB, -50), 50);
    const pct = ((clamped + 50) / 100) * 100;
    if (marker) { marker.style.display = 'block'; marker.style.left = `${pct}%`; }
    let label = 'Ausgeglichen';
    if (currentTSB < -30) label = 'Stark ermüdet';
    else if (currentTSB < -10) label = 'Belastet';
    else if (currentTSB <= 5) label = 'Ausgeglichen';
    else if (currentTSB <= 25) label = 'Frisch';
    else label = 'Sehr frisch / Tapering';
    if (mode === 'garmin') {
        label = currentTSB < -25 ? 'Stark ermüdet' : currentTSB < -10 ? 'Belastet' : currentTSB <= 5 ? 'Ausgeglichen' : currentTSB <= 20 ? 'Frisch' : 'Tapering';
    }
    if (gaugeText) {
        gaugeText.textContent = mode === 'garmin' ? `Relativer Saldo ${currentTSB > 0 ? '+'+currentTSB : currentTSB}% (${label})` : `Belastungssaldo ${currentTSB > 0 ? '+'+currentTSB : currentTSB} (${label})`;
    }
}

function checkinValuesBetween(dateKey,key,days,includeCurrent=false){
  const endMs=new Date(dateKey+'T12:00:00').getTime();
  const startMs=endMs-days*86400000;
  const currentRecord=state.dailyCheckins?.[dateKey]||{};
  const hrvIdentity=record=>{
    const source=record?.measurementSources?.garminHrv||record?.measurementSources?.hrv;
    if(!source||typeof source!=='object')return record?.garminHrv!=null?'garmin:unspecified:ms':'legacy:unspecified:ms';
    return [String(source.source||'unknown').toLowerCase(),String(source.metric||'unspecified').toLowerCase(),String(source.unit||'ms').toLowerCase()].join(':');
  };
  return Object.entries(state.dailyCheckins||{})
    .filter(([date,record])=>{
      const ms=new Date(date+'T12:00:00').getTime();
      const inRange=Number.isFinite(ms)&&ms>=startMs&&(includeCurrent?date<=dateKey:date<dateKey);
      return inRange&&(key!=='hrv'||hrvIdentity(record)===hrvIdentity(currentRecord));
    })
    .map(([,record])=>key==='hrv'?(record.garminHrv??(record.measurementSources?.hrv?.source==='garmin'?record.hrv:null)):key==='rhr'?record.garminRhr:key==='sleepDuration'?record.garminSleepDuration:key==='sleepScore'?record.garminSleepScore:key==='respiration'?record.garminRespiration:record[key])
    .filter(validNumber).map(Number);
}
function mean(values){return values.reduce((sum,value)=>sum+value,0)/values.length;}
function standardDeviation(values,avg){
  return Math.sqrt(values.reduce((sum,value)=>sum+Math.pow(value-avg,2),0)/values.length);
}
function updateRespirationRange(dateKey) {
  const value = state.dailyCheckins?.[dateKey]?.garminRespiration ?? null;
  updateWearableRange('wear-respiration', 'wear-respiration-range', value, 'respiration', dateKey);
}
function updateWearableRange(valueId, rangeId, value, key, dateKey) {
  const valueEl = document.getElementById(valueId);
  const rangeEl = document.getElementById(rangeId);
  if (!valueEl || !rangeEl) return;
  const history = checkinValuesBetween(dateKey, key, 28, false);
  let zone;
  if (key === 'sleepScore') zone = classifyGarminSleepScore(value);
  else if (key === 'sleepDuration') zone = classifySleepDuration(value, history);
  else zone = classifyPersonalMetric(key, value, history);
  const colorClass = zone.status === 'good' ? 'text-emerald-400'
    : zone.status === 'attention' ? 'text-amber-400'
      : zone.status === 'critical' ? 'text-rose-400' : 'text-white';
  valueEl.classList.remove('text-emerald-400', 'text-amber-400', 'text-rose-400', 'text-white');
  valueEl.classList.add(colorClass);
  if (!validNumber(value)) {
    rangeEl.textContent = 'Keine Messung vorhanden';
  } else if (validNumber(zone.baseline)) {
    const unit = key === 'hrv' ? ' ms' : key === 'rhr' ? ' bpm' : key === 'respiration' ? ' /min' : ' h';
    const reference = key === 'sleepDuration'
      ? 'Persönlicher Median: ' + Number(zone.baseline).toFixed(1) + ' h'
      : 'Persönliche Basis: ' + Number(zone.baseline).toFixed(1) + unit;
    rangeEl.textContent = reference + ' · ' + zone.label;
  } else {
    rangeEl.textContent = zone.label + (zone.observations !== undefined ? ' · ' + zone.observations + '/12 Messungen' : '');
  }
}
export function renderDashboardNextRace(){
  const name=document.getElementById('dashboard-next-race-name');
  const date=document.getElementById('dashboard-next-race-date');
  const rank=document.getElementById('dashboard-next-race-rank');
  const daysEl=document.getElementById('home-next-race-days');
  const homeCard=document.getElementById('home-next-race-card');
  const homeLocation=document.getElementById('home-next-race-location');
  const homeSport=document.getElementById('home-next-race-sport');
  const homeName=document.getElementById('home-next-race-name');
  const homeDate=document.getElementById('home-next-race-date');
  const homeRank=document.getElementById('home-next-race-rank');
  const today=localTodayKey();
  const next=[...(Array.isArray(state.races)?state.races:[])].filter(r=>r?.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  if(!next){
    if(homeCard) homeCard.disabled = true;
    if(homeLocation) homeLocation.textContent = '';
    if(homeSport) homeSport.textContent = '';
    [name,homeName].filter(Boolean).forEach(el=>el.textContent='Kein Wettkampf geplant');
    [date,homeDate,daysEl].filter(Boolean).forEach(el=>el.textContent='');
    [rank,homeRank].filter(Boolean).forEach(el=>el.classList.add('hidden'));
    return;
  }
  if(homeCard) homeCard.disabled = false;
  if(homeLocation) homeLocation.textContent = next.location || '';
  if(homeSport) homeSport.textContent = next.sport || '';
  const rankMeta={A:['A · WM/EM','bg-rose-500 text-slate-950'],B:['B · World Cup','bg-amber-400 text-slate-950'],C:['C · PEU Cup','bg-sky-500 text-slate-950'],D:['D · DM / Quali','bg-emerald-400 text-slate-950'],E:['E · Sonstige','bg-slate-400 text-slate-950']};
  const badge=rankMeta[next.prio]||rankMeta.C;
  const days=Math.round((new Date(next.date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
  const countdown=days===0?'Heute':days===1?'Morgen':'in '+days+' Tagen';
  [name,homeName].filter(Boolean).forEach(el=>el.textContent=next.name||'Wettkampf');
  [date,homeDate].filter(Boolean).forEach(el=>el.textContent=formatDateDDMMYY(next.date));
  [daysEl].filter(Boolean).forEach(el=>el.textContent=countdown);
  [rank,homeRank].filter(Boolean).forEach(el=>{el.textContent=badge[0];el.className='text-[10px] font-bold px-2 py-0.5 rounded-md '+badge[1];});
}
function renderLoadPeriodSummary(timeline) {
    const root = document.getElementById('load-period-summary');
    if (!root) return;
    if (!Array.isArray(timeline) || timeline.length < 7) {
        root.innerHTML = '<p class="text-xs text-slate-500">Für eine vollständige 7-Tage-Auswertung werden mindestens sieben aufeinanderfolgende Tage mit Datenbasis benötigt.</p>';
        return;
    }
    const last = timeline.length - 1;
    const current7 = timeline.slice(last - 6, last + 1);
    const previous7 = timeline.length >= 14 ? timeline.slice(last - 13, last - 6) : null;
    const isCompleteDay = day => day.load != null
        && day.dataStatus !== 'unknown'
        && day.dataStatus !== 'incomplete-activity-load';
    if (!current7.every(isCompleteDay)) {
        root.innerHTML = '<p class="text-xs text-amber-300">Die 7-Tage-Belastung ist nicht vollständig auswertbar: Für mindestens einen Tag fehlt eine bestätigte Garmin-Aktivitätsabdeckung oder ein Load-Wert. Unbekannte Tage werden nicht als Ruhetage gewertet.</p>';
        return;
    }
    const sumLoad = days => days.reduce((sum, day) => sum + Math.max(0, Number(day.load) || 0), 0);
    const activeDays = current7.filter(day => Number(day.load) > 0).length;
    const currentLoad = sumLoad(current7);
    const activityCount = current7.reduce((sum, day) => sum + (Number(day.activityCount) || 0), 0);
    const loadActivityCount = current7.reduce((sum, day) => sum + (Number(day.loadActivityCount) || 0), 0);
    const loadCoverage = activityCount ? loadActivityCount + '/' + activityCount : '—';
    const unit = timeline[last].loadUnit || 'Belastungspunkte';
    const metric = (label, value, detail) => '<div class="bg-slate-950 rounded-xl border border-slate-800 p-3 min-w-0"><div class="text-[10px] text-slate-500 uppercase tracking-wide">' + label + '</div><div class="text-lg font-bold text-white mt-1 break-words">' + value + '</div><div class="text-[10px] text-slate-500 mt-1">' + detail + '</div></div>';
    let comparison = 'Vergleich ab 14 Tagen';
    let changeNote = 'Für eine Verlaufsbewertung werden zwei vollständige 7-Tage-Zeiträume benötigt.';
    if (previous7 && previous7.every(isCompleteDay)) {
        const previousLoad = sumLoad(previous7);
        if (previousLoad > 0) {
            const change = (currentLoad - previousLoad) / previousLoad * 100;
            comparison = (change > 0 ? '+' : '') + change.toFixed(0) + ' % vs. Vorwoche';
            changeNote = Math.abs(change) >= 20
                ? (change > 0 ? 'Markanter Anstieg' : 'Markanter Rückgang') + ' der registrierten Wochenbelastung. Das ist eine Verlaufsbeschreibung, keine Überlastungs- oder Verletzungsprognose.'
                : 'Wochenbelastung im Vergleich zur Vorwoche ohne markante Veränderung.';
        } else {
            comparison = 'Vorwoche ohne erfasste Belastung';
            changeNote = 'Ein prozentualer Vergleich ist nicht möglich, wenn in der Vorwoche keine Belastung erfasst wurde.';
        }
    }
    let average28 = 'Noch keine 28 Tage';
    let baselineContext = 'Ein längerfristiger Wochenvergleich ist ab 28 Tagen möglich.';
    if (timeline.length >= 28) {
        const recent28 = timeline.slice(last - 27, last + 1);
        if (recent28.every(isCompleteDay)) {
            const total28 = sumLoad(recent28);
            average28 = (total28 / 4).toFixed(1) + ' ' + unit + ' / Woche';
            const previous21 = recent28.slice(0, 21);
            const previous21Average = previous21.every(isCompleteDay) ? sumLoad(previous21) / 3 : 0;
            if (previous21Average > 0) {
            const deviation = (currentLoad - previous21Average) / previous21Average * 100;
            const context = deviation > 20 ? 'deutlich über' : deviation > 10 ? 'über' : deviation < -20 ? 'deutlich unter' : deviation < -10 ? 'unter' : 'im Bereich';
            baselineContext = 'Aktuelle Woche liegt ' + context + ' dem durchschnittlichen Wochenumfang der vorherigen 21 Tage (' + (deviation > 0 ? '+' : '') + deviation.toFixed(0) + ' %).';
            } else {
                baselineContext = 'In den vorherigen 21 Tagen wurde keine vollständige Belastung erfasst; ein Vergleich ist nicht möglich.';
            }
        } else {
            baselineContext = 'Der 28-Tage-Zeitraum enthält Datenlücken und wird nicht als vollständiger Wochenvergleich ausgewertet.';
        }
    }
    const modelDays = Math.min(timeline.length, 126);
    const modelText = modelDays >= 126 ? 'Modellbasis: 126 Tage erreicht' : 'Modellaufbau: ' + modelDays + '/126 Tage';
    root.innerHTML = '<div class="grid grid-cols-2 lg:grid-cols-5 gap-2">' +
        metric('Belastung · 7 Tage', currentLoad.toFixed(1), unit) +
        metric('Wochenvergleich', comparison, previous7 ? 'Gleiche Belastungseinheit' : 'Benötigt 14 Tage Daten') +
        metric('Trainingstage · 7 Tage', activeDays + '/7', 'Tage mit erfasster Belastung') +
        metric('Load-Abdeckung', loadCoverage, 'Aktivitäten mit berechenbarem Load') +
        metric('28-Tage-Schnitt', average28, 'Durchschnitt pro Woche') +
        '</div><p class="text-[10px] text-slate-400">' + changeNote + ' ' + baselineContext + '</p><p class="text-[10px] text-slate-500">' + modelText + '. CTL/ATL sind geglättete Belastungsmodelle und keine direkte Messung der Leistungsfähigkeit.</p>';
}

function renderLoadTrend(elementId, current, previous, metric) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) {
        el.textContent = 'Noch keine 7-Tage-Basis';
        el.className = 'text-[10px] text-slate-500 font-mono mt-1';
        return;
    }
    const delta = Number(current) - Number(previous);
    const sign = delta > 0 ? '+' : '';
    const direction = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    const formatted = sign + delta.toFixed(1);
    const tone = metric === 'ctl'
        ? (delta >= 0 ? 'text-emerald-400' : 'text-slate-400')
        : (delta > 0 ? 'text-amber-400' : delta < 0 ? 'text-emerald-400' : 'text-slate-400');
    el.textContent = direction + ' ' + formatted + ' vs. 7 Tage';
    el.className = 'text-[10px] ' + tone + ' font-mono mt-1';
}

export function renderSummaryKPICards(timeline) {
    if (!timeline || timeline.length === 0) {
        const root = document.getElementById('load-period-summary');
        if (root) {
            const today = localTodayKey();
            const start = new Date(); start.setDate(start.getDate() - 6);
            const startKey = start.getFullYear() + '-' + String(start.getMonth()+1).padStart(2,'0') + '-' + String(start.getDate()).padStart(2,'0');
            const recent = (Array.isArray(state.rawActivities) ? state.rawActivities : [])
                .filter(activity => activity?.date && activity.date >= startKey && activity.date <= today);
            const loadData = getTrainingLoadData(state.rawActivities, state.settings, state.profile);
            const loadActivities = new Set(loadData.records.map(item => item.activity));
            const covered = recent.filter(activity => loadActivities.has(activity)).length;
            root.innerHTML = recent.length
                ? '<div class="rounded-xl border border-slate-800 bg-slate-950 p-3"><div class="text-xs font-semibold text-white">Load-Abdeckung · letzte 7 Tage: ' + covered + '/' + recent.length + '</div><p class="text-[10px] text-slate-400 mt-1">Aktivitäten mit berechenbarem Belastungswert. Für diese Woche liegt noch keine auswertbare Load-Zeitreihe vor; CTL/ATL werden deshalb nicht berechnet.</p></div>'
                : '<p class="text-xs text-slate-500">Keine Aktivitäten der letzten sieben Tage vorhanden. Ohne berechenbare Belastungsdaten werden CTL/ATL nicht angezeigt.</p>';
        }
        ['kpi-ctl','kpi-atl','kpi-tsb','kpi-acwr'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
        ['kpi-ctl-trend','kpi-atl-trend'].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = 'Noch keine Belastungsdaten'; el.className = 'text-[10px] text-slate-500 font-mono mt-1'; } });
        const recommendation = document.getElementById('kpi-rec-short'); if (recommendation) recommendation.textContent = 'Noch keine Grundlage';
        const recommendationDetail = document.getElementById('kpi-rec-sub'); if (recommendationDetail) recommendationDetail.textContent = 'Belastungsdaten fehlen';
        renderReadinessDashboard(typeof selectedDashboardDate === 'string' ? selectedDashboardDate : localTodayKey());
        return;
    }
    const selectedKey = typeof selectedDashboardDate === 'string' ? selectedDashboardDate : localTodayKey();
    const eligible = timeline.filter(day => day.date <= selectedKey);
    if (!eligible.length) {
        ['kpi-ctl','kpi-atl','kpi-tsb','kpi-acwr'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
        const readiness = document.getElementById('kpi-readiness'); if (readiness) readiness.textContent = '—';
        const recommendation = document.getElementById('kpi-rec-short'); if (recommendation) recommendation.textContent = 'Noch keine Grundlage';
        const detail = document.getElementById('kpi-rec-sub'); if (detail) detail.textContent = 'Für diesen Tag liegen keine vorherigen Belastungsdaten vor.';
        renderReadinessDashboard(selectedKey);
        return;
    }
    const last = eligible[eligible.length - 1];
    if (last.load == null || last.ctl == null) {
        ['kpi-ctl','kpi-atl','kpi-tsb','kpi-acwr'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
        ['kpi-ctl-trend','kpi-atl-trend'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = 'Datenabdeckung unvollständig'; el.className = 'text-[10px] text-amber-300 font-mono mt-1'; }
        });
        const status = document.getElementById('kpi-tsb-status');
        if (status) status.textContent = 'Nicht berechenbar';
        const recommendation = document.getElementById('kpi-rec-short');
        if (recommendation) recommendation.textContent = 'Keine aktuelle Belastungsbasis';
        const detail = document.getElementById('kpi-rec-sub');
        if (detail) detail.textContent = 'Für diesen Tag fehlt eine vollständige Aktivitäts- oder Load-Abdeckung.';
        const marker = document.getElementById('zone-gauge-marker');
        if (marker) marker.style.display = 'none';
        const gauge = document.getElementById('zone-gauge-text');
        if (gauge) gauge.textContent = 'Belastungsmodell derzeit nicht berechenbar';
        renderLoadPeriodSummary(timeline);
        renderReadinessDashboard(selectedKey);
        return;
    }
    const sevenDaysAgo = eligible.length >= 8 ? eligible[eligible.length - 8] : null;
    renderLoadTrend('kpi-ctl-trend', last.ctl, sevenDaysAgo?.ctl, 'ctl');
    renderLoadTrend('kpi-atl-trend', last.atl, sevenDaysAgo?.atl, 'atl');
    renderLoadPeriodSummary(timeline);
    document.getElementById('kpi-ctl').textContent = last.ctl;
    document.getElementById('kpi-atl').textContent = last.atl;
    const isSrpe = last.loadMode === 'srpe';
    const isGarmin = last.loadMode?.startsWith('garmin');
    const formDisplay = isGarmin ? (last.formPct == null ? null : Number(last.formPct)) : Number(last.tsb);
    document.getElementById('kpi-tsb').textContent = formDisplay === null ? '—' : formDisplay > 0 ? `+${formDisplay}` : formDisplay;
    const tsbLabel = document.getElementById('kpi-tsb')?.previousElementSibling;
    if (tsbLabel) tsbLabel.textContent = isSrpe ? 'sRPE-Bilanz (AU · Tagesende)' : isGarmin ? (last.loadMode === 'garmin-native' ? 'Relativer Saldo · Garmin Load (Tagesende)' : 'Relativer Saldo · EA-HF-Zonenindex (Tagesende)') : 'Belastungssaldo · TSS (Tagesende)';
    document.getElementById('kpi-tsb-status').textContent = isSrpe ? 'Modellwert' : last.statusLabel;
    document.getElementById('kpi-acwr').textContent = last.acwr === null ? '—' : last.acwr;
    // CTL/ATL and form are load-model estimates, not a sufficient basis
    // for prescribing a specific session or training phase.
    const rec = isSrpe
        ? ['sRPE-Belastungsbilanz', 'App-interner Modellwert in AU · keine validierten Schwellen für Frische oder Ermüdung']
        : last.isProvisional
            ? ['Modell im Aufbau', 'Noch keine belastbare Verlaufseinordnung']
        : last.statusLabel === 'Hohe Ermüdung'
            ? ['Erhöhte modellierte Ermüdung', 'Belastungsverlauf prüfen · keine Trainingsvorgabe']
            : last.statusLabel === 'Belastung'
                ? ['Erhöhte kurzfristige Belastung', 'Einordnung aus CTL/ATL · keine Trainingsvorgabe']
                : last.statusLabel === 'Frisch' || last.statusLabel === 'Tapering'
                    ? ['Niedrige kurzfristige Belastung', 'Kein automatischer Schluss auf Wettkampfform']
                    : ['Ausgeglichener Modellstatus', 'Belastungsmodell · keine direkte Leistungsmessung'];
    document.getElementById('kpi-rec-short').textContent = rec[0];
    document.getElementById('kpi-rec-sub').textContent = rec[1];
    if (!isSrpe && (!isGarmin || last.formPct !== null)) {
        updateZoneGaugeMarker(isGarmin ? last.formPct : last.tsb, isGarmin ? 'garmin' : 'tss');
    } else if (isGarmin) {
        const gaugeText = document.getElementById('zone-gauge-text');
        const marker = document.getElementById('zone-gauge-marker');
        if (gaugeText) gaugeText.textContent = 'Keine relative Basis (CTL = 0)';
        if (marker) marker.style.display = 'none';
    }
    renderReadinessDashboard(selectedKey);
}

export function generateAutomatedNarrative(timeline) {
    if (!timeline || timeline.length === 0) return;
    const last = timeline[timeline.length - 1];
    if (last.load == null || last.ctl == null) {
        const root = document.getElementById('automated-narrative-text');
        if (root) root.innerHTML = '<p>Die aktuelle Trainingsbelastung ist nicht berechenbar, weil für den jüngsten Tag keine vollständige Aktivitäts- und Load-Abdeckung vorliegt.</p><p class="text-slate-400">Unbekannte Tage werden nicht als Ruhetage oder Belastung 0 interpretiert. Bitte synchronisiere den betroffenen Garmin-Zeitraum erneut.</p>';
        return;
    }
    const sourceText = last.loadMode === 'srpe' ? 'Session-RPE (Dauer × Gesamtanstrengung)' : last.loadMode === 'garmin-zone' ? 'Garmin-FIT-HF-Zeitreihen; Endurance AI Zonen-Load' : last.loadMode === 'garmin-native' ? 'Garmin-eigene Trainingsload-Werte' : last.loadMode === 'garmin-mixed' ? 'Garmin-FIT-Zonen-Load und native Garmin-Load-Werte (je Aktivität nur eine Quelle)' : 'externe TSS-Daten';
    const formText = last.loadMode === 'srpe' ? `sRPE-Bilanz: ${last.tsb} AU` : last.loadMode?.startsWith('garmin') ? `Relativer Saldo: ${last.formPct}%` : `Belastungssaldo: ${last.tsb}`;
    document.getElementById('automated-narrative-text').innerHTML = `
        <p>Belastungsquelle: <strong>${sourceText}</strong>. CTL: <strong>${last.ctl}</strong>, ATL: <strong>${last.atl}</strong> (${formText}, ACWR: <strong>${last.acwr}</strong>).</p>
        <p class="text-slate-400">ACWR: ${last.acwr === null ? 'noch nicht auswertbar' : last.acwr}. Der Wert dient nur als ergänzende Belastungsorientierung und ist keine Verletzungsprognose.</p>
        <p class="text-slate-400">${last.isProvisional ? 'Die ersten 126 Tage sind wegen des fehlenden historischen Ausgangswerts als vorläufige Anlaufphase zu interpretieren.' : 'CTL und ATL sind geglättete Belastungsmodelle, keine direkt gemessenen Fitness- oder Ermüdungswerte.'} ${last.loadMode?.startsWith('garmin') ? 'Die Garmin-Auswertung berücksichtigt nur Aktivitäten mit dem jeweils verfügbaren Garmin-Load; externe TSS-Werte werden nicht beigemischt.' : ''}</p>
    `;
}


function formatHomeDate(date) {
    return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function buildReadinessBasedRecommendation(dateKey, planned) {
    return buildTrainingRecommendation(dateKey, planned, state);
}

export function renderHomeDashboard(dateKey=localTodayKey()) {
    const selectedDate = dateKey || localTodayKey();
    const sportFocus = state.homeWeekSportFocus || null;
    const activities = Array.isArray(state.rawActivities) ? state.rawActivities : [];
    const planned = Array.isArray(state.plannedActivities) ? state.plannedActivities : [];
    const sportsCatalog = getSportsCatalog();
    const activityColorMode = getHomeActivityDisplayMode();
    const activityCategories = getTypeColorMap();
    const activityColor = item => getActivityDisplayColor(item, activityColorMode, sportsCatalog, activityCategories);
    const dayActivities = activities.filter(a => String(a?.date || '').slice(0, 10) === selectedDate && (!sportFocus || a.type === sportFocus))
        .sort((a,b)=>String(a.startTime||a.startTimeLocal||'').localeCompare(String(b.startTime||b.startTimeLocal||'')));
    const dayPlanned = planned.filter(p => String(p?.date || '').slice(0, 10) === selectedDate && (!sportFocus || p.type === sportFocus))
        .sort((a,b)=>String(a.time||a.startTime||'').localeCompare(String(b.time||b.startTime||'')));

    // Load-KPIs bleiben unabhängig. Wenn die Load-Zeitreihe lückenhaft ist,
    // erzeugt das Dashboard eine vorsichtige Tagesempfehlung aus Readiness,
    // Gesundheitsstatus und vorhandener Planung – ohne eine Einheit zu erfinden.
    const loadRecommendation = document.getElementById('kpi-rec-short')?.textContent?.trim();
    const loadDetail = document.getElementById('kpi-rec-sub')?.textContent?.trim();
    const fallbackRecommendation = buildReadinessBasedRecommendation(selectedDate, planned);
    const useReadinessFallback = Boolean(fallbackRecommendation) && (
        !loadRecommendation ||
        ['Noch keine Grundlage','Noch keine Empfehlung','Noch keine belastbare Empfehlung',
         'Keine aktuelle Belastungsbasis','Modell im Aufbau'].includes(loadRecommendation)
    );
    const recommendation = useReadinessFallback ? fallbackRecommendation.title : loadRecommendation;
    const detail = useReadinessFallback ? fallbackRecommendation.detail : loadDetail;
    let recommendationTitle = recommendation && !['Noch keine Grundlage','Noch keine Empfehlung'].includes(recommendation)
        ? recommendation : 'Noch keine belastbare Empfehlung';
    let recommendationDetail = detail && !detail.startsWith('Warte') && detail !== 'Belastungsdaten fehlen'
        ? detail : 'Es fehlen ausreichend aktuelle Trainings- oder Erholungsdaten für eine fundierte Einordnung.';
    const dailyNote = String(state.dailyCheckins?.[selectedDate]?.note || '').trim();
    if (dailyNote) {
        const notePreview = dailyNote.length > 180 ? dailyNote.slice(0, 177) + '…' : dailyNote;
        const noteContext = ' Tagesnotiz: „' + notePreview + '“.';
        const safetyKeywords = /druck.{0,24}(brust|lunge)|brust.{0,24}(schmerz|druck|enge)|atemnot|luftnot|kurzatmig|schwindel|ohnmacht|fieber|krank/i;
        const fatigueKeywords = /schlapp|m[uü]de|ersch[oö]pft|kraftlos|ausgelaugt/i;
        if (safetyKeywords.test(dailyNote)) {
            recommendationTitle = 'Gesundheitshinweis beachten';
            recommendationDetail = 'Deine Tagesnotiz enthält einen möglichen gesundheitlichen Warnhinweis. Die App kann Symptome nicht beurteilen. Bitte heute nicht allein auf Basis der Trainingsdaten trainieren; Brustdruck, Atemnot, Schwindel oder Ohnmacht sollten medizinisch abgeklärt werden. Bei starken oder akuten Beschwerden sofort medizinische Hilfe holen.' + noteContext;
        } else if (fatigueKeywords.test(dailyNote)) {
            recommendationTitle = 'Tagesform bewusst berücksichtigen';
            recommendationDetail = 'Deine Notiz beschreibt Müdigkeit oder Erschöpfung. Prüfe vor dem Training, ob Umfang und Intensität zu deinem aktuellen Befinden passen.' + noteContext;
        } else {
            recommendationDetail += noteContext;
        }
    }
    const recTitleEl = document.getElementById('home-training-recommendation');
    const recDetailEl = document.getElementById('home-training-recommendation-detail');
    const recommendationAvailable = Boolean(
        (recommendation && !['Noch keine Grundlage', 'Noch keine Empfehlung', 'Noch keine belastbare Empfehlung'].includes(recommendation))
        || dailyNote
    );
    const recommendationCard = recTitleEl?.closest('.kajo-home-recommendation');
    recommendationCard?.classList.toggle('hidden', !recommendationAvailable);
    if (recTitleEl) recTitleEl.textContent = recommendationTitle;
    if (recDetailEl) recDetailEl.textContent = recommendationDetail;
    const recContext = document.getElementById('home-training-recommendation-context');
    if (recContext) recContext.textContent = '';

    const plannedSection = document.getElementById('home-planned-section');
    const plannedList = document.getElementById('home-planned-list');
    if (plannedSection) plannedSection.classList.toggle('hidden', dayPlanned.length === 0);
    if (plannedList) plannedList.innerHTML = dayPlanned.map(p => {
        const sport = sportsCatalog[p.type]?.label || p.type || 'Training';
        const duration = validNumber(p.duration) ? Number(p.duration) + ' min' : 'Dauer offen';
        const target = validNumber(p.targetTss) ? ' · Ziel ' + Number(p.targetTss) + ' Load' : '';
        return '<button type="button" data-sport-type="' + escapeHtml(p.type || '') + '" onclick="switchTab(\'training-planning\')" class="home-session-card is-planned home-session-button"><span class="home-session-state">GEPLANT</span><div><strong>' + escapeHtml(p.name || 'Trainingseinheit') + '</strong><small>' + escapeHtml(sport) + ' · ' + duration + target + '</small></div><i data-lucide="calendar-check"></i></button>';
    }).join('');
    plannedList?.querySelectorAll('[data-sport-type]').forEach((el, index) => { el.style.borderLeft = '3px solid ' + activityColor(dayPlanned[index]); });

    const emptyDay = document.getElementById('home-training-empty');
    if (emptyDay) emptyDay.classList.toggle('hidden', dayActivities.length + dayPlanned.length > 0);

    const completedSection = document.getElementById('home-completed-section');
    const completedList = document.getElementById('home-completed-list');
    if (completedSection) completedSection.classList.toggle('hidden', dayActivities.length === 0);
    if (completedList) completedList.innerHTML = dayActivities.map(act => {
        const id = encodeURIComponent(String(act.id)).replace(/'/g,'%27');
        const duration = validNumber(act.duration) ? Number(act.duration) + ' min' : 'Dauer nicht erfasst';
        const sport = sportsCatalog[act.type]?.label || act.type || 'Training';
        const load = validNumber(act.tss) ? ' · ' + Number(act.tss).toFixed(0) + ' Load' : '';
        return '<button type="button" data-sport-type="' + escapeHtml(act.type || '') + '" onclick="openCSVDetailsModal(\'' + id + '\')" class="home-session-card is-complete home-session-button"><span class="home-session-state">ABSOLVIERT</span><div><strong>' + escapeHtml(act.name || 'Trainingseinheit') + '</strong><small>' + escapeHtml(sport) + ' · ' + duration + load + '</small></div><i data-lucide="chevron-right"></i></button>';
    }).join('');
    completedList?.querySelectorAll('[data-sport-type]').forEach((el, index) => { el.style.borderLeft = '3px solid ' + activityColor(dayActivities[index]); });

    const dayHeading = document.getElementById('home-daily-date-label');
    if (dayHeading) dayHeading.textContent = selectedDate === localTodayKey() ? 'HEUTE' : selectedDate < localTodayKey() ? 'RÜCKBLICK' : 'VORSCHAU';

    // Home zeigt bei fehlenden Tageswerten den letzten tatsächlich erfassten
    // Check-in bis einschließlich des ausgewählten Tages. Die Daten bleiben
    // datumsgebunden; es werden keine Werte aus der Zukunft übernommen.
    const garminMetricKeys = ['garminHrv','garminRhr','garminSleepScore','garminSleepDuration','garminRespiration','garminBodyBattery','garminStress','garminWeight','garminSpo2','garminSteps','garminFitnessAge'];
    const subjectiveMetricKeys = ['sleepQuality','soreness','fatigue','motivation','stress','weight'];
    const hasGarminMetrics = record => Boolean(record && typeof record === 'object' &&
        (garminMetricKeys.some(key => record[key] !== null && record[key] !== undefined && record[key] !== '') ||
         (record.measurementSources?.hrv?.source === 'garmin' && validNumber(record.hrv))));
    const hasHomeMetrics = record => hasGarminMetrics(record) || Boolean(record &&
        subjectiveMetricKeys.some(key => record[key] !== null && record[key] !== undefined && record[key] !== ''));
    const checkinEntries = Object.entries(state.dailyCheckins || {})
        .filter(([date, record]) => date <= selectedDate && hasHomeMetrics(record))
        .sort(([a], [b]) => b.localeCompare(a));
    const garminEntries = Object.entries(state.dailyCheckins || {})
        .filter(([date, record]) => date <= selectedDate && hasGarminMetrics(record))
        .sort(([a], [b]) => b.localeCompare(a));
    const exactCheckin = state.dailyCheckins[selectedDate];
    const exactGarminCheckin = hasGarminMetrics(exactCheckin) ? exactCheckin : null;
    const latestCheckin = checkinEntries[0] || null;
    const latestGarminCheckin = garminEntries[0] || null;
    const checkin = hasHomeMetrics(exactCheckin) ? exactCheckin : (latestCheckin?.[1] || {});
    const checkinDate = hasHomeMetrics(exactCheckin) ? selectedDate : (latestCheckin?.[0] || null);
    const garminCheckin = exactGarminCheckin || latestGarminCheckin?.[1] || {};
    const garminCheckinDate = exactGarminCheckin ? selectedDate : (latestGarminCheckin?.[0] || null);
    const dailyLabel = document.getElementById('home-daily-date-label');
    if (dailyLabel) {
        dailyLabel.textContent = garminCheckinDate && garminCheckinDate !== selectedDate
            ? 'LETZTE GARMIN-MESSUNG · ' + formatDateDDMMYY(garminCheckinDate)
            : checkinDate && checkinDate !== selectedDate
                ? 'LETZTER CHECK-IN · ' + formatDateDDMMYY(checkinDate) : '';
    }
    const sleepDuration = garminCheckin.garminSleepDuration;
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const setCircle = (id, value, stateName = 'neutral') => {
        const el = document.getElementById(id); if (!el) return;
        el.dataset.state = stateName; el.classList.toggle('has-value', value !== '—');
    };
    const format = (v, key) => validNumber(v) ? historyDisplay(Number(v), key) : '—';
    state.homeCheckinDate = checkinDate || selectedDate;
    const wearableState = (key, value) => {
        const color = historyRingColor(key, validNumber(value) ? Number(value) : null, garminCheckinDate || selectedDate);
        const states = {[STATUS_COLORS.good]:'good',[STATUS_COLORS.attention]:'mild',[STATUS_COLORS.critical]:'poor',[STATUS_COLORS.info]:'reference'};
        return states[color] || 'neutral';
    };
    const metric = (valueId, ringId, value, stateName = 'neutral') => {
        set(valueId, value);
        setCircle(ringId, value, stateName);
        const valueEl = document.getElementById(valueId);
        if (valueEl) {
            valueEl.dataset.state = stateName;
            valueEl.classList.add('kajo-wearable-value');
        }
    };
    metric('home-wear-rhr','home-wear-rhr-ring',format(garminCheckin.garminRhr,'rhr'),wearableState('rhr',garminCheckin.garminRhr));
    const statusRhr=document.getElementById('home-status-rhr-value');
    if(statusRhr)statusRhr.textContent=format(garminCheckin.garminRhr,'rhr');
    const statusRhrRing=document.getElementById('home-status-rhr-ring');
    if(statusRhrRing){statusRhrRing.style.setProperty('--ring-value','100%');statusRhrRing.style.setProperty('--ring-color','#FF7A7F');}
    const garminHrv = garminCheckin.garminHrv ?? (garminCheckin.measurementSources?.hrv?.source === 'garmin' ? garminCheckin.hrv : null);
    metric('home-wear-hrv','home-wear-hrv-ring',format(garminHrv,'hrv'),wearableState('hrv',garminHrv));
    const statusHrv=document.getElementById('home-status-hrv-value');
    if(statusHrv)statusHrv.textContent=format(garminHrv,'hrv');
    const statusHrvRing=document.getElementById('home-status-hrv-ring');
    if(statusHrvRing){statusHrvRing.style.setProperty('--ring-value','100%');statusHrvRing.style.setProperty('--ring-color','#E879F9');}
    metric('home-wear-score','home-wear-score-ring',format(garminCheckin.garminSleepScore,'sleepScore'),wearableState('sleepScore',garminCheckin.garminSleepScore));
    metric('home-wear-duration','home-wear-duration-ring',validNumber(sleepDuration) ? historyDisplay(Number(sleepDuration),'sleepDuration').replace('.',',') + ' h' : '—',wearableState('sleepDuration',sleepDuration));
    metric('home-wear-resp','home-wear-resp-ring',format(garminCheckin.garminRespiration,'respiration'),wearableState('respiration',garminCheckin.garminRespiration));
    const subjective = [
        ['sleepQuality','home-self-sleep','home-self-sleep-ring',false],
        ['soreness','home-self-soreness','home-self-soreness-ring',true],
        ['fatigue','home-self-fatigue','home-self-fatigue-ring',true],
        ['motivation','home-self-motivation','home-self-motivation-ring',false],
        ['stress','home-self-stress','home-self-stress-ring',true]
    ];
    subjective.forEach(([key,valueId,ringId]) => {
        const raw = historyValue(checkin, key);
        const valid = validNumber(raw) && Number(raw) >= 1 && Number(raw) <= 10;
        const colorHex = valid ? historyRingColor(key, Number(raw), checkinDate || selectedDate) : null;
        const color = ({[STATUS_COLORS.good]:'good',[STATUS_COLORS.attention]:'mild',[STATUS_COLORS.critical]:'poor'})[colorHex] || 'neutral';
        metric(valueId,ringId,valid ? historyDisplay(Number(raw), key) + ' / 10' : '—',color);
    });
    const wearableCount = [garminCheckin.garminRhr,garminHrv,garminCheckin.garminSleepScore,sleepDuration,garminCheckin.garminRespiration].filter(validNumber).length;
    const selfCount = subjective.filter(([key]) => validNumber(historyValue(checkin, key))).length;
    set('home-recovery-source',wearableCount + ' von 5 Wearable-Werten · ' + selfCount + ' von 5 Self-Monitoring-Angaben erfasst');
    state.homeReadinessDate = selectedDate;
    renderReadinessDashboard(selectedDate, false);
    const read = id => document.getElementById(id)?.textContent?.trim() || '—';
    const eligibleTimeline = (Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [])
        .filter(day => day?.date <= selectedDate)
        .sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')));
    // Fitness und Trainingssaldo können an unterschiedlichen Tagen zuletzt vorliegen.
    // Deshalb getrennte Stichtage verwenden, statt beide Werte an denselben Datensatz zu koppeln.
    const latestFitnessDay = [...eligibleTimeline].reverse().find(day => validNumber(day?.ctl)) || null;
    const latestLoadDay = [...eligibleTimeline].reverse().find(day => validNumber(day?.atl)) || null;
    state.homeLoadDate = latestLoadDay?.date || selectedDate;
    const ctl = latestFitnessDay ? String(latestFitnessDay.ctl) : read('kpi-ctl');
    const atl = latestLoadDay ? String(latestLoadDay.atl) : read('kpi-atl');
    const readiness = calculateReadiness(state.homeReadinessDate || selectedDate).score;
    const ctlNumber = validNumber(ctl) ? Number(ctl) : null;
    const loadNumber = validNumber(atl) ? Number(atl) : null;
    const readinessNumber = validNumber(readiness) ? Number(readiness) : null;
    set('home-fitness-value',ctlNumber === null ? '—' : historyDisplay(ctlNumber,'fitness'));
    set('home-form-value',loadNumber === null ? '—' : Math.round(loadNumber));
    set('home-readiness-value',readinessNumber === null ? '—' : historyDisplay(readinessNumber,'readiness'));
    const applyRingState = (id, ringState) => {
        const el = document.getElementById(id); if (!el) return;
        el.style.setProperty('--ring-value', ringState.progress + '%');
        el.style.setProperty('--ring-angle', (ringState.progress * 3.6) + 'deg');
        el.style.setProperty('--ring-color', ringState.color);
        el.classList.toggle('is-empty', ringState.empty);
    };
    const loadDate = latestFitnessDay?.date || selectedDate;
    // Dashboard und Detailansicht verwenden dieselbe Daten-, Fortschritts- und Farbzuordnung.
    const fitnessRingState = trainingRingState('fitness', ctlNumber, loadDate);
    applyRingState('home-fitness-ring', fitnessRingState);
    const fitnessTrend = fitnessRingState.value === null ? null : fitnessChange(loadDate, fitnessRingState.value);
    const fitnessChangeEl = document.getElementById('home-fitness-change');
    if (fitnessChangeEl) {
        fitnessChangeEl.textContent = fitnessTrend?.label || '→ —';
        fitnessChangeEl.style.color = fitnessRingState.color;
        fitnessChangeEl.title = fitnessTrend
            ? 'Vergleich zum letzten verfügbaren Vortag mit CTL-Wert'
            : 'Noch kein vorheriger CTL-Wert zum Vergleichen vorhanden';
    }
    applyRingState('home-readiness-ring', trainingRingState('readiness', readinessNumber, checkinDate || selectedDate));
    const tsbProgress=tsbNumber===null?0:Math.max(0,Math.min(100,((tsbNumber+30)/55)*100));\n    applyRingState('home-form-ring', { value: tsbNumber, progress: tsbProgress, color: '#FB923C', empty: tsbNumber === null });
    const formValueEl = document.getElementById('home-form-value');
    if (formValueEl) formValueEl.style.color = '#f8fafc';
    try { globalThis.lucide?.createIcons?.(); } catch (_) {}
}
export function renderHomeTrainingWeek() {
    const root = document.getElementById('home-week-days');
    const range = document.getElementById('home-week-range');
    const summary = document.getElementById('home-week-summary');
    const legend = document.getElementById('home-week-legend');
    if (!root) return;
    const today = new Date();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const dates = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday); date.setDate(monday.getDate() + index);
        return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
    });
    const dateLabel = date => date.slice(8,10) + '.' + date.slice(5,7) + '.';
    if (range) range.textContent = dateLabel(dates[0]) + ' – ' + dateLabel(dates[6]);
    const catalog = getSportsCatalog();
    const source = Array.isArray(state.rawActivities) ? state.rawActivities : [];
    const plannedSource = Array.isArray(state.plannedActivities)
        ? state.plannedActivities.filter(item => item && dates.includes(String(item.date || '').slice(0,10)))
        : [];
    const seen = new Set();
    const activities = source.filter(item => {
        if (!item || !dates.includes(String(item.date || '').slice(0,10))) return false;
        const stableId = item.garminActivityId || item.externalId || item.id;
        const key = stableId != null && stableId !== '' ? 'id:' + stableId : [
            item.date, item.type, item.startTime || item.startTimeLocal || '', item.name || '', item.duration ?? ''
        ].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const validDuration = item => item?.duration !== null && item?.duration !== undefined
        && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) >= 0;
    const minutes = item => validDuration(item) ? Number(item.duration) : null;
    const dayNames = ['Mo','Di','Mi','Do','Fr','Sa','So'];
    const colorFor = type => catalog[type]?.color || catalog.Other?.color || '#64748b';
    const labelFor = type => catalog[type]?.label || type || 'Weitere';
    const sportsUsed = [...new Set([
        ...activities.map(item => item.type || 'Other'),
        ...plannedSource.map(item => item.type || 'Other')
    ])];
    root.replaceChildren();
    dates.forEach((date,index) => {
        const dayItems = activities.filter(item => String(item.date || '').slice(0,10) === date);
        const dayPlanned = plannedSource.filter(item => String(item.date || '').slice(0,10) === date);
        const completedMinutes = dayItems.reduce((sum,item) => sum + (minutes(item) ?? 0),0);
        const plannedMinutesForDay = dayPlanned.reduce((sum,item) => sum + (minutes(item) ?? 0),0);
        const isCompleted = dayItems.length > 0;
        const isPlanned = !isCompleted && dayPlanned.length > 0;
        const sport = dayItems[0]?.type || dayPlanned[0]?.type || null;
        const dayButton = document.createElement('div');
        dayButton.className = 'kajo-week-day' + (date === localTodayKey() ? ' is-today' : '') + (isCompleted ? ' is-completed' : isPlanned ? ' is-planned' : ' is-unknown');
        dayButton.setAttribute('role','group');
        dayButton.setAttribute('aria-label', dayNames[index] + ', ' + date + ', ' + (isCompleted ? 'Training absolviert' : isPlanned ? 'Training geplant' : 'Keine Einheit dokumentiert'));
        const selectDay = () => window.selectDashboardDate?.(date, null);
        const totalLabel = document.createElement('span');
        totalLabel.className = 'kajo-week-day-total';
        totalLabel.textContent = isCompleted && completedMinutes > 0
            ? (completedMinutes/60).toLocaleString('de-DE',{maximumFractionDigits:1}) + ' h'
            : isPlanned && plannedMinutesForDay > 0
                ? (plannedMinutesForDay/60).toLocaleString('de-DE',{maximumFractionDigits:1}) + ' h'
                : '—';
        const track = document.createElement('button');
        track.type = 'button';
        track.className = 'kajo-week-bar-track' + (isCompleted ? ' is-completed' : isPlanned ? ' is-planned' : ' is-unknown');
        track.style.setProperty('--week-ring-color', sport ? colorFor(sport) : 'var(--kajo-border)');
        track.style.setProperty('--week-ring-progress', isCompleted ? '100%' : isPlanned ? '22%' : '0%');
        track.setAttribute('aria-label', dayNames[index] + ' öffnen');
        track.addEventListener('click', selectDay);
        const dayLabel = document.createElement('span');
        dayLabel.className = 'kajo-week-day-label';
        dayLabel.textContent = dayNames[index];
        dayButton.append(totalLabel,track,dayLabel);
        root.appendChild(dayButton);
    });
    if (legend) {
        legend.replaceChildren();
        sportsUsed.forEach(type => {
            const item = document.createElement('span'); item.className = 'kajo-week-legend-item';
            const dot = document.createElement('i'); dot.style.backgroundColor = colorFor(type);
            const label = document.createElement('span'); label.textContent = labelFor(type);
            item.append(dot,label); legend.appendChild(item);
        });
        legend.classList.toggle('hidden', sportsUsed.length === 0);
    }
    const totalMinutes = activities.reduce((sum,item) => sum + (minutes(item) ?? 0),0);
    const plannedMinutes = plannedSource.reduce((sum,item) => sum + (minutes(item) ?? 0),0);
    const progressRoot = document.getElementById('home-week-progress');
    const progressFill = document.getElementById('home-week-progress-fill');
    const progressLabel = document.getElementById('home-week-progress-label');
    if (progressRoot) {
        progressRoot.hidden = plannedMinutes <= 0;
        progressRoot.classList.toggle('hidden', plannedMinutes <= 0);
    }
    if (progressFill && plannedMinutes > 0) progressFill.style.width = Math.min(100,totalMinutes/plannedMinutes*100) + '%';
    if (progressLabel && plannedMinutes > 0) progressLabel.textContent =
        (totalMinutes/60).toLocaleString('de-DE',{maximumFractionDigits:1}) + ' von ' +
        (plannedMinutes/60).toLocaleString('de-DE',{maximumFractionDigits:1}) + ' geplanten Stunden';
    if (summary) {
        summary.textContent = activities.length
            ? 'Absolviert: ' + (totalMinutes/60).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + ' h'
            : 'Noch keine absolvierten Einheiten in dieser Woche';
    }
}
let selectedDashboardDate = localTodayKey();
let dashboardDateWasManuallyChanged = false;

let dailyNoteEditingDate = null;

export function openDailyNote(requestedDate = null) {
    const dateKey = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(requestedDate || '')) ? String(requestedDate) : (selectedDashboardDate || localTodayKey());
    dailyNoteEditingDate = dateKey;
    const modal = document.getElementById('daily-note-modal');
    const textarea = document.getElementById('daily-note-text');
    const dateLabel = document.getElementById('daily-note-date');
    const existingNote = String(state.dailyCheckins?.[dateKey]?.note || '');
    if (!modal || !textarea) {
        console.error('[KAJO] Tagesnotiz kann nicht geöffnet werden: Modal oder Texteingabe fehlt.', {
            modalFound: Boolean(modal),
            textareaFound: Boolean(textarea)
        });
        window.alert('Die Notiz konnte nicht geöffnet werden. Bitte lade die App neu.');
        return;
    }
    textarea.value = existingNote;
    if (dateLabel) {
        dateLabel.textContent = new Intl.DateTimeFormat('de-DE', {
            weekday: 'long', day: 'numeric', month: 'long'
        }).format(new Date(dateKey + 'T12:00:00'));
    }
    modal.classList.remove('hidden');
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kajo-modal-open');
    window.setTimeout(() => textarea.focus(), 30);
}

export function closeDailyNote() {
    const modal = document.getElementById('daily-note-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('kajo-modal-open');
    dailyNoteEditingDate = null;
}

export function saveDailyNote(event) {
    event?.preventDefault?.();
    const dateKey = dailyNoteEditingDate;
    const textarea = document.getElementById('daily-note-text');
    if (!dateKey || !textarea) return;
    const note = String(textarea.value || '').trim().slice(0, 1200);
    const current = state.dailyCheckins[dateKey] && typeof state.dailyCheckins[dateKey] === 'object'
        ? state.dailyCheckins[dateKey] : {};
    if (note) {
        state.dailyCheckins[dateKey] = { ...current, note, noteUpdatedAt: new Date().toISOString() };
    } else if (Object.prototype.hasOwnProperty.call(current, 'note')) {
        const updated = { ...current };
        delete updated.note;
        delete updated.noteUpdatedAt;
        state.dailyCheckins[dateKey] = updated;
    }
    if (!saveDataToLocalStorage()) {
        window.alert('Die Notiz konnte nicht gespeichert werden. Bitte prüfe, ob du angemeldet bist.');
        return;
    }
    closeDailyNote();
    renderSelectedDashboardDay();
}


export function renderSelectedDashboardDay() {
    const today = localTodayKey();
    if (!dashboardDateWasManuallyChanged) selectedDashboardDate = today;
    state.selectedDashboardDate = selectedDashboardDate;

    // Ein Fehler in Check-in-Formular oder Belastungs-KPIs darf die eigentliche
    // Home-Tagesansicht nicht mehr daran hindern, ihre verfügbaren Daten zu zeigen.
    try { loadCheckinInputs(); }
    catch (error) { console.error('[KAJO] Check-in-Formular konnte nicht geladen werden:', error); }
    try { renderSummaryKPICards(state.dailyTimeline); }
    catch (error) { console.error('[KAJO] Belastungs-KPIs konnten nicht gerendert werden:', error); }
    try { renderHomeDashboard(selectedDashboardDate); }
    catch (error) { console.error('[KAJO] Home-Tagesübersicht konnte nicht gerendert werden:', error); }

    const selectedDateLabel = document.getElementById("dashboard-selected-date");
    const selectedDate = new Date(selectedDashboardDate + 'T12:00:00');
    const formattedDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(selectedDate);
    if (selectedDateLabel) selectedDateLabel.textContent = formattedDate;
    const greeting = document.getElementById('kajo-home-greeting');
    const headDate = document.getElementById('kajo-home-head-date');
    if (greeting) {
        const hour = new Date().getHours();
        greeting.textContent = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
    }
    if (headDate) headDate.textContent = formattedDate;
    const savedCheckin = state.dailyCheckins?.[selectedDashboardDate] || {};
    const hasSavedCheckin = ['sleepQuality','fatigue','soreness','stress','motivation','weight','cycle'].some(key => savedCheckin[key] !== null && savedCheckin[key] !== undefined && savedCheckin[key] !== '');
    const homeNoteButton = document.getElementById('kajo-home-note-button');
    if (homeNoteButton) {
        homeNoteButton.hidden = !hasSavedCheckin;
        homeNoteButton.setAttribute('aria-hidden', String(!hasSavedCheckin));
    }
    const checkinStartButton = document.querySelector('.kajo-selfmonitoring-notebook');
    if (checkinStartButton) checkinStartButton.hidden = hasSavedCheckin;
    const noteButton = document.getElementById('dashboard-day-note');
    if (noteButton) {
        const hasNote = Boolean(String(state.dailyCheckins?.[selectedDashboardDate]?.note || '').trim());
        noteButton.classList.toggle('has-note', hasNote);
        noteButton.setAttribute('aria-label', hasNote ? 'Tagesnotiz lesen oder schreiben' : 'Tagesnotiz schreiben');
        noteButton.title = hasNote ? 'Tagesnotiz lesen oder schreiben' : 'Tagesnotiz schreiben';
    }
    const nextButton = document.getElementById('dashboard-day-next');
    if (nextButton) {
        nextButton.disabled = false;
        nextButton.classList.remove('opacity-40','cursor-not-allowed');
    }
    const todayButton = document.getElementById('dashboard-day-today');
    if (todayButton) {
        const isCurrentDay = selectedDashboardDate === today;
        todayButton.hidden = isCurrentDay;
        todayButton.style.display = isCurrentDay ? 'none' : '';
        todayButton.classList.toggle('hidden', isCurrentDay);
        todayButton.setAttribute('aria-hidden', String(isCurrentDay));
    }
    const context = document.getElementById('dashboard-day-context');
    if (context) context.textContent = selectedDashboardDate === today ? 'Heute' : selectedDashboardDate < today ? 'Rückblick' : 'Vorschau';
}

export function selectDashboardDate(dateKey, sportType = null) {
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(dateKey || ''))) return;
    selectedDashboardDate = dateKey;
    dashboardDateWasManuallyChanged = true;
    state.homeWeekSportFocus = sportType || null;
    renderSelectedDashboardDay();
    const label = document.getElementById('home-daily-date-label');
    if (label && sportType) label.textContent = 'SPORTFOKUS · ' + (getSportsCatalog()[sportType]?.label || sportType);
}

export function changeDashboardDay(offset) {
    state.homeWeekSportFocus = null;
    const today = localTodayKey();
    const base = selectedDashboardDate || today;
    const date = new Date(base + 'T12:00:00');
    date.setDate(date.getDate() + Number(offset));
    const next = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
    selectedDashboardDate = next;
    dashboardDateWasManuallyChanged = true;
    renderSelectedDashboardDay();
}

export function goToDashboardToday() {
    state.homeWeekSportFocus = null;
    selectedDashboardDate = localTodayKey();
    dashboardDateWasManuallyChanged = false;
    renderSelectedDashboardDay();
}

export function inspectDay(dayObj) {
    const formattedDate = formatDateDDMMYY(dayObj.date);
    document.getElementById('inspect-date-title').textContent = `Tagesübersicht: ${formattedDate}`;

    const health = state.healthLogs[dayObj.date];
    const badgeEl = document.getElementById('inspect-health-badge');
    if (health && (health.status === 'sick' || health.status === 'injured')) {
        badgeEl.textContent = health.diagnosis || 'Eingeschränkt';
        badgeEl.className = 'text-xs bg-rose-950 px-2.5 py-1 rounded-lg text-rose-300 border border-rose-800 font-semibold';
    } else {
        badgeEl.textContent = 'Erholungs-Status OK';
        badgeEl.className = 'text-xs bg-slate-950 px-2.5 py-1 rounded-lg text-emerald-400 border border-emerald-800 font-semibold';
    }

    const checkin = state.dailyCheckins[dayObj.date] || {};
    document.getElementById('inspect-sleep-val').textContent = `${checkin.sleepQuality ?? (Number(checkin.sleep) >= 1 && Number(checkin.sleep) < 5 ? checkin.sleep : '—')} / 10`;
    document.getElementById('inspect-soreness-val').textContent = `${checkin.soreness ?? '—'} / 10`;
    document.getElementById('inspect-fatigue-val').textContent = `${checkin.fatigue ?? '—'} / 10`;
    document.getElementById('inspect-motivation-val').textContent = `${checkin.motivation ?? '—'} / 10`;
    const stressInspect = document.getElementById('inspect-stress-val');
    if (stressInspect) stressInspect.textContent = `${checkin.stress ?? '—'} / 10`;
    document.getElementById('inspect-weight-val').textContent = checkin.weight ? `Gewicht: ${checkin.weight} kg` : 'Gewicht: nicht erfasst';

    const sleepDuration=checkin.garminSleepDuration;
    const sleepScore=validNumber(checkin.garminSleepScore)?Math.round(Number(checkin.garminSleepScore)):null;
    document.getElementById('wear-rhr').textContent=validNumber(checkin.garminRhr)?checkin.garminRhr:'—';
    document.getElementById('wear-sleep').textContent=validNumber(sleepDuration)?sleepDuration+' h':'—';
    const respirationEl=document.getElementById('wear-respiration'); if(respirationEl) respirationEl.textContent=validNumber(checkin.garminRespiration)?Number(checkin.garminRespiration).toFixed(1):'—';
    updateRespirationRange(dayObj.date);
    document.getElementById('wear-hrv').textContent=validNumber(checkin.garminHrv??(checkin.measurementSources?.hrv?.source==='garmin'?checkin.hrv:null))?(checkin.garminHrv??checkin.hrv):'—';
    const sleepScoreEl=document.getElementById('wear-sleep-score');
    if(sleepScoreEl)sleepScoreEl.textContent=sleepScore===null?'—':sleepScore;
    updateWearableRange('wear-rhr','wear-rhr-range',checkin.garminRhr,'rhr',dayObj.date,'lower');
    updateWearableRange('wear-hrv','wear-hrv-range',checkin.garminHrv??(checkin.measurementSources?.hrv?.source==='garmin'?checkin.hrv:null),'hrv',dayObj.date,'higher');
    updateWearableRange('wear-sleep-score','wear-sleep-score-range',sleepScore,'sleepScore',dayObj.date,'higher');
    updateWearableRange('wear-sleep','wear-sleep-range',sleepDuration,'sleepDuration',dayObj.date,'higher');
    const applySleepColor=(id,color)=>{const el=document.getElementById(id);if(!el)return;el.classList.remove('text-white','text-purple-400','text-sky-400','text-rose-400','text-amber-400','text-amber-300','text-emerald-400','text-cyan-300');el.classList.add(color);};
    applySleepColor('wear-sleep-score',sleepScore===null?'text-white':sleepScore<60?'text-rose-400':sleepScore<80?'text-amber-300':'text-emerald-400');
    const sleepZone=classifySleepDuration(sleepDuration,checkinValuesBetween(dayObj.date,'sleepDuration',28,false));
    const sleepColor={good:'text-emerald-400',attention:'text-amber-300',critical:'text-rose-400',info:'text-white'}[sleepZone.status]||'text-white';
    applySleepColor('wear-sleep',sleepColor);

    const dayActs = state.rawActivities.filter(a => String(a?.date || '').slice(0, 10) === dayObj.date);
    const loadDataForDay = getTrainingLoadData(state.rawActivities, state.settings, state.profile);
    const listEl = document.getElementById('inspect-activities-list');
    listEl.innerHTML = '';
    const activitiesSection=document.getElementById('inspect-activities-section');
    if(activitiesSection)activitiesSection.classList.toggle('hidden',dayActs.length===0);
    if (dayActs.length === 0) {
        listEl.innerHTML = '';
    } else {
        dayActs.forEach(act => {
            const activityLoad = loadDataForDay.records.find(item => item.activity === act)?.value;
            const activityLoadLabel = activityLoad == null ? 'Load —' : `${loadDataForDay.unit} ${Number(activityLoad).toFixed(1)}`;
            listEl.insertAdjacentHTML('beforeend', `
                <div onclick="openCSVDetailsModal('${encodeURIComponent(String(act.id)).replace(/'/g, '%27')}')" class="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-sky-500 transition">
                    <div>
                        <h5 class="font-bold text-white">${escapeHtml(act.name)}</h5>
                        <div class="text-[11px] text-slate-400 font-mono">${act.duration || '-'} Min | ${act.distance == null ? '—' : formatKm(act.distance)} km | Ø ${act.hr || '-'} bpm · Empfinden ${act.perceivedEffort ?? '—'}/10</div>
                    </div>
                    <div class="font-mono font-bold text-sky-400">${activityLoadLabel}</div>
                </div>
            `);
        });
    }

    const plannedActs = state.plannedActivities.filter(p => p.date === dayObj.date);
    const plannedListEl = document.getElementById('inspect-planned-activities-list');
    plannedListEl.innerHTML = '';
    const plannedSection=document.getElementById('inspect-planned-section');
    if(plannedSection)plannedSection.classList.toggle('hidden',plannedActs.length===0);
    const unitsSection=document.getElementById('inspect-units-section');
    if(unitsSection)unitsSection.classList.toggle('hidden',dayActs.length===0&&plannedActs.length===0);
    if (plannedActs.length === 0) {
        plannedListEl.innerHTML = '';
    } else {
        plannedActs.forEach(p => {
            plannedListEl.insertAdjacentHTML('beforeend', `
                <div class="bg-slate-950 p-3 rounded-xl border border-sky-900/50 flex items-center justify-between text-xs">
                    <div>
                        <span class="px-2 py-0.5 text-[9px] font-bold rounded bg-sky-950 text-sky-400 border border-sky-800">GEPLANT</span>
                        <h5 class="font-bold text-white mt-1">${escapeHtml(p.name)}</h5>
                        <div class="text-[11px] text-slate-400 font-mono">Dauer: ${p.duration} Min | ${escapeHtml(p.desc || '')}</div>
                    </div>
                    <div class="font-mono font-bold text-emerald-400">Ziel: ${p.targetTss} Load</div>
                </div>
            `);
        });
    }
}


// ------------------------------------------------------------
// Verlauf einzelner Gesundheits- und Trainingskennzahlen
// ------------------------------------------------------------
const historyMetricDefinitions = {
    rhr: { label: 'Ruheherzfrequenz', short: 'RHF', unit: 'bpm', group: 'wearable', icon: 'heart-pulse', color: '#fb7185' },
    bodyBattery: { label: 'Body Battery', short: 'Body Battery', unit: '', group: 'wearable', icon: 'battery-full', color: '#34d399' },
    vo2max: { label: 'VO₂max', short: 'VO₂max', unit: 'ml/kg/min', group: 'wearable', icon: 'activity', color: '#f97316' },
    hrv: { label: 'Herzfrequenzvariabilität', short: 'HRV', unit: 'ms', group: 'wearable', icon: 'activity', color: '#38bdf8' },
    sleepScore: { label: 'Sleep Score', short: 'Sleep Score', unit: '/ 100', group: 'wearable', icon: 'moon-star', color: '#a78bfa' },
    sleepDuration: { label: 'Schlafdauer', short: 'Schlafdauer', unit: 'h', group: 'wearable', icon: 'bed-double', color: '#818cf8' },
    respiration: { label: 'Atemfrequenz', short: 'Atemfrequenz', unit: '/min', group: 'wearable', icon: 'wind', color: '#2dd4bf' },
    sleepQuality: { label: 'Schlafqualität', short: 'Schlafqualität', unit: '/ 5', group: 'self', icon: 'bed', color: '#c084fc' },
    soreness: { label: 'Muskelkater', short: 'Muskelkater', unit: '/ 5', group: 'self', icon: 'biceps-flexed', color: '#fb7185' },
    fatigue: { label: 'Müdigkeit', short: 'Müdigkeit', unit: '/ 5', group: 'self', icon: 'battery-low', color: '#f59e0b' },
    motivation: { label: 'Motivation', short: 'Motivation', unit: '/ 5', group: 'self', icon: 'zap', color: '#34d399' },
    stress: { label: 'Stress', short: 'Stress', unit: '/ 5', group: 'self', icon: 'brain', color: '#38bdf8' },
    weight: { label: 'Körpergewicht', short: 'Gewicht', unit: 'kg', group: 'self', icon: 'scale', color: '#94a3b8' }
};
const trainingMetricDefinitions = {
    fitness: { label: 'Fitness', short: 'Fitness (CTL)', unit: 'Load-Punkte', color: '#D32F2F', icon: 'trending-up' },
    atl: { label: 'Akute Belastung (ATL)', short: 'ATL', unit: 'Load-Punkte', color: '#f97316', icon: 'activity' },
    acwr: { label: 'Akut-chronisches Belastungsverhältnis (ACWR)', short: 'ACWR', unit: 'Verhältnis', color: '#f59e0b', icon: 'scale' },
    tsb: { label: 'Trainingssaldo (TSB)', short: 'TSB', unit: 'Load-Punkte', color: '#38bdf8', icon: 'activity' },
    form: { label: 'Trainingssaldo', short: 'Trainingssaldo', unit: 'Modellwert', color: '#f59e0b', icon: 'activity' },
    readiness: { label: 'Readiness', short: 'Readiness', unit: '/ 100', color: '#34d399', icon: 'battery-full' }
};
let healthHistoryChart = null;
let trainingHistoryChart = null;

function historyTodayKey() { return state.metricHistoryDate || localTodayKey(); }
function historyDateKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function historyValue(checkin, key) {
    if (!checkin) return null;
    const garminKeys = {
        rhr: 'garminRhr', bodyBattery: 'garminBodyBattery',
        sleepScore: 'garminSleepScore', sleepDuration: 'garminSleepDuration',
        respiration: 'garminRespiration'
    };
    const raw = key === 'vo2max'
        ? getGarminCheckinMetric(checkin, 'vo2max')
        : key === 'hrv'
            ? (checkin.garminHrv ?? (checkin.measurementSources?.hrv?.source === 'garmin' ? checkin.hrv : null))
            : key === 'sleepQuality'
            ? (checkin.sleepQuality ?? (Number(checkin.sleep) >= 1 && Number(checkin.sleep) < 5 ? checkin.sleep : null))
            : garminKeys[key] ? checkin[garminKeys[key]] : checkin[key];
    if (!validNumber(raw)) return null;
    const value = Number(raw);
    return ['sleepQuality', 'soreness', 'fatigue', 'motivation', 'stress'].includes(key)
        ? (value >= 1 && value <= 5 ? value : null)
        : value;
}
function historyWindow(range, endKey = historyTodayKey()) {
    const end = endKey;
    const endDate = new Date(end + 'T12:00:00');
    const days = ({ '7d': 7, '28d': 28, '3m': 90, '6m': 180, '1y': 365 })[range] || 90;
    const start = new Date(endDate);
    start.setDate(start.getDate() - days + 1);
    return { from: historyDateKey(start), to: end };
}
function historyRangeDates(from, to) {
    const dates = [];
    const cursor = new Date(from + 'T12:00:00');
    const end = new Date(to + 'T12:00:00');
    if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(end.getTime()) || cursor > end) return dates;
    for (; cursor <= end; cursor.setDate(cursor.getDate() + 1)) dates.push(historyDateKey(cursor));
    return dates;
}
function historyRecommendation(key, value, dateKey) {
    if (value === null || value === undefined) return ['Heute nicht erfasst', 'Es liegt für heute kein gespeicherter Wert vor.'];
    if (key === 'fitness') return ['Modellierte Fitness', 'CTL beschreibt die längerfristige Trainingsbelastung und ist kein direkt gemessener Fitnesswert. Beobachte den Trend zusammen mit Erholung und Leistungsentwicklung.'];
    if (key === 'form') {
        const day = state.dailyTimeline.find(item => item.date === dateKey);
        const mode = String(day?.loadMode || '').startsWith('garmin') ? 'garmin' : 'tsb';
        const zone = classifyTrainingBalance(value, mode);
        return [zone.label, day?.isProvisional
            ? 'Der Belastungsverlauf befindet sich noch in der Anlaufphase. Den Modellwert vorsichtig interpretieren.'
            : 'Orientierungszonen: TSB unter −30 stark negativ, −30 bis −10 erhöhte modellierte Ermüdung, −10 bis +5 ausgeglichen, +5 bis +25 frisch, über +25 sehr frisch. Bei Garmin-Form gelten getrennte Prozentbereiche. Diese Modellzonen sind keine universellen physiologischen Grenzwerte.'];
    }
    if (key === 'readiness') {
        const zone = readinessZone(value);
        return [zone.label, 'KAJO-Orientierungsindex: 80–100 günstig, 65–79 im Orientierungsbereich, 45–64 vorsichtig beobachten, unter 45 deutlich eingeschränkt. Der Wert ersetzt weder das eigene Befinden noch eine medizinische Beurteilung.'];
    }
    if (['rhr', 'hrv', 'respiration'].includes(key)) {
        const zone = classifyPersonalMetric(key, value, checkinValuesBetween(dateKey, key, 28, false));
        const baseline = validNumber(zone.baseline) ? ' Persönliche Basis: ' + Number(zone.baseline).toFixed(1) + (key === 'hrv' ? ' ms.' : key === 'rhr' ? ' bpm.' : ' /min.') : ' Mindestens zwölf Messungen aus den vorherigen 28 Tagen sind für eine persönliche Basis erforderlich.';
        return [zone.label, 'Der Wert wird relativ zum persönlichen Median und zur individuellen Schwankung eingeordnet, nicht anhand pauschaler bpm- oder Millisekunden-Grenzen.' + baseline + ' Einzelwerte immer mit 7-Tage-Trend, Schlaf und Befinden betrachten.'];
    }
    if (key === 'sleepDuration') {
        const zone = classifySleepDuration(value, checkinValuesBetween(dateKey, key, 28, false));
        return [zone.label, validNumber(zone.baseline)
            ? 'Persönlicher Schlafmedian: ' + Number(zone.baseline).toFixed(1) + ' Stunden. Abweichungen von 30, 60 und 90 Minuten dienen als KAJO-Orientierung, nicht als allgemeingültige Schlafnorm.'
            : 'KAJO legt zunächst eine persönliche Schlafreferenz aus mindestens sieben Messungen innerhalb von 28 Tagen an. Der Schlafbedarf von Athleten ist individuell und kann mit der Trainingsbelastung variieren.'];
    }
    if (key === 'sleepScore') {
        const zone = classifyGarminSleepScore(value);
        return [zone.label, 'Garmin-Kategorien: 90–100 ausgezeichnet, 80–89 gut, 60–79 mittel und unter 60 niedrig. Das ist eine herstellerspezifische Score-Einteilung, keine eigenständige sportwissenschaftliche Trainingsfreigabe.'];
    }
    if (key === 'weight') return ['Gewichtsverlauf', 'Betrachte Gewicht über mehrere Messungen und im individuellen Kontext. Einzelne Tagesveränderungen sind für sich genommen keine Trainings- oder Gesundheitsbewertung.'];
    if (key === 'acwr') {
        const zone = classifyAcwr(value);
        return [zone.label, 'ACWR beschreibt das Verhältnis von akuter zu chronischer Belastung. Werte unter 0,8, 0,8–1,3, 1,3–1,5 und über 1,5 sind nur Orientierungsbereiche. Es gibt keine sichere Zone und keine eigenständige Verletzungsprognose.'];
    }
    if (['sleepQuality', 'soreness', 'fatigue', 'motivation', 'stress'].includes(key)) {
        const zone = classifySubjective(key, value);
        return [zone.label, 'Skala 1–5: 1–2 günstig, 3 mittel, 4–5 ungünstig. Bei Schlafqualität und Motivation bedeutet ein höherer Wert eine bessere Einschätzung; bei Müdigkeit, Muskelkater und Stress ist es umgekehrt.'];
    }
    return ['Wert im Kontext betrachten', 'Einzelne Messwerte sind nur zusammen mit Verlauf, Trainingsinhalt und subjektivem Befinden aussagekräftig.'];
}
function historyDisplay(value, key) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const decimals = ['fitness', 'atl', 'acwr', 'tsb', 'form', 'vo2max', 'sleepDuration', 'respiration', 'weight'].includes(key) ? 1 : 0;
    return Number(value).toLocaleString('de-DE', { maximumFractionDigits: decimals });
}
function relativeSrpEBalanceScore(value, dateKey) {
    const current = Number(value);
    if (!Number.isFinite(current) || !dateKey) return null;
    const end = new Date(dateKey + 'T12:00:00').getTime();
    if (!Number.isFinite(end)) return null;
    const startKey = new Date(end - 28 * 86400000).toISOString().slice(0, 10);
    const prior = (Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [])
        .filter(day => day?.loadMode === 'srpe' && day.date >= startKey && day.date < dateKey && validNumber(day.tsb))
        .map(day => Number(day.tsb));
    // Seven prior daily values are the minimum for a meaningful personal comparison.
    if (prior.length < 7) return null;
    const lower = prior.filter(v => v < current).length;
    const equal = prior.filter(v => v === current).length;
    return (lower + equal / 2) / prior.length * 100;
}
function fitnessChange(dateKey, value) {
    if (!validNumber(value) || !dateKey) return null;
    const timeline = (Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [])
        .filter(day => day?.date < dateKey && validNumber(day?.ctl))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const previous = timeline[0];
    if (!previous) return null;
    const delta = Number(value) - Number(previous.ctl);
    if (!Number.isFinite(delta)) return null;
    const color = delta >= 1 ? STATUS_COLORS.good
        : delta > 0.2 ? STATUS_COLORS.good
        : delta <= -1 ? STATUS_COLORS.critical
        : delta < -0.2 ? STATUS_COLORS.attention
        : STATUS_COLORS.info;
    const direction = delta > 0.2 ? '↑' : delta < -0.2 ? '↓' : '→';
    const formatted = (delta > 0 ? '+' : '') + delta.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const previousDate = new Date(previous.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    return { delta, color, label: direction + ' ' + formatted, previousDate };
}
function trainingRingState(key, value, dateKey) {
    const numeric = validNumber(value) ? Number(value) : null;
    if (numeric === null) return { value: null, progress: 0, color: STATUS_COLORS.info, empty: true };
    // Trainingssaldo ist ein Statusindikator: Der Ring bleibt vollständig sichtbar,
    // die Einordnung erfolgt über die Farbe statt über eine geklemmte Prozentfüllung.
    const progress = key === 'form'
        ? 100
        : Math.max(0, Math.min(100, numeric));
    return {
        value: numeric,
        progress,
        color: historyRingColor(key, numeric, dateKey),
        empty: false
    };
}
export function historyRingColor(key, value, dateKey) {
    if (value === null || value === undefined) return STATUS_COLORS.info;
    if (key === 'readiness') return STATUS_COLORS[readinessZone(value).status] || STATUS_COLORS.info;
    if (key === 'form') {
        const day = state.dailyTimeline.find(item => item.date === dateKey);
        if (!day) return STATUS_COLORS.info;
        const mode = String(day.loadMode || '').startsWith('garmin') ? 'garmin' : 'tsb';
        const zone = classifyTrainingBalance(value, mode);
        return STATUS_COLORS[zone.status] || STATUS_COLORS.info;
    }
    if (key === 'fitness') return fitnessChange(dateKey, value)?.color || STATUS_COLORS.info;
    if (key === 'acwr') return STATUS_COLORS[classifyAcwr(value).status] || STATUS_COLORS.info;
    if (key === 'weight') return STATUS_COLORS.info;
    if (['rhr', 'hrv', 'respiration'].includes(key)) {
        const prior = checkinValuesBetween(dateKey, key, 28, false);
        const zone = classifyPersonalMetric(key, value, prior);
        return STATUS_COLORS[zone.status] || STATUS_COLORS.info;
    }
    if (key === 'sleepDuration') {
        const zone = classifySleepDuration(value, checkinValuesBetween(dateKey, key, 28, false));
        return STATUS_COLORS[zone.status] || STATUS_COLORS.info;
    }
    if (key === 'sleepScore') return STATUS_COLORS[classifyGarminSleepScore(value).status] || STATUS_COLORS.info;
    if (['sleepQuality', 'soreness', 'fatigue', 'motivation', 'stress'].includes(key)) {
        return STATUS_COLORS[classifySubjective(key, value).status] || STATUS_COLORS.info;
    }
    return STATUS_COLORS.info;
}
function renderHistoryChart(kind, labels, values, definition, key, baselineValues = null) {
    const canvas = document.getElementById(kind === 'health' ? 'health-metric-chart' : 'training-metric-chart');
    if (!canvas || typeof Chart !== 'function') return;
    const prior = kind === 'health' ? healthHistoryChart : trainingHistoryChart;
    if (prior) prior.destroy();
    const datasets = [{
        label: definition.label, data: values, borderColor: definition.color,
        backgroundColor: definition.color + '20', fill: true, tension: .25,
        borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4,
        pointHitRadius: 8, spanGaps: false
    }];
    if (Array.isArray(baselineValues) && baselineValues.some(validNumber)) {
        datasets.push({
            label: 'Persönlicher Median (90 Tage)', data: baselineValues,
            borderColor: '#94a3b8', backgroundColor: 'transparent',
            borderDash: [5, 5], fill: false, tension: 0,
            borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0,
            pointHitRadius: 0, spanGaps: false
        });
    }
    const instance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onHover: (event, elements, chart) => {
                const active = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, true)
                    .filter(item => item.datasetIndex === 0);
                if (active.length) showChartPointReadout(canvas, chart, active[0].index, {
                    title: definition.label, unit: definition.unit,
                    formatValue: value => historyDisplay(value, key)
                });
            },
            onClick: (event, elements, chart) => {
                const active = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, true)
                    .filter(item => item.datasetIndex === 0);
                if (active.length) showChartPointReadout(canvas, chart, active[0].index, {
                    title: definition.label, unit: definition.unit,
                    formatValue: value => historyDisplay(value, key)
                });
            },
            plugins: {
                legend: { display: datasets.length > 1, labels: { color: '#94a3b8', usePointStyle: true, boxWidth: 7, boxHeight: 7 } },
                tooltip: { enabled: false }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 8, maxRotation: 0 } },
                y: { grid: { color: 'rgba(148,163,184,.12)' }, ticks: { color: '#94a3b8', maxTicksLimit: 5 } }
            }
        }
    });
    if (kind === 'health') healthHistoryChart = instance;
    else trainingHistoryChart = instance;
}
function renderHistoryRangeControls(kind) {
    const range = state.metricHistoryRange || '28d';
    document.querySelectorAll('[data-history-range]').forEach(button => {
        if (button.dataset.historyKind !== kind) return;
        const active = button.dataset.historyRange === range;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    const custom = document.getElementById(kind + '-history-custom-range');
    if (custom) custom.classList.toggle('hidden', range !== 'custom');
}
export function renderMetricHistory(kind) {
    const isHealth = kind === 'health';
    const key = isHealth ? (state.healthHistoryMetric || 'rhr') : (state.trainingHistoryMetric || 'fitness');
    const definition = (isHealth ? historyMetricDefinitions : trainingMetricDefinitions)[key];
    if (!definition) return;
    const range = state.metricHistoryRange || '28d';
    let window = historyWindow(range);
    if (range === 'custom') {
        const from = document.getElementById(kind + '-history-from')?.value;
        const to = document.getElementById(kind + '-history-to')?.value;
        if (from && to && from <= to) window = { from, to };
    }
    const dates = historyRangeDates(window.from, window.to);
    let values;
    let baselineValues = null;
    if (isHealth) {
        values = dates.map(date => historyValue(state.dailyCheckins[date], key));
        if (['hrv', 'rhr', 'sleepDuration'].includes(key)) {
            baselineValues = dates.map(date => {
                const dateMs = new Date(date + 'T12:00:00').getTime();
                const priorFrom = historyDateKey(new Date(dateMs - 90 * 86400000));
                const priorValues = Object.entries(state.dailyCheckins || {})
                    .filter(([entryDate]) => entryDate < date && entryDate >= priorFrom)
                    .map(([, entry]) => historyValue(entry, key))
                    .filter(value => value !== null);
                return priorValues.length >= 5 ? median(priorValues) : null;
            });
        }
    } else {
        const timeline = new Map((state.dailyTimeline || []).map(day => [day.date, day]));
        values = dates.map(date => {
            if (key === 'readiness') {
                const result = calculateReadiness(date);
                return result.score === null ? null : result.score;
            }
            const day = timeline.get(date);
            if (!day) return null;
            if (key === 'fitness') return day.ctl;
            if (key === 'atl') return day.atl;
            if (key === 'acwr') return day.acwr;
            if (key === 'tsb') return day.tsb;
            return day.loadMode?.startsWith('garmin') ? day.formPct : day.tsb;
        });
    }
    const today = historyTodayKey();
    const todayValue = dates.includes(today) ? values[dates.indexOf(today)] : null;
    const [headline, recommendation] = isHealth
        ? historyRecommendation(key, todayValue, today)
        : historyRecommendation(key, todayValue, today);
    const title = document.getElementById(kind + '-history-title');
    const unit = document.getElementById(kind + '-history-unit');
    const value = document.getElementById(kind + '-history-current');
    const ring = document.getElementById(kind + '-history-ring');
    const status = document.getElementById(kind + '-history-status');
    const note = document.getElementById(kind + '-history-recommendation');
    const chartNote = document.getElementById(kind + '-history-chart-note');
    if (title) title.textContent = definition.label;
    if (unit) {
        const todayTimeline = state.dailyTimeline.find(item => item.date === today);
        unit.textContent = key === 'form'
            ? (todayTimeline?.loadMode?.startsWith('garmin') ? 'Saldo · %' : 'Saldo · Load-Punkte')
            : definition.unit;
    }
    if (value) value.textContent = historyDisplay(todayValue, key);
    if (ring) {
        const ringState = trainingRingState(key, todayValue, today);
        ring.style.setProperty('--ring-value', ringState.progress + '%');
        ring.style.setProperty('--ring-angle', (ringState.progress * 3.6) + 'deg');
        ring.style.setProperty('--ring-color', ringState.color);
        ring.classList.toggle('is-empty', ringState.empty);
    }
    if (status) status.textContent = headline;
    if (note) note.textContent = recommendation;
    const baselineNote = document.getElementById(kind + '-history-baseline-note');
    if (baselineNote && isHealth && ['hrv', 'rhr', 'sleepDuration'].includes(key)) {
        const latestBaseline = baselineValues?.slice().reverse().find(validNumber);
        baselineNote.textContent = latestBaseline !== undefined
            ? 'Gestrichelte Linie: persönlicher Median der vorherigen 90 Tage (mindestens 5 gültige Vergleichswerte).'
            : 'Persönliche Baseline noch nicht verfügbar: Für mindestens 5 gültige Vergleichswerte innerhalb der vorherigen 90 Tage fehlen derzeit Daten.';
    } else if (baselineNote) {
        baselineNote.textContent = '';
    }
    if (chartNote) chartNote.textContent = dates.length + ' Kalendertage · fehlende Messungen werden als Lücken dargestellt.';
    const canvasLabels = dates.map(date => {
        const d = new Date(date + 'T12:00:00');
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    });
    renderHistoryChart(kind, canvasLabels, values, definition, key, baselineValues);
    renderHistoryRangeControls(kind);
    const tabsId = kind === 'health' ? 'health-metric-tabs' : 'training-metric-tabs';
    document.querySelectorAll('#' + tabsId + ' [data-history-metric]').forEach(button => {
        const active = button.dataset.historyMetric === key;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    try { globalThis.lucide?.createIcons?.(); } catch (_) {}
}
export function setHistoryMetric(kind, key) {
    if (kind === 'health' && historyMetricDefinitions[key]) state.healthHistoryMetric = key;
    if (kind === 'training' && trainingMetricDefinitions[key]) state.trainingHistoryMetric = key;
    renderMetricHistory(kind);
}
export function setHistoryRange(range) {
    state.metricHistoryRange = range;
    const activeKind = document.getElementById('view-health-data')?.classList.contains('hidden') ? 'training' : 'health';
    if (range === 'custom') {
        const from = document.getElementById(activeKind + '-history-from');
        const to = document.getElementById(activeKind + '-history-to');
        if (from && !from.value) from.value = historyWindow('3m').from;
        if (to && !to.value) to.value = historyTodayKey();
    }
    renderMetricHistory(activeKind);
}
export function applyHistoryCustomRange(kind) {
    const from = document.getElementById(kind + '-history-from')?.value;
    const to = document.getElementById(kind + '-history-to')?.value;
    if (!from || !to || from > to) {
        const note = document.getElementById(kind + '-history-chart-note');
        if (note) note.textContent = 'Bitte wähle einen gültigen Zeitraum (Von bis einschließlich Bis).';
        return;
    }
    state.metricHistoryRange = 'custom';
    renderMetricHistory(kind);
}
export function openHealthMetric(key) {
    state.healthHistoryMetric = historyMetricDefinitions[key] ? key : 'rhr';
    state.metricHistoryDate = state.homeCheckinDate || state.selectedDashboardDate || localTodayKey();
    state.metricHistoryRange = '28d';
    if (typeof window.switchTab === 'function') window.switchTab('health-data');
    else renderMetricHistory('health');
}
export function openTrainingMetric(key) {
    state.trainingHistoryMetric = trainingMetricDefinitions[key] ? key : 'fitness';
    state.metricHistoryDate = key === 'readiness'
        ? (state.homeReadinessDate || state.selectedDashboardDate || localTodayKey())
        : (state.homeLoadDate || state.selectedDashboardDate || localTodayKey());
    state.metricHistoryRange = '28d';
    if (typeof window.switchTab === 'function') window.switchTab('training-analysis');
    else renderMetricHistory('training');
}
