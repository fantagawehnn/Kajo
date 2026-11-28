/* ============================================================
 * calendar.js – Kalender: Monats-, Wochen- und Listenansicht
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { getVisiblePlannedActivities } from './calendar-display-data.js';
import { getActivityGroupMembers, getVisibleActivities } from './activity-groups.js?v=1';
import { getTrainingLoadData } from './training-load.js?v=5';
import { getGarminTelemetry } from './data-source.js';
import { calculateReadiness } from './dashboard.js';
import { saveDataToLocalStorage, getUserLocalSetting, setUserLocalSetting } from './storage.js?v=6';
import { formatDateDDMMYY, sportsCatalog, typeColorMap, toLocalDateString, escapeHtml, formatKm, getSportsCatalog, getEnabledSportsCatalog, getTypeColorMap } from './utils.js?v=2';


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
 const duration=checkin?.garminSleepDuration;
 if(duration!=null){const h=Number(duration),color=h<7?'text-rose-400':h<=9?'text-emerald-400':'text-cyan-300';parts.push('<span class="'+color+'" title="Schlafdauer: '+escapeHtml(duration)+' Stunden">🌙 '+escapeHtml(duration)+' h</span>');}
 if(checkin?.garminSleepScore!=null){const score=Number(checkin.garminSleepScore),color=score<80?'text-rose-400':score<=90?'text-amber-300':'text-emerald-400';parts.push('<span class="'+color+'" title="Schlafscore: unter 80 rot, 80–90 gelb, über 90 grün">'+Math.round(score)+'</span>');}
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
 if(!lengths.length)return '';
 const periodLength=lengths[Math.floor(lengths.length/2)];
 const lastStart=new Date(starts[starts.length-1]+'T12:00:00');
 let nextStart=new Date(lastStart);nextStart.setDate(nextStart.getDate()+cycleLength);
 const todayDate=new Date(today+'T12:00:00');
 if(nextStart<=todayDate)return ''; // Bei überfälliger oder ausgebliebener Periode keine weitere Prognose fortschreiben.
 const expectedDay=Math.round((new Date(dateStr+'T12:00:00')-nextStart)/86400000)+1;
 if(expectedDay<1||expectedDay>periodLength)return '';
 return '<i data-lucide="droplet" title="Voraussichtlicher Periodentag '+expectedDay+' (geschätzt)" class="inline-block w-3 h-3 text-rose-300 ml-1 align-middle opacity-70 calendar-period-predicted"></i>';
}
function dayActivitySummary(dateStr){
 const out=[];
 const ready=calculateReadiness(dateStr);
 const metrics=state.dailyTimeline.find(x=>x.date===dateStr);
 if(ready.score!==null){const tone=ready.score>=80?'text-green-300 bg-green-950/40':ready.score>=60?'text-yellow-300 bg-yellow-950/40':ready.score>=40?'text-orange-300 bg-orange-950/40':ready.score>=20?'text-red-300 bg-red-950/40':'text-purple-300 bg-purple-950/40';out.push('<div class="rounded-lg p-2 '+tone+'"><b>Readiness:</b> '+ready.score+'/100 · objektiv '+(ready.objectiveScore??'—')+' · subjektiv '+(ready.subjectiveScore??'—')+'</div>');}
 if(metrics)out.push('<div class="bg-sky-950/40 rounded-lg p-2 text-sky-300"><b>Belastungskennzahlen:</b> CTL '+metrics.ctl+' · ATL '+metrics.atl+' · TSB '+metrics.tsb+' · ACWR '+(metrics.acwr??'—')+'</div>');
 state.rawActivities.filter(x=>x.date===dateStr).forEach(a=>out.push('<div><b>Aktivität:</b> '+escapeHtml(a.name)+' · '+(a.duration??'—')+' min · '+(a.distance==null?'—':formatKm(a.distance))+' km · '+(a.hr??'—')+' bpm · '+(a.tss??'—')+' Load'+(a.perceivedEffort!=null?' · Empfinden '+a.perceivedEffort+'/10':'')+' · sRPE '+(a.sRpeLoad??'—')+'</div>'));
 getVisiblePlannedActivities(state.plannedActivities, toLocalDateString()).filter(x=>x.date===dateStr).forEach(a=>out.push(a.type==='RestDay'?'<div><b>Geplant:</b> Ruhetag</div>':'<div><b>Geplant:</b> '+escapeHtml(a.name)+' · '+(a.duration??'—')+' min · Ziel '+(a.targetTss??'—')+' Load</div>'));
 state.races.filter(x=>x.date===dateStr).forEach(a=>out.push('<div><b>Wettkampf:</b> '+escapeHtml(a.name)+' · Rang '+escapeHtml(a.prio||'—')+'</div>'));
 state.strengthLogs.filter(x=>x.date===dateStr).forEach(a=>out.push('<div><b>Kraft:</b> '+escapeHtml(a.exercise)+' · '+a.sets+' × '+a.reps+' · '+a.weight+' kg · RPE '+a.rpe+'</div>'));
 return out.length?out.join(''):'<span class="text-slate-500">Keine Aktivitäten oder Einheiten erfasst.</span>';
}
function dayNumber(value,min,max){if(value===''||value===null||value===undefined)return null;const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function selfMonitoringSliderMarkup(label,key,value,inverted=false){
 const v=Number.isFinite(Number(value))?Math.min(5,Math.max(1,Number(value))):3;
 return '<label class="kajo-selfmonitoring-question"><span class="flex items-center justify-between gap-2"><span class="text-sm font-medium text-slate-200">'+label+'</span><output id="day-'+key+'-value" class="text-xs font-semibold text-cyan-300">'+(value==null?'—':v+' / 5')+'</output></span><input id="day-'+key+'" class="kajo-color-slider '+(inverted?'kajo-slider-negative':'kajo-slider-positive')+'" type="range" min="1" max="5" step="1" value="'+v+'" data-touched="'+(value==null?'false':'true')+'" oninput="updateSelfMonitoringSlider(this)"></label>';
}
export function updateSelfMonitoringSlider(input){
 if(!input)return;
 const min=Number(input.min||1),max=Number(input.max||5),value=Number(input.value);
 const percent=((value-min)/(max-min))*100;
 input.style.setProperty('--slider-progress',percent+'%');
 input.dataset.touched='true';
 const output=document.getElementById(input.id+'-value');
 if(output)output.textContent=value+' / '+max;
}
export function openDayEditor(dateStr){
 const modal=document.getElementById('day-detail-modal');
 if(modal&&modal.parentElement!==document.body)document.body.appendChild(modal);
 if(modal){modal.style.zIndex='2147483005';document.body.classList.add('kajo-modal-open');}
 const r=state.dailyCheckins[dateStr]||{},h=state.healthLogs[dateStr]||{},cy=r.cycle||{};
 document.getElementById('day-edit-date').value=dateStr;
 document.getElementById('day-detail-title').textContent='Self-Monitoring · '+formatDateDDMMYY(dateStr);
 const subj=[['Schlafqualität','sleepQuality',false],['Muskelkater','soreness',true],['Müdigkeit','fatigue',true],['Motivation','motivation',false],['Stress','stress',true]];
 document.getElementById('day-subjective-fields').innerHTML=subj.map(([label,key,inverted])=>selfMonitoringSliderMarkup(label,key,r[key],inverted)).join('');
 subj.forEach(([,key])=>{const el=document.getElementById('day-'+key);if(el)updateSelfMonitoringSlider(el);if(el&&r[key]==null){el.dataset.touched='false';const out=document.getElementById(el.id+'-value');if(out)out.textContent='—';}});
 document.getElementById('day-weight').value=r.weight??'';
 const sick=h.status==='sick';
 document.getElementById('day-sick').checked=sick;
 document.getElementById('day-health-diagnosis').value=sick?(h.diagnosis||''):'';
 const severity=Number.isFinite(Number(h.severity))?Math.min(5,Math.max(1,Number(h.severity))):3;
 document.getElementById('day-sick-severity').value=severity;
 document.getElementById('day-sick-severity').dataset.touched=h.severity!=null?'true':'false';
 document.getElementById('day-sick-severity-value').textContent=(h.severity??severity)+' / 5';
 toggleDaySickFields();
 const cycleEnabled=state.profile?.gender==='female'&&state.profile?.cycleTrackingEnabled===true;
 document.getElementById('day-period').checked=cy.period===true;
 document.getElementById('day-cycle-pain').value=Math.min(5,Math.max(1,Number(cy.pain??1)));
 document.getElementById('day-cycle-pain').dataset.touched=cy.pain!=null?'true':'false';
 document.getElementById('day-cycle-pain-value').textContent=(cy.pain==null?'1':String(cy.pain))+' / 5';
 document.getElementById('day-cycle-section')?.classList.toggle('hidden',!cycleEnabled);
 document.getElementById('day-period').closest('.space-y-2')?.classList.toggle('hidden',!cycleEnabled);
 toggleDayCycleFields();
 ['day-sick-severity','day-cycle-pain'].forEach(id=>updateSelfMonitoringSlider(document.getElementById(id)));
 if(document.getElementById('day-cycle-pain').dataset.touched==='false')document.getElementById('day-cycle-pain-value').textContent='—';
 document.getElementById('day-detail-modal').classList.remove('hidden');
}
export function toggleDaySickFields(){document.getElementById('day-sick-fields')?.classList.toggle('hidden',!document.getElementById('day-sick')?.checked);}
export function toggleDayCycleFields(){document.getElementById('day-cycle-fields')?.classList.toggle('hidden',!document.getElementById('day-period')?.checked);}
export function closeDayEditor(){const modal=document.getElementById('day-detail-modal');if(modal?.dataset.saving==='true')return;modal?.classList.add('hidden');document.body.classList.remove('kajo-modal-open');}
export function openHomeSelfMonitoring(){openDayEditor(toLocalDateString());}
export async function saveDayEditor(){
 const date=document.getElementById('day-edit-date').value;if(!date)return;
 const r={...(state.dailyCheckins[date]||{})};
 const subj=['sleepQuality','soreness','fatigue','motivation','stress'];
 for(const key of subj){const el=document.getElementById('day-'+key);if(el?.dataset.touched==='true')r[key]=dayNumber(el.value,1,5);}
 const weightRaw=document.getElementById('day-weight').value;
 if(weightRaw==='')delete r.weight;else{const weight=dayNumber(weightRaw,20,300);if(weight===null){alert('Bitte prüfe dein Körpergewicht.');return;}r.weight=weight;}
 const periodEnabled=state.profile?.gender==='female'&&state.profile?.cycleTrackingEnabled===true;
 if(periodEnabled&&document.getElementById('day-period').checked){
  const pain=dayNumber(document.getElementById('day-cycle-pain').value,1,5);
  r.cycle={...(r.cycle||{}),period:true,pain:pain??1};
 }else if(periodEnabled&&r.cycle){delete r.cycle.period;delete r.cycle.pain;if(!Object.keys(r.cycle).length)delete r.cycle;}
 state.dailyCheckins[date]=r;
 const sick=document.getElementById('day-sick').checked;
 const previousHealth=state.healthLogs[date]||{};
 if(sick){
  const health={...previousHealth,status:'sick',diagnosis:document.getElementById('day-health-diagnosis').value.trim()||'Erkrankung'};
  const severity=document.getElementById('day-sick-severity');
  if(severity?.dataset.touched==='true')health.severity=dayNumber(severity.value,1,5);
  state.healthLogs[date]=health;
 }else if(previousHealth.status==='sick'){delete state.healthLogs[date];}

 // Der lokale Speicher ist der verbindliche erste Schritt. saveDataToLocalStorage
 // schreibt den Snapshot synchron in den lokalen Cache und reiht die dauerhafte
 // IndexedDB-Sicherung ein. Das data-saved-Ereignis stößt den Cloud-Abgleich
 // unabhängig davon im Hintergrund an.
 const localSaved=saveDataToLocalStorage();
 if(!localSaved){
  const saveStatus=document.getElementById('day-save-status');
  if(saveStatus)saveStatus.textContent='Nicht gespeichert: Dein lokaler Benutzerspeicher ist nicht aktiv. Bitte melde dich erneut an.';
  return;
 }

 // Nicht auf die Cloud warten: Auch offline oder bei Cloud-Fehlern bleibt
 // der Check-in lokal erhalten und das Eingabefenster schließt sofort.
 closeDayEditor();
 refreshAll();
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
    else html += periodCalendarMarker(date);
    if (health?.status === 'sick') html += '<i data-lucide="thermometer" class="calendar-event-icon calendar-event-sick" title="Krankheit" aria-label="Krankheit"></i>';
    if (health?.status === 'injured') html += '<i data-lucide="bandage" class="calendar-event-icon calendar-event-injured" title="Verletzung" aria-label="Verletzung"></i>';
    return html;
}
function calendarDateData(date) {
    const activities = getVisibleActivities((state.rawActivities || []).filter(item => item.date === date));
    const planned = getVisiblePlannedActivities(state.plannedActivities, toLocalDateString()).filter(item => item.date === date);
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
function calendarDayRing(value, label, tone) {
    const display = value === null || value === undefined || value === '' ? '—' : escapeHtml(value);
    const color = 'var(--kajo-status-' + (tone || 'info') + ')';
    return '<div class="calendar-kpi-ring-wrap"><div class="calendar-kpi-ring" style="--calendar-ring-color:' + color + '"><span>' + display + '</span></div><div class="calendar-kpi-label">' + escapeHtml(label) + '</div></div>';
}
function calendarDayDurationValue(minutes) {
    if (!Number.isFinite(Number(minutes))) return '—';
    return (Math.max(0, Number(minutes)) / 60).toFixed(2).replace('.', ',');
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
    const color = calendarActivityColor(activity, sport);
    const id = encodeURIComponent(String(activity.id || '')).replace(/'/g, '%27');
    const time = calendarDayTime(activity.startTimeLocal || activity.start_time_local || activity.startTime || activity.time);
    const isRestDay=activity.type==='RestDay';
    const duration = activity.duration !== null && activity.duration !== undefined && activity.duration !== '' && Number.isFinite(Number(activity.duration)) ? Math.round(Number(activity.duration)) + ' min' : '';
    const status = isRestDay ? 'Ruhetag geplant' : planned ? 'Geplant' : 'Abgeschlossen';
    const action = planned
        ? 'openPlannedWorkoutModal(\'' + id + '\')'
        : 'openCSVDetailsModal(\'' + id + '\')';
    return '<button type="button" class="calendar-day-activity-row ' + (planned ? 'is-planned' : 'is-completed') + '" style="--activity-color:' + color + '" onclick="' + action + '">' +
        '<span class="calendar-day-activity-main"><span class="calendar-day-activity-sport">' + escapeHtml(sport.label + (activity.raceFormat ? ' · ' + activity.raceFormat : '')) + '</span>' +
        '<strong>' + escapeHtml(activity.name || (planned ? 'Geplante Einheit' : 'Trainingseinheit')) + '</strong>' +
        '<small>' + (isRestDay ? 'Keine Trainingseinheit geplant' : [time, duration, planned ? 'Planung' : calendarActivitySourceLabel(activity)].filter(Boolean).map(escapeHtml).join(' · ')) + '</small></span>' +
        '<span class="calendar-entry-status ' + (planned ? 'is-planned' : 'is-completed') + '">' + status + '</span></button>';
}

function calendarShiftDate(date, offset) {
    const shifted = new Date(date + 'T12:00:00');
    shifted.setDate(shifted.getDate() + offset);
    return toLocalDateString(shifted);
}
function calendarDayTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime()) && (raw.includes('T') || raw.includes(' '))) {
        return parsed.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    const match = raw.match(/(?:T|\s)?(\d{1,2}):(\d{2})/);
    return match ? String(match[1]).padStart(2, '0') + ':' + match[2] : '';
}
function calendarDayHasCheckin(checkin) {
    return ['sleepQuality','soreness','fatigue','motivation','stress','garminHrv','garminRhr','garminSleepDuration','garminSleepScore','garminRespiration','garminBodyBattery','garminStress','garminSpo2','garminSteps','garminFitnessAge','garminWeight','note']
        .some(key => checkin?.[key] !== null && checkin?.[key] !== undefined && checkin?.[key] !== '');
}
function calendarDayEvent(label, detail, time, kind) {
    return { label, detail, time: time || '', kind: kind || 'event' };
}
function renderCalendarDayDetail(date, target) {
    const root = typeof target === 'string' ? document.getElementById(target) : target;
    if (!root) return;
    const data = calendarDateData(date);
    const checkin = state.dailyCheckins?.[date] || {};
    const health = state.healthLogs?.[date] || null;
    const readiness = calculateReadiness(date);
    const completed = [...data.activities].sort((a, b) => calendarDayTime(a.startTimeLocal || a.start_time_local || a.startTime || a.time).localeCompare(calendarDayTime(b.startTimeLocal || b.start_time_local || b.startTime || b.time)));
    const planned = [...data.planned].sort((a, b) => calendarDayTime(a.startTimeLocal || a.start_time_local || a.startTime || a.time).localeCompare(calendarDayTime(b.startTimeLocal || b.start_time_local || b.startTime || b.time)));
    const strength = (state.strengthLogs || []).filter(item => item.date === date);
    const actualDurationKnown = data.durationRecords.reduce((sum, item) => sum + Number(item.duration), 0);
    const actualDuration = data.activities.length === 0 ? 0 : actualDurationKnown;
    const durationComplete = data.activities.length === 0 || data.durationComplete;
    const durationText = data.activities.length > 0 && data.durationRecords.length === 0 ? '—' : (durationComplete ? '' : '≈') + calendarDayDurationValue(actualDuration);
    const loadText = data.loadValue === null ? '—' : Number(data.loadValue).toFixed(0);
    const completedCount = data.activities.length;
    const readinessText = readiness.score === null ? '—' : String(readiness.score);
    const actualMarkup = completed.length
        ? completed.map(item => calendarActivityRow(item, false)).join('')
        : '<div class="calendar-empty-state">Noch keine absolvierte Trainingseinheit dokumentiert.</div>';
    const plannedMarkup = planned.map(item => calendarActivityRow(item, true)).join('');
    const recoveryMetrics = [];
    const addRecovery = (label, value, tone = 'info') => {
        if (value === null || value === undefined || value === '') return;
        recoveryMetrics.push(calendarDayRing(String(value), label, tone));
    };
    const sleepDuration = checkin.garminSleepDuration;
    const bodyBattery = checkin.garminBodyBattery;
    const sleepHours = Number(sleepDuration), sleepScore = Number(checkin.garminSleepScore), batteryScore = Number(bodyBattery);
    addRecovery('Schlaf', sleepDuration, Number.isFinite(sleepHours) ? (sleepHours >= 7 && sleepHours <= 9 ? 'good' : sleepHours < 7 ? 'critical' : 'attention') : 'info');
    addRecovery('HRV', checkin.garminHrv ?? (checkin.measurementSources?.hrv?.source === 'garmin' ? checkin.hrv : null));
    addRecovery('Ruhepuls', checkin.garminRhr);
    addRecovery('Schlafscore', checkin.garminSleepScore, Number.isFinite(sleepScore) ? (sleepScore >= 90 ? 'good' : sleepScore >= 80 ? 'attention' : 'critical') : 'info');
    addRecovery('Body Battery', bodyBattery, Number.isFinite(batteryScore) ? (batteryScore >= 70 ? 'good' : batteryScore >= 40 ? 'attention' : 'critical') : 'info');
    const subjective = [
        ['Schlafqualität', checkin.sleepQuality], ['Müdigkeit', checkin.fatigue],
        ['Muskelkater', checkin.soreness], ['Motivation', checkin.motivation], ['Stress', checkin.stress]
    ].filter(([, value]) => value !== null && value !== undefined && value !== '');
    const healthValue = health?.status === 'sick' ? 'Krank' : health?.status === 'injured' ? 'Verletzt' : '—';
    const healthTone = health?.status === 'sick' ? 'critical' : health?.status === 'injured' ? 'attention' : 'info';
    if (health?.status) recoveryMetrics.push(calendarDayRing(healthValue, 'Gesundheit', healthTone));
    const subjectiveMarkup = subjective.length
        ? '<div class="calendar-day-subjective">' + subjective.map(([label, value]) => '<span>' + escapeHtml(label) + ' <b>' + escapeHtml(value) + '</b></span>').join('') + '</div>'
        : '';
    const recoveryMarkup = '<div class="calendar-day-recovery-rings">' + recoveryMetrics.join('') + '</div>' + subjectiveMarkup;

    const timelineEvents = [
        ...completed.map(item => calendarDayEvent(
            item.name || 'Trainingseinheit',
            calendarSport(item.type).label + (item.raceFormat ? ' · ' + item.raceFormat : ''),
            calendarDayTime(item.startTimeLocal || item.start_time_local || item.startTime || item.time),
            'completed'
        )),
        ...planned.map(item => calendarDayEvent(
            item.name || 'Geplante Einheit',
            calendarSport(item.type).label,
            calendarDayTime(item.startTimeLocal || item.start_time_local || item.startTime || item.time),
            'planned'
        )),
        ...(health?.status === 'sick' || health?.status === 'injured'
            ? [calendarDayEvent(health.status === 'sick' ? 'Krankheit dokumentiert' : 'Verletzung dokumentiert', health.diagnosis || '', '', 'health')]
            : []),
        ...(checkin.cycle?.period === true
            ? [calendarDayEvent('Menstruation dokumentiert', 'Als Gesundheitseintrag erfasst', '', 'health')]
            : []),
        ...data.races.map(item => calendarDayEvent(item.name || 'Wettkampf', item.result || item.prio || '', calendarDayTime(item.startTimeLocal || item.start_time_local || item.startTime || item.time), 'race')),
        ...strength.map(item => calendarDayEvent(
            item.exercise || 'Krafttraining',
            [item.sets, item.reps, item.weight != null ? item.weight + ' kg' : null].filter(value => value != null && value !== '').join(' × '),
            calendarDayTime(item.startTimeLocal || item.start_time_local || item.startTime || item.time),
            'completed'
        ))
    ].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const timelineMarkup = timelineEvents.map(item =>
        '<div class="calendar-day-timeline-item is-' + item.kind + '">' +
            '<time class="calendar-day-timeline-time">' + escapeHtml(item.time || '—') + '</time>' +
            '<span class="calendar-day-timeline-dot" aria-hidden="true"></span>' +
            '<span class="calendar-day-timeline-copy"><strong>' + escapeHtml(item.label) + '</strong>' +
            (item.detail ? '<small>' + escapeHtml(item.detail) + '</small>' : '') +
            '</span></div>'
    ).join('');
    const timelineSection = timelineEvents.length
        ? '<section class="calendar-detail-section"><div class="calendar-detail-heading"><h3>Tagesverlauf</h3></div><div class="calendar-day-timeline">' + timelineMarkup + '</div></section>'
        : '';

    const note = String(checkin.note || '').trim();
    const diaryButton = '<button type="button" class="calendar-day-diary-button" title="' + (note ? 'Tagesnotiz bearbeiten' : 'Tagesnotiz erfassen') + '" aria-label="' + (note ? 'Tagesnotiz bearbeiten' : 'Tagesnotiz erfassen') + '" onclick="openDailyNote(\'' + escapeHtml(date) + '\')"><i data-lucide="book-heart"></i></button>';
    const plannedSection = planned.length
        ? '<section class="calendar-detail-section"><div class="calendar-detail-heading"><h3>Geplantes Training</h3></div><div class="calendar-day-activity-list">' + plannedMarkup + '</div></section>'
        : '';
    const noteSection = note
        ? '<section class="calendar-detail-section"><div class="calendar-detail-heading"><h3>Tagesreflexion</h3></div><p class="calendar-day-note-preview">' + escapeHtml(note) + '</p></section>'
        : '';

    root.innerHTML =
        '<div class="calendar-day-topline"><section class="calendar-day-kpis" aria-label="Tageskennzahlen">' +
            calendarDayRing(loadText, 'Load', calendarLoadTone(data.timeline)) +
            calendarDayRing(durationText, 'Trainingsstunden', 'info') +
            calendarDayRing(String(completedCount), 'Einheiten', 'good') +
            calendarDayRing(readinessText, 'Recovery', calendarReadinessTone(readiness.score)) +
        '</section>' + diaryButton + '</div>' +
        '<section class="calendar-detail-section"><div class="calendar-detail-heading"><h3>Absolviertes Training</h3></div><div class="calendar-day-activity-list">' + actualMarkup + '</div></section>' +
        plannedSection +
        timelineSection +
        '<section class="calendar-day-recovery-section"><div class="calendar-detail-heading"><h3>Recovery & Gesundheit</h3></div>' + recoveryMarkup + '</section>' +
        noteSection;
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
export function toggleCalendarFormatMenu(){const menu=document.getElementById('calendar-format-menu'),button=document.getElementById('calendar-format-button');const opening=menu?.classList.contains('hidden');menu?.classList.toggle('hidden');button?.setAttribute('aria-expanded',String(Boolean(opening)));}
export function closeCalendarFormatMenu(){document.getElementById('calendar-format-menu')?.classList.add('hidden');document.getElementById('calendar-format-button')?.setAttribute('aria-expanded','false');}
function calendarSeason(){const settings=state.settings||{},seasons=Array.isArray(settings.calendarSeasons)?settings.calendarSeasons:[],selected=seasons.find(item=>item.id===settings.activeCalendarSeasonId)||seasons.at(-1)||settings.calendarSeason;return selected&&/^\d{4}-\d{2}-\d{2}$/.test(selected.start||'')&&/^\d{4}-\d{2}-\d{2}$/.test(selected.end||'')&&selected.start<=selected.end?selected:null;}
export function openCalendarHealthCreate(){window.openHealthLogForDate?.(state.selectedCalendarDay||toLocalDateString(state.currentCalendarDate));}
export function openCalendarPeriodCreate(){
 const date=state.selectedCalendarDay||toLocalDateString(state.currentCalendarDate);
 const start=document.getElementById('period-range-start'),end=document.getElementById('period-range-end');
 if(start)start.value=date;
 if(end)end.value=date;
 const modal=document.getElementById('calendar-period-modal');
 if(modal){modal.classList.remove('hidden');modal.classList.add('flex');document.body.classList.add('kajo-modal-open');}
}
export function closeCalendarPeriodCreate(){
 const modal=document.getElementById('calendar-period-modal');
 modal?.classList.add('hidden');modal?.classList.remove('flex');
 document.body.classList.remove('kajo-modal-open');
}
function eachPeriodDate(start,end,callback){
 const current=new Date(start+'T12:00:00'),last=new Date(end+'T12:00:00');
 while(current<=last){callback(toLocalDateString(current));current.setDate(current.getDate()+1);}
}
export function saveCalendarPeriod(){
 const start=document.getElementById('period-range-start')?.value||'';
 const end=document.getElementById('period-range-end')?.value||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)){alert('Bitte wähle einen gültigen Start- und Endtag.');return;}
 if(start>end){alert('Der Starttag darf nicht nach dem Endtag liegen.');return;}
 eachPeriodDate(start,end,date=>{
  const entry={...(state.dailyCheckins[date]||{})};
  entry.cycle={...(entry.cycle||{}),period:true};
  state.dailyCheckins[date]=entry;
 });
 saveDataToLocalStorage();closeCalendarPeriodCreate();refreshAll();
}
export function removeCalendarPeriodRange(){
 const start=document.getElementById('period-range-start')?.value||'';
 const end=document.getElementById('period-range-end')?.value||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end){alert('Bitte wähle einen gültigen Zeitraum.');return;}
 eachPeriodDate(start,end,date=>{
  const entry=state.dailyCheckins[date];
  if(!entry?.cycle)return;
  const cycle={...entry.cycle};delete cycle.period;
  if(Object.keys(cycle).length)entry.cycle=cycle;else delete entry.cycle;
  if(Object.keys(entry).length)state.dailyCheckins[date]=entry;else delete state.dailyCheckins[date];
 });
 saveDataToLocalStorage();closeCalendarPeriodCreate();refreshAll();
}

export function setCalendarFormat(fmt) {
    const nextFormat = fmt==='season'&&calendarSeason()?'season':(['day','week','month','year','activities'].includes(fmt)?fmt:'week');
    closeCalendarFormatMenu();
    state.activeCalendarFormat = nextFormat;
    ['day', 'week', 'month', 'year', 'activities', 'season'].forEach(f => {
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
    if(state.activeCalendarFormat==='season')return;
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

function calendarActivityColor(activity, sport = calendarSport(activity?.type)) {
    if (calendarDisplayMode() === 'training') {
        const categories = getTypeColorMap();
        return categories[activity?.category || 'ga']?.color || categories.ga?.color || sport?.color || '#64748b';
    }
    return sport?.color || '#64748b';
}

function calendarActivityColorLabel(activity, sport = calendarSport(activity?.type)) {
    if (calendarDisplayMode() === 'training') return calendarTrainingLabel(activity, getTypeColorMap());
    return sport?.label || activity?.type || 'Training';
}

function renderCalendarDisplayModeControl() {
    const mode = calendarDisplayMode();
    [['sport', 'calendar-color-mode-sport'], ['training', 'calendar-color-mode-training']].forEach(([value, id]) => {
        const button = document.getElementById(id);
        if (!button) return;
        const active = mode === value;
        button.classList.toggle('bg-cyan-500/15', active);
        button.classList.toggle('border-cyan-500', active);
        button.classList.toggle('text-cyan-200', active);
        button.classList.toggle('border-slate-700', !active);
        button.classList.toggle('text-slate-300', !active);
        button.setAttribute('aria-pressed', String(active));
    });
}

export function setCalendarDisplayMode(mode) {
    state.calendarDisplayMode = mode === 'training' ? 'training' : 'sport';
    try { setUserLocalSetting('calendarDisplayMode', state.calendarDisplayMode); }
    catch (error) { console.warn('Kalenderanzeige konnte nicht gespeichert werden:', error); }
    renderCalendar();
}

function renderCalendarLegend() {
    const el = document.getElementById('calendar-legend');
    const footer = el?.closest('.calendar-footer');
    if (!el) return;
    const format = state.activeCalendarFormat;
    const showLegend = format === 'month';
    if (footer) footer.classList.toggle('hidden', !showLegend);
    if (!showLegend) { el.innerHTML = ''; return; }

    const prefix = state.currentCalendarDate.getFullYear() + '-' + String(state.currentCalendarDate.getMonth() + 1).padStart(2, '0') + '-';
    const activities = (state.rawActivities || []).filter(item => String(item.date || '').startsWith(prefix));
    const planned = getVisiblePlannedActivities(state.plannedActivities, toLocalDateString()).filter(item => String(item.date || '').startsWith(prefix));
    const dates = [];
    for (let day = 1; day <= new Date(state.currentCalendarDate.getFullYear(), state.currentCalendarDate.getMonth() + 1, 0).getDate(); day++) {
        dates.push(prefix + String(day).padStart(2, '0'));
    }
    const catalog = getSportsCatalog();
    const items = calendarDisplayMode() === 'training'
        ? [...new Set([...activities, ...planned].map(item => item.category || 'ga'))].map(category => {
            const config = getTypeColorMap()[category] || getTypeColorMap().ga;
            return '<span class="calendar-legend-item"><span class="calendar-legend-dot" style="background:' + config.color + '"></span>' + escapeHtml(config.label || category) + '</span>';
        })
        : [...new Set([...activities, ...planned].map(item => item.type || 'Workout'))].map(type => {
            const sport = catalog[type] || catalog.Workout;
            return '<span class="calendar-legend-item"><span class="calendar-legend-dot" style="background:' + sport.color + '"></span>' + escapeHtml(sport.label || type) + '</span>';
        });
    if (activities.length) items.push('<span class="calendar-legend-item"><span class="calendar-entry-status is-completed">●</span>Abgeschlossen</span>');
    if (planned.length) items.push('<span class="calendar-legend-item"><span class="calendar-entry-status is-planned">○</span>Geplant</span>');
    if ((state.races || []).some(item => dates.includes(item.date))) items.push('<span class="calendar-legend-item"><i data-lucide="trophy" class="calendar-event-icon calendar-event-race"></i>Wettkampf</span>');
    if (dates.some(date => state.dailyCheckins?.[date]?.cycle?.period === true)) items.push('<span class="calendar-legend-item"><i data-lucide="droplet" class="calendar-event-icon calendar-event-cycle"></i>Menstruation</span>');
    if (dates.some(date => state.healthLogs?.[date]?.status === 'sick')) items.push('<span class="calendar-legend-item"><i data-lucide="thermometer" class="calendar-event-icon calendar-event-sick"></i>Krankheit</span>');
    if (dates.some(date => state.healthLogs?.[date]?.status === 'injured')) items.push('<span class="calendar-legend-item"><i data-lucide="bandage" class="calendar-event-icon calendar-event-injured"></i>Verletzung</span>');
    el.innerHTML = items.join('');
    globalThis.lucide?.createIcons?.();
}

function updateCalendarPeriodTitle(format) {
    const title = document.getElementById('calendar-period-title');
    const picker = document.getElementById('calendar-period-picker');
    if (!title) return;
    const date = new Date(state.currentCalendarDate);
    if (format === 'day') title.textContent = new Intl.DateTimeFormat('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(date);
    else if (format === 'week') {
        const monday = new Date(date);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);
        const jan4 = new Date(thursday.getFullYear(), 0, 4, 12), firstMonday = new Date(jan4);
        firstMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
        const weekNo = Math.floor((thursday - firstMonday) / 604800000) + 1;
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        const fmt = value => String(value.getDate()).padStart(2,'0') + '.' + String(value.getMonth()+1).padStart(2,'0');
        title.textContent = 'KW ' + weekNo + ' · ' + fmt(monday) + '–' + fmt(sunday) + '.' + sunday.getFullYear();
    } else if (format === 'month') title.textContent = new Intl.DateTimeFormat('de-DE', { month:'long', year:'numeric' }).format(date);
    else if (format === 'year') title.textContent = String(date.getFullYear());
    else if(format==='season'){const season=calendarSeason();title.textContent=season?(season.name||'Saison'):'Saison';}
    else title.textContent = 'Aktivitäten';
    if (picker) picker.disabled = format === 'activities'||format==='season';
}
export function openCalendarPeriodPicker() {
    const picker = document.getElementById('calendar-period-picker');
    if (!picker || state.activeCalendarFormat === 'activities') return;
    picker.value = toLocalDateString(state.currentCalendarDate);
    try { if (typeof picker.showPicker === 'function') picker.showPicker(); else { picker.focus(); picker.click(); } }
    catch { picker.focus(); picker.click(); }
}
export function applyCalendarPeriodDate(value) {
    if (!value) return;
    const selected = new Date(value + 'T12:00:00');
    if (!Number.isFinite(selected.getTime())) return;
    if (state.activeCalendarFormat === 'week') selected.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
    state.currentCalendarDate = selected;
    state.selectedCalendarDay = state.activeCalendarFormat === 'day' ? value : null;
    renderCalendar();
}

export function renderCalendar() {
    renderCalendarDisplayModeControl();
    const formats = ['day', 'week', 'month', 'year', 'activities', 'season'];
    if(state.activeCalendarFormat==='season'&&!calendarSeason())state.activeCalendarFormat='month';
    const format = formats.includes(state.activeCalendarFormat) ? state.activeCalendarFormat : 'month';
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
    document.getElementById('cal-format-season')?.classList.toggle('hidden', format !== 'season');
    document.getElementById('cal-format-list')?.classList.toggle('hidden', format !== 'activities');
    const labels={day:'Tag',week:'Woche',month:'Monat',year:'Jahr',season:'Saison',activities:'Aktivitäten'};
    const label=document.getElementById('calendar-format-label');if(label)label.textContent=labels[format]||'Woche';
    const option=document.getElementById('calendar-season-format-option');if(option)option.classList.toggle('hidden',!calendarSeason());
    document.querySelectorAll('[data-calendar-format]').forEach(button=>{const active=button.dataset.calendarFormat===format;button.classList.toggle('active',active);button.setAttribute('aria-checked',String(active));});
    const activities = format === 'activities';
    ['calendar-period-prev', 'calendar-period-next'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', activities||format==='season'));
    document.getElementById('calendar-add-button')?.classList.toggle('hidden', activities);
    renderCalendarLegend();
    if (format === 'day') renderCalendarDayDetail(toLocalDateString(state.currentCalendarDate), 'cal-format-day');
    else if (format === 'week') renderWeekView();
    else if (format === 'month') renderMonthView();
    else if (format === 'year') renderYearView();
    else if(format==='season')renderSeasonView();
    else renderListView();
    updateCalendarPeriodTitle(format);
    installCalendarGestures();
}

function renderSeasonView(){
    const root=document.getElementById('cal-format-season'),season=calendarSeason();if(!root||!season)return;
    const from=season.start,to=season.end,events=new Map();
    const add=(date,type,item)=>{if(!date||date<from||date>to||!type)return;const list=events.get(date)||[];list.push({type,item});events.set(date,list);};
    (state.rawActivities||[]).forEach(x=>add(x.date,'activity',x));getVisiblePlannedActivities(state.plannedActivities, toLocalDateString()).forEach(x=>add(x.date,'planned',x));(state.races||[]).forEach(x=>add(x.date,'race',x));
    Object.entries(state.healthLogs||{}).forEach(([date,x])=>add(date,x.status==='sick'?'sick':x.status==='injured'?'injured':null,x));
    Object.entries(state.dailyCheckins||{}).forEach(([date,x])=>{if(x.cycle?.period===true)add(date,'period',x);});
    if(state.profile?.gender==='female'&&state.profile?.cycleTrackingEnabled===true){const cursor=new Date(from+'T12:00:00'),last=new Date(to+'T12:00:00');for(;cursor<=last;cursor.setDate(cursor.getDate()+1)){const date=toLocalDateString(cursor);if(periodCalendarMarker(date).includes('geschätzt'))add(date,'period-predicted',{});}}
    const fmt=d=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00'));
    const icons={activity:'activity',planned:'calendar-clock',race:'trophy',sick:'thermometer',injured:'bandage',period:'droplet','period-predicted':'droplet'},labels={activity:'Training',planned:'Geplant',race:'Wettkampf',sick:'Krankheit',injured:'Verletzung',period:'Periode','period-predicted':'Periode (Prognose)'};
    const grouped=new Map();[...events.keys()].sort().forEach(date=>{const key=date.slice(0,7),list=grouped.get(key)||[];list.push({date,items:events.get(date)});grouped.set(key,list);});
    const months=[...grouped.entries()].map(([key,days])=>{const [y,m]=key.split('-').map(Number);const title=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m-1,1,12));return '<section class="calendar-season-month"><h3>'+title+'</h3>'+days.map(({date,items})=>'<div class="calendar-season-event"><time>'+fmt(date)+'</time><span>'+items.map(x=>'<i data-lucide="'+icons[x.type]+'" class="calendar-season-event-icon is-'+x.type+'"></i>'+labels[x.type]+(x.item?.name?' · '+escapeHtml(x.item.name):'')).join(' · ')+'</span></div>').join('')+'</section>';}).join('');
    const count=arr=>arr.filter(x=>x.date>=from&&x.date<=to).length;
    root.innerHTML='<div class="calendar-season-heading"><div><p>DEFINIERTER ZEITRAUM</p><h2>'+escapeHtml(season.name||'Saison')+'</h2><span>'+fmt(from)+' – '+fmt(to)+'</span></div><div class="calendar-season-stats"><span><strong>'+count(state.rawActivities||[])+'</strong>Training</span><span><strong>'+count(getVisiblePlannedActivities(state.plannedActivities, toLocalDateString()))+'</strong>Geplant</span><span><strong>'+count(state.races||[])+'</strong>Wettkämpfe</span></div></div>'+(months||'<p class="calendar-season-empty">In diesem Saisonzeitraum sind noch keine Ereignisse erfasst.</p>');
    globalThis.lucide?.createIcons?.();
}
let calendarGestureInstalled=false,calendarPinchStart=0,calendarWheelLocked=false;
function calendarFormatZoomStep(direction){const sequence=['day','week','month','year'];if(calendarSeason())sequence.push('season');const i=sequence.indexOf(state.activeCalendarFormat);if(i<0)return;const next=Math.max(0,Math.min(sequence.length-1,i+(direction>0?-1:1)));if(next!==i)setCalendarFormat(sequence[next]);}
function installCalendarGestures(){
    if(calendarGestureInstalled)return;const root=document.getElementById('view-calendar');if(!root)return;calendarGestureInstalled=true;
    root.addEventListener('touchstart',e=>{if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;calendarPinchStart=Math.hypot(dx,dy);}},{passive:true});
    root.addEventListener('touchend',e=>{if(e.touches.length<2)calendarPinchStart=0;},{passive:true});
    root.addEventListener('touchmove',e=>{if(e.touches.length!==2||!calendarPinchStart)return;const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY,scale=Math.hypot(dx,dy)/calendarPinchStart;e.preventDefault();if(scale>1.28){calendarPinchStart=0;calendarFormatZoomStep(1);}else if(scale<.78){calendarPinchStart=0;calendarFormatZoomStep(-1);}},{passive:false});
    root.addEventListener('wheel',e=>{if(!e.ctrlKey||calendarWheelLocked)return;e.preventDefault();calendarWheelLocked=true;calendarFormatZoomStep(e.deltaY<0?1:-1);setTimeout(()=>calendarWheelLocked=false,350);},{passive:false});
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
        const clusters = [];
        races.forEach(race => {
            const current = clusters[clusters.length - 1];
            const raceDate = new Date(race.date + 'T12:00:00');
            const gap = current ? Math.round((raceDate - new Date(current.end + 'T12:00:00')) / 86400000) : Infinity;
            if (!current || gap > 14) clusters.push({ start: race.date, end: race.date, count: 1 });
            else { current.end = race.date; current.count++; }
        });
        clusters.forEach((cluster, index) => {
            const startDate = new Date(cluster.start + 'T12:00:00');
            const endDate = new Date(cluster.end + 'T12:00:00');
            startDate.setDate(startDate.getDate() - 7);
            endDate.setDate(endDate.getDate() + 2);
            const start = toLocalDateString(startDate) < year + '-01-01' ? year + '-01-01' : toLocalDateString(startDate);
            const end = toLocalDateString(endDate) > year + '-12-31' ? year + '-12-31' : toLocalDateString(endDate);
            suggestions.push({
                id: 'race-' + start + '-' + end, name: 'Wettkampfphase' + (clusters.length > 1 ? ' ' + (index + 1) : ''), type: 'competition',
                start, end, reason: cluster.count + ' dokumentierte Wettkampf' + (cluster.count === 1 ? 'stermin' : 'stermine') + ' in diesem Zeitraum. Die vorgeschlagene Phase umfasst sieben Tage davor und zwei Tage danach; bitte prüfen.'
            });
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
    const yearTimelineModes = [...new Set([...timelineByDate.values()].filter(item => ['complete', 'confirmed-rest'].includes(item.dataStatus)).map(item => item.loadMode).filter(Boolean))];
    const yearLoadModeConsistent = yearTimelineModes.length === 1 && yearTimelineModes[0] !== 'garmin-unavailable';
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
        const plannedActivities = getVisiblePlannedActivities(state.plannedActivities, toLocalDateString()).filter(item => item?.date >= yearStart && item?.date <= yearEnd && item.date >= start && item.date <= end);
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
        const loadStatus = loadKnown && loadModes.length === 1 && yearLoadModeConsistent && loadModes[0] === yearTimelineModes[0]
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
        const trainingMode = calendarDisplayMode() === 'training';
        const trainingGroups = {};
        if (trainingMode) week.activities.forEach(item => {
            const key = item.category || 'ga';
            if (!trainingGroups[key]) trainingGroups[key] = { category: key, minutes: 0, count: 0 };
            trainingGroups[key].count++;
            if (Number.isFinite(Number(item.duration)) && Number(item.duration) > 0) trainingGroups[key].minutes += Number(item.duration);
        });
        const segmentData = trainingMode ? Object.values(trainingGroups) : Object.values(week.bySport);
        const segments = segmentData.map(data => {
            const sport = trainingMode ? null : (catalog[data.type] || catalog.Workout);
            const category = trainingMode ? (getTypeColorMap()[data.category] || getTypeColorMap().ga) : null;
            const color = trainingMode ? category.color : sport.color;
            const label = trainingMode ? (category.label || data.category) : sport.label + (data.format ? ' · ' + data.format : '');
            const width = week.totalMinutes > 0 ? Math.max(3, data.minutes / week.totalMinutes * 100) : 0;
            const sourceClass = trainingMode ? '' : data.source === 'Manuell' ? 'is-source-manual' : data.source.includes('Intervals') ? 'is-source-intervals' : data.source.includes('Dateiimport') ? 'is-source-file' : data.source.includes('Garmin') ? 'is-source-garmin' : 'is-source-unknown';
            const detail = trainingMode ? data.count + ' Einheiten' : data.source;
            return '<span class="calendar-year-sport-segment ' + sourceClass + '" style="width:' + width + '%;background:' + color + '" title="' + escapeHtml(label) + ' · ' + escapeHtml(detail) + ': ' + (data.minutes ? Math.round(data.minutes) + ' min dokumentiert' : 'Dauer nicht verfügbar') + '"></span>';
        }).join('');
        const plannedGroups = {};
        if (trainingMode) week.plannedActivities.forEach(item => { const key = item.category || 'ga'; plannedGroups[key] = (plannedGroups[key] || 0) + 1; });
        const plannedSegments = trainingMode
            ? Object.entries(plannedGroups).map(([category, count]) => '<span class="calendar-year-planned-segment" style="border-color:' + (getTypeColorMap()[category]?.color || getTypeColorMap().ga.color) + '" title="' + escapeHtml(getTypeColorMap()[category]?.label || category) + ' · ' + count + ' geplant"></span>').join('')
            : Object.entries(week.plannedBySport).map(([type, count]) => '<span class="calendar-year-planned-segment" style="border-color:' + (catalog[type]?.color || catalog.Workout.color) + '" title="' + escapeHtml(catalog[type]?.label || type) + ' · ' + count + ' geplant"></span>').join('');
        const hours = !week.activities.length || (!week.durationComplete && week.totalMinutes === 0) ? '—' : calendarYearFormatHours(week.totalMinutes, !week.durationComplete);
        const events = (week.races.length ? '<i data-lucide="trophy" class="calendar-year-event calendar-event-race" title="Wettkampf"></i>' : '') +
            (week.cycle.length ? '<i data-lucide="droplet" class="calendar-year-event calendar-event-cycle" title="Menstruation erfasst"></i>' : '') +
            (week.health.some(item => item[1]?.status === 'sick') ? '<i data-lucide="thermometer" class="calendar-year-event calendar-event-sick" title="Krankheit"></i>' : '') +
            (week.health.some(item => item[1]?.status === 'injured') ? '<i data-lucide="bandage" class="calendar-year-event calendar-event-injured" title="Verletzung"></i>' : '');
        const loadColor = week.loadStatus === 'complete' ? calendarYearLoadColor(week.loadValue, thresholds) : 'var(--color-surface-subtle,#1c2835)';
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
    const annualLoadComplete = yearLoadModeConsistent && elapsedYearDates.length > 0 && annualLoadEntries.every(item => item && ['complete', 'confirmed-rest'].includes(item.dataStatus) && Number.isFinite(Number(item.load)));
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
    const kpiMarkup = kpis.map((item, index) => '<article class="calendar-year-kpi"><div class="calendar-year-kpi-ring calendar-kpi-ring" style="--calendar-ring-color:' + ['var(--kajo-status-info)','var(--kajo-status-good)','var(--kajo-status-attention)','var(--kajo-status-critical)'][index] + '"><span>' + escapeHtml(item.value) + '</span></div><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.note) + '</small></article>').join('');

    const months = Array.from({ length: 12 }, (_, month) => {
        const monthStart = year + '-' + String(month + 1).padStart(2, '0') + '-01';
        const monthLastDate = new Date(year, month + 1, 0, 12);
        const monthEnd = toLocalDateString(monthLastDate);
        const elapsed = calendarYearDateRange(year, monthStart, monthEnd < today ? monthEnd : today);
        const entries = elapsed.map(date => timelineByDate.get(date));
        const known = entries.filter(item => item && ['complete', 'confirmed-rest'].includes(item.dataStatus) && Number.isFinite(Number(item.load)));
        const complete = yearLoadModeConsistent && elapsed.length > 0 && known.length === elapsed.length;
        const modeSet = [...new Set(known.map(item => item.loadMode).filter(Boolean))];
        const value = complete && modeSet.length === 1 && modeSet[0] === yearTimelineModes[0] ? known.reduce((sum, item) => sum + Number(item.load), 0) : null;
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

    const trainingMode = calendarDisplayMode() === 'training';
    const legendTypes = trainingMode
        ? [...new Set(weeks.flatMap(week => [...week.activities, ...week.plannedActivities].map(item => item.category || 'ga')))]
        : [...new Set(weeks.flatMap(week => [...Object.values(week.bySport).map(item => item.type), ...Object.keys(week.plannedBySport)]))];
    const sportLegend = legendTypes.map(type => {
        const config = trainingMode ? (getTypeColorMap()[type] || getTypeColorMap().ga) : (catalog[type] || catalog.Workout);
        return '<span class="calendar-legend-item"><span class="calendar-legend-dot" style="background:' + config.color + '"></span>' + escapeHtml(config.label || type) + '</span>';
    }).join('');
    const firstLoadMode = weeks.find(week => week.loadMode)?.loadMode;
    const firstLoadUnit = weeks.find(week => week.loadUnit)?.loadUnit || '';
    document.getElementById('calendar-period-title').textContent = String(year);
    container.innerHTML =
        '<section class="calendar-year-kpis">' + kpiMarkup + '</section>' +
        '<section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Trainingsbelastung im Jahresverlauf</h3><p>Wochenwerte aus der zentralen Training-Load-Zeitreihe</p></div><span>' + escapeHtml(calendarYearLoadLabel(firstLoadMode, firstLoadUnit)) + '</span></div>' +
        '<div class="calendar-year-scroll"><div class="calendar-year-matrix" style="--calendar-year-columns:' + cols + '"><div class="calendar-year-months">' + monthHeader + '</div><div class="calendar-year-week-head">' + weekHeader + '</div><div class="calendar-year-weeks">' + weekCells + '</div></div></div>' +
        '<div class="calendar-year-load-legend"><span><i style="background:#DCEFE4"></i>Niedrig</span><span><i style="background:#A7D5B6"></i></span><span><i style="background:#F0D58C"></i>Mittel</span><span><i style="background:#E9A36F"></i></span><span><i style="background:#D87575"></i>Hoch</span><span><i class="is-unknown"></i>Nicht berechenbar</span><span><i class="is-partial"></i>Teilwoche</span></div>' +
        '<div class="calendar-year-legend">' + (sportLegend || '<span class="text-xs text-slate-500">Noch keine Aktivitäten dokumentiert.</span>') + '<span class="text-[10px] text-slate-500">' + (trainingMode ? 'Trainingsfarben = Trainingsarten' : 'Sportfarben = absolvierte Sportarten') + ' · umrandete Marker = geplante Einheiten · Symbole = Wettkampf und Gesundheit</span></div></section>' +
        '<section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Trainingsphasen</h3><p>Automatische Hinweise aus Wettkampfterminen und dokumentierten Belastungsmustern</p></div><span class="calendar-year-phase-count">' + confirmedPhases.length + ' bestätigt</span></div>' +
        '<div class="calendar-year-phase-grid">' + (phaseMarkup || '<p class="calendar-year-empty">Noch keine Trainingsphasen bestätigt.</p>') + '</div>' +
        (suggestionMarkup ? '<h4 class="calendar-year-subheading">Vorschläge zur Prüfung</h4><div class="calendar-year-phase-grid">' + suggestionMarkup + '</div>' : '<p class="calendar-year-empty">Aktuell keine ausreichend belegten neuen Phasenvorschläge.</p>') +
        '<div id="calendar-year-phase-editor" class="hidden"></div></section>' +
        '<div class="calendar-year-analysis-grid"><section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Monatsvergleich</h3><p>Load-Summe je Monat · Trainingszeit als Zusatzinformation</p></div></div><div class="calendar-year-month-chart">' + monthChart + '</div></section>' +
        '<section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Sportartenverteilung</h3><p>Dokumentierte Trainingszeit und Einheiten</p></div></div><div class="calendar-year-sport-list">' + (sportRows || '<p class="calendar-year-empty">Noch keine Aktivitäten im Kalenderjahr dokumentiert.</p>') + '</div></section></div>' +
        '<section class="calendar-year-section"><div class="calendar-year-section-heading"><div><h3>Saison-Timeline</h3><p>Wettkämpfe, Gesundheitsereignisse und bestätigte Trainingsphasen</p></div></div><div class="calendar-year-timeline">' + (timelineMarkup || '<p class="calendar-year-empty">Für dieses Kalenderjahr sind noch keine Ereignisse dokumentiert.</p>') + '</div></section>';
    globalThis.lucide?.createIcons?.();
}
function renderCalendarMonthSummary(date, target) {
    const root = typeof target === 'string' ? document.getElementById(target) : target;
    if (!root) return;
    const data = calendarDateData(date);
    const actualMinutes = data.durationRecords.reduce((sum, item) => sum + Number(item.duration), 0);
    const durationText = data.activities.length === 0
        ? '0,00'
        : (data.durationComplete ? '' : '≈') + calendarDayDurationValue(actualMinutes);
    const loadText = data.loadValue === null ? '—' : Math.round(data.loadValue);
    const activityRows = (items, planned) => items.slice(0, 3).map(item => {
        const sport = calendarSport(item.type);
        const color = calendarActivityColor(item, sport);
        return '<div class="calendar-month-summary-entry ' + (planned ? 'is-planned' : 'is-completed') + '">' +
            '<span class="calendar-month-summary-dot" style="--activity-color:' + color + '"></span>' +
            '<span class="calendar-month-summary-entry-copy"><strong>' + escapeHtml(item.name || (planned ? 'Geplante Einheit' : 'Trainingseinheit')) + '</strong>' +
            '<small>' + escapeHtml(sport.label + (item.raceFormat ? ' · ' + item.raceFormat : '')) + '</small></span>' +
            '<span class="calendar-month-summary-status">' + (planned ? 'Geplant' : 'Abgeschlossen') + '</span></div>';
    }).join('') + (items.length > 3 ? '<p class="calendar-month-summary-more">+' + (items.length - 3) + ' weitere Einheiten</p>' : '');
    const health = state.healthLogs?.[date];
    const hasPeriod = state.dailyCheckins?.[date]?.cycle?.period === true;
    const eventLabels = [
        ...data.races.map(item => 'Wettkampf: ' + (item.name || 'Wettkampf')),
        ...(health?.status ? [health.status === 'sick' ? 'Krankheit dokumentiert' : 'Verletzung dokumentiert'] : []),
        ...(hasPeriod ? ['Menstruation dokumentiert'] : [])
    ];
    root.innerHTML =
        '<div class="calendar-month-summary-heading"><div><p class="calendar-month-summary-eyebrow">Tageszusammenfassung</p><h3>' + escapeHtml(calendarDateLabel(date)) + '</h3></div>' +
        '<button type="button" class="calendar-month-summary-open" onclick="openCalendarDay(\'' + escapeHtml(date) + '\')">Tagesansicht <i data-lucide="arrow-right"></i></button></div>' +
        '<div class="calendar-month-summary-rings">' +
            calendarDayRing(String(data.activities.length), 'Absolviert', 'good') +
            calendarDayRing(durationText, 'Trainingsstunden', 'info') +
            calendarDayRing(loadText, 'Load', calendarLoadTone(data.timeline)) +
            calendarDayRing(String(data.planned.length), 'Geplant', 'info') +
        '</div>' +
        ((data.activities.length || data.planned.length) ?
            '<div class="calendar-month-summary-lists">' +
                (data.activities.length ? '<div><p>Absolviertes Training</p>' + activityRows(data.activities, false) + '</div>' : '') +
                (data.planned.length ? '<div><p>Geplantes Training</p>' + activityRows(data.planned, true) + '</div>' : '') +
            '</div>' : '<p class="calendar-month-summary-empty">Für diesen Tag sind keine Trainingseinheiten dokumentiert oder geplant.</p>') +
        (eventLabels.length ? '<div class="calendar-month-summary-events">' + eventLabels.map(label => '<span>' + escapeHtml(label) + '</span>').join('') + '</div>' : '');
    root.classList.remove('hidden');
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
        const markers = [
            ...data.activities.map(item => ({ item, planned: false })),
            ...data.planned.map(item => ({ item, planned: true }))
        ].sort((a, b) => calendarDayTime(a.item.startTimeLocal || a.item.start_time_local || a.item.startTime || a.item.time).localeCompare(calendarDayTime(b.item.startTimeLocal || b.item.start_time_local || b.item.startTime || b.item.time)));
        const markerMarkup = markers.map(({ item, planned }) => {
            const sport = catalog[item.type] || catalog.Workout;
            const color = calendarActivityColor(item, sport);
            const label = sport.label + (item.raceFormat ? ' · ' + item.raceFormat : '') + ' · ' + calendarActivityColorLabel(item, sport);
            return '<span class="calendar-month-sport-marker ' + (planned ? 'is-planned' : 'is-completed') + '" style="--activity-color:' + color + '" title="' + escapeHtml(label + (planned ? ' · Geplant' : ' · Abgeschlossen')) + '"></span>';
        }).join('');
        const load = data.loadValue === null ? '' : '<small class="calendar-month-load">' + Math.round(data.loadValue) + '</small>';
        grid.insertAdjacentHTML('beforeend', '<button type="button" class="calendar-month-day ' + (date === today ? 'is-today ' : '') + (selected ? 'is-selected' : '') + '" data-date="' + date + '" aria-pressed="' + selected + '" aria-label="' + calendarDateLabel(date) + '" onclick="openCalendarDay(\'' + date + '\',true)">' +
            '<span class="calendar-month-day-head"><span class="calendar-month-day-number">' + day + '</span>' + load + '</span>' +
            '<span class="calendar-month-markers">' + markerMarkup + '</span><span class="calendar-month-events">' + calendarEventIcons(date) + '</span></button>');
    }
    const selectedDate = state.selectedCalendarDay;
    const detail = document.getElementById('month-day-detail');
    if (detail) {
        const sameMonth = selectedDate && selectedDate.slice(0, 7) === year + '-' + String(month + 1).padStart(2, '0');
        detail.classList.toggle('hidden', !sameMonth);
        if (sameMonth) { detail.classList.add('calendar-day-view'); renderCalendarDayDetail(selectedDate, detail); }
        else { detail.classList.remove('calendar-day-view'); detail.innerHTML = ''; }
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
        '<div class="flex justify-end"><button type="button" class="calendar-planned-detail-action" onclick="closePlannedCalendarDetail();openPlannedWorkoutModal(\'' + encodeURIComponent(String(item.id)) + '\')">Einheit bearbeiten</button></div></section>';
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
    const activities = getVisibleActivities((state.rawActivities || []).filter(item => item.date >= weekDates[0] && item.date <= endDate));
    const durationRecords = activities.filter(item => item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration)) && Number(item.duration) > 0);
    const loadDays = weekDates.map(date => calendarDateData(date)).filter(data => data.activities.length);
    const loadComplete = loadDays.length > 0 && loadDays.every(data => data.loadValue !== null);
    const loadTotal = loadComplete ? loadDays.reduce((sum, data) => sum + data.loadValue, 0) : null;
    const durationComplete = activities.length > 0 && durationRecords.length === activities.length;
    const durationTotal = durationRecords.length ? durationRecords.reduce((sum, item) => sum + Number(item.duration), 0) : null;
    const weekColorGroups = new Map();
    durationRecords.forEach(item => {
        const trainingMode = calendarDisplayMode() === 'training';
        const sport = calendarSport(item.type);
        const category = getTypeColorMap()[item.category || 'ga'] || getTypeColorMap().ga;
        const key = trainingMode ? String(item.category || 'ga') : String(item.type || 'Workout');
        const current = weekColorGroups.get(key) || {
            label: trainingMode ? (category.label || key) : sport.label,
            color: trainingMode ? category.color : (sport.color || '#64748b'),
            minutes: 0
        };
        current.minutes += Number(item.duration);
        weekColorGroups.set(key, current);
    });
    const sportSegments = durationTotal ? [...weekColorGroups.values()].map(group => {
        const width = group.minutes / durationTotal * 100;
        return '<span class="calendar-week-load-segment" style="width:' + width.toFixed(2) + '%;--sport-color:' + group.color + '" title="' + escapeHtml(group.label + ': ' + calendarFormatMinutes(group.minutes)) + '" aria-label="' + escapeHtml(group.label + ': ' + calendarFormatMinutes(group.minutes)) + '"></span>';
    }).join('') : '';
    const summary = document.getElementById('calendar-week-summary');
    if (summary) summary.innerHTML = '<div class="calendar-week-load"><div class="calendar-week-load-value"><small>Wochen-Load</small><strong>' + (loadTotal === null ? '—' : Math.round(loadTotal)) + '</strong></div><div class="calendar-week-load-track" role="img" aria-label="Sportarten-Anteile nach erfasster Trainingszeit">' + sportSegments + '</div></div><div class="calendar-week-duration"><small>Trainingszeit</small><strong>' + (durationTotal === null ? '—' : (durationComplete ? '' : '∼') + calendarFormatMinutes(durationTotal)) + '</strong></div>';

    const today = toLocalDateString();
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const dayData = weekDates.map((date, index) => {
        const data = calendarDateData(date);
        const health = state.healthLogs?.[date];
        const cycle = state.dailyCheckins?.[date]?.cycle?.period === true;
        const markers = [
            ...data.activities.map(item => ({ color: calendarActivityColor(item), title: calendarActivityColorLabel(item), kind: 'training' })),
            ...data.planned.map(item => ({ color: calendarActivityColor(item), title: calendarActivityColorLabel(item) + ' · geplant', kind: 'planned' })),
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
        const weekActivityMarkup = (item, planned) => {
            const sport = calendarSport(item.type);
            const color = calendarActivityColor(item, sport);
            const id = encodeURIComponent(String(item.id || '')).replace(/'/g, '%27');
            const duration = item.duration !== null && item.duration !== undefined && item.duration !== '' && Number.isFinite(Number(item.duration))
                ? Math.round(Number(item.duration)) + ' min' : '';
            const distance = item.distance !== null && item.distance !== undefined && Number.isFinite(Number(item.distance))
                ? formatKm(item.distance) + ' km' : '';
            const averageHr = item.hr !== null && item.hr !== undefined && Number.isFinite(Number(item.hr))
                ? 'Ø ' + Math.round(Number(item.hr)) + ' bpm' : '';
            const metrics = [duration, distance, averageHr].filter(Boolean);
            const action = planned
                ? 'openPlannedCalendarDetail(decodeURIComponent(\'' + id + '\'))'
                : 'openCSVDetailsModal(\'' + id + '\')';
            return '<button type="button" class="calendar-week-activity ' + (planned ? 'is-planned' : 'is-completed') + '" style="--activity-color:' + color + '" onclick="' + action + '">' +
                '<span class="calendar-week-activity-main"><strong>' + escapeHtml(sport.label + (item.raceFormat ? ' · ' + item.raceFormat : '')) + '</strong>' +
                '<small>' + escapeHtml(item.name || (planned ? 'Geplante Einheit' : 'Trainingseinheit')) + '</small>' +
                '<span class="calendar-week-activity-status ' + (planned ? 'is-planned' : 'is-completed') + '">' + (planned ? 'Geplant' : 'Abgeschlossen') + '</span></span>' +
                (metrics.length ? '<span class="calendar-week-activity-metrics">' + metrics.map(value => '<span>' + escapeHtml(value) + '</span>').join('') + '</span>' : '') +
                '</button>';
        };
        const activityItems = data.activities.map(item => weekActivityMarkup(item, false)).join('');
        const planItems = data.planned.map(item => weekActivityMarkup(item, true)).join('');
        const eventLabels = [];
        if (data.races.length) eventLabels.push('<span class="calendar-week-event-label calendar-event-race"><i data-lucide="trophy"></i> Wettkampf</span>');
        if (day.health?.status === 'sick') eventLabels.push('<span class="calendar-week-event-label calendar-event-sick"><i data-lucide="thermometer"></i> Krankheit</span>');
        if (day.health?.status === 'injured') eventLabels.push('<span class="calendar-week-event-label calendar-event-injured"><i data-lucide="bandage"></i> Verletzung</span>');
        if (day.cycle) eventLabels.push('<span class="calendar-week-event-label calendar-event-cycle"><i data-lucide="droplet"></i> Menstruation</span>');
        else if(periodCalendarMarker(date).includes('geschätzt'))eventLabels.push('<span class="calendar-week-event-label calendar-event-cycle calendar-event-cycle-predicted"><i data-lucide="droplet"></i> Periode (Prognose)</span>');
        const dayName = calendarDateLabel(date);
        const entries = activityItems + planItems;
        const hasDayMetrics = data.durationTotal !== null && data.durationTotal !== undefined || data.loadValue !== null && data.loadValue !== undefined;
        return '<section id="calendar-week-day-' + date + '" class="calendar-week-agenda-day ' + (date === today ? 'is-today ' : '') + (date === activeDate ? 'is-selected' : '') + '"><button type="button" class="calendar-week-agenda-heading" onclick="selectCalendarWeekDay(\'' + date + '\')"><span><small>' + dayNames[day.index] + '</small><strong>' + d.getDate() + '. ' + monthShort[d.getMonth()] + '</strong></span><span class="calendar-week-agenda-title">' + escapeHtml(dayName) + '</span><i data-lucide="chevron-down"></i></button>' +
            (eventLabels.length ? '<div class="calendar-week-event-labels">' + eventLabels.join('') + '</div>' : '') +
            (entries ? '<div class="calendar-week-agenda-entries">' + entries + '</div>' : '') +
            (hasDayMetrics ? '<div class="calendar-week-day-totals">' + (data.durationTotal !== null && data.durationTotal !== undefined ? '<span>' + (data.durationComplete ? '' : '∼') + calendarFormatMinutes(data.durationTotal) + '</span>' : '') + (data.loadValue !== null && data.loadValue !== undefined ? '<span>Load ' + Math.round(data.loadValue) + '</span>' : '') + '</div>' : '') +
            '</section>';
    }).join('');
    container.classList.remove('grid-cols-1', 'grid-cols-7', 'min-w-[900px]');
    container.innerHTML = strip + '<div class="calendar-week-agenda">' + sections + '</div>';
    globalThis.lucide?.createIcons?.();
}

export function setActivitySportFilter(sport, checked) {
    sport = decodeURIComponent(sport);
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
    const chips = document.getElementById('activity-sport-filter-chips');
    if (!container || !chips) return;
    renderCalendarLegend();
    document.getElementById('calendar-period-title').textContent = 'Aktivitäten';
    const activities = getVisibleActivities(state.rawActivities || []).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    const sports = [...new Set(activities.map(act => act.type || 'Workout'))].sort((a,b) => {
        const al = sportCatalog[a]?.label || a, bl = sportCatalog[b]?.label || b;
        return al.localeCompare(bl, 'de');
    });
    chips.innerHTML = '<button type="button" class="activity-filter-chip ' + (selectedActivitySports.size ? '' : 'is-active') + '" aria-pressed="' + (!selectedActivitySports.size) + '" onclick="clearActivitySportFilter()">Alle</button>' +
        sports.map(sport => {
            const label = sportCatalog[sport]?.label || sport;
            const active = selectedActivitySports.has(sport);
            return '<button type="button" class="activity-filter-chip ' + (active ? 'is-active' : '') + '" aria-pressed="' + active + '" onclick="setActivitySportFilter(\'' + encodeURIComponent(sport).replace(/'/g, '%27') + '\',' + !active + ')">' + escapeHtml(label) + '</button>';
        }).join('');
    const filtered = selectedActivitySports.size
        ? activities.filter(act => selectedActivitySports.has(act.type || 'Workout'))
        : activities;
    // Berechne den Load für die gesamte Datenbasis mit genau der in den
    // Einstellungen gewählten Methode. Bei gruppierten Einheiten werden die
    // Segmentwerte addiert; unvollständige Gruppen erhalten bewusst keinen Wert.
    const trainingLoad = getTrainingLoadData(
        state.rawActivities || [], state.settings, state.profile, state.dailyCheckins
    );
    const loadByActivityId = new Map((trainingLoad.records || []).map(record => [
        String(record.activity?.id), Number(record.value)
    ]));
    const loadLabel = state.settings?.trainingLoadSource === 'kajo-zone' || trainingLoad.mode === 'garmin-zone'
        ? 'HF-Zonen-Load'
        : trainingLoad.mode === 'srpe' ? 'sRPE-Load' : 'Training Load';
    const count = document.getElementById('activity-list-count');
    if (count) count.textContent = filtered.length + ' von ' + activities.length + ' Aktivitäten';
    if (!filtered.length) {
        container.innerHTML = '<div class="activity-list-empty">' +
            (activities.length ? 'Keine Aktivitäten für die ausgewählten Sportarten.' : 'Keine Aktivitäten in der Datenbank vorhanden.') + '</div>';
        globalThis.lucide?.createIcons?.();
        return;
    }
    container.innerHTML = filtered.map(act => {
        const mode = calendarDisplayMode();
        const activityColor = calendarActivityColor(act, sportCatalog[act.type] || sportCatalog.Workout);
        const isStrength = act.type === 'WeightTraining' || act.category === 'strength';
        const telemetry = getGarminTelemetry(act);
        const telemetryHr = Array.isArray(telemetry?.hr) ? telemetry.hr.map(Number).filter(v => Number.isFinite(v) && v > 0) : [];
        const maxHr = Number(act.maxHr) > 0 ? Math.round(Number(act.maxHr)) : (telemetryHr.length ? Math.round(Math.max(...telemetryHr)) : null);
        const hrValues = [];
        if (act.hr != null && Number.isFinite(Number(act.hr))) hrValues.push('Ø ' + Math.round(Number(act.hr)) + ' bpm');
        if (maxHr != null) hrValues.push('max. ' + maxHr + ' bpm');
        const hrHtml = hrValues.length ? '<span>HF ' + hrValues.join(' · ') + '</span>' : '';
        const distanceHtml = !isStrength && act.distance != null && Number.isFinite(Number(act.distance)) ? ' · ' + formatKm(act.distance) + ' km' : '';
        const loadMembers = getActivityGroupMembers(act, state.rawActivities || []);
        const hasCompleteLoad = loadMembers.length > 0
            && loadMembers.every(member => loadByActivityId.has(String(member.id))
                && Number.isFinite(loadByActivityId.get(String(member.id))));
        const activityLoad = hasCompleteLoad
            ? loadMembers.reduce((sum, member) => sum + loadByActivityId.get(String(member.id)), 0)
            : null;
        const loadHtml = activityLoad !== null
            ? '<strong>' + Math.round(activityLoad) + ' ' + escapeHtml(loadLabel) + '</strong>'
            : '<span class="activity-list-load-unavailable" title="Für diese Aktivität liegen keine ausreichenden Daten für die ausgewählte Load-Methode vor.">' + escapeHtml(loadLabel) + ' —</span>';
        const durationHtml = act.duration != null && Number.isFinite(Number(act.duration)) ? '<span>' + Math.round(Number(act.duration)) + ' min' + distanceHtml + '</span>' : (distanceHtml ? '<span>' + distanceHtml.slice(3) + '</span>' : '');
        const id = encodeURIComponent(String(act.id)).replace(/'/g, '%27');
        return '<button type="button" onclick="openCSVDetailsModal(\'' + id + '\')" class="activity-list-row" style="--activity-color:' + activityColor + '">' +
            '<span class="activity-list-accent" aria-hidden="true"></span>' +
            '<span class="activity-list-date">' + formatDateDDMMYY(act.date) + '</span>' +
            '<span class="activity-list-main"><strong>' + escapeHtml(act.name || 'Trainingseinheit') + '</strong>' +
            (durationHtml ? '<span class="activity-list-subline">' + durationHtml + '</span>' : '') + '</span>' +
            '<span class="activity-list-metrics">' + hrHtml + loadHtml + '</span></button>';
    }).join('');
    globalThis.lucide?.createIcons?.();
}