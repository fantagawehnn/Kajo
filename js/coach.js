/* ============================================================
 * coach.js – lokaler, kontextbasierter KAJO-Coach
 *
 * Nutzt den zentralen Athlete Context ausschließlich lokal.
 * Keine externe KI, kein Netzwerkzugriff und keine Speicherung.
 * ============================================================ */

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { buildAthleteContext } from './athlete-context.js';

function formatNumber(value, digits = 0) {
    return Number.isFinite(value) ? value.toFixed(digits).replace('.', ',') : 'nicht verfügbar';
}

function buildLocalCoachReply(context) {
    const lines = ['Dein aktueller Trainingskontext:'];
    const activities = context.performanceContext.allActivities;
    const canoeActivities = context.performanceContext.canoeActivities;
    const timeline = context.trainingLoad.timeline;
    const latestDay = timeline.length ? timeline[timeline.length - 1] : null;
    const checkins = context.recovery.checkins;
    const latestCheckin = checkins.length ? checkins[checkins.length - 1] : null;
    const nextRace = context.season.races[0];
    const nextPlanned = context.season.plannedActivities[0];

    lines.push('');
    lines.push(`• Aktivitäten in den letzten 90 Tagen: ${activities.length}; davon ${canoeActivities.length} Kanu-Performanceeinheiten.`);

    if (!latestDay) {
        lines.push('• Trainingsbelastung: Es liegen keine Tageswerte im betrachteten Zeitraum vor.');
    } else if (latestDay.load === null || latestDay.dataStatus === 'unknown'
        || latestDay.dataStatus === 'incomplete-activity-load') {
        lines.push(`• Trainingsbelastung am ${latestDay.date}: nicht zuverlässig berechenbar. Der Tag wird nicht als Ruhetag oder Belastung 0 gewertet.`);
    } else {
        lines.push(`• Trainingsbelastung am ${latestDay.date}: ${formatNumber(latestDay.load)} ${latestDay.loadUnit || ''} (Quelle: ${latestDay.loadMode || context.trainingLoad.selectedSource || 'nicht angegeben'}).`);
        if (latestDay.ctl !== null || latestDay.atl !== null || latestDay.tsb !== null) {
            lines.push(`  CTL: ${formatNumber(latestDay.ctl, 1)} | ATL: ${formatNumber(latestDay.atl, 1)} | TSB: ${formatNumber(latestDay.tsb, 1)}.`);
        }
    }

    if (latestCheckin) {
        const values = latestCheckin.values;
        const available = [];
        if (values.sleepDuration != null) available.push(`Schlafdauer ${formatNumber(values.sleepDuration, 1)} h`);
        if (values.sleepQuality != null) available.push(`Schlafqualität ${formatNumber(values.sleepQuality)}`);
        if (values.fatigue != null) available.push(`Müdigkeit ${formatNumber(values.fatigue)}`);
        if (values.hrv != null) available.push(`HRV ${formatNumber(values.hrv)}`);
        if (values.rhr != null) available.push(`Ruhepuls ${formatNumber(values.rhr)}`);
        lines.push(available.length
            ? `• Letzter Check-in (${latestCheckin.date}): ${available.join(', ')}.`
            : `• Letzter Check-in (${latestCheckin.date}): keine auswertbaren Messwerte.`);
    } else {
        lines.push('• Erholung: Im betrachteten Zeitraum liegt kein Check-in vor.');
    }

    if (context.recovery.healthEvents.length) {
        const events = context.recovery.healthEvents
            .map(event => `${event.date}: ${event.status === 'sick' ? 'Krankheit' : 'Verletzung'}`);
        lines.push(`• Dokumentierte Gesundheitsereignisse: ${events.join('; ')}. Das ist ein Hinweis zur Einordnung, keine medizinische Bewertung.`);
    }

    if (nextRace) {
        lines.push(`• Nächster eingetragener Wettkampf: ${nextRace.name || 'ohne Namen'} am ${nextRace.date}${nextRace.priority ? ` (Priorität ${nextRace.priority})` : ''}.`);
    } else {
        lines.push('• Kein zukünftiger Wettkampf im Kalender eingetragen.');
    }

    if (nextPlanned) {
        lines.push(`• Nächste geplante Einheit: ${nextPlanned.name || nextPlanned.type || 'Training'} am ${nextPlanned.date}.`);
    }

    lines.push('');
    lines.push('Hinweis: Dies ist eine lokale Datenübersicht, noch keine KI-generierte Trainingsberatung. Fehlende oder unvollständige Daten werden nicht durch Schätzwerte ersetzt.');
    return lines.join('\n');
}

export function sendAICoachMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    const container = document.getElementById('chat-messages');
    if (!container) return;

    const userMessage = document.createElement('div');
    userMessage.className = 'bg-sky-950/60 border border-sky-800/60 p-3.5 rounded-2xl max-w-xl ml-auto text-white';
    userMessage.textContent = msg;
    container.appendChild(userMessage);
    input.value = '';

    const context = buildAthleteContext(state);
    const reply = buildLocalCoachReply(context);
    const coachMessage = document.createElement('div');
    coachMessage.className = 'bg-slate-950 border border-slate-800 p-3.5 rounded-2xl max-w-xl text-slate-300 whitespace-pre-line';
    coachMessage.textContent = reply;
    container.appendChild(coachMessage);
    container.scrollTop = container.scrollHeight;
}
