/* ============================================================
 * planning.js – Geplante Trainingseinheiten (Liste, Anlegen, Bearbeiten, Löschen)
 * ============================================================ */
import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { formatDateDDMMYY, toLocalDateString, escapeHtml, getSportsCatalog, getTypeColorMap } from './utils.js?v=2';
import { renderCalendar } from './calendar.js';

let editingPlannedWorkoutId = null;

let editingWorkoutSteps = [];
const WORKOUT_STEP_TYPES = [['warmup','Aufwärmen'],['work','Belastung'],['recovery','Erholung'],['cooldown','Abwärmen'],['other','Sonstiges']];
function normalizeWorkoutSteps(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0,40).filter(step=>step&&typeof step==='object').map((step,index)=>({
        id:String(step.id||'step-'+(index+1)).slice(0,80),
        type:WORKOUT_STEP_TYPES.some(([type])=>type===step.type)?step.type:'other',
        label:String(step.label||'').slice(0,80),
        durationSeconds:Number.isInteger(Number(step.durationSeconds))&&Number(step.durationSeconds)>0?Math.min(21600,Number(step.durationSeconds)):null,
        target:String(step.target||'').slice(0,120)
    })).filter(step=>step.label&&step.durationSeconds);
}
export function renderPlannedWorkoutSteps() {
    const root=document.getElementById('plan-steps-list'); if(!root)return;
    if(!editingWorkoutSteps.length){root.innerHTML='<p class="text-[11px] text-slate-500">Noch keine einzelnen Schritte angelegt. Du kannst die Einheit weiterhin nur mit den Textfeldern oben planen.</p>';return;}
    root.innerHTML=editingWorkoutSteps.map((step,index)=>{
        const options=WORKOUT_STEP_TYPES.map(([type,label])=>'<option value="'+type+'"'+(step.type===type?' selected':'')+'>'+label+'</option>').join('');
        const minutes=step.durationSeconds?(step.durationSeconds/60):'';
        return '<div data-workout-step class="rounded-xl border border-slate-700 bg-slate-950/70 p-3 space-y-2">'+
        '<div class="flex items-center justify-between gap-2"><strong class="text-[11px] text-cyan-300">SCHRITT '+(index+1)+'</strong><button type="button" onclick="removePlannedWorkoutStep('+index+')" class="text-[11px] text-rose-300">Entfernen</button></div>'+
        '<div class="grid grid-cols-2 gap-2"><label class="text-[10px] text-slate-400">Abschnittstyp<select data-field="type" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white">'+options+'</select></label>'+
        '<label class="text-[10px] text-slate-400">Dauer (Minuten)<input data-field="duration" type="number" min="0.1" max="360" step="0.1" value="'+(minutes===''?'':minutes)+'" placeholder="z. B. 3" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white"></label></div>'+
        '<label class="block text-[10px] text-slate-400">Bezeichnung<input data-field="label" maxlength="80" value="'+escapeHtml(step.label)+'" placeholder="z. B. Intervall 1" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white"></label>'+
        '<label class="block text-[10px] text-slate-400">Ziel / Anweisung (optional)<input data-field="target" maxlength="120" value="'+escapeHtml(step.target)+'" placeholder="z. B. Schwellenbereich, technisch sauber" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-xs text-white"></label></div>';
    }).join('');
}
function capturePlannedWorkoutSteps() {
    const root=document.getElementById('plan-steps-list');
    if(!root)return;
    const rows=[...root.querySelectorAll('[data-workout-step]')];
    editingWorkoutSteps=rows.map((row,index)=>{
        const old=editingWorkoutSteps[index]||{};
        const minutes=Number(row.querySelector('[data-field="duration"]')?.value);
        return {
            id:old.id||'step-'+(index+1),
            type:row.querySelector('[data-field="type"]')?.value||'other',
            label:(row.querySelector('[data-field="label"]')?.value||'').trim().slice(0,80),
            durationSeconds:Number.isFinite(minutes)&&minutes>0&&minutes<=360?Math.round(minutes*60):null,
            target:(row.querySelector('[data-field="target"]')?.value||'').trim().slice(0,120)
        };
    });
}
export function addPlannedWorkoutStep() {
    capturePlannedWorkoutSteps();
    if(editingWorkoutSteps.length>=40)return;
    editingWorkoutSteps.push({id:'step-'+Date.now(),type:'work',label:'',durationSeconds:null,target:''});
    renderPlannedWorkoutSteps();
}
export function removePlannedWorkoutStep(index) {
    capturePlannedWorkoutSteps();
    if(!Number.isInteger(index)||index<0||index>=editingWorkoutSteps.length)return;
    editingWorkoutSteps.splice(index,1);renderPlannedWorkoutSteps();
}
function readPlannedWorkoutSteps() {
    const root=document.getElementById('plan-steps-list');if(!root)return {steps:[],error:null};
    const rows=[...root.querySelectorAll('[data-workout-step]')],steps=[];
    for(let index=0;index<rows.length;index+=1){
        const row=rows[index],type=row.querySelector('[data-field="type"]')?.value||'other';
        const label=row.querySelector('[data-field="label"]')?.value.trim()||'';
        const durationMinutes=Number(row.querySelector('[data-field="duration"]')?.value);
        const target=row.querySelector('[data-field="target"]')?.value.trim()||'';
        if(!label||!Number.isFinite(durationMinutes)||durationMinutes<=0||durationMinutes>360)
            return {steps:[],error:'Bitte ergänze bei Schritt '+(index+1)+' eine Bezeichnung und eine gültige Dauer.'};
        steps.push({id:editingWorkoutSteps[index]?.id||'step-'+(index+1),
            type:WORKOUT_STEP_TYPES.some(([allowed])=>allowed===type)?type:'other',
            label:label.slice(0,80),durationSeconds:Math.round(durationMinutes*60),target:target.slice(0,120)});
    }
    return {steps,error:null};
}

export function renderPlannedWorkouts() {
    const sports=getSportsCatalog(), categories=getTypeColorMap();
    const el=document.getElementById('planned-workouts-list');
    const section=document.getElementById('planned-this-week-section');
    if(!el||!section)return;
    el.innerHTML='';
    const today=new Date();today.setHours(0,0,0,0);
    const monday=new Date(today);
    monday.setDate(today.getDate()-(today.getDay()+6)%7);
    const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    const end=toLocalDateString(sunday), todayKey=toLocalDateString(today);
    const list=[...state.plannedActivities].filter(p=>p.date>=todayKey&&p.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
    section.classList.remove('hidden');
    if(!list.length){
        el.innerHTML='<p class="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-400">Für diese Woche sind noch keine Trainingseinheiten oder Ruhetage geplant. Lege deine nächste Planung über „+ Einheit planen“ an.</p>';
        return;
    }
    list.forEach(p=>{
        const isRestDay=p.type==='RestDay';
        const cat=categories[p.category||'ga']||categories.ga, sport=isRestDay?'Ruhetag':(sports[p.type]||sports.Workout).label;
        const id=encodeURIComponent(String(p.id)).replace(/'/g,'%27');
        el.insertAdjacentHTML('beforeend', `
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <span class="text-[10px] ${cat.text}">${formatDateDDMMYY(p.date)} · ${escapeHtml(cat.label)}</span>
                    <h4 class="text-sm font-bold text-white">${escapeHtml(p.name)}</h4>
                    <p class="text-xs text-slate-400">${escapeHtml(sport)}${isRestDay?' · keine geplante Trainingsbelastung':` · ${p.duration||'—'} min · Ziel-Load ${p.targetTss??'—'}`}</p>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                    <button type="button" onclick="openPlannedWorkoutModal('${id}')" class="text-xs text-cyan-400 hover:text-white">Bearbeiten</button>
                    <button type="button" onclick="deletePlannedWorkout('${id}')" class="text-xs text-rose-400 hover:text-white">Löschen</button>
                </div>
            </div>`);
    });
}
export function deletePlannedWorkout(id){
    const decodedId=decodeURIComponent(id);
    state.plannedActivities=state.plannedActivities.filter(p=>String(p.id)!==decodedId);
    saveDataToLocalStorage();renderPlannedWorkouts();renderCalendar();
}
function setPlanField(id,value){const field=document.getElementById(id);if(field)field.value=value??'';}
export function setPlannedWorkoutKind(kind){
    const restDay=kind==='rest';
    ['plan-sport-field','plan-name-field','plan-duration-field','plan-tss-field','plan-category-field','plan-instructions-field','plan-steps-field'].forEach(id=>{const field=document.getElementById(id);if(field)field.classList.toggle('hidden',restDay);});
    const name=document.getElementById('plan-name');
    if(restDay&&name&&!name.value.trim())name.value='Ruhetag';
    if(!restDay&&name&&name.value==='Ruhetag')name.value='';
    const note=document.getElementById('plan-desc');
    if(note)note.placeholder=restDay?'Optionaler Hinweis, z. B. vollständige Trainingspause':'Intervalle im Schwellenbereich...';
    const save=document.getElementById('planned-workout-save-button');
    if(save)save.textContent=restDay?'Ruhetag speichern':(editingPlannedWorkoutId?'Änderungen speichern':'Einheit speichern');
    const title=document.getElementById('planned-workout-modal-title');
    if(title)title.textContent=restDay?(editingPlannedWorkoutId?'Ruhetag bearbeiten':'Ruhetag planen'):(editingPlannedWorkoutId?'Trainingseinheit bearbeiten':'Trainingseinheit planen');
}
export function openPlannedWorkoutModal(id=null){
    const item=id==null?null:state.plannedActivities.find(p=>String(p.id)===decodeURIComponent(String(id)));
    if(id!=null&&!item)return;
    editingPlannedWorkoutId=item?String(item.id):null;
    setPlanField('plan-date',item?.date||toLocalDateString());
    setPlanField('plan-kind',item?.type==='RestDay'?'rest':'training');
    setPlanField('plan-name',item?.name||'');
    setPlanField('plan-sport',item?.type||'Kayaking');
    const isAssessment = String(item?.category || '').startsWith('diagnostic-');
    setPlanField('plan-duration',isAssessment ? '' : item?.duration??60);
    setPlanField('plan-tss',isAssessment ? '' : item?.targetTss??70);
    setPlanField('plan-category',item?.category||'ga');
    setPlanField('plan-intensity',item?.intensity||'');
    setPlanField('plan-objective',item?.objective||'');
    setPlanField('plan-warmup',item?.warmup||'');
    setPlanField('plan-main-set',item?.mainSet||'');
    setPlanField('plan-cooldown',item?.cooldown||'');
    editingWorkoutSteps=normalizeWorkoutSteps(item?.steps);
    renderPlannedWorkoutSteps();
    setPlanField('plan-desc',item?.desc||'');
    setPlannedWorkoutKind(item?.type==='RestDay'?'rest':'training');
    const title=document.getElementById('planned-workout-modal-title');
    if(title)title.textContent=item?(item.type==='RestDay'?'Ruhetag bearbeiten':'Trainingseinheit bearbeiten'):(document.getElementById('plan-kind')?.value==='rest'?'Ruhetag planen':'Trainingseinheit planen');
    const button=document.getElementById('planned-workout-save-button');
    if(button)button.textContent=document.getElementById('plan-kind')?.value==='rest'?'Ruhetag speichern':item?'Änderungen speichern':'Einheit speichern';
    document.getElementById('planned-workout-modal')?.classList.remove('hidden');
    globalThis.lucide?.createIcons?.();
}
export function closePlannedWorkoutModal(){
    document.getElementById('planned-workout-modal')?.classList.add('hidden');
    editingPlannedWorkoutId=null;editingWorkoutSteps=[];
}
export function savePlannedWorkout(){
    const date=document.getElementById('plan-date').value||toLocalDateString();
    const isRestDay=document.getElementById('plan-kind')?.value==='rest';
    const name=isRestDay?'Ruhetag':(document.getElementById('plan-name').value||'Geplante Einheit');
    const type=isRestDay?'RestDay':document.getElementById('plan-sport').value;
    const durationRaw=document.getElementById('plan-duration').value;
    const targetTssRaw=document.getElementById('plan-tss').value;
    const category=isRestDay?'rest':document.getElementById('plan-category').value;
    const isAssessment=String(category).startsWith('diagnostic-');
    const duration=isRestDay||isAssessment||durationRaw===''?null:(parseInt(durationRaw,10)||60);
    const targetTss=isRestDay||isAssessment||targetTssRaw===''?null:(parseInt(targetTssRaw,10)||60);
    const intensity=document.getElementById('plan-intensity')?.value.trim()||'';
    const objective=document.getElementById('plan-objective')?.value.trim()||'';
    const warmup=document.getElementById('plan-warmup')?.value.trim()||'';
    const mainSet=document.getElementById('plan-main-set')?.value.trim()||'';
    const cooldown=document.getElementById('plan-cooldown')?.value.trim()||'';
    const desc=document.getElementById('plan-desc').value;
    const parsedSteps=isRestDay?{steps:[],error:null}:readPlannedWorkoutSteps();
    const error=document.getElementById('plan-steps-error');
    if(error)error.textContent=parsedSteps.error||'';
    if(parsedSteps.error)return;
    const workoutDetails={intensity,objective,warmup,mainSet,cooldown,steps:isRestDay?[]:parsedSteps.steps};
    if(editingPlannedWorkoutId!==null){
        const index=state.plannedActivities.findIndex(p=>String(p.id)===editingPlannedWorkoutId);
        if(index<0)return;
        state.plannedActivities[index]={...state.plannedActivities[index],date,name,type,duration,targetTss,category,desc,...workoutDetails};
    }else state.plannedActivities.push({id:'p-'+Date.now(),date,name,type,duration,targetTss,category,desc,...workoutDetails});
    saveDataToLocalStorage();closePlannedWorkoutModal();renderPlannedWorkouts();renderCalendar();
}


// ------------------------------------------------------------
// Standardtrainings: wiederverwendbare, datumsunabhängige Vorlagen
// ------------------------------------------------------------
let editingStandardWorkoutId = null;

export function renderStandardWorkouts() {
    const root = document.getElementById('standard-workouts-list');
    if (!root) return;
    const workouts = Array.isArray(state.standardWorkouts) ? state.standardWorkouts : [];
    if (!workouts.length) {
        root.innerHTML = '<p class="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-400">Noch keine Standardtrainings angelegt.</p>';
        return;
    }
    root.innerHTML = workouts.map(workout => {
        const id = encodeURIComponent(String(workout.id)).replace(/'/g, '%27');
        const boat = workout.discipline || workout.type || 'Kanu';
        return '<article class="rounded-xl border border-slate-800 bg-slate-950 p-3 flex flex-wrap items-center justify-between gap-3">' +
            '<div class="min-w-0"><span class="text-[10px] font-semibold tracking-wide text-cyan-300">STANDARDTRAINING · ' + escapeHtml(boat) + '</span>' +
            '<h4 class="text-sm font-bold text-white">' + escapeHtml(workout.name || 'Training') + '</h4>' +
            '<p class="text-xs text-slate-400">' + escapeHtml(workout.duration == null ? 'Dauer offen' : workout.duration + ' min') + (workout.intensity ? ' · ' + escapeHtml(workout.intensity) : '') + '</p></div>' +
            '<div class="flex items-center gap-3"><button type="button" onclick="openStandardWorkoutModal(\'' + id + '\')" class="text-xs text-cyan-400">Bearbeiten</button>' +
            '<button type="button" onclick="deleteStandardWorkout(\'' + id + '\')" class="text-xs text-rose-400">Löschen</button></div></article>';
    }).join('');
}

export function openStandardWorkoutModal(id = null) {
    const item = id == null ? null : (state.standardWorkouts || []).find(workout => String(workout.id) === decodeURIComponent(String(id)));
    if (id != null && !item) return;
    editingStandardWorkoutId = item ? String(item.id) : null;
    const values = {
        'standard-workout-name': item?.name || '',
        'standard-workout-discipline': item?.discipline || item?.type || 'K1',
        'standard-workout-duration': item?.duration ?? 60,
        'standard-workout-intensity': item?.intensity || '',
        'standard-workout-objective': item?.objective || '',
        'standard-workout-warmup': item?.warmup || '',
        'standard-workout-main': item?.mainSet || '',
        'standard-workout-cooldown': item?.cooldown || '',
        'standard-workout-desc': item?.desc || '',
        'standard-workout-steps': (item?.steps || []).map(step => [step.type || 'work', (Number(step.durationSeconds) / 60), step.label || '', step.target || ''].join(' | ')).join('\n')
    };
    Object.entries(values).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field) field.value = value;
    });
    const title = document.getElementById('standard-workout-modal-title');
    if (title) title.textContent = item ? 'Standardtraining bearbeiten' : 'Standardtraining erstellen';
    const modal = document.getElementById('standard-workout-modal');
    modal?.classList.remove('hidden');
}

export function closeStandardWorkoutModal() {
    document.getElementById('standard-workout-modal')?.classList.add('hidden');
    editingStandardWorkoutId = null;
}

export function saveStandardWorkout() {
    const value = id => document.getElementById(id)?.value?.trim() || '';
    const name = value('standard-workout-name');
    const discipline = value('standard-workout-discipline');
    const durationRaw = value('standard-workout-duration');
    const duration = durationRaw === '' ? null : Number(durationRaw);
    if (!name) { alert('Bitte gib dem Standardtraining einen Namen.'); return; }
    if (!['K1', 'C1', 'C2'].includes(discipline)) { alert('Bitte wähle K1, C1 oder C2.'); return; }
    if (duration !== null && (!Number.isFinite(duration) || duration < 1 || duration > 1440)) { alert('Bitte gib eine gültige Dauer zwischen 1 und 1440 Minuten an.'); return; }
    const stepLines = value('standard-workout-steps').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const allowedStepTypes = ['warmup', 'work', 'recovery', 'cooldown', 'other'];
    const steps = [];
    for (let index = 0; index < stepLines.length; index += 1) {
        const parts = stepLines[index].split('|').map(part => part.trim());
        const [rawType, rawMinutes, label, target] = parts;
        const type = allowedStepTypes.includes(rawType) ? rawType : 'work';
        const minutes = Number(rawMinutes);
        if (!label || !Number.isFinite(minutes) || minutes <= 0 || minutes > 360) {
            alert('Schritt ' + (index + 1) + ': Bitte nutze Typ | Minuten | Bezeichnung | Ziel.');
            return;
        }
        steps.push({ id: 'step-' + (index + 1), type, label: label.slice(0, 80), durationSeconds: Math.round(minutes * 60), target: (target || '').slice(0, 120) });
        if (steps.length > 40) { alert('Maximal 40 Schritte pro Standardtraining.'); return; }
    }
    const workout = {
        id: editingStandardWorkoutId || 'sw-' + Date.now(),
        name: name.slice(0, 120),
        type: discipline,
        discipline,
        duration,
        intensity: value('standard-workout-intensity').slice(0, 120),
        objective: value('standard-workout-objective').slice(0, 300),
        warmup: value('standard-workout-warmup').slice(0, 300),
        mainSet: value('standard-workout-main').slice(0, 500),
        cooldown: value('standard-workout-cooldown').slice(0, 300),
        desc: value('standard-workout-desc').slice(0, 300),
        category: 'ga',
        targetTss: null,
        steps,
        isStandardWorkout: true
    };
    if (!Array.isArray(state.standardWorkouts)) state.standardWorkouts = [];
    if (editingStandardWorkoutId) {
        const index = state.standardWorkouts.findIndex(entry => String(entry.id) === editingStandardWorkoutId);
        if (index < 0) return;
        state.standardWorkouts[index] = { ...state.standardWorkouts[index], ...workout };
    } else {
        state.standardWorkouts.push(workout);
    }
    saveDataToLocalStorage();
    closeStandardWorkoutModal();
    renderStandardWorkouts();
}

export function deleteStandardWorkout(id) {
    const decodedId = decodeURIComponent(String(id));
    const workout = (state.standardWorkouts || []).find(entry => String(entry.id) === decodedId);
    if (!workout || !confirm('Standardtraining "' + (workout.name || 'Training') + '" löschen?')) return;
    state.standardWorkouts = state.standardWorkouts.filter(entry => String(entry.id) !== decodedId);
    saveDataToLocalStorage();
    renderStandardWorkouts();
}
