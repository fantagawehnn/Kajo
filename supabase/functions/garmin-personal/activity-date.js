export function resolveGarminActivityDate(activity) {
  const localStart = activity?.startTimeLocal;
  if (typeof localStart === "string" && /^\d{4}-\d{2}-\d{2}/.test(localStart)) {
    return localStart.slice(0, 10);
  }

  const rawStart = activity?.startTimeGMT ?? localStart;
  if (rawStart === null || rawStart === undefined || rawStart === "") return null;

  let parsedStart;
  if (typeof rawStart === "number" || (typeof rawStart === "string" && /^\d{10,13}$/.test(rawStart))) {
    const numeric = Number(rawStart);
    const milliseconds = numeric < 1e12 ? numeric * 1000 : numeric;
    parsedStart = new Date(milliseconds);
  } else {
    parsedStart = new Date(String(rawStart));
  }

  return Number.isFinite(parsedStart.getTime())
    ? parsedStart.toISOString().slice(0, 10)
    : null;
}
