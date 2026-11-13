/* ============================================================
 * calculations.js – Trainingsbelastung und Belastungstrends
 * Garmin-Daten haben Vorrang; externe TSS-Werte werden niemals mit
 * Garmin-eigenen oder Endurance-AI-Load-Punkten vermischt.
 * ============================================================ */
import { getTrainingLoadData } from './training-load.js';

function activityDateKey(value) {
    if (typeof value !== 'string') return '';
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
}

export function computePerformanceTimeline(records, settings, profile) {
    if (!records || records.length === 0) return [];
    const loadData = getTrainingLoadData(records, settings, profile);
    if (!loadData.records.length) return [];
    const valid = loadData.records.filter(item => item.activity.date);
    if (!valid.length) return [];
    // Start the timeline at the earliest dated activity, not only at the first
    // activity with calculable load. This keeps earlier activities visible in
    // the load-coverage denominator even when their load cannot be calculated.
    const dates = records
        .map(activity => activityDateKey(activity?.date))
        .filter(Boolean)
        .map(dateKey => new Date(`${dateKey}T12:00:00`))
        .filter(date => Number.isFinite(date.getTime()))
        .sort((a,b)=>a-b);
    if (!dates.length) return [];
    const start = new Date(dates[0]), end = new Date();
    const dailyLoad = {};
    const activityCountByDate = {};
    const loadActivityCountByDate = {};
    records.forEach(activity => {
        const date = activityDateKey(activity?.date);
        if (date) activityCountByDate[date] = (activityCountByDate[date] || 0) + 1;
    });
    valid.forEach(item => {
        const date = activityDateKey(item.activity.date);
        if (!date) return;
        dailyLoad[date] = (dailyLoad[date] || 0) + item.value;
        loadActivityCountByDate[date] = (loadActivityCountByDate[date] || 0) + 1;
    });
    let ctl = 0, atl = 0;
    const kCtl = 1 - Math.exp(-1 / 42), kAtl = 1 - Math.exp(-1 / 7);
    const timeline = [];
    let elapsedDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const load = dailyLoad[dateStr] || 0;
        // Update CTL/ATL first, then derive all same-day values from
        // the same end-of-day state.
        ctl += (load - ctl) * kCtl;
        atl += (load - atl) * kAtl;
        const ctlDisplay = Number(ctl.toFixed(1));
        const atlDisplay = Number(atl.toFixed(1));
        const form = ctlDisplay - atlDisplay;
        const formPct = ctlDisplay > 0 ? form / ctlDisplay * 100 : null;
        const ratio = elapsedDays >= 42 && ctl > 0 ? atl / ctl : null;
        let statusLabel = loadData.mode === 'srpe' ? 'Modellwert' : 'Ausgeglichen';
        const isGarmin = loadData.mode.startsWith('garmin');
        const statusValue = isGarmin ? formPct : form;
        const isProvisional = elapsedDays < 126;
        if (loadData.mode !== 'srpe') {
            if (isGarmin && formPct === null) statusLabel = 'Keine relative Basis';
            else if (statusValue < (isGarmin ? -25 : -30)) statusLabel = 'Hohe Ermüdung';
            else if (statusValue < -10) statusLabel = 'Belastung';
            else if (statusValue <= 5) statusLabel = 'Ausgeglichen';
            else if (statusValue <= (isGarmin ? 20 : 25)) statusLabel = 'Frisch';
            else statusLabel = 'Tapering';
        }
        timeline.push({
            date: dateStr, tss: Number(load.toFixed(1)), load: Number(load.toFixed(1)),
            activityCount: activityCountByDate[dateStr] || 0,
            loadActivityCount: loadActivityCountByDate[dateStr] || 0,
            loadMode: loadData.mode, loadUnit: loadData.unit, loadCoverage: loadData.coverage || null,
            ctl: ctlDisplay, atl: atlDisplay,
            tsb: Number(form.toFixed(1)), formPct: formPct === null ? null : Number(formPct.toFixed(1)),
            acwr: ratio === null ? null : Number(ratio.toFixed(2)), statusLabel, isProvisional
        });
        elapsedDays++;
    }
    return timeline;
}
