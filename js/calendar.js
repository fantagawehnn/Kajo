/* ============================================================
 * calendar.js – Kalender: Monats-, Wochen- und Listenansicht
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { getGarminTelemetry } from './data-source.js';
import { calculateReadiness } from './dashboard.js';
import { saveDataToLocalStorage, getUserLocalSetting, setUserLocalSetting } from './storage.js';
import { formatDateDDMMYY, sportsCatalog, typeColorMap, toLocalDateString, escapeHtml, formatKm, getSportsCatalog, getEnabledSportsCatalog, getTypeColorMap } from './utils.js';


function dayCycleInfo(dateStr) {
 const starts=Object.entries(state.dailyCheckins).filter(([,v])=>v.cycle?.period===true).map(([date])=>date).sort();
 const startDates=starts.filter(date=>{const p=new Date(date+'T12:00:00');p.setDate(p.getDate()-1);return !state.dailyCheckins[toLocalDateString(p)]?.cycle?.period;});
 const lastStart=startDates.filter(d=>d<=dateStr).at(-1);
 if(!lastStart)return {day:null,phase:'Nicht bestimmbar',label:'Noch kein Zyklusstart erfasst',recommendation:'Zyklusbeginn an einem Blutungstag eintragen. Bis ausreichend Daten vorliegen, keine Phasenprognose verwenden.'};
 const day=Math.round((new Date(dateStr+'T12:00:00')-new Date(lastStart+'T12:00:00'))/86400000)+1;
 const intervals=[];for(let i=1;i<startDates.length;i++){const n=Math.round((new Date(startDates[i]+'T12:00:00')-new Date(startDates[i-1]+'T12:00:00'))/86400000);if(n>=15&&n<=60)intervals.push(n);}
 const recentIntervals=intervals.slice(-3);const enough=intervals.length>=3&&startDates.length>=4&&recentIntervals.every(n=>n>=21&&n<=35)&&(Math.max(...recentIntervals)-Math.min(...recentIntervals)<=7);const cycleLength=enough?Math.round(recentIntervals.reduce((a,b)=>a+b,0)/3):null;
 const cy=state.dailyCheckins[dateStr]?.cycle||{},bleeding=cy.period===true;
 let phase='Phase noch nicht zuverlässig bestimmbar';
 if(enough&&cycleLength>=21&&cycleLength<=35){phase='Follikelphase (geschätzt)';if(bleeding)phase='Menstruation (erfasst)';else if(day>=cycleLength-16&&day<=cycleLength-12)phase='Ovulationsfenster (geschätzt)';else if(day>cycleLength-12)phase='Lutealphase (geschätzt)';}
 else if(intervals.length>=3)phase='Zyklus unregelmäßig · Phase nicht geschätzt';
 let recommendation='Training wie geplant, sofern Readiness und Tagesform passen. Die geschätzte Phase allein ist kein Grund zur Anpassung.';
 if(Number(cy.pain||0)>=5||Number(cy.trainingImpact||0)>=3)recommendation='Belastung individuell reduzieren: Intensität oder Umfang an Beschwerden anpassen, ggf. Technik oder lockere Einheit wählen. Bei starken oder wiederkehrenden Beschwerden medizinisch abklären.';
 else if(Number(cy.pain||0)>=3||Number(cy.trainingImpact||0)>0)recommendation='Belastung nach Tagesform steuern, RPE und Erholung beobachten. Bei Bedarf Umfang oder Intensität leicht anpassen.';
 return {day,phase,label:'Zyklustag '+day+' · '+phase,cycleDays:enough?'Mittelwert aus mindestens 3 Zyklen':'Mindestens 3 vollständige Zyklen für Phasenschätzung erforderlich',recommendation};
}
function sleepMetricMarkup(checkin) {
 const parts=[];
 const duration=checkin?.sleepDuration??(Number(checkin?.sleep)>5?Number(checkin.sleep):null);
 if(duration!=null){const h=Number(duration),color=h<7?'text-rose-400':h<=9?'text-emerald-400':'text-cyan-300';parts.push('<span class="'+color+'" title="Schlafdauer: '+escapeHtml(duration)+' Stunden">🌙 '+escapeHtml(duration)+' h</span>');}
 if(checkin?.sleepScore!=null){const score=Number(checkin.sleepScore),color=score<80?'text-rose-400':score<=90?'text-amber-300':'text-emerald-400';parts.push('<span class="'+color+'" title="Schlafscore: unter 80 rot, 80–90 gelb, über 90 grün">'+Math.round(score)+'</span>');}
 return parts.join(' ');
}
function periodCalendarMarker(dateStr) {
 const checkin=state.dailyCheckins[dateStr]||{};
 const today=toLocalDateString();
 if(checkin.cycle?.period===true){
  let start=new Date(dateStr+'T12:00:00'),day=1;
  while(true){const prev=new Date(start);prev.setDate(prev.getDate()-1);const key=toLocalDateString(prev);if(state.dailyCheckins[key]?.cycle?.period!==true)break;start=prev;day++;}
  return '<i data-lucide="droplet" title="Periode · Periodentag '+day+' (erfasst)" class="inline-block w-3 h-3 text-rose-400 ml-1 align-middle"></i>';
 }
 if(dateStr<=today||state.profile?.gender!=='female'||state.profile?.cycleTrackingEnabled!==true)return '';
 const periodDates=Object.entries(state.dailyCheckins).filter(([,v])=>v.cycle?.period===true).map(([date])=>date).sort();
 const starts=periodDates.filter(date=>{const prev=new Date(date+'T12:00:00');prev.setDate(prev.getDate()-1);return state.dailyCheckins[toLocalDateString(prev)]?.cycle?.period!==true;});
 const intervals=[];
 for(let i=1;i<starts.length;i++){const n=Math.round((new Date(starts[i]+'T12:00:00')-new Date(starts[i-1]+'T12:00:00'))/86400000);if(n>=15&&n<=60)intervals.push(n);}
 const recent=intervals.slice(-3);
 if(starts.length<4||recent.length<3||recent.some(n=>n<21||n>35)||Math.max(...recent)-Math.min(...recent)>7)return '';
 const cycleLength=Math.round(recent.reduce((sum,n)=>sum+n,0)/recent.length);
 const groups=[];let group=[];
 for(const date of periodDates){if(group.length&&Math.round((new Date(date+'T12:00:00')-new Date(group[group.length-1]+'T12:00:00'))/86400000)>1){groups.push(group);group=[];}group.push(date);}
 if(group.length)groups.push(group);
 const lengths=groups.map(g=>g.length).filter(n=>n>=2&&n<=10).sort((a,b)=>a-b);
 const periodLength=lengths.length?lengths[Math.floor(lengths.length/2)]:5;
 const lastStart=new Date(starts[starts.length-1]+'T12:00:00');
 let nextStart=new Date(lastStart);nextStart.setDate(nextStart.getDate()+cycleLength);
 const todayDate=new Date(today+'T12:00:00');
 if(nextStart<=todayDate)return ''; // Bei überfälliger oder ausgebliebener Periode keine weitere Prognose fortschreiben.
 const expectedDay=Math.round((new Date(dateStr+'T12:00:00')-nextStart)/86400000)+1;
 if(expectedDay<1||expectedDay>periodLength)return '';
 return '<i data-lucide="droplet" title="Voraussichtlicher Periodentag '+expectedDay+' (geschätzt)" class="inline-block w-3 h-3 text-rose-300 ml-1 align-middle opacity-70"></i>';
}
function dayActivitySummary(dateStr){
 const out=[];
 const ready=calculateReadiness(dateStr);
 const metrics=state.dailyTimeline.find(x=>x.date===dateStr);
 if(ready.score!==null){const tone=ready.score>=80?'text-green-300 bg-green-950/40':ready.score>=60?'text-yellow-300 bg-yellow-950/40':ready.score>=40?'text-orange-300 bg-orange-950/40':ready.score>=20?'text-red-300 bg-red-950/40':'text-purple-300 bg-purple-950/40';out.push('<div class="rounded-lg p-2 '+tone+'"><b>Readiness:</b> '+ready.score+'/100 · objektiv '+(ready.objectiveScore??'—')+' · subjektiv '+(ready.subjectiveScore??'—')+'</div>');}
 if(metrics)out.push('<div class="bg-sky-950/40 rounded-lg p-2 text-sky-300"><b>Belastungskennzahlen:</b> CTL '+metrics.ctl+' · ATL '+metrics.atl+' · TSB '+metrics.tsb+' · ACWR '+(metrics.acwr??'—')+'</div>');
 state.rawActivities.filter(x=>x.date===dateStr).forEach(a=>out.push('<div><b>Aktivität:</b> '+escapeHtml(a.name)+' · '+(a.duration??'—')+' min · '+(a.distance==null?'—':formatKm(a.distance))+' km · '+(a.hr??'—')+' bpm · '+(a.tss??'—')+' Load'+(a.perceivedEffort!=null?' · Empfinden '+a.perceivedEffort+'/10':'')+' · sRPE '+(a.sRpeLoad??'—')+'</div>'));
 state.plannedActivities.filter(x=>x.date===dateStr).forEach(a=>out.push('<div><b>Geplant:</b> '+escapeHtml(a.name)+' · '+(a.duration??'—')+' min · Ziel '+(a.targetTss??'—')+' Load</div>'));
 state.races.filter(x=>x.date===dateStr).forEach(a=>out.push('<div><b>Wettkampf:</b> '+escapeHtml(a.name)+' · Rang '+escapeHtml(a.prio||'—')+'</div>'));
 state.strengthLogs.filter(x=>x.date===dateStr).forEach(a=>out.push('<div><b>Kraft:</b> '+escapeHtml(a.exercise)+' · '+a.sets+' × '+a.reps+' · '+a.weight+' kg · RPE '+a.rpe+'</div>'));
 return out.length?out.join(''):'<span class="text-slate-500">Keine Aktivitäten oder Einheiten erfasst.</span>';
}
function dayNumber(value,min,max){if(value===''||value===null||value===undefined)return null;const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
export function openDayEditor(dateStr){
 const r=state.dailyCheckins[dateStr]||{},h=state.healthLogs[dateStr]||{};
 document.getElementById('day-edit-date').value=dateStr;
 document.getElementById('day-detail-title').textContent='Tagesdaten · '+formatDateDDMMYY(dateStr);
 document.getElementById('day-activities-list').innerHTML=dayActivitySummary(dateStr);
 document.getElementById('day-health-status').value=h.status||'healthy';
 document.getElementById('day-health-diagnosis').value=h.diagnosis||'';
 const subj=[['Schlafqualität','sleepQuality'],['Muskelkater','soreness'],['Müdigkeit','fatigue'],['Motivation','motivation'],['Stress','stress']];
 document.getElementById('day-subjective-fields').innerHTML=subj.map(([l,k])=>'<label class="text-xs text-slate-400">'+l+'<input id="day-'+k+'" type="number" min="1" max="5" value="'+(r[k]??'')+'" placeholder="—" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"></label>').join('');
 const wear=[['HRV (ms)','hrv',1,300],['RHF (bpm)','rhr',20,250],['Schlafdauer (h)','sleepDuration',0.1,24],['Schlafscore','sleepScore',0,100],['Atemfrequenz (Atemzüge/min)','respiration',4,60],['Körpergewicht (kg)','weight',20,300]];
 document.getElementById('day-wearable-fields').innerHTML=wear.map(([l,k,min,max])=>'<label class="text-xs text-slate-400">'+l+'<input id="day-'+k+'" type="number" min="'+min+'" max="'+max+'" step="'+((k==='sleepDuration'||k==='weight')?'0.1':'1')+'" value="'+(r[k]??'')+'" placeholder="—" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"></label>').join('');
 const enabled=state.profile?.gender==='female'&&state.profile?.cycleTrackingEnabled===true,cy=r.cycle||{};
 document.getElementById('day-cycle-section').classList.toggle('hidden',!enabled);
 document.getElementById('day-period').checked=cy.period===true;
 document.getElementById('day-cycle-bleeding').value=cy.bleeding||'';
 document.getElementById('day-cycle-pain').value=cy.pain??'';
 document.getElementById('day-cycle-impact').value=cy.trainingImpact??'';
 document.getElementById('day-cycle-notes').value=cy.notes||'';
 document.querySelectorAll('#day-cycle-symptoms input').forEach(el=>el.checked=(cy.symptoms||[]).includes(el.value));
 toggleDayCycleFields();
 const info=dayCycleInfo(dateStr),summary=document.getElementById('day-cycle-summary');
 summary.classList.toggle('hidden',!enabled);
 summary.innerHTML='<div class="text-xs font-bold text-rose-300">'+escapeHtml(info.label)+'</div><div class="text-[10px] text-slate-500 mt-1">'+escapeHtml(info.cycleDays||'')+'</div><p class="text-xs text-slate-300 mt-2">'+escapeHtml(info.recommendation)+'</p><p class="text-[10px] text-slate-500 mt-2">Kalenderbasierte Schätzung, keine hormonell bestätigte Phase. Empfehlung nach Beschwerden und Tagesform.</p>';
 document.getElementById('day-detail-modal').classList.remove('hidden');
}
export function toggleDayCycleFields(){const yes=document.getElementById('day-period')?.checked===true;document.getElementById('day-cycle-fields')?.classList.toggle('hidden',!yes);}
export function closeDayEditor(){document.getElementById('day-detail-modal')?.classList.add('hidden');}
export function saveDayEditor(){
 const date=document.getElementById('day-edit-date').value;if(!date)return;
 const r={...(state.dailyCheckins[date]||{})};
 const fields=[['sleepQuality',1,5],['soreness',1,5],['fatigue',1,5],['motivation',1,5],['stress',1,5],['hrv',1,300],['rhr',20,250],['sleepDuration',0.1,24],['sleepScore',0,100],['respiration',4,60],['weight',20,300]];
 for(const [k,min,max] of fields){const raw=document.getElementById('day-'+k)?.value??'';if(raw===''){delete r[k];continue;}const n=dayNumber(raw,min,max);if(n===null){alert('Bitte prüfe den Wert '+k+'.');return;}r[k]=n;}
 if(state.profile?.gender==='female'&&state.profile?.cycleTrackingEnabled===true){
  if(document.getElementById('day-period').checked){
   const pr=document.getElementById('day-cycle-pain').value,ir=document.getElementById('day-cycle-impact').value;
   const pain=pr===''?0:dayNumber(pr,0,10),impact=ir===''?0:dayNumber(ir,0,5);
   if(pain===null||impact===null){alert('Bitte prüfe Schmerzen und Trainingsbeeinträchtigung.');return;}
   r.cycle={...(r.cycle||{}),period:true,bleeding:document.getElementById('day-cycle-bleeding').value,pain,trainingImpact:impact,notes:document.getElementById('day-cycle-notes').value,symptoms:[...document.querySelectorAll('#day-cycle-symptoms input:checked')].map(el=>el.value)};
  }else if(r.cycle){delete r.cycle;}
 }
 state.dailyCheckins[date]=r;
 const status=document.getElementById('day-health-status').value,diagnosis=document.getElementById('day-health-diagnosis').value.trim();
 if(status==='healthy')delete state.healthLogs[date];else state.healthLogs[date]={status,diagnosis:diagnosis||(status==='sick'?'Erkrankung':'Verletzung')};
 saveDataToLocalStorage();closeDayEditor();refreshAll();
}

let selectedActivitySports = new Set();

function calendarSport(type) {
    const catalog = getSportsCatalog();
    return catalog[type] || catalog.Workout || { label: type || 'Training', color: '#64748b' };
}
function calendarEventIcons(date) {
    const health = state.healthLogs?.[date];
    const cycle = state.dailyCheckins?.[date]?.cycle?.period === true;
    const races = (state.races || []).filter(item => item.date === date);
    let html = '';
    if (races.length) html += '<i data-lucide="trophy" class="calendar-event-icon calendar-event-race" title="Wettkampf" aria-label="Wettkampf"></i>';
    if (cycle) html += '<i data-lucide="droplet" class="calendar-event-icon calendar-event-cycle" title="Menstruation (erfasst)" aria-label="Menstruation"></i>';
    if (health?.status === 'sick') html += '<i data-lucide="thermometer" class="calendar-event-icon calendar-event-sick" title="Krankheit" aria-label="Krankheit"></i>';
    if (health?.status === 'injured') html += '<i data-lucide="bandage" class="calendar-event-icon calendar-event-injured" title="Verletzung" aria-label="Verletzung"></i>';
    return html;
}
function calendarDateData(date) {
    const activities = (state.rawActivities || []).filter(item => item.date === date);
    const planned = (state.plannedActivities || []).filter(item => item.date === date);
    const races = (state.races || []).filter(item => item.date === date);
    const durationRecords = activities.filter(item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0);
    const durationComplete = activities.length > 0 && durationRecords.length === activities.length;
    const durationTotal = durationRecords.length ? durationRecords.reduce((sum, item) => sum + Number(item.duration), 0) : null;
    const timeline = (state.dailyTimeline || []).find(item => item.date === date);
    const loadComplete = Boolean(timeline && Number(timeline.activityCount) > 0 && Number(timeline.activityCount) === Number(timeline.loadActivityCount));
    const loadValue = loadComplete && Number.isFinite(Number(timeline.tss)) ? Number(timeline.tss) : null;
    return { activities, planned, races, durationRecords, durationComplete, durationTotal, timeline, loadComplete, loadValue };
}
function calendarLoadTone(timeline) {
    const label = timeline?.statusLabel || '';
    if (label === 'Hohe Ermüdung') return 'critical';
    if (label === 'Belastung') return 'attention';
    if (label === 'Frisch' || label === 'Tapering') return 'good';
    return 'info';
}
function calendarReadinessTone(score) {
    if (!Number.isFinite(Number(score))) return 'info';
    if (Number(score) >= 80) return 'good';
    if (Number(score) >= 60) return 'attention';
    if (Number(score) >= 20) return 'critical';
    return 'critical';
}
function calendarRing(value, label, unit, tone) {
    const display = value === null || value === undefined ? '—' : escapeHtml(value);
    const color = 'var(--kajo-status-' + (tone || 'info') + ')';
    return '<div class="calendar-kpi-ring-wrap"><div class="calendar-kpi-ring" style="--calendar-ring-color:' + color + '"><span>' + display + '</span></div><div class="calendar-kpi-label">' + escapeHtml(label) + (unit ? '<small>' + escapeHtml(unit) + '</small>' : '') + '</div></div>';
}
function calendarFormatMinutes(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const minutes = Math.round(Number(value));
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    return hours ? hours + ' h ' + String(rest).padStart(2, '0') + ' min' : minutes + ' min';
}
function calendarDateLabel(date) {
    const d = new Date(date + 'T12:00:00');
    return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
function calendarActivitySourceLabel(activity) {
    const refs = activity?.sourceRefs || {};
    const sources = new Set([
        ...(Array.isArray(activity?.sources) ? activity.sources : []),
        activity?.source,
        refs.garminActivityId != null ? 'garmin' : null,
        refs.intervalsActivityId != null ? 'intervals' : null
    ].filter(Boolean).map(value => String(value).toLowerCase()));
    const labels = [];
    if (sources.has('garmin') || activity?.garminData || activity?.garminFitImported) labels.push('Garmin');
    if (sources.has('intervals')) labels.push('Intervals.icu');
    if (sources.has('manual')) labels.push('Manuell');
    if (sources.has('csv') || sources.has('fit') || sources.has('file') || sources.has('import')) labels.push('Dateiimport');
    return labels.length ? [...new Set(labels)].join(' + ') : 'Quelle nicht ausgewiesen';
}
function calendarActivityRow(activity, planned) {
    const sport = calendarSport(activity.type);
    const color = sport.color || '#64748b';
    const id = encodeURIComponent(String(activity.id || '')).replace(/'/g, '%27');
    const timeRaw = activity.startTime || activity.startTimeLocal || activity.time || '';
    const timeMatch = String(timeRaw).match(/(?:T|\s)?(\d{1,2}:\d{2})/);
    const time = timeMatch ? timeMatch[1] : '';
    const duration = activity.duration !== null && activity.duration !== undefined && activity.duration !== '' && Number.isFinite(Number(activity.duration)) ? Math.round(Number(activity.duration)) + ' min' : '';
    const status = planned ? 'Geplant' : 'Abgeschlossen';
    const action = planned
        ? 'switchTab(\'training-planning\')'
        : 'openCSVDetailsModal(\'' + id + '\')';
    return '<button type="button" class="calendar-day-activity-row" style="--activity-color:' + color + '" onclick="' + action + '">' +
        '<span class="calendar-activity-accent"></span><span class="calendar-day-activity-main"><span class="calendar-day-activity-sport">' + escapeHtml(sport.label + (activity.raceFormat ? ' · ' + activity.raceFormat : '')) + '</span>' +
        '<strong>' + escapeHtml(activity.name || (planned ? 'Geplante Einheit' : 'Trainingseinheit')) + '</strong>' +
        '<small>' + [time, duration, planned ? 'Planung' : calendarActivitySourceLabel(activity)].filter(Boolean).map(escapeHtml).join(' · ') + '</small></span>' +
        '<span class="calendar-entry-status ' + (planned ? 'is-planned' : 'is-completed') + '">' + status + '</span></button>';
}
function calendarRaceRow(race) {
    const sport = calendarSport(race.sport);
    return '<button type="button" class="calendar-day-activity-row calendar-race-row" style="--activity-color:' + sport.color + '" onclick="switchTab(\'training-planning\')">' +
        '<span class="calendar-activity-accent"></span><span class="calendar-day-activity-main"><span class="calendar-day-activity-sport">' + escapeHtml(sport.label) + '</span><strong>' + escapeHtml(race.name || 'Wettkampf') + '</strong>' +
        '<small>' + escapeHtml(race.location || '') + '</small></span><span class="calendar-entry-status is-event">Wettkampf</span></button>';
}
function renderCalendarDayDetail(date, target) {
    const root = typeof target === 'string' ? document.getElementById(target) : target;
    if (!root) return;
    const data = calendarDateData(date);
    const readiness = calculateReadiness(date);
    const checkin = state.dailyCheckins?.[date] || {};
    const units = [];
    data.activities.forEach(item => units.push(calendarActivityRow(item, false)));
    data.planned.forEach(item => units.push(calendarActivityRow(item, true)));
    data.races.forEach(item => units.push(calendarRaceRow(item)));
    const trainingMarkup = units.length ? units.join('') : '<div class="calendar-empty-state">Keine Trainingseinheiten oder Wettkämpfe dokumentiert.</div>';
    const loadTone = data.loadValue === null ? 'info' : calendarLoadTone(data.timeline);
    const durationText = data.durationTotal === null ? '—' : (data.durationComplete ? '' : '∼') + calendarFormatMinutes(data.durationTotal);
    const durationCoverage = data.activities.length
        ? (data.durationRecords.length + '/' + data.activities.length + ' Einheiten mit Dauer')
        : 'Keine absolvierten Einheiten dokumentiert';
    const priorDates = [];
    for (let i = 1; i <= 7; i++) { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - i); priorDates.push(toLocalDateString(d)); }
    const priorActivities = (state.rawActivities || []).filter(item => priorDates.includes(item.date));
    const priorDurationRecords = priorActivities.filter(item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0);
    const priorByDate = {};
    priorActivities.forEach(item => { (priorByDate[item.date] ||= []).push(item); });
    const priorCompleteDays = Object.values(priorByDate).filter(items => items.length && items.every(item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0));
    const priorAverage = priorCompleteDays.length ? priorCompleteDays.reduce((sum, items) => sum + items.reduce((daySum, item) => daySum + Number(item.duration), 0), 0) / priorCompleteDays.length : null;
    const priorCoverage = priorCompleteDays.length + ' vollständig dokumentierte Trainingstage';
    const todayComparable = data.durationComplete ? data.durationTotal : null;
    const comparisonMax = Math.max(todayComparable || 0, priorAverage || 0, 1);
    const todayBar = todayComparable === null ? '' : '<div class="calendar-time-bar-row"><span>Ausgewählter Tag</span><span class="calendar-time-bar-track"><i style="width:' + (todayComparable / comparisonMax * 100) + '%"></i></span><b>' + calendarFormatMinutes(todayComparable) + '</b></div>';
    const priorBar = priorAverage === null ? '' : '<div class="calendar-time-bar-row"><span>Ø vorherige 7 Tage</span><span class="calendar-time-bar-track"><i style="width:' + (priorAverage / comparisonMax * 100) + '%"></i></span><b>' + calendarFormatMinutes(priorAverage) + '</b></div>';
    const recovery = [];
    recovery.push(calendarRing(readiness.score, 'Readiness', '/100', readiness.score === null ? 'info' : calendarReadinessTone(readiness.score)));
    if (checkin.sleepScore !== null && checkin.sleepScore !== undefined && checkin.sleepScore !== '') recovery.push(calendarRing(Math.round(Number(checkin.sleepScore)), 'Schlafscore', '/100', 'info'));
    if (checkin.hrv !== null && checkin.hrv !== undefined && checkin.hrv !== '') recovery.push(calendarRing(Number(checkin.hrv).toFixed(0), 'HRV', 'ms', 'info'));
    if (checkin.rhr !== null && checkin.rhr !== undefined && checkin.rhr !== '') recovery.push(calendarRing(Math.round(Number(checkin.rhr)), 'Ruhepuls', 'bpm', 'info'));
    const sleepDuration = checkin.sleepDuration ?? (Number(checkin.sleep) > 5 ? checkin.sleep : null);
    if (sleepDuration !== null && sleepDuration !== undefined) recovery.push(calendarRing(Number(sleepDuration).toFixed(1), 'Schlaf', 'h', 'info'));
    const bodyBattery = checkin.bodyBattery ?? checkin.bodyBatteryAtWake ?? checkin.bodyBatteryMorning;
    if (bodyBattery !== null && bodyBattery !== undefined && bodyBattery !== '') recovery.push(calendarRing(Math.round(Number(bodyBattery)), 'Body Battery', '/100', 'info'));
    if (checkin.stress !== null && checkin.stress !== undefined && checkin.stress !== '') recovery.push(calendarRing(Math.round(Number(checkin.stress)), 'Stress', '', 'info'));
    root.innerHTML = '<section class="calendar-detail-section"><div class="calendar-detail-heading"><h3>Trainingseinheiten</h3><span>' + (data.activities.length + data.planned.length + data.races.length) + '</span></div><div class="calendar-day-activity-list">' + trainingMarkup + '</div></section>' +
        '<section class="calendar-detail-section"><h3>Training Load & Trainingszeit</h3><div class="calendar-day-load-time">' +
        calendarRing(data.loadValue === null ? null : Number(data.loadValue).toFixed(0), 'Training Load', data.timeline?.loadUnit || '', loadTone) +
        '<div class="calendar-time-summary"><div class="calendar-time-primary"><span>Trainingszeit</span><strong>' + durationText + '</strong><small>' + escapeHtml(durationCoverage) + '</small></div>' +
        '<div class="calendar-time-comparison"><span>Trainingszeit-Vergleich</span><small>' + escapeHtml(durationCoverage) + '</small><div class="calendar-time-bars">' + (todayBar + priorBar || '<small>Für den Vergleich fehlen vollständige Dauerangaben.</small>') + '</div><small>' + escapeHtml(priorCoverage) + '</small></div></div></div></section>' +
        '<section class="calendar-detail-section"><h3>Recovery</h3><div class="calendar-recovery-rings">' + (recovery.length ? recovery.join('') : '<div class="calendar-empty-state">Keine Recovery-Daten für diesen Tag vorhanden.</div>') + '</div></section>' +
        '<div class="calendar-day-edit-row"><span>' + escapeHtml(calendarDateLabel(date)) + '</span><span class="calendar-day-events">' + calendarEventIcons(date) + '</span><button type="button" onclick="openDayEditor(\'' + date + '\')">Tagesdaten bearbeiten</button></div>';
}
export function openCalendarDay(date, keepMonth = false) {
    if (!date) return;
    state.currentCalendarDate = new Date(date + 'T12:00:00');
    state.selectedCalendarDay = date;
    if (keepMonth) {
        state.activeCalendarFormat = 'month';
        renderCalendar();
    } else {
        setCalendarFormat('day');
    }
}
export function openCalendarWeek(date) {
    if (!date) return;
    const selected = new Date(date + 'T12:00:00');
    selected.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
    state.currentCalendarDate = selected;
    state.selectedCalendarDay = null;
    setCalendarFormat('week');
}
export function openCalendarTrainingCreate() {
    const date = (['day', 'month'].includes(state.activeCalendarFormat) && state.selectedCalendarDay) ? state.selectedCalendarDay : toLocalDateString(state.currentCalendarDate);
    const input = document.getElementById('plan-date');
    if (input) input.value = date;
    window.openPlannedWorkoutModal?.();
}
export function openCalendarRaceCreate() {
    const date = (['day', 'month'].includes(state.activeCalendarFormat) && state.selectedCalendarDay) ? state.selectedCalendarDay : toLocalDateString(state.currentCalendarDate);
    const input = document.getElementById('race-date');
    if (input) input.value = date;
    window.toggleRaceModal?.();
}


export function toggleCalendarAddMenu(){document.getElementById('calendar-add-menu')?.classList.toggle('hidden');}
export function closeCalendarAddMenu(){document.getElementById('calendar-add-menu')?.classList.add('hidden');}

export function setCalendarFormat(fmt) {
    const nextFormat = ['day', 'week', 'month', 'year', 'activities'].includes(fmt) ? fmt : 'week';
    state.activeCalendarFormat = nextFormat;
    ['day', 'week', 'month', 'year', 'activities'].forEach(f => {
        const btn = document.getElementById(`btn-fmt-${f}`);
        if (btn) {
            const active = f === nextFormat;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        }
    });
    renderCalendar();
}

export function navigateCalendarPeriod(dir) {
    if (state.activeCalendarFormat === 'day') {
        state.currentCalendarDate.setDate(state.currentCalendarDate.getDate() + dir);
    } else if (state.activeCalendarFormat === 'week') {
        state.currentCalendarDate.setDate(state.currentCalendarDate.getDate() + (dir * 7));
    } else if (state.activeCalendarFormat === 'year') {
        state.currentCalendarDate.setFullYear(state.currentCalendarDate.getFullYear() + dir);
    } else {
        if (state.activeCalendarFormat === 'month') state.currentCalendarDate.setDate(1);
        state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + dir);
    }
    if (state.activeCalendarFormat === 'month' || state.activeCalendarFormat === 'year') state.selectedCalendarDay = null;
    else if (state.activeCalendarFormat === 'day') state.selectedCalendarDay = toLocalDateString(state.currentCalendarDate);
    renderCalendar();
}

function calendarDisplayMode() {
    if (state.calendarDisplayMode !== 'sport' && state.calendarDisplayMode !== 'training') {
        try { state.calendarDisplayMode = getUserLocalSetting('calendarDisplayMode') === 'training' ? 'training' : 'sport'; }
        catch { state.calendarDisplayMode = 'sport'; }
    }
    return state.calendarDisplayMode;
}

function calendarTrainingLabel(act, categoryColors) {
    const category = categoryColors[act.category || 'ga'] || categoryColors.ga;
    return category?.label || 'Training';
}

export function setCalendarDisplayMode(mode) {
    state.calendarDisplayMode = mode === 'training' ? 'training' : 'sport';
    try { setUserLocalSetting('calendarDisplayMode', state.calendarDisplayMode); }
    catch (error) { console.warn('Kalenderanzeige konnte nicht gespeichert werden:', error); }
    renderCalendar();
}

function renderCalendarLegend() {
    const el = document.getElementById('calendar-legend');
    if (!el) return;
    const dates = [];
    const format = state.activeCalendarFormat;
    if (format === 'day') dates.push(toLocalDateString(state.currentCalendarDate));
    else if (format === 'week') {
        const start = new Date(state.currentCalendarDate);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); dates.push(toLocalDateString(d)); }
    } else if (format === 'month') {
        const prefix = state.currentCalendarDate.getFullYear() + '-' + String(state.currentCalendarDate.getMonth() + 1).padStart(2, '0') + '-';
        dates.push(...(state.rawActivities || []).filter(item => String(item.date || '').startsWith(prefix)).map(item => item.date));
        dates.push(...(state.plannedActivities || []).filter(item => String(item.date || '').startsWith(prefix)).map(item => item.date));
    } else if (format === 'year') {
        const prefix = String(state.currentCalendarDate.getFullYear()) + '-';
        dates.push(...(state.rawActivities || []).filter(item => String(item.date || '').startsWith(prefix)).map(item => item.date));
        dates.push(...(state.plannedActivities || []).filter(item => String(item.date || '').startsWith(prefix)).map(item => item.date));
    }
    const types = new Set();
    dates.forEach(date => {
        (state.rawActivities || []).filter(item => item.date === date).forEach(item => types.add(item.type || 'Workout'));
        (state.plannedActivities || []).filter(item => item.date === date).forEach(item => types.add(item.type || 'Workout'));
    });
    const catalog = getSportsCatalog();
    const items = [...types].map(type => {
        const sport = catalog[type] || catalog.Workout;
        return '<span class="calendar-legend-item"><span class="calendar-legend-dot" style="background:' + sport.color + '"></span>' + escapeHtml(sport.label || type) + '</span>';
    });
    items.push('<span class="calendar-legend-item"><span class="calendar-entry-status is-completed">●</span>Abgeschlossen</span>');
    items.push('<span class="calendar-legend-item"><span class="calendar-entry-status is-planned">○</span>Geplant</span>');
    items.push('<span class="calendar-legend-item"><i data-lucide="trophy" class="calendar-event-icon calendar-event-race"></i>Wettkampf</span>');
    items.push('<span class="calendar-legend-item"><i data-lucide="droplet" class="calendar-event-icon calendar-event-cycle"></i>Menstruation</span>');
    items.push('<span class="calendar-legend-item"><i data-lucide="thermometer" class="calendar-event-icon calendar-event-sick"></i>Krankheit</span>');
    items.push('<span class="calendar-legend-item"><i data-lucide="bandage" class="calendar-event-icon calendar-event-injured"></i>Verletzung</span>');
    el.innerHTML = items.join('');
    globalThis.lucide?.createIcons?.();
}

export function renderCalendar() {
    const formats = ['day', 'week', 'month', 'year', 'activities'];
    const format = formats.includes(state.activeCalendarFormat) ? state.activeCalendarFormat : 'week';
    state.activeCalendarFormat = format;
    formats.forEach(item => {
        const button = document.getElementById('btn-fmt-' + item);
        if (button) {
            const active = item === format;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        }
    });
    document.getElementById('cal-format-day')?.classList.toggle('hidden', format !== 'day');
    document.getElementById('cal-format-month')?.classList.toggle('hidden', format !== 'month');
    document.getElementById('cal-format-week')?.classList.toggle('hidden', format !== 'week');
    document.getElementById('calendar-week-summary')?.classList.toggle('hidden', format !== 'week');
    document.getElementById('cal-format-year')?.classList.toggle('hidden', format !== 'year');
    document.getElementById('cal-format-list')?.classList.toggle('hidden', format !== 'activities');
    const activities = format === 'activities';
    ['calendar-period-prev', 'calendar-period-next'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', activities));
    document.getElementById('calendar-add-button')?.classList.toggle('hidden', activities);
    renderCalendarLegend();
    if (format === 'day') renderCalendarDayDetail(toLocalDateString(state.currentCalendarDate), 'cal-format-day');
    else if (format === 'week') renderWeekView();
    else if (format === 'month') renderMonthView();
    else if (format === 'year') renderYearView();
    else renderListView();
}

function calendarYearPhaseStore() {
    if (!state.settings || typeof state.settings !== 'object') state.settings = { sports: {}, categories: {}, heartRateZones: {} };
    if (!Array.isArray(state.settings.calendarSeasonPhases)) state.settings.calendarSeasonPhases = [];
    if (!Array.isArray(state.settings.calendarSeasonPhaseDismissed)) state.settings.calendarSeasonPhaseDismissed = [];
    return state.settings.calendarSeasonPhases;
}

function calendarYearDateRange(year, start, end) {
    const first = new Date(year, 0, 1, 12), last = new Date(year, 11, 31, 12);
    const a = new Date(start + 'T12:00:00'), b = new Date(end + 'T12:00:00');
    const from = a < first ? first : a, to = b > last ? last : b;
    const dates = [];
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) dates.push(toLocalDateString(d));
    return dates;
}

function calendarYearLoadLabel(mode, unit) {
    const modes = {
        'garmin-native': 'Garmin Training Load',
        'garmin-zone': 'Garmin Zonen-Load',
        'srpe': 'sRPE-Load',
        'icu': 'Intervals.icu Load'
    };
    return [modes[mode] || 'Training Load', unit || ''].filter(Boolean).join(' · ');
}

function calendarYearLoadColor(value, thresholds) {
    if (!Number.isFinite(value) || !thresholds.length) return 'var(--color-surface-subtle,#1c2835)';
    if (value <= thresholds[0]) return '#DCEFE4';
    if (value <= thresholds[1]) return '#A7D5B6';
    if (value <= thresholds[2]) return '#F0D58C';
    if (value <= thresholds[3]) return '#E9A36F';
    return '#D87575';
}

function calendarYearFormatHours(minutes, approximate) {
    if (!Number.isFinite(minutes)) return '—';
    return (approximate ? '∼' : '') + (minutes / 60).toFixed(1) + ' h';
}

function calendarYearBuildPhaseSuggestions(year, weeks) {
    const suggestions = [];
    const races = (state.races || []).filter(item => item?.date >= year + '-01-01' && item?.date <= year + '-12-31')
        .sort((a, b) => a.date.localeCompare(b.date));
    if (races.length) {
        const startDate = new Date(races[0].date + 'T12:00:00');
        const endDate = new Date(races[races.length - 1].date + 'T12:00:00');
        startDate.setDate(startDate.getDate() - 7);
        endDate.setDate(endDate.getDate() + 2);
        const start = toLocalDateString(startDate) < year + '-01-01' ? year + '-01-01' : toLocalDateString(startDate);
        const end = toLocalDateString(endDate) > year + '-12-31' ? year + '-12-31' : toLocalDateString(endDate);
        suggestions.push({
            id: 'race-' + start + '-' + end, name: 'Wettkampfphase', type: 'competition',
            start, end, reason: 'Aus den dokumentierten Wettkampfterminen abgeleitet. Bitte Zeitraum und sportliche Bedeutung prüfen.'
        });
    }
    const completeWeeks = weeks.filter(week => week.loadStatus === 'complete' && Number.isFinite(week.loadValue));
    for (let i = 2; i < completeWeeks.length; i++) {
        const a = completeWeeks[i - 2], b = completeWeeks[i - 1], c = completeWeeks[i];
        if (a.end < b.start && b.end < c.start && a.loadValue < b.loadValue && b.loadValue < c.loadValue) {
            suggestions.push({
                id: 'build-' + a.start + '-' + c.end, name: 'Belastungsanstieg', type: 'build',
                start: a.start, end: c.end,
                reason: 'Drei aufeinanderfolgende vollständig dokumentierte Wochen mit steigender Load-Summe. Das ist ein Belastungsmuster, keine gesicherte Trainingsintention.'
            });
            i += 2;
        }
    }
    const phases = calendarYearPhaseStore();
    const dismissed = state.settings.calendarSeasonPhaseDismissed;
    return suggestions.filter(item =>
        !dismissed.includes(item.id) &&
        !phases.some(phase => phase.id === item.id || (phase.start <= item.end && phase.end >= item.start))
    );
}

function calendarYearPhaseCard(phase, suggested) {
    const action = suggested
        ? '<button type="button" class="calendar-year-phase-action is-primary" onclick="confirmCalendarSeasonPhase(\'' + phase.id + '\')">Übernehmen</button><button type="button" class="calendar-year-phase-action" onclick="openCalendarPhaseEditor(\'' + phase.id + '\')">Anpassen</button><button type="button" class="calendar-year-phase-dismiss" onclick="dismissCalendarSeasonPhase(\'' + phase.id + '\')" aria-label="Vorschlag verwerfen">×</button>'
        : '<button type="button" class="calendar-year-phase-action" onclick="openCalendarPhaseEditor(\'' + phase.id + '\')">Bearbeiten</button><button type="button" class="calendar-year-phase-dismiss" onclick="deleteCalendarSeasonPhase(\'' + phase.id + '\')" aria-label="Phase löschen">×</button>';
    return '<article class="calendar-year-phase-card ' + (suggested ? 'is-suggested' : 'is-confirmed') + '">' +
        '<div class="calendar-year-phase-heading"><strong>' + escapeHtml(phase.name) + '</strong><span>' + (suggested ? 'Vorschlag' : 'Bestätigt') + '</span></div>' +
        '<div class="calendar-year-phase-dates">' + escapeHtml(formatDateDDMMYY(phase.start)) + ' – ' + escapeHtml(formatDateDDMMYY(phase.end)) + '</div>' +
        (phase.reason ? '<p>' + escapeHtml(phase.reason) + '</p>' : '') +
        '<div class="calendar-year-phase-actions">' + action + '</div></article>';
}

export function confirmCalendarSeasonPhase(id) {
    const suggestion = (state.calendarYearPhaseSuggestions || []).find(item => item.id === id);
    if (!suggestion) return;
    const phases = calendarYearPhaseStore();
    if (!phases.some(item => item.id === id)) phases.push({ ...suggestion, confirmedAt: new Date().toISOString() });
    state.settings.calendarSeasonPhaseDismissed = (state.settings.calendarSeasonPhaseDismissed || []).filter(item => item !== id);
    saveDataToLocalStorage();
    renderYearView();
}

export function dismissCalendarSeasonPhase(id) {
    calendarYearPhaseStore();
    if (!state.settings.calendarSeasonPhaseDismissed.includes(id)) state.settings.calendarSeasonPhaseDismissed.push(id);
    saveDataToLocalStorage();
    renderYearView();
}

export function deleteCalendarSeasonPhase(id) {
    state.settings.calendarSeasonPhases = calendarYearPhaseStore().filter(item => item.id !== id);
    saveDataToLocalStorage();
    renderYearView();
}

export function openCalendarPhaseEditor(id) {
    const suggestion = (state.calendarYearPhaseSuggestions || []).find(item => item.id === id);
    const existing = calendarYearPhaseStore().find(item => item.id === id);
    const phase = existing || suggestion;
    if (!phase) return;
    const host = document.getElementById('calendar-year-phase-editor');
    if (!host) return;
    host.classList.add('calendar-year-phase-editor');
    host.innerHTML = '<div class="calendar-year-editor-backdrop" role="presentation" onclick="closeCalendarPhaseEditor()"></div><form class="calendar-year-editor" onsubmit="saveCalendarPhaseEditor(event)">' +
        '<div class="calendar-year-editor-head"><strong>Trainingsphase bearbeiten</strong><button type="button" onclick="closeCalendarPhaseEditor()" aria-label="Schließen">×</button></div>' +
        '<label>Bezeichnung<input id="calendar-phase-name" maxlength="60" required value="' + escapeHtml(phase.name) + '"></label>' +
        '<div class="calendar-year-editor-dates"><label>Beginn<input id="calendar-phase-start" type="date" required value="' + escapeHtml(phase.start) + '"></label><label>Ende<input id="calendar-phase-end" type="date" required value="' + escapeHtml(phase.end) + '"></label></div>' +
        '<p>Die Phase wird erst nach dem Speichern als bestätigt in deiner Saison geführt.</p>' +
        '<input id="calendar-phase-id" type="hidden" value="' + escapeHtml(id) + '">' +
        '<div class="calendar-year-editor-actions"><button type="button" onclick="closeCalendarPhaseEditor()">Abbrechen</button><button type="submit">Speichern</button></div></form>';
    host.classList.remove('hidden');
}

export function closeCalendarPhaseEditor() {
    document.getElementById('calendar-year-phase-editor')?.classList.add('hidden');
}

export function saveCalendarPhaseEditor(event) {
    event?.preventDefault?.();
    const id = document.getElementById('calendar-phase-id')?.value;
    const name = document.getElementById('calendar-phase-name')?.value.trim();
    const start = document.getElementById('calendar-phase-start')?.value;
    const end = document.getElementById('calendar-phase-end')?.value;
    if (!id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || start > end) {
        alert('Bitte prüfe Bezeichnung und Zeitraum der Trainingsphase.');
        return;
    }
    const phases = calendarYearPhaseStore();
    const existing = phases.find(item => item.id === id);
    const suggestion = (state.calendarYearPhaseSuggestions || []).find(item => item.id === id);
    const updated = { ...(existing || suggestion || {}), id, name, start, end, confirmedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, updated);
    else phases.push(updated);
    state.settings.calendarSeasonPhaseDismissed = (state.settings.calendarSeasonPhaseDismissed || []).filter(item => item !== id);
    saveDataToLocalStorage();
    closeCalendarPhaseEditor();
    renderYearView();
}

export function renderYearView() {
    const container = document.getElementById('cal-format-year');
    if (!container) return;
    const year = state.currentCalendarDate.getFullYear();
    const yearStart = year + '-01-01', yearEnd = year + '-12-31';
    const today = toLocalDateString();
    const catalog = getSportsCatalog();
    const timelineByDate = new Map((state.dailyTimeline || []).filter(item => item?.date >= yearStart && item?.date <= yearEnd).map(item => [item.date, item]));
    const first = new Date(year, 0, 1, 12);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const last = new Date(year, 11, 31, 12);
    const weeks = [];
    for (let monday = new Date(first); monday <= last; monday.setDate(monday.getDate() + 7)) {
        const startDate = new Date(monday), endDate = new Date(monday); endDate.setDate(endDate.getDate() + 6);
        const thursday = new Date(startDate); thursday.setDate(thursday.getDate() + 3);
        const weekNo = (() => { const d = new Date(thursday); const jan4 = new Date(d.getFullYear(), 0, 4, 12); const jan4Monday = new Date(jan4); jan4Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7)); return Math.floor((d - jan4Monday) / 604800000) + 1; })();
        const start = toLocalDateString(startDate), end = toLocalDateString(endDate);
        const dates = calendarYearDateRange(year, start, end);
        const activities = (state.rawActivities || []).filter(item => item?.date >= yearStart && item?.date <= yearEnd && item.date >= start && item.date <= end);
        const plannedActivities = (state.plannedActivities || []).filter(item => item?.date >= yearStart && item?.date <= yearEnd && item.date >= start && item.date <= end);
        const plannedBySport = {};
        plannedActivities.forEach(item => { const key = item.type || 'Workout'; plannedBySport[key] = (plannedBySport[key] || 0) + 1; });
        const bySport = {};
        activities.forEach(item => {
            const type = item.type || 'Workout', format = item.raceFormat || '', source = calendarActivitySourceLabel(item);
            const key = type + '::' + format + '::' + source;
            if (!bySport[key]) bySport[key] = { type, format, source, minutes: 0, count: 0, complete: true };
            bySport[key].count++;
            if (item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0) bySport[key].minutes += Number(item.duration);
            else bySport[key].complete = false;
        });
        const durationRecords = activities.filter(item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0);
        const totalMinutes = durationRecords.reduce((sum, item) => sum + Number(item.duration), 0);
        const durationComplete = activities.length > 0 && durationRecords.length === activities.length;
        const races = (state.races || []).filter(item => item?.date >= yearStart && item.date <= yearEnd && item.date >= start && item.date <= end);
        const health = Object.entries(state.healthLogs || {}).filter(([date]) => date >= yearStart && date <= yearEnd && date >= start && date <= end);
        const cycle = Object.entries(state.dailyCheckins || {}).filter(([date, item]) => date >= yearStart && date <= yearEnd && date >= start && date <= end && item?.cycle?.period === true);
        const elapsedDates = dates.filter(date => date <= today);
        const dayLoads = elapsedDates.map(date => timelineByDate.get(date));
        const knownLoads = dayLoads.filter(item => item && ['complete', 'confirmed-rest'].includes(item.dataStatus) && Number.isFinite(Number(item.load)));
        const loadKnown = elapsedDates.length > 0 && knownLoads.length === elapsedDates.length;
        const loadModes = [...new Set(knownLoads.map(item => item.loadMode).filter(Boolean))];
        const loadStatus = loadKnown && loadModes.length === 1
            ? (dates.length === 7 && elapsedDates.length === 7 ? 'complete' : 'partial')
            : 'unknown';
        const loadValue = loadStatus !== 'unknown' ? knownLoads.reduce((sum, item) => sum + Number(item.load), 0) : null;
        weeks.push({
            start, end, weekNo, dates, activities, plannedActivities, plannedBySport, bySport,
            totalMinutes, durationComplete, races, health, cycle, month: thursday.getMonth(),
            loadValue, loadStatus, loadMode: loadModes[0] || null, loadUnit: knownLoads[0]?.loadUnit || null
        });
    }

    const validFullWeeks = weeks.filter(week => week.loadStatus === 'complete' && Number.isFinite(week.loadValue));
    const sortedLoads = validFullWeeks.map(week => week.loadValue).sort((a, b) => a - b);
    const quantile = q => sortedLoads.length ? sortedLoads[Math.min(sortedLoads.length - 1, Math.floor((sortedLoads.length - 1) * q))] : null;
    const thresholds = sortedLoads.length ? [quantile(.2), quantile(.4), quantile(.6), quantile(.8)] : [];
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const monthGroups = [];
    weeks.forEach((week, index) => {
        const lastGroup = monthGroups[monthGroups.length - 1];
        if (lastGroup && lastGroup.month === week.month) lastGroup.span++;
        else monthGroups.push({ month: week.month, span: 1, start: index });
    });
    const cols = 'repeat(' + weeks.length + ', minmax(22px, 1fr))';
    const monthHeader = monthGroups.map(group => '<span class="calendar-year-month-label" style="grid-column:span ' + group.span + '">' + monthNames[group.month] + '</span>').join('');
    const weekHeader = weeks.map(week => '<span class="calendar-year-week-number">' + week.weekNo + '</span>').join('');
    const weekCells = weeks.map(week => {
        const segments = Object.values(week.bySport).map(data => {
            const sport = catalog[data.type] || catalog.Workout;
            const width = week.totalMinutes > 0 ? Math.max(3, data.minutes / week.totalMinutes * 100) : 0;
            const label = sport.label + (data.format ? ' · ' + data.format : '');
            const sourceClass = data.source === 'Manuell' ? 'is-source-manual' : data.source.includes('Intervals') ? 'is-source-intervals' : data.source.includes('Dateiimport') ? 'is-source-file' : data.source.includes('Garmin') ? 'is-source-garmin' : 'is-source-unknown';
            return '<span class="calendar-year-sport-segment ' + sourceClass + '" style="width:' + width + '%;background:' + sport.color + '" title="' + escapeHtml(label) + ' · ' + escapeHtml(data.source) + ': ' + (data.minutes ? Math.round(data.minutes) + ' min dokumentiert' : 'Dauer nicht verfügbar') + '"></span>';
        }).join('');
        const plannedSegments = Object.entries(week.plannedBySport).map(([type, count]) => '<span class="calendar-year-planned-segment" style="border-color:' + (catalog[type]?.color || catalog.Workout.color) + '" title="' + escapeHtml(catalog[type]?.label || type) + ' · ' + count + ' geplant"></span>').join('');
        const hours = !week.activities.length || (!week.durationComplete && week.totalMinutes === 0) ? '—' : calendarYearFormatHours(week.totalMinutes, !week.durationComplete);
        const events = (week.races.length ? '<i data-lucide="trophy" class="calendar-year-event calendar-event-race" title="Wettkampf"></i>' : '') +
            (week.cycle.length ? '<i data-lucide="droplet" class="calendar-year-event calendar-event-cycle" title="Menstruation erfasst"></i>' : '') +
            (week.health.some(item => item[1]?.status === 'sick') ? '<i data-lucide="thermometer" class="calendar-year-event calendar-event-sick" title="Krankheit"></i>' : '') +
            (week.health.some(item => item[1]?.status === 'injured') ? '<i data-lucide="bandage" class="calendar-year-event calendar-event-injured" title="Verletzung"></i>' : '');
        const loadColor = week.loadStatus === 'unknown' ? 'var(--color-surface-subtle,#1c2835)' : calendarYearLoadColor(week.loadValue, thresholds);
        const loadClass = week.loadStatus === 'partial' ? 'is-partial' : week.loadStatus === 'unknown' ? 'is-unknown' : 'is-complete';
        const loadTitle = week.loadStatus === 'unknown' ? 'Training Load nicht vollständig berechenbar' : calendarYearLoadLabel(week.loadMode, week.loadUnit) + ': ' + (week.loadStatus === 'partial' ? 'bisher ' : '') + week.loadValue.toFixed(1);
        return '<button type="button" class="calendar-year-week-cell ' + loadClass + '" data-week-start="' + week.start + '" style="--calendar-load-color:' + loadColor + '" title="KW ' + week.weekNo + ' · ' + week.start + ' bis ' + week.end + ' · ' + escapeHtml(loadTitle) + ' · Trainingszeit ' + hours + '" onclick="openCalendarWeek(\'' + week.start + '\')">' +
            '<span class="calendar-year-week-load"></span><span class="calendar-year-week-bar">' + segments + '</span><span class="calendar-year-planned-bar">' + plannedSegments + '</span><small>' + hours + '</small><span class="calendar-year-events">' + events + '</span></button>';
    }).join('');

    const activities = (state.rawActivities || []).filter(item => item?.date >= yearStart && item.date <= yearEnd);
    const durationRecords = activities.filter(item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0);
    const totalMinutes = durationRecords.reduce((sum, item) => sum + Number(item.duration), 0);
    const durationIncomplete = durationRecords.length !== activities.length;
    const races = (state.races || []).filter(item => item?.date >= yearStart && item.date <= yearEnd);
    const sessions = activities.length;
    const elapsedYearDates = calendarYearDateRange(year, yearStart, today > yearEnd ? yearEnd : today);
    const annualLoadEntries = elapsedYearDates.map(date => timelineByDate.get(date));
    const annualLoadComplete = elapsedYearDates.length > 0 && annualLoadEntries.every(item => item && ['complete', 'confirmed-rest'].includes(item.dataStatus) && Number.isFinite(Number(item.load)));
    const annualLoadModes = [...new Set(annualLoadEntries.map(item => item?.loadMode).filter(Boolean))];
    const annualLoad = annualLoadComplete && annualLoadModes.length === 1
        ? annualLoadEntries.reduce((sum, item) => sum + Number(item.load), 0) : null;
    const loadMode = annualLoadModes.length === 1 ? annualLoadEntries.find(item => item?.loadMode)?.loadMode : null;
    const loadUnit = annualLoadEntries.find(item => item?.loadUnit)?.loadUnit || '';
    const kpis = [
        { label: 'Training Load', value: annualLoad === null ? '—' : annualLoad.toFixed(0), note: annualLoad === null ? 'Jahreswert wegen Datenlücken nicht vollständig' : calendarYearLoadLabel(loadMode, loadUnit) },
        { label: 'Trainingszeit', value: durationRecords.length ? calendarYearFormatHours(totalMinutes, durationIncomplete) : '—', note: durationIncomplete ? 'Nur dokumentierte Dauern · unvollständig' : 'Dokumentierte Trainingszeit' },
        { label: 'Einheiten', value: String(sessions), note: 'Abgeschlossene Aktivitäten' },
        { label: 'Wettkämpfe', value: String(races.length), note: 'Dokumentierte Wettkämpfe' }
    ];
    const kpiMarkup = kpis.map(item => '<article class="calendar-year-kpi"><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.value) + '</strong><small>' + escapeHtml(item.note) + '</small></article>').join('');

    const months = Array.from({ length: 12 }, (_, month) => {
        const monthStart = year + '-' + String(month + 1).padStart(2, '0') + '-01';
        const monthLastDate = new Date(year, month + 1, 0, 12);
        const monthEnd = toLocalDateString(monthLastDate);
        const elapsed = calendarYearDateRange(year, monthStart, monthEnd < today ? monthEnd : today);
        const entries = elapsed.map(date => timelineByDate.get(date));
        const known = entries.filter(item => item && ['complete', 'confirmed-rest'].includes(item.dataStatus) && Number.isFinite(Number(item.load)));
        const complete = elapsed.length > 0 && known.length === elapsed.length;
        const modeSet = [...new Set(known.map(item => item.loadMode).filter(Boolean))];
        const value = complete && modeSet.length === 1 ? known.reduce((sum, item) => sum + Number(item.load), 0) : null;
        const monthActivities = activities.filter(item => item.date >= monthStart && item.date <= monthEnd);
        const monthDurations = monthActivities.filter(item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0);
        return { label: monthNames[month], value, partial: monthEnd >= today, minutes: monthDurations.reduce((sum, item) => sum + Number(item.duration), 0), durationPartial: monthDurations.length !== monthActivities.length };
    });
    const maxMonthLoad = Math.max(1, ...months.map(item => item.value ?? 0));
    const monthChart = months.map(item => '<div class="calendar-year-month-column" title="' + item.label + ': ' + (item.value === null ? 'Load nicht vollständig berechenbar' : item.value.toFixed(1)) + '">' +
        '<div class="calendar-year-month-bar-track"><span style="height:' + (item.value === null ? 0 : Math.max(3, item.value / maxMonthLoad * 100)) + '%" class="' + (item.partial ? 'is-partial' : '') + '"></span></div>' +
        '<strong>' + (item.value === null ? '—' : Math.round(item.value) + (item.partial ? '∼' : '')) + '</strong><small>' + item.label + '</small><em>' + (item.minutes ? calendarYearFormatHours(item.minutes, item.durationPartial) : '—') + '</em></div>').join('');

    const sportTotals = {};
    activities.forEach(item => {
        const type = item.type || 'Workout';
        if (!sportTotals[type]) sportTotals[type] = { minutes: 0, count: 0, missing: false };
        sportTotals[type].count++;
        if (item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0) sportTotals[type].minutes += Number(item.duration);
        else sportTotals[type].missing = true;
    });
    const sportRows = Object.entries(sportTotals).sort((a, b) => b[1].minutes - a[1].minutes).map(([type, data]) => {
        const sport = catalog[type] || catalog.Workout;
        const share = totalMinutes > 0 ? data.minutes / totalMinutes * 100 : 0;
        return '<div class="calendar-year-sport-row"><span class="calendar-year-sport-name"><i style="background:' + sport.color + '"></i>' + escapeHtml(sport.label) + '</span><span class="calendar-year-sport-track"><i style="width:' + share + '%;background:' + sport.color + '"></i></span><strong>' + (data.minutes ? calendarYearFormatHours(data.minutes, data.missing) : '—') + '</strong><small>' + data.count + ' Einheiten</small></div>';
    }).join('');

    const confirmedPhases = calendarYearPhaseStore().filter(phase => phase?.start <= yearEnd && phase?.end >= yearStart).sort((a, b) => a.start.localeCompare(b.start));
    const suggestions = calendarYearBuildPhaseSuggestions(year, weeks);
    state.calendarYearPhaseSuggestions = suggestions;
    const phaseMarkup = confirmedPhases.map(phase => calendarYearPhaseCard(phase, false)).join('');
    const suggestionMarkup = suggestions.map(phase => calendarYearPhaseCard(phase, true)).join('');

    const timelineEvents = [
        ...races.map(item => ({ date: item.date, type: 'race', title: item.name || 'Wettkampf', detail: item.result || item.prio || '' })),
        ...Object.entries(state.healthLogs || {}).filter(([date, item]) => date >= yearStart && date <= yearEnd && ['sick', 'injured'].includes(item?.status))
            .map(([date, item]) => ({ date, type: item.status, title: item.status === 'sick' ? 'Krankheit' : 'Verletzung', detail: item.diagnosis || '' })),
        ...confirmedPhases.map(item => ({ date: item.start, type: 'phase', title: item.name, detail: formatDateDDMMYY(item.start) + ' – ' + formatDateDDMMYY(item.end) }))
    ].sort((a, b) => a.date.localeCompare(b.date));
    const timelineMarkup = timelineEvents.slice(0, 18).map(item => '<div class="calendar-year-timeline-item is-' + item.type + '"><time>' + escapeHtml(formatDateDDMMYY(item.date)) + '</time><span>' + escapeHtml(item.title) + '</span><small>' + escapeHtml(item.detail) + '</small></div>').join('');

    const legendTypes = [...new Set(weeks.flatMap(week => [...Object.values(week.bySport).map(item => item.type), ...Object.keys(week.plannedBySport)]))];
    const sportLegend = legendTypes.map(type => '<span class="calendar-legend-item"><span class="calendar-legend-dot" style="background:' + (catalog[type]?.color || catalog.Workout.color) + '"></span>' + escapeHtml(catalog[type]?.label || type) + '</span>').join('');
    const firstLoadMode = weeks.find(week => week.loadMode)?.loadMode;
    const firstLoadUnit = weeks.find(week => week.loadUnit)?.loadUnit || '';
    document.getElementById('calendar-period-title').textContent = String(year);
    container.innerHTML =
        '<section class="calendar-year-kpis">' + kpiMarkup + '</section>' +
        '<section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Trainingsbelastung im Jahresverlauf</h3><p>Wochenwerte aus der zentralen Training-Load-Zeitreihe</p></div><span>' + escapeHtml(calendarYearLoadLabel(firstLoadMode, firstLoadUnit)) + '</span></div>' +
        '<div class="calendar-year-scroll"><div class="calendar-year-matrix" style="--calendar-year-columns:' + cols + '"><div class="calendar-year-months">' + monthHeader + '</div><div class="calendar-year-week-head">' + weekHeader + '</div><div class="calendar-year-weeks">' + weekCells + '</div></div></div>' +
        '<div class="calendar-year-load-legend"><span><i style="background:#DCEFE4"></i>Niedrig</span><span><i style="background:#A7D5B6"></i></span><span><i style="background:#F0D58C"></i>Mittel</span><span><i style="background:#E9A36F"></i></span><span><i style="background:#D87575"></i>Hoch</span><span><i class="is-unknown"></i>Nicht berechenbar</span><span><i class="is-partial"></i>Teilwoche</span></div>' +
        '<div class="calendar-year-legend">' + (sportLegend || '<span class="text-xs text-slate-500">Noch keine Sportarten dokumentiert.</span>') + '<span class="text-[10px] text-slate-500">Sportfarben = absolvierte Sportarten · umrandete Marker = geplante Einheiten · Symbole = Wettkampf und Gesundheit</span></div></section>' +
        '<section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Trainingsphasen</h3><p>Automatische Hinweise aus Wettkampfterminen und dokumentierten Belastungsmustern</p></div><span class="calendar-year-phase-count">' + confirmedPhases.length + ' bestätigt</span></div>' +
        '<div class="calendar-year-phase-grid">' + (phaseMarkup || '<p class="calendar-year-empty">Noch keine Trainingsphasen bestätigt.</p>') + '</div>' +
        (suggestionMarkup ? '<h4 class="calendar-year-subheading">Vorschläge zur Prüfung</h4><div class="calendar-year-phase-grid">' + suggestionMarkup + '</div>' : '<p class="calendar-year-empty">Aktuell keine ausreichend belegten neuen Phasenvorschläge.</p>') +
        '<div id="calendar-year-phase-editor" class="hidden"></div></section>' +
        '<div class="calendar-year-analysis-grid"><section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Monatsvergleich</h3><p>Load-Summe je Monat · Trainingszeit als Zusatzinformation</p></div></div><div class="calendar-year-month-chart">' + monthChart + '</div></section>' +
        '<section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Sportartenverteilung</h3><p>Dokumentierte Trainingszeit und Einheiten</p></div></div><div class="calendar-year-sport-list">' + (sportRows || '<p class="calendar-year-empty">Noch keine Aktivitäten im Kalenderjahr dokumentiert.</p>') + '</div></section></div>' +
        '<section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Saison-Timeline</h3><p>Wettkämpfe, Gesundheitsereignisse und bestätigte Trainingsphasen</p></div></div><div class="calendar-year-timeline">' + (timelineMarkup || '<p class="calendar-year-empty">Für dieses Kalenderjahr sind noch keine Ereignisse dokumentiert.</p>') + '</div></section>';
    globalThis.lucide?.createIcons?.();
}
export function renderMonthView() {
    const catalog = getSportsCatalog();
    const year = state.currentCalendarDate.getFullYear();
    const month = state.currentCalendarDate.getMonth();
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    document.getElementById('calendar-period-title').textContent = monthNames[month] + ' ' + year;
    const grid = document.getElementById('month-grid-cells');
    if (!grid) return;
    grid.innerHTML = '';
    const firstDay = new Date(year, month, 1, 12);
    const offset = (firstDay.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const today = toLocalDateString();
    for (let i = 0; i < offset; i++) grid.insertAdjacentHTML('beforeend', '<div class="calendar-month-empty"></div>');
    for (let day = 1; day <= days; day++) {
        const date = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        const data = calendarDateData(date);
        const selected = state.selectedCalendarDay === date;
        const markers = [];
        data.activities.forEach(item => { const sport = catalog[item.type] || catalog.Workout; markers.push('<span class="calendar-month-sport-marker is-completed" style="--activity-color:' + sport.color + '" title="' + escapeHtml(sport.label + (item.raceFormat ? ' · ' + item.raceFormat : '')) + ' · Abgeschlossen"></span>'); });
        data.planned.forEach(item => { const sport = catalog[item.type] || catalog.Workout; markers.push('<span class="calendar-month-sport-marker is-planned" style="--activity-color:' + sport.color + '" title="' + escapeHtml(sport.label) + ' · Geplant"></span>'); });
        const load = data.loadValue === null ? '' : '<small class="calendar-month-load">' + Math.round(data.loadValue) + '</small>';
        grid.insertAdjacentHTML('beforeend', '<button type="button" class="calendar-month-day ' + (date === today ? 'is-today ' : '') + (selected ? 'is-selected' : '') + '" data-date="' + date + '" aria-pressed="' + selected + '" aria-label="' + calendarDateLabel(date) + '" onclick="openCalendarDay(\'' + date + '\',true)">' +
            '<span class="calendar-month-day-head"><span class="calendar-month-day-number">' + day + '</span>' + load + '</span>' +
            '<span class="calendar-month-markers">' + markers.join('') + '</span><span class="calendar-month-events">' + calendarEventIcons(date) + '</span></button>');
    }
    const selectedDate = state.selectedCalendarDay;
    const detail = document.getElementById('month-day-detail');
    if (detail) {
        const sameMonth = selectedDate && selectedDate.slice(0, 7) === year + '-' + String(month + 1).padStart(2, '0');
        detail.classList.toggle('hidden', !sameMonth);
        if (sameMonth) renderCalendarDayDetail(selectedDate, detail);
        else detail.innerHTML = '';
    }
    globalThis.lucide?.createIcons?.();
}

export function selectCalendarWeekDay(date) {
    if (!date) return;
    state.selectedCalendarDay = date;
    renderWeekView();
    document.getElementById('calendar-week-day-' + date)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export function openPlannedCalendarDetail(id) {
    const item = (state.plannedActivities || []).find(entry => String(entry.id) === String(id));
    if (!item) return;
    const sport = calendarSport(item.type);
    let modal = document.getElementById('calendar-planned-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'calendar-planned-detail-modal';
        modal.className = 'fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-3';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        document.body.appendChild(modal);
    }
    modal.innerHTML = '<section class="calendar-planned-detail-card"><div class="flex items-center justify-between gap-3"><div><p class="text-xs text-slate-400">Geplante Trainingseinheit</p><h2 class="text-lg font-bold">' + escapeHtml(item.name || 'Geplante Einheit') + '</h2></div><button type="button" class="calendar-planned-detail-close" aria-label="Schließen" onclick="closePlannedCalendarDetail()"><i data-lucide="x"></i></button></div>' +
        '<div class="calendar-planned-detail-sport" style="--activity-color:' + (sport.color || '#64748b') + '">' + escapeHtml(sport.label) + '</div>' +
        '<dl><div><dt>Datum</dt><dd>' + escapeHtml(calendarDateLabel(item.date)) + '</dd></div><div><dt>Dauer</dt><dd>' + (item.duration == null ? '—' : escapeHtml(item.duration) + ' min') + '</dd></div><div><dt>Ziel-Load</dt><dd>' + (item.targetTss == null ? '—' : escapeHtml(item.targetTss)) + '</dd></div><div><dt>Trainingsform</dt><dd>' + escapeHtml(item.category || '—') + '</dd></div></dl>' +
        (item.desc ? '<p class="calendar-planned-detail-description">' + escapeHtml(item.desc) + '</p>' : '') +
        '<div class="flex justify-end"><button type="button" class="calendar-planned-detail-action" onclick="closePlannedCalendarDetail();switchTab(\'training-planning\')">Zur Trainingsplanung</button></div></section>';
    globalThis.lucide?.createIcons?.();
}
export function closePlannedCalendarDetail() {
    document.getElementById('calendar-planned-detail-modal')?.remove();
}

export function renderWeekView() {
    const container = document.getElementById('cal-format-week');
    if (!container) return;
    const current = new Date(state.currentCalendarDate);
    current.setHours(12, 0, 0, 0);
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7));
    const weekDates = [];
    for (let i = 0; i < 7; i++) { const date = new Date(current); date.setDate(current.getDate() + i); weekDates.push(toLocalDateString(date)); }
    const endDate = weekDates[6];
    const monthShort = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const weekNumberDate = new Date(weekDates[3] + 'T12:00:00');
    const jan4 = new Date(weekNumberDate.getFullYear(), 0, 4, 12);
    const firstMonday = new Date(jan4);
    firstMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const weekNo = Math.floor((weekNumberDate - firstMonday) / 604800000) + 1;
    document.getElementById('calendar-period-title').textContent = 'KW ' + weekNo + ' · ' + new Date(weekDates[0] + 'T12:00:00').getDate() + '. ' + monthShort[new Date(weekDates[0] + 'T12:00:00').getMonth()] + ' – ' + new Date(endDate + 'T12:00:00').getDate() + '. ' + monthShort[new Date(endDate + 'T12:00:00').getMonth()];
    const activities = (state.rawActivities || []).filter(item => item.date >= weekDates[0] && item.date <= endDate);
    const durationRecords = activities.filter(item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0);
    const loadDays = weekDates.map(date => calendarDateData(date)).filter(data => data.activities.length);
    const loadComplete = loadDays.length > 0 && loadDays.every(data => data.loadValue !== null);
    const loadTotal = loadComplete ? loadDays.reduce((sum, data) => sum + data.loadValue, 0) : null;
    const durationComplete = activities.length > 0 && durationRecords.length === activities.length;
    const durationTotal = durationRecords.length ? durationRecords.reduce((sum, item) => sum + Number(item.duration), 0) : null;
    const summary = document.getElementById('calendar-week-summary');
    if (summary) summary.innerHTML = '<span><small>Wochen-Load</small><strong>' + (loadTotal === null ? '—' : Math.round(loadTotal)) + '</strong></span><span><small>Trainingszeit</small><strong>' + (durationTotal === null ? '—' : (durationComplete ? '' : '∼') + calendarFormatMinutes(durationTotal)) + '</strong><em>' + (activities.length ? durationRecords.length + '/' + activities.length + ' Dauern erfasst' : 'Keine Einheiten dokumentiert') + '</em></span>';

    const today = toLocalDateString();
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const dayData = weekDates.map((date, index) => {
        const data = calendarDateData(date);
        const health = state.healthLogs?.[date];
        const cycle = state.dailyCheckins?.[date]?.cycle?.period === true;
        const markers = [
            ...data.activities.map(item => ({ color: calendarSport(item.type).color || '#64748b', title: calendarSport(item.type).label, kind: 'training' })),
            ...data.planned.map(item => ({ color: calendarSport(item.type).color || '#64748b', title: calendarSport(item.type).label + ' · geplant', kind: 'planned' })),
            ...(data.races.length ? [{ color: 'var(--kajo-status-info,#63a9ee)', title: 'Wettkampf', kind: 'race' }] : []),
            ...(health?.status === 'sick' ? [{ color: 'var(--kajo-status-warning,#e5a43b)', title: 'Krankheit', kind: 'sick' }] : []),
            ...(health?.status === 'injured' ? [{ color: 'var(--kajo-status-critical,#e36b6b)', title: 'Verletzung', kind: 'injured' }] : []),
            ...(cycle ? [{ color: '#d78aa8', title: 'Menstruation (erfasst)', kind: 'cycle' }] : [])
        ];
        return { date, index, data, markers, health, cycle };
    });
    const activeDate = weekDates.includes(state.selectedCalendarDay) ? state.selectedCalendarDay : today >= weekDates[0] && today <= endDate ? today : weekDates[0];
    state.selectedCalendarDay = activeDate;
    const strip = '<nav class="calendar-week-strip" aria-label="Wochentage">' + dayData.map(day => {
        const d = new Date(day.date + 'T12:00:00');
        const dots = day.markers.slice(0, 8).map(marker => '<span class="calendar-week-dot ' + (marker.kind === 'planned' ? 'is-planned' : '') + '" style="--marker-color:' + marker.color + '" title="' + escapeHtml(marker.title) + '"></span>').join('');
        return '<button type="button" class="calendar-week-strip-day ' + (day.date === today ? 'is-today ' : '') + (day.date === activeDate ? 'is-selected' : '') + '" aria-pressed="' + (day.date === activeDate) + '" onclick="selectCalendarWeekDay(\'' + day.date + '\')"><span>' + dayNames[day.index] + '</span><strong>' + d.getDate() + '</strong><span class="calendar-week-strip-dots">' + dots + '</span></button>';
    }).join('') + '</nav>';

    const sections = dayData.map(day => {
        const { date, data } = day;
        const d = new Date(date + 'T12:00:00');
        const activityItems = data.activities.map(item => {
            const sport = calendarSport(item.type);
            const id = encodeURIComponent(String(item.id || '')).replace(/'/g, '%27');
            return '<button type="button" class="calendar-week-activity is-completed" style="--activity-color:' + (sport.color || '#64748b') + '" onclick="openCSVDetailsModal(\'' + id + '\')"><span class="calendar-week-activity-accent"></span><span class="calendar-week-activity-main"><strong>' + escapeHtml(sport.label + (item.raceFormat ? ' · ' + item.raceFormat : '')) + '</strong><small>' + escapeHtml(item.name || 'Trainingseinheit') + '</small><small class="calendar-week-source">' + escapeHtml(calendarActivitySourceLabel(item)) + '</small></span><span class="calendar-entry-status is-completed">Abgeschlossen</span></button>';
        }).join('');
        const planItems = data.planned.map(item => {
            const sport = calendarSport(item.type);
            const id = encodeURIComponent(String(item.id || '')).replace(/'/g, '%27');
            return '<button type="button" class="calendar-week-activity is-planned" style="--activity-color:' + (sport.color || '#64748b') + '" onclick="openPlannedCalendarDetail(decodeURIComponent(\'' + id + '\'))"><span class="calendar-week-activity-accent"></span><span class="calendar-week-activity-main"><strong>' + escapeHtml(sport.label) + '</strong><small>' + escapeHtml(item.name || 'Geplante Einheit') + '</small><small>' + (item.duration == null ? 'Dauer —' : escapeHtml(item.duration) + ' min') + '</small></span><span class="calendar-entry-status is-planned">Geplant</span></button>';
        }).join('');
        const eventLabels = [];
        if (data.races.length) eventLabels.push('<span class="calendar-week-event-label calendar-event-race"><i data-lucide="trophy"></i> Wettkampf</span>');
        if (day.health?.status === 'sick') eventLabels.push('<span class="calendar-week-event-label calendar-event-sick"><i data-lucide="thermometer"></i> Krankheit</span>');
        if (day.health?.status === 'injured') eventLabels.push('<span class="calendar-week-event-label calendar-event-injured"><i data-lucide="bandage"></i> Verletzung</span>');
        if (day.cycle) eventLabels.push('<span class="calendar-week-event-label calendar-event-cycle"><i data-lucide="droplet"></i> Menstruation</span>');
        const dayName = calendarDateLabel(date);
        const entries = activityItems + planItems;
        return '<section id="calendar-week-day-' + date + '" class="calendar-week-agenda-day ' + (date === today ? 'is-today ' : '') + (date === activeDate ? 'is-selected' : '') + '"><button type="button" class="calendar-week-agenda-heading" onclick="selectCalendarWeekDay(\'' + date + '\')"><span><small>' + dayNames[day.index] + '</small><strong>' + d.getDate() + '. ' + monthShort[d.getMonth()] + '</strong></span><span class="calendar-week-agenda-title">' + escapeHtml(dayName) + '</span><i data-lucide="chevron-down"></i></button>' +
            (eventLabels.length ? '<div class="calendar-week-event-labels">' + eventLabels.join('') + '</div>' : '') +
            '<div class="calendar-week-agenda-entries">' + (entries || '<p class="calendar-week-empty">Keine Einträge</p>') + '</div>' +
            '<div class="calendar-week-day-totals"><span>' + (data.durationTotal === null ? 'Trainingszeit —' : (data.durationComplete ? '' : '∼') + calendarFormatMinutes(data.durationTotal)) + '</span><span>' + (data.loadValue === null ? 'Load —' : 'Load ' + Math.round(data.loadValue)) + '</span></div></section>';
    }).join('');
    container.classList.remove('grid-cols-1', 'grid-cols-7', 'min-w-[900px]');
    container.innerHTML = strip + '<div class="calendar-week-agenda">' + sections + '</div>';
    globalThis.lucide?.createIcons?.();
}

export function toggleActivitySportFilter() {
    const panel = document.getElementById('activity-sport-filter-panel');
    const button = document.getElementById('activity-sport-filter-button');
    const opening = panel?.classList.contains('hidden');
    panel?.classList.toggle('hidden', !opening);
    button?.setAttribute('aria-expanded', String(Boolean(opening)));
}

export function setActivitySportFilter(sport, checked) {
    if (checked) selectedActivitySports.add(sport);
    else selectedActivitySports.delete(sport);
    renderListView();
}

export function clearActivitySportFilter() {
    selectedActivitySports.clear();
    renderListView();
}

export function renderListView() {
    const sportCatalog = getSportsCatalog();
    const container = document.getElementById('activity-list-items');
    const options = document.getElementById('activity-sport-filter-options');
    if (!container || !options) return;
    renderCalendarLegend();
    document.getElementById('calendar-period-title').textContent = 'Aktivitäten';
    const activities = [...(state.rawActivities || [])].sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    const sports = [...new Set(activities.map(act => act.type || 'Workout'))].sort((a,b) => {
        const al = sportCatalog[a]?.label || a, bl = sportCatalog[b]?.label || b;
        return al.localeCompare(bl, 'de');
    });
    options.innerHTML = sports.length ? sports.map(sport => {
        const label = sportCatalog[sport]?.label || sport;
        const checked = selectedActivitySports.has(sport) ? ' checked' : '';
        return '<label class="activity-filter-option"><input type="checkbox" value="' + escapeHtml(sport) + '"' + checked + ' onchange="setActivitySportFilter(this.value,this.checked)"><span>' + escapeHtml(label) + '</span></label>';
    }).join('') : '<p class="text-xs text-slate-500">Noch keine Sportarten vorhanden.</p>';
    const filtered = selectedActivitySports.size
        ? activities.filter(act => selectedActivitySports.has(act.type || 'Workout'))
        : activities;
    const count = document.getElementById('activity-list-count');
    if (count) count.textContent = filtered.length + ' von ' + activities.length + ' Aktivitäten';
    const button = document.getElementById('activity-sport-filter-button');
    if (button) {
        const activeCount = selectedActivitySports.size;
        const span = button.querySelector('span');
        if (span) span.textContent = activeCount ? 'Sportart (' + activeCount + ')' : 'Sportart filtern';
        button.classList.toggle('is-filtered', activeCount > 0);
    }
    if (!filtered.length) {
        container.innerHTML = '<div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-center text-xs text-slate-500">' +
            (activities.length ? 'Keine Aktivitäten für die ausgewählten Sportarten.' : 'Keine Aktivitäten in der Datenbank vorhanden.') + '</div>';
        globalThis.lucide?.createIcons?.();
        return;
    }
    container.innerHTML = filtered.map(act => {
        const mode = calendarDisplayMode();
        const activityColor = mode === 'training'
            ? (getTypeColorMap()[act.category || 'ga'] || getTypeColorMap().ga).color
            : (sportCatalog[act.type] || sportCatalog.Workout).color;
        const isStrength = act.type === 'WeightTraining' || act.category === 'strength';
        const telemetry = getGarminTelemetry(act);
        const telemetryHr = Array.isArray(telemetry?.hr) ? telemetry.hr.map(Number).filter(v => Number.isFinite(v) && v > 0) : [];
        const maxHr = Number(act.maxHr) > 0 ? Math.round(Number(act.maxHr)) : (telemetryHr.length ? Math.round(Math.max(...telemetryHr)) : null);
        const hrValues = [];
        if (act.hr != null && Number.isFinite(Number(act.hr))) hrValues.push('Ø ' + Math.round(Number(act.hr)) + ' bpm');
        if (maxHr != null) hrValues.push('max. ' + maxHr + ' bpm');
        const hrHtml = hrValues.length ? '<div class="text-slate-400">HF ' + hrValues.join(' · ') + '</div>' : '';
        const distanceHtml = !isStrength && act.distance != null && Number.isFinite(Number(act.distance)) ? ' · ' + formatKm(act.distance) + ' km' : '';
        const loadHtml = act.tss != null && Number.isFinite(Number(act.tss)) ? '<strong>' + Math.round(Number(act.tss)) + ' Load</strong>' : '';
        const durationHtml = act.duration != null && Number.isFinite(Number(act.duration)) ? '<span>' + Math.round(Number(act.duration)) + ' min' + distanceHtml + '</span>' : (distanceHtml ? '<span>' + distanceHtml.slice(3) + '</span>' : '');
        const metricsHtml = [loadHtml, durationHtml, hrHtml].filter(Boolean).join('');
        const id = encodeURIComponent(String(act.id)).replace(/'/g, '%27');
        return '<button type="button" onclick="openCSVDetailsModal(\'' + id + '\')" class="activity-list-row" style="--activity-color:' + activityColor + '">' +
            '<span class="activity-list-dot"></span><span class="activity-list-main"><span class="activity-list-date">' + formatDateDDMMYY(act.date) + ' · ' + escapeHtml(sportCatalog[act.type]?.label || act.type || 'Training') + '</span>' +
            '<strong>' + escapeHtml(act.name || 'Trainingseinheit') + '</strong></span><span class="activity-list-metrics">' + metricsHtml + '</span></button>';
    }).join('');
    globalThis.lucide?.createIcons?.();
}