import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=8';
import { validateSeasonPlan, normalizeSeasonPlan, getSeasonPlanSaveState } from './season-planning.js';
import { requestSeasonPlanProposal, requestWeeklyPlanProposal, requestAdaptiveWeekAdjustment } from './coach.js?v=3';
import { renderCalendar } from './calendar.js';
import { renderPlannedWorkouts } from './planning.js';
import { buildWeeklyPlanCalendarEntries, calendarTypeForSession, calendarCategoryForSession } from './weekly-plan-calendar.js?v=2';
import { buildAdaptiveWeekReview, areSameAdaptiveSports } from './adaptive-week-review.js?v=2';

let draftPhases = [];
let pendingProposal = null;
let proposalRequestPending = false;
let pendingWeeklyProposal = null;
let weeklyProposalPending = false;
let activeAdaptiveReview = null;
let activeAdaptiveWeekStartDate = null;
let pendingAdaptiveProposal = null;
let adaptiveProposalPending = false;

const byId = id => document.getElementById(id);
const value = id => byId(id)?.value ?? '';
const setValue = (id, val) => { const el = byId(id); if (el) el.value = val ?? ''; };
const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const optionalNumber = id => value(id).trim() === '' ? null : Number(value(id));

export function renderSeasonPlanEditor() {
    const plan = normalizeSeasonPlan(state.seasonPlan);
    draftPhases = plan?.phases ? plan.phases.map(phase => ({...phase})) : [];
    setValue('season-plan-name', plan?.name || '');
    setValue('season-plan-mode', plan?.planningMode || 'hybrid');
    setValue('season-plan-start', plan?.startDate || '');
    setValue('season-plan-end', plan?.endDate || '');
    setValue('season-plan-goal', plan?.primaryGoal || '');
    const status = byId('season-plan-status');
    if (status) status.textContent = !plan ? 'Noch nicht angelegt' : plan.status === 'active' ? 'Freigegeben' : plan.status === 'completed' ? 'Abgeschlossen' : 'Entwurf';
    renderPhaseList();
    renderSeasonPlanProposal();
    renderWeeklyPlanPanel();
    const message = byId('season-plan-message');
    if (message) message.textContent = plan?.athleteApprovedAt ? 'Zuletzt von dir freigegeben: ' + new Date(plan.athleteApprovedAt).toLocaleString('de-DE') : '';
}

function renderSeasonPlanProposal() {
    const root = byId('season-plan-proposal');
    if (!root) return;
    if (!pendingProposal) {
        root.classList.add('hidden');
        return;
    }
    root.classList.remove('hidden');
    const rationale = byId('season-plan-proposal-rationale');
    if (rationale) rationale.textContent = pendingProposal.rationale || 'Der Coach hat einen Periodisierungsvorschlag erstellt.';
    const questions = byId('season-plan-proposal-questions');
    if (questions) questions.innerHTML = (pendingProposal.openQuestions || []).map(item => '<p>• ' + escape(item) + '</p>').join('');
    const phases = byId('season-plan-proposal-phases');
    if (phases) phases.innerHTML = (pendingProposal.phases || []).map(phase => `
        <article class="rounded-lg border border-slate-800 p-3 space-y-1">
            <div class="flex flex-wrap justify-between gap-2"><strong class="text-xs text-white">${escape(phase.name)}</strong><span class="text-[10px] text-slate-400">${escape(phase.startDate)} – ${escape(phase.endDate)}</span></div>
            <p class="text-xs text-slate-300">${escape(phase.objective)}</p>
            <p class="text-[10px] text-slate-500">${escape((phase.focus || []).join(' · '))}</p>
        </article>`).join('');
    const apply = byId('season-plan-proposal-apply');
    if (apply) apply.classList.toggle('hidden', pendingProposal.status !== 'ready' || !pendingProposal.phases?.length);
}

export async function generateSeasonPlanProposal() {
    const message = byId('season-plan-message');
    if (proposalRequestPending) return false;
    if (!saveSeasonPlanEditor(false)) return false;
    proposalRequestPending = true;
    if (message) message.textContent = 'Der Coach prüft Saisonrahmen, Athletenprofil und Wettkämpfe …';
    const button = document.querySelector('[onclick="generateSeasonPlanProposal()"]');
    if (button) { button.disabled = true; button.textContent = 'Vorschlag wird erstellt …'; }
    try {
        pendingProposal = await requestSeasonPlanProposal();
        renderSeasonPlanProposal();
        if (message) message.textContent = pendingProposal.status === 'ready'
            ? 'Vorschlag erstellt. Prüfe die Phasen und offenen Fragen, bevor du sie übernimmst.'
            : 'Noch kein belastbarer Vorschlag möglich. Bitte kläre die offenen Fragen.';
        return true;
    } catch (error) {
        if (message) message.textContent = error?.message || 'Der Periodisierungsvorschlag konnte nicht erstellt werden.';
        return false;
    } finally {
        proposalRequestPending = false;
        if (button) { button.disabled = false; button.textContent = '✦ Periodisierung mit Coach vorschlagen'; }
    }
}

export function applySeasonPlanProposal() {
    if (!pendingProposal || pendingProposal.status !== 'ready' || !Array.isArray(pendingProposal.phases) || !pendingProposal.phases.length) return false;
    draftPhases = pendingProposal.phases.map(phase => ({...phase}));
    renderPhaseList();
    pendingProposal = null;
    renderSeasonPlanProposal();
    const message = byId('season-plan-message');
    if (message) message.textContent = 'Die vorgeschlagenen Phasen liegen jetzt als Entwurf vor. Prüfe sie und speichere anschließend – die Freigabe erfolgt separat.';
    return true;
}

export function discardSeasonPlanProposal() {
    pendingProposal = null;
    renderSeasonPlanProposal();
    return true;
}


function renderWeeklyPlanPanel() {
    const root = byId('weekly-plan-proposal');
    if (!root) return;
    const plans = normalizeSeasonPlan(state.seasonPlan)?.weeklyPlans || [];
    const list = byId('weekly-plan-saved-list');
    const isRestDay = session => ['restday', 'rest', 'ruhetag'].includes(String(session?.type || '').toLowerCase()) || String(session?.category || '').toLowerCase() === 'rest';
    if (list) list.innerHTML = plans.slice().sort((a,b) => a.weekStartDate.localeCompare(b.weekStartDate)).map(plan =>
        '<article class="rounded-lg border border-slate-800 p-2"><div class="flex justify-between gap-2"><strong class="text-xs text-white">' + escape(plan.weekStartDate) + ' – ' + escape(plan.weekEndDate) + '</strong><span class="text-[10px] text-slate-400">' + (plan.status === 'approved' ? 'Freigegeben' : plan.status === 'completed' ? 'Abgeschlossen' : 'Entwurf') + '</span></div><p class="text-xs text-slate-300 mt-1">' + escape(plan.objective) + '</p><p class="text-[10px] text-slate-500">' + plan.sessions.filter(session => !isRestDay(session)).length + ' Trainingseinheiten · ' + plan.sessions.filter(isRestDay).length + ' Ruhetage</p>' + (plan.status === 'draft' ? '<button type="button" onclick="approveWeeklyPlan(\'' + escape(plan.weekStartDate) + '\')" class="mt-2 px-2 py-1 rounded bg-cyan-900 text-cyan-200 text-[10px]">Wochenplan freigeben</button>' : '') + (plan.status === 'approved' ? '<button type="button" onclick="reviewApprovedWeeklyPlan(\'' + escape(plan.weekStartDate) + '\')" class="mt-2 ml-2 px-2 py-1 rounded bg-slate-700 text-slate-200 text-[10px]">Woche auswerten</button><button type="button" onclick="transferWeeklyPlanToCalendar(\'' + escape(plan.weekStartDate) + '\')" class="mt-2 ml-2 px-2 py-1 rounded bg-cyan-700 text-white text-[10px]">In Kalender übernehmen</button>' : '') + '</article>'
    ).join('') || '<p class="text-xs text-slate-500">Noch keine Wochenpläne gespeichert.</p>';
    const proposal = byId('weekly-plan-proposal-content');
    if (!proposal) return;
    if (!pendingWeeklyProposal) {
        root.classList.add('hidden');
        return;
    }
    root.classList.remove('hidden');
    const rationale = byId('weekly-plan-proposal-rationale');
    if (rationale) rationale.textContent = pendingWeeklyProposal.rationale || 'Der Coach hat einen Wochenvorschlag erstellt.';
    const questions = byId('weekly-plan-proposal-questions');
    if (questions) questions.innerHTML = (pendingWeeklyProposal.openQuestions || []).map(item => '<p>• ' + escape(item) + '</p>').join('');
    const plan = pendingWeeklyProposal.weeklyPlan;
    proposal.innerHTML = plan ? '<div class="space-y-2"><p class="text-sm font-semibold text-white">' + escape(plan.objective) + '</p>' + plan.sessions.map(session =>
        '<article class="rounded-lg border border-slate-800 p-3 space-y-1"><div class="flex justify-between gap-2"><strong class="text-xs text-white">' + escape(isRestDay(session) ? 'Ruhetag' : session.name) + '</strong><span class="text-[10px] text-slate-400">' + escape(session.date) + (session.durationMinutes ? ' · ' + session.durationMinutes + ' min' : '') + '</span></div>' + (isRestDay(session) ? '<p class="text-xs text-slate-300">Keine Trainingseinheit und keine geplante Trainingsbelastung</p>' : '<p class="text-[10px] text-cyan-200">' + escape([session.discipline, session.raceFormat, session.waterType, session.intensity].filter(Boolean).join(' · ')) + '</p><p class="text-xs text-slate-300">' + escape(session.objective) + '</p><p class="text-xs text-slate-400">' + escape([session.warmup, session.mainSet, session.cooldown].filter(Boolean).join(' | ')) + '</p>') + '</article>'
    ).join('') + '</div>' : '<p class="text-xs text-amber-200">Der Coach benötigt weitere Angaben, bevor eine Trainingswoche erstellt werden kann.</p>';
    const apply = byId('weekly-plan-proposal-apply');
    if (apply) apply.classList.toggle('hidden', pendingWeeklyProposal.status !== 'ready' || !plan?.sessions?.length);
}

export async function generateWeeklyPlanProposal() {
    const message = byId('season-plan-message');
    if (weeklyProposalPending) return false;
    const startDate = value('weekly-plan-start');
    if (!startDate) {
        if (message) message.textContent = 'Bitte wähle den Montag der gewünschten Trainingswoche.';
        return false;
    }
    weeklyProposalPending = true;
    if (message) message.textContent = 'Der Coach prüft Saisonphase, Wettkämpfe, Trainingshistorie und Regeneration …';
    const button = document.querySelector('[onclick="generateWeeklyPlanProposal()"]');
    if (button) { button.disabled = true; button.textContent = 'Wochenvorschlag wird erstellt …'; }
    try {
        pendingWeeklyProposal = await requestWeeklyPlanProposal(startDate);
        renderWeeklyPlanPanel();
        if (message) message.textContent = pendingWeeklyProposal.status === 'ready'
            ? 'Wochenvorschlag erstellt. Prüfe jede Einheit, bevor du den Entwurf übernimmst.'
            : 'Noch kein belastbarer Wochenplan möglich. Bitte kläre die offenen Angaben.';
        return true;
    } catch (error) {
        if (message) message.textContent = error?.message || 'Der Wochenvorschlag konnte nicht erstellt werden.';
        return false;
    } finally {
        weeklyProposalPending = false;
        if (button) { button.disabled = false; button.textContent = '✦ Trainingswoche mit Coach planen'; }
    }
}

export function applyWeeklyPlanProposal() {
    const plan = pendingWeeklyProposal?.weeklyPlan;
    if (pendingWeeklyProposal?.status !== 'ready' || !plan?.sessions?.length) return false;
    const current = normalizeSeasonPlan(state.seasonPlan);
    if (!current || current.status !== 'active' || !current.athleteApprovedAt) return false;
    const existing = current.weeklyPlans.find(item => item.weekStartDate === plan.weekStartDate);
    if (existing?.status === 'approved' || existing?.status === 'completed') {
        const message = byId('season-plan-message');
        if (message) message.textContent = 'Für diese Woche existiert bereits ein freigegebener oder abgeschlossener Plan. Er wird nicht überschrieben.';
        return false;
    }
    const now = new Date().toISOString();
    const saved = { ...plan, status: 'draft', athleteApprovedAt: null, createdAt: existing?.createdAt || now, updatedAt: now };
    const weeklyPlans = current.weeklyPlans.filter(item => item.weekStartDate !== plan.weekStartDate).concat(saved);
    state.seasonPlan = { ...current, weeklyPlans, updatedAt: now };
    if (!saveDataToLocalStorage()) return false;
    pendingWeeklyProposal = null;
    renderWeeklyPlanPanel();
    const message = byId('season-plan-message');
    if (message) message.textContent = 'Wochenplan als Entwurf gespeichert. Prüfe ihn in der Übersicht und gib ihn bei Bedarf separat frei.';
    return true;
}

export function approveWeeklyPlan(weekStartDate) {
    const current = normalizeSeasonPlan(state.seasonPlan);
    const plan = current?.weeklyPlans.find(item => item.weekStartDate === weekStartDate);
    if (!current || current.status !== 'active' || !plan || plan.status !== 'draft') return false;
    const now = new Date().toISOString();
    const weeklyPlans = current.weeklyPlans.map(item => item.id === plan.id
        ? { ...item, status: 'approved', athleteApprovedAt: now, updatedAt: now } : item);
    state.seasonPlan = { ...current, weeklyPlans, updatedAt: now };
    if (!saveDataToLocalStorage()) return false;
    renderWeeklyPlanPanel();
    const message = byId('season-plan-message');
    if (message) message.textContent = 'Wochenplan ausdrücklich freigegeben. Er wird noch nicht automatisch in den Kalender übertragen.';
    return true;
}


export function transferWeeklyPlanToCalendar(weekStartDate) {
    const current = normalizeSeasonPlan(state.seasonPlan);
    const plan = current?.weeklyPlans.find(item => item.weekStartDate === weekStartDate);
    const message = byId('season-plan-message');
    if (!current || current.status !== 'active' || !plan || plan.status !== 'approved' || !plan.athleteApprovedAt) {
        if (message) message.textContent = 'Nur ausdrücklich freigegebene Wochenpläne können in den Kalender übernommen werden.';
        return false;
    }
    const existing = Array.isArray(state.plannedActivities) ? state.plannedActivities : [];
    const { additions, skipped } = buildWeeklyPlanCalendarEntries(plan, existing);
    if (additions.length) {
        state.plannedActivities = [...existing, ...additions];
        if (!saveDataToLocalStorage()) {
            state.plannedActivities = existing;
            if (message) message.textContent = 'Die Kalenderübernahme konnte nicht gespeichert werden. Es wurden keine Einheiten übernommen.';
            return false;
        }
        renderCalendar();
        renderPlannedWorkouts();
    }
    if (message) message.textContent = additions.length + ' Einheit(en) in den Kalender übernommen; ' + skipped.length + ' übersprungen (bereits vorhanden oder Trainingsart nicht eindeutig).';
    renderWeeklyPlanPanel();
    return true;
}

export function reviewApprovedWeeklyPlan(weekStartDate) {
    const current = normalizeSeasonPlan(state.seasonPlan);
    const plan = current?.weeklyPlans.find(item => item.weekStartDate === weekStartDate);
    const root = byId('adaptive-week-review');
    const message = byId('season-plan-message');
    if (!plan || !['approved', 'completed'].includes(plan.status) || !root) {
        if (message) message.textContent = 'Nur gespeicherte, freigegebene Wochenpläne können ausgewertet werden.';
        return false;
    }
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const review = buildAdaptiveWeekReview(plan, state.rawActivities, today);
    activeAdaptiveReview = review;
    activeAdaptiveWeekStartDate = weekStartDate;
    pendingAdaptiveProposal = null;
    root.classList.remove('hidden');
    const title = byId('adaptive-week-review-title');
    if (title) title.textContent = 'Wochenabgleich · ' + review.weekStartDate + ' bis ' + review.weekEndDate;
    const summary = byId('adaptive-week-review-summary');
    if (summary) summary.textContent = review.coverage.matchedCount + ' eindeutig zugeordnet · ' + review.coverage.ambiguousCount + ' unklar · ' + review.coverage.completedWithoutActivityCount + ' absolviert (nicht importiert) · ' + review.coverage.missedCount + ' ausgefallen · ' + review.coverage.unconfirmedPastPlanCount + ' ungeklärte vergangene Einheiten · ' + review.coverage.unplannedActivityCount + ' zusätzliche/ungeklärte Aktivitäten · ' + review.coverage.upcomingCount + ' kommende Einheiten';
    const details = byId('adaptive-week-review-details');
    if (details) {
        const rows = [
            ...review.matched.map(item => '<p>✓ ' + escape(item.planned.date) + ' · ' + escape(item.planned.name) + ' – ' + (item.matchType === 'manual' ? 'manuell' : 'automatisch') + ' zugeordnet</p>'),
            ...review.completedWithoutActivity.map(item => '<p>✓ ' + escape(item.session.date) + ' · ' + escape(item.session.name) + ' – von dir als absolviert (nicht importiert) markiert</p>'),
            ...review.missed.map(item => '<p>× ' + escape(item.session.date) + ' · ' + escape(item.session.name) + ' – von dir als ausgefallen markiert</p>'),
            ...review.ambiguous.map(item => '<p>! ' + escape(item.session.date) + ' · ' + escape(item.session.name) + ' – Zuordnung unklar</p>'),
            ...review.unmatchedPlanned.map(item => '<p>· ' + escape(item.session.date) + ' · ' + escape(item.session.name) + ' – ' + escape(item.reason) + '</p>'),
            ...review.unplannedActivities.map(item => '<p>+ ' + escape(item.activity.date) + ' · ' + escape(item.activity.name || item.activity.type || 'Aktivität') + ' – ' + escape(item.reason) + '</p>'),
            ...review.upcoming.map(item => '<p>→ ' + escape(item.date) + ' · ' + escape(item.name) + ' – noch geplant</p>')
        ];
        details.innerHTML = rows.join('') || '<p>Für diese Woche liegen keine auswertbaren Einheiten vor.</p>';
    }
    renderManualActivityLinks(plan, review);
    const note = byId('adaptive-week-review-limitations');
    if (note) note.textContent = review.limitations;
    const proposeButton = byId('adaptive-week-propose-button');
    if (proposeButton) proposeButton.classList.toggle('hidden', !review.upcoming.some(item => item.date > today) || plan.status !== 'approved');
    renderAdaptiveWeekProposal();
    if (message) message.textContent = 'Wochenabgleich erstellt. Nicht zugeordnete Einheiten werden nicht automatisch als ausgefallen bewertet.';
    root.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    return true;
}

function renderManualActivityLinks(plan, review) {
    const root = byId('adaptive-week-manual-links');
    if (!root) return;
    const linked = new Map((plan.manualActivityLinks || []).map(link => [String(link.sessionId), String(link.activityId)]));
    const statuses = new Map((plan.manualSessionStatuses || []).map(entry => [String(entry.sessionId), entry.status]));
    const actual = (Array.isArray(state.rawActivities) ? state.rawActivities : []).filter(activity =>
        typeof activity?.date === 'string' && activity.date.slice(0, 10) >= plan.weekStartDate
        && activity.date.slice(0, 10) <= plan.weekEndDate && activity.id != null
    );
    const openSessions = [...review.ambiguous.map(item => item.session), ...review.unmatchedPlanned.map(item => item.session)];
    const statusSessions = review.manualStatuses.map(item => item.session);
    const visible = [...new Map([...statusSessions, ...openSessions].map(session => [session.id, session])).values()];
    if (!visible.length) {
        root.innerHTML = '<p class="text-[10px] text-slate-500">Keine offenen Zuordnungen oder Statusangaben.</p>';
        return;
    }
    root.innerHTML = visible.map(session => {
        const sessionId = String(session.id);
        const currentId = linked.get(sessionId) || '';
        const currentStatus = statuses.get(sessionId) || '';
        const options = actual.filter(activity => activity.date.slice(0, 10) === session.date && areSameAdaptiveSports(session, activity)).map(activity => {
            const id = String(activity.id);
            const usedByOther = [...linked.entries()].some(([otherSession, otherActivity]) => otherActivity === id && otherSession !== sessionId);
            const label = [activity.name || activity.type || 'Aktivität', activity.date.slice(11,16), activity.type].filter(Boolean).join(' · ');
            return '<option value="' + escape(id) + '"' + (currentId === id ? ' selected' : '') + (usedByOther ? ' disabled' : '') + '>' + escape(label) + (usedByOther ? ' (bereits zugeordnet)' : '') + '</option>';
        }).join('');
        const disabled = currentStatus ? ' disabled' : '';
        return '<article class="rounded-lg border border-slate-800 p-2 space-y-2"><span class="block text-[11px] text-slate-300">' + escape(session.date) + ' · ' + escape(session.name) + '</span>' +
            '<label class="block text-[10px] text-slate-500">Status <select data-manual-status-session-id="' + escape(sessionId) + '" class="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"><option value="">Noch offen / nicht sicher</option><option value="completed_unrecorded"' + (currentStatus === 'completed_unrecorded' ? ' selected' : '') + '>Absolviert, aber nicht importiert</option><option value="missed"' + (currentStatus === 'missed' ? ' selected' : '') + '>Ausgefallen</option></select></label>' +
            '<label class="block text-[10px] text-slate-500">Importierte Aktivität zuordnen <select data-manual-session-id="' + escape(sessionId) + '" class="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"' + disabled + '><option value="">Keine manuelle Zuordnung</option>' + options + '</select></label></article>';
    }).join('');
    root.querySelectorAll('select[data-manual-session-id]').forEach(select =>
        select.addEventListener('change', () => setManualActivityLink(select.dataset.manualSessionId, select.value))
    );
    root.querySelectorAll('select[data-manual-status-session-id]').forEach(select =>
        select.addEventListener('change', () => setManualSessionStatus(select.dataset.manualStatusSessionId, select.value))
    );
}

export function setManualActivityLink(sessionId, activityId) {
    if (!activeAdaptiveWeekStartDate || !sessionId) return false;
    const current = normalizeSeasonPlan(state.seasonPlan);
    const plan = current?.weeklyPlans.find(item => item.weekStartDate === activeAdaptiveWeekStartDate);
    if (!current || !plan || !['approved', 'completed'].includes(plan.status)) return false;
    const session = plan.sessions.find(item => String(item.id) === String(sessionId));
    const activity = (Array.isArray(state.rawActivities) ? state.rawActivities : [])
        .find(item => item?.id != null && String(item.id) === String(activityId));
    const message = byId('season-plan-message');
    if (!session || (activityId && (!activity || activity.date?.slice(0, 10) !== session.date || !areSameAdaptiveSports(session, activity)))) {
        if (message) message.textContent = 'Eine Aktivität muss am gleichen Tag und in derselben eindeutig erkennbaren Sportart stattfinden.';
        return false;
    }
    const links = (plan.manualActivityLinks || []).filter(link => String(link.sessionId) !== String(sessionId));
    if (activityId) {
        const alreadyLinked = links.some(link => String(link.activityId) === String(activityId));
        if (alreadyLinked) {
            if (message) message.textContent = 'Diese Aktivität ist bereits einer anderen Einheit zugeordnet.';
            return false;
        }
        links.push({ sessionId: String(sessionId), activityId: String(activityId), updatedAt: new Date().toISOString() });
    }
    const previousSeasonPlan = state.seasonPlan;
    const nextPlan = {
        ...plan,
        manualActivityLinks: links,
        manualSessionStatuses: (plan.manualSessionStatuses || []).filter(entry => String(entry.sessionId) !== String(sessionId)),
        updatedAt: new Date().toISOString()
    };
    state.seasonPlan = {
        ...current,
        weeklyPlans: current.weeklyPlans.map(item => item.id === plan.id ? nextPlan : item),
        updatedAt: new Date().toISOString()
    };
    if (!saveDataToLocalStorage()) {
        state.seasonPlan = previousSeasonPlan;
        if (message) message.textContent = 'Die manuelle Aktivitätszuordnung konnte nicht gespeichert werden.';
        return false;
    }
    pendingAdaptiveProposal = null;
    reviewApprovedWeeklyPlan(activeAdaptiveWeekStartDate);
    if (message) message.textContent = activityId
        ? 'Aktivität wurde der geplanten Einheit manuell zugeordnet.'
        : 'Manuelle Aktivitätszuordnung wurde aufgehoben.';
    return true;
}

export function setManualSessionStatus(sessionId, status) {
    if (!activeAdaptiveWeekStartDate || !sessionId) return false;
    const current = normalizeSeasonPlan(state.seasonPlan);
    const plan = current?.weeklyPlans.find(item => item.weekStartDate === activeAdaptiveWeekStartDate);
    if (!current || !plan || !['approved', 'completed'].includes(plan.status)) return false;
    const session = plan.sessions.find(item => item.id === sessionId);
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    if (!session || session.date > today || !['', 'completed_unrecorded', 'missed'].includes(status)) {
        const message = byId('season-plan-message');
        if (message) message.textContent = 'Statusangaben sind nur für vergangene oder heutige Einheiten möglich.';
        return false;
    }
    const previousSeasonPlan = state.seasonPlan;
    const statuses = (plan.manualSessionStatuses || []).filter(entry => entry.sessionId !== sessionId);
    if (status) statuses.push({ sessionId, status, updatedAt: new Date().toISOString() });
    const links = (plan.manualActivityLinks || []).filter(link => link.sessionId !== sessionId);
    const nextPlan = { ...plan, manualSessionStatuses: statuses, manualActivityLinks: links, updatedAt: new Date().toISOString() };
    state.seasonPlan = { ...current, weeklyPlans: current.weeklyPlans.map(item => item.id === plan.id ? nextPlan : item), updatedAt: new Date().toISOString() };
    if (!saveDataToLocalStorage()) {
        state.seasonPlan = previousSeasonPlan;
        const message = byId('season-plan-message');
        if (message) message.textContent = 'Die Statusangabe konnte nicht gespeichert werden.';
        return false;
    }
    pendingAdaptiveProposal = null;
    reviewApprovedWeeklyPlan(activeAdaptiveWeekStartDate);
    const message = byId('season-plan-message');
    if (message) message.textContent = status === 'completed_unrecorded'
        ? 'Einheit als absolviert (nicht importiert) markiert.'
        : status === 'missed' ? 'Einheit als ausgefallen markiert.' : 'Manuelle Statusangabe aufgehoben.';
    return true;
}

function renderAdaptiveWeekProposal() {
    const root = byId('adaptive-week-proposal');
    if (!root) return;
    const content = byId('adaptive-week-proposal-content');
    if (!pendingAdaptiveProposal) {
        root.classList.add('hidden');
        return;
    }
    root.classList.remove('hidden');
    const rationale = byId('adaptive-week-proposal-rationale');
    if (rationale) rationale.textContent = pendingAdaptiveProposal.rationale || 'Der Coach hat die verbleibende Woche bewertet.';
    const questions = byId('adaptive-week-proposal-questions');
    if (questions) questions.innerHTML = (pendingAdaptiveProposal.openQuestions || []).map(item => '<p>• ' + escape(item) + '</p>').join('');
    if (content) content.innerHTML = (pendingAdaptiveProposal.changes || []).map(change => {
        const original = activeAdaptiveReview?.upcoming.find(item => item.id === change.sessionId);
        const updated = change.updatedSession;
        const actionLabels = { keep: 'Beibehalten', reduce: 'Reduzieren', modify: 'Anpassen', move: 'Verschieben', replace: 'Ersetzen' };
        return '<article class="rounded-lg border border-slate-800 p-3 space-y-1"><div class="flex justify-between gap-2"><strong class="text-xs text-white">' + escape(original?.name || change.sessionId) + '</strong><span class="text-[10px] text-cyan-200">' + escape(actionLabels[change.action] || change.action) + '</span></div><p class="text-[10px] text-slate-400">' + escape(original?.date || '') + (updated?.date && updated.date !== original?.date ? ' → ' + escape(updated.date) : '') + '</p><p class="text-xs text-slate-300">' + escape(change.rationale) + '</p>' + (updated ? '<p class="text-[10px] text-slate-400">' + escape(updated.name) + (updated.durationMinutes ? ' · ' + escape(updated.durationMinutes + ' min') : '') + (updated.intensity ? ' · ' + escape(updated.intensity) : '') + '</p><p class="text-xs text-slate-400">' + escape(updated.objective || '') + '</p>' : '') + '</article>';
    }).join('');
    const apply = byId('adaptive-week-proposal-apply');
    if (apply) apply.classList.toggle('hidden', pendingAdaptiveProposal.status !== 'ready' || !pendingAdaptiveProposal.changes?.length);
}

export async function generateAdaptiveWeekProposal() {
    const message = byId('season-plan-message');
    if (adaptiveProposalPending || !activeAdaptiveReview || !activeAdaptiveWeekStartDate) return false;
    adaptiveProposalPending = true;
    pendingAdaptiveProposal = null;
    renderAdaptiveWeekProposal();
    const button = byId('adaptive-week-propose-button');
    if (button) { button.disabled = true; button.textContent = 'Coach prüft die Woche …'; }
    if (message) message.textContent = 'Der Coach gleicht Trainingshistorie, Belastung, Regeneration und Gesundheitsdaten ab …';
    try {
        pendingAdaptiveProposal = await requestAdaptiveWeekAdjustment(activeAdaptiveWeekStartDate, activeAdaptiveReview);
        renderAdaptiveWeekProposal();
        if (message) message.textContent = pendingAdaptiveProposal.status === 'ready'
            ? 'Anpassungsvorschlag erstellt. Prüfe jede Einheit, bevor du die Änderungen freigibst.'
            : 'Noch kein belastbarer Anpassungsvorschlag möglich. Bitte kläre die offenen Fragen.';
        return true;
    } catch (error) {
        if (message) message.textContent = error?.message || 'Der Anpassungsvorschlag konnte nicht erstellt werden.';
        return false;
    } finally {
        adaptiveProposalPending = false;
        if (button) { button.disabled = false; button.textContent = '✦ Anpassungen mit Coach vorschlagen'; }
    }
}

export function discardAdaptiveWeekProposal() {
    pendingAdaptiveProposal = null;
    renderAdaptiveWeekProposal();
    return true;
}

export function applyAdaptiveWeekProposal() {
    if (pendingAdaptiveProposal?.status !== 'ready' || !activeAdaptiveWeekStartDate || !activeAdaptiveReview) return false;
    const current = normalizeSeasonPlan(state.seasonPlan);
    const plan = current?.weeklyPlans.find(item => item.weekStartDate === activeAdaptiveWeekStartDate);
    if (!current || current.status !== 'active' || !plan || plan.status !== 'approved' || !plan.athleteApprovedAt) return false;
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const matched = new Set(activeAdaptiveReview.matched.map(item => item.planned?.id).filter(Boolean));
    const ambiguous = new Set(activeAdaptiveReview.ambiguous.map(item => item.session?.id).filter(Boolean));
    const eligible = new Set(activeAdaptiveReview.upcoming.filter(item => item.date > today && !matched.has(item.id) && !ambiguous.has(item.id)).map(item => item.id));
    const nextSessions = plan.sessions.map(session => {
        const change = pendingAdaptiveProposal.changes.find(item => item.sessionId === session.id);
        if (!change || change.action === 'keep' || !eligible.has(session.id) || !change.updatedSession) return session;
        const updated = { ...session, ...change.updatedSession, id: session.id, targetLoad: session.targetLoad ?? null };
        if (updated.date <= today || updated.date < plan.weekStartDate || updated.date > plan.weekEndDate) return session;
        if (/^(c1|canadian)$/i.test(updated.discipline || '') && updated.durationMinutes != null && updated.durationMinutes > 75) return session;
        return updated;
    });
    const changedIds = new Set(nextSessions.filter((session, index) => session !== plan.sessions[index]).map(session => session.id));
    if (!changedIds.size) {
        const message = byId('season-plan-message');
        if (message) message.textContent = 'Es wurden keine gültigen zukünftigen Einheiten zur Änderung freigegeben.';
        return false;
    }
    const nextPlan = { ...plan, sessions: nextSessions, updatedAt: new Date().toISOString() };
    const nextWeeklyPlans = current.weeklyPlans.map(item => item.id === plan.id ? nextPlan : item);
    const previousSeasonPlan = state.seasonPlan;
    const previousPlanned = state.plannedActivities;
    const nextPlanned = (Array.isArray(previousPlanned) ? previousPlanned : []).map(item => {
        if (item.sourceWeeklyPlanId !== plan.id || !changedIds.has(item.sourceWeeklySessionId)) return item;
        const session = nextSessions.find(entry => entry.id === item.sourceWeeklySessionId);
        if (!session) return item;
        const description = [
            session.objective ? 'Ziel: ' + session.objective : '',
            session.intensity ? 'Intensität: ' + session.intensity : '',
            session.warmup ? 'Aufwärmen: ' + session.warmup : '',
            session.mainSet ? 'Hauptteil: ' + session.mainSet : '',
            session.cooldown ? 'Abwärmen: ' + session.cooldown : '',
            session.raceFormat ? 'Rennformat: ' + session.raceFormat : '',
            session.waterType ? 'Gewässer: ' + session.waterType : '',
            session.notes || ''
        ].filter(Boolean).join('\n');
        return {
            ...item,
            date: session.date,
            name: session.name,
            type: calendarTypeForSession(session) || item.type,
            duration: session.durationMinutes,
            category: calendarCategoryForSession(session),
            desc: description
        };
    });
    state.seasonPlan = { ...current, weeklyPlans: nextWeeklyPlans, updatedAt: new Date().toISOString() };
    state.plannedActivities = nextPlanned;
    if (!saveDataToLocalStorage()) {
        state.seasonPlan = previousSeasonPlan;
        state.plannedActivities = previousPlanned;
        const message = byId('season-plan-message');
        if (message) message.textContent = 'Die Anpassungen konnten nicht gespeichert werden. Der ursprüngliche Plan bleibt unverändert.';
        return false;
    }
    pendingAdaptiveProposal = null;
    renderAdaptiveWeekProposal();
    renderWeeklyPlanPanel();
    renderCalendar();
    renderPlannedWorkouts();
    const message = byId('season-plan-message');
    if (message) message.textContent = changedIds.size + ' zukünftige Einheit(en) wurden nach deiner Freigabe angepasst.';
    return true;
}

export function discardWeeklyPlanProposal() {
    pendingWeeklyProposal = null;
    renderWeeklyPlanPanel();
    return true;
}

function renderPhaseList() {
    const root = byId('season-plan-phases');
    if (!root) return;
    if (!draftPhases.length) {
        root.innerHTML = '<p class="text-xs text-slate-500">Noch keine Trainingsphasen eingetragen.</p>';
        return;
    }
    root.innerHTML = draftPhases.map((phase, index) => `
        <article class="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
            <div class="flex items-start justify-between gap-3"><div><h4 class="text-sm font-semibold text-white">${escape(phase.name || 'Unbenannte Phase')}</h4><p class="text-[10px] text-slate-400">${escape(phase.type || 'Typ offen')} · ${escape(phase.startDate || 'Start offen')} – ${escape(phase.endDate || 'Ende offen')}</p></div><button type="button" onclick="removeSeasonPlanPhase(${index})" class="text-xs text-rose-300 hover:text-rose-200">Entfernen</button></div>
            <p class="text-xs text-slate-300">${escape(phase.objective || 'Noch kein Schwerpunkt definiert.')}</p>
            <p class="text-[10px] text-slate-500">${phase.targetHoursPerWeek == null ? 'Umfang offen' : escape(phase.targetHoursPerWeek + ' h/Woche')} · ${phase.targetTrainingDaysPerWeek == null ? 'Trainingstage offen' : escape(phase.targetTrainingDaysPerWeek + ' Tage/Woche')} · Fokus: ${escape((phase.focus || []).join(', ') || 'nicht festgelegt')}</p>
            <p class="text-[10px] text-slate-500">Zielwerte optional · ACWR: ${phase.acwrTargetMin == null && phase.acwrTargetMax == null ? 'automatisch' : escape((phase.acwrTargetMin ?? '—') + '–' + (phase.acwrTargetMax ?? '—'))} · TSB relativ: ${phase.tsbTargetMin == null && phase.tsbTargetMax == null ? 'automatisch' : escape((phase.tsbTargetMin ?? '—') + '% bis ' + (phase.tsbTargetMax ?? '—') + '%')}</p>
        </article>`).join('');
}

export function addSeasonPlanPhase() {
    const name = value('season-phase-name').trim();
    const startDate = value('season-phase-start');
    const endDate = value('season-phase-end');
    if (!name || !startDate || !endDate) {
        const message = byId('season-plan-message');
        if (message) message.textContent = 'Bitte Phasenname, Start- und Enddatum angeben.';
        return false;
    }
    draftPhases.push({
        id: 'phase-' + Date.now() + '-' + draftPhases.length,
        name,
        type: value('season-phase-type').trim(),
        startDate,
        endDate,
        objective: value('season-phase-objective').trim(),
        focus: value('season-phase-focus').split(',').map(item => item.trim()).filter(Boolean),
        targetHoursPerWeek: optionalNumber('season-phase-hours'),
        targetTrainingDaysPerWeek: optionalNumber('season-phase-days'),
        targetSessionsPerDay: null,
        disciplineFocus: [],
        notes: '',
        acwrTargetMin: optionalNumber('season-phase-acwr-min'),
        acwrTargetMax: optionalNumber('season-phase-acwr-max'),
        tsbTargetMin: optionalNumber('season-phase-tsb-min'),
        tsbTargetMax: optionalNumber('season-phase-tsb-max')
    });
    ['season-phase-name','season-phase-type','season-phase-start','season-phase-end','season-phase-hours','season-phase-days','season-phase-objective','season-phase-focus','season-phase-acwr-min','season-phase-acwr-max','season-phase-tsb-min','season-phase-tsb-max'].forEach(id => setValue(id, ''));
    renderPhaseList();
    const message = byId('season-plan-message');
    if (message) message.textContent = 'Phase hinzugefügt. Speichere den Saisonplan, um die Änderung dauerhaft zu übernehmen.';
    return true;
}

export function removeSeasonPlanPhase(index) {
    if (!Number.isInteger(index) || index < 0 || index >= draftPhases.length) return false;
    draftPhases.splice(index, 1);
    renderPhaseList();
    const message = byId('season-plan-message');
    if (message) message.textContent = 'Phase entfernt. Speichere den Saisonplan, um die Änderung dauerhaft zu übernehmen.';
    return true;
}

export function saveSeasonPlanEditor(approve = false) {
    const current = normalizeSeasonPlan(state.seasonPlan) || {};
    const now = new Date().toISOString();
    const plan = {
        ...current,
        schemaVersion: 1,
        id: current.id || 'season-' + Date.now(),
        name: value('season-plan-name').trim(),
        planningMode: value('season-plan-mode') || 'hybrid',
        planningHorizon: 'season',
        status: 'draft',
        startDate: value('season-plan-start') || null,
        endDate: value('season-plan-end') || null,
        primaryGoal: value('season-plan-goal').trim(),
        phases: draftPhases,
        athleteApprovedAt: null,
        createdAt: current.createdAt || now,
        updatedAt: now
    };
    const approvalState = getSeasonPlanSaveState(current, plan, approve, now);
    plan.status = approvalState.status;
    plan.athleteApprovedAt = approvalState.athleteApprovedAt;
    const validation = validateSeasonPlan(plan);
    const message = byId('season-plan-message');
    if (approve && !validation.valid) {
        if (message) message.textContent = 'Freigabe nicht möglich: ' + validation.errors.join(' ');
        return false;
    }
    if (!plan.startDate || !plan.endDate || !plan.primaryGoal) {
        if (message) message.textContent = 'Bitte mindestens Saisonstart, Saisonende und das übergeordnete Saisonziel eintragen.';
        return false;
    }
    if (!validation.valid) {
        // Entwürfe dürfen unvollständige Phasen enthalten, aber keine ungültigen Phasen speichern.
        const phaseErrors = validation.errors.filter(error => !error.includes('Saisonziel fehlt') && !error.includes('Startdatum fehlt') && !error.includes('Enddatum fehlt'));
        if (phaseErrors.length) {
            if (message) message.textContent = 'Bitte prüfe die Phasen: ' + phaseErrors.join(' ');
            return false;
        }
    }
    state.seasonPlan = plan;
    if (!saveDataToLocalStorage()) {
        if (message) message.textContent = 'Speichern fehlgeschlagen: Kein aktiver Benutzerspeicher.';
        return false;
    }
    const status = byId('season-plan-status');
    if (status) status.textContent = approve ? 'Freigegeben' : 'Entwurf gespeichert';
    if (message) message.textContent = approve ? 'Saisonplan gespeichert und von dir freigegeben.' : 'Saisonplan als Entwurf gespeichert.';
    return true;
}
