/* ============================================================
 * coach.js – KI-Coach-Chat (lokale, regelbasierte Antwort wie im Original)
 * ============================================================ */

import { state } from './state.js';
import { escapeHtml } from './utils.js';

export function sendAICoachMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    const container = document.getElementById('chat-messages');
    container.insertAdjacentHTML('beforeend', `<div class="bg-sky-950/60 border border-sky-800/60 p-3.5 rounded-2xl max-w-xl ml-auto text-white">${escapeHtml(msg)}</div>`);
    input.value = '';

    setTimeout(() => {
        const last = state.dailyTimeline[state.dailyTimeline.length - 1];
        let reply = `Basierend auf deinen lokalen Daten:<br>`;
        if (!last) { reply += 'Keine Daten vorhanden.'; } else {
            reply += `• CTL = ${last.ctl}, ATL = ${last.atl}, Form (TSB) = ${last.tsb}.<br>`;
            reply += `• Aktueller Status: "${last.statusLabel}".`;
        }
        container.insertAdjacentHTML('beforeend', `<div class="bg-slate-950 border border-slate-800 p-3.5 rounded-2xl max-w-xl text-slate-300">${reply}</div>`);
        container.scrollTop = container.scrollHeight;
    }, 600);
}
