import { state } from './state.js';
import { loadPersonalPreferences, savePersonalPreferences } from './personal-preferences.js?v=1';
import { applyAnalysisOverviewPreferences } from './analysis-overview.js?v=4';

export const ANALYSIS_SECTIONS = [
    { id: 'trend', label: 'Verlauf' },
    { id: 'distribution', label: 'Trainingsverteilung' },
    { id: 'period', label: 'Zeitraum-Bilanz' }
];
export const ANALYSIS_METRICS = [
    { id: 'load', label: 'Load' },
    { id: 'recovery', label: 'Recovery · HRV' },
    { id: 'performance', label: 'Fitness · VO₂max' }
];
export const ANALYSIS_PERIODS = ['7d', '28d', '3m', '6m', '1y'];

export function normalizeAnalysisPreferences(value) {
    const ids = ANALYSIS_SECTIONS.map(item => item.id);
    const candidate = Array.isArray(value?.order) ? value.order : [];
    const order = [...new Set(candidate.filter(id => ids.includes(id))), ...ids.filter(id => !candidate.includes(id))];
    const visible = Object.fromEntries(ids.map(id => [id, value?.visible?.[id] !== false]));
    const metrics = Object.fromEntries(ANALYSIS_METRICS.map(item => [item.id, value?.metrics?.[item.id] !== false]));
    if (!Object.values(metrics).some(Boolean)) metrics.load = true;
    const period = ANALYSIS_PERIODS.includes(value?.defaultPeriod) ? value.defaultPeriod : '3m';
    const activityMeasure = ['duration', 'sessions'].includes(value?.activityMeasure) ? value.activityMeasure : 'duration';
    return { order, visible, metrics, defaultPeriod: period, activityMeasure };
}
function readPreferences() {
    return normalizeAnalysisPreferences(loadPersonalPreferences().analysis);
}
function writePreferences(value) {
    const all = loadPersonalPreferences();
    all.analysis = normalizeAnalysisPreferences(value);
    savePersonalPreferences(all);
    return all.analysis;
}
function applySections(preferences) {
    const root = document.getElementById('analysis-overview-content');
    if (!root) return;
    const sections = new Map(ANALYSIS_SECTIONS.map(item => [item.id, item]));
    for (const id of preferences.order) {
        const section = sections.get(id);
        const element = section && document.getElementById('analysis-overview-section-' + id);
        if (!element) continue;
        element.classList.toggle('hidden', !preferences.visible[id]);
        root.appendChild(element);
    }
}
export function applyAnalysisCustomization() {
    const preferences = readPreferences();
    applySections(preferences);
    applyAnalysisOverviewPreferences(preferences.metrics, preferences.activityMeasure);
}
function renderEditor() {
    const list = document.getElementById('analysis-customization-list');
    if (!list) return;
    const preferences = readPreferences();
    list.innerHTML = preferences.order.map((id, index) => {
        const section = ANALYSIS_SECTIONS.find(item => item.id === id);
        return `<li class="kajo-dashboard-custom-row" data-analysis-custom-row="${id}">
          <label><input type="checkbox" data-analysis-visible="${id}" ${preferences.visible[id] ? 'checked' : ''}><span>${section.label}</span></label>
          <span class="kajo-dashboard-custom-actions">
            <button type="button" data-analysis-move="up" aria-label="${section.label} nach oben" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" data-analysis-move="down" aria-label="${section.label} nach unten" ${index === preferences.order.length - 1 ? 'disabled' : ''}>↓</button>
          </span>
        </li>`;
    }).join('');
    const metrics = document.getElementById('analysis-customization-metrics');
    if (metrics) metrics.innerHTML = ANALYSIS_METRICS.map(item =>
        `<label class="kajo-dashboard-custom-metric"><input type="checkbox" data-analysis-metric="${item.id}" ${preferences.metrics[item.id] ? 'checked' : ''}><span>${item.label}</span></label>`
    ).join('');
    const period = document.getElementById('analysis-customization-period');
    if (period) period.value = preferences.defaultPeriod;
    const measure = document.getElementById('analysis-customization-activity');
    if (measure) measure.value = preferences.activityMeasure;
}
export function openAnalysisCustomization() {
    renderEditor();
    const modal = document.getElementById('analysis-customization-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}
export function closeAnalysisCustomization() {
    const modal = document.getElementById('analysis-customization-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
}
export function saveAnalysisCustomization() {
    const list = document.getElementById('analysis-customization-list');
    if (!list) return;
    const order = [...list.querySelectorAll('[data-analysis-custom-row]')].map(row => row.dataset.analysisCustomRow);
    const visible = Object.fromEntries(ANALYSIS_SECTIONS.map(item => {
        const input = list.querySelector('[data-analysis-visible="' + item.id + '"]');
        return [item.id, input ? input.checked : true];
    }));
    const metrics = Object.fromEntries(ANALYSIS_METRICS.map(item => {
        const input = document.querySelector('[data-analysis-metric="' + item.id + '"]');
        return [item.id, input ? input.checked : true];
    }));
    if (!Object.values(metrics).some(Boolean)) {
        const first = document.querySelector('[data-analysis-metric="load"]');
        if (first) first.checked = true;
        metrics.load = true;
    }
    writePreferences({
        order, visible, metrics,
        defaultPeriod: document.getElementById('analysis-customization-period')?.value,
        activityMeasure: document.getElementById('analysis-customization-activity')?.value
    });
    applyAnalysisCustomization();
    closeAnalysisCustomization();
}
export function resetAnalysisCustomization() {
    writePreferences({});
    applyAnalysisCustomization();
    renderEditor();
}
export function initializeAnalysisCustomization() {
    const list = document.getElementById('analysis-customization-list');
    if (!list || list.dataset.initialized === 'true') return;
    list.dataset.initialized = 'true';
    list.addEventListener('click', event => {
        const button = event.target.closest('[data-analysis-move]');
        if (!button || button.disabled) return;
        const row = button.closest('[data-analysis-custom-row]');
        const sibling = button.dataset.analysisMove === 'up' ? row?.previousElementSibling : row?.nextElementSibling;
        if (!row || !sibling) return;
        if (button.dataset.analysisMove === 'up') list.insertBefore(row, sibling);
        else list.insertBefore(sibling, row);
        list.querySelectorAll('[data-analysis-custom-row]').forEach((item, index, rows) => {
            item.querySelector('[data-analysis-move="up"]').disabled = index === 0;
            item.querySelector('[data-analysis-move="down"]').disabled = index === rows.length - 1;
        });
    });
    const period = readPreferences().defaultPeriod;
    state.activeTimeframe = period;
    state.metricHistoryRange = period;
}
if (typeof window !== 'undefined') {
    window.openAnalysisCustomization = openAnalysisCustomization;
    window.closeAnalysisCustomization = closeAnalysisCustomization;
    window.saveAnalysisCustomization = saveAnalysisCustomization;
    window.resetAnalysisCustomization = resetAnalysisCustomization;
}
