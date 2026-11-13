/* ============================================================
 * analysis-insights.js – Transparente, datenbasierte Analysebereiche
 * Keine KI-Anbindung und keine neuen Berechnungen der Trainingslast.
 * Die Einordnungen beschreiben ausschließlich bereits gespeicherte Daten.
 * ============================================================ */
import { state } from './state.js';
import { calculateReadiness } from './dashboard.js';
import { escapeHtml, formatDateDDMMYY } from './utils.js';

const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const daysAgoKey = days => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const activityDateKey = activity => typeof activity?.date === 'string' ? activity.date.slice(0, 10) : '';
const timelineTimingNote = 'CTL, ATL und Belastungssaldo werden auf Basis desselben Tagesendstands berechnet. Es handelt sich um modellierte Verlaufswerte, nicht um direkte Leistungsmessungen.';
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const fmt = value => valid(value) ? Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '—';
const metric = (label, value, note = '') => `
    <div class="kajo-insight-metric">
        <span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>
        ${note ? `<small>${escapeHtml(note)}</small>` : ''}
    </div>`;
const note = text => `<p class="kajo-insight-note">${escapeHtml(text)}</p>`;
const list = items => items.length
    ? `<ul class="kajo-insight-list">${items.join('')}</ul>`
    : note('Für diesen Zeitraum liegen keine passenden Einträge vor.');

function setPanel(id, content) {
    const root = document.getElementById(id);
    if (root) root.innerHTML = content;
}

function renderOverview(timeline) {
    const last = timeline.length ? timeline[timeline.length - 1] : null;
    const recent = timeline.slice(-90);
    const from = daysAgoKey(89), to = todayKey();
    const activities = (state.rawActivities || []).filter(activity => { const date = activityDateKey(activity); return date >= from && date <= to; }).length;
    const loaded = recent.reduce((sum, day) => sum + (Number(day.loadActivityCount) || 0), 0);
    const sick = Object.entries(state.healthLogs || {}).filter(([date, item]) => date >= from && date <= to && item?.status === 'sick').length;
    const injured = Object.entries(state.healthLogs || {}).filter(([date, item]) => date >= from && date <= to && item?.status === 'injured').length;
    if (!last) {
        setPanel('analysis-overview-kpis',
            '<div class="kajo-insight-grid">' +
            metric('CTL · aktuell', '—') + metric('ATL · aktuell', '—') + metric('Belastungssaldo', '—') +
            metric('Aktivitäten / 90 Tage', activities, 'Noch ohne auswertbare Load-Werte') +
            metric('Krankheitstage', sick, 'Dokumentierte Tage / 90 Tage') +
            metric('Verletzungstage', injured, 'Dokumentierte Tage / 90 Tage') +
            '</div>');
        setPanel('analysis-overview-note', note('Keine auswertbare Belastungszeitreihe vorhanden. Fehlende CTL-, ATL- und Formwerte werden nicht geschätzt.'));
        return;
    }
    const isGarmin = String(last.loadMode || '').startsWith('garmin');
    const isSrpe = last.loadMode === 'srpe';
    const balanceLabel = last.loadMode === 'garmin-native' ? 'Relativer Saldo · Garmin Load'
        : last.loadMode === 'garmin-zone' ? 'Relativer Saldo · EA-HF-Zonenindex'
        : isSrpe ? 'Belastungsbilanz · sRPE' : 'Belastungssaldo · TSS';
    const balanceValue = isGarmin ? (valid(last.formPct) ? fmt(last.formPct) + ' %' : '—') : fmt(last.tsb);
        setPanel('analysis-overview-kpis',
        '<div class="kajo-insight-grid">' +
        metric('CTL · aktuell', fmt(last.ctl)) +
        metric('ATL · aktuell', fmt(last.atl)) +
        metric(balanceLabel, balanceValue) +
        metric('Aktivitäten / 90 Tage', activities, loaded + ' mit Load-Wert') +
        metric('Krankheitstage', sick, 'Dokumentierte Tage / 90 Tage') +
        metric('Verletzungstage', injured, 'Dokumentierte Tage / 90 Tage') +
        '</div>');
    setPanel('analysis-overview-note', note('Modellwerte zum Tagesende · keine medizinische oder leistungsdiagnostische Bewertung.'));
}

function renderLoadInsight(timeline) {
    const recent = timeline.slice(-28);
    const last = recent[recent.length - 1];
    if (!last) return setPanel('analysis-load-insight', note('Noch keine auswertbare Belastungszeitreihe vorhanden.'));
    const isGarmin = String(last.loadMode || '').startsWith('garmin');
    const isSrpe = last.loadMode === 'srpe';
    const formLabel = last.loadMode === 'garmin-native' ? 'Relativer Saldo (Garmin Load)'
        : last.loadMode === 'garmin-zone' ? 'Relativer Saldo (EA-HF-Zonenindex)'
        : isSrpe ? 'Belastungsbilanz (sRPE)' : 'Belastungssaldo (TSS)';
    const formValue = isGarmin ? (valid(last.formPct) ? fmt(last.formPct) + ' %' : '—') : fmt(last.tsb);
    const activeDays = recent.filter(day => Number(day.load) > 0).length;
    const activities = recent.reduce((sum, day) => sum + (Number(day.activityCount) || 0), 0);
    const loadActivities = recent.reduce((sum, day) => sum + (Number(day.loadActivityCount) || 0), 0);
    const sick = recent.filter(day => state.healthLogs[day.date]?.status === 'sick').length;
    const injured = recent.filter(day => state.healthLogs[day.date]?.status === 'injured').length;
        const interpretation = !loadActivities
        ? 'Keine auswertbaren Belastungswerte in den letzten 28 Tagen.'
        : 'Modellierter Verlauf · keine Diagnose von Überlastung oder Leistungsfähigkeit.';
    setPanel('analysis-load-insight',
        '<div class="kajo-insight-grid">' +
        metric('CTL · aktuell', fmt(last.ctl)) + metric('ATL · aktuell', fmt(last.atl)) +
        metric(formLabel, formValue) + metric('Aktivitäten / 28 Tage', activities, loadActivities + ' mit Load-Wert') +
        metric('Tage mit Belastung', activeDays) + metric('Krankheit / Verletzung', sick + ' / ' + injured, 'Dokumentierte Tage') +
        '</div>' + note(interpretation));
}

function renderFitnessInsight(timeline) {
    const recent = timeline.slice(-28);
    const last = recent[recent.length - 1];
    const first = recent[0];
    const activities = state.rawActivities.filter(activity => { const date = activityDateKey(activity); return date >= daysAgoKey(27) && date <= todayKey(); });
    const minutes = activities.reduce((sum, activity) => sum + (valid(activity.duration) && Number(activity.duration) > 0 ? Number(activity.duration) : 0), 0);
    let trend = '—';
    let trendNote = 'Für einen Verlauf fehlen Vergleichswerte.';
    if (first && last && recent.length >= 2 && valid(first.ctl) && valid(last.ctl)) {
        const delta = Number(last.ctl) - Number(first.ctl);
        trend = (delta > 0 ? '+' : '') + fmt(delta);
        trendNote = 'Veränderung in 28 Tagen';
    }
    const modelNote = last
        ? 'CTL zeigt die langfristige Belastungsentwicklung, nicht direkt die sportliche Leistungsfähigkeit.'
        : 'Noch keine auswertbaren Belastungswerte.';
    setPanel('analysis-fitness-insight',
        '<div class="kajo-insight-grid">' +
        metric('CTL aktuell', fmt(last?.ctl)) + metric('CTL-Veränderung', trend, trendNote) +
        metric('Aktivitäten / 28 Tage', activities.length) + metric('Trainingszeit', minutes ? fmt(minutes / 60) + ' h' : '—') +
        '</div>' + note(modelNote));
}

function renderRecoveryInsight() {
    const today = todayKey();
    const checkins = Object.entries(state.dailyCheckins || {}).filter(([date]) => date >= daysAgoKey(6) && date <= today);
    const readiness = calculateReadiness();
    const avgFor = key => mean(checkins.map(([, entry]) => entry?.[key]).filter(valid));
    const sleep = avgFor('sleepQuality');
    const fatigue = avgFor('fatigue');
    const soreness = avgFor('soreness');
    const readinessText = readiness.enoughData ? readiness.score + ' / 100' : 'Noch nicht ausreichend';
    const entries = [
        metric('Readiness heute', readinessText, readiness.enoughData ? 'Ausreichende Angaben' : 'Noch zu wenige Angaben'),
        metric('Check-ins / 7 Tage', checkins.length),
        metric('Schlafqualität', sleep === null ? '—' : fmt(sleep) + ' / 10'),
        metric('Müdigkeit', fatigue === null ? '—' : fmt(fatigue) + ' / 10'),
        metric('Muskelkater', soreness === null ? '—' : fmt(soreness) + ' / 10')
    ];
    const interpretation = !checkins.length
        ? 'Keine Check-ins in den letzten 7 Tagen.'
        : 'Mittelwerte der vorhandenen Check-ins.';
    setPanel('analysis-recovery-insight', '<div class="kajo-insight-grid">' + entries.join('') + '</div>' +
        note(interpretation));
}

function renderHealthInsight() {
    const from = daysAgoKey(27), to = todayKey();
    const entries = Object.entries(state.healthLogs || {}).filter(([date]) => date >= from && date <= to).sort(([a], [b]) => a.localeCompare(b));
    const sick = entries.filter(([, item]) => item?.status === 'sick').length;
    const injured = entries.filter(([, item]) => item?.status === 'injured').length;
    const rows = entries.slice(-8).reverse().map(([date, item]) => {
        const type = item?.status === 'sick' ? 'Krankheit' : item?.status === 'injured' ? 'Verletzung' : 'Gesundheitseintrag';
        return '<li><span>' + escapeHtml(formatDateDDMMYY(date)) + ' · ' + escapeHtml(type) + '</span><small>' + escapeHtml(item?.diagnosis || 'Keine Beschreibung hinterlegt') + '</small></li>';
    });
    setPanel('analysis-health-insight',
        '<div class="kajo-insight-grid">' + metric('Krankheitstage / 28 Tage', sick) +
        metric('Verletzungstage / 28 Tage', injured) + metric('Dokumentierte Einträge', entries.length) +
        '</div>' + list(rows) +
        note('Keine medizinische Bewertung.'));
}

function renderCompetitionInsight() {
    const today = todayKey();
    const races = Array.isArray(state.races) ? state.races : [];
    const allUpcoming = races.filter(race => race?.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const allPast = races.filter(race => race?.date < today).sort((a, b) => b.date.localeCompare(a.date));
    const upcoming = allUpcoming.slice(0, 5);
    const recentPast = allPast.slice(0, 3);
    const raceRows = upcoming.map(race => '<li><span>' + escapeHtml(formatDateDDMMYY(race.date)) + ' · ' + escapeHtml(race.name || 'Wettkampf') + '</span><small>' + escapeHtml([race.prio ? 'Kategorie ' + race.prio : '', race.location || '', race.sport || ''].filter(Boolean).join(' · ')) + '</small></li>');
    const pastRows = recentPast.map(race => '<li><span>' + escapeHtml(formatDateDDMMYY(race.date)) + ' · ' + escapeHtml(race.name || 'Wettkampf') + '</span><small>Vergangener Kalendereintrag · kein Ergebnisfeld ausgewertet</small></li>');
    setPanel('analysis-competition-insight',
        '<div class="kajo-insight-grid">' + metric('Kommende Wettkämpfe', allUpcoming.length) +
        metric('Vergangene Einträge', allPast.length, 'Insgesamt gespeicherte Termine') + '</div>' +
        '<h4 class="kajo-insight-subtitle">Nächste Termine</h4>' + list(raceRows) +
        (pastRows.length ? '<h4 class="kajo-insight-subtitle">Vergangene Termine</h4>' + list(pastRows) : '') +
        note('Nur gespeicherte Wettkampftermine; keine Ergebnisse hinterlegt.'));
}

export function renderAnalysisInsights() {
    const timeline = Array.isArray(state.dailyTimeline) ? state.dailyTimeline : [];
    renderOverview(timeline);
    renderLoadInsight(timeline);
    renderFitnessInsight(timeline);
    renderRecoveryInsight();
    renderHealthInsight();
    renderCompetitionInsight();
}
