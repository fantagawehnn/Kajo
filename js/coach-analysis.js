import { calculateGarminZoneLoad } from './training-load.js';
import { isGarminActivity } from './data-source.js';

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

function isoWeekNumber(value) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) return null;
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
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
            week.knownMinutes += Number(item.duration);
        } else {
            week.missingDurationCount++;
        }
    });
    return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, value]) => {
        const weekEndDate = new Date(`${weekStart}T12:00:00Z`);
        weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
        const weekEnd = weekEndDate.toISOString().slice(0, 10);
        const weekNumber = isoWeekNumber(weekStart);
        return {
            weekStarting: weekStart,
            weekEnding: weekEnd,
            isoWeekNumber: weekNumber,
            isoWeekLabel: weekNumber === null ? null : `KW ${String(weekNumber).padStart(2, '0')}`,
            sessions: value.sessions,
            durationMinutes: value.missingDurationCount === 0 ? Number(value.knownMinutes.toFixed(1)) : null,
            knownDurationMinutes: Number(value.knownMinutes.toFixed(1)),
            sessionsMissingDuration: value.missingDurationCount
        };
    });
}

function summarizeActivities(activities) {
    const dated = activities.filter(item => dateKey(item?.date));
    const durationValues = dated.filter(item => validNumber(item.duration) && Number(item.duration) > 0);
    const missingDurationCount = dated.length - durationValues.length;
    const totalMinutes = durationValues.reduce((sum, item) => sum + Number(item.duration), 0);
    const byType = new Map();

    dated.forEach(item => {
        const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : 'Nicht angegeben';
        if (!byType.has(type)) byType.set(type, { sessions: 0, durationMinutes: 0, durationKnown: 0, durationMissing: 0 });
        const group = byType.get(type);
        group.sessions++;
        if (validNumber(item.duration) && Number(item.duration) > 0) {
            group.durationMinutes += Number(item.duration);
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


function summarizeCanoeSpecificActivities(activities) {
    const allCanoeActivities = activities.filter(item =>
        ['Kayaking', 'C1', 'C2'].includes(item?.type)
    );
    const canoeActivities = allCanoeActivities.filter(item => dateKey(item?.date));
    const boatClass = type => type === 'Kayaking' ? 'K1' : type;
    const waterType = item => {
        const value = item?.waterConditions?.type || item?.waterType;
        return ['wildwater', 'flatwater'].includes(value) ? value : null;
    };
    const raceFormat = item => {
        const value = typeof item?.raceFormat === 'string' ? item.raceFormat.toLowerCase() : '';
        return ['classic', 'sprint'].includes(value) ? value : null;
    };
    const groups = new Map();

    canoeActivities.forEach(item => {
        const keyParts = [boatClass(item.type), raceFormat(item) || 'not_recorded', waterType(item) || 'not_recorded'];
        const key = keyParts.join('::');
        if (!groups.has(key)) groups.set(key, {
            boatClass: keyParts[0],
            raceFormat: raceFormat(item),
            waterType: waterType(item),
            sessions: 0,
            knownDurationMinutes: 0,
            missingDurationCount: 0
        });
        const group = groups.get(key);
        group.sessions++;
        if (validNumber(item.duration) && Number(item.duration) > 0) {
            group.knownDurationMinutes += Number(item.duration);
        } else {
            group.missingDurationCount++;
        }
    });

    return {
        eligibleCanoeSessions: canoeActivities.length,
        undatedCanoeSessionsExcluded: allCanoeActivities.length - canoeActivities.length,
        classifiedRaceFormatSessions: canoeActivities.filter(item => raceFormat(item)).length,
        unclassifiedRaceFormatSessions: canoeActivities.filter(item => !raceFormat(item)).length,
        classifiedWaterTypeSessions: canoeActivities.filter(item => waterType(item)).length,
        unclassifiedWaterTypeSessions: canoeActivities.filter(item => !waterType(item)).length,
        groups: [...groups.values()].map(group => ({
            boatClass: group.boatClass,
            raceFormat: group.raceFormat,
            waterType: group.waterType,
            sessions: group.sessions,
            durationMinutes: group.missingDurationCount === 0
                ? Number(group.knownDurationMinutes.toFixed(1))
                : null,
            knownDurationMinutes: Number(group.knownDurationMinutes.toFixed(1)),
            sessionsMissingDuration: group.missingDurationCount
        })),
        interpretationLimit: 'K1 wird in den gespeicherten Aktivitäten durch den Aktivitätstyp Kayaking abgebildet. Nicht datierte Kanu-Aktivitäten werden aus den zeitbezogenen Gruppen ausgeschlossen und separat gezählt. Fehlende Rennformat- oder Wasserangaben bleiben nicht zugeordnet. Die Gruppen beschreiben dokumentierte Einheiten und sind kein Leistungsvergleich.'
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

function summarizeHeartRateZones(activities, settings, profile, dailyCheckins = {}) {
    const eligible = activities.filter(isGarminActivity);
    const groups = new Map();
    let analyzedCount = 0;

    eligible.forEach(activity => {
        const result = calculateGarminZoneLoad(activity, settings, profile, dailyCheckins);
        if (!result || !Array.isArray(result.secondsByZone) || result.secondsByZone.length !== 5) return;
        analyzedCount++;
        const type = typeof activity.type === 'string' && activity.type.trim() ? activity.type.trim() : 'Nicht angegeben';
        const key = type + '::' + result.zoneSource;
        if (!groups.has(key)) groups.set(key, {
            activityType: type,
            zoneSource: result.zoneSource,
            activityCount: 0,
            secondsByZone: [0, 0, 0, 0, 0]
        });
        const group = groups.get(key);
        group.activityCount++;
        result.secondsByZone.forEach((seconds, index) => {
            if (Number.isFinite(Number(seconds)) && Number(seconds) > 0) {
                group.secondsByZone[index] += Number(seconds);
            }
        });
    });

    return {
        source: 'KAJO calculation from Garmin heart-rate time series',
        eligibleGarminActivities: eligible.length,
        analyzedActivities: analyzedCount,
        excludedOrUnanalyzableActivities: eligible.length - analyzedCount,
        groups: [...groups.values()].map(group => {
            const totalSeconds = group.secondsByZone.reduce((sum, value) => sum + value, 0);
            return {
                activityType: group.activityType,
                zoneSource: group.zoneSource,
                activityCount: group.activityCount,
                recordedHeartRateMinutes: Number((totalSeconds / 60).toFixed(1)),
                minutesByZone: group.secondsByZone.map(value => Number((value / 60).toFixed(1)))
            };
        })
    };
}

function summarizeCompetitionResults(races) {
    const entries = [];
    races.forEach(race => {
        const raceDate = dateKey(race?.date);
        (Array.isArray(race?.results) ? race.results : []).forEach(result => {
            const rank = validNumber(result?.rank) && Number(result.rank) > 0
                ? Number(result.rank) : null;
            entries.push({
                race: race?.name ?? null,
                date: raceDate,
                discipline: result?.discipline ?? null,
                format: result?.format ?? null,
                rank,
                time: result?.time ?? null,
                gap: result?.gap ?? null
            });
        });
    });
    const groups = new Map();
    entries.forEach(entry => {
        const key = [entry.discipline || 'Nicht angegeben', entry.format || 'Nicht angegeben'].join('::');
        if (!groups.has(key)) groups.set(key, {
            discipline: entry.discipline,
            format: entry.format,
            resultCount: 0,
            rankedResultCount: 0,
            bestPlace: null
        });
        const group = groups.get(key);
        group.resultCount++;
        if (entry.rank !== null) {
            group.rankedResultCount++;
            group.bestPlace = group.bestPlace === null ? entry.rank : Math.min(group.bestPlace, entry.rank);
        }
    });
    return {
        raceCount: races.length,
        resultCount: entries.length,
        rankedResultCount: entries.filter(item => item.rank !== null).length,
        bestPlacementsByDisciplineAndFormat: [...groups.values()],
        recentResults: entries
            .filter(item => item.date)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 12),
        interpretation: 'Platzierungen werden nur innerhalb derselben Disziplin- und Formatgruppe zusammengefasst. Unterschiedliche Wettkämpfe sind ohne weitere Kontextdaten nicht direkt leistungsdiagnostisch vergleichbar.'
    };
}

function summarizeVo2max(checkIns) {
    const records = checkIns
        .filter(item => dateKey(item?.date) && validNumber(item?.vo2max) && Number(item.vo2max) > 0)
        .map(item => ({ date: dateKey(item.date), value: Number(item.vo2max) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    if (!records.length) {
        return {
            measurementCount: 0,
            first: null,
            latest: null,
            absoluteChange: null,
            relativeChangePct: null,
            interpretation: 'Keine numerischen VO2max-Messwerte im ausgewählten Zeitraum vorhanden.'
        };
    }
    const first = records[0];
    const latest = records[records.length - 1];
    const absoluteChange = records.length > 1
        ? Number((latest.value - first.value).toFixed(1))
        : null;
    const relativeChangePct = records.length > 1 && first.value !== 0
        ? Number(((latest.value - first.value) / first.value * 100).toFixed(1))
        : null;
    return {
        measurementCount: records.length,
        first,
        latest,
        absoluteChange,
        relativeChangePct,
        interpretation: records.length > 1
            ? 'Deskriptive Veränderung zwischen erstem und letztem dokumentiertem Wert; Messmethode, Bedingungen und Schätzunsicherheit sind nicht bewertet.'
            : 'Nur ein Messwert vorhanden; daraus lässt sich kein Verlauf ableiten.'
    };
}

function summarizeSourceAwareMetric(records, selectValue, unit) {
    const selected = records.map(selectValue).filter(Boolean);
    const values = selected.map(item => item.value);
    const sourceCounts = selected.reduce((counts, item) => {
        counts[item.source] = (counts[item.source] || 0) + 1;
        return counts;
    }, {});
    return {
        mean: values.length
            ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
            : null,
        count: values.length,
        unit,
        sourceCounts
    };
}

function summarizeCheckIns(checkIns) {
    const hrvMs = summarizeSourceAwareMetric(checkIns, item => {
        // Garmin's dedicated field is authoritative when both representations exist.
        if (validNumber(item?.garminHrv) && Number(item.garminHrv) > 0) {
            return { value: Number(item.garminHrv), source: 'garmin' };
        }
        // A generic HRV value is used only when its provenance explicitly confirms ms.
        const provenance = item?.measurementSources?.hrv;
        if (validNumber(item?.hrv) && Number(item.hrv) > 0
            && provenance?.unit === 'ms'
            && typeof provenance?.source === 'string' && provenance.source.trim()) {
            return { value: Number(item.hrv), source: provenance.source };
        }
        return null;
    }, 'ms');

    const rhrBpm = summarizeSourceAwareMetric(checkIns, item => {
        // Do not count both Garmin and the duplicated generic representation for one day.
        if (validNumber(item?.garminRhr) && Number(item.garminRhr) > 0) {
            return { value: Number(item.garminRhr), source: 'garmin' };
        }
        if (validNumber(item?.rhr) && Number(item.rhr) > 0) {
            return { value: Number(item.rhr), source: 'checkin' };
        }
        return null;
    }, 'bpm');

    const fields = ['sleepDuration', 'sleepScore', 'sleepQuality', 'bodyBattery', 'garminStress', 'fatigue', 'soreness', 'motivation', 'stress', 'respiration'];
    const result = {};
    fields.forEach(key => { result[key] = mean(checkIns, key); });
    result.hrvMs = hrvMs;
    result.rhrBpm = rhrBpm;

    return {
        entryCount: checkIns.length,
        metrics: result,
        metricRules: {
            hrvMs: 'HRV ausschließlich in Millisekunden (ms); Garmin garminHrv hat Vorrang. Generisches hrv nur bei dokumentierter measurementSources.hrv.unit = ms und vorhandener Quellenangabe.',
            rhrBpm: 'Ruheherzfrequenz ausschließlich in Schlägen pro Minute (bpm); garminRhr hat pro Tag Vorrang vor rhr. Beide Werte eines Tages werden nie doppelt gezählt.'
        },
        note: 'Mittelwerte beziehen sich nur auf tatsächlich vorhandene numerische Einträge; HRV und Ruheherzfrequenz werden getrennt mit expliziten Einheiten ausgewiesen. Die Kennzahlen sind keine Readiness-Bewertung.'
    };
}

/**
 * Erstellt transparente Kennzahlen aus den bereits ausgewählten Daten.
 * Die Zeitfensterwahl und Datenherkunft bleiben in dataCoverage/contextSelection.
 */
export function buildCoachAnalysisSummary({ activities = [], timeline = [], checkIns = [], dailyCheckins = {}, plannedSessions = [], races = [], today = null, settings = {}, profile = {} } = {}) {
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
        canoeSpecificActivitySummary: summarizeCanoeSpecificActivities(activities),
        heartRateZoneDistribution: summarizeHeartRateZones(activities, settings, profile, dailyCheckins),
        calculatedLoadSummary: loadSummary,
        recoveryCheckInSummary: checkInSummary,
        performanceSummary: {
            vo2max: summarizeVo2max(checkIns),
            competitionResults: summarizeCompetitionResults(races)
        },
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
            'Aktivitätsdauer wird im gespeicherten KAJO-Datensatz in Minuten geführt. Aggregierte Trainingsdauer ist nur dann als vollständig ausgewiesen, wenn für alle berücksichtigten Aktivitäten eine positive Dauer vorliegt.',
            'Kanu-Einheiten werden anhand des Aktivitätstyps Kayaking (K1), C1 und C2 gruppiert. Rennformat und Wasserart werden nur berücksichtigt, wenn sie dokumentiert sind.',
            'Load-Werte werden nur innerhalb eines einheitlichen Load-Modells interpretiert.',
            'Unbekannte und unvollständige Tage sind keine Ruhetage.',
            'Check-in-Mittelwerte sind deskriptiv und kein kombinierter Recovery- oder Readiness-Score.',
            'Diese Zusammenfassung ersetzt keine sportwissenschaftliche Interpretation und keine Prüfung der Rohdaten.'
        ]
    };
}
