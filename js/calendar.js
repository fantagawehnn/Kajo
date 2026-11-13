/* ============================================================
 * calendar.js – Kalender: Monats-, Wochen- und Listenansicht
 * ============================================================ */

import { state, refreshAll } from './state.js';
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
        state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + dir);
    }
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
    const mode = calendarDisplayMode();
    const format = state.activeCalendarFormat;
    const visibleActivities = [];
    let showPlanned = false, showRace = false, showSick = false, showInjured = false;

    if (format === 'month') {
        const year = state.currentCalendarDate.getFullYear();
        const month = state.currentCalendarDate.getMonth();
        const prefix = year + '-' + String(month + 1).padStart(2, '0') + '-';
        visibleActivities.push(...state.rawActivities.filter(a => String(a.date || '').startsWith(prefix)));
        showPlanned = state.plannedActivities.some(a => String(a.date || '').startsWith(prefix));
        showRace = state.races.some(a => String(a.date || '').startsWith(prefix));
        showSick = Object.entries(state.healthLogs).some(([date, h]) => date.startsWith(prefix) && h?.status === 'sick');
        showInjured = Object.entries(state.healthLogs).some(([date, h]) => date.startsWith(prefix) && h?.status === 'injured');
    } else if (format === 'week') {
        const curr = new Date(state.currentCalendarDate);
        const offset = curr.getDay() === 0 ? -6 : 1 - curr.getDay();
        const monday = new Date(curr);
        monday.setDate(curr.getDate() + offset);
        const dates = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return toLocalDateString(d);
        });
        const visible = new Set(dates);
        visibleActivities.push(...state.rawActivities.filter(a => visible.has(a.date)));
        showPlanned = state.plannedActivities.some(a => visible.has(a.date));
        // Wettkämpfe werden in der Wochenansicht nicht als eigener Marker dargestellt.
        showRace = false;
        showSick = dates.some(date => state.healthLogs[date]?.status === 'sick');
        showInjured = dates.some(date => state.healthLogs[date]?.status === 'injured');
    } else {
        const filtered = selectedActivitySports.size
            ? state.rawActivities.filter(a => selectedActivitySports.has(a.type || 'Workout'))
            : state.rawActivities;
        visibleActivities.push(...filtered);
    }

    const catalog = mode === 'sport' ? getSportsCatalog() : getTypeColorMap();
    const keys = [...new Set(visibleActivities.map(a => mode === 'sport' ? (a.type || 'Workout') : (a.category || 'ga')))];
    const entries = keys.map(key => {
        const value = catalog[key] || (mode === 'sport' ? catalog.Workout : catalog.ga);
        return value ? { label: value.label || key, color: value.color } : null;
    }).filter(Boolean);
    const items = entries.map(v => '<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:' + v.color + '"></span>' + escapeHtml(v.label) + '</span>');
    if (format !== 'activities') {
        if (showRace) items.push('<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>Wettkampf</span>');
        if (showPlanned) items.push('<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-sky-500"></span>Geplant</span>');
        if (showSick) items.push('<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-orange-500"></span>Krankheit</span>');
        if (showInjured) items.push('<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-amber-400"></span>Verletzung</span>');
    }
    el.innerHTML = items.join('');
    el.classList.toggle('hidden', items.length === 0);
}
export function renderCalendar() {
    const format = ['day', 'week', 'month', 'year', 'activities'].includes(state.activeCalendarFormat) ? state.activeCalendarFormat : 'week';
    state.activeCalendarFormat = format;
    ['day', 'week', 'month', 'year', 'activities'].forEach(f => {
        const button = document.getElementById('btn-fmt-' + f);
        if (button) {
            const active = f === format;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        }
    });
    document.getElementById('cal-format-day')?.classList.toggle('hidden', format !== 'day');
    document.getElementById('cal-format-month')?.classList.toggle('hidden', format !== 'month');
    document.getElementById('cal-format-week')?.classList.toggle('hidden', format !== 'week' && format !== 'day');
    document.getElementById('cal-format-year')?.classList.toggle('hidden', format !== 'year');
    document.getElementById('cal-format-list')?.classList.toggle('hidden', format !== 'activities');
    const isActivities = format === 'activities';
    ['calendar-period-prev', 'calendar-period-next'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', isActivities));
    const mode = calendarDisplayMode();
    const modeToggle = document.getElementById('calendar-display-toggle');
    if (modeToggle) {
        const trainingMode = mode === 'training';
        modeToggle.setAttribute('aria-checked', String(trainingMode));
        modeToggle.setAttribute('aria-label', trainingMode ? 'Eintragsanzeige: Trainingsart. Zu Sportart wechseln' : 'Eintragsanzeige: Sportart. Zu Trainingsart wechseln');
        document.getElementById('calendar-display-thumb')?.classList.toggle('translate-x-full', trainingMode);
    }
    renderCalendarLegend();
    if (format === 'month') renderMonthView();
    else if (format === 'week' || format === 'day') renderWeekView();
    else if (format === 'year') renderYearView();
    else renderListView();
}

export function renderYearView() {
    const container = document.getElementById('cal-format-year');
    if (!container) return;
    const year = state.currentCalendarDate.getFullYear();
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    const today = toLocalDateString();
    document.getElementById('calendar-period-title').textContent = String(year);
    container.innerHTML = '';
    for (let month = 0; month < 12; month++) {
        const first = new Date(year, month, 1);
        const offset = (first.getDay() + 6) % 7;
        const days = new Date(year, month + 1, 0).getDate();
        const card = document.createElement('section');
        card.className = 'rounded-xl border border-slate-800 bg-slate-900 p-2 min-w-0';
        const heading = document.createElement('h3');
        heading.className = 'text-xs font-semibold text-slate-200 mb-2';
        heading.textContent = monthNames[month];
        card.appendChild(heading);
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-7 gap-1 text-center';
        ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(label => {
            const cell = document.createElement('span');
            cell.className = 'text-[9px] text-slate-500';
            cell.textContent = label;
            grid.appendChild(cell);
        });
        for (let blank = 0; blank < offset; blank++) {
            const cell = document.createElement('span');
            cell.className = 'h-6';
            grid.appendChild(cell);
        }
        for (let day = 1; day <= days; day++) {
            const date = year + '-' + String(month + 1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
            const hasTraining = (state.rawActivities || []).some(item => item.date === date) || (state.plannedActivities || []).some(item => item.date === date);
            const hasHealth = Boolean(state.healthLogs?.[date]);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'h-6 rounded-md text-[10px] ' + (date === today ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/50' : hasTraining ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800');
            cell.textContent = String(day);
            cell.setAttribute('aria-label', date + (hasTraining ? ', Trainingseintrag' : '') + (hasHealth ? ', Gesundheitseintrag' : ''));
            cell.addEventListener('click', () => {
                state.currentCalendarDate = new Date(year, month, day);
                setCalendarFormat('day');
            });
            grid.appendChild(cell);
        }
        card.appendChild(grid);
        container.appendChild(card);
    }
}

export function renderMonthView() {
    const sportCatalog=getSportsCatalog(),categoryColors=getTypeColorMap();
    const year = state.currentCalendarDate.getFullYear();
    const month = state.currentCalendarDate.getMonth();
    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    document.getElementById('calendar-period-title').textContent = `${monthNames[month]} ${year}`;

    const grid = document.getElementById('month-grid-cells');
    grid.innerHTML = '';
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const adjustedFirstDay = (firstDayIndex === 0 ? 6 : firstDayIndex - 1);
    const todayStr = toLocalDateString();

    for (let i = 0; i < adjustedFirstDay; i++) {
        grid.insertAdjacentHTML('beforeend', '<div class="calendar-day-empty rounded-xl"></div>');
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const dayActs = state.rawActivities.filter(a => a.date === dateStr);
        const dayPlans = state.plannedActivities.filter(p => p.date === dateStr);
        const dayRaces = state.races.filter(r => r.date === dateStr);
        const dayHealth = state.healthLogs[dateStr];
        const dayLoadComplete = dayActs.length > 0 && dayActs.every(act => act.tss != null && Number.isFinite(Number(act.tss)));
        const dayLoad = dayLoadComplete ? Math.round(dayActs.reduce((sum,a)=>sum+Number(a.tss),0)) : null;

        const activityMarkers = dayActs.map(act => {
            const mode = calendarDisplayMode();
            const activityColor = mode === 'training'
                ? (categoryColors[act.category || 'ga'] || categoryColors.ga).color
                : (sportCatalog[act.type] || sportCatalog.Workout).color;
            const label = escapeHtml(act.name || (sportCatalog[act.type] || sportCatalog.Workout).label || 'Training');
            return `<button type="button" onclick="event.stopPropagation();openCSVDetailsModal('${encodeURIComponent(String(act.id)).replace(/'/g, '%27')}')" title="${label}" aria-label="${label}" class="calendar-month-activity-marker" style="--activity-color:${activityColor}"></button>`;
        }).join('');

        const plannedMarker = dayPlans.length
            ? '<span class="calendar-month-planned-marker" title="Geplante Einheit" aria-label="Geplante Einheit"></span>'
            : '';
        const raceMarker = dayRaces.length
            ? '<span class="calendar-month-race-marker" title="' + dayRaces.map(r => escapeHtml(r.name)).join(', ') + '" aria-label="Wettkampf"></span>'
            : '';
        const illnessMarker = dayHealth?.status === 'sick' ? '<span class="calendar-month-illness-marker" title="Krankheit" aria-label="Krankheit"></span>' : '';
        const injuryMarker = dayHealth?.status === 'injured' ? '<span class="calendar-month-injury-marker" title="Verletzung" aria-label="Verletzung"></span>' : '';
        const cycleMarker = periodCalendarMarker(dateStr);
        const loadMarkup = dayLoad !== null ? '<div class="calendar-month-load" title="Trainingsload">'+dayLoad+' Load</div>' : '';
        const borderClass = isToday ? 'is-today' : '';

        grid.insertAdjacentHTML('beforeend', `
            <div onclick="openDayEditor(this.dataset.date)" data-date="${dateStr}" role="button" tabindex="0" class="calendar-day-card calendar-month-day ${borderClass}">
                <div class="calendar-month-day-head"><span class="calendar-month-day-number">${d}${cycleMarker}</span>${loadMarkup}</div>
                <div class="calendar-month-markers">${activityMarkers}${plannedMarker}${raceMarker}${illnessMarker}${injuryMarker}</div>
            </div>
        `);
    }
    globalThis.lucide?.createIcons?.();
}

// Wochenansicht exakt nach Designvorgabe des Screenshots
export function renderWeekView() {
    const sportCatalog=getSportsCatalog(),categoryColors=getTypeColorMap();
    const container = document.getElementById('cal-format-week');
    if (!container) return;
    container.classList.toggle('grid-cols-1', state.activeCalendarFormat === 'day');
    container.classList.toggle('grid-cols-7', state.activeCalendarFormat !== 'day');
    container.classList.toggle('min-w-[900px]', state.activeCalendarFormat !== 'day');
    container.innerHTML = '';
    
    const curr = new Date(state.currentCalendarDate);
    const dayOfWeek = curr.getDay();
    const diffToMonday = state.activeCalendarFormat === 'day' ? curr.getDate() : curr.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(curr.setDate(diffToMonday));
    
    const monthNamesShort = ["Jan.", "Feb.", "Mär.", "Apr.", "Mai", "Jun.", "Jul.", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
    const weekdayNamesFull=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    document.getElementById('calendar-period-title').textContent = state.activeCalendarFormat === 'day' ? `${weekdayNamesFull[monday.getDay()]}, ${monday.getDate()}. ${monthNamesShort[monday.getMonth()]}` : `Woche ab ${monday.getDate()}. ${monthNamesShort[monday.getMonth()]}`;

    const todayStr = toLocalDateString();

    const visibleDays=state.activeCalendarFormat==='day'?1:7;
    for (let i = 0; i < visibleDays; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const isToday = (dateStr === todayStr);

        const checkin = state.dailyCheckins[dateStr] || {};
        const health = state.healthLogs[dateStr];
        const dayActs = state.rawActivities.filter(a => a.date === dateStr);
        const dayPlans = state.plannedActivities.filter(p => p.date === dateStr);

        const weekdayNames = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
        const wName = weekdayNames[d.getDay()];

        let healthHeaderHtml = '';
        if (checkin.weight) healthHeaderHtml += `<span class="text-[11px] text-slate-300">${checkin.weight}kg</span> `;
        const sleepDuration = checkin.sleepDuration ?? (Number(checkin.sleep) > 5 ? checkin.sleep : null);
        if (sleepDuration != null) { const h=Number(sleepDuration),color=h<7?'text-rose-400':h<=9?'text-emerald-400':'text-cyan-300'; healthHeaderHtml += `<span class="text-[11px] ${color}">🌙 ${escapeHtml(sleepDuration)}h</span> `; }
        if (checkin.sleepScore != null) { const score=Number(checkin.sleepScore),color=score<80?'text-rose-400':score<=90?'text-amber-300':'text-emerald-400'; healthHeaderHtml += `<span class="text-[11px] ${color}">${Math.round(score)}</span> `; }
        if (checkin.rhr != null) healthHeaderHtml += `<span class="text-[11px] text-rose-400" title="Ruheherzfrequenz">♥ ${checkin.rhr}</span> `;
        if (checkin.hrv) healthHeaderHtml += `<span class="text-[11px] text-sky-400">HRV ${checkin.hrv}</span> `;
        if (checkin.respiration != null) healthHeaderHtml += `<span class="text-[11px] text-cyan-300">AF ${Number(checkin.respiration).toFixed(1)}</span> `;
        const readiness=calculateReadiness(dateStr);
        if(readiness.score!==null){const tone=readiness.score>=80?'text-green-300':readiness.score>=60?'text-yellow-300':readiness.score>=40?'text-orange-300':readiness.score>=20?'text-red-300':'text-purple-300';healthHeaderHtml += `<span class="text-[11px] ${tone}">Ready ${readiness.score}</span> `;}
        const durationsComplete = dayActs.length > 0 && dayActs.every(act => act.duration != null && Number.isFinite(Number(act.duration)));
        const loadsComplete = dayActs.length > 0 && dayActs.every(act => act.tss != null && Number.isFinite(Number(act.tss)));
        const dayTrainingMinutes = durationsComplete ? Math.round(dayActs.reduce((sum, act) => sum + Number(act.duration), 0)) : null;
        const dayTrainingLoad = loadsComplete ? Math.round(dayActs.reduce((sum, act) => sum + Number(act.tss), 0)) : null;
        const dayTotals = [];
        if (dayTrainingMinutes !== null) dayTotals.push(dayTrainingMinutes + ' min');
        if (dayTrainingLoad !== null) dayTotals.push(dayTrainingLoad + ' Load');
        if (dayTotals.length) healthHeaderHtml += `<span class="text-[11px] text-sky-300">${dayTotals.join(' · ')}</span> `;
        if (health) healthHeaderHtml += health.status === 'sick' ? `<div class="text-[10px] text-orange-300 font-bold">Krankheit · ${escapeHtml(health.diagnosis || 'Infekt')}</div>` : `<div class="text-[10px] text-amber-300 font-bold">Verletzung · ${escapeHtml(health.diagnosis || 'Verletzung')}</div>`;

        let actsHtml = '';
        dayActs.forEach(act => {
            const mode = calendarDisplayMode();
            const activityColor = mode === 'training'
                ? (categoryColors[act.category || 'ga'] || categoryColors.ga).color
                : (sportCatalog[act.type] || sportCatalog.Workout).color;
            actsHtml += `
                <div onclick="event.stopPropagation();openCSVDetailsModal('${encodeURIComponent(String(act.id)).replace(/'/g, '%27')}')" role="button" tabindex="0" class="relative z-10 bg-slate-950 border rounded-2xl p-3 space-y-2 cursor-pointer hover:border-white transition shadow-md" style="border-color:${activityColor}">
                    <div class="flex items-center justify-between">
                        <span class="px-2 py-0.5 text-[10px] font-bold rounded border" style="background-color:${activityColor}22;color:${activityColor};border-color:${activityColor}">${act.duration ? act.duration + 'm' : ''} ${act.distance != null ? formatKm(act.distance) + ' km' : ''}</span>
                        <i data-lucide="activity" class="w-3.5 h-3.5 text-sky-400"></i>
                    </div>
                    <div class="font-mono text-xs space-y-0.5">
                        <div class="font-bold text-rose-400">${act.hr ? act.hr + ' bpm' : ''}</div>
                        <div class="text-white font-semibold">Belastung ${act.tss || 0}</div>
                        ${act.perceivedEffort != null ? `<div class="text-slate-400 text-[10px]">Empfinden ${act.perceivedEffort}/10</div>` : ''}
                    </div>
                    <div class="pt-1 border-t border-slate-800/80 text-[11px] text-slate-300">
                        <span class="truncate font-medium">${escapeHtml(act.name)}</span>
                    </div>
                </div>
            `;
        });

        dayPlans.forEach(p => {
            actsHtml += `
                <div class="bg-sky-950/40 border border-sky-800/60 rounded-2xl p-3 space-y-1 text-xs text-sky-300">
                    <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 bg-sky-900 rounded">Geplant</span>
                    <div class="font-bold text-white mt-1">${escapeHtml(p.name)}</div>
                    <div class="font-mono text-[10px] text-slate-400">${escapeHtml(p.duration)} min · Ziel: ${escapeHtml(p.targetTss)} Load</div>
                </div>
            `;
        });

        const colBorder = isToday ? 'border-2 border-sky-500 bg-slate-900/90' : 'border border-slate-800 bg-slate-900';

        container.insertAdjacentHTML('beforeend', `
            <div onclick="openDayEditor('${dateStr}')" role="button" tabindex="0" class="calendar-day-card ${colBorder} p-3 rounded-2xl flex flex-col space-y-3 min-h-[420px]">
                <!-- Tageskopf -->
                <div class="border-b border-slate-800 pb-2.5">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold ${isToday ? 'text-sky-400 bg-sky-500/20 px-2 py-0.5 rounded' : 'text-slate-300'}">${wName} ${d.getDate()}. ${monthNamesShort[d.getMonth()]}${state.profile?.gender==='female'&&state.profile?.cycleTrackingEnabled===true?periodCalendarMarker(dateStr):''}</span>
                    </div>
                    <div class="mt-1.5 flex flex-wrap gap-1 font-mono">
                        ${healthHeaderHtml || '<span class="text-[10px] text-slate-500 italic">Keine Wearable-Daten</span>'}
                    </div>
                </div>

                <!-- Aktivitätskarten untereinander -->
                <div class="space-y-2 flex-1">
                    ${actsHtml || '<div class="text-center py-6 text-[11px] text-slate-600 italic">Keine Einheiten</div>'}
                </div>
            </div>
        `);
    }
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
        const telemetryHr = Array.isArray(act.telemetry?.hr) ? act.telemetry.hr.map(Number).filter(v => Number.isFinite(v) && v > 0) : [];
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