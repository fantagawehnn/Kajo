import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { validateSeasonPlan, normalizeSeasonPlan } from './season-planning.js';
import { requestSeasonPlanProposal, requestWeeklyPlanProposal } from './coach.js?v=2';
import { renderCalendar } from './calendar.js';
import { renderPlannedWorkouts } from './planning.js';

let draftPhases = [];
let pendingProposal = null;
let proposalRequestPending = false;
let pendingWeeklyProposal = null;
let weeklyProposalPending = false;

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
    if (list) list.innerHTML = plans.slice().sort((a,b) => a.weekStartDate.localeCompare(b.weekStartDate)).map(plan =>
        '<article class="rounded-lg border border-slate-800 p-2"><div class="flex justify-between gap-2"><strong class="text-xs text-white">' + escape(plan.weekStartDate) + ' – ' + escape(plan.weekEndDate) + '</strong><span class="text-[10px] text-slate-400">' + (plan.status === 'approved' ? 'Freigegeben' : plan.status === 'completed' ? 'Abgeschlossen' : 'Entwurf') + '</span></div><p class="text-xs text-slate-300 mt-1">' + escape(plan.objective) + '</p><p class="text-[10px] text-slate-500">' + plan.sessions.length + ' Einheiten</p>' + (plan.status === 'draft' ? '<button type="button" onclick="approveWeeklyPlan(\'' + escape(plan.weekStartDate) + '\')" class="mt-2 px-2 py-1 rounded bg-cyan-900 text-cyan-200 text-[10px]">Wochenplan freigeben</button>' : '') + (plan.status === 'approved' ? '<button type="button" onclick="transferWeeklyPlanToCalendar(\'' + escape(plan.weekStartDate) + '\')" class="mt-2 ml-2 px-2 py-1 rounded bg-cyan-700 text-white text-[10px]">In Kalender übernehmen</button>' : '') + '</article>'
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
        '<article class="rounded-lg border border-slate-800 p-3 space-y-1"><div class="flex justify-between gap-2"><strong class="text-xs text-white">' + escape(session.name) + '</strong><span class="text-[10px] text-slate-400">' + escape(session.date) + (session.durationMinutes ? ' · ' + session.durationMinutes + ' min' : '') + '</span></div><p class="text-[10px] text-cyan-200">' + escape([session.discipline, session.raceFormat, session.waterType, session.intensity].filter(Boolean).join(' · ')) + '</p><p class="text-xs text-slate-300">' + escape(session.objective) + '</p><p class="text-xs text-slate-400">' + escape([session.warmup, session.mainSet, session.cooldown].filter(Boolean).join(' | ')) + '</p></article>'
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


function calendarTypeForSession(session) {
    const discipline = String(session.discipline || '').toLowerCase();
    const type = String(session.type || '').toLowerCase();
    if (discipline === 'k1' || type === 'kayaking' || type === 'k1') return 'Kayaking';
    if (discipline === 'c1' || type === 'c1') return 'C1';
    if (discipline === 'c2' || type === 'c2') return 'C2';
    if (type.includes('run') || type.includes('lauf')) return 'Run';
    if (type.includes('ride') || type.includes('rad') || type.includes('cycl')) return 'Ride';
    if (type.includes('swim') || type.includes('schwimm')) return 'Swim';
    if (type.includes('weight') || type.includes('kraft') || type.includes('gym') || type.includes('strength')) return 'WeightTraining';
    return null;
}

function calendarCategoryForSession(session) {
    const raw = String(session.category || '').toLowerCase();
    if (raw.includes('interval') || raw.includes('intervall') || raw.includes('lz') || raw.includes('hz')) return 'interval';
    if (raw.includes('strength') || raw.includes('kraft')) return 'strength';
    if (raw.includes('reg') || raw.includes('recovery') || raw.includes('regen')) return 'reg';
    if (raw.includes('tech') || raw.includes('technik')) return 'tech';
    return 'ga';
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
    const additions = [];
    const skipped = [];
    for (const session of plan.sessions) {
        const linkId = 'season-' + plan.id + '-' + session.id;
        const alreadyLinked = existing.some(item => item.sourceWeeklyPlanId === plan.id && item.sourceWeeklySessionId === session.id);
        const duplicate = existing.some(item => item.date === session.date
            && String(item.name || '').trim().toLocaleLowerCase('de') === String(session.name || '').trim().toLocaleLowerCase('de')
            && item.type === calendarTypeForSession(session));
        if (alreadyLinked || duplicate) {
            skipped.push(session.name);
            continue;
        }
        const type = calendarTypeForSession(session);
        if (!type) {
            skipped.push(session.name + ' (unbekannte Trainingsart)');
            continue;
        }
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
        additions.push({
            id: linkId,
            date: session.date,
            name: session.name,
            type,
            duration: session.durationMinutes,
            targetTss: null,
            category: calendarCategoryForSession(session),
            desc: description,
            sourceWeeklyPlanId: plan.id,
            sourceWeeklySessionId: session.id
        });
    }
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
        notes: ''
    });
    ['season-phase-name','season-phase-type','season-phase-start','season-phase-end','season-phase-hours','season-phase-days','season-phase-objective','season-phase-focus'].forEach(id => setValue(id, ''));
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
    const plan = {
        ...current,
        schemaVersion: 1,
        id: current.id || 'season-' + Date.now(),
        name: value('season-plan-name').trim(),
        planningMode: value('season-plan-mode') || 'hybrid',
        planningHorizon: 'season',
        status: approve ? 'active' : 'draft',
        startDate: value('season-plan-start') || null,
        endDate: value('season-plan-end') || null,
        primaryGoal: value('season-plan-goal').trim(),
        phases: draftPhases,
        athleteApprovedAt: approve ? new Date().toISOString() : null,
        createdAt: current.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
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
