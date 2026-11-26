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
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(today)) {
    throw new Error("today must be a YYYY-MM-DD date.");
  }
  if (cursorDate != null && !/^\\d{4}-\\d{2}-\\d{2}$/.test(cursorDate)) {
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
