import { resolveGarminActivityDate } from "./activity-date.js";

function addUtcDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function buildGarminActivityRescanPlan({
  startDate,
  endDate,
  coveredRows = [],
  storedActivities = [],
  rescanAnchorDate = endDate,
  scanWindowDays = 14,
  maxRangeDays = 14,
}) {
  const coveredCounts = new Map(
    coveredRows.map((row) => [String(row.sync_date).slice(0, 10), Number(row.activity_count) || 0]),
  );
  const storedCounts = new Map();

  for (const row of storedActivities) {
    const activity = row?.activity && typeof row.activity === "object" ? row.activity : row;
    const date = resolveGarminActivityDate(activity);
    if (date && date >= startDate && date <= endDate) {
      storedCounts.set(date, (storedCounts.get(date) ?? 0) + 1);
    }
  }

  const recentRescanStart = addUtcDays(rescanAnchorDate, -(scanWindowDays - 1));
  const datesToScan = [];
  let totalDays = 0;

  for (let date = startDate; date <= endDate; date = addUtcDays(date, 1)) {
    totalDays++;
    const hasCoverage = coveredCounts.has(date);
    const coverageMatchesStored = hasCoverage &&
      coveredCounts.get(date) === (storedCounts.get(date) ?? 0);
    if (!coverageMatchesStored || date >= recentRescanStart) datesToScan.push(date);
  }

  const ranges = [];
  let index = 0;
  while (index < datesToScan.length) {
    const rangeStart = datesToScan[index];
    let rangeEnd = rangeStart;
    let count = 1;
    while (index + count < datesToScan.length && count < maxRangeDays &&
      datesToScan[index + count] === addUtcDays(rangeEnd, 1)) {
      rangeEnd = datesToScan[index + count];
      count++;
    }
    ranges.push({ startDate: rangeStart, endDate: rangeEnd });
    index += count;
  }

  return {
    ranges,
    scannedDaysToRetry: datesToScan.length,
    skippedDays: totalDays - datesToScan.length,
    totalDays,
  };
}
