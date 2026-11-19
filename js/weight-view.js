import { state } from './state.js';
import { saveDataToLocalStorage } from './storage.js?v=5';

let weightChart = null;

function validWeight(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
}

function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function mean(values) {
    const valid = values.filter(weight => Number.isFinite(weight));
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function shiftDate(dateString, days) {
    const date = new Date(dateString + 'T12:00:00');
    date.setDate(date.getDate() + days);
    return dateKey(date);
}

function formatWeight(value) {
    return Number.isFinite(value) ? Number(value).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
}

export function buildWeightViewData(checkins = {}, endDate = dateKey(new Date()), days = 90) {
    const dates = [];
    const first = shiftDate(endDate, -(days - 1));
    for (let index = 0; index < days; index++) dates.push(shiftDate(first, index));

    const manual = dates.map(date => validWeight(checkins?.[date]?.weight) ? Number(checkins[date].weight) : null);
    const garmin = dates.map(date => validWeight(checkins?.[date]?.garminWeight) ? Number(checkins[date].garminWeight) : null);
    const movingAverage = manual.map((_, index) => mean(manual.slice(Math.max(0, index - 6), index + 1)));

    const currentFrom = shiftDate(endDate, -6);
    const previousFrom = shiftDate(endDate, -13);
    const previousTo = shiftDate(endDate, -7);
    const valuesBetween = (from, to) => Object.entries(checkins || {})
        .filter(([date, row]) => date >= from && date <= to && validWeight(row?.weight))
        .map(([, row]) => Number(row.weight));

    const currentValues = valuesBetween(currentFrom, endDate);
    const previousValues = valuesBetween(previousFrom, previousTo);
    const latestIndex = manual.map((value, index) => value === null ? -1 : index).filter(index => index >= 0).at(-1);

    return {
        dates,
        manual,
        garmin,
        movingAverage,
        latestManual: latestIndex >= 0 ? { date: dates[latestIndex], value: manual[latestIndex] } : null,
        currentWeekAverage: mean(currentValues),
        previousWeekAverage: mean(previousValues),
        currentWeekCount: currentValues.length,
        previousWeekCount: previousValues.length,
        manualCount: manual.filter(validWeight).length,
        garminCount: garmin.filter(validWeight).length
    };
}

export function renderWeightView() {
    const root = document.getElementById('kajo-weight-view');
    if (!root) return;

    const target = validWeight(state.profile?.weightTargetKg) ? Number(state.profile.weightTargetKg) : null;
    const targetInput = document.getElementById('kajo-weight-target');
    if (targetInput && document.activeElement !== targetInput) targetInput.value = target === null ? '' : String(target);

    const data = buildWeightViewData(state.dailyCheckins || {});
    const latest = document.getElementById('kajo-weight-latest');
    const weekly = document.getElementById('kajo-weight-weekly');
    const trend = document.getElementById('kajo-weight-trend');
    const latestDate = document.getElementById('kajo-weight-latest-date');
    const count = document.getElementById('kajo-weight-count');
    if (latest) latest.textContent = data.latestManual ? formatWeight(data.latestManual.value) + ' kg' : '—';
    if (latestDate) latestDate.textContent = data.latestManual
        ? 'Letzte manuelle Messung · ' + new Date(data.latestManual.date + 'T12:00:00').toLocaleDateString('de-DE')
        : 'Noch keine manuelle Messung';
    if (weekly) weekly.textContent = data.currentWeekAverage === null ? '—' : formatWeight(data.currentWeekAverage) + ' kg';
    if (trend) {
        if (data.currentWeekAverage === null || data.previousWeekAverage === null) trend.textContent = 'Vorwochenvergleich noch nicht verfügbar';
        else {
            const delta = data.currentWeekAverage - data.previousWeekAverage;
            trend.textContent = (delta > 0 ? '+' : '') + formatWeight(delta) + ' kg gegenüber der Vorwoche';
        }
    }
    if (count) count.textContent = data.manualCount + ' manuelle Messungen · ' + data.garminCount + ' Garmin-Messungen in 90 Tagen';

    const canvas = document.getElementById('kajo-weight-chart');
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    if (!canvas || typeof Chart !== 'function') return;

    const labels = data.dates.map(date => new Date(date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
    const datasets = [
        {
            label: '7-Tage-Mittel (manuell)',
            data: data.movingAverage,
            borderColor: '#E94B8B',
            backgroundColor: 'transparent',
            borderWidth: 3,
            pointRadius: 0,
            tension: 0.2,
            spanGaps: false
        },
        {
            label: 'Manuelle Messung',
            data: data.manual,
            borderColor: '#E94B8B',
            backgroundColor: '#E94B8B',
            showLine: false,
            pointRadius: 4,
            pointHoverRadius: 6
        },
        {
            label: 'Garmin-Messung',
            data: data.garmin,
            borderColor: '#64748B',
            backgroundColor: '#64748B',
            showLine: false,
            pointStyle: 'rectRot',
            pointRadius: 4,
            pointHoverRadius: 6
        }
    ];
    if (target !== null) datasets.push({
        label: 'Zielwert',
        data: data.dates.map(() => target),
        borderColor: '#94A3B8',
        backgroundColor: 'transparent',
        borderDash: [6, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0
    });

    weightChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, labels: { color: '#94A3B8', usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
                tooltip: { callbacks: { label: item => item.dataset.label + ': ' + formatWeight(item.parsed.y) + ' kg' } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94A3B8', maxTicksLimit: 8, maxRotation: 0 } },
                y: { grid: { color: 'rgba(148,163,184,.12)' }, ticks: { color: '#94A3B8', callback: value => formatWeight(value) + ' kg' } }
            }
        }
    });
}

export async function saveWeightTarget() {
    const input = document.getElementById('kajo-weight-target');
    const status = document.getElementById('kajo-weight-target-status');
    if (!input) return;
    const raw = input.value.trim();
    const nextValue = raw === '' ? null : Number(raw);
    if (nextValue !== null && (!Number.isFinite(nextValue) || nextValue < 20 || nextValue > 300)) {
        if (status) status.textContent = 'Bitte gib einen Zielwert zwischen 20 und 300 kg ein.';
        return;
    }

    const previousProfile = state.profile || {};
    const nextProfile = { ...previousProfile };
    if (nextValue === null) delete nextProfile.weightTargetKg;
    else nextProfile.weightTargetKg = nextValue;
    state.profile = nextProfile;

    if (saveDataToLocalStorage() !== true) {
        state.profile = previousProfile;
        if (status) status.textContent = 'Der Zielwert konnte nicht gespeichert werden. Bitte melde dich erneut an.';
        return;
    }

    if (status) status.textContent = 'Zielwert wird gespeichert …';
    const cloudSaved = await new Promise(resolve => {
        window.dispatchEvent(new CustomEvent('endurance:data-save-immediate', { detail: { resolve } }));
    });
    if (status) status.textContent = cloudSaved
        ? (nextValue === null ? 'Zielwert entfernt.' : 'Zielwert gespeichert.')
        : 'Lokal gespeichert; Cloud-Synchronisierung fehlgeschlagen. Bitte später erneut synchronisieren.';
    renderWeightView();
}
