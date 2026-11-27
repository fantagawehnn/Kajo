function addUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function buildAutomaticGarminSyncRange({
  today,
  cursorDate = null,
  status = null,
  maxDays = 14,
  initialOverlapDays = 1,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error("today must be a YYYY-MM-DD date.");
  }
  if (cursorDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(cursorDate)) {
    throw new Error("cursorDate must be null or a YYYY-MM-DD date.");
  }

  const safeMaxDays = Math.max(1, Math.min(31, Math.floor(maxDays) || 1));
  const safeInitialOverlap = Math.max(0, Math.min(30, Math.floor(initialOverlapDays) || 0));
  let startDate = cursorDate
    ? status === "completed" ? addUtcDays(cursorDate, -1) : cursorDate
    : addUtcDays(today, -safeInitialOverlap);

  if (startDate > today) startDate = today;
  const latestEnd = addUtcDays(startDate, safeMaxDays - 1);
  const endDate = latestEnd > today ? today : latestEnd;

  return {
    startDate,
    endDate,
    nextCursorDate: addUtcDays(endDate, 1),
    isComplete: endDate >= today,
  };
}


export const LATE_ARRIVING_HEALTH_TYPES = Object.freeze([
  "hrv_daily",
  "hrv_detail",
  "sleep_detail",
  "sleep_summaries",
  "menstrual_cycle_summary",
  "menstrual_cycle_day_view",
]);

export function selectLateArrivingHealthRetryDate(
  rows,
  { beforeDate, now = Date.now(), retryAfterMs = 6 * 60 * 60 * 1000 } = {},
) {
  if (typeof beforeDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
    throw new Error("beforeDate must be a YYYY-MM-DD date.");
  }
  const eligibleDates = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.record_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.record_date) ||
        row.record_date >= beforeDate ||
        !LATE_ARRIVING_HEALTH_TYPES.includes(row.data_type) ||
        JSON.stringify(row.payload) !== JSON.stringify({ no_data: true })) continue;
    const fetchedAt = typeof row.fetched_at === "string" ? Date.parse(row.fetched_at) : NaN;
    if (!Number.isFinite(fetchedAt) || now - fetchedAt < retryAfterMs) continue;
    eligibleDates.add(row.record_date);
  }
  return [...eligibleDates].sort()[0] ?? null;
}
