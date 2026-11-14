/* ============================================================
 * planning.js – Geplante Trainingseinheiten (Liste, Anlegen, Löschen)
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=2';
import { formatDateDDMMYY, sportsCatalog, typeColorMap, toLocalDateString, escapeHtml, getSportsCatalog, getTypeColorMap } from './utils.js';
import { renderCalendar } from './calendar.js';

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
    const end=toLocalDateString(sunday);
    const todayKey=toLocalDateString(today);
    const list=[...state.plannedActivities].filter(p=>p.date>=todayKey&&p.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
    section.classList.remove('hidden');
    if(!list.length){
        el.innerHTML='<p class="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-xs text-slate-400">Für diese Woche sind noch keine Trainingseinheiten geplant. Lege deine nächste Einheit über „+ Einheit planen“ an.</p>';
        return;
    }
    list.forEach(p=>{
        const cat=categories[p.category||'ga']||categories.ga;
        const sport=(sports[p.type]||sports.Workout).label;
        el.insertAdjacentHTML('beforeend', `
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <span class="text-[10px] ${cat.text}">${formatDateDDMMYY(p.date)} · ${escapeHtml(cat.label)}</span>
                    <h4 class="text-sm font-bold text-white">${escapeHtml(p.name)}</h4>
                    <p class="text-xs text-slate-400">${escapeHtml(sport)} · ${p.duration||'—'} min · Ziel-Load ${p.targetTss??'—'}</p>
                </div>
                <button onclick="deletePlannedWorkout('${encodeURIComponent(String(p.id)).replace(/'/g,'%27')}')" class="shrink-0 text-xs text-rose-400 hover:text-white">Löschen</button>
            </div>`);
    });
}

export function deletePlannedWorkout(id){
    const decodedId = decodeURIComponent(id);
    state.plannedActivities = state.plannedActivities.filter(p => String(p.id) !== decodedId);
    saveDataToLocalStorage();
    renderPlannedWorkouts();
    renderCalendar();
}

export function openPlannedWorkoutModal() { document.getElementById('planned-workout-modal').classList.remove('hidden'); }
export function closePlannedWorkoutModal() { document.getElementById('planned-workout-modal').classList.add('hidden'); }

export function savePlannedWorkout() {
    const date = document.getElementById('plan-date').value || toLocalDateString();
    const name = document.getElementById('plan-name').value || 'Geplante Einheit';
    const type = document.getElementById('plan-sport').value;
    const duration = parseInt(document.getElementById('plan-duration').value) || 60;
    const targetTss = parseInt(document.getElementById('plan-tss').value) || 60;
    const category = document.getElementById('plan-category').value;
    const desc = document.getElementById('plan-desc').value;

    state.plannedActivities.push({ id: 'p-' + Date.now(), date, name, type, duration, targetTss, category, desc });
    saveDataToLocalStorage();
    closePlannedWorkoutModal();
    renderCalendar();

}
