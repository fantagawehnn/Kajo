/* ============================================================
 * planning.js – Geplante Trainingseinheiten (Liste, Anlegen, Bearbeiten, Löschen)
 * ============================================================ */
import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { formatDateDDMMYY, toLocalDateString, escapeHtml, getSportsCatalog, getTypeColorMap } from './utils.js';
import { renderCalendar } from './calendar.js';

let editingPlannedWorkoutId = null;

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
        el.innerHTML='<p class="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-400">Für diese Woche sind noch keine Trainingseinheiten geplant. Lege deine nächste Einheit über „+ Einheit planen“ an.</p>';
        return;
    }
    list.forEach(p=>{
        const cat=categories[p.category||'ga']||categories.ga, sport=(sports[p.type]||sports.Workout).label;
        const id=encodeURIComponent(String(p.id)).replace(/'/g,'%27');
        el.insertAdjacentHTML('beforeend', `
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <span class="text-[10px] ${cat.text}">${formatDateDDMMYY(p.date)} · ${escapeHtml(cat.label)}</span>
                    <h4 class="text-sm font-bold text-white">${escapeHtml(p.name)}</h4>
                    <p class="text-xs text-slate-400">${escapeHtml(sport)} · ${p.duration||'—'} min · Ziel-Load ${p.targetTss??'—'}</p>
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
export function openPlannedWorkoutModal(id=null){
    const item=id==null?null:state.plannedActivities.find(p=>String(p.id)===decodeURIComponent(String(id)));
    if(id!=null&&!item)return;
    editingPlannedWorkoutId=item?String(item.id):null;
    setPlanField('plan-date',item?.date||toLocalDateString());
    setPlanField('plan-name',item?.name||'');
    setPlanField('plan-sport',item?.type||'Kayaking');
    const isAssessment = String(item?.category || '').startsWith('diagnostic-');
    setPlanField('plan-duration',isAssessment ? '' : item?.duration??60);
    setPlanField('plan-tss',isAssessment ? '' : item?.targetTss??70);
    setPlanField('plan-category',item?.category||'ga');
    setPlanField('plan-desc',item?.desc||'');
    const title=document.getElementById('planned-workout-modal-title');
    if(title)title.textContent=item?'Trainingseinheit bearbeiten':'Trainingseinheit planen';
    const button=document.getElementById('planned-workout-save-button');
    if(button)button.textContent=item?'Änderungen speichern':'Einheit speichern';
    document.getElementById('planned-workout-modal')?.classList.remove('hidden');
    globalThis.lucide?.createIcons?.();
}
export function closePlannedWorkoutModal(){
    document.getElementById('planned-workout-modal')?.classList.add('hidden');
    editingPlannedWorkoutId=null;
}
export function savePlannedWorkout(){
    const date=document.getElementById('plan-date').value||toLocalDateString();
    const name=document.getElementById('plan-name').value||'Geplante Einheit';
    const type=document.getElementById('plan-sport').value;
    const durationRaw=document.getElementById('plan-duration').value;
    const targetTssRaw=document.getElementById('plan-tss').value;
    const category=document.getElementById('plan-category').value;
    const isAssessment=String(category).startsWith('diagnostic-');
    const duration=isAssessment||durationRaw===''?null:(parseInt(durationRaw,10)||60);
    const targetTss=isAssessment||targetTssRaw===''?null:(parseInt(targetTssRaw,10)||60);
    const desc=document.getElementById('plan-desc').value;
    if(editingPlannedWorkoutId!==null){
        const index=state.plannedActivities.findIndex(p=>String(p.id)===editingPlannedWorkoutId);
        if(index<0)return;
        state.plannedActivities[index]={...state.plannedActivities[index],date,name,type,duration,targetTss,category,desc};
    }else state.plannedActivities.push({id:'p-'+Date.now(),date,name,type,duration,targetTss,category,desc});
    saveDataToLocalStorage();closePlannedWorkoutModal();renderPlannedWorkouts();renderCalendar();
}
