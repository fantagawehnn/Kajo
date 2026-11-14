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

export function buildCompetitionSeasonSummary(races) {
  const groups = new Map();
  let racesWithResults = 0;
  let totalStarts = 0;
  (Array.isArray(races) ? races : []).forEach(race => {
    const date = typeof race?.date === 'string' ? race.date : '';
    const match = /^(\\d{4})-\\d{2}-\\d{2}$/.exec(date);
    if (!match) return;
    const results = normalizeRaceResults(race.results);
    if (!results.length) return;
    racesWithResults += 1;
    results.forEach(result => {
      const key = [match[1], result.discipline, result.format].join('|');
      if (!groups.has(key)) groups.set(key, { season: Number(match[1]), discipline: result.discipline, format: result.format, starts: 0, placements: [], timesRecorded: 0, podiums: 0 });
      const group = groups.get(key);
      group.starts += 1;
      totalStarts += 1;
      if (result.placement !== null) {
        group.placements.push(result.placement);
        if (result.placement <= 3) group.podiums += 1;
      }
      if (result.timeSeconds !== null) group.timesRecorded += 1;
    });
  });
  const rows = [...groups.values()].map(group => ({
    season: group.season, discipline: group.discipline, format: group.format,
    starts: group.starts, placementsRecorded: group.placements.length,
    averagePlacement: group.placements.length ? group.placements.reduce((sum, value) => sum + value, 0) / group.placements.length : null,
    bestPlacement: group.placements.length ? Math.min(...group.placements) : null,
    podiums: group.podiums, timesRecorded: group.timesRecorded
  })).sort((a, b) => b.season - a.season
    || ['K1','C1','C2'].indexOf(a.discipline) - ['K1','C1','C2'].indexOf(b.discipline)
    || ['Sprint','Classic'].indexOf(a.format) - ['Sprint','Classic'].indexOf(b.format));
  return { rows, racesWithResults, totalStarts };
}
