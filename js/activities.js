/* ============================================================
 * activities.js – Aktivitäts-Details, manuelle Korrektur, Löschen,
 *                 Sportarten- und Kategorie-Erkennung
 * ============================================================ */

import { state, refreshAll } from './state.js';
import { getActivityGroupMembers, getVisibleActivities, mergeActivityPair, unmergeActivityGroup } from './activity-groups.js?v=1';
import { saveDataToLocalStorage, saveActivitiesToLocalStorage } from './storage.js?v=8';
import { formatDateDDMMYY, formatKm, getSportsCatalog, escapeHtml, toLocalDateString } from './utils.js';
import { queueActivityDeletionTombstone } from './activity-deletions.js?v=1';
import { renderActivityTelemetryChart, getActivityTelemetrySeries, focusActivityTelemetryPoint } from './charts.js';
import { getTrainingLoadData, calculateGarminZoneLoad, getAdaptiveRestingHr, calculateHeartRateReserveZones, buildGarminActivityAnalysis, getActivityLoadQualityStatus } from './training-load.js?v=6';
import { calculateStrengthActivitySummary } from './calculations.js';
import { getActivityTelemetry, getGarminHeartRateSeries, isGarminActivity, summarizeTimeAxis } from './data-source.js';
import { getGarminTelemetryActivityId } from './garmin-cloud-telemetry.js?v=5';
import { populateActivityRouteSelect } from './routes.js';

// Read-only-Diagnose der Zeitreihen in der aktuell geöffneten Aktivität.
// Es werden weder Garmin-Endpunkte aufgerufen noch Daten gespeichert/verändert.
function diagnoseSelectedActivityTelemetry() {
    const activity = state.selectedActivityForModal;
    const output = document.getElementById('activity-telemetry-diagnostic-output');
    if (!activity || !output) return;

    const garmin = activity.garminTelemetry && typeof activity.garminTelemetry === 'object'
        ? activity.garminTelemetry : {};
    const generic = activity.telemetry && typeof activity.telemetry === 'object'
        ? activity.telemetry : {};
    const selectedTelemetry = getActivityTelemetry(activity);
    const series = getActivityTelemetrySeries(activity);
    const hrSeries = series.find(item => item.key === 'hr');
    const validCount = values => Array.isArray(values)
        ? values.filter(value => value !== null && value !== undefined && value !== ''
            && Number.isFinite(Number(value)) && Number(value) >= 30 && Number(value) <= 250).length
        : 0;
    const chartTimeSource = activity.telemetry ? 'telemetry (generisch)' : activity.garminTelemetry ? 'garminTelemetry' : 'keine';
    const chartTimes = Array.isArray((activity.telemetry || activity.garminTelemetry || {}).time)
        ? (activity.telemetry || activity.garminTelemetry).time : [];
    const hrValues = Array.isArray(garmin.hr) ? garmin.hr : [];
    const hrTimes = Array.isArray(garmin.time) ? garmin.time : [];
    const genericHr = Array.isArray(generic.hr) ? generic.hr : [];
    const genericTimes = Array.isArray(generic.time) ? generic.time : [];
    const chartTimeValid = chartTimes.length > 1
        && chartTimes.every(value => Number.isFinite(Number(value)))
        && chartTimes.slice(1).every((value, index) => Number(value) > Number(chartTimes[index]));
    const lines = [
        'KAJO – Zeitreihen-Diagnose (nur lesend)',
        'Aktivität: ' + (activity.name || activity.type || 'Unbenannt'),
        'Datum: ' + (activity.date || 'nicht vorhanden'),
        'Aktivitäts-ID: ' + String(activity.id ?? 'nicht vorhanden'),
        '',
        'HERKUNFT',
        'Als Garmin erkannt: ' + (isGarminActivity(activity) ? 'Ja' : 'Nein'),
        'FIT-Import markiert: ' + (activity.garminFitImported === true ? 'Ja' : 'Nein'),
        'Zentraler Datenzugriff: ' + (selectedTelemetry === garmin && selectedTelemetry ? 'garminTelemetry'
            : selectedTelemetry === generic && selectedTelemetry ? 'telemetry (FIT)' : 'keine Zeitreihe'),
        '',
        'GARMIN-TELEMETRIE',
        'HF-Array: ' + hrValues.length + ' Werte · davon plausibel: ' + validCount(hrValues),
        'Zeit-Array: ' + hrTimes.length + ' Werte',
        'HF/Zeit gleich lang: ' + (hrValues.length === hrTimes.length ? 'Ja' : 'Nein'),
        '',
        'GENERISCHE TELEMETRIE',
        'HF-Array: ' + genericHr.length + ' Werte · davon plausibel: ' + validCount(genericHr),
        'Zeit-Array: ' + genericTimes.length + ' Werte',
        '',
        'DIAGRAMM',
        'Herzfrequenzreihe durch Datenzugriff erzeugt: ' + (hrSeries ? 'Ja' : 'Nein'),
        'HF-Messpunkte in Reihe: ' + (hrSeries ? hrSeries.values.length : 0),
        'Zeitachsenquelle laut Diagrammcode: ' + chartTimeSource,
        'Zeitwerte für Zeitachse: ' + chartTimes.length,
        'Zeitachse numerisch und streng aufsteigend: ' + (chartTimeValid ? 'Ja' : 'Nein'),
        'Zeitachse passt zur HF-Reihe: ' + (hrSeries && chartTimes.length === hrSeries.values.length ? 'Ja' : 'Nein'),
        '',
        'HINWEIS',
        'Diese Diagnose untersucht nur das aktuell in KAJO geladene Aktivitätsobjekt. Sie liest keine Supabase-Rohdatensätze und startet keinen Garmin-Abruf.'
    ];

    if (activity.telemetry && activity.garminTelemetry && activity.telemetry !== activity.garminTelemetry) {
        lines.push('', 'AUFFÄLLIGKEIT: Beide Telemetrie-Felder existieren. Das Diagramm verwendet für die Zeitachse aktuell das generische Feld vor garminTelemetry.');
    }
    if (hrValues.length && hrTimes.length && hrValues.length !== hrTimes.length) {
        lines.push('AUFFÄLLIGKEIT: Garmin-HF- und Garmin-Zeitarray haben unterschiedliche Längen.');
    }
    if (!hrSeries && hrValues.length >= 2) {
        lines.push('AUFFÄLLIGKEIT: Garmin-HF-Werte sind vorhanden, werden aber nicht als Diagrammreihe erkannt. Herkunftskennzeichnung und Wertebereich prüfen.');
    }
    if (hrSeries && chartTimes.length !== hrSeries.values.length) {
        lines.push('AUFFÄLLIGKEIT: Die Zeitachse hat nicht dieselbe Länge wie die angezeigte Messreihe.');
    }

    output.textContent = lines.join('\n');
    output.hidden = false;
}

// Liest den tatsächlich gespeicherten Cloud-Datensatz der geöffneten Aktivität.
// Die Ausgabe enthält ausschließlich Struktur- und Qualitätskennzahlen, keine Rohwerte.
async function diagnoseGarminCloudTelemetry() {
    const output = document.getElementById('garmin-cloud-telemetry-diagnostic-output');
    const button = document.getElementById('garmin-cloud-telemetry-diagnostic-run');
    const activity = state.selectedActivityForModal;
    if (!output || !button || !activity) return;

    const rawId = activity.sourceRefs?.garminActivityId
        ?? activity.garminData?.activityId ?? activity.id;
    const activityId = String(rawId ?? '').replace(/^garmin-/, '');
    if (!/^\d+$/.test(activityId)) {
        output.textContent = 'Für diese Aktivität ist keine gültige Garmin-Aktivitäts-ID hinterlegt.';
        output.hidden = false;
        return;
    }

    button.disabled = true;
    button.textContent = 'Cloud-Datensatz wird geprüft …';
    output.textContent = 'Lese den gespeicherten Telemetrie-Datensatz nur lesend aus …';
    output.hidden = false;

    const summarize = (label, telemetry) => {
        if (!telemetry || typeof telemetry !== 'object') return [label + ': kein Telemetrieobjekt'];
        const act = { ...activity, garminTelemetry: telemetry };
        const metricSeries = telemetry.metricSeries && typeof telemetry.metricSeries === 'object'
            ? telemetry.metricSeries : {};
        const series = getGarminHeartRateSeries(act);
        const axis = series?.time
            || (Array.isArray(telemetry.metricSeriesTime) ? telemetry.metricSeriesTime : null)
            || (Array.isArray(telemetry.time) ? telemetry.time : null);
        const axisStats = summarizeTimeAxis(axis);
        const monotonic = axisStats.valid;
        const durationSeconds = Number(telemetry.durationSeconds);
        const axisEnd = axisStats.valid ? Number(axis[axis.length - 1]) : NaN;
        const matchesDuration = Number.isFinite(durationSeconds) && Number.isFinite(axisEnd)
            && Math.abs(axisEnd - durationSeconds) < 0.01;
        const secondsConfirmed = telemetry.source === 'garmin-activity-details-json' && matchesDuration;
        const timeKind = !monotonic
            ? 'keine gültige aufsteigende Zeitachse'
            : secondsConfirmed ? 'Sekunden (durch Importquelle und durationSeconds-Abgleich bestätigt)'
                : Number(axis[axis.length - 1]) > 100000000000 ? 'absolut wirkende Zeitstempel (ms)'
                    : Number(axis[axis.length - 1]) > 1000000000 ? 'absolut wirkende Zeitstempel (s)'
                        : 'numerische Zeitachse; Einheit muss aus Import-Metadaten bestätigt werden';
        const metricLines = Object.entries(metricSeries).map(([key, metric]) => {
            const values = Array.isArray(metric?.values) ? metric.values : [];
            const valid = values.filter(value => value !== null && value !== undefined && value !== ''
                && Number.isFinite(Number(value))).length;
            return '  · ' + key + (metric?.label ? ' (' + metric.label + ')' : '')
                + ': ' + values.length + ' Werte, ' + valid + ' numerisch';
        });
        const hrCount = Array.isArray(series?.hr) ? series.hr.length : 0;
        const validHr = hrCount ? series.hr.filter(value => value !== null && value !== undefined && value !== ''
            && Number.isFinite(Number(value)) && Number(value) >= 30 && Number(value) <= 250).length : 0;
        const load = calculateGarminZoneLoad(act, state.settings, state.profile, state.dailyCheckins);
        const timeUnitAssessment = secondsConfirmed
            ? 'Sekunden bestätigt: Garmin-Zeitstempel wurden beim Import durch 1000 geteilt; Zeitachsenende stimmt mit durationSeconds überein'
            : 'nicht bestätigt: Importquelle und durationSeconds-Abgleich reichen für diesen Datensatz nicht aus';
        return [
            label + ':',
            '  Telemetriequelle: ' + (telemetry.source || 'nicht angegeben'),
            '  Startzeit laut Import: ' + (telemetry.startTimeIso || 'nicht vorhanden'),
            '  Endzeit laut Import: ' + (telemetry.endTimeIso || 'nicht vorhanden'),
            '  durationSeconds laut Import: ' + (Number.isFinite(durationSeconds) ? durationSeconds : 'nicht vorhanden'),
            '  Zeitachsenende stimmt mit durationSeconds überein: ' + (matchesDuration ? 'Ja' : 'Nein / nicht prüfbar'),
            '  Zeiteinheitenbewertung: ' + timeUnitAssessment,
            '  HF-Reihe erkannt: ' + (series ? 'Ja (' + series.source + ')' : 'Nein'),
            '  HF-Messpunkte: ' + hrCount + ' · plausibel: ' + validHr,
            '  Zeitwerte zur HF-Reihe: ' + (Array.isArray(series?.time) ? series.time.length : 0),
            '  Zeitachse: ' + timeKind,
            '  Zeitabstände (unveränderte Quelleinheit): min ' + (axisStats.valid ? axisStats.minInterval : 'n/a')
                + ' · Median ' + (axisStats.valid ? axisStats.medianInterval : 'n/a')
                + ' · max ' + (axisStats.valid ? axisStats.maxInterval : 'n/a'),
            '  Zeitliche Abdeckung (letzter minus erster Zeitwert): ' + (axisStats.valid ? axisStats.span : 'n/a')
                + ' Quelleinheiten',
            '  Rohintervalle <= 30 Quelleinheiten: ' + (axisStats.valid ? axisStats.intervalsAtMost30 : 'n/a')
                + ' · Summe: ' + (axisStats.valid ? axisStats.intervalSumAtMost30 : 'n/a'),
            '  Rohintervalle > 30 Quelleinheiten: ' + (axisStats.valid ? axisStats.intervalsOver30 : 'n/a')
                + ' · Summe: ' + (axisStats.valid ? axisStats.intervalSumOver30 : 'n/a'),
            '  Load-Logik: Jeder HF-Punkt gilt bis zum nächsten Zeitstempel; der letzte Punkt erhält keine zusätzliche Zeit. Intervalle > 30 Sekunden werden ausgeschlossen.',
            '  Aktivitätstyp für HF-Zonen: ' + (activity.type || 'nicht angegeben'),
            '  Zonenquelle: ' + (load?.zoneSource || 'nicht berechenbar'),
            '  Verwendete Zonengrenzen (Z1–Z4): ' + (load?.zones?.join(' / ') || 'nicht verfügbar'),
            '  Zonenzeit (Sekunden, Z1–Z5): ' + (load?.secondsByZone?.join(' / ') || 'nicht verfügbar'),
            '  Für Load ausgewertete Sekunden: ' + (load?.totalSeconds ?? 'nicht berechenbar')
                + ' / aufgezeichnete Zeit: ' + (load?.recordedSeconds ?? 'nicht verfügbar'),
            '  Ausgeschlossene Intervalle > 30 s: ' + (load?.excludedIntervalCount ?? 'nicht berechenbar')
                + ' · Sekunden: ' + (load?.excludedIntervalSeconds ?? 'nicht verfügbar'),
            '  Import-Metadaten zur Zeiteinheit: ' + (telemetry.timeUnit || telemetry.time_unit
                || telemetry.metricSeriesTimeUnit || telemetry.metric_series_time_unit
                || (secondsConfirmed ? 'Sekunden (aus Importquelle + durationSeconds bestätigt)' : 'nicht vorhanden')),
            '  Einheitenbewertung: ' + (axisStats.valid ? timeUnitAssessment
                : 'nicht bewertbar, da die Zeitachse ungültig ist'),
            '  metricSeries: ' + Object.keys(metricSeries).length + ' Reihen',
            ...metricLines,
            '  KAJO-HF-Load: ' + (load ? load.value + ' ' + load.unit + ' (' + load.method + ')' : 'nicht berechenbar')
        ];
    };

    try {
        const { supabase } = await import('./supabase-client.js');
        if (!supabase) throw new Error('Supabase ist in dieser Sitzung nicht verfügbar.');
        const { data, error } = await supabase
            .from('garmin_activity_telemetry')
            .select('telemetry')
            .eq('garmin_activity_id', activityId)
            .maybeSingle();
        if (error) throw error;

        const localTelemetry = activity.garminTelemetry && typeof activity.garminTelemetry === 'object'
            ? activity.garminTelemetry : null;
        const cloudTelemetry = data?.telemetry && typeof data.telemetry === 'object'
            ? data.telemetry : null;
        const lines = [
            'KAJO – Garmin-Telemetrie-Diagnose (nur lesend)',
            'Aktivität: ' + (activity.name || activity.type || 'Garmin-Aktivität')
                + ' · ' + String(activity.date || '').slice(0, 10),
            'Cloud-Datensatz: ' + (cloudTelemetry ? 'vorhanden' : 'nicht gefunden'),
            ''
        ];
        lines.push(...summarize('Aktuell geladenes Aktivitätsobjekt', localTelemetry));
        lines.push('');
        lines.push(...summarize('Gespeicherter Supabase-Datensatz', cloudTelemetry));
        if (localTelemetry && cloudTelemetry) {
            const localSeries = getGarminHeartRateSeries({ ...activity, garminTelemetry: localTelemetry });
            const cloudSeries = getGarminHeartRateSeries({ ...activity, garminTelemetry: cloudTelemetry });
            lines.push('', 'VERGLEICH',
                'HF-Messpunktzahl lokal / Cloud: ' + (localSeries?.hr?.length ?? 0) + ' / ' + (cloudSeries?.hr?.length ?? 0),
                'Zeitreihenquelle lokal / Cloud: ' + (localSeries?.source || 'keine') + ' / ' + (cloudSeries?.source || 'keine'));
        }
        lines.push('', 'Hinweis: Es wurden keine Daten verändert und keine Messwerte ausgegeben.');
        output.textContent = lines.join('\n');
    } catch (error) {
        output.textContent = 'Cloud-Diagnose fehlgeschlagen: ' + (error?.message || String(error))
            + '\nPrüfe, ob die Migration garmin_activity_telemetry aktiv ist und die angemeldete Sitzung Leserechte besitzt.';
    } finally {
        button.disabled = false;
        button.textContent = 'Gespeicherte Garmin-Telemetrie prüfen (nur lesend)';
    }
}

// Gezielte, serverseitige JSON-Diagnose für die ausdrücklich freigegebene Aktivität.
// Der Supabase-Client übermittelt die bestehende Sitzung automatisch; es werden
// keine Daten geschrieben und keine FIT-Dateien geladen.
async function diagnoseGarminActivityJson() {
    const output = document.getElementById('garmin-json-diagnostic-output');
    const button = document.getElementById('garmin-json-diagnostic-run');
    if (!output || !button) return;
    const activity = state.selectedActivityForModal;
    const activityId = String(activity?.id ?? '').replace(/^garmin-/, '');
    if (activityId !== '25077002341') {
        output.textContent = 'Diese Diagnose ist ausschließlich für die freigegebene Aktivität Prague Kajakfahren (14.11.2026) verfügbar. Bitte öffne genau diese Aktivität.';
        output.hidden = false;
        return;
    }
    button.disabled = true;
    button.textContent = 'JSON-Diagnose läuft …';
    output.textContent = 'Prüfe gespeicherte JSON-Daten und frage Garmin einmal gezielt ab …';
    output.hidden = false;
    try {
        // Erst beim tatsächlichen Klick laden: hält Browser-CDN-Abhängigkeiten
        // aus den Node-basierten Regressionstests heraus.
        const { supabase } = await import('./supabase-client.js');
        if (!supabase) throw new Error('Supabase ist in dieser Sitzung nicht verfügbar.');
        const { data, error } = await supabase.functions.invoke('garmin-personal', {
            body: { action: 'diagnose-activity-json', activityId: '25077002341' }
        });
        if (error) throw error;
        output.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        output.textContent = 'Diagnose fehlgeschlagen: ' + (error?.message || String(error));
    } finally {
        button.disabled = false;
        button.textContent = 'Garmin-JSON-Diagnose für diese Aktivität ausführen';
    }
}


async function importGarminActivityJsonTelemetry() {
    const output = document.getElementById('garmin-json-import-output');
    const button = document.getElementById('garmin-json-import-run');
    const activity = state.selectedActivityForModal;
    if (!output || !button || !activity) return;
    const activityId = String(activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId ?? activity.id ?? '').replace(/^garmin-/, '');
    if (!/^\d+$/.test(activityId) || !(activity.source === 'garmin' || activity.sourceRefs?.garminActivityId != null || activity.garminData?.activityId != null)) {
        output.textContent = 'Für diese Aktivität ist keine gültige Garmin-Aktivitäts-ID hinterlegt.';
        output.hidden = false;
        return;
    }

    button.disabled = true;
    button.textContent = 'Garmin-JSON wird importiert …';
    output.textContent = 'Rufe alle verfügbaren numerischen Messreihen dieser Garmin-Aktivität ab …';
    output.hidden = false;
    try {
        const { supabase } = await import('./supabase-client.js');
        if (!supabase) throw new Error('Supabase ist in dieser Sitzung nicht verfügbar.');
        const { data, error } = await supabase.functions.invoke('garmin-personal', {
            body: { action: 'import-activity-json', activityId }
        });
        if (error) throw error;
        const telemetry = data?.telemetry;
        const metricSeries = telemetry?.metricSeries && typeof telemetry.metricSeries === 'object'
            ? telemetry.metricSeries : {};
        const usableSeries = Object.values(metricSeries).filter(metric => Array.isArray(metric?.values)
            && metric.values.filter(value => value !== null && value !== undefined && value !== ''
                && Number.isFinite(Number(value))).length >= 2).length;
        if (data?.ok !== true || data?.activityId !== activityId
            || !Array.isArray(telemetry?.time) || telemetry.time.length < 2 || usableSeries < 1
            || !telemetry.time.every((value, index) => Number.isFinite(Number(value))
                && (index === 0 || Number(value) > Number(telemetry.time[index - 1])))) {
            throw new Error(data?.error || 'Garmin hat keine ausreichend lange Zeitreihe mit numerischen Messreihen geliefert.');
        }
        if (state.selectedActivityForModal !== activity) {
            throw new Error('Die geöffnete Aktivität hat sich während des Imports geändert. Es wurde nichts gespeichert.');
        }

        const previousTelemetry = activity.garminTelemetry;
        const previousImportedAt = activity.garminJsonImportedAt;
        const previousSource = activity.garminJsonSource;
        const previousSyncStatus = activity.garminJsonSyncStatus;
        const previousAttemptedAt = activity.garminJsonSyncAttemptedAt;
        const previousSeries = previousTelemetry?.metricSeries && typeof previousTelemetry.metricSeries === 'object'
            ? previousTelemetry.metricSeries : {};
        const fetchedSeries = Object.fromEntries(Object.entries(metricSeries).map(([key, metric]) => [
            key, { ...metric }
        ]));
        const mergedSeries = { ...fetchedSeries, ...previousSeries };
        for (const [key, metric] of Object.entries(mergedSeries)) {
            if (Array.isArray(metric?.time) || !Array.isArray(metric?.values)) continue;
            const fetchedAxis = telemetry.metricSeriesTime || telemetry.time;
            const previousAxis = previousTelemetry?.metricSeriesTime;
            const matchingAxis = Array.isArray(fetchedAxis) && fetchedAxis.length === metric.values.length
                ? fetchedAxis
                : Array.isArray(previousAxis) && previousAxis.length === metric.values.length
                    ? previousAxis : null;
            if (matchingAxis) mergedSeries[key] = { ...metric, time: matchingAxis };
        }
        // Preserve FIT fields and all existing series; store the JSON time axis once per activity.
        activity.garminTelemetry = {
            ...(telemetry || {}),
            ...(previousTelemetry || {}),
            metricSeriesTime: telemetry.metricSeriesTime || previousTelemetry?.metricSeriesTime || telemetry.time,
            metricSeries: mergedSeries
        };
        activity.garminJsonImportedAt = new Date().toISOString();
        activity.garminJsonSource = 'garmin-activity-details-json';
        activity.garminJsonSyncStatus = 'complete';
        activity.garminJsonSyncAttemptedAt = activity.garminJsonImportedAt;
        if (!saveActivitiesToLocalStorage()) {
            if (previousTelemetry == null) delete activity.garminTelemetry;
            else activity.garminTelemetry = previousTelemetry;
            if (previousImportedAt == null) delete activity.garminJsonImportedAt;
            else activity.garminJsonImportedAt = previousImportedAt;
            if (previousSource == null) delete activity.garminJsonSource;
            else activity.garminJsonSource = previousSource;
            if (previousSyncStatus == null) delete activity.garminJsonSyncStatus;
            else activity.garminJsonSyncStatus = previousSyncStatus;
            if (previousAttemptedAt == null) delete activity.garminJsonSyncAttemptedAt;
            else activity.garminJsonSyncAttemptedAt = previousAttemptedAt;
            throw new Error('Die Aktivität konnte nicht im angemeldeten Benutzerspeicher gesichert werden.');
        }
        refreshAll();
        renderActivityTelemetryChart(activity);
        renderActivityDataQuality(activity);
        const fields = ['hr', 'altitude', 'distance', 'respirationRate', 'bodyBattery']
            .filter(key => Array.isArray(activity.garminTelemetry[key]) && activity.garminTelemetry[key].filter(value => value != null).length >= 2);
        const rawSeriesCount = Object.keys(activity.garminTelemetry.metricSeries || {}).length;
        output.textContent = 'Telemetrie-Erweiterung erfolgreich.\n'
            + 'Aktivität: ' + (activity.name || activity.garminData?.activityName || 'Garmin-Aktivität') + ' · ' + String(activity.date || '').slice(0, 10) + '\n'
            + 'Messpunkte: ' + telemetry.sampleCount + '\n'
            + 'Dauer der Zeitreihe: ' + Math.floor(telemetry.durationSeconds / 60) + ':' + String(Math.round(telemetry.durationSeconds % 60)).padStart(2, '0') + ' min\n'
            + 'Standard-Messreihen: ' + fields.join(', ') + '\n'
            + 'Zusätzliche Garmin-Rohmessreihen: ' + rawSeriesCount + '\n'
            + 'Alle verfügbaren numerischen Metriken werden mit Einheit-/Skalierungsmetadaten gespeichert; Rohwerte bleiben unverändert.\n'
            + 'Speicherung: kontogebundener lokaler Speicher; vollständige Rohmessreihen separat in IndexedDB\n'
            + 'Quelle: Garmin Activity Details JSON · kein FIT-Import.';
    } catch (error) {
        output.textContent = 'JSON-Import fehlgeschlagen: ' + (error?.message || String(error));
    } finally {
        button.disabled = false;
        button.textContent = 'Garmin-Telemetrie für diese Aktivität ergänzen';
    }
}

if (typeof document.addEventListener === 'function') {
    document.addEventListener('click', event => {
        if (event.target?.closest?.('#activity-telemetry-diagnose')) diagnoseSelectedActivityTelemetry();
        if (event.target?.closest?.('#garmin-cloud-telemetry-diagnostic-run')) diagnoseGarminCloudTelemetry();
        if (event.target?.closest?.('#garmin-json-diagnostic-run')) diagnoseGarminActivityJson();
        if (event.target?.closest?.('#garmin-json-import-run')) importGarminActivityJsonTelemetry();
    });
}

function getActivitySourceLabel(activity) {
    const refs = activity?.sourceRefs || {};
    const sources = new Set([
        ...(Array.isArray(activity?.sources) ? activity.sources : []),
        activity?.source,
        refs.garminActivityId != null ? 'garmin' : null,
        refs.intervalsActivityId != null ? 'intervals' : null,
        activity?.garminFitImported === true ? 'garmin-fit' : null
    ].filter(Boolean).map(value => String(value).toLowerCase()));
    const labels = [];
    if (sources.has('garmin') || sources.has('garmin-fit') || activity?.garminData) labels.push('Garmin');
    if (sources.has('intervals')) labels.push('Intervals.icu');
    if (sources.has('manual')) labels.push('Manuell');
    if (sources.has('csv') || sources.has('file') || sources.has('import') || (sources.has('fit') && activity?.garminFitImported !== true)) labels.push('Dateiimport');
    return labels.length ? [...new Set(labels)].join(' + ') : 'Quelle nicht ausgewiesen';
}

function renderActivityDataQuality(activity) {
    const container = document.getElementById('activity-data-quality');
    if (!container) return;
    const telemetry = getActivityTelemetry(activity) || {};
    const series = getActivityTelemetrySeries(activity);
    const sampleCount = series.reduce((max, item) => Math.max(max, item.values.length), 0);
    const time = Array.isArray(telemetry.time) ? telemetry.time : [];
    const hasTimeAxis = series.some(item => {
        const axis = Array.isArray(item.time) ? item.time
            : Array.isArray(telemetry.metricSeriesTime) && telemetry.metricSeriesTime.length === item.values.length
                ? telemetry.metricSeriesTime : time;
        return item.values.length >= 2 && axis.length === item.values.length
            && axis.every(value => Number.isFinite(Number(value)))
            && axis.slice(1).every((value, index) => Number(value) > Number(axis[index]));
    });
    const fields = activity?.garminFitData?.recordFields || {};
    const lat = telemetry.latitude || telemetry.lat || telemetry.position_lat || fields.position_lat || fields.latitude;
    const lon = telemetry.longitude || telemetry.lon || telemetry.position_long || fields.position_long || fields.longitude;
    const hasGps = Array.isArray(lat) && Array.isArray(lon) && lat.length === lon.length
        && lat.reduce((count, rawLat, index) => {
            let latitude = Number(rawLat), longitude = Number(lon[index]);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return count;
            if (Math.abs(latitude) > 90) latitude = latitude * 180 / 2147483648;
            if (Math.abs(longitude) > 180) longitude = longitude * 180 / 2147483648;
            return count + (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? 1 : 0);
        }, 0) >= 2;
    const laps = Array.isArray(activity?.laps) ? activity.laps : Array.isArray(activity?.intervals) ? activity.intervals : [];
    const parts = [
        'Quelle: ' + getActivitySourceLabel(activity),
        series.length ? sampleCount.toLocaleString('de-DE') + ' Messpunkte' : 'Keine auswertbare Garmin-Zeitreihe',
        series.length ? (hasTimeAxis ? 'Zeitachse zugeordnet' : 'Zeitachse eingeschränkt') : null,
        hasGps ? 'GPS vorhanden' : null,
        laps.length ? laps.length + ' Runden / Abschnitte' : null
    ].filter(Boolean);
    container.textContent = parts.join(' · ');
    container.dataset.status = series.length ? (hasTimeAxis ? 'complete' : 'limited') : 'not-calculable';
}

function getActivityZoneConfig(activity) {
    const maxHr = Number(state.profile?.maxHr);
    const zoneSettings = state.settings?.heartRateZoneSettings || {};
    const windowDays = Number(zoneSettings.restingHrWindowVersion) >= 2
        ? (zoneSettings.restingHrWindowDays ?? 14)
        : 14;
    const resting = getAdaptiveRestingHr(
        state.dailyCheckins || {},
        String(activity?.date || '').slice(0, 10),
        windowDays,
        state.profile || {}
    );
    const zones = resting?.value != null ? calculateHeartRateReserveZones(maxHr, resting.value) : null;
    return {
        zones,
        source: zones ? 'karvonen-adaptive' : null,
        adaptiveRestingHr: resting?.value ?? null,
        restingHrSource: resting?.source ?? 'unavailable',
        restingHrWindowDays: resting?.windowDays ?? windowDays,
        restingHrQuality: resting?.quality ?? 'unavailable'
    };
}

// Einheitliche Zeit-in-HF-Zonen-Berechnung für Zonenübersicht und Reizprofil.
// Ohne Zeitstempel wird die dokumentierte Dauer gleichmäßig auf alle Samples verteilt.
function calculateActivityZoneTime(activity, zoneConfig = getActivityZoneConfig(activity)) {
    const heartRateSeries = getGarminHeartRateSeries(activity);
    const hr = heartRateSeries?.hr;
    const zones = zoneConfig.zones;
    if (!Array.isArray(hr) || hr.length < 2 || !Array.isArray(zones) || zones.length !== 4) return null;
    const time = heartRateSeries?.time;
    const hasTime = Array.isArray(time) && time.length === hr.length
        && time.every(value => Number.isFinite(Number(value)));
    const durationSeconds = Number(activity.duration) > 0 ? Number(activity.duration) * 60 : null;
    const seconds = [0, 0, 0, 0, 0];
    hr.forEach((raw, index) => {
        const bpm = Number(raw);
        if (!Number.isFinite(bpm) || bpm < 30 || bpm > 250) return;
        const next = hasTime
            ? (index < time.length - 1 ? Number(time[index + 1]) : (durationSeconds ?? Number(time[index])))
            : null;
        const sampleSeconds = hasTime
            ? Math.max(0, next - Number(time[index]))
            : (durationSeconds ? durationSeconds / hr.length : 0);
        const zone = bpm <= zones[0] ? 0 : bpm <= zones[1] ? 1 : bpm <= zones[2] ? 2 : bpm <= zones[3] ? 3 : 4;
        if (Number.isFinite(sampleSeconds) && sampleSeconds > 0) seconds[zone] += sampleSeconds;
    });
    const totalSeconds = seconds.reduce((sum, value) => sum + value, 0);
    return totalSeconds > 0 ? { seconds, totalSeconds, hasTime, zoneSource: zoneConfig.source, adaptiveRestingHr: zoneConfig.adaptiveRestingHr, restingHrSource: zoneConfig.restingHrSource, restingHrQuality: zoneConfig.restingHrQuality } : null;
}


let activityDetailReturnFocus = null;

async function loadGarminTelemetryWhenActivityOpened(activity) {
    if (!activity || activity.garminTelemetryLoading || getGarminHeartRateSeries(activity)?.hr?.length >= 2) return;
    const isGarmin = activity.source === 'garmin' || activity.sourceRefs?.garminActivityId != null
        || activity.garminData?.activityId != null || activity.garminFitImported === true
        || (Array.isArray(activity.sources) && activity.sources.includes('garmin'));
    if (!isGarmin) return;
    const rawId = activity.sourceRefs?.garminActivityId ?? activity.garminData?.activityId ?? activity.id;
    const activityId = String(rawId ?? '').replace(/^garmin-/, '');
    if (!/^\d+$/.test(activityId)) return;
    activity.garminTelemetryLoading = true;
    try {
        const [{ supabase }, telemetryModule] = await Promise.all([
            import('./supabase-client.js'),
            import('./garmin-cloud-telemetry.js?v=6')
        ]);
        if (!supabase) return;
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const userId = auth?.user?.id;
        if (!userId) return;
        const records = await telemetryModule.loadGarminTelemetryForActivityIds(supabase, userId, [activityId]);
        if (state.selectedActivityForModal !== activity) return;
        let incoming = records[0]?.telemetry || null;
        if (!incoming || !Object.keys(incoming).length) {
            // Fehlt der Cloud-Datensatz, wird Garmin erst jetzt – beim Öffnen
            // genau dieser Aktivität – nach den verfügbaren Messreihen gefragt.
            const { data, error } = await supabase.functions.invoke('garmin-personal', {
                body: { action: 'import-activity-json', activityId }
            });
            if (error) throw error;
            const telemetry = data?.telemetry;
            const metricSeries = telemetry?.metricSeries && typeof telemetry.metricSeries === 'object'
                ? telemetry.metricSeries : {};
            const usableSeries = Object.values(metricSeries).filter(metric => Array.isArray(metric?.values)
                && metric.values.filter(value => value != null && value !== ''
                    && Number.isFinite(Number(value))).length >= 2).length;
            if (data?.ok !== true || String(data?.activityId) !== activityId
                || !Array.isArray(telemetry?.time) || telemetry.time.length < 2 || usableSeries < 1
                || !telemetry.time.every((value, index) => Number.isFinite(Number(value))
                    && (index === 0 || Number(value) > Number(telemetry.time[index - 1])))) {
                throw new Error(data?.error || 'Für diese Aktivität sind aktuell keine vollständigen Garmin-Messreihen verfügbar.');
            }
            incoming = telemetry;
            await telemetryModule.uploadMissingGarminTelemetry(supabase, userId, [{
                garmin_activity_id: activityId, telemetry: incoming
            }]);
        }
        if (state.selectedActivityForModal !== activity) return;
        const current = activity.garminTelemetry || {};
        activity.garminTelemetry = {
            ...current, ...incoming,
            metricSeries: { ...(current.metricSeries || {}), ...(incoming.metricSeries || {}) },
            metricSeriesTime: incoming.metricSeriesTime || current.metricSeriesTime || undefined
        };
        const summary = buildGarminActivityAnalysis(activity, state.settings, state.profile, state.dailyCheckins);
        if (summary) {
            activity.garminAnalysis = summary;
            saveDataToLocalStorage();
            refreshAll();
        }
        if (state.selectedActivityForModal !== activity) return;
        const analysisActivity = { ...activity, telemetry: getActivityTelemetry(activity) };
        renderActivityHeartRateSeriesStatus(analysisActivity);
        renderActivityDataQuality(analysisActivity);
        renderActivityTelemetryChart(analysisActivity);
        renderActivityTrainingInsights(analysisActivity);
        const loadData = getTrainingLoadData(state.rawActivities, state.settings, state.profile, state.dailyCheckins);
        const displayActivity = getVisibleActivities(state.rawActivities || []).find(item => String(item.id) === String(activity.id)) || activity;
        renderSportSpecificActivityMetrics(displayActivity, getActivityLoadSummary(activity));
        try { renderActivityDetailTabEmptyStates(); } catch (_) {}
    } catch (error) {
        console.warn('KAJO: Aktivitätstelemetrie konnte beim Öffnen nicht geladen werden:', error);
    } finally {
        activity.garminTelemetryLoading = false;
    }
}


function renderActivityGroupSummary(activity) {
    const metrics = document.getElementById('activity-sport-metrics');
    if (!metrics) return;
    let panel = document.getElementById('activity-group-summary');
    if (!panel) {
        panel = document.createElement('section');
        panel.id = 'activity-group-summary';
        panel.className = 'mb-3 rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3';
        metrics.before(panel);
    }
    const members = getActivityGroupMembers(activity, state.rawActivities || []);
    if (members.length < 2) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.hidden = false;
    panel.innerHTML = '<div class="flex items-center justify-between gap-2"><strong class="text-xs text-cyan-200">Zusammengeführte Trainingseinheit</strong><span class="text-[10px] text-slate-400">' + members.length + ' Segmente</span></div>'
        + '<div class="mt-2 space-y-1">' + members.map(member => {
            const rawTime = member.startTimeLocal || member.start_time_local || member.startTime || member.time || '';
            const match = String(rawTime).match(/(\d{1,2}):(\d{2})/);
            const time = match ? String(match[1]).padStart(2, '0') + ':' + match[2] : '';
            const duration = member.duration != null && Number.isFinite(Number(member.duration)) ? Math.round(Number(member.duration)) + ' min' : 'Dauer —';
            return '<div class="flex items-center justify-between gap-2 text-[11px] text-slate-300"><span>' + (time ? time + ' · ' : '') + escapeHtml(member.name || 'Trainingsteil') + '</span><strong class="shrink-0">' + duration + '</strong></div>';
        }).join('') + '</div><p class="mt-2 text-[10px] text-slate-500">Die Originalaufzeichnungen bleiben erhalten. Messwertdiagramme und GPS-Daten werden weiterhin je Segment angezeigt; die Kennzahlen oben sind zusammengefasst.</p>';
}
function renderActivityMergeControls(activity) {
    const actions = document.querySelector('.activity-detail-toolbar-actions');
    if (!actions) return;
    let button = document.getElementById('activity-merge-toggle');
    if (!button) {
        button = document.createElement('button');
        button.id = 'activity-merge-toggle';
        button.type = 'button';
        button.className = 'activity-detail-nav-button';
        const editButton = actions.querySelector('button[onclick="toggleActivityEdit()"]');
        if (editButton) editButton.before(button); else actions.appendChild(button);
    }
    const grouped = Boolean(activity?.mergedGroupId);
    button.innerHTML = grouped ? '<i data-lucide="unlink"></i>' : '<i data-lucide="combine"></i>';
    button.title = grouped ? 'Zusammenführung auflösen' : 'Mit weiterer Aktivität zusammenführen';
    button.setAttribute('aria-label', button.title);
    button.onclick = () => grouped ? unmergeSelectedActivityGroup(activity) : showActivityMergePicker(activity);
    globalThis.lucide?.createIcons?.();
}
function showActivityMergePicker(activity) {
    const candidates = (state.rawActivities || []).filter(item => item && String(item.id) !== String(activity.id)
        && item.date === activity.date && item.type === activity.type && !item.mergedGroupId)
        .sort((a, b) => String(a.startTimeLocal || a.start_time_local || a.startTime || '')
            .localeCompare(String(b.startTimeLocal || b.start_time_local || b.startTime || '')));
    if (!candidates.length) {
        alert('Es gibt keine weitere nicht zusammengeführte Aktivität derselben Sportart an diesem Tag.');
        return;
    }
    document.getElementById('activity-merge-picker')?.remove();
    const modal = document.createElement('div');
    modal.id = 'activity-merge-picker';
    modal.className = 'fixed inset-0 z-[180] flex items-center justify-center bg-black/75 p-4';
    modal.innerHTML = '<section class="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"><div class="flex items-center justify-between gap-3"><div><p class="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Trainingseinheit ergänzen</p><h3 class="mt-1 text-sm font-bold text-white">Welche Aktivität soll dazugehören?</h3></div><button type="button" data-close class="rounded-lg p-2 text-slate-400 hover:text-white" aria-label="Schließen">✕</button></div><p class="mt-2 text-[11px] text-slate-400">Es werden nur Aktivitäten desselben Tages und derselben Sportart angeboten. Die Garmin-Originale bleiben unverändert.</p><div class="mt-3 max-h-72 space-y-2 overflow-y-auto">'
        + candidates.map(candidate => {
            const rawTime = candidate.startTimeLocal || candidate.start_time_local || candidate.startTime || candidate.time || '';
            const match = String(rawTime).match(/(\d{1,2}):(\d{2})/);
            const time = match ? String(match[1]).padStart(2, '0') + ':' + match[2] : '';
            const duration = candidate.duration != null && Number.isFinite(Number(candidate.duration)) ? Math.round(Number(candidate.duration)) + ' min' : 'Dauer —';
            return '<button type="button" data-merge-id="' + escapeHtml(String(candidate.id)) + '" class="w-full rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-left hover:border-cyan-500"><span class="block text-xs font-semibold text-white">' + escapeHtml(candidate.name || 'Trainingseinheit') + '</span><span class="mt-1 block text-[10px] text-slate-400">' + [time, duration].filter(Boolean).join(' · ') + '</span></button>';
        }).join('') + '</div><div class="mt-3 flex justify-end"><button type="button" data-close class="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">Abbrechen</button></div></section>';
    modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('[data-close]')) { modal.remove(); return; }
        const choice = event.target.closest('[data-merge-id]');
        if (!choice) return;
        const secondary = candidates.find(item => String(item.id) === choice.dataset.mergeId);
        if (!secondary) return;
        if (!confirm('Diese beiden Aktivitäten als eine Trainingseinheit anzeigen? Die Originalaufzeichnungen bleiben erhalten.')) return;
        try {
            mergeActivityPair(activity, secondary, state.rawActivities || []);
            if (saveDataToLocalStorage() === false) {
                unmergeActivityGroup(activity, state.rawActivities || []);
                throw new Error('Die Änderung konnte nicht gespeichert werden.');
            }
            modal.remove();
            refreshAll();
            openCSVDetailsModal(encodeURIComponent(String(activity.id)));
        } catch (error) {
            alert(error?.message || 'Die Aktivitäten konnten nicht zusammengeführt werden.');
        }
    });
    document.body.appendChild(modal);
}
function unmergeSelectedActivityGroup(activity) {
    if (!activity?.mergedGroupId) return;
    if (!confirm('Diese Trainingseinheit wieder in ihre ursprünglichen Aktivitäten aufteilen?')) return;
    unmergeActivityGroup(activity, state.rawActivities || []);
    saveDataToLocalStorage();
    refreshAll();
    openCSVDetailsModal(encodeURIComponent(String(activity.id)));
}

export function openCSVDetailsModal(id) {
    let decodedId = String(id ?? '');
    try { decodedId = decodeURIComponent(decodedId); } catch (_) {}
    const activities = Array.isArray(state.rawActivities) ? state.rawActivities : [];
    const act = activities.find(item => String(item.id) === decodedId)
        || activities.find(item => String(item.id) === String(id));
    if (!act) { console.warn('Aktivität nicht gefunden:', id); return; }
    const modal = document.getElementById('csv-details-modal');
    if (!modal) { console.error('Aktivitätsansicht fehlt im Dokument.'); return; }
    initializeActivityDetailTabs();
    activateActivityDetailTab('overview');
    const wasClosed = modal.classList.contains('hidden') || getComputedStyle(modal).display === 'none';
    if (wasClosed) activityDetailReturnFocus = document.activeElement;
    state.selectedActivityForModal = act;
    const dailyHrAction = document.getElementById('daily-hr-activity-open');
    if (dailyHrAction) dailyHrAction.hidden = false;
    renderActivityMergeControls(act);
    renderActivityGroupSummary(act);
    const displayAct = getVisibleActivities(activities).find(item => String(item.id) === String(act.id)
        || (act.mergedGroupId && item.mergedGroupId === act.mergedGroupId)) || act;
    const water = act.waterConditions || {};
    const waterLevel = document.getElementById('activity-water-level');
    const waterUnit = document.getElementById('activity-water-level-unit');
    const waterDischarge = document.getElementById('activity-water-discharge');
    const waterNote = document.getElementById('activity-water-note');
    const waterTypeInput = document.getElementById('activity-water-type');
    if (waterLevel) waterLevel.value = water.level ?? '';
    if (waterUnit) waterUnit.value = water.levelUnit === 'm' ? 'm' : 'cm';
    if (waterDischarge) waterDischarge.value = water.discharge ?? '';
    if (waterNote) waterNote.value = water.note || '';
    if (waterTypeInput) waterTypeInput.value = water.type || act.waterType || '';
    const partnerInput = document.getElementById('activity-training-partner');
    if (partnerInput) partnerInput.value = act.trainingPartner || '';
    const editSport = document.getElementById('modal-edit-sport-select');
    if (editSport) editSport.value = act.type || 'Kayaking';
    toggleActivityCanoeFields(act.type);
    renderActivityWaterConditionStatus(act);
    renderActivityDetailNavigation(act);

    const titleEl = document.getElementById('modal-act-title');
    const dateEl = document.getElementById('modal-act-date');
    if (titleEl) titleEl.textContent = act.name || 'Trainingseinheit';
    if (dateEl) {
        const rawStart = act.startTimeLocal || act.start_time_local || act.startTime || '';
        const parsedStart = rawStart ? new Date(rawStart) : null;
        const parsedTime = parsedStart && Number.isFinite(parsedStart.getTime())
            ? parsedStart.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            : (typeof rawStart === 'string' && /(?:^|T|\\s)(\d{1,2}:\d{2})(?::\d{2})?/.test(rawStart)
                ? rawStart.match(/(?:^|T|\\s)(\d{1,2}:\d{2})(?::\d{2})?/)?.[1] || '' : '');
        dateEl.textContent = [formatDateDDMMYY(act.date), parsedTime ? parsedTime + ' Uhr' : ''].filter(Boolean).join(' · ');
    }
    const sportCatalog = getSportsCatalog();
    const sportConfig = sportCatalog[act.type] || {};
    const sportColor = sportConfig.color || '#38bdf8';
    const sportIcons = {
        Kayaking: 'waves', C1: 'waves', C2: 'waves', PaddleErgo: 'activity',
        Run: 'footprints', Ride: 'bike', Swim: 'waves', WeightTraining: 'dumbbell',
        Workout: 'dumbbell'
    };
    const sportIcon = document.getElementById('modal-act-sport-icon');
    if (sportIcon) {
        sportIcon.style.setProperty('--activity-sport-color', sportColor);
        sportIcon.innerHTML = '<i data-lucide="' + (sportIcons[act.type] || 'activity') + '"></i>';
        window.lucide?.createIcons?.();
    }
    const metricsContainer = document.getElementById('activity-sport-metrics');
    if (metricsContainer) metricsContainer.style.setProperty('--activity-sport-color', getSportsCatalog()[act.type]?.color || '#38bdf8');
    const badge = document.getElementById('modal-act-type-badge');
    if (badge) {
        const canoeDisciplines = { Kayaking: 'K1', C1: 'C1', C2: 'C2' };
        const discipline = canoeDisciplines[act.type] || '';
        badge.textContent = discipline;
        badge.hidden = !discipline;
        badge.style.setProperty('--activity-sport-color', sportColor);
        badge.style.borderColor = sportColor + '88';
        badge.style.color = sportColor;
        badge.style.backgroundColor = sportColor + '18';
    }
    const analysisActivity = { ...act, telemetry: getActivityTelemetry(act) };
    state.activityTelemetryMetric = null;
    state.activitySelectedLap = null;
    renderActivityHeartRateSeriesStatus(analysisActivity);
    const loadData = getTrainingLoadData(state.rawActivities, state.settings, state.profile, state.dailyCheckins);
    const groupMembers = getActivityGroupMembers(act, activities);
    const groupLoadItems = groupMembers.map(member => loadData.records.find(item => String(item.activity.id) === String(member.id)));
    const loadSummary = groupLoadItems.length && groupLoadItems.every(Boolean)
        ? groupLoadItems.reduce((sum, item) => sum + Number(item.value), 0).toFixed(1) + ' ' + loadData.unit : '—';
    renderSportSpecificActivityMetrics(displayAct, loadSummary);
    renderActivityDataQuality(analysisActivity);
    renderActivityStrengthSets(act);
    toggleActivityStrengthSection(act.type);
    const editName = document.getElementById('modal-edit-name'); if (editName) editName.value = act.name || '';
    const editCategory = document.getElementById('modal-edit-type-select'); if (editCategory) editCategory.value = act.category || 'ga';
    const raceFormatSelect = document.getElementById('modal-edit-race-format');
    if (raceFormatSelect) raceFormatSelect.value = ['sprint', 'classic'].includes(act.raceFormat) ? act.raceFormat : '';
    document.getElementById('modal-edit-distance').value = act.distance == null ? '' : formatKm(act.distance);
    const durationInput = document.getElementById('modal-edit-duration');
    if (durationInput) durationInput.value = act.duration ?? '';
    const rpeValue = act.perceivedEffort;
    const rpeSlider = document.getElementById('activity-rpe-slider');
    if (rpeSlider) rpeSlider.value = rpeValue == null || rpeValue === '' ? 5 : rpeValue;
    updateActivityRPEDisplay(act);
    const noteEditor = document.getElementById('activity-note-editor');
    const notePreview = document.getElementById('activity-note-preview');
    const noteToggle = document.getElementById('activity-note-toggle');
    const savedNote = String(act.perceivedNote || '');
    if (noteEditor) { noteEditor.value = savedNote; noteEditor.hidden = true; }
    if (notePreview) { notePreview.textContent = savedNote; notePreview.hidden = !savedNote.trim(); }
    if (noteToggle) {
        noteToggle.classList.toggle('has-note', !!savedNote.trim());
        noteToggle.setAttribute('aria-label', savedNote.trim() ? 'Trainingsnotiz bearbeiten' : 'Trainingsnotiz hinzufügen');
        if (noteToggle.dataset.bound !== 'true') {
            noteToggle.addEventListener('click', () => {
                const editor = document.getElementById('activity-note-editor');
                if (!editor) return;
                editor.hidden = !editor.hidden;
                if (!editor.hidden) { editor.focus(); editor.setSelectionRange(editor.value.length, editor.value.length); }
            });
            noteToggle.dataset.bound = 'true';
        }
    }
    if (noteEditor && noteEditor.dataset.bound !== 'true') {
        noteEditor.addEventListener('change', () => {
            const current = state.selectedActivityForModal;
            if (!current) return;
            const note = noteEditor.value.trim().slice(0, 2000);
            if (note) current.perceivedNote = note; else delete current.perceivedNote;
            saveDataToLocalStorage();
            if (notePreview) { notePreview.textContent = note; notePreview.hidden = !note; }
            if (noteToggle) {
                noteToggle.classList.toggle('has-note', !!note);
                noteToggle.setAttribute('aria-label', note ? 'Trainingsnotiz bearbeiten' : 'Trainingsnotiz hinzufügen');
            }
        });
        noteEditor.dataset.bound = 'true';
    }
    document.getElementById('activity-edit-panel')?.classList.add('hidden');

    // Die Detailansicht wird explizit eingeblendet; so kann die Tailwind-Klasse
    // "flex" das versteckte Modal nicht versehentlich sichtbar/unsichtbar halten.
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.classList.add('activity-detail-open');
    const detailShell = modal.querySelector('.activity-detail-shell');
    if (detailShell) detailShell.scrollTop = 0;
    try { renderActivityTelemetryChart(analysisActivity); } catch (error) { console.error('Telemetrie konnte nicht gerendert werden:', error); }
    try { renderActivityTrainingInsights(analysisActivity); } catch (error) { console.error('Trainingsanalyse konnte nicht gerendert werden:', error); }
    void loadGarminTelemetryWhenActivityOpened(act);
    try { renderOptionalActivityViews(analysisActivity); } catch (error) { console.error('Zusatzansichten konnten nicht gerendert werden:', error); }
    try { renderActivityRouteMap(analysisActivity); } catch (error) { console.error('GPS-Strecke konnte nicht gerendert werden:', error); }
    try { renderActivityStrengthAnalysis(act); } catch (error) { console.error('Kraftanalyse konnte nicht gerendert werden:', error); }
    try { renderActivityComparisons(act); } catch (error) { console.error('Aktivitätsvergleich konnte nicht gerendert werden:', error); }
    try { renderActivityDetailTabEmptyStates(); } catch (_) {}
    try { globalThis.lucide?.createIcons?.(); } catch (_) {}
}



function renderActivityHeartRateSeriesStatus(activity) {
    const container = document.getElementById('activity-hr-series-status');
    if (!container) return;
    const heartRateSeries = getGarminHeartRateSeries(activity);
    const hr = Array.isArray(heartRateSeries?.hr) ? heartRateSeries.hr : [];
    const time = Array.isArray(heartRateSeries?.time) ? heartRateSeries.time : [];
    const validCount = hr.reduce((count, value, index) => {
        const bpm = Number(value);
        const timestamp = Number(time[index]);
        return count + (Number.isFinite(bpm) && bpm >= 30 && bpm <= 250
            && Number.isFinite(timestamp) && timestamp >= 0 ? 1 : 0);
    }, 0);
    const hasSeries = hr.length >= 2 && time.length === hr.length && validCount >= 2;
    container.className = hasSeries
        ? 'rounded-lg border border-sky-800/50 bg-sky-950/20 px-3 py-2 text-xs text-sky-300'
        : 'rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400';
    container.textContent = hasSeries
        ? 'HF-Zeitreihe vorhanden · ' + validCount.toLocaleString('de-DE') + ' Messpunkte'
            + (activity?.dailyHeartRateSeries?.source === 'garmin-daily-heart-rate'
                ? ' · Garmin-Tagesaufzeichnung'
                : heartRateSeries.source !== 'hr' ? ' · Garmin-JSON' : '')
        : 'Keine HF-Zeitreihe vorhanden';
}

function renderSportSpecificActivityMetrics(act, loadSummary) {
    const container = document.getElementById('activity-sport-metrics');
    if (!container) return;
    const type = act.type || 'Workout';
    const isStrength = type === 'WeightTraining';
    const metrics = [];
    const add = (label, value, tone = 'text-white') => {
        if (value === null || value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return;
        metrics.push({ label, value, tone });
    };
    const firstNumber = (...values) => {
        const value = values.find(v => v !== null && v !== undefined && v !== '');
        return value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
    };
    const formatSpeed = value => value === null ? null : Number(value).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' km/h';
    const formatPace = (value, unit = 'km') => {
        if (value === null) return null;
        if (typeof value === 'string') return value;
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) return null;
        return Math.floor(seconds / 60) + ':' + String(Math.round(seconds % 60)).padStart(2, '0') + (unit === '100m' ? ' min/100 m' : ' min/km');
    };
    const durationMinutes = Number(act.duration);
    const durationLabel = Number.isFinite(durationMinutes) && durationMinutes > 0
        ? Math.floor(durationMinutes / 60) + ':' + String(Math.round(durationMinutes % 60)).padStart(2, '0')
        : null;
    add('Dauer', durationLabel);
    if (!isStrength && Number.isFinite(Number(act.distance)) && Number(act.distance) > 0) add('Distanz', type === 'Swim' ? Math.round(Number(act.distance) * 1000).toLocaleString('de-DE') + ' m' : formatKm(act.distance) + ' km');
    const avgHr = firstNumber(act.hr, act.avgHr, act.averageHr, act.averageHeartRate);
    const maxHr = firstNumber(act.maxHr, act.maxHR, act.maxHeartRate);
    add('Ø Herzfrequenz', avgHr && avgHr > 0 ? Math.round(avgHr) + ' bpm' : null, 'text-rose-400');
    add('Max. Herzfrequenz', maxHr && maxHr > 0 ? Math.round(maxHr) + ' bpm' : null, 'text-rose-300');

    if (['Kayaking', 'C1', 'C2', 'PaddleErgo'].includes(type)) {
        const speed = firstNumber(act.avgSpeed, act.averageSpeed, act.speed);
        const maxSpeed = firstNumber(act.maxSpeed, act.maximumSpeed);
        const power = firstNumber(act.avgPower, act.averagePower, act.power);
        const maxPower = firstNumber(act.maxPower, act.maximumPower);
        const strokeRate = firstNumber(act.strokeRate, act.avgStrokeRate, act.cadence);
        add('Ø Geschwindigkeit', formatSpeed(speed));
        add('Max. Geschwindigkeit', formatSpeed(maxSpeed));
        add(type === 'PaddleErgo' ? 'Ø Leistung' : 'Ø Paddelleistung', power !== null && power > 0 ? Math.round(power) + ' W' : null);
        add('Max. Leistung', maxPower !== null && maxPower > 0 ? Math.round(maxPower) + ' W' : null);
        add('Schlagfrequenz', strokeRate !== null && strokeRate > 0 ? Math.round(strokeRate) + '/min' : null);
    } else if (type === 'Run') {
        add('Ø Pace', formatPace(firstNumber(act.avgPaceSecondsPerKm, act.averagePaceSecondsPerKm, act.avgPace, act.pace)));
        const maxSpeed = firstNumber(act.maxSpeed, act.maximumSpeed);
        const cadence = firstNumber(act.cadence, act.avgCadence, act.runCadence);
        add('Max. Geschwindigkeit', formatSpeed(maxSpeed));
        add('Schrittfrequenz', cadence !== null && cadence > 0 ? Math.round(cadence) + '/min' : null);
    } else if (type === 'Ride') {
        const speed = firstNumber(act.avgSpeed, act.averageSpeed, act.speed);
        const power = firstNumber(act.avgPower, act.averagePower, act.power);
        const maxSpeed = firstNumber(act.maxSpeed, act.maximumSpeed);
        const maxPower = firstNumber(act.maxPower, act.maximumPower);
        const cadence = firstNumber(act.cadence, act.avgCadence);
        add('Ø Geschwindigkeit', formatSpeed(speed));
        add('Max. Geschwindigkeit', formatSpeed(maxSpeed));
        add('Ø Leistung', power !== null && power > 0 ? Math.round(power) + ' W' : null);
        add('Max. Leistung', maxPower !== null && maxPower > 0 ? Math.round(maxPower) + ' W' : null);
        add('Trittfrequenz', cadence !== null && cadence > 0 ? Math.round(cadence) + '/min' : null);
    } else if (type === 'Swim') {
        add('Ø Pace', formatPace(firstNumber(act.avgPaceSecondsPer100m, act.averagePaceSecondsPer100m), '100m'));
        const swolf = firstNumber(act.swolf, act.avgSwolf);
        add('SWOLF', swolf !== null && swolf > 0 ? Math.round(swolf) : null);
        const strokes = firstNumber(act.strokeRate, act.avgStrokeRate);
        add('Schlagfrequenz', strokes !== null && strokes > 0 ? Math.round(strokes) + '/min' : null);
        add('Schwimmstil', act.swimStroke || null);
        const poolLength = firstNumber(act.poolLengthMeters);
        add('Beckenlänge', poolLength !== null && poolLength > 0 ? poolLength + ' m' : null);
        const lengthCount = firstNumber(act.swimLengthCount);
        add('Bahnen / Längen', lengthCount !== null && lengthCount > 0 ? String(Math.round(lengthCount)) : null);
    }

    const elevation = firstNumber(act.elevationGain, act.totalAscent, act.ascent);
    add('Höhenmeter', elevation !== null && elevation > 0 ? Math.round(elevation) + ' m' : null);
    // Die aktive Load-Methode wird im Belastungsbereich separat mit ihrer Quelle ausgewiesen.
    if (['Kayaking', 'C1', 'C2'].includes(type)) {
        add('Rennformat', act.raceFormat === 'classic' ? 'Classic' : act.raceFormat === 'sprint' ? 'Sprint' : null);
        const waterType = act.waterConditions?.type || act.waterType;
        add('Gewässertyp', waterType === 'wildwater' ? 'Wildwasser' : waterType === 'flatwater' ? 'Flachwasser' : null);
    }
    if (type === 'C2') add('Trainingspartner', act.trainingPartner || null, 'text-cyan-300');
    if (isStrength && Array.isArray(act.exercises) && act.exercises.length) {
        add('Übungen dokumentiert', String(act.exercises.length));
        const strengthSummary = calculateStrengthActivitySummary(act.exercises);
        add('Sätze dokumentiert', strengthSummary.setCount ? String(strengthSummary.setCount) : null);
        add('Gesamtvolumen', strengthSummary.volumeComplete ? strengthSummary.volume.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' kg' : null, 'text-purple-300');
    }
    if (!metrics.length) {
        container.innerHTML = '<p class="col-span-full text-xs text-slate-500">Für diese Aktivität sind noch keine auswertbaren Kennzahlen hinterlegt.</p>';
        return;
    }
    const primaryLabels = ['Distanz', 'Dauer', 'Ø Herzfrequenz'];
    const primary = primaryLabels.map(label => metrics.find(metric => metric.label === label)).filter(Boolean);
    const secondary = metrics.filter(metric => !primaryLabels.includes(metric.label));
    const colors = { 'Dauer': '#35b7a5', 'Distanz': '#4297df', 'Ø Herzfrequenz': '#e46d79' };
    const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const ringClass = metric => metric.label === 'Dauer' ? ' is-duration' : metric.label === 'Distanz' ? ' is-distance' : ' is-heart-rate';
    const ringMarkup = primary.map(metric =>
        '<div class="activity-metric-circle-card' + ringClass(metric) + '" style="--activity-metric-color:' + colors[metric.label] + '">'
        + '<div class="activity-metric-circle"><strong>' + escapeHtml(metric.value) + '</strong><span>' + escapeHtml(metric.label) + '</span></div></div>'
    ).join('');
    const secondaryMarkup = secondary.map(metric => {
        const color = /Herzfrequenz|Puls/i.test(metric.label) ? '#e46d79'
            : /Pace|Geschwindigkeit|Distanz|Höhenmeter/i.test(metric.label) ? '#4297df'
            : /Leistung|Volumen|Sätze|Übungen/i.test(metric.label) ? '#a78bfa'
            : /Schlag|Trittfrequenz|SWOLF/i.test(metric.label) ? '#34d399'
            : getSportsCatalog()[type]?.color || '#94a3b8';
        return '<div class="activity-metric-secondary" style="--activity-metric-color:' + color + '"><span>' + escapeHtml(metric.label) + '</span><strong>' + escapeHtml(metric.value) + '</strong></div>';
    }).join('');
    container.innerHTML = (ringMarkup ? '<div class="activity-metric-rings">' + ringMarkup + '</div>' : '')
        + (secondaryMarkup ? '<div class="activity-metric-secondary-grid">' + secondaryMarkup + '</div>' : '');
    container.className = 'activity-detail-metrics activity-detail-metrics-redesigned';
}

export function addActivityStrengthSet() {
    const act = state.selectedActivityForModal;
    if (!act) return;
    const exercise = document.getElementById('activity-strength-exercise')?.value.trim();
    const repsRaw = document.getElementById('activity-strength-reps')?.value;
    const weightRaw = document.getElementById('activity-strength-weight')?.value;
    const reps = Number(repsRaw), weight = Number(weightRaw);
    if (!exercise) { alert('Bitte gib eine Übung an.'); return; }
    if (repsRaw === '' || !Number.isInteger(reps) || reps < 1 || reps > 100) { alert('Bitte gib 1 bis 100 Wiederholungen an.'); return; }
    if (weightRaw === '' || !Number.isFinite(weight) || weight < 0 || weight > 1000) { alert('Bitte gib ein gültiges Gewicht zwischen 0 und 1000 kg an.'); return; }
    if (!Array.isArray(act.exercises)) act.exercises = [];
    let entry = act.exercises.find(item => String(item.name).toLowerCase() === exercise.toLowerCase());
    if (!entry) { entry = { name: exercise, sets: [] }; act.exercises.push(entry); }
    if (!Array.isArray(entry.sets)) entry.sets = [];
    entry.sets.push({ reps, weight, source: 'manual' });
    saveDataToLocalStorage();
    renderActivityStrengthSets(act);
    renderSportSpecificActivityMetrics(act, getActivityLoadSummary(act));
    document.getElementById('activity-strength-exercise').value = '';
}
export function removeActivityStrengthSet(exerciseIndex, setIndex) {
    const act = state.selectedActivityForModal;
    const entry = act?.exercises?.[Number(exerciseIndex)];
    if (!entry || !Array.isArray(entry.sets) || !entry.sets[Number(setIndex)]) return;
    entry.sets.splice(Number(setIndex), 1);
    if (!entry.sets.length) act.exercises.splice(Number(exerciseIndex), 1);
    saveDataToLocalStorage();
    renderActivityStrengthSets(act);
    renderSportSpecificActivityMetrics(act, getActivityLoadSummary(act));
}
function getActivityLoadSummary(act) {
    const data = getTrainingLoadData(state.rawActivities, state.settings, state.profile, state.dailyCheckins);
    const members = getActivityGroupMembers(act, state.rawActivities || []);
    const items = members.map(member => data.records.find(record => String(record.activity.id) === String(member.id)));
    return items.length && items.every(Boolean)
        ? items.reduce((sum, item) => sum + Number(item.value), 0).toFixed(1) + ' ' + data.unit
        : '—';
}

const CANOE_ON_WATER_TYPES = new Set(['Kayaking', 'C1', 'C2']);
export function toggleActivityCanoeFields(type) {
    const selectedType = type || document.getElementById('modal-edit-sport-select')?.value || state.selectedActivityForModal?.type;
    const isCanoe = CANOE_ON_WATER_TYPES.has(selectedType);
    document.getElementById('activity-canoe-panel')?.classList.toggle('hidden', !isCanoe);
    document.getElementById('activity-c2-partner-field')?.classList.toggle('hidden', selectedType !== 'C2');
    if (isCanoe && state.selectedActivityForModal) populateActivityRouteSelect(state.selectedActivityForModal);
}
export function saveActivityTrainingPartner() {
    const act = state.selectedActivityForModal;
    const selectedType = document.getElementById('modal-edit-sport-select')?.value || act?.type;
    if (!act || selectedType !== 'C2') return;
    const value = (document.getElementById('activity-training-partner')?.value || '').trim().slice(0, 100);
    if (value) act.trainingPartner = value;
    else delete act.trainingPartner;
    saveDataToLocalStorage();
    renderSportSpecificActivityMetrics(act, getActivityLoadSummary(act));
    refreshAll();
}

export function toggleActivityStrengthSection(type) {
    const section = document.getElementById('activity-strength-section');
    if (section) section.classList.toggle('hidden', type !== 'WeightTraining');
}
export function updateActivityStrengthExerciseName(exerciseIndex, value) {
    const act = state.selectedActivityForModal;
    const exercise = act?.exercises?.[Number(exerciseIndex)];
    const name = String(value ?? '').trim().slice(0, 80);
    if (!exercise || !name) return;
    exercise.name = name;
    saveDataToLocalStorage();
    renderActivityStrengthSets(act);
    renderActivityStrengthAnalysis(act);
    renderSportSpecificActivityMetrics(act, getActivityLoadSummary(act));
}
export function updateActivityStrengthSet(exerciseIndex, setIndex, field, value) {
    const act = state.selectedActivityForModal;
    const set = act?.exercises?.[Number(exerciseIndex)]?.sets?.[Number(setIndex)];
    if (!set || !['reps', 'weight'].includes(field)) return;
    if (String(value ?? '').trim() === '') set[field] = null;
    else {
        const numeric = Number(value);
        const valid = Number.isFinite(numeric) && numeric >= 0
            && (field !== 'reps' || (Number.isInteger(numeric) && numeric >= 1 && numeric <= 100))
            && (field !== 'weight' || numeric <= 1000);
        if (!valid) {
            alert(field === 'reps' ? 'Bitte gib 1 bis 100 Wiederholungen an.' : 'Bitte gib ein gültiges Gewicht zwischen 0 und 1000 kg an.');
            renderActivityStrengthSets(act);
            return;
        }
        set[field] = numeric;
    }
    saveDataToLocalStorage();
    renderActivityStrengthSets(act);
    renderActivityStrengthAnalysis(act);
    renderSportSpecificActivityMetrics(act, getActivityLoadSummary(act));
}
function renderActivityStrengthSets(act) {
    const panel = document.getElementById('activity-strength-editor');
    if (!panel) return;
    const exercises = Array.isArray(act.exercises) ? act.exercises : [];
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    panel.innerHTML = exercises.length ? exercises.map((exercise, i) => {
        const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
        const volumeComplete = sets.every(set => Number.isInteger(Number(set.reps)) && Number(set.reps) > 0
            && set.weight != null && set.weight !== '' && Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0);
        const volume = volumeComplete ? sets.reduce((sum, set) => sum + Number(set.reps) * Number(set.weight), 0) : null;
        return '<div class="rounded-lg border border-slate-800 p-3 space-y-2">'
            + '<label class="block text-[10px] text-slate-400">Übung bearbeiten<input class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white" maxlength="80" value="' + escape(exercise.name || '') + '" onchange="updateActivityStrengthExerciseName(' + i + ',this.value)"></label>'
            + (volumeComplete ? '<div class="text-[10px] text-purple-300">Übungsvolumen: ' + volume.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' kg</div>' : '<div class="text-[10px] text-slate-500">Volumen nicht vollständig berechenbar · Angaben ergänzen</div>')
            + sets.map((set, j) => '<div class="grid grid-cols-[1fr_1fr_auto] items-end gap-2 text-xs text-slate-300">'
                + '<label class="text-[10px] text-slate-500">Wdh.<input type="number" min="1" max="100" step="1" placeholder="—" value="' + (set.reps ?? '') + '" class="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-white" onchange="updateActivityStrengthSet(' + i + ',' + j + ',\'reps\',this.value)"></label>'
                + '<label class="text-[10px] text-slate-500">Gewicht (kg)<input type="number" min="0" max="1000" step="0.5" placeholder="—" value="' + (set.weight ?? '') + '" class="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-white" onchange="updateActivityStrengthSet(' + i + ',' + j + ',\'weight\',this.value)"></label>'
                + '<button type="button" onclick="removeActivityStrengthSet(' + i + ',' + j + ')" class="pb-2 text-rose-400">Entfernen</button></div>').join('')
            + (exercise.source === 'garmin-fit' || sets.some(set => set.source === 'garmin-fit') ? '<p class="text-[9px] text-cyan-400">Aus Garmin übernommen · bearbeitbar</p>' : '')
            + '</div>';
    }).join('') : '<p class="text-[11px] text-slate-500">Noch keine Übungen dokumentiert.</p>';
}

function renderActivityTrainingInsights(act) {
    const zoneBox = document.getElementById('activity-zone-breakdown');
    const stimulus = document.getElementById('activity-training-stimulus');
    if (!zoneBox || !stimulus) return;
    const zonePanel = document.getElementById('activity-zone-panel');
    const categoryLabels = { ga: 'Grundlagenausdauer', interval: 'Intervalle', race: 'Wettkampf', reg: 'Regeneration', strength: 'Kraft', tech: 'Technik' };
    const category = categoryLabels[act.category] || 'Nicht zugeordnet';

    // Ausschließlich die in den Einstellungen aktive Berechnungsmethode anzeigen.
    // Ein fehlender Wert wird nicht durch eine andere Load-Methode ersetzt.
    const loadData = getTrainingLoadData(state.rawActivities, state.settings, state.profile, state.dailyCheckins);
    const loadItem = loadData.records.find(item => String(item.activity.id) === String(act.id));
    const configuredSource = state.settings?.trainingLoadSource || 'auto';
    const methodLabels = {
        'garmin-native': 'Garmin Training Load',
        'garmin-zone': 'KAJO HF-Zonen-Load',
        srpe: 'sRPE-Load'
    };
    const configuredLabels = {
        'kajo-zone': 'KAJO HF-Zonen-Load',
        srpe: 'sRPE-Load',
        auto: 'Automatische Trainingsbelastung'
    };
    const loadLabel = methodLabels[loadData.mode] || configuredLabels[configuredSource] || 'Training Load';
    const load = loadItem && Number.isFinite(Number(loadItem.value))
        ? Number(loadItem.value).toFixed(1) + ' ' + (loadData.unit || '')
        : '—';
    const qualityStatus = getActivityLoadQualityStatus(act, loadItem, loadData.mode);
    const qualityTone = qualityStatus.status === 'measured' || qualityStatus.status === 'cached-measured'
        ? 'border-sky-800/50 bg-sky-950/20 text-sky-300'
        : qualityStatus.status === 'limited-measured' || qualityStatus.status === 'manual-estimate'
            ? 'border-amber-800/50 bg-amber-950/20 text-amber-300'
            : qualityStatus.status === 'subjective'
                ? 'border-indigo-800/50 bg-indigo-950/20 text-indigo-300'
                : 'border-slate-700 bg-slate-900 text-slate-400';

    stimulus.innerHTML = '<div class="grid grid-cols-2 gap-2">'
        + '<div class="rounded-lg bg-slate-900 p-2"><div class="text-[10px] text-slate-500">Kategorie</div><strong class="mt-1 block text-sm text-white">' + category + '</strong></div>'
        + '<div class="rounded-lg bg-slate-900 p-2"><div class="text-[10px] text-slate-500">' + loadLabel + '</div><strong class="mt-1 block text-sm text-sky-300">' + load + '</strong></div>'
        + '</div>'
        + '<div class="mt-2 rounded-lg border px-3 py-2 ' + qualityTone + '" data-load-quality="' + qualityStatus.status + '"><div class="text-[11px] font-semibold">' + qualityStatus.label + '</div><p class="mt-1 text-[10px] leading-relaxed opacity-90">' + qualityStatus.detail + '</p></div>'
        + '<details class="mt-2 text-[10px] text-slate-500"><summary class="cursor-pointer">Methoden & Datenbasis</summary><p class="mt-2">Angezeigt wird ausschließlich die aktuell in den Einstellungen gewählte Berechnungsmethode. Unterschiedliche Load-Skalen werden nicht vermischt und fehlende Werte nicht durch alternative Methoden ersetzt. Die automatische Auswahl verwendet die verfügbare Datenabdeckung.</p></details>';
    renderTrainingBenefitProfile(act);
    const zoneTime = calculateActivityZoneTime(act);
    if (!zoneTime || !zoneTime.totalSeconds) { if (zonePanel) zonePanel.classList.add('hidden'); return; }
    const { seconds, totalSeconds: total, hasTime } = zoneTime;
    if (zonePanel) zonePanel.classList.remove('hidden');
    const colors = ['#38bdf8', '#34d399', '#facc15', '#fb923c', '#f43f5e'];
    const topZone = seconds.reduce((best, value, index) => value > seconds[best] ? index : best, 0);
    zoneBox.innerHTML = seconds.map((v, i) => {
        const pct = v / total * 100;
        return `<div class="grid grid-cols-[2rem_1fr_5rem] items-center gap-2 text-xs"><span class="text-slate-300">Z${i + 1}</span><div class="h-2 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full" style="width:${pct.toFixed(1)}%;background:${colors[i]}"></div></div><span class="text-right text-slate-300">${Math.round(v / 60)} min · ${pct.toFixed(0)}%</span></div>`;
    }).join('') + `<p class="mt-2 text-[10px] text-slate-400">Größter Zeitanteil: Z${topZone + 1} (${(seconds[topZone] / total * 100).toFixed(0)}%).</p><details class="mt-2 text-[10px] text-slate-500"><summary class="cursor-pointer">Datenbasis</summary><p class="mt-1">${hasTime ? 'Aus Zeitstempeln der HF-Messwerte berechnet.' : 'Zeitlich angenähert, da Zeitstempel fehlen.'} ${zoneTime.zoneSource === 'karvonen-adaptive' ? (zoneTime.restingHrSource === 'profile-fallback' ? 'HF-Zonen nutzen den statischen Ruhe-HF-Profilwert als Fallback.' : 'HF-Zonen nutzen die adaptive Ruhe-HF aus dem rollierenden Rückblickfenster.') : 'HF-Zonen sind mangels ausreichender Ruhe-HF- oder HFmax-Daten nicht berechenbar.'}</p></details>`;
}



function renderActivityRouteMap(activity) {
    const panel = document.getElementById('activity-route-map-panel');
    if (!panel) return;
    const telemetry = activity?.telemetry || activity?.garminTelemetry || {};
    const fields = activity?.garminFitData?.recordFields || {};
    const latitudes = telemetry.latitude || telemetry.lat || telemetry.position_lat || fields.position_lat || fields.latitude;
    const longitudes = telemetry.longitude || telemetry.lon || telemetry.position_long || fields.position_long || fields.longitude;
    const normalizeCoordinate = (value, limit) => {
        if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return null;
        let number = Number(value);
        if (Math.abs(number) > limit) number = number * 180 / 2147483648;
        return Math.abs(number) <= limit ? number : null;
    };
    if (!Array.isArray(latitudes) || !Array.isArray(longitudes) || latitudes.length !== longitudes.length) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    const points = latitudes.map((lat, index) => ({
        lat: normalizeCoordinate(lat, 90),
        lon: normalizeCoordinate(longitudes[index], 180),
        index
    })).filter(point => point.lat !== null && point.lon !== null);
    if (points.length < 2 || !globalThis.L) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    if (state.activityRouteMap) {
        state.activityRouteMap.remove();
        state.activityRouteMap = null;
    }
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="activity-detail-section-heading"><div><h3>GPS-Strecke</h3></div><span class="activity-detail-context-tag">' + points.length.toLocaleString('de-DE') + ' GPS-Punkte</span></div>'
        + '<div id="activity-route-map" class="activity-route-map" role="img" aria-label="Interaktive GPS-Strecke mit Start und Ziel"></div>';
    const sportColor = getSportsCatalog()[activity.type]?.color || '#38bdf8';
    const map = L.map('activity-route-map', { zoomControl: true, scrollWheelZoom: false, preferCanvas: true });
    state.activityRouteMap = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    const latLngs = points.map(point => [point.lat, point.lon]);
    const line = L.polyline(latLngs, { color: sportColor, weight: 4, opacity: .9 }).addTo(map);
    const start = L.circleMarker(latLngs[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).addTo(map);
    const finish = L.circleMarker(latLngs[latLngs.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }).addTo(map);
    start.bindTooltip('Start');
    finish.bindTooltip('Ziel');
    const time = Array.isArray(telemetry.time) && telemetry.time.length === latitudes.length ? telemetry.time : null;
    const selectedSeries = getActivityTelemetrySeries(activity).find(item => item.key === state.activityTelemetryMetric);
    const canLinkRouteToChart = Boolean(time && selectedSeries?.values.length === latitudes.length);
    if (time) {
        const step = Math.max(1, Math.ceil(points.length / 60));
        points.forEach((point, index) => {
            if (index % step !== 0 || index === 0 || index === points.length - 1) return;
            const seconds = Number(time[point.index]);
            if (!Number.isFinite(seconds)) return;
            const marker = L.circleMarker([point.lat, point.lon], { radius: 2.5, color: sportColor, weight: 1, fillOpacity: .8 })
                .bindTooltip(String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0'));
            if (canLinkRouteToChart) marker.on('click', () => focusActivityTelemetryPoint(point.index));
            marker.addTo(map);
        });
    }
    if (canLinkRouteToChart) panel.insertAdjacentHTML('beforeend', '<p class="activity-detail-muted mt-2">Streckenpunkt antippen, um den passenden Messpunkt im Verlauf zu markieren.</p>');
    map.fitBounds(line.getBounds(), { padding: [18, 18] });
    requestAnimationFrame(() => { if (state.activityRouteMap === map) map.invalidateSize(); });
}


function getActivityLapRecords(activity) {
    const storedLaps = Array.isArray(activity?.laps) ? activity.laps
        : Array.isArray(activity?.intervals) ? activity.intervals : [];
    if (storedLaps.length) return storedLaps;
    const fitLaps = Array.isArray(activity?.garminFitData?.laps) ? activity.garminFitData.laps : [];
    return fitLaps.map((lap, index) => ({
        name: 'Garmin-Runde ' + (lap.lapNumber || index + 1),
        kind: 'automatic',
        duration: lap.totalTimerTimeSeconds ?? lap.totalElapsedTimeSeconds ?? null,
        durationSeconds: lap.totalTimerTimeSeconds ?? lap.totalElapsedTimeSeconds ?? null,
        durationUnit: 'seconds',
        distance: Number.isFinite(Number(lap.distanceKm)) ? Number(lap.distanceKm) * 1000 : null,
        avgHr: lap.averageHeartRate ?? null,
        maxHr: lap.maxHeartRate ?? null,
        avgSpeed: lap.averageSpeedKmh ?? null,
        maxSpeed: lap.maxSpeedKmh ?? null,
        startTime: lap.startTime ?? null,
        startTimeSeconds: lap.startTimeSeconds ?? null,
        endTimeSeconds: lap.endTimeSeconds ?? null
    }));
}

export function focusActivityLap(index) {
    const activity = state.selectedActivityForModal;
    const lap = getActivityLapRecords(activity)[index] || null;
    if (!lap || !Number.isFinite(Number(lap.startTimeSeconds)) || !Number.isFinite(Number(lap.endTimeSeconds))) return;
    state.activitySelectedLap = { startTimeSeconds: Number(lap.startTimeSeconds), endTimeSeconds: Number(lap.endTimeSeconds) };
    const chartActivity = activity.garminTelemetry ? { ...activity, telemetry: activity.garminTelemetry } : activity;
    renderActivityTelemetryChart(chartActivity);
    document.getElementById('activity-telemetry-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


function renderActivityStrengthAnalysis(activity) {
    const panel = document.getElementById('activity-strength-analysis-panel');
    if (!panel) return;
    const exercises = Array.isArray(activity.exercises) ? activity.exercises : [];
    if (activity.type !== 'WeightTraining' || !exercises.length) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    const summary = calculateStrengthActivitySummary(exercises);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const rows = exercises.map(exercise => {
        const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
        const details = sets.map((set, index) => {
            const reps = set?.reps != null && set.reps !== '' && Number.isInteger(Number(set.reps)) && Number(set.reps) > 0 ? Number(set.reps) : null;
            const weight = set?.weight != null && set.weight !== '' && Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0 ? Number(set.weight) : null;
            return '<span class="activity-strength-set-chip">S' + (index + 1) + ' · ' + (reps === null ? '—' : reps + ' Wdh.') + ' · ' + (weight === null ? '—' : weight.toLocaleString('de-DE') + ' kg') + '</span>';
        }).join('');
        return '<div class="activity-strength-exercise-row"><strong>' + escape(exercise.name || 'Übung') + '</strong><div class="activity-strength-set-list">' + details + '</div></div>';
    }).join('');
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="activity-detail-section-heading"><div><h3>Krafttraining</h3></div><span class="activity-detail-context-tag">' + summary.exerciseCount + ' Übungen · ' + summary.setCount + ' Sätze</span></div>'
        + rows
        + (summary.volumeComplete ? '<p class="activity-strength-volume">Gesamtvolumen · <strong>' + summary.volume.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' kg</strong></p>'
            : '<p class="activity-strength-volume">Gesamtvolumen nicht berechenbar · bei mindestens einem Satz fehlen Gewicht oder Wiederholungen.</p>');
}

function renderActivityComparisons(activity) {
    const panel = document.getElementById('activity-comparison-panel');
    if (!panel) return;
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const distance = Number(activity.distance);
    const duration = Number(activity.duration);
    const storedRouteIds = item => Array.isArray(item.routeAssignments) ? item.routeAssignments.map(entry => String(entry.routeId)).filter(Boolean).sort() : item.routeId ? [String(item.routeId)] : [];
    const routeIds = storedRouteIds(activity);
    const isCanoe = ['Kayaking', 'C1', 'C2'].includes(activity.type);
    const water = activity.waterConditions || {};
    const matches = (state.rawActivities || []).filter(candidate => {
        if (!candidate || String(candidate.id) === String(activity.id)) return false;
        if (candidate.type !== activity.type || (candidate.category || '') !== (activity.category || '')) return false;
        if ((candidate.raceFormat || '') !== (activity.raceFormat || '')) return false;
        const otherDistance = Number(candidate.distance);
        if (!(distance > 0 && otherDistance > 0 && Math.round(otherDistance * 100) === Math.round(distance * 100))) return false;
        if (isCanoe) {
            if (!activity.raceFormat) return false;
            if (activity.type === 'C2' && (!activity.trainingPartner || candidate.trainingPartner !== activity.trainingPartner)) return false;
            const otherRoutes = storedRouteIds(candidate);
            if (!routeIds.length || !otherRoutes.length || routeIds.join('|') !== otherRoutes.join('|')) return false;
            const otherWater = candidate.waterConditions || {};
            if (water.level == null || otherWater.level == null || (water.levelUnit || 'cm') !== (otherWater.levelUnit || 'cm')) return false;
            const levelA = Number(water.level), levelB = Number(otherWater.level);
            if (!Number.isFinite(levelA) || !Number.isFinite(levelB) || levelA !== levelB) return false;
            const dischargeA = water.discharge == null ? null : Number(water.discharge);
            const dischargeB = otherWater.discharge == null ? null : Number(otherWater.discharge);
            if ((dischargeA === null) !== (dischargeB === null)) return false;
            if (dischargeA !== null && (!Number.isFinite(dischargeA) || !Number.isFinite(dischargeB)
                || dischargeA !== dischargeB)) return false;
            const currentWaterType = water.type || activity.waterType || '';
            const candidateWaterType = otherWater.type || candidate.waterType || '';
            if (!currentWaterType || !candidateWaterType || currentWaterType !== candidateWaterType) return false;
        }
        return true;
    }).sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0,3);
    if (!matches.length) {
        panel.classList.remove('hidden');
        panel.innerHTML = '<p class="text-xs text-slate-500">Noch keine ausreichend vergleichbare Einheit vorhanden. Kanu-Vergleiche setzen gleiche Bootsklasse, Rennformat, Strecke, Gewässertyp, Pegel und Abfluss voraus; C2 zusätzlich denselben dokumentierten Partner. Andere Sportarten benötigen gleiche Kategorie, Rennformat und Distanz.</p>';
        return;
    }
    const currentSpeed = Number(activity.avgSpeed ?? activity.averageSpeed);
    const rows = matches.map(candidate => {
        const otherSpeed = Number(candidate.avgSpeed ?? candidate.averageSpeed);
        const speedDiff = Number.isFinite(currentSpeed) && currentSpeed > 0 && Number.isFinite(otherSpeed)
            ? ((currentSpeed - otherSpeed) / otherSpeed * 100) : null;
        const durationDiff = duration > 0 && Number(candidate.duration) > 0 ? Number(candidate.duration) - duration : null;
        return '<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-800 py-2 text-xs">'
            + '<div><strong class="text-slate-200">' + escape(candidate.name || 'Training') + '</strong><div class="text-[10px] text-slate-500">'
            + escape(formatDateDDMMYY(candidate.date)) + ' · ' + Math.round(Number(candidate.duration)) + ' min · ' + escape(getActivitySourceLabel(candidate))
            + (candidate.distance ? ' · ' + formatKm(candidate.distance) + ' km' : '') + '</div></div>'
            + '<div class="text-right text-[10px] text-slate-400">'
            + (speedDiff !== null ? 'Geschwindigkeit: ' + (speedDiff > 0 ? '+' : '') + speedDiff.toFixed(1) + '%' : '')
            + (durationDiff !== null ? (speedDiff !== null ? '<br>' : '') + 'Dauer: ' + (durationDiff > 0 ? '+' : '') + Math.round(durationDiff) + ' min' : '')
            + '</div></div>';
    }).join('');
    panel.classList.remove('hidden');
    panel.innerHTML = '<h4 class="text-xs font-bold text-white mb-2">Vergleichbare Aktivitäten</h4>'
        + '<p class="text-[10px] text-slate-500 mb-2">Gleiche Sportart, Trainingskategorie, Rennformat und auf 0,01 km gleiche Distanz'
        + (isCanoe ? ', identische Strecke, Gewässertyp, Pegel und Abfluss' : '') + '.</p>' + rows;
}

function renderOptionalActivityViews(act) {
    const setPanel = (id, title, body) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!body) { el.classList.add('hidden'); el.innerHTML = ''; return; }
        el.classList.remove('hidden');
        el.innerHTML = `<h4 class="text-xs font-bold text-white mb-2">${title}</h4>${body}`;
    };
    const safe = value => Number.isFinite(Number(value)) ? Number(value) : null;
    const telemetry = getActivityTelemetry(act) || {};
    const hr = Array.isArray(telemetry.hr) ? telemetry.hr.map(safe) : [];
    const speed = Array.isArray(telemetry.speed) ? telemetry.speed.map(safe) : [];
    const times = Array.isArray(telemetry.time) ? telemetry.time : [];
    const validHr = hr.filter(v => v !== null && v >= 30 && v <= 250);
    const validSpeed = speed.filter(v => v !== null && v >= 0);
    const hasIntensity = getActivityTelemetrySeries(act).length > 0;
    const chartPanel = document.getElementById('activity-telemetry-panel');
    if (chartPanel) chartPanel.classList.toggle('hidden', !hasIntensity);

    // Herzfrequenz-Erholung nur bei explizit als Erholungsphase gespeicherten Messwerten.
    const recovery = telemetry.recoveryHr || act.recoveryHr;
    if (Array.isArray(recovery) && recovery.length >= 2) {
        const values = recovery.map(safe).filter(v => v !== null && v >= 30 && v <= 250);
        const drop = values.length >= 2 ? values[0] - values[values.length - 1] : null;
        setPanel('activity-recovery-panel', 'Herzfrequenz-Erholung', drop !== null
            ? `<p class="text-sm text-slate-200">Herzfrequenz-Abnahme: <strong class="text-emerald-300">${drop} bpm</strong></p><p class="text-[10px] text-slate-500 mt-1">Aus den explizit gespeicherten Erholungsmesswerten.</p>`
            : '');
    } else setPanel('activity-recovery-panel', 'Herzfrequenz-Erholung', '');

    // Effizienz nur bei zeitlich korrespondierenden HF- und Geschwindigkeitswerten.
    if (hr.length >= 2 && speed.length === hr.length) {
        const paired = hr.map((h, i) => ({ h, s: speed[i] })).filter(x => x.h !== null && x.h >= 30 && x.h <= 250 && x.s !== null && x.s > 0);
        if (paired.length >= 2) {
            const avgHr = paired.reduce((sum, x) => sum + x.h, 0) / paired.length;
            const avgSpeed = paired.reduce((sum, x) => sum + x.s, 0) / paired.length;
            const ratio = avgSpeed / avgHr;
            setPanel('activity-efficiency-panel', 'Effizienz und Belastungsverhältnis',
                `<div class="grid grid-cols-3 gap-2 text-center"><div><div class="text-sm font-bold text-sky-300">${avgSpeed.toFixed(1)}</div><div class="text-[10px] text-slate-500">Ø km/h</div></div><div><div class="text-sm font-bold text-rose-300">${Math.round(avgHr)}</div><div class="text-[10px] text-slate-500">Ø bpm</div></div><div><div class="text-sm font-bold text-white">${ratio.toFixed(3)}</div><div class="text-[10px] text-slate-500">km/h je bpm</div></div></div><p class="text-[10px] text-slate-500 mt-2">Deskriptiver Kennwert aus synchronisierten Messpunkten. Nur sinnvoll im Vergleich ähnlicher Sportarten und Bedingungen.</p>`);
        } else setPanel('activity-efficiency-panel', 'Effizienz und Belastungsverhältnis', '');
    } else setPanel('activity-efficiency-panel', 'Effizienz und Belastungsverhältnis', '');

    // Runden getrennt ausweisen: automatische Runden dürfen keinen Intervallvergleich beeinflussen.
    // FIT-Runden liegen nach dem Garmin-Import unter garminFitData.laps und
    // werden hier in das bestehende Anzeigeformat überführt.
    const laps = getActivityLapRecords(act);
    if (laps.length) {
        const manualCount = laps.filter(lap => lap.kind === 'manual').length;
        const automaticCount = laps.filter(lap => lap.kind === 'automatic').length;
        const unclassifiedCount = laps.length - manualCount - automaticCount;
        const lapSourceLabel = Array.isArray(act.garminFitData?.laps) && act.garminFitData.laps.length
            ? 'Garmin-FIT-Runden'
            : act.source === 'fit' || (Array.isArray(act.sources) && act.sources.includes('fit'))
                ? 'FIT-Datei-Runden' : 'Gespeicherte Runden';
        const summary = `<div class="text-[10px] text-slate-400 mb-2"><strong>${lapSourceLabel}</strong> · ${manualCount} manueller Trigger · ${automaticCount} automatischer Trigger · ${unclassifiedCount} nicht zugeordnet</div><p class="text-[10px] text-slate-500 mb-2">Automatische Runden (z. B. jede 1 km) werden separat angezeigt und nicht für den Vergleich manueller Abschnitte verwendet. Ein manueller FIT-Trigger bedeutet nicht automatisch, dass es sich um ein geplantes Trainingsintervall handelt.</p>`;
        const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        const comparableLaps = laps.map((lap, i) => {
            const durationRaw = lap.duration ?? lap.durationSeconds ?? lap.elapsed_time;
            const distanceRaw = lap.distance;
            const duration = durationRaw === null || durationRaw === undefined || durationRaw === '' ? null : safe(durationRaw);
            const distance = distanceRaw === null || distanceRaw === undefined || distanceRaw === '' ? null : safe(distanceRaw);
            const speed = lap.durationUnit === 'seconds' && duration > 0 && distance > 0
                ? distance / duration * 3.6 : null;
            const durationSeconds = duration === null ? null
                : lap.durationUnit === 'seconds' ? duration
                : duration > 1000 ? duration / 1000 : duration;
            const paceTotalSeconds = durationSeconds !== null && durationSeconds > 0 && distance > 0
                ? Math.round(durationSeconds / (distance / 1000)) : null;
            const pace = paceTotalSeconds !== null && Number.isFinite(paceTotalSeconds)
                ? Math.floor(paceTotalSeconds / 60) + ':' + String(paceTotalSeconds % 60).padStart(2, '0') + ' min/km'
                : null;
            return { lap, index: i + 1, duration, distance, speed, pace };
        });
        const manualComparable = comparableLaps.filter(item => item.lap.kind === 'manual' && item.speed !== null);
        const manualSpeeds = manualComparable.map(item => item.speed);
        const fastestManual = manualSpeeds.length ? Math.max(...manualSpeeds) : null;
        const rows = comparableLaps.map(item => {
            const { lap, index, duration, distance, speed, pace } = item;
            const label = escapeHtml(lap.name || lap.label || `Runde ${index}`);
            const kind = lap.kind === 'manual' ? 'Manuell markiert' : lap.kind === 'automatic' ? 'Automatisch' : 'Nicht zugeordnet';
            const durationText = duration !== null
                ? Math.round(lap.durationUnit === 'seconds' ? duration : duration > 1000 ? duration / 1000 : duration) + ' s' : '—';
            const distanceText = distance !== null
                ? (distance >= 1000 ? (distance / 1000).toFixed(2) + ' km' : distance.toFixed(0) + ' m') : '—';
            const avgHr = safe(lap.avgHr ?? lap.avg_heart_rate);
            const maxHr = safe(lap.maxHr ?? lap.max_heart_rate);
            const avgPower = safe(lap.avgPower ?? lap.avg_power);
            const maxPower = safe(lap.maxPower ?? lap.max_power);
            const avgCadence = safe(lap.avgCadence ?? lap.avg_cadence);
            const details = [
                durationText,
                distanceText,
                speed !== null ? speed.toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' km/h' : null,
                pace,
                avgHr !== null ? 'Ø ' + Math.round(avgHr) + ' bpm' : null,
                maxHr !== null ? 'Max ' + Math.round(maxHr) + ' bpm' : null,
                avgPower !== null ? 'Ø ' + Math.round(avgPower) + ' W' : null,
                maxPower !== null ? 'Max ' + Math.round(maxPower) + ' W' : null,
                avgCadence !== null ? 'Ø ' + Math.round(avgCadence) + '/min' : null
            ].filter(Boolean).join(' · ');
            const isFastestManual = lap.kind === 'manual' && speed !== null && fastestManual !== null && Math.abs(speed - fastestManual) < 0.0001;
            const speedTone = isFastestManual ? 'text-emerald-300' : 'text-slate-400';
            const canFocus = Number.isFinite(Number(lap.startTimeSeconds)) && Number.isFinite(Number(lap.endTimeSeconds));
            const row = '<div><div class="text-slate-200">' + label + '</div><div class="text-[10px] text-slate-500">' + kind + '</div></div><div class="text-right ' + speedTone + '">' + details + '</div>';
            return canFocus
                ? '<button type="button" onclick="focusActivityLap(' + (index - 1) + ')" aria-label="Abschnitt im Zeitverlauf markieren" class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs border-b border-slate-800 py-2 w-full text-left">' + row + '</button>'
                : '<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs border-b border-slate-800 py-2">' + row + '</div>';
        }).join('');
        const comparisonNote = manualSpeeds.length >= 2
            ? `<div class="text-[10px] text-slate-400 mt-2">Schnellster manuell markierter Abschnitt: ${fastestManual.toLocaleString('de-DE', { maximumFractionDigits: 2 })} km/h. Nur manuell markierte FIT-Runden mit eindeutiger Dauer- und Distanzangabe werden verglichen.</div>`
            : '<div class="text-[10px] text-slate-500 mt-2">Für einen Vergleich fehlen mindestens zwei manuell markierte Runden mit eindeutiger Dauer- und Distanzangabe. Automatische Runden werden nicht als Ersatz herangezogen.</div>';
        const fitSteps = act.garminFitData?.messageGroups?.structured?.workoutSteps;
        const workoutSteps = Array.isArray(fitSteps) ? fitSteps : [];
        const workoutStepHtml = workoutSteps.length
            ? '<div class="mt-4 border-t border-slate-800 pt-3"><h5 class="text-xs font-semibold text-cyan-300 mb-2">Garmin-Trainingsintervalle / Workout-Schritte (' + workoutSteps.length + ')</h5>'
                + workoutSteps.map((step, index) => {
                    const entries = Object.entries(step || {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
                    const detail = entries.map(([key, value]) => escapeHtml(key.replace(/_/g, ' ') + ': ' + (typeof value === 'object' ? JSON.stringify(value) : value))).join(' · ');
                    return '<div class="border-b border-slate-800 py-2 text-[10px]"><span class="text-slate-200 font-medium">Schritt ' + (index + 1) + '</span><div class="text-slate-400 mt-1">' + detail + '</div></div>';
                }).join('') + '</div>'
            : '';
        setPanel('activity-intervals-panel', 'Runden & Trainingsintervalle', summary + rows + comparisonNote + workoutStepHtml);
    } else {
        const fitSteps = act.garminFitData?.messageGroups?.structured?.workoutSteps;
        const workoutSteps = Array.isArray(fitSteps) ? fitSteps : [];
        const escapeStep = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const workoutStepHtml = workoutSteps.length
            ? '<h5 class="text-xs font-semibold text-cyan-300 mb-2">Garmin-Trainingsintervalle / Workout-Schritte (' + workoutSteps.length + ')</h5>'
                + workoutSteps.map((step, index) => '<div class="border-b border-slate-800 py-2 text-[10px]"><span class="text-slate-200 font-medium">Schritt ' + (index + 1) + '</span><div class="text-slate-400 mt-1">' + Object.entries(step || {}).map(([key, value]) => escapeStep(key.replace(/_/g, ' ') + ': ' + (typeof value === 'object' ? JSON.stringify(value) : value))).join(' · ') + '</div></div>').join('')
            : '';
        setPanel('activity-intervals-panel', 'Runden & manuelle Abschnitte', workoutStepHtml);
    }

    // Höhenprofil nur anzeigen, wenn ein Höhenverlauf oder Höhengewinn gespeichert ist.
    const altitude = telemetry.altitude || telemetry.elevation || act.garminFitData?.recordFields?.altitude || act.garminFitData?.recordFields?.enhanced_altitude;
    const gain = safe(act.elevationGain ?? act.elevation_gain);
    if ((Array.isArray(altitude) && altitude.length >= 2) || gain !== null) {
        const validAlt = Array.isArray(altitude) ? altitude.map(safe).filter(v => v !== null) : [];
        const profile = validAlt.length >= 2 ? `Höhenbereich: ${Math.round(Math.min(...validAlt))}–${Math.round(Math.max(...validAlt))} m` : '';
        setPanel('activity-elevation-panel', 'Höhenprofil und Streckenanalyse', `<p class="text-sm text-slate-200">${profile}${profile && gain !== null ? ' · ' : ''}${gain !== null ? `Höhengewinn: ${Math.round(gain)} m` : ''}</p>`);
    } else setPanel('activity-elevation-panel', 'Höhenprofil und Streckenanalyse', '');

    // Belastungskontext aus derselben zentralen Berechnung wie die Belastungsübersicht.
    // Keine Mischung von Garmin Load, EA-HF-Punkten und externem TSS.
    const loadData = getTrainingLoadData(state.rawActivities, state.settings, state.profile, state.dailyCheckins);
    const today = state.dailyTimeline.findIndex(d => d.date === act.date);
    const activityLoadItem = loadData.records.find(item => String(item.activity.id) === String(act.id));
    if (activityLoadItem && today >= 0) {
        const recent = state.dailyTimeline.slice(Math.max(0, today - 6), today + 1);
        const weekLoad = recent.reduce((sum, d) => sum + (Number(d.load ?? d.tss) || 0), 0);
        const prior = recent.slice(0, -1).reduce((sum, d) => sum + (Number(d.load ?? d.tss) || 0), 0);
        setPanel('activity-load-context-panel', 'Trainingsbelastung im Kontext',
            `<div class="grid grid-cols-2 gap-3"><div><div class="text-lg font-bold text-sky-300">${Number(activityLoadItem.value).toFixed(1)}</div><div class="text-[10px] text-slate-500">Load dieser Aktivität · ${loadData.unit}</div></div><div><div class="text-lg font-bold text-white">${weekLoad.toFixed(1)}</div><div class="text-[10px] text-slate-500">Tagesload / letzte 7 Tage · ${loadData.unit}</div></div></div><p class="text-[10px] text-slate-500 mt-2">Vorheriger 6-Tage-Load: ${prior.toFixed(1)}. Der Tageswert kann weitere Einheiten enthalten.</p>`);
    } else setPanel('activity-load-context-panel', 'Trainingsbelastung im Kontext', '');

    renderGarminFitDataPanel(act);

    // RPE wird separat im Analyse-Feed über den direkt speichernden Slider erfasst.

    // KI-Analyse nur anzeigen, wenn ein tatsächlich erzeugtes Analyseergebnis gespeichert wurde.
    const aiText = act.aiAnalysis?.summary || act.aiAnalysis || act.analysis?.aiSummary;
    setPanel('activity-ai-panel', 'KI-Aktivitätsanalyse', typeof aiText === 'string' && aiText.trim()
        ? `<p class="text-xs text-slate-300 whitespace-pre-wrap">${aiText.replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))}</p>`
        : '');
}


function renderGarminFitDataPanel(act) {
    const panel = document.getElementById('activity-fit-data-panel');
    if (!panel) return;
    const fitData = act.garminFitData || {};
    const fields = fitData.recordFields && typeof fitData.recordFields === 'object' ? fitData.recordFields : {};
    const counts = fitData.recordFieldCounts && typeof fitData.recordFieldCounts === 'object' ? fitData.recordFieldCounts : {};
    const groups = fitData.messageGroups && typeof fitData.messageGroups === 'object' ? fitData.messageGroups : {};
    const structured = groups.structured && typeof groups.structured === 'object' ? groups.structured : {};
    const laps = Array.isArray(structured.laps) ? structured.laps : (Array.isArray(groups.laps) ? groups.laps : Array.isArray(groups.lap) ? groups.lap : []);
    const sets = Array.isArray(structured.sets) ? structured.sets : (Array.isArray(groups.sets) ? groups.sets : Array.isArray(groups.set) ? groups.set : []);
    const steps = Array.isArray(structured.workoutSteps) ? structured.workoutSteps : (Array.isArray(groups.workout_steps) ? groups.workout_steps : Array.isArray(groups.workout_step) ? groups.workout_step : []);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const pretty = key => ({
        heart_rate:'Herzfrequenz', speed:'Geschwindigkeit', enhanced_speed:'Erweiterte Geschwindigkeit',
        distance:'Distanz', enhanced_altitude:'Höhe', altitude:'Höhe', cadence:'Kadenz / Schlagfrequenz',
        power:'Leistung', temperature:'Temperatur', vertical_speed:'Vertikalgeschwindigkeit',
        stroke_count:'Schlaganzahl', total_cycles:'Zyklen', stance_time:'Bodenkontaktzeit',
        stance_time_balance:'Bodenkontaktbalance', vertical_oscillation:'Vertikale Bewegung',
        step_length:'Schrittlänge', vertical_ratio:'Vertikalverhältnis', respiration_rate:'Atemfrequenz',
        core_temperature:'Körperkerntemperatur', muscle_oxygen_saturation:'Muskel-Sauerstoffsättigung',
        gps_accuracy:'GPS-Genauigkeit', grade:'Steigung'
    }[key] || key.replace(/_/g,' '));
    const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
    const series = Object.entries(fields).filter(([key, values]) => Array.isArray(values) && values.length >= 2
        && values.filter(numeric).length >= 2);
    const units = {
        heart_rate:'bpm', speed:'km/h', enhanced_speed:'km/h', distance:'km', enhanced_altitude:'m',
        altitude:'m', cadence:'/min', power:'W', temperature:'°C', vertical_speed:'m/s',
        stroke_count:'', total_cycles:'', stance_time:'ms', stance_time_balance:'%', vertical_oscillation:'mm',
        step_length:'mm', vertical_ratio:'%', respiration_rate:'/min', core_temperature:'°C',
        muscle_oxygen_saturation:'%', gps_accuracy:'m', grade:'%'
    };
    const stats = series.map(([key, values]) => {
        const nums = values.filter(numeric).map(Number);
        const avg = nums.reduce((sum,v)=>sum+v,0)/nums.length;
        return {key, count:nums.length, min:Math.min(...nums), avg, max:Math.max(...nums)};
    });
    const groupCards = [
        ['Runden', laps.length], ['Kraft-Sätze', sets.length], ['Trainingsschritte', steps.length],
        ['Messfeldtypen', Object.keys(fields).length], ['Messpunkte', fitData.recordCount || 0]
    ];
    const cardHtml = groupCards.map(([label,value]) =>
        '<div class="rounded-lg bg-slate-900 border border-slate-800 p-2"><div class="text-[10px] text-slate-500">'+label+'</div><div class="text-lg font-bold text-white">'+Number(value).toLocaleString('de-DE')+'</div></div>'
    ).join('');
    const statsHtml = stats.length ? stats.map(item => {
        const unit = units[item.key] || '';
        const fmt = value => Number(value).toLocaleString('de-DE',{maximumFractionDigits:2})+(unit?' '+unit:'');
        return '<div class="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,auto))] gap-2 items-center border-b border-slate-800 py-2 text-[10px]"><span class="text-slate-300">'+escape(pretty(item.key))+' <span class="text-slate-600">('+item.count+')</span></span><span class="text-slate-400">Min '+fmt(item.min)+'</span><span class="text-slate-300">Ø '+fmt(item.avg)+'</span><span class="text-slate-400">Max '+fmt(item.max)+'</span></div>';
    }).join('') : '<p class="text-xs text-slate-500">Keine numerischen FIT-Messreihen vorhanden.</p>';
    const rawFieldHtml = Object.entries(fields).map(([key, values]) => {
        const sample = Array.isArray(values) ? values.slice(0,8) : [values];
        return '<div class="py-1.5 border-b border-slate-800"><div class="text-[10px] text-slate-300">'+escape(pretty(key))+' <span class="text-slate-600">('+Number(counts[key] || 0)+' Werte)</span></div><div class="text-[10px] text-slate-500 break-all">'+escape(sample.map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):String(v??'—')).join(' · '))+(Array.isArray(values)&&values.length>8?' · …':'')+'</div></div>';
    }).join('');
    const objectRows = (items, label) => items.length ? '<div class="space-y-2">'+items.map((item,index)=>{
        const entries = item && typeof item === 'object' ? Object.entries(item) : [['Wert',item]];
        const details = entries.map(([key,value])=>'<div class="flex justify-between gap-3 border-b border-slate-800 py-1"><span class="text-slate-500">'+escape(pretty(key))+'</span><span class="text-right text-slate-300 break-all">'+escape(typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'—'))+'</span></div>').join('');
        return '<details class="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"><summary class="cursor-pointer text-xs text-slate-200">'+escape(label)+' '+(index+1)+'</summary><div class="mt-2">'+details+'</div></details>';
    }).join('')+'</div>' : '<p class="text-[10px] text-slate-500">Keine entsprechenden FIT-Datensätze in dieser Datei.</p>';
    const imported = Boolean(act.garminFitImported && Object.keys(fitData).length);
    const hasFitDetails = Boolean(fitData.recordCount || Object.keys(fields).length || laps.length || sets.length || steps.length);
    if (!hasFitDetails) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="flex flex-wrap items-start justify-between gap-2"><div><h4 class="text-xs font-bold text-cyan-300">Garmin FIT-Daten im Detail</h4><p class="text-[10px] text-slate-500 mt-1">'+(imported?'FIT-Datei ausgewertet':'Noch keine erweiterten FIT-Daten gespeichert')+(fitData.importedAt?' · Import '+escape(new Date(fitData.importedAt).toLocaleString('de-DE')):'')+'</p></div><span class="text-[10px] text-slate-500">'+Number(fitData.recordCount||0)+' Records</span></div>'
        +'<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">'+cardHtml+'</div>'
        
        +'<div class="mt-4"><h5 class="text-[11px] font-semibold text-white mb-1">Messwerte – Min / Durchschnitt / Max</h5>'+statsHtml+'</div>'
        +'<div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3"><section><h5 class="text-[11px] font-semibold text-white mb-2">Runden ('+laps.length+')</h5>'+objectRows(laps,'Runde')+'</section><section><h5 class="text-[11px] font-semibold text-white mb-2">Kraft-Sätze ('+sets.length+')</h5>'+objectRows(sets,'Satz')+'</section><section><h5 class="text-[11px] font-semibold text-white mb-2">Trainingsschritte ('+steps.length+')</h5>'+objectRows(steps,'Schritt')+'</section></div>'
        +'<details class="mt-4"><summary class="cursor-pointer text-[11px] text-sky-300">Alle erkannten FIT-Messfelder und Beispielwerte</summary><div class="mt-2 max-h-80 overflow-y-auto pr-1">'+(rawFieldHtml||'<p class="text-[10px] text-slate-500">Keine Messfelder gespeichert.</p>')+'</div></details>';

}

export function toggleActivityEdit() {
    const panel = document.getElementById('activity-edit-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) document.getElementById('modal-edit-name')?.focus();
}

export function deleteSelectedActivity() {
    if (!state.selectedActivityForModal) return;
    const id = state.selectedActivityForModal.id;
    if (!confirm('Diese Aktivität wirklich löschen?')) return;
    try {
        queueActivityDeletionTombstone(state.selectedActivityForModal, toLocalDateString());
    } catch (error) {
        console.error('Aktivitätslöschung konnte nicht für die Kontosynchronisierung vorgemerkt werden:', error);
        alert('Die Aktivität wurde nicht gelöscht, da die kontoweite Löschung nicht sicher vorgemerkt werden konnte.');
        return;
    }
    if (state.selectedActivityForModal?.mergedGroupId) unmergeActivityGroup(state.selectedActivityForModal, state.rawActivities);
    state.rawActivities = state.rawActivities.filter(a => a.id !== id);
    state.selectedActivityForModal = null; saveDataToLocalStorage(); closeCSVDetailsModal(); refreshAll();
}

export function inferSport(name, rawType='') {
    const v = `${name||''} ${rawType||''}`.toLowerCase();
    if (/c2|canadier zweier/.test(v)) return 'C2';
    if (/c1|canadier einer/.test(v)) return 'C1';
    if (/paddel.?ergo|kayak.?erg|rowing.?erg/.test(v)) return 'PaddleErgo';
    if (/kajak|kayak|paddl|kanu|canoe|wildwasser|whitewater|k1/.test(v)) return 'Kayaking';
    if (/lauf|run|jog/.test(v)) return 'Run';
    if (/rad|bike|cycling|ride|rennrad/.test(v)) return 'Ride';
    if (/schwimm|swim/.test(v)) return 'Swim';
    if (/kraft|strength|gym|weight/.test(v)) return 'WeightTraining';
    return 'Workout';
}

function updateActivityRPEDisplay(act) {
    const valueEl = document.getElementById('activity-rpe-value');
    const descEl = document.getElementById('activity-rpe-description');
    const slider = document.getElementById('activity-rpe-slider');
    const rawRpe = act?.perceivedEffort;
    const hasRpe = rawRpe !== null && rawRpe !== undefined && rawRpe !== '';
    const rpe = hasRpe ? Number(rawRpe) : NaN;
    const labels = {0:'Keine Anstrengung',1:'Sehr leicht',2:'Leicht',3:'Leicht',4:'Etwas anstrengend',5:'Moderat',6:'Moderat',7:'Hart',8:'Sehr hart',9:'Sehr hart',10:'Maximal'};
    const valid = hasRpe && Number.isInteger(rpe) && rpe >= 0 && rpe <= 10;
    if (slider) slider.value = valid ? rpe : 5;
    if (valueEl) valueEl.textContent = valid ? rpe + '/10' : '—/10';
    if (descEl) descEl.textContent = valid ? labels[rpe] : 'Noch nicht bewertet';
}
export function updateActivityRPE(value) {
    const act = state.selectedActivityForModal;
    const rpe = Number(value);
    if (!act || !Number.isInteger(rpe) || rpe < 0 || rpe > 10) return;
    act.perceivedEffort = rpe;
    act.sRpeLoad = Number.isFinite(Number(act.duration)) && Number(act.duration) > 0 ? Number((Number(act.duration) * rpe).toFixed(0)) : null;
    saveDataToLocalStorage();
    updateActivityRPEDisplay(act);
    const panel = document.getElementById('activity-benefit-profile');
    if (panel) renderTrainingBenefitProfile(act);
    const insight = document.getElementById('activity-training-stimulus');
    if (insight) renderActivityTrainingInsights(act);
    refreshAll();
}
export function saveManualSportCorrection() {
    if (!state.selectedActivityForModal) return;
    const act = state.selectedActivityForModal;
    const name = document.getElementById('modal-edit-name').value.trim() || act.name;
    const type = document.getElementById('modal-edit-sport-select').value;
    const category = document.getElementById('modal-edit-type-select').value;
    const raceFormat = document.getElementById('modal-edit-race-format')?.value || '';
    const distanceRaw = document.getElementById('modal-edit-distance').value;
    const durationRaw = document.getElementById('modal-edit-duration').value;

    // Erst sämtliche Eingaben prüfen, danach den Datensatz verändern.
    // So bleiben Name, Sportart und Distanz unverändert, wenn z. B. die Dauer ungültig ist.
    let distance = null;
    if (distanceRaw !== '') {
        distance = Number(distanceRaw);
        if (!Number.isFinite(distance) || distance < 0 || distance > 1000) {
            alert('Bitte gib eine gültige Distanz zwischen 0 und 1000 km ein.');
            return;
        }
    }
    if (durationRaw === '') {
        alert('Bitte gib eine gültige Dauer ein.');
        return;
    }
    const duration = Number(durationRaw);
    if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
        alert('Bitte gib eine Dauer zwischen 1 und 1440 Minuten ein.');
        return;
    }

    act.name = name;
    act.type = type;
    if (type === 'C2') {
        const partner = (document.getElementById('activity-training-partner')?.value || '').trim().slice(0, 100);
        if (partner) act.trainingPartner = partner; else delete act.trainingPartner;
    }
    act.category = category;
    if (raceFormat === 'sprint' || raceFormat === 'classic') act.raceFormat = raceFormat;
    else delete act.raceFormat;
    if (distanceRaw === '') delete act.distance;
    else act.distance = distance;
    act.duration = duration;
    const rawRpe = act.perceivedEffort;
    const rpe = rawRpe === null || rawRpe === undefined || rawRpe === '' ? NaN : Number(rawRpe);
    if (Number.isInteger(rpe) && rpe >= 0 && rpe <= 10 && duration > 0) act.sRpeLoad = Number((duration * rpe).toFixed(0));
    else delete act.sRpeLoad;
    saveDataToLocalStorage();
    refreshAll();
    openCSVDetailsModal(encodeURIComponent(String(act.id)));
    document.getElementById('activity-edit-panel')?.classList.add('hidden');
}

function initializeActivityDetailTabs() {
    const modal = document.getElementById('csv-details-modal');
    const content = modal?.querySelector('.activity-detail-content');
    const overview = document.getElementById('activity-overview');
    if (!modal || !content || !overview || modal.dataset.activityTabsReady === 'true') return;

    // Analysebereiche vor dem Entfernen des alten Layout-Containers sichern.
    // Andernfalls werden RPE, HF-Zonen und weitere Panels mit dem Grid aus dem DOM gelöscht.
    const panelIds = [
        'activity-training-stimulus', 'activity-benefit-profile', 'activity-load-context-panel',
        'activity-intervals-panel', 'activity-canoe-panel', 'activity-route-map-panel',
        'activity-elevation-panel', 'activity-strength-analysis-panel', 'activity-recovery-panel',
        'activity-efficiency-panel', 'activity-comparison-panel', 'activity-ai-panel',
        'activity-telemetry-diagnostic-source', 'activity-rpe-panel', 'activity-zone-panel'
    ];
    const preservedPanels = new Map(panelIds
        .map(id => [id, document.getElementById(id)])
        .filter(([, element]) => !!element));

    // Die Detailansicht ist ein durchgehender Bericht statt mehrerer Registerkarten.
    const removeIds = ['activity-data-quality', 'activity-fit-data-panel'];
    removeIds.forEach(id => document.getElementById(id)?.remove());
    document.getElementById('activity-hr-series-status')?.remove();
    content.querySelector('.activity-detail-grid')?.remove();

    const rpe = preservedPanels.get('activity-rpe-panel');
    const metrics = document.getElementById('activity-sport-metrics');
    if (rpe && metrics) metrics.after(rpe);

    const telemetry = document.getElementById('activity-telemetry-panel');
    const zones = preservedPanels.get('activity-zone-panel');
    if (telemetry && !overview.contains(telemetry)) overview.appendChild(telemetry);
    if (zones) overview.appendChild(zones);

    const createAccordion = (id, title, panelIds) => {
        const details = document.createElement('details');
        details.className = 'activity-detail-accordion';
        details.dataset.activityAccordion = id;
        const summary = document.createElement('summary');
        summary.innerHTML = '<span>' + title + '</span><i data-lucide="chevron-down" aria-hidden="true"></i>';
        const body = document.createElement('div');
        body.className = 'activity-detail-accordion-body';
        panelIds.forEach(panelId => {
            const panel = preservedPanels.get(panelId) || document.getElementById(panelId);
            if (panel) body.appendChild(panel);
        });
        details.append(summary, body);
        content.appendChild(details);
        return details;
    };

    createAccordion('load', 'Trainingsbelastung', ['activity-training-stimulus', 'activity-benefit-profile', 'activity-load-context-panel']);
    createAccordion('intervals', 'Intervalle & Runden', ['activity-intervals-panel']);
    createAccordion('sport', 'Sportartspezifische Analyse', ['activity-canoe-panel', 'activity-route-map-panel', 'activity-elevation-panel', 'activity-strength-analysis-panel']);
    createAccordion('diagnostics', 'Weitere Leistungsanalysen & Datenprüfung', ['activity-recovery-panel', 'activity-efficiency-panel', 'activity-comparison-panel', 'activity-ai-panel', 'activity-telemetry-diagnostic-source']);

    // Bearbeitung bleibt außerhalb der Analysebereiche und wird über den Stift im Kopf geöffnet.
    const editPanel = document.getElementById('activity-edit-panel');
    if (editPanel && !content.contains(editPanel)) content.appendChild(editPanel);
    modal.dataset.activityTabsReady = 'true';
    try { globalThis.lucide?.createIcons?.(); } catch (_) {}
}

function activateActivityDetailTab() {
    // Rückwärtskompatibler No-op: Die neue Ansicht besitzt keine Tabs mehr.
}

function renderActivityDetailTabEmptyStates() {
    const groups = {
        load: ['activity-training-stimulus', 'activity-benefit-profile', 'activity-load-context-panel'],
        intervals: ['activity-intervals-panel'],
        sport: ['activity-canoe-panel', 'activity-route-map-panel', 'activity-elevation-panel', 'activity-strength-analysis-panel'],
        diagnostics: ['activity-recovery-panel', 'activity-efficiency-panel', 'activity-comparison-panel', 'activity-ai-panel', 'activity-telemetry-diagnostic-source']
    };
    Object.entries(groups).forEach(([key, ids]) => {
        const details = document.querySelector('[data-activity-accordion="' + key + '"]');
        if (!details) return;
        const hasContent = ids.some(id => {
            const panel = document.getElementById(id);
            return panel && !panel.classList.contains('hidden') && (panel.textContent || '').trim().length > 0;
        });
        details.hidden = !hasContent;
    });
}

function renderActivityDetailNavigation(act) {
    const ordered = getVisibleActivities(state.rawActivities || []).sort((a, b) =>
        String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.startTime || a.startTimeLocal || '').localeCompare(String(b.startTime || b.startTimeLocal || '')) ||
        String(a.id).localeCompare(String(b.id))
    );
    const index = ordered.findIndex(item => String(item.id) === String(act.id));
    const previous = ordered[index - 1], next = ordered[index + 1];
    const prev = document.getElementById('activity-detail-previous');
    const nxt = document.getElementById('activity-detail-next');
    if (prev) { prev.disabled = !previous; prev.onclick = () => previous && openCSVDetailsModal(encodeURIComponent(String(previous.id))); }
    if (nxt) { nxt.disabled = !next; nxt.onclick = () => next && openCSVDetailsModal(encodeURIComponent(String(next.id))); }
}

export function saveActivityWaterConditions() {
    const act = state.selectedActivityForModal;
    const selectedType = document.getElementById('modal-edit-sport-select')?.value || act?.type;
    if (!act || !CANOE_ON_WATER_TYPES.has(selectedType)) return;
    const levelRaw = document.getElementById('activity-water-level')?.value ?? '';
    const dischargeRaw = document.getElementById('activity-water-discharge')?.value ?? '';
    const level = levelRaw === '' ? null : Number(levelRaw);
    const discharge = dischargeRaw === '' ? null : Number(dischargeRaw);
    if ((level !== null && (!Number.isFinite(level) || level < 0)) ||
        (discharge !== null && (!Number.isFinite(discharge) || discharge < 0))) {
        alert('Pegel und Abfluss müssen gültige, nicht negative Zahlen sein.');
        return;
    }
    const note = (document.getElementById('activity-water-note')?.value || '').trim().slice(0, 200);
    const waterTypeValue = document.getElementById('activity-water-type')?.value || '';
    const waterType = ['flatwater', 'wildwater'].includes(waterTypeValue) ? waterTypeValue : null;
    if (level === null && discharge === null && !note && !waterType) delete act.waterConditions;
    else act.waterConditions = {
        ...(level !== null ? { level, levelUnit: document.getElementById('activity-water-level-unit')?.value === 'm' ? 'm' : 'cm' } : {}),
        ...(discharge !== null ? { discharge } : {}),
        ...(note ? { note } : {}),
        ...(waterType ? { type: waterType } : {})
    };
    saveDataToLocalStorage();
    renderActivityWaterConditionStatus(act);
    refreshAll();
}
function renderActivityWaterConditionStatus(act) {
    const status = document.getElementById('activity-water-save-status');
    if (!status) return;
    const water = act?.waterConditions || {};
    const values = [];
    if (water.level != null) values.push('Pegel: ' + water.level + ' ' + (water.levelUnit || 'cm'));
    if (water.discharge != null) values.push('Abfluss: ' + water.discharge + ' m³/s');
    if (water.type) values.push(water.type === 'wildwater' ? 'Wildwasser' : 'Flachwasser');
    status.textContent = values.length ? 'Gespeichert · ' + values.join(' · ') : 'Keine Wasserbedingungen dokumentiert.';
}

export function closeCSVDetailsModal() {
    state.activitySelectedLap = null;
    if (state.activityRouteMap) { state.activityRouteMap.remove(); state.activityRouteMap = null; }
    const modal = document.getElementById('csv-details-modal');
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    document.body.classList.remove('activity-detail-open');
    state.selectedActivityForModal = null;
    if (activityDetailReturnFocus?.isConnected) activityDetailReturnFocus.focus();
    activityDetailReturnFocus = null;
}

export function inferCategory(name='',type='') {
    const v=`${name} ${type}`.toLowerCase();
    if(/wettkampf|race|regatta|rennen/.test(v))return 'race';
    if(/intervall|interval|vo2|max|schwelle|threshold|sprint/.test(v))return 'interval';
    if(/regeneration|recovery|locker|easy/.test(v))return 'reg';
    if(/kraft|strength|gym|weights/.test(v))return 'strength';
    if(/technik|drill|techniktraining/.test(v))return 'tech';
    return 'ga';
}


function renderTrainingBenefitProfile(act) {
    const panel = document.getElementById('activity-benefit-profile');
    if (!panel) return;
    const zoneConfig = getActivityZoneConfig(act);
    const zoneTime = calculateActivityZoneTime(act, zoneConfig);
    const zoneSeconds = zoneTime?.seconds || [0, 0, 0, 0, 0];
    const totalSeconds = zoneTime?.totalSeconds || 0;
    const rawRpe = act.perceivedEffort;
    const rpe = rawRpe === null || rawRpe === undefined || rawRpe === '' ? NaN : Number(rawRpe);
    const hasRpe = Number.isInteger(rpe) && rpe >= 0 && rpe <= 10;
    const rows = totalSeconds > 0 ? [
        ['Niedrige Intensität', zoneSeconds[0] + zoneSeconds[1]], ['Mittlere Intensität', zoneSeconds[1] + zoneSeconds[2]],
        ['Hohe Intensität', zoneSeconds[2] + zoneSeconds[3]], ['Sehr hohe Intensität', zoneSeconds[3] + zoneSeconds[4]]
    ] : [];
    const colors = ['#38bdf8', '#34d399', '#facc15', '#fb923c'];
    const profile = rows.map(([label, seconds], i) => {
        const score = Math.round(seconds / totalSeconds * 100);
        const mins = Math.round(seconds / 60);
        return `<div class="space-y-1"><div class="flex justify-between gap-2 text-xs"><span class="text-slate-300">${label}</span><strong class="text-white tabular-nums">${score}%</strong></div><div class="h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${score}%;background:${colors[i]}"></div></div><div class="text-[10px] text-slate-500">${mins} min</div></div>`;
    }).join('');
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="space-y-3">
        ${profile ? `<div class="space-y-3">${profile}</div>` : '<p class="text-xs text-slate-400">Keine auswertbaren HF-Daten.</p>'}
        <div class="grid grid-cols-2 gap-2">
            <div class="rounded-lg bg-slate-900 p-2"><div class="text-[10px] text-slate-500">Dauer</div><div class="text-xs text-white font-semibold">${Number.isFinite(Number(act.duration)) && Number(act.duration) > 0 ? Math.round(Number(act.duration)) + ' min' : '—'}</div></div>
            <div class="rounded-lg bg-slate-900 p-2"><div class="text-[10px] text-slate-500">RPE</div><div class="text-xs text-white font-semibold">${hasRpe ? rpe + '/10' : '—'}</div></div>
        </div>
        <details class="text-[10px] text-slate-500"><summary class="cursor-pointer">Hinweise zur Einordnung</summary><p class="mt-2">Die Prozentwerte zeigen den Anteil der erfassten HF-Zeit in den zugeordneten Zonen. Sie sind keine Wahrscheinlichkeit für Leistungssteigerung. Der EA-HF-Load ist ein eigener gewichteter Zonenindex und nicht mit TSS gleichzusetzen.</p></details>
    </div>`;
}
