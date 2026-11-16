/* ============================================================
 * health-calculations.js – Transparente Auswertung dokumentierter
 * Krankheitstage und Verletzungstage. Keine Diagnose oder
 * automatische Trainingsverfügbarkeits-Schätzung.
 * ============================================================ */

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
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
    trainingAvailability: {
      unrestricted: records.filter(([, item]) => item.trainingAvailability === 'unrestricted').length,
      reduced: records.filter(([, item]) => item.trainingAvailability === 'reduced').length,
      unavailable: records.filter(([, item]) => item.trainingAvailability === 'unavailable').length,
      undocumented: records.filter(([, item]) => !['unrestricted', 'reduced', 'unavailable'].includes(item.trainingAvailability)).length
    },
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

/**
 * Compares documented activity volume around each explicitly documented
 * health episode. Activity.duration is stored in minutes in the activity model.
 * Missing duration is counted separately; missing activities are not inferred
 * to be rest days and no completeness/causality claim is made.
 */
export function summarizeHealthEpisodeTrainingImpact(healthLogs = {}, activities = [], episodes = [], comparisonDays = 14, trainingLoadRecords = [], loadMode = null, loadUnit = null, asOfDate = null, trainingLoadEligibleActivities = null) {
  if (!Number.isInteger(comparisonDays) || comparisonDays < 1 || comparisonDays > 90) return null;
  const documentedHealthDates = new Set(Object.entries(healthLogs || {})
    .filter(([date, item]) => validDateKey(date) && (item?.status === 'sick' || item?.status === 'injured'))
    .map(([date]) => date));
  // rawActivities sollte pro KAJO-Aktivitäts-ID genau einen Datensatz enthalten.
  // Bei identischer ID, Datum und Startzeit wird ein versehentlich doppelt
  // vorhandener Eintrag in dieser Analyse nur einmal berücksichtigt. Gleiche
  // IDs mit abweichender Zeitzuordnung bleiben bewusst erhalten.
  const deduplicateActivityRows = rows => {
    const seen = new Set();
    const duplicates = [];
    const unique = rows.filter(item => {
      if (item.id == null || item.id === '') return true;
      const key = [String(item.id), item.date || '', item.startTime || ''].join('|');
      if (seen.has(key)) {
        duplicates.push(item);
        return false;
      }
      seen.add(key);
      return true;
    });
    return { rows: unique, duplicates };
  };
  const activityResult = deduplicateActivityRows(
    (Array.isArray(activities) ? activities : []).map(activity => {
      const date = itemDateKey(activity);
      const rawDuration = activity?.duration;
      const duration = rawDuration !== null && rawDuration !== undefined && rawDuration !== ''
        && Number.isFinite(Number(rawDuration)) && Number(rawDuration) > 0
        ? Number(rawDuration) : null;
      return { id: activity?.id, date, startTime: activity?.startTime || '', duration, sourceActivity: activity };
    }).filter(item => item.date)
  );
  const activityRows = activityResult.rows;

  const loadResult = deduplicateActivityRows(
    (Array.isArray(trainingLoadRecords) ? trainingLoadRecords : []).map(record => ({
      id: record?.activity?.id,
      date: itemDateKey(record?.activity),
      startTime: record?.activity?.startTime || '',
      sourceActivity: record?.activity,
      value: record?.value !== null && record?.value !== undefined && record?.value !== ''
        && Number.isFinite(Number(record.value)) ? Number(record.value) : null
    })).filter(item => item.date && item.value !== null)
  );
  const activityIdentityKey = item => item.id == null || item.id === ''
    ? null : [String(item.id), item.date || '', item.startTime || ''].join('|');
  const knownActivityKeys = new Set(activityRows.map(activityIdentityKey).filter(Boolean));
  const knownActivityObjects = new Set(activityRows.map(item => item.sourceActivity));
  // Bevorzugt wird die Objektidentität aus getTrainingLoadData genutzt.
  // Der zusammengesetzte Schlüssel bleibt Fallback für äquivalente Kopien.
  const isMatchedLoadRow = item => {
    if (knownActivityObjects.has(item.sourceActivity)) return true;
    const key = activityIdentityKey(item);
    return Boolean(key && knownActivityKeys.has(key));
  };
  const unmatchedLoadRows = loadResult.rows.filter(item => !isMatchedLoadRow(item));
  const loadRows = loadResult.rows.filter(isMatchedLoadRow);
  const eligibleLoadActivityObjects = Array.isArray(trainingLoadEligibleActivities)
    ? new Set(trainingLoadEligibleActivities) : null;
  const validAsOfDate = validDateKey(asOfDate) ? asOfDate : null;
  const summarizeWindow = (from, to, excludeHealthDates = false, capAtAsOfDate = false) => {
    const requestedTo = to;
    if (capAtAsOfDate && validAsOfDate && to > validAsOfDate) to = validAsOfDate;
    if (from > to) return {
      from, to: requestedTo, calendarDays: 0, eligibleCalendarDays: 0,
      activities: 0, activitiesWithDuration: 0, activitiesWithoutDuration: 0,
      durationCoverage: { available: 0, total: 0, status: 'nicht berechenbar' },
      totalMinutes: 0, averageMinutesPerCalendarDay: null,
      trainingLoad: null, trainingLoadActivityCount: 0,
      trainingLoadCoverage: { available: 0, total: 0, status: 'nicht berechenbar' },
      averageTrainingLoadPerCalendarDay: null,
      trainingLoadMode: loadMode, trainingLoadUnit: loadUnit,
      duplicateActivityRecordsExcluded: 0,
      duplicateLoadRecordsExcluded: 0,
      daysWithActivity: 0, notStarted: true
    };
    const days = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 86400000) + 1;
    let eligibleCalendarDays = 0;
    for (let offset = 0; offset < days; offset++) {
      const date = addDays(from, offset);
      if (!excludeHealthDates || !documentedHealthDates.has(date)) eligibleCalendarDays++;
    }
    const rows = activityRows.filter(item => item.date >= from && item.date <= to
      && !(excludeHealthDates && documentedHealthDates.has(item.date)));
    const validDurations = rows.filter(item => item.duration !== null);
    const totalMinutes = validDurations.reduce((sum, item) => sum + item.duration, 0);
    const windowLoadRows = loadRows.filter(item => item.date >= from && item.date <= to
      && !(excludeHealthDates && documentedHealthDates.has(item.date)));
    const totalLoad = windowLoadRows.reduce((sum, item) => sum + item.value, 0);
    const coverageStatus = (available, total) => total === 0
      ? 'nicht berechenbar'
      : available === total ? 'vollständig' : 'eingeschränkt';
    return {
      from, to, calendarDays: days, eligibleCalendarDays,
      activities: rows.length,
      activitiesWithDuration: validDurations.length,
      activitiesWithoutDuration: rows.length - validDurations.length,
      durationCoverage: {
        available: validDurations.length,
        total: rows.length,
        status: coverageStatus(validDurations.length, rows.length)
      },
      totalMinutes,
      averageMinutesPerCalendarDay: eligibleCalendarDays > 0 ? totalMinutes / eligibleCalendarDays : null,
      trainingLoad: windowLoadRows.length ? Number(totalLoad.toFixed(1)) : null,
      trainingLoadActivityCount: windowLoadRows.length,
      trainingLoadCoverage: (() => {
        const eligibleCount = eligibleLoadActivityObjects
          ? rows.filter(item => eligibleLoadActivityObjects.has(item.sourceActivity)).length
          : rows.length;
        return {
          available: windowLoadRows.length,
          total: eligibleCount,
          status: coverageStatus(windowLoadRows.length, eligibleCount)
        };
      })(),
      averageTrainingLoadPerCalendarDay: eligibleCalendarDays > 0 && windowLoadRows.length
        ? totalLoad / eligibleCalendarDays : null,
      trainingLoadMode: loadMode,
      trainingLoadUnit: loadUnit,
      duplicateActivityRecordsExcluded: activityResult.duplicates.filter(item =>
        item.date >= from && item.date <= to &&
        !(excludeHealthDates && documentedHealthDates.has(item.date))
      ).length,
      duplicateLoadRecordsExcluded: loadResult.duplicates.filter(item =>
        item.date >= from && item.date <= to &&
        !(excludeHealthDates && documentedHealthDates.has(item.date))
      ).length,
      unmatchedLoadRecordsExcluded: unmatchedLoadRows.filter(item =>
        item.date >= from && item.date <= to &&
        !(excludeHealthDates && documentedHealthDates.has(item.date))
      ).length,
      daysWithActivity: new Set(rows.map(item => item.date)).size,
      notStarted: false,
      requestedTo
    };
  };

  return (Array.isArray(episodes) ? episodes : []).filter(episode =>
    validDateKey(episode?.startDate) && validDateKey(episode?.endDate) && episode.startDate <= episode.endDate
  ).map(episode => {
    const beforeFrom = addDays(episode.startDate, -comparisonDays);
    const beforeTo = addDays(episode.startDate, -1);
    const afterFrom = addDays(episode.endDate, 1);
    const afterTo = addDays(episode.endDate, comparisonDays);
    const baseline = summarizeWindow(beforeFrom, beforeTo, true);
    const returnWindows = [
      { key: 'days1to7', label: 'Tag 1–7', from: afterFrom, to: addDays(episode.endDate, 7) },
      { key: 'days8to14', label: 'Tag 8–14', from: addDays(episode.endDate, 8), to: addDays(episode.endDate, 14) },
      { key: 'days15to28', label: 'Tag 15–28', from: addDays(episode.endDate, 15), to: addDays(episode.endDate, 28) }
    ].map(window => {
      const period = summarizeWindow(window.from, window.to, true, true);
      const baselineAverage = baseline.averageMinutesPerCalendarDay;
      const relativeToBaseline = baselineAverage !== null && baselineAverage > 0
        && period.averageMinutesPerCalendarDay !== null
        ? ((period.averageMinutesPerCalendarDay - baselineAverage) / baselineAverage) * 100
        : null;
      return {
        key: window.key,
        label: window.label,
        ...period,
        averageMinutesChangePercent: relativeToBaseline === null ? null : Number(relativeToBaseline.toFixed(1))
      };
    });
    return {
      status: episode.status,
      startDate: episode.startDate,
      endDate: episode.endDate,
      documentedDays: episode.documentedDays,
      before: baseline,
      during: summarizeWindow(episode.startDate, episode.endDate),
      after: summarizeWindow(afterFrom, afterTo, true, true),
      returnToTraining: {
        baseline,
        windows: returnWindows,
        note: 'Beschreibt ausschließlich dokumentierte Aktivitäten nach der Phase; keine medizinische Freigabe oder Empfehlung zur Belastungssteigerung.'
      }
    };
  });
}
