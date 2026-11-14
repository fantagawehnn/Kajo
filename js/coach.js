/* ============================================================
 * coach.js – KI-Coach-Chat (lokale, regelbasierte Antwort wie im Original)
 * ============================================================ */

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { buildAthleteContext } from './coach-context.js';

/** Strukturierter, ausschließlich aus dem gespeicherten Profil abgeleiteter Coach-Kontext. */
export function getAICoachAthleteContext() {
    return buildAthleteContext(state.profile);
}

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
        if (!last) {
            reply += 'Keine Daten vorhanden.';
        } else if (last.loadMode === 'garmin-unavailable') {
            reply += 'Für die erfassten Tage liegt aktuell keine berechenbare Garmin-Load-Quelle vor. Externe TSS-Werte werden nicht als Ersatz verwendet; falls Aktivitäten ohne Garmin-Load vorliegen, bleiben ihre Tageswerte unbekannt.';
        } else if (last.load == null || last.ctl == null) {
            reply += 'Die aktuelle Trainingsbelastung ist wegen einer unvollständigen Datenabdeckung nicht berechenbar. Fehlende Tage werden nicht als Ruhetage oder Load 0 interpretiert. Bitte synchronisiere den betroffenen Garmin-Zeitraum erneut.';
        } else {
            reply += `• CTL = ${last.ctl}, ATL = ${last.atl}, Form (TSB) = ${last.tsb}.<br>`;
            reply += `• Aktueller Status: "${last.statusLabel}".`;
        }
        container.insertAdjacentHTML('beforeend', `<div class="bg-slate-950 border border-slate-800 p-3.5 rounded-2xl max-w-xl text-slate-300">${reply}</div>`);
        container.scrollTop = container.scrollHeight;
    }, 600);
}
