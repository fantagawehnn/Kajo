/* Pure period-level statistics for the analysis overview.
 * Only documented records are counted; missing durations remain missing.
 */
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const activityDate = activity => {
  const raw = activity?.date || activity?.startTime || activity?.start_date_local || '';
  const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};
export function calculatePeriodSummary({ activities = [], races = [], healthLogs = {}, from, to } = {}) {
  if (!validDate(from) || !validDate(to) || from > to) {
    return { validRange: false, activityCount: 0, trainingDays: 0, durationMinutes: null, durationCount: 0,
      raceCount: 0, resultCount: 0, podiumCount: 0, winCount: 0, sickDays: 0, injuredDays: 0, healthEntryCount: 0 };
  }
  const periodActivities = (Array.isArray(activities) ? activities : []).filter(activity => {
    const date = activityDate(activity); return date >= from && date <= to;
  });
  const dates = new Set(periodActivities.map(activityDate).filter(Boolean));
  const durations = periodActivities.map(activity => Number(activity?.duration))
    .filter(value => Number.isFinite(value) && value > 0);
  const canoeActivities = periodActivities.filter(activity => ['Kayaking', 'C1', 'C2'].includes(activity?.type));
  const canoeClasses = {
    K1: canoeActivities.filter(activity => activity.type === 'Kayaking').length,
    C1: canoeActivities.filter(activity => activity.type === 'C1').length,
    C2: canoeActivities.filter(activity => activity.type === 'C2').length
  };
  const canoeFormats = {
    classic: canoeActivities.filter(activity => activity.raceFormat === 'classic').length,
    sprint: canoeActivities.filter(activity => activity.raceFormat === 'sprint').length
  };
  const canoeWaterTypes = {
    wildwater: canoeActivities.filter(activity => (activity.waterConditions?.type || activity.waterType) === 'wildwater').length,
    flatwater: canoeActivities.filter(activity => (activity.waterConditions?.type || activity.waterType) === 'flatwater').length
  };

  const periodRaces = (Array.isArray(races) ? races : []).filter(race =>
    validDate(race?.date) && race.date >= from && race.date <= to);
  const results = periodRaces.flatMap(race => Array.isArray(race.results) ? race.results : [])
    .map(result => Number(result?.rank)).filter(rank => Number.isFinite(rank) && rank > 0);
  const healthEntries = Object.entries(healthLogs && typeof healthLogs === 'object' ? healthLogs : {})
    .filter(([date]) => validDate(date) && date >= from && date <= to);
  return {
    validRange: true,
    activityCount: periodActivities.length,
    trainingDays: dates.size,
    durationMinutes: durations.length ? durations.reduce((sum, value) => sum + value, 0) : null,
    durationCount: durations.length,
    canoeCount: canoeActivities.length,
    canoeClasses,
    canoeFormats,
    canoeFormatUnspecifiedCount: canoeActivities.length - canoeFormats.classic - canoeFormats.sprint,
    canoeWaterTypes,
    canoeWaterTypeUnspecifiedCount: canoeActivities.length - canoeWaterTypes.wildwater - canoeWaterTypes.flatwater,
    raceCount: periodRaces.length,
    resultCount: results.length,
    podiumCount: results.filter(rank => rank <= 3).length,
    winCount: results.filter(rank => rank === 1).length,
    sickDays: healthEntries.filter(([, entry]) => entry?.status === 'sick').length,
    injuredDays: healthEntries.filter(([, entry]) => entry?.status === 'injured').length,
    healthEntryCount: healthEntries.length
  };
}
