/* ============================================================
 * planning.js – Geplante Trainingseinheiten (Liste, Anlegen, Bearbeiten, Löschen)
 * ============================================================ */
import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=6';
import { formatDateDDMMYY, toLocalDateString, escapeHtml } from './utils.js?v=2';
import { renderCalendar } from './calendar.js';
import { createPlannedStrengthExercise, normalizePlannedStrengthExercises } from './planned-strength.js';
import { parseOptionalPlanInteger } from './planned-workout-validation.js';

let plannedStrengthExercises = [];

let editingPlannedWorkoutId = null;

export function renderPlannedWorkouts() {
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
        el.innerHTML='<p class="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-500">Noch keine Planungen für diese Woche.</p>';
        return;
    }
    list.forEach(p=>{
        const id=encodeURIComponent(String(p.id)).replace(/'/g,'%27');
        el.insertAdjacentHTML('beforeend', `
            <div class="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <span class="block text-[10px] text-slate-500">${formatDateDDMMYY(p.date)}</span>
                    <h4 class="text-xs font-semibold text-white truncate">${escapeHtml(p.name)}</h4>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                    <button type="button" onclick="openPlannedWorkoutModal('${id}')" aria-label="Planung bearbeiten" class="text-xs text-cyan-400 hover:text-white">Bearbeiten</button>
                    <button type="button" onclick="deletePlannedWorkout('${id}')" aria-label="Planung löschen" class="text-xs text-rose-400 hover:text-white">Löschen</button>
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
    const sport=document.getElementById('plan-sport')?.value;
    const strengthField=document.getElementById('plan-strength-exercises-field');
    if(strengthField)strengthField.classList.toggle('hidden',restDay||sport!=='WeightTraining');
    ['plan-sport-field','plan-name-field','plan-duration-field','plan-tss-field','plan-category-field'].forEach(id=>{const field=document.getElementById(id);if(field)field.classList.toggle('hidden',restDay);});
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
    setPlanField('plan-desc',item?.desc||'');
    plannedStrengthExercises = normalizePlannedStrengthExercises(item?.exercises);
    ['plan-strength-exercise-name','plan-strength-exercise-sets','plan-strength-exercise-reps','plan-strength-exercise-weight'].forEach(id=>setPlanField(id,id.endsWith('-sets')?'3':id.endsWith('-reps')?'8':''));
    renderPlannedStrengthExercises();
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
    editingPlannedWorkoutId=null;
    plannedStrengthExercises=[];
}
export function addPlannedStrengthExercise(){
    const name=document.getElementById('plan-strength-exercise-name')?.value||'';
    const sets=document.getElementById('plan-strength-exercise-sets')?.value||'';
    const reps=document.getElementById('plan-strength-exercise-reps')?.value||'';
    const weight=document.getElementById('plan-strength-exercise-weight')?.value||'';
    try{
        if(plannedStrengthExercises.length>=40)throw new Error('Du kannst maximal 40 Übungen pro Trainingseinheit hinterlegen.');
        plannedStrengthExercises.push(createPlannedStrengthExercise({name,sets,reps,weight}));
        ['plan-strength-exercise-name','plan-strength-exercise-weight'].forEach(id=>setPlanField(id,''));
        renderPlannedStrengthExercises();
    }catch(error){alert(error.message);}
}
export function removePlannedStrengthExercise(index){
    if(!Number.isInteger(Number(index))||Number(index)<0||Number(index)>=plannedStrengthExercises.length)return;
    plannedStrengthExercises.splice(Number(index),1);
    renderPlannedStrengthExercises();
}
function renderPlannedStrengthExercises(){
    const target=document.getElementById('plan-strength-exercise-list');
    if(!target)return;
    target.innerHTML=plannedStrengthExercises.length?plannedStrengthExercises.map((exercise,index)=>{
        const load=exercise.weight===null?'':` · ${exercise.weight} kg`;
        return `<div class="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs"><div class="min-w-0"><strong class="block truncate text-white">${escapeHtml(exercise.name)}</strong><span class="text-slate-400">${exercise.sets} Sätze · ${exercise.reps} Wdh.${load}</span></div><button type="button" onclick="removePlannedStrengthExercise(${index})" class="shrink-0 text-rose-300 hover:text-white" aria-label="${escapeHtml(exercise.name)} entfernen">Entfernen</button></div>`;
    }).join(''):'<p class="text-[11px] text-slate-500">Noch keine Übungen hinterlegt.</p>';
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
    let duration = null;
    let targetTss = null;
    try {
        if (!isRestDay && !isAssessment) {
            duration = parseOptionalPlanInteger(durationRaw, 'Die Ziel-Dauer', { min: 1, max: 1440 });
            targetTss = parseOptionalPlanInteger(targetTssRaw, 'Die Ziel-Belastung', { min: 0 });
        }
    } catch (error) {
        alert(error.message);
        return;
    }
    const desc=document.getElementById('plan-desc').value;
    const exercises=type==='WeightTraining'?normalizePlannedStrengthExercises(plannedStrengthExercises):[];
    if(editingPlannedWorkoutId!==null){
        const index=state.plannedActivities.findIndex(p=>String(p.id)===editingPlannedWorkoutId);
        if(index<0)return;
        state.plannedActivities[index]={...state.plannedActivities[index],date,name,type,duration,targetTss,category,desc,exercises};
    }else state.plannedActivities.push({id:'p-'+Date.now(),date,name,type,duration,targetTss,category,desc,exercises});
    saveDataToLocalStorage();closePlannedWorkoutModal();renderPlannedWorkouts();renderCalendar();
}
