const normalizeDate = value => String(value || '').slice(0, 10);

/**
 * Returns planned activities that are still relevant for calendar display.
 * The planned date remains visible through that local calendar day; from the
 * following day onward it is hidden without mutating or deleting stored data.
 */
export function getVisiblePlannedActivities(activities, today) {
  const todayKey = normalizeDate(today);
  if (!todayKey) return [];
  return (Array.isArray(activities) ? activities : []).filter(item => {
    const date = normalizeDate(item?.date);
    return date && date >= todayKey;
  });
}
