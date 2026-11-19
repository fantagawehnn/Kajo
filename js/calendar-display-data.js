const normalizeDate = value => String(value || '').slice(0, 10);

/** Hide planned activities after their scheduled local calendar day without deleting stored data. */
export function getVisiblePlannedActivities(activities, today) {
  const todayKey = normalizeDate(today);
  if (!todayKey) return [];
  return (Array.isArray(activities) ? activities : []).filter(item => {
    const date = normalizeDate(item?.date);
    return date && date >= todayKey;
  });
}
