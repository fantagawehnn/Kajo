/* ============================================================
 * strength.js – Automatische Trainingsdatenbank für Kraftübungen
 * ============================================================ */

import { state } from './state.js';
import { openCSVDetailsModal } from './activities.js?v=24';
import { saveDataToLocalStorage } from './storage.js?v=8';
import { formatDateDDMMYY, escapeHtml, toLocalDateString } from './utils.js';
import { extractStrengthRecords, groupStrengthRecords } from './strength-database.js?v=1';

export function renderStrengthView() {
    const grid = document.getElementById('strength-history-grid');
    if (!grid) return;
    const search = String(document.getElementById('strength-database-search')?.value || '').trim().toLocaleLowerCase('de');
    const records = extractStrengthRecords(state.rawActivities, state.strengthPBs);
    if (grid.dataset.activityNavigationReady !== 'true') {
        grid.dataset.activityNavigationReady = 'true';
        grid.addEventListener('click', event => {
            const button = event.target.closest('[data-strength-activity-id]');
            if (!button) return;
            const activityId = button.dataset.strengthActivityId;
            if (!activityId) return;
            openCSVDetailsModal(encodeURIComponent(activityId));
            document.getElementById('activity-edit-panel')?.classList.remove('hidden');
        });
    }
    const groups = groupStrengthRecords(records).filter(group => !search || group.exercise.toLocaleLowerCase('de').includes(search));
    const totalSets = groups.reduce((sum, group) => sum + group.entries.length, 0);
    const summary = document.getElementById('strength-database-summary');
    if (summary) summary.textContent = records.length
        ? groups.length + ' Übungen · ' + totalSets + ' dokumentierte Sätze' + (search ? ' · gefiltert' : '')
        : 'Noch keine Krafttrainingsdaten vorhanden';
    if (!groups.length) {
        grid.innerHTML = '<div class="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 text-sm text-slate-400">' +
            (search ? 'Keine Übung mit diesem Namen gefunden.' : 'Öffne eine absolvierte Krafttrainingseinheit, bearbeite dort Übungen und Sätze und speichere sie. Deine Gewichte erscheinen anschließend automatisch hier.') +
            '</div>';
        return;
    }
    grid.innerHTML = '';
    groups.forEach(group => {
        const best = group.best;
        const latest = group.entries[0];
        const history = group.entries.map(entry => {
            const origin = entry.source === 'activity' ? entry.activityName : 'Früherer manueller Eintrag';
            const activityAction = entry.source === 'activity' && entry.activityId
                ? '<button type="button" data-strength-activity-id="' + escapeHtml(entry.activityId) + '" class="mt-1 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200">Aktivität bearbeiten</button>'
                : '';
            return '<div class="flex items-center justify-between gap-3 py-2 border-t border-slate-800 text-[11px]">' +
                '<div class="min-w-0"><div class="text-slate-300">' + escapeHtml(formatDateDDMMYY(entry.date)) +
                ' · ' + escapeHtml(origin) + '</div><div class="text-slate-500">' +
                entry.reps + ' Wdh.</div>' + activityAction + '</div><strong class="shrink-0 text-white">' +
                Number(entry.weight).toLocaleString('de-DE') + ' kg</strong></div>';
        }).join('');
        grid.insertAdjacentHTML('beforeend',
            '<article class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">' +
            '<div class="flex items-start justify-between gap-2"><h3 class="font-bold text-sm text-white">' + escapeHtml(group.exercise) +
            '</h3><span class="text-[9px] uppercase tracking-wide text-cyan-300 bg-cyan-950 px-2 py-1 rounded">Automatisch</span></div>' +
            '<div class="grid grid-cols-2 gap-3">' +
            '<div><div class="text-[10px] text-slate-500">Höchstes Gewicht</div><div class="text-xl font-black text-purple-300">' +
            Number(best.weight).toLocaleString('de-DE') + ' kg</div><div class="text-[10px] text-slate-500">' + best.reps + ' Wdh. · ' + escapeHtml(formatDateDDMMYY(best.date)) + '</div></div>' +
            '<div><div class="text-[10px] text-slate-500">Zuletzt verwendet</div><div class="text-xl font-bold text-white">' +
            Number(latest.weight).toLocaleString('de-DE') + ' kg</div><div class="text-[10px] text-slate-500">' + latest.reps + ' Wdh. · ' + escapeHtml(formatDateDDMMYY(latest.date)) + '</div></div>' +
            '</div><div class="text-[10px] text-slate-500">' + group.entries.length + ' dokumentierte Sätze</div>' +
            '<details><summary class="cursor-pointer text-[11px] text-sky-400">Gesamten Verlauf anzeigen</summary><div class="mt-2">' + history + '</div></details></article>');
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
    state.strengthPBs = (state.strengthPBs || []).filter(s => String(s.id) !== decodedId);
    saveDataToLocalStorage();
    renderStrengthView();
}
