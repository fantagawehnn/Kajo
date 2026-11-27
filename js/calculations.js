/* ============================================================
 * calculations.js – Trainingsbelastung und Belastungstrends
 * Fehlende Tage werden nur innerhalb erfolgreich synchronisierter
 * Garmin-Aktivitätszeiträume als Ruhetage interpretiert.
 * ============================================================ */
import { getTrainingLoadData } from './training-load.js?v=7';

function activityDateKey(value) {
    if (typeof value !== 'string') return '';
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
}

function validCoverageRanges(settings) {
    return (Array.isArray(settings?.garminActivityCoverageRanges)
        ? settings.garminActivityCoverageRanges : [])
        .filter(range => /^\d{4}-\d{2}-\d{2}$/.test(range?.startDate || '')
            && /^\d{4}-\d{2}-\d{2}$/.test(range?.endDate || '')
            && range.startDate <= range.endDate
            && range.status === 'complete');
}

function toLocalDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isDateCovered(date, ranges) {
    return ranges.some(range => date >= range.startDate && date <= range.endDate);
}

export function computePerformanceTimeline(records, settings, profile, dailyCheckins = {}) {
    const list = Array.isArray(records) ? records : [];
    const loadData = getTrainingLoadData(list, settings, profile, dailyCheckins);

    // Confirmed Garmin coverage allows empty days to count as rest days.
    // Without coverage, still expose measured activity-day loads, but leave
    // all unobserved days unknown and do not calculate CTL/ATL across them.
    const ranges = validCoverageRanges(settings);
    // Use every recorded activity date as an anchor, including activities whose load
    // is unavailable. Otherwise a history containing only incomplete activities
    // disappears entirely instead of exposing its data-quality gaps.
    const activityDates = list.map(activity => activityDateKey(activity?.date)).filter(Boolean);
    const startKeys = [...ranges.map(range => range.startDate), ...activityDates].sort();
    if (!startKeys.length) return [];
    const start = new Date(startKeys[0] + 'T12:00:00');
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    if (!Number.isFinite(start.getTime())) return [];

    const dailyLoad = {};
    const activityCountByDate = {};
    const loadActivityCountByDate = {};
    const estimatedLoadCountByDate = {};

    list.forEach(activity => {
        const date = activityDateKey(activity?.date);
        if (!date) return;
        // Every recorded activity prevents a false confirmed-rest day.
        // In Garmin mode, non-Garmin activities have no eligible measured load
        // and therefore make the day incomplete instead of silently disappearing.
        activityCountByDate[date] = (activityCountByDate[date] || 0) + 1;
    });

    loadData.records.forEach(item => {
        const date = activityDateKey(item.activity?.date);
        if (!date) return;
        dailyLoad[date] = (dailyLoad[date] || 0) + item.value;
        loadActivityCountByDate[date] = (loadActivityCountByDate[date] || 0) + 1;
        if (item.source === 'manual-estimate') {
            estimatedLoadCountByDate[date] = (estimatedLoadCountByDate[date] || 0) + 1;
        }
    });

    let ctl = 0, atl = 0, modelActive = false, segmentDays = 0, segmentHasEstimatedLoad = false;
    const kCtl = 1 - Math.exp(-1 / 42), kAtl = 1 - Math.exp(-1 / 7);
    const timeline = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const covered = isDateCovered(dateStr, ranges);
        const activityCount = activityCountByDate[dateStr] || 0;
        const loadedCount = loadActivityCountByDate[dateStr] || 0;
        let dayLoad = null;
        let dayStatus = 'unknown';

        if (covered && activityCount === 0) {
            // Only a successfully synchronized activity-list range proves a rest day.
            dayLoad = 0;
            dayStatus = 'confirmed-rest';
        } else if (activityCount > 0 && loadedCount === activityCount) {
            // The current local day is still in progress; its daily total cannot
            // be treated as complete until the activity-list range is confirmed.
            if (covered) {
                dayLoad = dailyLoad[dateStr] || 0;
                dayStatus = 'complete';
            } else if (dateStr !== toLocalDateKey(new Date())) {
                dayLoad = dailyLoad[dateStr] || 0;
                dayStatus = 'activity-load-only';
            }
        } else if (activityCount > 0) {
            dayStatus = 'incomplete-activity-load';
        }

        if (dayStatus === 'activity-load-only'
            && !['garmin-zone', 'garmin-native'].includes(loadData.mode)) {
            // Keep non-Garmin/sRPE behaviour conservative when activity-list
            // coverage is missing: expose the session load but do not infer
            // the day's total or advance the model.
            ctl = 0;
            atl = 0;
            modelActive = false;
            segmentDays = 0;
            segmentHasEstimatedLoad = false;
            timeline.push({
                date: dateStr, load: Number(dayLoad.toFixed(1)), tss: Number(dayLoad.toFixed(1)),
                activityCount, loadActivityCount: loadedCount,
                loadMode: loadData.mode, loadUnit: loadData.unit, loadCoverage: loadData.coverage || null,
                dataStatus: dayStatus, ctl: null, atl: null, tsb: null, formPct: null, acwr: null,
                statusLabel: 'Tagesload vorhanden · Tagesabdeckung unbestätigt', isProvisional: true
            });
            continue;
        }

        if (dayStatus === 'activity-load-only') {
            // Garmin load is measured for every recorded activity on this day,
            // but the activity-list coverage is not confirmed. Advance CTL/ATL
            // provisionally with the known load (never add a rest-day zero).
            // Any subsequent unknown day still breaks the model chain below.
            if (!modelActive) {
                ctl = 0;
                atl = 0;
                modelActive = true;
                segmentDays = 0;
                segmentHasEstimatedLoad = false;
            }
            if (estimatedLoadCountByDate[dateStr]) segmentHasEstimatedLoad = true;
            ctl += (dayLoad - ctl) * kCtl;
            atl += (dayLoad - atl) * kAtl;
            segmentDays++;
            const ctlDisplay = Number(ctl.toFixed(1));
            const atlDisplay = Number(atl.toFixed(1));
            const form = ctlDisplay - atlDisplay;
            const formPct = ctlDisplay > 0 ? form / ctlDisplay * 100 : null;
            timeline.push({
                date: dateStr, tss: Number(dayLoad.toFixed(1)), load: Number(dayLoad.toFixed(1)),
                activityCount, loadActivityCount: loadedCount,
                loadMode: loadData.mode, loadUnit: loadData.unit, loadCoverage: loadData.coverage || null,
                dataStatus: dayStatus, ctl: ctlDisplay, atl: atlDisplay,
                tsb: Number(form.toFixed(1)), formPct: formPct === null ? null : Number(formPct.toFixed(1)),
                acwr: null, statusLabel: segmentHasEstimatedLoad ? 'Vorläufig · enthält manuelle Load-Schätzung' : 'Vorläufig · Tagesabdeckung unbestätigt', estimatedLoadCount: estimatedLoadCountByDate[dateStr] || 0, isProvisional: true
            });
            continue;
        }

        if (dayLoad === null) {
            // A gap breaks the EWMA chain. Do not carry a falsely precise CTL/ATL
            // through days whose total load is unknown.
            ctl = 0;
            atl = 0;
            modelActive = false;
            segmentDays = 0;
            segmentHasEstimatedLoad = false;
            timeline.push({
                date: dateStr, load: null, tss: null, activityCount, loadActivityCount: loadedCount,
                loadMode: loadData.mode, loadUnit: loadData.unit, loadCoverage: loadData.coverage || null,
                dataStatus: dayStatus, ctl: null, atl: null, tsb: null, formPct: null, acwr: null,
                statusLabel: 'Nicht berechenbar', isProvisional: true
            });
            continue;
        }

        if (!modelActive) {
            ctl = 0;
            atl = 0;
            modelActive = true;
            segmentDays = 0;
            segmentHasEstimatedLoad = false;
        }
        if (estimatedLoadCountByDate[dateStr]) segmentHasEstimatedLoad = true;
        ctl += (dayLoad - ctl) * kCtl;
        atl += (dayLoad - atl) * kAtl;
        segmentDays++;

        const ctlDisplay = Number(ctl.toFixed(1));
        const atlDisplay = Number(atl.toFixed(1));
        const form = ctlDisplay - atlDisplay;
        const formPct = ctlDisplay > 0 ? form / ctlDisplay * 100 : null;
        const ratio = segmentDays >= 42 && ctl > 0 ? atl / ctl : null;
        const isGarmin = loadData.mode === 'garmin-native' || loadData.mode === 'garmin-zone';
        let statusLabel = loadData.mode === 'srpe' ? 'Modellwert'
            : loadData.mode === 'garmin-unavailable' ? 'Keine Load-Quelle' : 'Ausgeglichen';
        const statusValue = isGarmin ? formPct : form;
        if (loadData.mode !== 'srpe' && loadData.mode !== 'garmin-unavailable') {
            if (isGarmin && formPct === null) statusLabel = 'Keine relative Basis';
            else if (statusValue < (isGarmin ? -25 : -30)) statusLabel = 'Hohe Ermüdung';
            else if (statusValue < -10) statusLabel = 'Belastung';
            else if (statusValue <= 5) statusLabel = 'Ausgeglichen';
            else if (statusValue <= (isGarmin ? 20 : 25)) statusLabel = 'Frisch';
            else statusLabel = 'Tapering';
        }

        timeline.push({
            date: dateStr, tss: Number(dayLoad.toFixed(1)), load: Number(dayLoad.toFixed(1)),
            activityCount, loadActivityCount: loadedCount,
            loadMode: loadData.mode, loadUnit: loadData.unit, loadCoverage: loadData.coverage || null,
            dataStatus: dayStatus, ctl: ctlDisplay, atl: atlDisplay,
            tsb: Number(form.toFixed(1)), formPct: formPct === null ? null : Number(formPct.toFixed(1)),
            acwr: ratio === null ? null : Number(ratio.toFixed(2)),
            statusLabel: segmentHasEstimatedLoad ? 'Vorläufig · enthält manuelle Load-Schätzung' : statusLabel,
            estimatedLoadCount: estimatedLoadCountByDate[dateStr] || 0,
            isProvisional: segmentDays < 126 || segmentHasEstimatedLoad
        });
    }
    return timeline;
}


/**
 * Activity-level strength summary. Volume is returned only when every set
 * has documented repetitions and weight; missing set data is never zero-filled.
 */
export function calculateStrengthActivitySummary(exercises) {
    if (!Array.isArray(exercises)) return { exerciseCount: 0, setCount: 0, volume: null, volumeComplete: false };
    const entries = exercises.filter(exercise => exercise && Array.isArray(exercise.sets));
    const sets = entries.flatMap(exercise => exercise.sets);
    const completeSets = sets.filter(set => {
        const reps = Number(set?.reps);
        const weight = Number(set?.weight);
        return set?.reps !== null && set?.reps !== undefined && set?.reps !== ''
            && set?.weight !== null && set?.weight !== undefined && set?.weight !== ''
            && Number.isInteger(reps) && reps > 0 && Number.isFinite(weight) && weight >= 0;
    });
    const volumeComplete = sets.length > 0 && completeSets.length === sets.length;
    const volume = volumeComplete
        ? Number(completeSets.reduce((sum, set) => sum + Number(set.weight) * Number(set.reps), 0).toFixed(1))
        : null;
    return { exerciseCount: entries.length, setCount: sets.length, volume, volumeComplete };
}
