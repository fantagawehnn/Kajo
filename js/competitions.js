/* ============================================================
 * competitions.js – Wettkampfverwaltung (A-E-Klassifizierung, Countdown, Liste)
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js';
import { formatDateDDMMYY, toLocalDateString, escapeHtml, parseLocalDate } from './utils.js';
import { renderRaceTimeline } from './charts.js';
import { populateRaceRouteSelect, getRouteName, countTrainingOnRouteBefore, countTrainingOnSectionBefore, getWaterConditionSummaryBefore } from './routes.js';

const RACE_PRIORITY_META = {
    A: { title: 'International WM/EM', color: 'bg-rose-500 text-slate-950 font-black' },
    B: { title: 'International World Cup', color: 'bg-amber-400 text-slate-950 font-bold' },
    C: { title: 'PEU Cup', color: 'bg-sky-500 text-slate-950 font-bold' },
    D: { title: 'Deutsche Meisterschaft & nationale Qualifikationen', color: 'bg-emerald-400 text-slate-950 font-bold' },
    E: { title: 'Sonstige Rennen', color: 'bg-slate-400 text-slate-950 font-bold' }
};

export function getRacePriorityMeta(prio) {
    return RACE_PRIORITY_META[prio] || RACE_PRIORITY_META.C;
}

// Frühere C-Einträge waren standardmäßig als Trainingswettkämpfe angelegt.
// Da C nun für PEU Cups steht, werden eindeutig erkennbare alte Standard-C-Einträge
// als sonstige Rennen (E) weitergeführt. Alle übrigen Wettkampfdaten bleiben erhalten.
export function migrateLegacyRacePriorities() {
    let migrated = false;
    state.races.forEach(race => {
        if (race.prio === 'C' && race.label === 'Trainingswettkampf') {
            race.prio = 'E';
            race.label = 'Sonstige Rennen';
            migrated = true;
        }
    });
    if (migrated) saveDataToLocalStorage();
    return migrated;
}

export function renderRaces() {
    const container = document.getElementById('races-full-list');
    const countdownGrid = document.getElementById('races-countdown-grid');
    if (!container || !countdownGrid) return;
    container.innerHTML = '';
    countdownGrid.innerHTML = '';
    migrateLegacyRacePriorities();

    const today = new Date(); today.setHours(0,0,0,0);
    const upcoming = [...state.races]
        .filter(r => parseLocalDate(r.date) >= today)
        .sort((a,b) => a.date.localeCompare(b.date));
    const overall = upcoming[0] || null;
    const nextFor = (priorities, excluded = new Set()) => upcoming.find(r => priorities.includes(r.prio) && !excluded.has(String(r.id))) || null;
    const first = overall;
    const used = new Set(first ? [String(first.id)] : []);
    const second = nextFor(['D'], used) || nextFor(['B'], used) || nextFor(['C'], used) || nextFor(['E'], used) || nextFor(['A'], used);
    if(second)used.add(String(second.id));
    const third = nextFor(['A'], used) || nextFor(['C'], used) || nextFor(['B'], used) || nextFor(['D'], used) || nextFor(['E'], used);
    if(third)used.add(String(third.id));
    const priorityTitle = race => race?.prio === 'A' ? 'Nächster A-Wettkampf' : race?.prio === 'D' ? 'Nächster D-Wettkampf' : race?.prio === 'B' ? 'Nächster B-Wettkampf' : race?.prio === 'C' ? 'Nächster C-Wettkampf' : 'Weiterer Wettkampf';
    const chosen = [
        { title: 'Nächster Wettkampf', race: first },
        { title: second ? priorityTitle(second) : '', race: second },
        { title: third ? priorityTitle(third) : '', race: third }
    ];
    chosen.filter(slot => slot.race).sort((a,b) => a.race.date.localeCompare(b.race.date)).forEach(slot => {
        countdownGrid.insertAdjacentHTML('beforeend',raceCard(slot.title,slot.race,today));
    });
    if (!upcoming.length) {
        countdownGrid.innerHTML = '<div class="md:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-5 text-sm text-slate-400">Keine zukünftigen Wettkämpfe eingetragen.</div>';
    }

    [...state.races].sort((a,b)=>a.date.localeCompare(b.date)).forEach(r => {
        const safePrio = ['A', 'B', 'C', 'D', 'E'].includes(r.prio) ? r.prio : 'C';
        const priorityMeta = getRacePriorityMeta(safePrio);
        const prioColor = priorityMeta.color;
        const routeTrainingCount = r.routeId ? countTrainingOnRouteBefore(r.routeId, r.date) : null;
        const sectionTrainingCount = r.routeId ? countTrainingOnSectionBefore(r.routeId, r.date) : null;
        const waterSummary = r.routeId ? getWaterConditionSummaryBefore(r.routeId, r.date) : null;
        const waterRows = waterSummary?.records?.map(item => {
            const values = [];
            if (item.level != null) values.push('Pegel ' + item.level + ' ' + item.levelUnit);
            if (item.discharge != null) values.push('Abfluss ' + item.discharge + ' m³/s');
            return escapeHtml(formatDateDDMMYY(item.date) + ': ' + values.join(' · '));
        }) || [];
        const routeLabel = r.routeId ? getRouteName(r.routeId) : '';
        const routeMeta = r.routeId ? `<div class="text-[11px] text-cyan-300 mt-1">Strecke: ${escapeHtml(routeLabel)} · ${routeTrainingCount.sessions} Einheiten / ${routeTrainingCount.runs} Durchfahrten</div><div class="text-[11px] text-slate-400 mt-0.5">Gesamter Flussabschnitt: ${sectionTrainingCount.sessions} Einheiten / ${sectionTrainingCount.runs} Durchfahrten vor dem Rennen</div><div class="text-[11px] text-slate-300 mt-1">Wasserbedingungen dokumentiert: ${waterSummary?.measuredSessions || 0} Trainingseinheiten</div>${waterRows.length ? `<div class="text-[10px] text-slate-500 mt-0.5">Letzte Messungen: ${waterRows.join(" · ")}</div>` : `<div class="text-[10px] text-slate-500 mt-0.5">Noch keine Pegel- oder Abflusswerte für diesen Abschnitt dokumentiert.</div>`}` : '<div class="text-[10px] text-slate-500 mt-1">Keine Wettkampfstrecke zugeordnet</div>';
        container.insertAdjacentHTML('beforeend', `
            <div class="bg-slate-950 p-4 rounded-xl border border-rose-900/40 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="px-2 py-0.5 text-[10px] rounded ${prioColor}">${safePrio}-Wettkampf</span>
                        <span class="text-xs text-rose-400 font-semibold">${escapeHtml(priorityMeta.title)}</span>
                    </div>
                    <h4 class="font-bold text-sm text-white mt-1">${escapeHtml(r.name)}</h4>
                    <div class="text-xs text-slate-400 font-mono mt-0.5">Datum: ${formatDateDDMMYY(r.date)} | Ziel: ${escapeHtml(r.target)}</div>
                    ${routeMeta}
                </div>
                <button onclick="deleteRace('${encodeURIComponent(String(r.id)).replace(/'/g, '%27')}')" class="shrink-0 text-slate-500 hover:text-rose-400 text-xs">Löschen</button>
            </div>
        `);
    });
    renderRaceTimeline();
    globalThis.lucide?.createIcons?.();
}

function raceCard(title, race, today) {
    const priority = ['A','B','C','D','E'].includes(race.prio) ? race.prio : 'C';
    const meta = getRacePriorityMeta(priority);
    const days = Math.max(0, Math.ceil((parseLocalDate(race.date) - today) / 86400000));
    const badge = priority === 'A' ? 'bg-rose-500 text-slate-950' : priority === 'D' ? 'bg-emerald-400 text-slate-950' : priority === 'B' ? 'bg-amber-400 text-slate-950' : priority === 'C' ? 'bg-sky-500 text-slate-950' : 'bg-slate-400 text-slate-950';
    return `
        <article class="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 min-w-0">
            <div class="flex items-center justify-between gap-2"><span class="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">${escapeHtml(title)}</span><span class="px-2 py-0.5 text-[10px] rounded font-bold ${badge}">${priority}</span></div>
            <h3 class="font-bold text-sm text-white break-words">${escapeHtml(race.name)}</h3>
            <div class="text-xs text-slate-400">${formatDateDDMMYY(race.date)} · ${escapeHtml(race.location || 'Ort offen')}</div>
            <div class="text-xs text-sky-300 font-semibold">${days === 0 ? 'Heute' : 'Noch ' + days + ' Tage'}</div>
            <div class="text-[10px] text-slate-500">${escapeHtml(race.sport || '')}</div>
        </article>`;
}

export function openNextRaceDetail() {
    const today = toLocalDateString();
    const next = [...(Array.isArray(state.races) ? state.races : [])]
        .filter(race => race?.date >= today)
        .sort((a,b) => String(a.date).localeCompare(String(b.date)))[0];
    if (!next) return;
    const root = document.getElementById('race-detail-content');
    const modal = document.getElementById('race-detail-modal');
    if (!root || !modal) return;
    const priority = ['A','B','C','D','E'].includes(next.prio) ? next.prio : 'C';
    const meta = getRacePriorityMeta(priority);
    const days = Math.max(0, Math.ceil((parseLocalDate(next.date) - parseLocalDate(today)) / 86400000));
    const details = [
        ['Datum', formatDateDDMMYY(next.date)],
        ['Ort', next.location || null],
        ['Sport / Disziplin', next.sport || null],
        ['Wettkampfkategorie', meta.title],
        ['Ziel', next.target || null],
        ['Strecke', next.routeId ? getRouteName(next.routeId) : null],
        ['Countdown', days === 0 ? 'Heute' : days === 1 ? 'Morgen' : 'In ' + days + ' Tagen']
    ].filter(([,value]) => value != null && value !== '');
    const planned = (Array.isArray(state.plannedActivities) ? state.plannedActivities : []).filter(item => item.date === next.date);
    root.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'rounded-xl border border-slate-700 bg-slate-950/70 p-3';
    const name = document.createElement('h3'); name.className = 'text-base font-bold text-white'; name.textContent = next.name || 'Wettkampf';
    const badge = document.createElement('span'); badge.className = 'inline-block mt-2 rounded-md px-2 py-1 text-[10px] font-bold bg-sky-500/15 text-sky-300'; badge.textContent = priority + ' · ' + meta.title;
    heading.append(name,badge); root.appendChild(heading);
    const list = document.createElement('dl'); list.className = 'grid grid-cols-2 gap-3';
    details.forEach(([label,value]) => {
        const cell = document.createElement('div'); cell.className = 'min-w-0';
        const dt = document.createElement('dt'); dt.className = 'text-[10px] text-slate-500'; dt.textContent = label;
        const dd = document.createElement('dd'); dd.className = 'text-xs text-slate-200 mt-1 break-words'; dd.textContent = value;
        cell.append(dt,dd); list.appendChild(cell);
    });
    root.appendChild(list);
    if (planned.length) {
        const planHeading = document.createElement('h4'); planHeading.className = 'text-xs font-semibold text-white pt-2'; planHeading.textContent = 'Geplante Einheiten am Wettkampftag';
        root.appendChild(planHeading);
        planned.forEach(item => {
            const row = document.createElement('p'); row.className = 'text-xs text-slate-300'; row.textContent = (item.name || 'Training') + ' · ' + (item.type || 'Sportart offen') + (item.duration != null ? ' · ' + item.duration + ' min' : '');
            root.appendChild(row);
        });
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
export function closeRaceDetail() {
    const modal = document.getElementById('race-detail-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

export function toggleRaceModal() { populateRaceRouteSelect(); document.getElementById('race-modal').classList.toggle('hidden'); }

export function addRace() {
    const name = document.getElementById('race-name').value || 'Wettkampf';
    const date = document.getElementById('race-date').value || toLocalDateString();
    const location = document.getElementById('race-location').value || '';
    const prio = document.getElementById('race-prio').value;
    const sport = document.getElementById('race-sport').value || 'K1';
    const target = document.getElementById('race-target').value || 'Ziel';
    const routeId = document.getElementById('race-route')?.value || '';
    const label = getRacePriorityMeta(prio).title;

    state.races.push({ id: Date.now().toString(), name, date, location, prio, sport, target, label, ...(routeId ? { routeId } : {}) });
    saveDataToLocalStorage();
    refreshAll();
    toggleRaceModal();
}

export function deleteRace(id) {
    const decodedId = decodeURIComponent(id);
    state.races = state.races.filter(r => String(r.id) !== decodedId);
    saveDataToLocalStorage();
    refreshAll();
}
