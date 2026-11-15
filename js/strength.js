/* ============================================================
 * strength.js – Krafttraining, Satzprotokolle und Personal Bests
 * ============================================================ */
import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=2';
import { formatDateDDMMYY, escapeHtml, toLocalDateString } from './utils.js';

const numberDE = value => Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const safeArray = value => Array.isArray(value) ? value : [];

export function renderStrengthView() { renderStrengthLogs(); renderStrengthPersonalBests(); }

function renderStrengthLogs() {
    const grid = document.getElementById('strength-workout-history');
    const summary = document.getElementById('strength-workout-summary');
    if (!grid) return;
    const records = safeArray(state.strengthLogs).filter(record => record && typeof record === 'object');
    const sorted = [...records].sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    const totalSets = records.reduce((sum, record) => sum + safeArray(record.sets).length, 0);
    const totalVolume = records.reduce((sum, record) => sum + safeArray(record.sets).reduce((v,set) => {
        const weight=Number(set?.weight), reps=Number(set?.reps);
        return v + (Number.isFinite(weight)&&Number.isFinite(reps) ? weight*reps : 0);
    },0),0);
    if (summary) summary.innerHTML = `
        <div class="rounded-xl bg-slate-950/70 p-3"><div class="text-[10px] text-slate-500">Übungen dokumentiert</div><div class="text-xl font-bold text-white">${records.length}</div></div>
        <div class="rounded-xl bg-slate-950/70 p-3"><div class="text-[10px] text-slate-500">Sätze gesamt</div><div class="text-xl font-bold text-white">${totalSets}</div></div>
        <div class="rounded-xl bg-slate-950/70 p-3"><div class="text-[10px] text-slate-500">Volumen gesamt</div><div class="text-xl font-bold text-cyan-300">${numberDE(totalVolume)} kg</div></div>`;
    if (!sorted.length) { grid.innerHTML='<div class="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">Noch keine Krafttrainings dokumentiert. Erfasse deine erste Übung mit den absolvierten Sätzen.</div>'; return; }
    grid.innerHTML = sorted.map(record => {
        const sets=safeArray(record.sets);
        const volume=sets.reduce((sum,set)=>sum+(Number(set?.weight)||0)*(Number(set?.reps)||0),0);
        const rows=sets.map((set,i)=>`<div class="grid grid-cols-4 gap-2 border-t border-slate-800 py-1.5 text-[11px]"><span class="text-slate-500">Satz ${i+1}</span><span>${Number(set?.weight)||0} kg</span><span>${Number(set?.reps)||0} Wdh.</span><span class="text-right text-slate-400">${numberDE((Number(set?.weight)||0)*(Number(set?.reps)||0))} kg</span></div>`).join('');
        return `<article class="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div class="flex items-start justify-between gap-3"><div class="min-w-0"><div class="text-[10px] text-cyan-400">${formatDateDDMMYY(record.date||'')}</div><h3 class="font-semibold text-white">${escapeHtml(record.exercise||'Übung')}</h3>${record.notes?`<p class="mt-1 text-xs text-slate-400">${escapeHtml(record.notes)}</p>`:''}</div><button type="button" onclick="deleteStrengthWorkoutLog('${encodeURIComponent(String(record.id)).replace(/'/g,'%27')}')" class="shrink-0 text-[11px] text-slate-500 hover:text-rose-400">Löschen</button></div>
            <div class="grid grid-cols-2 gap-2 text-xs"><div><span class="text-slate-500">Sätze</span><div class="font-semibold text-white">${sets.length}</div></div><div><span class="text-slate-500">Volumen</span><div class="font-semibold text-cyan-300">${numberDE(volume)} kg</div></div></div>
            <details><summary class="cursor-pointer text-[11px] text-sky-400">Sätze anzeigen</summary><div class="mt-2"><div class="grid grid-cols-4 gap-2 py-1 text-[9px] uppercase text-slate-500"><span></span><span>Gewicht</span><span>Wdh.</span><span class="text-right">Volumen</span></div>${rows||'<p class="text-xs text-slate-500">Für diesen älteren Eintrag liegen keine Satzdetails vor.</p>'}</div></details>
        </article>`;
    }).join('');
}

function renderStrengthPersonalBests() {
    const grid=document.getElementById('strength-history-grid');
    if(!grid)return;
    const records=safeArray(state.strengthPBs);
    if(!records.length){grid.innerHTML='<div class="md:col-span-2 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">Noch keine Personal Bests eingetragen.</div>';return;}
    const groups=new Map();
    records.forEach(record=>{const key=String(record.exercise||'Unbenannte Übung');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);});
    grid.innerHTML=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'de')).map(([exercise,entries])=>{
        const sorted=[...entries].sort((a,b)=>Number(b.weight)-Number(a.weight)||Number(b.reps)-Number(a.reps)||String(b.date).localeCompare(String(a.date)));
        const best=sorted[0];
        const history=[...entries].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(entry=>`<div class="flex items-center justify-between gap-2 border-t border-slate-800 py-1.5 text-[11px]"><span class="text-slate-400">${formatDateDDMMYY(entry.date)} · ${numberDE(entry.weight)} kg × ${entry.reps} Wdh.</span><button type="button" onclick="deleteStrengthLog('${encodeURIComponent(String(entry.id)).replace(/'/g,'%27')}')" class="text-slate-600 hover:text-rose-400">Löschen</button></div>`).join('');
        return `<article class="space-y-2 rounded-2xl border border-purple-900/40 bg-slate-900/70 p-4"><div class="flex items-start justify-between gap-2"><h3 class="text-sm font-bold text-white">${escapeHtml(exercise)}</h3><span class="rounded bg-purple-950 px-2 py-1 text-[9px] uppercase text-purple-300">Bestwert</span></div><div class="text-2xl font-black text-purple-300">${numberDE(best.weight)} kg <span class="text-xs font-medium text-slate-400">× ${best.reps} Wdh.</span></div><div class="text-[10px] text-slate-500">Erreicht am ${formatDateDDMMYY(best.date)} · ${entries.length} Einträge</div><details class="pt-1"><summary class="cursor-pointer text-[10px] text-sky-400">Verlauf anzeigen</summary><div class="mt-2">${history}</div></details></article>`;
    }).join('');
}

export function openStrengthWorkoutModal(){const date=document.getElementById('str-workout-date');if(date&&!date.value)date.value=toLocalDateString();const sets=document.getElementById('strength-set-rows');if(sets&&!sets.children.length)addStrengthSetRow();document.getElementById('strength-workout-modal')?.classList.remove('hidden');}
export function closeStrengthWorkoutModal(){document.getElementById('strength-workout-modal')?.classList.add('hidden');}
export function addStrengthSetRow(weight='',reps='8'){
    const container=document.getElementById('strength-set-rows');if(!container)return;
    const row=document.createElement('div');row.className='grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2';
    row.innerHTML=`<span class="set-number w-5 text-[11px] text-slate-500"></span><label class="text-[10px] text-slate-400">Gewicht (kg)<input type="number" min="0" max="1000" step="0.5" value="${weight}" placeholder="0" class="strength-set-weight mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white"></label><label class="text-[10px] text-slate-400">Wiederholungen<input type="number" min="1" max="100" step="1" value="${reps}" class="strength-set-reps mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white"></label><button type="button" aria-label="Satz entfernen" class="mt-4 px-2 text-slate-500 hover:text-rose-400" onclick="this.parentElement.remove(); renumberStrengthSetRows()">×</button>`;
    container.appendChild(row);renumberStrengthSetRows();
}
export function renumberStrengthSetRows(){document.querySelectorAll('#strength-set-rows .set-number').forEach((el,index)=>{el.textContent=(index+1)+'.';});}

export function saveStrengthWorkoutLog(){
    const date=document.getElementById('str-workout-date')?.value||toLocalDateString();
    const exercise=document.getElementById('str-workout-exercise')?.value.trim()||'';
    const notes=document.getElementById('str-workout-notes')?.value.trim()||'';
    const rows=[...document.querySelectorAll('#strength-set-rows > div')];
    if(!exercise){alert('Bitte gib eine Übung an.');return;}
    if(!rows.length){alert('Bitte erfasse mindestens einen Satz.');return;}
    const sets=[];
    for(const row of rows){
        const weightRaw=row.querySelector('.strength-set-weight')?.value??'',repsRaw=row.querySelector('.strength-set-reps')?.value??'';
        const weight=Number(weightRaw),reps=Number(repsRaw);
        if(weightRaw===''||!Number.isFinite(weight)||weight<0||weight>1000||!Number.isInteger(reps)||reps<1||reps>100){alert('Bitte prüfe Gewicht und Wiederholungen in jedem Satz.');return;}
        sets.push({weight,reps});
    }
    if(!Array.isArray(state.strengthLogs))state.strengthLogs=[];
    state.strengthLogs.push({id:'strength-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),date,exercise,notes,sets});
    saveDataToLocalStorage();closeStrengthWorkoutModal();
    document.getElementById('str-workout-exercise').value='';document.getElementById('str-workout-notes').value='';document.getElementById('strength-set-rows').innerHTML='';
    renderStrengthView();
}
export function deleteStrengthWorkoutLog(id){const decodedId=decodeURIComponent(id);state.strengthLogs=safeArray(state.strengthLogs).filter(record=>String(record.id)!==decodedId);saveDataToLocalStorage();renderStrengthView();}

export function openStrengthModal(){const date=document.getElementById('str-date');if(date&&!date.value)date.value=toLocalDateString();document.getElementById('strength-modal')?.classList.remove('hidden');}
export function closeStrengthModal(){document.getElementById('strength-modal')?.classList.add('hidden');}
export function saveStrengthWorkout(){
    const date=document.getElementById('str-date').value||toLocalDateString(),exercise=document.getElementById('str-exercise').value.trim();
    const weightRaw=document.getElementById('str-weight').value,repsRaw=document.getElementById('str-reps').value;
    const weight=Number(weightRaw),reps=Number(repsRaw);
    if(!exercise){alert('Bitte gib eine Übung an.');return;}
    if(weightRaw===''||!Number.isFinite(weight)||weight<0||weight>1000){alert('Bitte gib ein gültiges Gewicht zwischen 0 und 1000 kg ein.');return;}
    if(!Number.isInteger(reps)||reps<1||reps>100){alert('Bitte gib 1 bis 100 Wiederholungen an.');return;}
    if(!Array.isArray(state.strengthPBs))state.strengthPBs=[];
    state.strengthPBs.push({id:Date.now().toString(),date,exercise,weight,reps});saveDataToLocalStorage();closeStrengthModal();
    document.getElementById('str-exercise').value='';document.getElementById('str-weight').value='';document.getElementById('str-reps').value='1';renderStrengthView();
}
export function deleteStrengthLog(id){const decodedId=decodeURIComponent(id);state.strengthPBs=safeArray(state.strengthPBs).filter(record=>String(record.id)!==decodedId);saveDataToLocalStorage();renderStrengthView();}
