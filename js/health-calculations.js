/* ============================================================
 * health-calculations.js – Transparente Auswertung dokumentierter
 * Krankheitstage und Verletzungstage. Keine Diagnose oder
 * automatische Trainingsverfügbarkeits-Schätzung.
 * ============================================================ */

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00');
  return Number.isFinite(date.getTime()) &&
    date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8, 10));
}

function itemDateKey(item) {
  const value = typeof item?.date === 'string' ? item.date.slice(0, 10) : '';
  return validDateKey(value) ? value : null;
}

/**
 * Counts explicitly documented sick/injured days and the activities/plans
 * that fall on those days. Missing health logs are unknown, not healthy.
 * A planned session without a same-day activity is not labelled as missed.
 */
export function summarizeHealthDocumentation(
  healthLogs = {},
  activities = [],
  plannedActivities = [],
  from,
  to
) {
  if (!validDateKey(from) || !validDateKey(to) || from > to) {
    return null;
  }

  const records = Object.entries(healthLogs || {}).filter(([date, item]) =>
    validDateKey(date) && date >= from && date <= to &&
    (item?.status === 'sick' || item?.status === 'injured')
  );
  const sickDates = new Set(records.filter(([, item]) => item.status === 'sick').map(([date]) => date));
  const injuredDates = new Set(records.filter(([, item]) => item.status === 'injured').map(([date]) => date));
  const activityCounts = new Map();
  for (const activity of Array.isArray(activities) ? activities : []) {
    const date = itemDateKey(activity);
    if (!date || date < from || date > to) continue;
    activityCounts.set(date, (activityCounts.get(date) || 0) + 1);
  }

  let activitiesOnSickDays = 0;
  let activitiesOnInjuredDays = 0;
  for (const [date, count] of activityCounts) {
    if (sickDates.has(date)) activitiesOnSickDays += count;
    if (injuredDates.has(date)) activitiesOnInjuredDays += count;
  }

  const plannedCounts = new Map();
  for (const planned of Array.isArray(plannedActivities) ? plannedActivities : []) {
    const date = itemDateKey(planned);
    if (!date || date < from || date > to) continue;
    plannedCounts.set(date, (plannedCounts.get(date) || 0) + 1);
  }

  const plannedSessionsOnSickDays = [...plannedCounts]
    .reduce((sum, [date, count]) => sum + (sickDates.has(date) ? count : 0), 0);
  const plannedSessionsOnInjuredDays = [...plannedCounts]
    .reduce((sum, [date, count]) => sum + (injuredDates.has(date) ? count : 0), 0);
  const plannedSickDaysWithoutActivity = [...plannedCounts.keys()]
    .filter(date => sickDates.has(date) && !activityCounts.has(date)).length;
  const plannedInjuredDaysWithoutActivity = [...plannedCounts.keys()]
    .filter(date => injuredDates.has(date) && !activityCounts.has(date)).length;

  return {
    from,
    to,
    documentedHealthDays: records.length,
    sickDays: sickDates.size,
    injuredDays: injuredDates.size,
    activitiesOnSickDays,
    activitiesOnInjuredDays,
    plannedSessionsOnSickDays,
    plannedSessionsOnInjuredDays,
    plannedSickDaysWithoutActivity,
    plannedInjuredDaysWithoutActivity,
    availability: null,
    availabilityReason: 'Gesunde Tage und Gründe für nicht absolvierte oder verschobene Einheiten werden nicht systematisch dokumentiert.'
  };
}

function addDays(dateKey, amount) {
  const date = new Date(dateKey + 'T12:00:00');
  date.setDate(date.getDate() + amount);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

/**
 * Groups consecutive, explicitly documented days with the same status.
 * Missing dates and status changes split episodes; no healthy days are inferred.
 * Episodes crossing the selected window retain their documented full boundaries.
 */
export function summarizeHealthEpisodes(healthLogs = {}, from, to) {
  if (!validDateKey(from) || !validDateKey(to) || from > to) return null;

  const days = Object.entries(healthLogs || {})
    .filter(([date, item]) => validDateKey(date) && date <= to &&
      (item?.status === 'sick' || item?.status === 'injured'))
    .sort(([a], [b]) => a.localeCompare(b));

  const episodes = [];
  let current = null;
  for (const [date, item] of days) {
    const status = item.status;
    const isContinuation = current &&
      current.status === status &&
      addDays(current.endDate, 1) === date;
    if (!isContinuation) {
      if (current) episodes.push(current);
      current = {
        status,
        startDate: date,
        endDate: date,
        documentedDays: 1,
        diagnoses: item.diagnosis ? [String(item.diagnosis)] : []
      };
    } else {
      current.endDate = date;
      current.documentedDays += 1;
      if (item.diagnosis && !current.diagnoses.includes(String(item.diagnosis))) {
        current.diagnoses.push(String(item.diagnosis));
      }
    }
  }
  if (current) episodes.push(current);

  return episodes
    .filter(episode => episode.endDate >= from && episode.startDate <= to)
    .map(episode => ({
      ...episode,
      daysInWindow: Math.max(0,
        Math.round((new Date(Math.min(episode.endDate, to) + 'T12:00:00') -
          new Date(Math.max(episode.startDate, from) + 'T12:00:00')) / 86400000) + 1)
    }));
}
