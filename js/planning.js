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

export function openPlannedWorkoutModal() { const date=document.getElementById('plan-date'); if(date&&!date.value)date.value=toLocalDateString(); document.getElementById('planned-workout-modal').classList.remove('hidden'); }
export function closePlannedWorkoutModal() { document.getElementById('planned-workout-modal').classList.add('hidden'); }

export function savePlannedWorkout() {
    const date = document.getElementById('plan-date')?.value || '';
    const name = document.getElementById('plan-name')?.value.trim() || '';
    const type = document.getElementById('plan-sport')?.value || 'Workout';
    const durationRaw = document.getElementById('plan-duration')?.value ?? '';
    const targetRaw = document.getElementById('plan-tss')?.value ?? '';
    const duration = Number(durationRaw);
    const targetTss = Number(targetRaw);
    const category = document.getElementById('plan-category')?.value || 'ga';
    const desc = document.getElementById('plan-desc')?.value.trim() || '';
    const parsedDate = new Date(date + 'T12:00:00');
    const validDate = date && Number.isFinite(parsedDate.getTime())
        && parsedDate.getFullYear() + '-' + String(parsedDate.getMonth()+1).padStart(2,'0') + '-' + String(parsedDate.getDate()).padStart(2,'0') === date;

    if (!name) { alert('Bitte gib der Trainingseinheit einen Namen.'); return; }
    if (!validDate) { alert('Bitte wähle ein gültiges Trainingsdatum.'); return; }
    if (durationRaw === '' || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
        alert('Die Trainingsdauer muss zwischen 1 und 1440 Minuten liegen.'); return;
    }
    if (targetRaw === '' || !Number.isFinite(targetTss) || targetTss < 0 || targetTss > 1000) {
        alert('Die Ziel-Belastung muss zwischen 0 und 1000 liegen.'); return;
    }
    if (!Array.isArray(state.plannedActivities)) state.plannedActivities = [];
    state.plannedActivities.push({ id: 'p-' + Date.now(), date, name, type, duration, targetTss, category, desc });
    saveDataToLocalStorage();
    closePlannedWorkoutModal();
    renderCalendar();
    renderPlannedWorkouts();
}
