export function resolveGarminActivityDate(activity) {
  const localStart = typeof activity?.startTimeLocal === 'string' ? activity.startTimeLocal : '';
  if (/^\d{4}-\d{2}-\d{2}/.test(localStart)) {
    return localStart.slice(0, 10);
  }

  const rawStart = activity?.startTimeGMT ?? activity?.startTimeLocal;
  if (!rawStart) return null;
  const parsedStart = new Date(String(rawStart));
  return Number.isFinite(parsedStart.getTime())
    ? parsedStart.toISOString().slice(0, 10)
    : null;
}
