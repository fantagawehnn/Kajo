/**
 * Adaptive, gap-aware presentation helpers for time-series charts.
 * These helpers never change stored or calculated source values.
 */
const isValid = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value));

function mondayKey(dateKey) {
  const date = new Date(String(dateKey) + 'T12:00:00');
  if (!Number.isFinite(date.getTime())) return '';
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function weeklyAverage(dates, values) {
  const buckets = new Map();
  dates.forEach((date, index) => {
    const week = mondayKey(date);
    if (!week) return;
    if (!buckets.has(week)) buckets.set(week, { sum: 0, count: 0 });
    const value = values[index];
    if (isValid(value)) {
      const bucket = buckets.get(week);
      bucket.sum += Number(value);
      bucket.count++;
    }
  });
  const labels = [...buckets.keys()].sort();
  return {
    labels,
    values: labels.map(label => {
      const bucket = buckets.get(label);
      return bucket.count ? Number((bucket.sum / bucket.count).toFixed(2)) : null;
    }),
    counts: labels.map(label => buckets.get(label).count)
  };
}

export function prepareAdaptiveSeriesGroup(dates, series, options = {}) {
  const threshold = Number.isFinite(options.coverageThreshold) ? options.coverageThreshold : 0.7;
  const minimum = Number.isInteger(options.minimumPoints) ? options.minimumPoints : 3;
  const safeDates = Array.isArray(dates) ? dates : [];
  const safeSeries = Array.isArray(series) ? series : [];
  const stats = safeSeries.map(item => {
    const values = Array.isArray(item?.values) ? item.values : [];
    const count = values.filter(isValid).length;
    return { ...item, values, count, coverage: safeDates.length ? count / safeDates.length : 0 };
  });
  const mode = stats.length && stats.every(item => item.coverage >= threshold) ? 'daily' : 'weekly';
  const prepared = stats.map(item => {
    const grouped = mode === 'weekly' ? weeklyAverage(safeDates, item.values) : null;
    const values = grouped ? grouped.values : item.values.slice(0, safeDates.length);
    const labels = grouped ? grouped.labels : safeDates.slice();
    const counts = grouped ? grouped.counts : item.values.slice(0, safeDates.length).map(value => isValid(value) ? 1 : 0);
    const pointCount = values.filter(isValid).length;
    return {
      ...item,
      labels,
      values,
      counts,
      pointCount,
      mode,
      chartType: mode === 'weekly' && item.coverage < threshold ? 'bar' : 'line',
      available: item.count >= minimum && pointCount >= minimum
    };
  });
  const labels = mode === 'daily' ? safeDates.slice() : [...new Set(prepared.flatMap(item => item.labels))].sort();
  return { mode, labels, series: prepared, coverageThreshold: threshold, minimumPoints: minimum };
}

/**
 * Carry the last known value forward for display only. The returned mask lets
 * charts render those provisional spans in a muted dashed style. Source data
 * remains untouched and must still be used for calculations and readouts.
 */
export function carryForwardForDisplay(values) {
  let last = null;
  const displayValues = [];
  const carried = [];
  (Array.isArray(values) ? values : []).forEach(value => {
    if (isValid(value)) {
      last = Number(value);
      displayValues.push(last);
      carried.push(false);
    } else if (last !== null) {
      displayValues.push(last);
      carried.push(true);
    } else {
      displayValues.push(null);
      carried.push(false);
    }
  });
  return { values: displayValues, carried };
}

export function gapAwareSegmentStyle(carried) {
  const mask = Array.isArray(carried) ? carried : [];
  const crossesGap = context => {
    const start = Math.min(context.p0DataIndex ?? 0, context.p1DataIndex ?? 0);
    const end = Math.max(context.p0DataIndex ?? 0, context.p1DataIndex ?? 0);
    return mask.slice(start, end + 1).some(Boolean);
  };
  return {
    borderDash: context => crossesGap(context) ? [4, 3] : undefined,
    borderColor: context => crossesGap(context) ? 'rgba(148,163,184,.72)' : undefined
  };
}

export function countValidSeriesValues(values) {
  return (Array.isArray(values) ? values : []).filter(isValid).length;
}
