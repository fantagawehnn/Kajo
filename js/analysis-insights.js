/* ============================================================
 * analysis-insights.js – Transparente, datenbasierte Analysebereiche
 * Keine KI-Anbindung und keine neuen Berechnungen der Trainingslast.
 * Die Einordnungen beschreiben ausschließlich bereits gespeicherte Daten.
 * ============================================================ */
import { state } from './state.js';
import { renderMetricHistory } from './dashboard.js?v=3';
import { calculateReadiness, summarizeRecoveryTrends } from './recovery-calculations.js?v=2';
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
    const isGarmin = last.loadMode === 'garmin-native' || last.loadMode === 'garmin-zone';
    const isSrpe = last.loadMode === 'srpe';
    const balanceLabel = last.loadMode === 'garmin-native' ? 'Relativer Saldo · Garmin Load'
        : last.loadMode === 'garmin-zone' ? 'Relativer Saldo · EA-HF-Zonenindex'
        : isSrpe ? 'Belastungsbilanz · sRPE' : 'Keine Load-Quelle';
    const balanceValue = isGarmin ? (valid(last.formPct) ? fmt(last.formPct) + ' %' : '—') : isSrpe ? fmt(last.tsb) : '—';
        setPanel('analysis-overview-kpis',
        '<div class="kajo-insight-grid">' +
        metric('CTL · aktuell', fmt(last.ctl)) +
        metric('ATL · aktuell', fmt(last.atl)) +
        metric(balanceLabel, balanceValue) +
        metric('Aktivitäten / 90 Tage', activities, loaded + ' mit Load-Wert') +
        metric('Krankheitstage', sick, 'Dokumentierte Tage / 90 Tage') +
        metric('Verletzungstage', injured, 'Dokumentierte Tage / 90 Tage') +
        '</div>');
    setPanel('analysis-overview-note', note(last.load == null
        ? 'Aktuelle Belastungskennzahlen nicht berechenbar: Für den jüngsten Tag fehlt eine bestätigte Aktivitätsabdeckung oder ein vollständiger Load-Wert. Unbekannte Tage werden nicht als Ruhetage gewertet.'
        : 'Modellwerte zum Tagesende · keine medizinische oder leistungsdiagnostische Bewertung.'));
}

function renderLoadInsight(timeline) {
    const recent = timeline.slice(-28);
    const last = recent[recent.length - 1];
    if (!last) return setPanel('analysis-load-insight', note('Noch keine auswertbare Belastungszeitreihe vorhanden.'));
    const isGarmin = String(last.loadMode || '').startsWith('garmin');
    const isSrpe = last.loadMode === 'srpe';
    const formLabel = last.loadMode === 'garmin-native' ? 'Relativer Saldo (Garmin Load)'
        : last.loadMode === 'garmin-zone' ? 'Relativer Saldo (EA-HF-Zonenindex)'
        : isSrpe ? 'Belastungsbilanz (sRPE)' : 'Keine Load-Quelle';
    const formValue = isGarmin ? (valid(last.formPct) ? fmt(last.formPct) + ' %' : '—') : isSrpe ? fmt(last.tsb) : '—';
    const activeDays = recent.filter(day => day.load != null && Number(day.load) > 0).length;
    const activities = recent.reduce((sum, day) => sum + (Number(day.activityCount) || 0), 0);
    const loadActivities = recent.reduce((sum, day) => sum + (Number(day.loadActivityCount) || 0), 0);
    const sick = recent.filter(day => state.healthLogs[day.date]?.status === 'sick').length;
    const injured = recent.filter(day => state.healthLogs[day.date]?.status === 'injured').length;
        const interpretation = recent.some(day => day.load == null || day.dataStatus === 'unknown' || day.dataStatus === 'incomplete-activity-load')
        ? 'Der Zeitraum enthält unvollständige Daten. Fehlende Tage werden nicht als Ruhetage interpretiert.'
        : !loadActivities
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

function setRecoveryText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function recoveryMetric(key, label, value, detail = '') {
    return '<button type="button" class="kajo-recovery-metric" data-recovery-metric="' + escapeHtml(key) +
        '" aria-pressed="false" onclick="toggleRecoveryMetric(\'' + escapeHtml(key) + '\')">' +
        '<span class="kajo-recovery-metric-circle"><strong>' + escapeHtml(String(value)) + '</strong></span>' +
        '<span class="kajo-recovery-metric-label">' + escapeHtml(label) + '</span>' +
        (detail ? '<small>' + escapeHtml(detail) + '</small>' : '') +
        '</button>';
}

let selectedRecoveryMetric = null;
export function toggleRecoveryMetric(key) {
    const supported = ['hrv', 'rhr', 'sleepDuration', 'sleepScore', 'respiration', 'bodyBattery', 'sleepQuality', 'fatigue', 'soreness', 'motivation', 'stress'];
    if (!supported.includes(key)) return;
    selectedRecoveryMetric = selectedRecoveryMetric === key ? null : key;
    document.querySelectorAll('[data-recovery-metric]').forEach(button => {
        const active = button.dataset.recoveryMetric === selectedRecoveryMetric;
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-pressed', String(active));
    });
    const history = document.getElementById('view-health-data');
    if (!history) return;
    history.classList.toggle('hidden', !selectedRecoveryMetric);
    if (selectedRecoveryMetric) {
        state.healthHistoryMetric = selectedRecoveryMetric;
        state.metricHistoryRange = state.metricHistoryRange || '28d';
        renderMetricHistory('health');
    }
}
if (typeof window !== 'undefined') window.toggleRecoveryMetric = toggleRecoveryMetric;

function renderRecoveryInsight() {
    const today = todayKey();
    const current = (state.dailyCheckins || {})[today] || {};
    const checkins = Object.entries(state.dailyCheckins || {})
        .filter(([date]) => date >= daysAgoKey(6) && date <= today);
    const readiness = calculateReadiness(state.dailyCheckins);
    const recoveryTrends = summarizeRecoveryTrends(state.dailyCheckins, today);
    const trendFormat = (value, digits) => valid(value)
        ? Number(value).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits })
        : '—';
    const trendCards = recoveryTrends.metrics.map(item => {
        const currentText = item.currentAverage === null ? 'Keine Daten'
            : trendFormat(item.currentAverage, item.digits) + ' ' + item.unit;
        const previousText = item.previousAverage === null ? 'Vorwoche: keine Daten'
            : 'Vorwoche: ' + trendFormat(item.previousAverage, item.digits) + ' ' + item.unit;
        const deltaText = item.delta === null ? 'Kein Vergleich möglich'
            : 'Veränderung: ' + (item.delta > 0 ? '+' : '') + trendFormat(item.delta, item.digits) + ' ' + item.unit;
        const coverage = item.currentCount + '/7 aktuelle Tage · ' + item.previousCount + '/7 vorherige Tage';
        return metric(item.label + ' · Ø 7 Tage', currentText,
            previousText + ' · ' + deltaText + ' · ' + coverage);
    });
    const trendDates = recoveryTrends.from && recoveryTrends.to
        ? 'Aktuell: ' + recoveryTrends.from + ' bis ' + recoveryTrends.to +
          ' · Vergleich: ' + recoveryTrends.previousFrom + ' bis ' + recoveryTrends.previousTo
        : 'Kein gültiger Zeitraum verfügbar.';
    setPanel('analysis-recovery-insight',
        '<div class="kajo-insight-grid">' + trendCards.join('') + '</div>' +
        note(trendDates + '. Mittelwerte der vorhandenen Messungen; fehlende Tage werden nicht ergänzt. Veränderungen werden neutral angezeigt und sind keine medizinische Bewertung.'));
    const objective = Array.isArray(readiness.objective) ? readiness.objective : [];
    const findObjective = key => objective.find(item => item.key === key);
    const rhrBaseline = findObjective('rhr');
    const formatValue = (value, digits = 1) => valid(value)
        ? Number(value).toLocaleString('de-DE', { maximumFractionDigits: digits })
        : '—';

    const scoreAvailable = readiness.enoughData && valid(readiness.score);
    const ring = document.getElementById('recovery-hero-ring');
    if (ring) {
        ring.dataset.status = !scoreAvailable ? 'neutral'
            : readiness.score >= 80 ? 'good'
            : readiness.score >= 40 ? 'attention' : 'critical';
    }
    setRecoveryText('analysis-recovery-hero-value', scoreAvailable ? readiness.score : '—');
    setRecoveryText('analysis-recovery-hero-unit', scoreAvailable ? '/ 100' : 'Keine Bewertung');
    setRecoveryText('analysis-recovery-hero-status', scoreAvailable
        ? readiness.score >= 80 ? 'Günstige Readiness' : readiness.score >= 40 ? 'Mittlere Readiness' : 'Niedrige Readiness'
        : 'Readiness nicht ausreichend beurteilbar');
    setRecoveryText('recovery-hero-note',
        (readiness.dataQuality || 'Keine ausreichende Datengrundlage') +
        ' · ' + (readiness.totalCount || 0) + ' berücksichtigte Messgrößen. Die Einordnung ersetzt keine Tagesformprüfung.');

    const objectiveCards = [
        recoveryMetric('hrv', 'HRV', valid(current.hrv) ? formatValue(current.hrv) : '—', 'ms'),
        recoveryMetric('rhr', 'Ruhepuls', valid(current.garminRhr ?? current.rhr) ? formatValue(current.garminRhr ?? current.rhr) : '—', rhrBaseline ? 'bpm · persönliche Basis ' + formatValue(rhrBaseline.baseline) : 'bpm'),
        recoveryMetric('sleepDuration', 'Schlafdauer', formatValue(current.sleepDuration ?? (Number(current.sleep) > 5 ? current.sleep : null)), 'Stunden'),
        recoveryMetric('sleepScore', 'Sleep Score', valid(current.sleepScore) ? formatValue(current.sleepScore, 0) : '—', 'von 100'),
        recoveryMetric('respiration', 'Atemfrequenz', valid(current.respiration) ? formatValue(current.respiration) : '—', 'Atemzüge/min'),
        recoveryMetric('bodyBattery', 'Body Battery', valid(current.bodyBattery) ? formatValue(current.bodyBattery, 0) : '—', 'Garmin-Wert · nicht im Readiness-Score')
    ];
    setPanel('recovery-analysis-metrics', objectiveCards.join(''));
    setRecoveryText('recovery-objective-count', objectiveCards.length + ' Messwerte angezeigt');

    const subjectiveLabels = [
        ['sleepQuality', 'Schlafqualität', false],
        ['fatigue', 'Müdigkeit', true],
        ['soreness', 'Muskelkater', true],
        ['motivation', 'Motivation', false],
        ['stress', 'Stress', true]
    ];
    const subjectiveCards = subjectiveLabels.map(([key, label, reverse]) =>
        recoveryMetric(key, label, valid(current[key]) ? formatValue(current[key]) : '—',
            reverse ? 'Skala 1–10 · höher = mehr' : 'Skala 1–10'));
    setPanel('recovery-subjective-metrics', subjectiveCards.join(''));
    setRecoveryText('recovery-subjective-count', subjectiveCards.length + ' Angaben');
    selectedRecoveryMetric = null;
    const historyPanel = document.getElementById('view-health-data');
    if (historyPanel) historyPanel.classList.add('hidden');
    document.querySelectorAll('[data-recovery-metric]').forEach(button => {
        button.classList.remove('is-selected');
        button.setAttribute('aria-pressed', 'false');
    });

    const avgFor = key => mean(checkins.map(([, entry]) => entry?.[key]).filter(valid));
    const weeklySleep = avgFor('sleepQuality');
    const weeklyFatigue = avgFor('fatigue');
    const weeklySoreness = avgFor('soreness');
    const readinessText = scoreAvailable ? readiness.score + ' / 100' : 'Noch nicht ausreichend';
    const entries = [
        metric('Readiness heute', readinessText, readiness.dataQuality),
        metric('Check-ins / 7 Tage', checkins.length),
        metric('Ø Schlafqualität', weeklySleep === null ? '—' : fmt(weeklySleep) + ' / 10'),
        metric('Ø Müdigkeit', weeklyFatigue === null ? '—' : fmt(weeklyFatigue) + ' / 10'),
        metric('Ø Muskelkater', weeklySoreness === null ? '—' : fmt(weeklySoreness) + ' / 10')
    ];
    const interpretation = !checkins.length
        ? 'Keine Check-ins in den letzten 7 Tagen.'
        : 'Mittelwerte der vorhandenen Check-ins. Fehlende Tage werden nicht als neutrale oder erholte Tage gewertet.';
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
    renderHealthInsight();
    renderCompetitionInsight();
}
