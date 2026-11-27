/* ============================================================
 * readiness.js – Transparente, individualisierte Tages-Readiness
 *
 * Der Gesamtwert ist ein Orientierungsindex, keine medizinische Diagnose
 * und keine automatische Trainingsfreigabe. Trainingslast bleibt als
 * eigener Kontext getrennt von Regeneration und subjektivem Befinden.
 * ============================================================ */

import { state as appState } from './state.js';
import { getComparableGarminHrvValue, getGarminHrvMeasurementIdentity } from './garmin-metric-access.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const isValid = value => value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value));

function median(values) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values, average) {
    if (values.length < 2) return 0;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function readMetric(record, key) {
    if (!record) return null;
    if (key === 'hrv') {
        return getComparableGarminHrvValue(record);
    }
    const garminKeys = { rhr: 'garminRhr', respiration: 'garminRespiration', sleepDuration: 'garminSleepDuration', sleepScore: 'garminSleepScore' };
    return record[garminKeys[key] || key] ?? null;
}

function measurementIdentity(record, key) {
    return key === 'hrv' ? getGarminHrvMeasurementIdentity(record) : null;
}

/**
 * Scores a current physiological value against the athlete's own recent
 * distribution. Twelve prior observations are the minimum; 28 days are used
 * when available. A robust MAD scale reduces the influence of outliers.
 */
function individualTrendScore(value, historyValues, direction, minimumScale) {
    const values = historyValues.filter(isValid).map(Number);
    if (values.length < 12 || !isValid(value)) {
        return { score: null, baseline: null, deviation: null, observations: values.length, status: 'baseline-unavailable' };
    }

    const baseline = median(values);
    const deviations = values.map(item => Math.abs(item - baseline));
    const mad = median(deviations) ?? 0;
    const average = values.reduce((sum, item) => sum + item, 0) / values.length;
    const sd = standardDeviation(values, average);
    // 1.4826*MAD estimates the standard deviation for normally distributed data.
    // The SD fallback handles a low-MAD series; a metric-specific floor prevents
    // division by zero and implausibly large z-scores in nearly constant series.
    const scale = Math.max(1.4826 * mad, sd * 0.5, minimumScale);
    const deviation = (Number(value) - baseline) / scale;
    const favourableDeviation = deviation * direction;
    const score = Math.round(clamp(70 + 10 * Math.max(-3, Math.min(0, favourableDeviation))));
    return {
        score,
        baseline: Number(baseline.toFixed(1)),
        deviation: Number(deviation.toFixed(2)),
        observations: values.length,
        status: 'individual-baseline'
    };
}

function subjectiveScore(value, favourableWhenHigher = true) {
    if (!isValid(value)) return null;
    const numeric = Number(value);
    if (numeric < 1 || numeric > 5) return null;
    const normalized = (numeric - 1) / 4 * 100;
    return Math.round(favourableWhenHigher ? normalized : 100 - normalized);
}

function dateDistanceDays(fromKey, toKey) {
    const from = new Date(fromKey + 'T12:00:00').getTime();
    const to = new Date(toKey + 'T12:00:00').getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) return Infinity;
    return Math.round((to - from) / 86400000);
}

function meanScore(items) {
    const values = items.filter(item => Number.isFinite(item.score)).map(item => item.score);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function calculateReadiness(dateKey, sourceState = appState) {
    const checkins = sourceState?.dailyCheckins || {};
    const current = checkins[dateKey] || {};
    const history = Object.entries(checkins)
        .filter(([date]) => date < dateKey && dateDistanceDays(date, dateKey) >= 1 && dateDistanceDays(date, dateKey) <= 28)
        .map(([, record]) => record);

    const physiological = [];
    const baselineRequirements = [];
    const addPhysiological = (key, label, direction, floor) => {
        const value = readMetric(current, key);
        if (!isValid(value)) return;
        const compatibleHistory = key === 'hrv'
            ? history.filter(record => measurementIdentity(record, key) === measurementIdentity(current, key))
            : history;
        const baseline = individualTrendScore(
            value,
            compatibleHistory.map(record => readMetric(record, key)),
            direction,
            floor
        );
        if (baseline.score === null) {
            baselineRequirements.push({ key, label, observations: baseline.observations, required: 12 });
            return;
        }
        physiological.push({
            key, label, value: Number(value), score: baseline.score,
            baseline: baseline.baseline, deviation: baseline.deviation,
            observations: baseline.observations,
            ...(key === 'hrv' ? { measurementSource: current.measurementSources?.garminHrv || current.measurementSources?.hrv || null } : {})
        });
    };

    addPhysiological('hrv', 'HRV', 1, 3);
    addPhysiological('rhr', 'Ruheherzfrequenz', -1, 1);
    // A higher-than-usual respiratory rate may accompany physiological stress;
    // lower values do not automatically earn a readiness bonus.
    const respiration = readMetric(current, 'respiration');
    if (isValid(respiration)) {
        const result = individualTrendScore(
            respiration,
            history.map(record => readMetric(record, 'respiration')),
            -1,
            0.5
        );
        if (result.score !== null) {
            physiological.push({
                key: 'respiration', label: 'Atemfrequenz', value: Number(respiration),
                score: result.score, baseline: result.baseline,
                deviation: result.deviation, observations: result.observations
            });
        } else {
            baselineRequirements.push({ key: 'respiration', label: 'Atemfrequenz', observations: result.observations, required: 12 });
        }
    }

    const sleepItems = [];
    // Sleep Score is a proprietary composite. If available, use it as the
    // sleep-domain indicator and do not count duration again in the same score.
    const garminSleepScore = readMetric(current, 'sleepScore');
    if (isValid(garminSleepScore) && Number(garminSleepScore) >= 0 && Number(garminSleepScore) <= 100) {
        sleepItems.push({ key: 'sleepScore', label: 'Schlafscore', value: Number(garminSleepScore), score: Math.round(Number(garminSleepScore)) });
    } else {
        const duration = readMetric(current, 'sleepDuration');
        if (isValid(duration) && Number(duration) > 0 && Number(duration) <= 24) {
            const baseline = individualTrendScore(
                duration,
                history.map(record => readMetric(record, 'sleepDuration')),
                1,
                0.5
            );
            if (baseline.score !== null) {
                // More sleep than usual does not automatically imply better recovery;
                // only a meaningful shortfall below the athlete's own baseline is penalized.
                sleepItems.push({
                    key: 'sleepDuration', label: 'Schlafdauer', value: Number(duration),
                    score: baseline.score, baseline: baseline.baseline,
                    deviation: baseline.deviation, observations: baseline.observations
                });
            } else {
                baselineRequirements.push({ key: 'sleepDuration', label: 'Schlafdauer', observations: baseline.observations, required: 12 });
            }
        }
    }

    const subjective = [];
    const addSubjective = (key, label, favourableWhenHigher) => {
        const score = subjectiveScore(current[key], favourableWhenHigher);
        if (score === null) return;
        subjective.push({ key, label, value: Number(current[key]), score });
    };
    addSubjective('sleepQuality', 'Schlafqualität', true);
    addSubjective('motivation', 'Motivation', true);
    addSubjective('fatigue', 'Müdigkeit', false);
    addSubjective('soreness', 'Muskelkater', false);
    addSubjective('stress', 'Stress', false);

    const cycleImpact = Number(current.cycle?.trainingImpact);
    if (current.cycle?.trainingImpact !== null && current.cycle?.trainingImpact !== undefined
        && Number.isFinite(cycleImpact) && cycleImpact > 0 && cycleImpact <= 5) {
        subjective.push({
            key: 'cycleTrainingImpact',
            label: 'Zyklusbedingte Trainingsbeeinträchtigung',
            value: cycleImpact,
            score: Math.round(100 - cycleImpact / 5 * 100)
        });
    }

    const domains = {
        physiology: meanScore(physiological),
        sleep: meanScore(sleepItems),
        subjective: meanScore(subjective)
    };
    // Balanced domain weights: physiology 40%, sleep 30%, subjective 30%.
    // Missing domains are excluded and the remaining weights are renormalized.
    const weights = { physiology: 0.4, sleep: 0.3, subjective: 0.3 };
    const availableDomains = Object.entries(domains).filter(([, score]) => score !== null);
    const totalWeight = availableDomains.reduce((sum, [key]) => sum + weights[key], 0);
    const score = availableDomains.length >= 2
        ? Math.round(availableDomains.reduce((sum, [key, value]) => sum + value * weights[key], 0) / totalWeight)
        : null;

    const objective = [...physiological, ...sleepItems];
    const objectiveScore = meanScore(objective);
    const subjectiveDomainScore = meanScore(subjective);
    const totalCount = physiological.length + sleepItems.length + subjective.length;
    const domainCount = availableDomains.length;
    const dataQuality = domainCount >= 3
        ? 'Gute Datenbasis · 3 Bereiche'
        : domainCount === 2
            ? 'Eingeschränkte Datenbasis · 2 Bereiche'
            : domainCount === 1
                ? 'Unvollständige Datenbasis · 1 Bereich'
                : 'Noch keine ausreichende Datenbasis';

    const health = sourceState?.healthLogs?.[dateKey] || {};
    const healthStatus = String(health.status || '').toLowerCase();

    return {
        score,
        enoughData: domainCount >= 2,
        dataQuality,
        dataMode: subjective.length
            ? 'Wearable-Daten und subjektives Self-Monitoring'
            : 'Automatische Messdaten',
        objectiveScore: objectiveScore === null ? null : Math.round(objectiveScore),
        subjectiveScore: subjectiveDomainScore === null ? null : Math.round(subjectiveDomainScore),
        objectiveCount: objective.length,
        subjectiveCount: subjective.length,
        objective,
        subjective,
        domains,
        domainCount,
        totalCount,
        baselineRequirements,
        healthStatus,
        healthLog: health
    };
}

export function buildTrainingRecommendation(dateKey, planned = [], sourceState = appState) {
    const readiness = calculateReadiness(dateKey, sourceState);
    const health = sourceState?.healthLogs?.[dateKey] || {};
    const healthStatus = String(health.status || '').toLowerCase();
    const sessions = (Array.isArray(planned) ? planned : [])
        .filter(item => String(item?.date || '').slice(0, 10) === dateKey)
        .sort((a, b) => String(a.time || a.startTime || '').localeCompare(String(b.time || b.startTime || '')));

    const categoryLabels = {
        ga: 'GA-Ausdauer', interval: 'Intervalle', reg: 'Regeneration',
        strength: 'Kraft', tech: 'Technik', race: 'Wettkampf',
        'diagnostic-lactate': 'Laktattest', 'diagnostic-strength': 'Krafttest'
    };
    const assessmentCategories = ['diagnostic-lactate', 'diagnostic-strength'];
    const assessmentSessions = sessions.filter(item => assessmentCategories.includes(String(item.category || '').toLowerCase()));
    const allPlanned = Array.isArray(sourceState?.plannedActivities) ? sourceState.plannedActivities : planned;
    const nextDayAssessments = allPlanned.filter(item => assessmentCategories.includes(String(item?.category || '').toLowerCase())
        && dateDistanceDays(dateKey, String(item?.date || '').slice(0, 10)) === 1);
    const assessmentNames = items => items.map(item => categoryLabels[item.category] || item.name || 'Leistungsdiagnostik').join(' und ');
    const sessionText = sessions.length
        ? sessions.map(item => {
            const duration = isValid(item.duration) ? ' (' + Number(item.duration) + ' min)' : '';
            const category = categoryLabels[item.category] ? ' · ' + categoryLabels[item.category] : '';
            const sport = item.type ? ' · ' + String(item.type) : '';
            return String(item.name || 'Trainingseinheit') + duration + sport + category;
        }).join('; ')
        : 'Keine Trainingseinheit im Kalender geplant';
    const highDemandSession = sessions.some(item =>
        ['interval', 'race', 'strength'].includes(String(item.category || '').toLowerCase())
        || (isValid(item.duration) && Number(item.duration) >= 90)
    );
    const lowDemandOnly = sessions.length > 0 && sessions.every(item =>
        ['reg', 'tech'].includes(String(item.category || '').toLowerCase())
    );

    if (healthStatus === 'sick' || healthStatus === 'injured') {
        return {
            title: healthStatus === 'sick' ? 'Gesundheit hat Vorrang' : 'Verletzungsstatus berücksichtigen',
            detail: 'Heute keine Trainingsfreigabe: Kläre den Gesundheitsstatus und beachte medizinische Vorgaben, bevor du wieder belastest.',
            decision: 'health-review',
            readiness
        };
    }

    if (assessmentSessions.length) {
        return {
            title: 'Leistungsdiagnostik hat Vorrang',
            detail: assessmentNames(assessmentSessions) + ' ist heute die Hauptbelastung. Keine zusätzliche intensive oder kraftbetonte Einheit; weitere Einheiten höchstens locker regenerativ.',
            decision: 'assessment-day',
            readiness
        };
    }

    if (nextDayAssessments.length) {
        return {
            title: 'Belastung vor Leistungsdiagnostik reduzieren',
            detail: 'Morgen steht ' + assessmentNames(nextDayAssessments) + ' an. Heute nur lockere Technik oder Regeneration; keine intensiven Intervalle und kein schweres Krafttraining.',
            decision: 'assessment-preparation',
            readiness
        };
    }

    if (readiness.score === null) {
        return {
            title: 'Tagesform derzeit nicht sicher beurteilbar',
            detail: 'Die Tagesform lässt sich nicht zuverlässig einordnen. Prüfe dein Befinden und das Aufwärmen; heute keine intensive Einheit allein aufgrund der App-Daten beginnen.',
            decision: 'insufficient-data',
            readiness
        };
    }

    const subjective = sourceState?.dailyCheckins?.[dateKey] || {};
    const severeSubjectiveSignal = ['fatigue', 'soreness', 'stress']
        .some(key => isValid(subjective[key]) && Number(subjective[key]) >= 4);
    const physiologicalMarkers = readiness.objective.filter(item =>
        ['hrv', 'rhr', 'respiration'].includes(item.key)
    );
    // A marked adverse deviation in one physiological marker must not be
    // averaged away by a good sleep score or subjective response.
    const adverseDeviation = item => {
        const deviation = Number(item.deviation);
        if (!Number.isFinite(deviation)) return 0;
        return item.key === 'hrv' ? -deviation : deviation;
    };
    // The same individual reference bands are used for display and decision context:
    // >1 robust scale = caution; >2 = marked deviation. This is not a diagnosis.
    const criticalPhysiologySignal = physiologicalMarkers.some(item => adverseDeviation(item) > 2);
    const cautionPhysiologySignal = physiologicalMarkers.some(item => adverseDeviation(item) > 1);
    const lowDomain = Object.values(readiness.domains)
        .some(value => Number.isFinite(value) && value < 35);
    const highLoadLabel = (() => {
        const timeline = Array.isArray(sourceState?.dailyTimeline) ? sourceState.dailyTimeline : [];
        const candidate = timeline
            .filter(day => day?.date <= dateKey && isValid(day?.load) && isValid(day?.ctl)
                && day.dataStatus !== 'unknown' && day.dataStatus !== 'incomplete-activity-load')
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
        if (!candidate || dateDistanceDays(candidate.date, dateKey) > 1) return null;
        return candidate.statusLabel === 'Hohe Ermüdung' || candidate.statusLabel === 'Belastung'
            ? candidate
            : null;
    })();

    let decision = 'maintain';
    let title = 'Plan beibehalten – Tagesform beobachten';
    let detail = 'Die verfügbaren Bereiche ergeben einen Readiness-Orientierungswert von ' + readiness.score
        + '/100. Das ist keine Trainingsfreigabe: Beginne mit dem geplanten Aufwärmen und prüfe, ob Belastungsgefühl und Leistung zu deinem üblichen Niveau passen.';

    if (readiness.score < 45 || severeSubjectiveSignal || criticalPhysiologySignal || (lowDomain && readiness.score < 60)) {
        decision = 'modify';
        title = 'Training heute anpassen';
        detail = highDemandSession
            ? 'Mindestens ein Readiness-Bereich oder dein subjektives Befinden weist auf eine mögliche Einschränkung hin. Für die geplante intensive, kraftbetonte oder lange Einheit solltest du Umfang oder Intensität reduzieren oder sie durch lockere Grundlagen-/Technikarbeit ersetzen. Bei deutlicher Verschlechterung Training abbrechen und Ursache klären.'
            : 'Mindestens ein Readiness-Bereich oder dein subjektives Befinden weist auf eine mögliche Einschränkung hin. Halte die Einheit heute leicht und vermeide zusätzliche Belastungsspitzen. Bei deutlicher Verschlechterung Training abbrechen und Ursache klären.';
    } else if (readiness.score < 65 || lowDomain || cautionPhysiologySignal) {
        decision = 'caution';
        title = 'Kontrolliert trainieren';
        detail = highDemandSession
            ? 'Die Datenlage spricht für eine vorsichtige Steuerung. Eine geplante intensive, kraftbetonte oder lange Einheit sollte angepasst werden; reduziere zunächst Umfang oder Intensität und bewerte das Aufwärmen.'
            : lowDemandOnly
                ? 'Die Datenlage spricht für eine vorsichtige Steuerung. Eine lockere Technik- oder Regenerationseinheit kann passend sein, sofern Befinden und Aufwärmen unauffällig sind; vermeide zusätzliche Intensität.'
                : 'Die Datenlage spricht für eine vorsichtige Steuerung. Halte den geplanten Trainingszweck im Blick, vermeide zusätzliche Belastungsspitzen und passe die Einheit an, wenn Aufwärmen oder Belastungsgefühl auffällig sind.';
    }

    if (highLoadLabel) {
        decision = decision === 'maintain' ? 'caution' : decision;
        title = decision === 'modify' ? title : 'Belastungsverlauf zusätzlich beachten';
        detail += ' Das aktuelle Belastungsmodell zeigt ebenfalls einen erhöhten Belastungsstatus (' + highLoadLabel.statusLabel
            + ', Stand ' + highLoadLabel.date + '). CTL/ATL und Status sind Modellindikatoren, keine direkte Messung deiner Leistungsfähigkeit.';
    }

    if (!sessions.length) {
        detail += ' Es ist keine konkrete Einheit geplant; die Einordnung ist daher eine allgemeine Tagesorientierung.';
    } else if (sessions.length > 1) {
        detail += ' Für heute sind mehrere Einheiten geplant (' + sessionText + '); bewerte auch die Gesamtbelastung beider Einheiten.';
    } else {
        detail += ' Geplant: ' + sessionText + '. Der Planinhalt und der beabsichtigte Trainingsreiz müssen bei der endgültigen Entscheidung zusätzlich berücksichtigt werden.';
    }
    if (sessions.some(item => isValid(item.targetTss))) {
        detail += ' Der eingetragene Ziel-Load wird nicht automatisch mit Garmin Load oder KAJO-HF-Punkten verrechnet: Diese Belastungsskalen sind ohne validierte Umrechnung nicht direkt vergleichbar.';
    }

    // Dashboard copy is deliberately action-focused: the athlete already sees
    // readiness and load metrics in adjacent cards, so do not repeat raw values.
    const plannedNames = sessions.map(item => String(item.name || categoryLabels[item.category] || 'Trainingseinheit'));
    const plannedLabel = plannedNames.length ? plannedNames.join(' + ') : '';
    let conciseDetail;
    if (decision === 'modify') {
        conciseDetail = plannedLabel
            ? 'Heute ' + plannedLabel + ' deutlich entschärfen: keine zusätzliche Intensität; bei auffälligem Aufwärmen auf lockere Technik oder Regeneration wechseln.'
            : 'Heute nur lockere Technik oder Regeneration. Keine intensive oder kraftbetonte Belastung; bei auffälligem Befinden pausieren.';
    } else if (decision === 'caution') {
        conciseDetail = plannedLabel
            ? plannedLabel + ' kontrolliert und ohne zusätzliche Belastungsspitzen durchführen. Umfang oder Intensität reduzieren, wenn sich das Aufwärmen ungewohnt schwer anfühlt.'
            : 'Wenn du trainierst, halte die Einheit locker bis moderat und verzichte auf zusätzliche Belastungsspitzen.';
    } else {
        conciseDetail = plannedLabel
            ? plannedLabel + ' wie geplant durchführen. Im Aufwärmen prüfen, ob sich Technik und Belastungsgefühl normal anfühlen.'
            : 'Keine Einheit eingetragen. Wenn du trainieren möchtest, wähle eine lockere, technisch saubere Einheit passend zu deinem aktuellen Trainingsblock.';
    }
    if (sessions.length > 1) conciseDetail += ' Die zweite Einheit in die Tagesbelastung einrechnen.';
    return { title, detail: conciseDetail, decision, readiness };
}
