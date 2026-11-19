import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';
import { validateSeasonPlan, normalizeSeasonPlan } from './season-planning.js';
import { requestSeasonPlanProposal } from './coach.js';

let draftPhases = [];
let pendingProposal = null;
let proposalRequestPending = false;

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
