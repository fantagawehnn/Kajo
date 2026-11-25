function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]),
    );
  }
  return value;
}

export function stableJsonStringify(value) {
  return JSON.stringify(stableJsonValue(value));
}

function sameTimestamp(left, right) {
  if (left == null || right == null) return left == null && right == null;
  const leftMs = Date.parse(String(left));
  const rightMs = Date.parse(String(right));
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) return leftMs === rightMs;
  return String(left) === String(right);
}

export function selectChangedGarminActivityRows(incomingRows, existingRows) {
  const existingById = new Map(
    existingRows.map((row) => [String(row.garmin_activity_id), row]),
  );

  return incomingRows.filter((row) => {
    const existing = existingById.get(String(row.garmin_activity_id));
    if (!existing) return true;

    return stableJsonStringify(existing.activity) !== stableJsonStringify(row.activity) ||
      !sameTimestamp(existing.start_time, row.start_time) ||
      (existing.activity_type ?? null) !== (row.activity_type ?? null) ||
      Number(existing.duration_seconds ?? 0) !== Number(row.duration_seconds ?? 0) ||
      Number(existing.distance_meters ?? 0) !== Number(row.distance_meters ?? 0);
  });
}
