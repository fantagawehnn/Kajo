/* KAJO V2 – Analyseübersicht: four agreed domains, no duplicate calculations. */
import { state } from './state.js';

const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.textContent = value ?? '';
};
function sourceHero(domain) {
  const value = document.getElementById('analysis-' + domain + '-hero-value')?.textContent?.trim() || '—';
  const unit = document.getElementById('analysis-' + domain + '-hero-unit')?.textContent?.trim() || '';
  const ring = document.getElementById(domain + '-hero-ring');
  return { value, unit, tone: ring?.dataset?.status || 'neutral' };
}
function renderCircle(domain) {
  const data = sourceHero(domain);
  setText('analysis-overview-' + domain + '-value', data.value);
  setText('analysis-overview-' + domain + '-unit', data.unit);
  const ring = document.getElementById('overview-' + domain + '-ring');
  if (ring) ring.dataset.status = data.tone;
}
export function renderAnalysisOverview() {
  for (const domain of ['load', 'recovery', 'performance']) renderCircle(domain);

  // Health availability is intentionally not converted into a score:
  // the current data model does not yet provide a complete linked denominator.
  const health = sourceHero('health');
  const hasAvailability = valid(health.value) && health.value !== '—';
  setText('analysis-overview-health-value', hasAvailability ? health.value : '—');
  setText('analysis-overview-health-unit', hasAvailability ? health.unit : '');
  setText('analysis-overview-health-caption', hasAvailability ? 'Verfügbarkeit' : 'Nicht berechenbar');
  const healthRing = document.getElementById('overview-health-ring');
  if (healthRing) healthRing.dataset.status = 'neutral';
}
