/* ============================================================
 * coach.js – passiver KI-Coach
 * ============================================================ */
import { state } from './state.js';
import { escapeHtml } from './utils.js';
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
