const RETRYABLE_HTTP_STATUSES = new Set([
  408, 500, 502, 503, 504, 520, 521, 522, 523, 524,
]);

const DEFAULT_RETRY_DELAYS_MS = [1000, 2000];

export async function fetchWithTransientRetry(
  input,
  init,
  {
    fetchImpl = fetch,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  } = {},
) {
  const maxAttempts = retryDelaysMs.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;

    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      await wait(retryDelaysMs[attempt - 1]);
      continue;
    }

    if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt >= maxAttempts) {
      return response;
    }

    await wait(retryDelaysMs[attempt - 1]);
  }

  throw new Error("Garmin-Download nach mehreren Versuchen fehlgeschlagen.");
}
