/* ============================================================
 * coach.js – lokaler, kontextbasierter KAJO-Coach
 *
 * Ordnet Nutzereingaben Themen zu und zeigt passende Daten aus
 * dem lokalen Athlete Context. Keine externe KI / kein Netzwerk.
 * ============================================================ */

import { state } from './state.js';
import { buildAthleteContext } from './athlete-context.js';

const INTENT_KEYWORDS = {
    load: /\b(belastung|trainingslast|training load|ctl|atl|tsb|umfang|intensität|intensitaet|belastungssteuerung)\b/i,
    recovery: /\b(erholung|regeneration|recovery|schlaf|müdigkeit|muedigkeit|疲労|hrv|ruhepuls|krank|verletz|recovery|wellness)\b/i,
    competition: /\b(wettkampf|rennen|competition|wettkampfvorbereitung|taper|peaking|priorität|prioritaet|a-race|b-race)\b/i,
    activities: /\b(aktivitäten|aktivitaeten|trainingseinheiten|einheiten|trainingstagebuch|historie|trainingshistorie|kanu|k1|c1|c2|paddeln)\b/i
};

export function classifyCoachIntent(message) {
    const text = String(message ?? '').trim();
    if (!text) return 'overview';
    for (const intent of ['load', 'recovery', 'competition', 'activities']) {
        if (INTENT_KEYWORDS[intent].test(text)) return intent;
    }
    return 'overview';
}

function formatNumber(value, digits = 0) {
    return Number.isFinite(value) ? value.toFixed(digits).replace('.', ',') : 'nicht verfügbar';
}

function getLatest(items) {
    return items.length ? items[items.length - 1] : null;
}

function formatLoadDay(day, selectedSource) {
    if (!day) return '• Es liegen keine Tageswerte im betrachteten Zeitraum vor.';
    if (day.load === null || ['unknown', 'incomplete-activity-load'].includes(day.dataStatus)) {
        return `• ${day.date}: Belastung nicht zuverlässig berechenbar. Der Tag wird nicht als Ruhetag oder Belastung 0 gewertet.`;
    }
    const source = day.loadMode || selectedSource || 'nicht angegeben';
    const lines = [`• ${day.date}: ${formatNumber(day.load)} ${day.loadUnit || ''} (Quelle: ${source}).`];
    if (day.ctl !== null || day.atl !== null || day.tsb !== null) {
        lines.push(`  CTL: ${formatNumber(day.ctl, 1)} | ATL: ${formatNumber(day.atl, 1)} | TSB: ${formatNumber(day.tsb, 1)}.`);
    }
    return lines.join('\\n');
}

function buildLoadReply(context) {
    const timeline = context.trainingLoad.timeline;
    const recent = timeline.slice(-7);
    const latest = getLatest(recent);
    const unknown = recent.filter(day => day.load === null
        || ['unknown', 'incomplete-activity-load'].includes(day.dataStatus)).length;
    const lines = ['Deine Trainingsbelastung:'];
    lines.push(formatLoadDay(latest, context.trainingLoad.selectedSource));
    lines.push(`• Im betrachteten Ausschnitt sind ${recent.length} Tage mit Timeline-Eintrag enthalten; davon ${unknown} mit unbekannter oder unvollständiger Belastung.`);
    lines.push(`• Ausgewählte Belastungsquelle: ${context.trainingLoad.selectedSource || 'nicht angegeben'}.`);
    lines.push('Ein Trend oder eine Belastungssteigerung wird hier nicht behauptet: Dafür müssen Zeitraum, Datenabdeckung und dieselbe Belastungsquelle vergleichbar sein.');
    return lines.join('\\n');
}

function buildRecoveryReply(context) {
    const lines = ['Deine Erholungsdaten:'];
    const checkins = context.recovery.checkins;
    const latest = getLatest(checkins);
    if (!latest) {
        lines.push('• Im betrachteten Zeitraum liegt kein Check-in vor. Eine Einschätzung deiner aktuellen Erholung ist deshalb nicht möglich.');
    } else {
        const v = latest.values;
        const fields = [
            ['Schlafdauer', v.sleepDuration == null ? null : `${formatNumber(v.sleepDuration, 1)} h`],
            ['Schlafqualität', v.sleepQuality],
            ['Schlafscore', v.sleepScore],
            ['Müdigkeit', v.fatigue],
            ['Muskelkater', v.soreness],
            ['Motivation', v.motivation],
            ['HRV', v.hrv],
            ['Ruhepuls', v.rhr],
            ['Stress', v.stress]
        ].filter(([, value]) => value !== null && value !== undefined);
        lines.push(fields.length
            ? `• Letzter Check-in (${latest.date}): ${fields.map(([name, value]) => `${name} ${typeof value === 'number' ? formatNumber(value, Number.isInteger(value) ? 0 : 1) : value}`).join(', ')}.`
            : `• Letzter Check-in (${latest.date}) enthält keine auswertbaren Werte.`);
        lines.push(`• Check-ins im betrachteten Zeitraum: ${checkins.length}.`);
        if (latest.provenance?.hrv) lines.push('• Für die HRV ist eine Messquellen-Angabe hinterlegt; das konkrete Messverfahren wird nicht ohne eindeutige Kennzeichnung interpretiert.');
    }
    const events = context.recovery.healthEvents;
    lines.push(events.length
        ? `• Dokumentierte Gesundheitsereignisse: ${events.map(e => `${e.date}: ${e.status === 'sick' ? 'Krankheit' : 'Verletzung'}`).join('; ')}.`
        : '• Im betrachteten Zeitraum sind keine Krankheit oder Verletzung als Ereignis dokumentiert.');
    lines.push('Das ist eine Datenübersicht, keine medizinische Beurteilung. Fehlende Einträge sind kein Nachweis für Beschwerdefreiheit.');
    return lines.join('\\n');
}

function buildCompetitionReply(context) {
    const lines = ['Dein Wettkampf- und Planungskontext:'];
    const race = context.season.races[0];
    if (race) {
        lines.push(`• Nächster eingetragener Wettkampf: ${race.name || 'ohne Namen'} am ${race.date}${race.priority ? ` (Priorität ${race.priority})` : ''}.`);
        if (race.location) lines.push(`  Ort: ${race.location}.`);
        if (race.target) lines.push(`  Eingetragenes Ziel: ${race.target}.`);
    } else {
        lines.push('• Es ist kein zukünftiger Wettkampf im Kalender eingetragen.');
    }
    const planned = context.season.plannedActivities.slice(0, 5);
    lines.push(planned.length
        ? `• Nächste geplante Einheiten: ${planned.map(item => `${item.date}: ${item.name || item.type || 'Training'}`).join('; ')}.`
        : '• Im Planungshorizont sind keine geplanten Einheiten hinterlegt.');
    lines.push('Eine Taper- oder Wettkampfempfehlung leite ich daraus noch nicht ab: Dafür fehlen hier unter anderem bestätigte Wettkampfziele, individuelle Reaktionsdaten und ein validiertes Planungsmodell.');
    return lines.join('\\n');
}

function buildActivitiesReply(context) {
    const all = context.performanceContext.allActivities;
    const canoe = context.performanceContext.canoeActivities;
    const latestCanoe = getLatest(canoe);
    const lines = ['Deine Trainingshistorie:'];
    lines.push(`• Erfasste Aktivitäten im betrachteten Zeitraum: ${all.length}.`);
    lines.push(`• Davon Kanu-Performanceeinheiten (K1/Kayaking, C1, C2): ${canoe.length}.`);
    lines.push(`• Ergänzende Sportarten und weitere Aktivitätstypen: ${all.length - canoe.length}.`);
    lines.push(latestCanoe
        ? `• Letzte erfasste Kanu-Performanceeinheit: ${latestCanoe.date || 'Datum nicht verfügbar'} – ${latestCanoe.name || latestCanoe.type}.`
        : '• Im betrachteten Zeitraum ist keine Kanu-Performanceeinheit erfasst.');
    lines.push('Die Anzahl erfasster Aktivitäten ist nicht gleichbedeutend mit vollständiger Trainingsdokumentation.');
    return lines.join('\\n');
}

function buildOverviewReply(context) {
    const all = context.performanceContext.allActivities;
    const canoe = context.performanceContext.canoeActivities;
    const latestDay = getLatest(context.trainingLoad.timeline);
    const latestCheckin = getLatest(context.recovery.checkins);
    const race = context.season.races[0];
    const lines = ['Dein aktueller Trainingskontext:'];
    lines.push(`• Aktivitäten im betrachteten Zeitraum: ${all.length}; davon ${canoe.length} Kanu-Performanceeinheiten.`);
    lines.push(formatLoadDay(latestDay, context.trainingLoad.selectedSource));
    lines.push(latestCheckin
        ? `• Letzter Check-in: ${latestCheckin.date}.`
        : '• Kein Check-in im betrachteten Zeitraum vorhanden.');
    lines.push(race
        ? `• Nächster eingetragener Wettkampf: ${race.name || 'ohne Namen'} am ${race.date}${race.priority ? ` (Priorität ${race.priority})` : ''}.`
        : '• Kein zukünftiger Wettkampf im Kalender eingetragen.');
    lines.push('Du kannst gezielt nach Belastung, Erholung, Wettkämpfen oder deiner Trainingshistorie fragen.');
    return lines.join('\\n');
}

export function buildLocalCoachReply(context, message = '') {
    const intent = classifyCoachIntent(message);
    const builders = {
        load: buildLoadReply,
        recovery: buildRecoveryReply,
        competition: buildCompetitionReply,
        activities: buildActivitiesReply,
        overview: buildOverviewReply
    };
    return builders[intent](context)
        + '\\n\\nHinweis: Dies ist eine lokale, regelbasierte Datenauswertung und noch keine KI-generierte Trainingsberatung. Fehlende oder unvollständige Daten werden nicht durch Schätzwerte ersetzt.';
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
    const reply = buildLocalCoachReply(context, msg);
    const coachMessage = document.createElement('div');
    coachMessage.className = 'bg-slate-950 border border-slate-800 p-3.5 rounded-2xl max-w-xl text-slate-300 whitespace-pre-line';
    coachMessage.textContent = reply;
    container.appendChild(coachMessage);
    container.scrollTop = container.scrollHeight;
}
