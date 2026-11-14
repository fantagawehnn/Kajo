/* ============================================================
 * coach.js – lokaler, kontextbasierter KAJO-Coach
 *
 * Ordnet Nutzereingaben Themen zu und zeigt passende Daten aus
 * dem lokalen Athlete Context. Keine externe KI / kein Netzwerk.
 * ============================================================ */

import { state } from './state.js';
import { buildAthleteContext } from './athlete-context.js';

const INTENT_KEYWORDS = {
    load: /\b(belastung|trainingsbelastung|trainingslast|training load|ctl|atl|tsb|umfang|intensität|intensitaet|belastungssteuerung)\b/i,
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
    return lines.join('\n');
}

function dateKeyOffset(dateKey, offset) {
    const date = new Date(dateKey + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

function summarizeLoadWindow(timeline, endDate, days) {
    const startDate = dateKeyOffset(endDate, -(days - 1));
    const byDate = new Map(timeline.map(day => [day.date, day]));
    const rows = [];
    for (let offset = 0; offset < days; offset++) {
        const date = dateKeyOffset(startDate, offset);
        rows.push(byDate.get(date) || null);
    }

    const validRows = rows.filter(day => day
        && ['complete', 'confirmed-rest'].includes(day.dataStatus)
        && Number.isFinite(day.load));
    const modes = [...new Set(validRows.map(day => day.loadMode).filter(Boolean))];
    const missingDays = rows.filter(day => !day).length;
    const unknownDays = rows.filter(day => day && !(
        ['complete', 'confirmed-rest'].includes(day.dataStatus)
        && Number.isFinite(day.load)
    )).length;
    const complete = rows.length === days && validRows.length === days
        && validRows.every(day => Boolean(day.loadMode)) && modes.length === 1;

    return {
        days,
        startDate,
        endDate,
        validDays: validRows.length,
        missingDays,
        unknownDays,
        source: modes.length === 1 ? modes[0] : null,
        complete,
        totalLoad: complete ? validRows.reduce((sum, day) => sum + day.load, 0) : null,
        latestModel: [...validRows].reverse().find(day =>
            Number.isFinite(day.ctl) && Number.isFinite(day.atl) && Number.isFinite(day.tsb)
        ) || null
    };
}


function summarizeModelChange(timeline, endDate, days = 7) {
    const startDate = dateKeyOffset(endDate, -days);
    if (!startDate) return null;
    const byDate = new Map(timeline.map(day => [day.date, day]));
    const rows = [];
    for (let offset = 0; offset <= days; offset++) {
        const date = dateKeyOffset(startDate, offset);
        rows.push(byDate.get(date) || null);
    }
    const complete = rows.length === days + 1 && rows.every(day => day
        && ['complete', 'confirmed-rest'].includes(day.dataStatus)
        && Number.isFinite(day.load)
        && Number.isFinite(day.ctl) && Number.isFinite(day.atl) && Number.isFinite(day.tsb)
        && Boolean(day.loadMode));
    const modes = [...new Set(rows.filter(Boolean).map(day => day.loadMode))];
    if (!complete || modes.length !== 1) return { complete: false, startDate, endDate };
    const first = rows[0], last = rows[rows.length - 1];
    return {
        complete: true, startDate, endDate, source: modes[0],
        ctl: Number((last.ctl - first.ctl).toFixed(1)),
        atl: Number((last.atl - first.atl).toFixed(1)),
        tsb: Number((last.tsb - first.tsb).toFixed(1))
    };
}
function formatLoadWindow(label, summary) {
    const completeness = summary.complete
        ? 'vollständig'
        : `unvollständig: ${summary.validDays}/${summary.days} Tage mit auswertbarer Belastung, ${summary.missingDays} ohne Timeline-Eintrag, ${summary.unknownDays} unbekannt/unvollständig`;
    const source = summary.source || 'keine einheitliche Quelle';
    const total = summary.complete
        ? `Belastungssumme ${formatNumber(summary.totalLoad, 1)} (Quelle: ${source})`
        : `keine vollständige Belastungssumme ausgewiesen (Quelle: ${source})`;
    const model = summary.latestModel
        ? ` | letzter Modellstand CTL ${formatNumber(summary.latestModel.ctl, 1)}, ATL ${formatNumber(summary.latestModel.atl, 1)}, TSB ${formatNumber(summary.latestModel.tsb, 1)}`
        : '';
    return `• ${label} (${summary.startDate} bis ${summary.endDate}): ${completeness}; ${total}${model}.`;
}

function buildLoadReply(context) {
    const timeline = context.trainingLoad.timeline;
    const latest = getLatest(timeline);
    const endDate = context.asOfDate || latest?.date;
    const lines = ['Deine Trainingsbelastung:'];
    lines.push(formatLoadDay(latest, context.trainingLoad.selectedSource));

    if (endDate) {
        const windows = [7, 28, 90].map(days => summarizeLoadWindow(timeline, endDate, days));
        lines.push('Belastungsübersicht über verschiedene Zeiträume:');
        lines.push(formatLoadWindow('7 Tage', windows[0]));
        lines.push(formatLoadWindow('28 Tage', windows[1]));
        lines.push(formatLoadWindow('90 Tage', windows[2]));
        lines.push(`• Im 7-Tage-Fenster: ${windows[0].validDays} Tage mit auswertbarer Belastung; ${windows[0].missingDays + windows[0].unknownDays} Tage mit unbekannter oder unvollständiger Belastung.`);

        const modelChange = summarizeModelChange(timeline, endDate, 7);
        if (modelChange?.complete) {
            const signed = value => (value > 0 ? '+' : '') + formatNumber(value, 1);
            lines.push(`• Modellveränderung über 7 Tage (${modelChange.startDate} bis ${modelChange.endDate}): CTL ${signed(modelChange.ctl)}, ATL ${signed(modelChange.atl)}, TSB ${signed(modelChange.tsb)} (Quelle: ${modelChange.source}).`);
        } else {
            lines.push('• CTL-/ATL-/TSB-Veränderung über 7 Tage nicht ausgewiesen: Für den gesamten Vergleichszeitraum fehlen vollständige Tageswerte oder eine einheitliche Belastungsquelle.');
        }
        const previousEnd = dateKeyOffset(endDate, -7);
        const previous = summarizeLoadWindow(timeline, previousEnd, 7);
        const current = windows[0];
        if (current.complete && previous.complete && current.source === previous.source) {
            const delta = current.totalLoad - previous.totalLoad;
            const direction = delta > 0 ? 'höher' : delta < 0 ? 'niedriger' : 'gleich';
            lines.push(`• Vergleich der letzten 7 Tage mit den 7 Tagen davor: ${formatNumber(Math.abs(delta), 1)} Belastungseinheiten ${direction} (gleiche Quelle: ${current.source}). Das beschreibt nur die erfasste Belastung, nicht automatisch eine Leistungs- oder Gesundheitsveränderung.`);
        } else {
            lines.push('• Ein Vergleich mit den vorherigen 7 Tagen ist nicht belastbar möglich: Beide Zeiträume müssen vollständig und mit derselben Belastungsquelle vorliegen.');
        }
    } else {
        lines.push('• Für eine zeitliche Einordnung fehlt ein gültiges Bezugsdatum.');
    }

    lines.push(`• Ausgewählte Belastungsquelle: ${context.trainingLoad.selectedSource || 'nicht angegeben'}.`);
    const sessionRpeDays = context.trainingLoad.documentedSessionRpeByDay || [];
    const recentRpeDays = sessionRpeDays.slice(-7);
    if (recentRpeDays.length) {
        lines.push('Zusätzliche sportartenübergreifende sRPE-Dokumentation (Dauer in Minuten × subjektive Belastung 1–10; separate Skala, nicht mit Garmin Load addiert):');
        for (const day of recentRpeDays) {
            if (day.documentedLoadAU === null) {
                lines.push(`• ${day.date}: kein gültiger sRPE-Wert für ${day.recordedActivityCount} dokumentierte Einheit(en); Belastung unbekannt.`);
            } else {
                const status = day.allRecordedActivitiesHaveSessionRpe
                    ? 'alle dokumentierten Einheiten bewertet'
                    : day.activitiesMissingSessionRpe + ' dokumentierte Einheit(en) ohne sRPE';
                lines.push(`• ${day.date}: ${formatNumber(day.documentedLoadAU, 1)} AU aus ${day.activitiesWithSessionRpe}/${day.recordedActivityCount} dokumentierten Einheiten; ${status}.`);
            }
        }
        lines.push('Diese Werte bilden nur die dokumentierten Einheiten ab. Auch bei vollständigem sRPE für die erfassten Einheiten ist damit nicht bewiesen, dass alle tatsächlich absolvierten Einheiten erfasst wurden. Daraus werden keine CTL-/ATL-/TSB-Werte berechnet.');
    }
    lines.push('Belastungssummen und Modellveränderungen werden nur bei vollständigen Tageswerten und einheitlicher Quelle ausgewiesen. CTL und ATL sind rechnerische, quellenabhängige EWMA-Modellwerte; TSB ist ihre Differenz und kein direkt gemessener Ermüdungs- oder Formwert. Die ausgewählte Tagesbelastungsreihe enthält keine verlässliche Aufteilung nach Sportart. Ergänzend werden dokumentierte sRPE-Werte separat nach Aktivitätstyp ausgewiesen; sie werden nicht mit Garmin Load oder Garmin-HF-Zonenpunkten addiert.');
    return lines.join('\n');
}
function summarizeRecoveryTrends(checkins) {
    const metrics = [
        ['hrv', 'HRV'], ['rhr', 'Ruhepuls'], ['sleepDuration', 'Schlafdauer'],
        ['sleepScore', 'Schlafscore'], ['respiration', 'Atemfrequenz']
    ];
    return metrics.flatMap(([key, label]) => {
        const observations = checkins.map(item => ({
            date: item.date,
            value: item.values?.[key],
            provenance: item.provenance?.[key]
        })).filter(item => Number.isFinite(item.value)
            && item.provenance && typeof item.provenance === 'object'
            && typeof item.provenance.source === 'string' && item.provenance.source
            && typeof item.provenance.metric === 'string' && item.provenance.metric
            && typeof item.provenance.unit === 'string' && item.provenance.unit);
        if (observations.length < 2) return [];
        const first = observations[0];
        const last = observations[observations.length - 1];
        const compatible = observations.every(item =>
            item.provenance.source === first.provenance.source
            && item.provenance.metric === first.provenance.metric
            && item.provenance.unit === first.provenance.unit
        );
        if (!compatible || first.date === last.date) return [];
        return [{
            label, first, last,
            change: Number((last.value - first.value).toFixed(2)),
            unit: first.provenance.unit,
            source: first.provenance.source,
            observations: observations.length
        }];
    });
}

function summarizeLoadRecoveryPairs(context) {
    const timelineByDate = new Map(context.trainingLoad.timeline.map(day => [day.date, day]));
    const metrics = [
        ['hrv', 'HRV'], ['rhr', 'Ruhepuls'], ['sleepDuration', 'Schlafdauer'],
        ['sleepScore', 'Schlafscore'], ['respiration', 'Atemfrequenz']
    ];
    return metrics.flatMap(([key, label]) => {
        const pairs = context.recovery.checkins.flatMap(checkin => {
            const previousDate = dateKeyOffset(checkin.date, -1);
            const loadDay = previousDate ? timelineByDate.get(previousDate) : null;
            const value = checkin.values?.[key];
            const provenance = checkin.provenance?.[key];
            if (!Number.isFinite(value) || !provenance
                || typeof provenance.source !== 'string' || !provenance.source
                || typeof provenance.metric !== 'string' || !provenance.metric
                || typeof provenance.unit !== 'string' || !provenance.unit
                || !loadDay || !['complete', 'confirmed-rest'].includes(loadDay.dataStatus)
                || !Number.isFinite(loadDay.load) || !loadDay.loadMode
                || typeof loadDay.loadUnit !== 'string' || !loadDay.loadUnit) return [];
            return [{
                date: checkin.date, previousDate, load: loadDay.load,
                loadMode: loadDay.loadMode, loadUnit: loadDay.loadUnit, value, provenance
            }];
        });
        if (pairs.length < 2) return [];
        const first = pairs[0];
        const compatible = pairs.every(pair =>
            pair.loadMode === first.loadMode && pair.loadUnit === first.loadUnit
            && pair.provenance.source === first.provenance.source
            && pair.provenance.metric === first.provenance.metric
            && pair.provenance.unit === first.provenance.unit
        );
        if (!compatible) return [];
        const loads = pairs.map(pair => pair.load);
        const values = pairs.map(pair => pair.value);
        return [{
            label, count: pairs.length,
            firstDate: pairs[0].date, lastDate: pairs[pairs.length - 1].date,
            loadMode: first.loadMode, loadUnit: first.loadUnit, recoverySource: first.provenance.source,
            unit: first.provenance.unit,
            loadMin: Math.min(...loads), loadMax: Math.max(...loads),
            valueMin: Math.min(...values), valueMax: Math.max(...values)
        }];
    });
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
        const trends = summarizeRecoveryTrends(checkins);
        if (trends.length) {
            lines.push('Dokumentierte Veränderungen zwischen erstem und letztem vergleichbarem Messwert:');
            for (const trend of trends) {
                const signed = trend.change > 0 ? '+' : '';
                lines.push(`• ${trend.label}: ${formatNumber(trend.first.value, 2)} → ${formatNumber(trend.last.value, 2)} ${trend.unit} (${trend.first.date} bis ${trend.last.date}; Veränderung ${signed}${formatNumber(trend.change, 2)}; Quelle: ${trend.source}; ${trend.observations} Messwerte).`);
            }
            lines.push('Die Veränderungen sind rein deskriptiv. Sie belegen weder eine Ursache noch eine Veränderung von Trainingsbereitschaft oder Gesundheit.');
        } else {
            lines.push('• Noch kein zeitlicher Vergleich von Erholungskennzahlen ausgewiesen: Es fehlen mindestens zwei Werte mit vollständig übereinstimmender Messquelle, Kennzahl und Einheit.');
        }
        const paired = summarizeLoadRecoveryPairs(context);
        if (paired.length) {
            lines.push('Belastung am Vortag und Check-in am Folgetag – dokumentierte Wertebereiche, keine statistische Zusammenhangsanalyse:');
            for (const item of paired) {
                lines.push(`• ${item.label}: ${item.count} passende Tage (${item.firstDate} bis ${item.lastDate}); Vortagesbelastung ${formatNumber(item.loadMin, 1)}–${formatNumber(item.loadMax, 1)} ${item.loadUnit} (${item.loadMode}); Check-in-Werte ${formatNumber(item.valueMin, 2)}–${formatNumber(item.valueMax, 2)} ${item.unit} (Quelle: ${item.recoverySource}).`);
            }
            lines.push('Die Gegenüberstellung beschreibt nur zeitlich zugeordnete Messwerte. Sie weist keine Korrelation, Ursache oder individuelle Belastungsreaktion nach.');
        } else {
            lines.push('• Keine belastbare Gegenüberstellung von Vortagesbelastung und Folgetags-Check-in: Es fehlen mindestens zwei passende Tage mit vollständiger Tagesbelastung sowie jeweils einheitlichen Belastungs- und Messquellen.');
        }
    }
    const events = context.recovery.healthEvents;
    lines.push(events.length
        ? `• Dokumentierte Gesundheitsereignisse: ${events.map(e => `${e.date}: ${e.status === 'sick' ? 'Krankheit' : 'Verletzung'}`).join('; ')}.`
        : '• Im betrachteten Zeitraum sind keine Krankheit oder Verletzung als Ereignis dokumentiert.');
    lines.push('Das ist eine Datenübersicht, keine medizinische Beurteilung. Fehlende Einträge sind kein Nachweis für Beschwerdefreiheit.');
    return lines.join('\n');
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
    return lines.join('\n');
}

function summarizeActivityWindow(activities, asOfDate, days) {
    const end = new Date(asOfDate + 'T12:00:00Z');
    if (!Number.isFinite(end.getTime())) return null;
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const startDate = start.toISOString().slice(0, 10);
    const selected = activities.filter(activity => activity.date && activity.date >= startDate && activity.date <= asOfDate);
    const canoe = selected.filter(activity => activity.isCanoePerformanceActivity);
    const complementary = selected.filter(activity => !activity.isCanoePerformanceActivity);
    const summarize = items => {
        const knownDurations = items.filter(item => Number.isFinite(item.durationMinutes) && item.durationMinutes >= 0);
        return { count: items.length, durationCount: knownDurations.length, durationMinutes: knownDurations.reduce((sum, item) => sum + item.durationMinutes, 0) };
    };
    return { startDate, endDate: asOfDate, total: summarize(selected), canoe: summarize(canoe), complementary: summarize(complementary) };
}

function formatActivityGroup(label, summary) {
    const duration = summary.durationCount
        ? formatNumber(summary.durationMinutes / 60, 1) + ' h dokumentiert bei ' + summary.durationCount + '/' + summary.count + ' Einheiten'
        : 'keine Dauerangaben bei ' + summary.count + ' Einheiten';
    return '• ' + label + ': ' + summary.count + ' Einheiten; ' + duration + '.';
}
function buildActivitiesReply(context) {
    const all = context.performanceContext.allActivities;
    const canoe = context.performanceContext.canoeActivities;
    const latestCanoe = getLatest(canoe);
    const lines = ['Deine Trainingshistorie:'];
    lines.push('• Erfasste Aktivitäten im betrachteten Zeitraum: ' + all.length + '.');
    lines.push('• Davon Kanu-Performanceeinheiten (K1/Kayaking, C1, C2): ' + canoe.length + '.');
    lines.push('• Ergänzende Sportarten und weitere Aktivitätstypen: ' + (all.length - canoe.length) + '.');
    lines.push(latestCanoe
        ? '• Letzte erfasste Kanu-Performanceeinheit: ' + (latestCanoe.date || 'Datum nicht verfügbar') + ' – ' + (latestCanoe.name || latestCanoe.type) + '.'
        : '• Im betrachteten Zeitraum ist keine Kanu-Performanceeinheit erfasst.');
    const asOfDate = context.asOfDate || getLatest(all)?.date;
    if (asOfDate) {
        const window = summarizeActivityWindow(all, asOfDate, 28);
        if (window) {
            lines.push('Aktivitäten der letzten 28 Tage (' + window.startDate + ' bis ' + window.endDate + '):');
            lines.push(formatActivityGroup('Kanu-Performance', window.canoe));
            lines.push(formatActivityGroup('Ergänzende Sportarten', window.complementary));
            const coverage = context.trainingLoad.loadCoverageByActivityType || [];
            if (coverage.length) {
                lines.push('Belastungsdaten nach Aktivitätstyp im betrachteten 90-Tage-Kontext (ausgewählte Quelle: ' + (context.trainingLoad.resolvedMode || context.trainingLoad.selectedSource || 'nicht angegeben') + '):');
                coverage.forEach(item => {
                    const rpeSummary = item.sessionRpeAvailableCount
                        ? '; sRPE dokumentiert für ' + item.sessionRpeAvailableCount + '/' + item.activityCount + ' Einheiten (' + formatNumber(item.documentedSessionRpeLoadAU, 1) + ' AU); ' + item.sessionRpeMissingCount + ' ohne sRPE'
                        : '; kein gültiger sRPE-Wert für ' + item.activityCount + ' Einheiten dokumentiert';
                    lines.push('• ' + item.type + (item.isCanoePerformanceActivity ? ' (Kanu-Performance)' : ' (ergänzend)') + ': Belastungswert der ausgewählten Quelle für ' + item.loadAvailableCount + '/' + item.activityCount + ' Einheiten vorhanden; ' + item.loadMissingCount + ' ohne Wert' + rpeSummary + '.');
                });
            }
            lines.push('• Die dokumentierten Stunden beschreiben nur die erfasste Dauer. Sie sind weder eine Belastungssumme noch ein Nachweis für vollständige Trainingsdokumentation.');
        }
    }
    lines.push('Die Anzahl erfasster Aktivitäten ist nicht gleichbedeutend mit vollständiger Trainingsdokumentation.');
    return lines.join('\n');
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
    return lines.join('\n');
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
        + '\n\nHinweis: Dies ist eine lokale, regelbasierte Datenauswertung und noch keine KI-generierte Trainingsberatung. Fehlende oder unvollständige Daten werden nicht durch Schätzwerte ersetzt.';
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
