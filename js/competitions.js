/* ============================================================
 * competitions.js – Wettkampfverwaltung (A-E-Klassifizierung, Countdown, Liste)
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { formatDateDDMMYY, toLocalDateString, escapeHtml, parseLocalDate } from './utils.js';
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
    const seasonOverview = document.getElementById('race-season-overview');
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

    const allResults = state.races.flatMap(race => (Array.isArray(race.results) ? race.results : []).map(result => ({ ...result, race }))).filter(item => Number.isFinite(Number(item.rank)) && Number(item.rank) > 0);
    const podiums = allResults.filter(item => Number(item.rank) <= 3).length;
    const wins = allResults.filter(item => Number(item.rank) === 1).length;
    const best = allResults.length ? Math.min(...allResults.map(item => Number(item.rank))) : null;
    if (seasonOverview) seasonOverview.innerHTML =
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">' +
        '<div class="rounded-xl bg-slate-950 border border-slate-800 p-3"><div class="text-[10px] text-slate-500">Wettkämpfe</div><div class="text-xl font-bold text-white">' + state.races.length + '</div></div>' +
        '<div class="rounded-xl bg-slate-950 border border-slate-800 p-3"><div class="text-[10px] text-slate-500">Starts mit Ergebnis</div><div class="text-xl font-bold text-white">' + allResults.length + '</div></div>' +
        '<div class="rounded-xl bg-slate-950 border border-slate-800 p-3"><div class="text-[10px] text-slate-500">Podiumsplätze</div><div class="text-xl font-bold text-amber-300">' + podiums + '</div></div>' +
        '<div class="rounded-xl bg-slate-950 border border-slate-800 p-3"><div class="text-[10px] text-slate-500">Siege</div><div class="text-xl font-bold text-emerald-300">' + wins + '</div></div></div>' +
        '<p class="text-[10px] text-slate-500 mt-2">' + (best == null ? 'Noch keine Platzierungen dokumentiert.' : 'Beste dokumentierte Platzierung: ' + best + '. Platz') + ' · Es werden nur eingetragene Ergebnisse berücksichtigt.</p>';
    const sorted = [...state.races].sort((a,b) => a.date.localeCompare(b.date));
    const past = sorted.filter(race => parseLocalDate(race.date) < today);
    const future = sorted.filter(race => parseLocalDate(race.date) >= today);
    container.innerHTML = '';
    if (past.length) container.insertAdjacentHTML('beforeend', '<h3 class="text-sm font-bold text-white pt-2">Vergangene Wettkämpfe & Ergebnisse</h3>');
    [...past, ...future].forEach(race => {
        if (future.length && race === future[0]) container.insertAdjacentHTML('beforeend', '<h3 class="text-sm font-bold text-white pt-3">Kommende Wettkämpfe</h3>');
        const priority = ['A','B','C','D','E'].includes(race.prio) ? race.prio : 'C';
        const meta = getRacePriorityMeta(priority);
        const results = Array.isArray(race.results) ? race.results : [];
        const rows = results.map((result,index) =>
            '<div class="grid grid-cols-[1fr_auto] gap-2 items-center rounded-lg bg-slate-900/80 px-3 py-2">' +
            '<div class="min-w-0"><div class="text-xs font-semibold text-white">' + escapeHtml(result.discipline || 'Disziplin offen') + ' · ' + escapeHtml(result.format || 'Format offen') + (result.partner ? ' · ' + escapeHtml(result.partner) : '') + '</div>' +
            '<div class="text-[10px] text-slate-400">' + (result.time ? 'Zeit ' + escapeHtml(result.time) : 'Keine Zeit eingetragen') + (result.gap ? ' · Abstand ' + escapeHtml(result.gap) : '') + '</div></div>' +
            '<div class="flex items-center gap-2"><span class="text-sm font-bold text-white">' + Number(result.rank) + '.</span><button type="button" onclick="deleteRaceResult(\'' + encodeURIComponent(String(race.id)) + '\',' + index + ')" class="text-[10px] text-slate-500 hover:text-rose-400" aria-label="Ergebnis löschen">×</button></div></div>'
        ).join('');
        const encodedId = encodeURIComponent(String(race.id));
        const formId = 'race-result-form-' + encodedId;
        const resultForm = '<form id="' + formId + '" class="hidden grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3" onsubmit="event.preventDefault(); addRaceResult(\'' + encodedId + '\')">' +
            '<label class="text-[10px] text-slate-400">Disziplin<select name="discipline" required class="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white"><option>C1</option><option>C2</option><option>K1</option><option>K2</option></select></label>' +
            '<label class="text-[10px] text-slate-400">Rennformat<select name="format" required class="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white"><option>Classic</option><option>Sprint</option><option>Sonstiges</option></select></label>' +
            '<label class="text-[10px] text-slate-400">Platzierung *<input name="rank" type="number" min="1" step="1" required placeholder="z. B. 3" class="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white"></label>' +
            '<label class="text-[10px] text-slate-400">Rennzeit<input name="time" type="text" placeholder="z. B. 04:32.18" class="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white"></label>' +
            '<label class="text-[10px] text-slate-400">Abstand<input name="gap" type="text" placeholder="z. B. +2,14 s" class="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white"></label>' +
            '<label class="text-[10px] text-slate-400">Partner (optional)<input name="partner" type="text" class="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-xs text-white"></label>' +
            '<div class="col-span-2 sm:col-span-3 flex justify-end gap-2"><button type="button" onclick="toggleRaceResultsForm(\'' + encodedId + '\')" class="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs">Abbrechen</button><button type="submit" class="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Ergebnis speichern</button></div></form>';
        const routeTraining = race.routeId ? countTrainingOnRouteBefore(race.routeId,race.date) : null;
        const sectionTraining = race.routeId ? countTrainingOnSectionBefore(race.routeId,race.date) : null;
        const water = race.routeId ? getWaterConditionSummaryBefore(race.routeId,race.date) : null;
        const routeName = race.routeId ? getRouteName(race.routeId) : '';
        const routeInfo = race.routeId
            ? '<div class="text-[10px] text-cyan-300 mt-1">Strecke: ' + escapeHtml(routeName) + ' · ' + routeTraining.sessions + ' Einheiten / ' + routeTraining.runs + ' Durchfahrten</div><div class="text-[10px] text-slate-400">Flussabschnitt: ' + sectionTraining.sessions + ' Einheiten / ' + sectionTraining.runs + ' Durchfahrten · Wasserwerte aus ' + (water?.measuredSessions || 0) + ' Einheiten</div>'
            : '<div class="text-[10px] text-slate-500 mt-1">Keine Wettkampfstrecke zugeordnet</div>';
        container.insertAdjacentHTML('beforeend',
            '<article class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">' +
            '<div class="flex items-start justify-between gap-3"><div class="min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap"><span class="px-2 py-0.5 text-[10px] rounded ' + meta.color + '">' + priority + '</span><span class="text-[10px] text-slate-400">' + (parseLocalDate(race.date) < today ? 'Abgeschlossen' : 'Geplant') + ' · ' + escapeHtml(meta.title) + '</span></div>' +
            '<h4 class="font-bold text-sm text-white mt-1">' + escapeHtml(race.name) + '</h4><div class="text-xs text-slate-400 mt-0.5">' + formatDateDDMMYY(race.date) + ' · ' + escapeHtml(race.location || 'Ort offen') + '</div><div class="text-[10px] text-slate-400 mt-0.5">' + escapeHtml(race.sport || '') + (race.target ? ' · Ziel: ' + escapeHtml(race.target) : '') + '</div>' + routeInfo +
            '</div><button onclick="deleteRace(\'' + encodedId + '\')" class="shrink-0 text-slate-500 hover:text-rose-400 text-xs">Löschen</button></div>' +
            '<div class="space-y-2"><div class="flex items-center justify-between"><h5 class="text-xs font-semibold text-slate-200">Ergebnisse <span class="text-slate-500 font-normal">(' + results.length + ')</span></h5><button type="button" onclick="toggleRaceResultsForm(\'' + encodedId + '\')" class="text-[11px] text-cyan-300">+ Ergebnis</button></div>' +
            (rows || '<p class="text-[10px] text-slate-500">Noch keine Ergebnisse eingetragen.</p>') + resultForm + '</div></article>');
    });
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

export function toggleRaceModal() {
    populateRaceRouteSelect();
    const modal = document.getElementById('race-modal');
    if (!modal) return;

    if (modal.classList.contains('hidden')) {
        // Ein neues Wettkampfformular startet mit dem heutigen lokalen Datum.
        // Ein bereits gewähltes Datum bleibt beim erneuten Öffnen unverändert.
        const raceDateInput = document.getElementById('race-date');
        if (raceDateInput && !raceDateInput.value) raceDateInput.value = toLocalDateString();
        // Aus dem scrollbaren App-Bereich lösen, damit das Modal viewport-zentriert bleibt.
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.classList.remove('hidden');
        document.body.classList.add('kajo-modal-open');
    } else {
        modal.classList.add('hidden');
        document.body.classList.remove('kajo-modal-open');
    }
}

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

export function toggleRaceResultsForm(encodedId) {
    const form = document.getElementById('race-result-form-' + encodedId);
    if (form) form.classList.toggle('hidden');
}

export function addRaceResult(encodedId) {
    const race = state.races.find(item => String(item.id) === decodeURIComponent(encodedId));
    const form = document.getElementById('race-result-form-' + encodedId);
    if (!race || !form) return;
    const data = new FormData(form);
    const rank = Number(data.get('rank'));
    if (!Number.isInteger(rank) || rank < 1) return;
    if (!Array.isArray(race.results)) race.results = [];
    race.results.push({
        id: Date.now().toString(),
        discipline: String(data.get('discipline') || ''),
        format: String(data.get('format') || ''),
        rank,
        time: String(data.get('time') || '').trim(),
        gap: String(data.get('gap') || '').trim(),
        partner: String(data.get('partner') || '').trim()
    });
    saveDataToLocalStorage();
    refreshAll();
}

export function deleteRaceResult(encodedId, index) {
    const race = state.races.find(item => String(item.id) === decodeURIComponent(encodedId));
    if (!race || !Array.isArray(race.results) || !Number.isInteger(index)) return;
    race.results.splice(index, 1);
    saveDataToLocalStorage();
    refreshAll();
}

export function deleteRace(id) {
    const decodedId = decodeURIComponent(id);
    state.races = state.races.filter(r => String(r.id) !== decodedId);
    saveDataToLocalStorage();
    refreshAll();
}
