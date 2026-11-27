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

function preserveKnownValue(incoming, existing) {
  return incoming == null && existing != null ? existing : incoming;
}

export function mergeGarminActivityRows(incomingRows, existingRows) {
  const existingById = new Map(
    existingRows.map((row) => [String(row.garmin_activity_id), row]),
  );

  return incomingRows.map((row) => {
    const existing = existingById.get(String(row.garmin_activity_id));
    if (!existing) return row;

    const incomingActivity = row.activity && typeof row.activity === "object" ? row.activity : {};
    const existingActivity = existing.activity && typeof existing.activity === "object" ? existing.activity : {};
    const mergedActivity = { ...existingActivity };
    for (const [key, value] of Object.entries(incomingActivity)) {
      mergedActivity[key] = preserveKnownValue(value, existingActivity[key]);
    }

    return {
      ...row,
      activity: mergedActivity,
      start_time: preserveKnownValue(row.start_time, existing.start_time),
      activity_type: preserveKnownValue(row.activity_type, existing.activity_type),
      duration_seconds: preserveKnownValue(row.duration_seconds, existing.duration_seconds),
      distance_meters: preserveKnownValue(row.distance_meters, existing.distance_meters),
    };
  });
}

export function selectChangedGarminActivityRows(incomingRows, existingRows) {
  const existingById = new Map(
    existingRows.map((row) => [String(row.garmin_activity_id), row]),
  );
  const mergedRows = mergeGarminActivityRows(incomingRows, existingRows);

  return mergedRows.filter((row) => {
    const existing = existingById.get(String(row.garmin_activity_id));
    if (!existing) return true;

    return stableJsonStringify(existing.activity) !== stableJsonStringify(row.activity) ||
      !sameTimestamp(existing.start_time, row.start_time) ||
      (existing.activity_type ?? null) !== (row.activity_type ?? null) ||
      Number(existing.duration_seconds ?? 0) !== Number(row.duration_seconds ?? 0) ||
      Number(existing.distance_meters ?? 0) !== Number(row.distance_meters ?? 0);
  });
}
