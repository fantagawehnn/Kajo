/**
 * Deterministische, beschreibende Kennzahlen für den KI-Coach.
 *
 * Dieses Modul ergänzt bestehende KAJO-Berechnungen um einfache Aggregate.
 * Es erfindet keine Readiness-Scores, Zonen, Baselines oder Belastungsmodelle.
 * Unvollständige Werte werden sichtbar gemacht und nicht als null behandelt.
 */

const validNumber = value =>
    value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value));

function dateKey(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
        ? value.slice(0, 10)
        : null;
}

function mean(records, key) {
    const values = records.map(item => item?.[key]).filter(validNumber).map(Number);
    return values.length
        ? { mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)), count: values.length }
        : { mean: null, count: 0 };
}

function weekStartKey(value) {
    const date = new Date(value + 'T12:00:00');
    if (!Number.isFinite(date.getTime())) return null;
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function summarizeWeeklyVolume(activities) {
    const weeks = new Map();
    activities.forEach(item => {
        const date = dateKey(item?.date);
        if (!date) return;
        const weekStart = weekStartKey(date);
        if (!weekStart) return;
        if (!weeks.has(weekStart)) weeks.set(weekStart, { sessions: 0, knownMinutes: 0, missingDurationCount: 0 });
        const week = weeks.get(weekStart);
        week.sessions++;
        if (validNumber(item.duration) && Number(item.duration) > 0) {
            week.knownMinutes += Number(item.duration) / 60;
        } else {
            week.missingDurationCount++;
        }
    });
    return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, value]) => ({
        weekStarting: weekStart,
        sessions: value.sessions,
        durationMinutes: value.missingDurationCount === 0 ? Number(value.knownMinutes.toFixed(1)) : null,
        knownDurationMinutes: Number(value.knownMinutes.toFixed(1)),
        sessionsMissingDuration: value.missingDurationCount
    }));
}

function summarizeActivities(activities) {
    const dated = activities.filter(item => dateKey(item?.date));
    const durationValues = dated.filter(item => validNumber(item.duration) && Number(item.duration) > 0);
    const missingDurationCount = dated.length - durationValues.length;
    const totalMinutes = durationValues.reduce((sum, item) => sum + Number(item.duration) / 60, 0);
    const byType = new Map();

    dated.forEach(item => {
        const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : 'Nicht angegeben';
        if (!byType.has(type)) byType.set(type, { sessions: 0, durationMinutes: 0, durationKnown: 0, durationMissing: 0 });
        const group = byType.get(type);
        group.sessions++;
        if (validNumber(item.duration) && Number(item.duration) > 0) {
            group.durationMinutes += Number(item.duration) / 60;
            group.durationKnown++;
        } else {
            group.durationMissing++;
        }
    });

    return {
        activityCount: dated.length,
        duration: {
            totalMinutes: durationValues.length === dated.length
                ? Number(totalMinutes.toFixed(1))
                : null,
            knownMinutes: Number(totalMinutes.toFixed(1)),
            sessionsWithDuration: durationValues.length,
            sessionsMissingDuration: missingDurationCount,
            complete: dated.length > 0 && missingDurationCount === 0
        },
        weeklyVolume: summarizeWeeklyVolume(dated),
        byActivityType: [...byType.entries()].map(([type, value]) => ({
            type,
            sessions: value.sessions,
            durationMinutes: value.durationKnown === value.sessions
                ? Number(value.durationMinutes.toFixed(1))
                : null,
            sessionsMissingDuration: value.durationMissing
        }))
    };
}

function summarizeLoad(timeline) {
    const dated = timeline.filter(item => dateKey(item?.date));
    const usable = dated.filter(item =>
        ['complete', 'confirmed-rest'].includes(item.dataStatus)
        && validNumber(item.load)
    );
    const statuses = {
        completeDays: dated.filter(item => item.dataStatus === 'complete').length,
        confirmedRestDays: dated.filter(item => item.dataStatus === 'confirmed-rest').length,
        incompleteDays: dated.filter(item => item.dataStatus === 'incomplete-activity-load').length,
        unknownDays: dated.filter(item => item.dataStatus === 'unknown' || !item.dataStatus).length
    };
    const modes = [...new Set(usable.map(item => item.loadMode).filter(Boolean))];
    const consistentMode = modes.length === 1 ? modes[0] : null;
    const latest = [...usable]
        .sort((a, b) => (dateKey(b.date) || '').localeCompare(dateKey(a.date) || ''))
        .find(item => validNumber(item.ctl) && validNumber(item.atl) && validNumber(item.tsb))
        || null;

    return {
        availableDays: dated.length,
        usableDays: usable.length,
        coverage: statuses,
        loadModes: modes,
        consistentLoadMode: consistentMode,
        latestModel: latest ? {
            date: dateKey(latest.date),
            loadMode: latest.loadMode,
            loadUnit: latest.loadUnit ?? null,
            ctl: Number(latest.ctl),
            atl: Number(latest.atl),
            tsb: Number(latest.tsb),
            formPct: validNumber(latest.formPct) ? Number(latest.formPct) : null,
            isProvisional: latest.isProvisional === true
        } : null,
        interpretationLimit: modes.length > 1
            ? 'Mehrere Belastungsmodelle im ausgewählten Zeitraum; keine gemeinsame Summierung oder Trendberechnung.'
            : modes.length === 0
                ? 'Keine einheitliche, auswertbare Load-Methode im ausgewählten Zeitraum vorhanden.'
                : statuses.incompleteDays || statuses.unknownDays
                    ? 'Die Zeitreihe enthält unvollständige oder unbekannte Tage.'
                    : null
    };
}

function summarizeCheckIns(checkIns) {
    const fields = ['hrv', 'rhr', 'sleepDuration', 'sleepScore', 'sleepQuality', 'fatigue', 'soreness', 'motivation', 'stress', 'respiration'];
    const result = {};
    fields.forEach(key => { result[key] = mean(checkIns, key); });
    return {
        entryCount: checkIns.length,
        metrics: result,
        note: 'Mittelwerte beziehen sich nur auf tatsächlich vorhandene numerische Einträge; sie sind keine Readiness-Bewertung.'
    };
}

/**
 * Erstellt transparente Kennzahlen aus den bereits ausgewählten Daten.
 * Die Zeitfensterwahl und Datenherkunft bleiben in dataCoverage/contextSelection.
 */
export function buildCoachAnalysisSummary({ activities = [], timeline = [], checkIns = [], plannedSessions = [], today = null } = {}) {
    const activitySummary = summarizeActivities(activities);
    const loadSummary = summarizeLoad(timeline);
    const checkInSummary = summarizeCheckIns(checkIns);
    const datedPlanned = plannedSessions.filter(item => {
        const date = dateKey(item?.date);
        return date && (!today || date >= today);
    }).sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));

    return {
        schemaVersion: 1,
        activitySummary,
        calculatedLoadSummary: loadSummary,
        recoveryCheckInSummary: checkInSummary,
        planningSummary: {
            plannedSessionCount: datedPlanned.length,
            nextPlannedSessions: datedPlanned.slice(0, 14).map(item => ({
                date: dateKey(item.date),
                name: item.name ?? null,
                type: item.type ?? null,
                duration: validNumber(item.duration) ? Number(item.duration) : null,
                category: item.category ?? null,
                description: item.desc ?? null
            }))
        },
        rules: [
            'Aggregierte Trainingsdauer ist nur dann als vollständig ausgewiesen, wenn für alle berücksichtigten Aktivitäten eine positive Dauer vorliegt.',
            'Load-Werte werden nur innerhalb eines einheitlichen Load-Modells interpretiert.',
            'Unbekannte und unvollständige Tage sind keine Ruhetage.',
            'Check-in-Mittelwerte sind deskriptiv und kein kombinierter Recovery- oder Readiness-Score.',
            'Diese Zusammenfassung ersetzt keine sportwissenschaftliche Interpretation und keine Prüfung der Rohdaten.'
        ]
    };
}
