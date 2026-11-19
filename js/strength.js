/* ============================================================
 * strength.js – Personal Bests und Kraftleistungs-Verlauf
 * ============================================================ */

import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { formatDateDDMMYY, escapeHtml, toLocalDateString, showUndoToast } from './utils.js?v=2';

export function renderStrengthView() {
    const grid = document.getElementById('strength-history-grid');
    if (!grid) return;
    const records = Array.isArray(state.strengthPBs) ? state.strengthPBs : [];
    if (!records.length) {
        grid.innerHTML = '<div class="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 text-sm text-slate-400">Noch keine Personal Bests eingetragen. Lege deinen ersten Bestwert für eine Übung an.</div>';
        return;
    }
    const groups = new Map();
    records.forEach(record => {
        const key = String(record.exercise || 'Unbenannte Übung');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(record);
    });
    grid.innerHTML = '';
    [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'de')).forEach(([exercise, entries]) => {
        const sorted = [...entries].sort((a,b)=>Number(b.weight)-Number(a.weight) || Number(b.reps)-Number(a.reps) || String(b.date).localeCompare(String(a.date)));
        const best = sorted[0];
        const history = [...entries].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(entry => `
            <div class="flex items-center justify-between gap-2 py-1.5 border-t border-slate-800 text-[11px]">
                <span class="text-slate-400">${formatDateDDMMYY(entry.date)} · ${Number(entry.weight).toLocaleString('de-DE')} kg × ${entry.reps} Wdh.</span>
                <button onclick="deleteStrengthLog('${encodeURIComponent(String(entry.id)).replace(/'/g,'%27')}')" class="text-slate-600 hover:text-rose-400">Löschen</button>
            </div>`).join('');
        grid.insertAdjacentHTML('beforeend', `
            <article class="bg-slate-900 border border-purple-900/40 rounded-2xl p-4 space-y-2">
                <div class="flex items-start justify-between gap-2"><h3 class="font-bold text-sm text-white">${escapeHtml(exercise)}</h3><span class="text-[9px] uppercase tracking-wide text-purple-300 bg-purple-950 px-2 py-1 rounded">Bestwert</span></div>
                <div class="text-2xl font-black text-purple-300">${Number(best.weight).toLocaleString('de-DE')} kg <span class="text-xs font-medium text-slate-400">× ${best.reps} Wdh.</span></div>
                <div class="text-[10px] text-slate-500">Erreicht am ${formatDateDDMMYY(best.date)} · ${entries.length} dokumentierte Einträge</div>
                <details class="pt-1"><summary class="cursor-pointer text-[10px] text-sky-400">Verlauf anzeigen</summary><div class="mt-2">${history}</div></details>
            </article>`);
    });
    globalThis.lucide?.createIcons?.();
}

export function openStrengthModal() {
    const date=document.getElementById('str-date');
    if(date&&!date.value)date.value=toLocalDateString();
    document.getElementById('strength-modal').classList.remove('hidden');
}
export function closeStrengthModal() { document.getElementById('strength-modal').classList.add('hidden'); }

export function saveStrengthWorkout() {
    const date = document.getElementById('str-date').value || toLocalDateString();
    const exercise = document.getElementById('str-exercise').value.trim();
    const weightRaw = document.getElementById('str-weight').value;
    const repsRaw = document.getElementById('str-reps').value;
    const weight = Number(weightRaw);
    const reps = Number(repsRaw);
    if (!exercise) { alert('Bitte gib eine Übung an.'); return; }
    if (weightRaw === '' || !Number.isFinite(weight) || weight < 0 || weight > 1000) { alert('Bitte gib ein gültiges Gewicht zwischen 0 und 1000 kg ein.'); return; }
    if (!Number.isInteger(reps) || reps < 1 || reps > 100) { alert('Bitte gib 1 bis 100 Wiederholungen an.'); return; }
    if (!Array.isArray(state.strengthPBs)) state.strengthPBs = [];
    state.strengthPBs.push({ id: Date.now().toString(), date, exercise, weight, reps });
    saveDataToLocalStorage();
    closeStrengthModal();
    document.getElementById('str-exercise').value='';
    document.getElementById('str-weight').value='';
    document.getElementById('str-reps').value='1';
    renderStrengthView();
}

export function deleteStrengthLog(id) {
    const decodedId = decodeURIComponent(id);
    const previous=JSON.parse(JSON.stringify(state.strengthPBs||[]));
    if(!previous.some(item=>String(item.id)===decodedId))return;
    if(!confirm('Krafttrainings-Eintrag wirklich löschen? Du kannst den Vorgang anschließend 10 Sekunden lang rückgängig machen.'))return;
    state.strengthPBs = (state.strengthPBs || []).filter(s => String(s.id) !== decodedId);
    saveDataToLocalStorage();renderStrengthView();
    showUndoToast('Krafttrainings-Eintrag gelöscht.',()=>{state.strengthPBs=previous;saveDataToLocalStorage();renderStrengthView();});
}
