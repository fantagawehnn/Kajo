/**
 * KAJO – gemeinsame, transparente Zonendefinitionen.
 *
 * Die Zonen unterscheiden individuelle Referenzbereiche von modellbasierten
 * Orientierungszonen. Sie sind keine medizinischen Grenzwerte oder Trainingsfreigaben.
 */
const valid = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value));

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sd(values, average) {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function readinessZone(score) {
  if (!valid(score)) return { status: 'info', label: 'Keine ausreichende Datenbasis' };
  const value = Number(score);
  if (value >= 80) return { status: 'good', zone: 5, label: 'Günstige Tagesform' };
  if (value >= 65) return { status: 'good', zone: 4, label: 'Im Orientierungsbereich' };
  if (value >= 45) return { status: 'attention', zone: 2, label: 'Vorsichtig beobachten' };
  return { status: 'critical', zone: 1, label: 'Deutlich eingeschränkter Orientierungswert' };
}

/**
 * Individual reference bands from the preceding 28 days.
 * At least twelve observations are required. The scale uses 1.4826*MAD,
 * with a half-SD and metric-specific floor as robust fallbacks.
 */
export function classifyPersonalMetric(key, value, historyValues) {
  const values = (Array.isArray(historyValues) ? historyValues : [])
    .filter(valid).map(Number);
  if (!valid(value)) return { status: 'info', label: 'Keine Messung', baseline: null, observations: values.length };
  if (values.length < 12) {
    return { status: 'info', label: 'Persönliche Basis im Aufbau', baseline: null, observations: values.length };
  }
  const baseline = median(values);
  const deviations = values.map(item => Math.abs(item - baseline));
  const mad = median(deviations) ?? 0;
  const average = mean(values);
  const scaleFloor = key === 'hrv' ? 3 : key === 'rhr' ? 1 : 0.5;
  const scale = Math.max(1.4826 * mad, sd(values, average) * 0.5, scaleFloor);
  const z = (Number(value) - baseline) / scale;
  const adverse = key === 'hrv' ? -z : z;
  let status = 'good';
  let label = 'Im persönlichen Normalbereich';
  if (adverse > 2) {
    status = 'critical';
    label = key === 'hrv' ? 'HRV deutlich unter der persönlichen Basis' : 'Deutlich über der persönlichen Basis';
  } else if (adverse > 1) {
    status = 'attention';
    label = key === 'hrv' ? 'HRV unter dem üblichen Bereich' : 'Leicht über dem üblichen Bereich';
  } else if (key === 'hrv' && z > 1.5) {
    // A high HRV value is not automatically interpreted as better readiness.
    label = 'Über dem üblichen Bereich – im Kontext betrachten';
    status = 'attention';
  }
  return {
    status, zone: status === 'critical' ? 1 : status === 'attention' ? 2 : 4, label, baseline: Number(baseline.toFixed(1)),
    lower: Number((baseline - scale).toFixed(1)),
    upper: Number((baseline + scale).toFixed(1)),
    deviation: Number(z.toFixed(2)), scale: Number(scale.toFixed(2)),
    observations: values.length
  };
}

export function classifySleepDuration(value, historyValues) {
  const values = (Array.isArray(historyValues) ? historyValues : []).filter(valid).map(Number);
  if (!valid(value)) return { status: 'info', label: 'Keine Messung', baseline: null, observations: values.length };
  if (values.length < 12) {
    return { status: 'info', label: 'Persönliche Schlafreferenz noch nicht bestimmt', baseline: null, observations: values.length };
  }
  const baseline = median(values);
  const deficit = baseline - Number(value);
  if (deficit <= 0.5) return { status: 'good', zone: 4, label: 'Nahe am persönlichen Schlafniveau', baseline: Number(baseline.toFixed(1)), deficit: Number(deficit.toFixed(1)), observations: values.length };
  if (deficit <= 1) return { status: 'attention', zone: 3, label: 'Etwa 30–60 Minuten unter dem persönlichen Niveau', baseline: Number(baseline.toFixed(1)), deficit: Number(deficit.toFixed(1)), observations: values.length };
  if (deficit <= 1.5) return { status: 'attention', zone: 2, label: 'Etwa 60–90 Minuten unter dem persönlichen Niveau', baseline: Number(baseline.toFixed(1)), deficit: Number(deficit.toFixed(1)), observations: values.length };
  return { status: 'critical', zone: 1, label: 'Mehr als 90 Minuten unter dem persönlichen Niveau', baseline: Number(baseline.toFixed(1)), deficit: Number(deficit.toFixed(1)), observations: values.length };
}

export function classifyGarminSleepScore(value) {
  if (!valid(value)) return { status: 'info', label: 'Keine Messung' };
  const score = Number(value);
  if (score >= 90) return { status: 'good', zone: 5, label: 'Ausgezeichnet · Garmin' };
  if (score >= 80) return { status: 'good', zone: 4, label: 'Gut · Garmin' };
  if (score >= 60) return { status: 'attention', zone: 3, label: 'Mittel · Garmin' };
  return { status: 'critical', zone: 1, label: 'Niedrig · Garmin' };
}

export function classifySubjective(key, value) {
  if (!valid(value) || Number(value) < 1 || Number(value) > 5) return { status: 'info', label: 'Keine Angabe' };
  const score = Number(value);
  const adverse = ['fatigue', 'soreness', 'stress'].includes(key) ? score : 6 - score;
  if (adverse <= 2) return { status: 'good', zone: 4, label: 'Günstige Selbsteinschätzung' };
  if (adverse <= 3) return { status: 'attention', zone: 3, label: 'Mittlere Selbsteinschätzung' };
  return { status: 'critical', zone: 1, label: 'Ungünstige Selbsteinschätzung' };
}

export function classifyTrainingBalance(value, mode = 'unclassified') {
  if (!valid(value)) return { status: 'info', label: 'Keine Modellwerte' };
  const n = Number(value);
  if (mode === 'relative') {
    if (n < -25) return { status: 'critical', zone: 1, label: 'Hoher negativer relativer Modellstatus' };
    if (n < -10) return { status: 'attention', zone: 2, label: 'Erhöhter negativer relativer Modellstatus' };
    if (n <= 5) return { status: 'good', zone: 3, label: 'Relativer Modellstatus ausgeglichen' };
    if (n <= 20) return { status: 'good', zone: 4, label: 'Positiver relativer Modellstatus' };
    return { status: 'attention', zone: 2, label: 'Sehr positiver relativer Modellstatus · Kontext prüfen' };
  }
  return { status: 'info', label: 'TSB ' + (n > 0 ? '+' : '') + n.toFixed(1) + ' · Modellwert ohne allgemeingültige Grenzzone' };
}

export function classifyAcwr(value) {
  if (!valid(value) || Number(value) < 0) return { status: 'info', label: 'Nicht berechenbar' };
  const ratio = Number(value);
  if (ratio < 0.8) return { status: 'attention', zone: 2, label: 'Akute Last unter chronischem Niveau' };
  if (ratio <= 1.3) return { status: 'info', zone: 3, label: 'Akute und chronische Last ähnlich – keine Sicherheitszone' };
  if (ratio <= 1.5) return { status: 'attention', zone: 2, label: 'Erhöhter kurzfristiger Lastanstieg' };
  return { status: 'critical', zone: 1, label: 'Deutlicher kurzfristiger Lastanstieg' };
}
