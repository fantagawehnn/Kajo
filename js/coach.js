/* ============================================================
 * coach.js – passiver KI-Coach
 * ============================================================ */
import { state } from './state.js';
import { supabase } from './supabase-client.js';
import { buildAthleteContext } from './coach-context.js';
import { buildCoachRequestContext } from './coach-data-context.js';

const conversation = [];
let requestPending = false;

/** Strukturierter, ausschließlich aus dem gespeicherten Profil abgeleiteter Coach-Kontext. */
export function getAICoachAthleteContext() {
    return buildAthleteContext(state.profile);
}

function appendMessage(role, text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const message = document.createElement('div');
    message.className = role === 'user'
        ? 'bg-sky-950/60 border border-sky-800/60 p-3.5 rounded-2xl max-w-xl ml-auto text-white'
        : 'bg-slate-950 border border-slate-800 p-3.5 rounded-2xl max-w-xl text-slate-300';
    message.textContent = text;
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
}

function setPending(pending) {
    requestPending = pending;
    const input = document.getElementById('chat-input');
    const button = document.querySelector('#chat-input')?.parentElement?.querySelector('button');
    if (input) input.disabled = pending;
    if (button) {
        button.disabled = pending;
        button.classList.toggle('opacity-50', pending);
    }
}

export async function requestSeasonPlanProposal() {
    if (!supabase) throw new Error('Die sichere Verbindung zum KI-Coach ist nicht verfügbar.');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');

    const question = 'Erstelle einen Saison-Periodisierungsvorschlag anhand der gespeicherten Saisonplanung, des Athletenprofils und der dokumentierten Wettkämpfe.';
    const context = buildCoachRequestContext(state, question);
    const response = await fetch('/api/coach', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ task: 'season_plan_proposal', question, context, history: [] })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Der Coach konnte keinen Saisonvorschlag erstellen.');
    if (!payload.proposal || !['ready', 'needs_input'].includes(payload.proposal.status)) {
        throw new Error('Der Coach hat keinen gültigen Saisonvorschlag zurückgegeben.');
    }
    return payload.proposal;
}


export async function requestWeeklyPlanProposal(weekStartDate) {
    if (!supabase) throw new Error('Die sichere Verbindung zum KI-Coach ist nicht verfügbar.');
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(weekStartDate || ''))) throw new Error('Bitte wähle einen gültigen Wochenstart (Montag).');
    const seasonPlan = state.seasonPlan;
    if (!seasonPlan || seasonPlan.status !== 'active' || !seasonPlan.athleteApprovedAt) {
        throw new Error('Bitte gib zuerst deinen Saisonplan frei.');
    }
    const start = new Date(weekStartDate + 'T12:00:00Z');
    if (!Number.isFinite(start.getTime()) || start.getUTCDay() !== 1) throw new Error('Der ausgewählte Wochenstart muss ein Montag sein.');
    const end = new Date(start.getTime() + 6 * 86400000).toISOString().slice(0, 10);
    const phase = (seasonPlan.phases || []).find(item => item.startDate <= weekStartDate && item.endDate >= end);
    if (!phase) throw new Error('Die gesamte Woche muss innerhalb einer freigegebenen Saisonphase liegen.');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');

    const question = 'Erstelle einen individuellen Trainingswochen-Vorschlag für ' + weekStartDate + ' bis ' + end + ' innerhalb der Saisonphase ' + phase.name + '.';
    const context = buildCoachRequestContext(state, question);
    context.weeklyPlanning = {
        targetWeek: { weekStartDate, weekEndDate: end, phaseId: phase.id, phaseName: phase.name },
        existingPlannedSessions: (Array.isArray(state.plannedActivities) ? state.plannedActivities : [])
            .filter(item => item?.date >= weekStartDate && item?.date <= end)
            .map(item => ({ date: item.date, name: item.name || '', type: item.type || '', category: item.category || '' })),
        existingWeeklyPlans: (seasonPlan.weeklyPlans || [])
            .filter(item => item.weekStartDate === weekStartDate)
            .map(item => ({ status: item.status, objective: item.objective, sessions: item.sessions }))
    };
    const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ task: 'weekly_plan_proposal', question, context, history: [] })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Der Coach konnte keinen Wochenvorschlag erstellen.');
    if (!payload.proposal || !['ready', 'needs_input'].includes(payload.proposal.status)) throw new Error('Der Coach hat keinen gültigen Wochenvorschlag zurückgegeben.');
    return payload.proposal;
}

export async function sendAICoachMessage() {
    const input = document.getElementById('chat-input');
    const question = input?.value?.trim();
    if (!question || requestPending) return;

    if (!supabase) {
        appendMessage('assistant', 'Die sichere Verbindung zum KI-Coach ist nicht verfügbar, weil Supabase nicht konfiguriert ist.');
        return;
    }

    appendMessage('user', question);
    input.value = '';
    setPending(true);

    try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) throw new Error('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');

        const context = buildCoachRequestContext(state, question);
        const history = conversation.slice(-8);
        const response = await fetch('/api/coach', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ question, context, history })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Der KI-Coach konnte gerade nicht antworten.');
        if (typeof payload.answer !== 'string' || !payload.answer.trim()) {
            throw new Error('Der KI-Coach hat keine verwertbare Antwort zurückgegeben.');
        }

        conversation.push({ role: 'user', content: question });
        conversation.push({ role: 'assistant', content: payload.answer });
        if (conversation.length > 12) conversation.splice(0, conversation.length - 12);
        appendMessage('assistant', payload.answer);
    } catch (error) {
        appendMessage('assistant', error?.message || 'Beim Aufrufen des KI-Coachs ist ein Fehler aufgetreten.');
    } finally {
        setPending(false);
        input?.focus();
    }
}
