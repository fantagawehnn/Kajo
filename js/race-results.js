export const RACE_RESULT_DISCIPLINES = ['K1', 'C1', 'C2'];
export const RACE_RESULT_FORMATS = ['Sprint', 'Classic'];

export function normalizeRaceResults(results) {
  if (!Array.isArray(results)) return [];
  return results.map((item, index) => {
    if (!item || typeof item !== 'object') return null;
    const discipline = RACE_RESULT_DISCIPLINES.includes(item.discipline) ? item.discipline : null;
    const format = RACE_RESULT_FORMATS.includes(item.format) ? item.format : null;
    const placement = item.placement === '' || item.placement == null ? null : Number(item.placement);
    const timeSeconds = item.timeSeconds === '' || item.timeSeconds == null ? null : Number(item.timeSeconds);
    if (!discipline || !format || (placement === null && timeSeconds === null)) return null;
    if (placement !== null && (!Number.isInteger(placement) || placement < 1)) return null;
    if (timeSeconds !== null && (!Number.isFinite(timeSeconds) || timeSeconds <= 0)) return null;
    return {
      id: String(item.id || 'result-' + (index + 1)),
      discipline,
      format,
      placement,
      timeSeconds
    };
  }).filter(Boolean);
}

export function formatRaceResultTime(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  const minutes = Math.floor(value / 60);
  const remainder = (value - minutes * 60).toFixed(2).padStart(5, '0');
  return minutes ? minutes + ':' + remainder : remainder + ' s';
}
