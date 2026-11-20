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
