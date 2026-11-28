import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveGarminActivityDate } from "./activity-date.js";
import { buildGarminActivityRescanPlan } from "./activity-scan-plan.js";
import { buildAutomaticGarminSyncRange, LATE_ARRIVING_HEALTH_TYPES, selectLateArrivingHealthRetryDate } from "./automatic-sync-plan.js";
import { selectChangedGarminActivityRows } from "./activity-upsert-plan.js";
import { fetchWithTransientRetry } from "./fit-download-retry.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kajo.fantagawehn.workers.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function toBase64(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

async function encryptionKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("GARMIN_ENCRYPTION_KEY");
  if (!raw) throw new Error("GARMIN_ENCRYPTION_KEY fehlt in den Edge-Function-Secrets.");
  const bytes = fromBase64(raw);
  if (bytes.length !== 32) throw new Error("GARMIN_ENCRYPTION_KEY muss Base64-kodiert genau 32 Bytes enthalten.");
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

async function decryptSecret(ciphertext: string, iv: string): Promise<string> {
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

// Garmin Personal API allows limited request bursts. Serialize calls and
// keep a conservative 450 ms gap to avoid repeatedly crossing its 100/30 s limit.
let lastGarminRequestAt = 0;
let garminRequestQueue: Promise<void> = Promise.resolve();
async function waitForGarminRequestSlot(): Promise<void> {
  const slot = garminRequestQueue.then(async () => {
    const waitMs = Math.max(0, 450 - (Date.now() - lastGarminRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastGarminRequestAt = Date.now();
  });
  garminRequestQueue = slot.catch(() => {});
  await slot;
}

async function garminGet(token: string, path: string): Promise<unknown> {
  await waitForGarminRequestSlot();
  const response = await fetch(`https://personal.connectapi.garmin.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Garmin-Datenabruf fehlgeschlagen (HTTP ${response.status}). ${detail.slice(0, 250)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function isEmptyGarminPayload(payload: unknown): boolean {
  if (payload == null) return true;
  if (Array.isArray(payload)) return payload.length === 0;
  if (typeof payload === "object") return Object.keys(payload as Record<string, unknown>).length === 0;
  return false;
}

async function syncGarminHealthDay(
  admin: ReturnType<typeof createClient>,
  userId: string,
  date: string,
  forceRefresh = false,
  assertLock: () => void = () => {},
) {
  assertLock();
  const { data: credential, error: credentialError } = await admin
    .from("garmin_personal_credentials")
    .select("encrypted_api_key, encryption_iv")
    .eq("user_id", userId)
    .maybeSingle();
  if (credentialError) throw credentialError;
  if (!credential) throw new Error("Für dieses Konto ist kein Garmin-Schlüssel hinterlegt.");

  const apiKey = await decryptSecret(credential.encrypted_api_key, credential.encryption_iv);
  const token = await garminToken(apiKey);
  const endpoints = [
    { type: "menstrual_cycle_summary", path: `/periodichealth-service/menstrualcycle/summary/${date}` },
    { type: "menstrual_cycle_day_view", path: `/periodichealth-service/menstrualcycle/dayview/${date}?todayDate=${new Date().toISOString().slice(0, 10)}` },
    { type: "daily_summary", path: `/usersummary-service/v2/dailysummaries?startDate=${date}&endDate=${date}` },
    { type: "heart_rate", path: `/wellness-service/wellness/dailyHeartRate?date=${date}` },
    { type: "hrv_daily", path: `/hrv-service/hrv/daily/${date}/${date}` },
    { type: "hrv_detail", path: `/hrv-service/hrv/${date}` },
    { type: "sleep_detail", path: `/sleep-service/sleep/dailySleep?date=${date}` },
    { type: "sleep_summaries", path: `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${date}&endDate=${date}` },
    { type: "stress", path: `/usersummary-service/stats/stress/daily/${date}/${date}` },
    { type: "steps", path: `/usersummary-service/stats/steps/daily/${date}/${date}` },
    { type: "hydration", path: `/usersummary-service/stats/hydration/daily/${date}/${date}` },
    { type: "body_battery", path: `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${date}&endDate=${date}` },
    { type: "spo2", path: `/wellness-service/wellness/daily/spo2acclimation/${date}` },
    { type: "weight", path: `/weight-service/weight/range/${date}/${date}?includeAll=true` },
    { type: "fitness_age", path: `/fitnessage-service/fitnessage/v2/${date}` },
    { type: "wellness_activity", path: `/wellnessactivity-service/activity/summary/range/${date}/${date}` },
    { type: "nutrition", path: `/nutrition-service/food/logs/${date}` },
  ];

  const results: Array<Record<string, unknown>> = [];
  for (const endpoint of endpoints) {
    try {
      assertLock();
      assertLock();
      // Do not spend Garmin API calls on endpoints already imported successfully.
      // The no_data marker is deliberately retried so data that becomes available
      // later (including cycle data) can still be picked up.
      const { data: existing, error: existingError } = await admin
        .from("garmin_health_records")
        .select("payload,fetched_at")
        .eq("user_id", userId)
        .eq("data_type", endpoint.type)
        .eq("record_date", date)
        .eq("record_key", "daily")
        .maybeSingle();
      if (existingError) throw existingError;
      const isNoDataMarker = JSON.stringify(existing?.payload) === JSON.stringify({ no_data: true });
      const fetchedAt = typeof existing?.fetched_at === "string" ? Date.parse(existing.fetched_at) : NaN;
      const ageMs = Number.isFinite(fetchedAt) ? Math.max(0, Date.now() - fetchedAt) : Number.POSITIVE_INFINITY;
      // HRV and sleep values may arrive after the first morning request. Retry
      // empty markers after six hours rather than waiting a month.
      const lateArrivingTypes = new Set(["hrv_daily", "hrv_detail", "sleep_detail", "sleep_summaries"]);
      const noDataRetryAfterMs = lateArrivingTypes.has(endpoint.type)
        ? 6 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
      const noDataNeedsRetry = isNoDataMarker && ageMs >= noDataRetryAfterMs;
      // Daily aggregates change during the day. Refresh only these after six
      // hours; successful static records are not fetched again unnecessarily.
      const refreshDuringDayTypes = new Set([
        "daily_summary", "heart_rate", "stress", "steps", "hydration",
        "body_battery", "spo2", "nutrition"
      ]);
      const dynamicNeedsRefresh = Boolean(existing?.payload) &&
        !isEmptyGarminPayload(existing.payload) &&
        !isNoDataMarker &&
        refreshDuringDayTypes.has(endpoint.type) &&
        ageMs >= 6 * 60 * 60 * 1000;
      if (!forceRefresh && existing?.payload && !isEmptyGarminPayload(existing.payload) &&
          (!isNoDataMarker || !noDataNeedsRetry) && !dynamicNeedsRefresh) {
        results.push({ dataType: endpoint.type, status: "already_saved" });
        continue;
      }

      let payload: unknown;
      try {
        payload = await garminGet(token, endpoint.path);
        assertLock();
        assertLock();
      } catch (firstError) {
        const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
        if (!/HTTP 520/.test(firstMessage)) throw firstError;
        // Cloudflare 520 is often transient; make one delayed retry.
        await new Promise((resolve) => setTimeout(resolve, 2000));
        assertLock();
        payload = await garminGet(token, endpoint.path);
        assertLock();
        assertLock();
      }
      const hasData = !isEmptyGarminPayload(payload);
      const now = new Date().toISOString();

      // An empty response must never erase a previously stored, meaningful payload.
      if (!hasData && existing?.payload && !isEmptyGarminPayload(existing.payload) &&
          JSON.stringify(existing.payload) !== JSON.stringify({ no_data: true })) {
        results.push({ dataType: endpoint.type, status: "preserved_existing_data" });
        continue;
      }

      const { error } = await admin.from("garmin_health_records").upsert({
        user_id: userId,
        data_type: endpoint.type,
        record_date: date,
        record_key: "daily",
        source_endpoint: endpoint.path,
        payload: hasData ? payload : { no_data: true },
        fetched_at: now,
        updated_at: now,
      }, { onConflict: "user_id,data_type,record_date,record_key" });
      if (error) throw error;
      results.push({ dataType: endpoint.type, status: hasData ? "saved" : "no_data" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
      const isRateLimited = /HTTP 429/.test(message);
      const retryMatch = message.match(/retryInSeconds["\s:=]+(\d+)/i);
      results.push({
        dataType: endpoint.type,
        status: isRateLimited ? "rate_limited" : "error",
        error: isRateLimited
          ? "Garmin hat eine Abrufpause angefordert. Die Synchronisierung wartet automatisch und versucht es erneut."
          : message.slice(0, 220),
        ...(isRateLimited ? { retryInSeconds: retryMatch ? Number(retryMatch[1]) : 30 } : {}),
      });
      // Garmin has rate-limited this account: stop immediately instead of
      // sending the remaining endpoint requests and making the limit worse.
      if (isRateLimited) break;
    }
  }

  const failed = results.filter((item) => item.status === "error" || item.status === "rate_limited").length;
  const rateLimited = results.some((item) => item.status === "rate_limited");
  const retryInSeconds = Number(results.find((item) => item.status === "rate_limited")?.retryInSeconds || 0);
  if (!failed) {
    assertLock();
    const { error } = await admin.from("garmin_connections").update({
      last_health_sync_at: new Date().toISOString(),
    }).eq("user_id", userId);
    if (error) throw error;
  }
  return {
    date,
    status: rateLimited ? "rate_limited" : failed ? "partial" : "complete",
    rateLimited,
    retryInSeconds,
    totalEndpoints: endpoints.length,
    saved: results.filter((item) => item.status === "saved" || item.status === "preserved_existing_data" || item.status === "already_saved").length,
    noData: results.filter((item) => item.status === "no_data").length,
    failed,
    results,
  };
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function syncGarminHealthHistoryBatch(
  admin: ReturnType<typeof createClient>,
  userId: string,
  startDate: string,
  endDate: string,
  rescanCompleted = false,
  forceRefresh = false,
  maxDaysPerInvocation = 1,
  syncType = "health_history",
  preserveCursor = false,
  assertLock: () => void = () => {},
) {
  assertLock();
  let { data: state, error: stateError } = await admin
    .from("garmin_sync_state")
    .select("cursor_date,status,last_success_at,range_start_date,range_end_date")
    .eq("user_id", userId)
    .eq("sync_type", syncType)
    .maybeSingle();
  if (stateError) throw stateError;

  if (!state) {
    const { data: created, error: createError } = await admin
      .from("garmin_sync_state")
      .insert({
        user_id: userId,
        sync_type: syncType,
        cursor_date: startDate,
        range_start_date: startDate,
        range_end_date: endDate,
        status: "pending",
        cursor_offset: 0,
        updated_at: new Date().toISOString(),
      })
      .select("cursor_date,status,last_success_at,range_start_date,range_end_date")
      .single();
    if (createError) throw createError;
    state = created;
  } else if (!preserveCursor && (state.range_start_date !== startDate || state.range_end_date !== endDate)) {
    const { data: resetState, error: resetError } = await admin.from("garmin_sync_state")
      .update({
        cursor_date: startDate,
        range_start_date: startDate,
        range_end_date: endDate,
        cursor_offset: 0,
        status: "pending",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("sync_type", syncType)
      .select("cursor_date,status,last_success_at,range_start_date,range_end_date")
      .single();
    if (resetError) throw resetError;
    state = resetState;
  }

  let cursorDate = state.cursor_date ?? startDate;
  if (preserveCursor && state?.cursor_date) cursorDate = startDate;
  if (state.status === "completed" && cursorDate > endDate) {
    if (!rescanCompleted) {
      return { status: "complete", startDate, endDate, cursorDate, processedDays: 0, remainingDays: 0,
        message: "Der ausgewählte Garmin-Zeitraum ist bereits vollständig importiert." };
    }
    // A completed automatic cursor can be rewound for a one-day overlap.
    // Successful health records are skipped per endpoint; missing/no-data
    // records can be retried when Garmin makes them available later.
    const { data: restarted, error: restartError } = await admin.from("garmin_sync_state")
      .update({
        cursor_date: startDate,
        status: "pending",
        cursor_offset: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("sync_type", syncType)
      .select("cursor_date,status,last_success_at,range_start_date,range_end_date")
      .single();
    if (restartError) throw restartError;
    state = restarted;
    cursorDate = startDate;
  }

  const { error: runningError } = await admin.from("garmin_sync_state").update({
    status: "running",
    last_started_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("sync_type", syncType);
  if (runningError) throw runningError;

  // Process a bounded number of calendar days per invocation. The automatic
  // app-open sync may process today plus its one-day overlap; manual history
  // imports keep the smaller one-day batch and continue from the persisted cursor.
  const batchLimit = Math.max(1, Math.min(2, Math.floor(maxDaysPerInvocation) || 1));
  const processed: Array<Record<string, unknown>> = [];
  let failed = false;
  let rateLimited = false;
  let retryInSeconds = 0;
  for (let index = 0; index < batchLimit && cursorDate <= endDate; index++) {
    assertLock();
    const dayResult = await syncGarminHealthDay(admin, userId, cursorDate, forceRefresh, assertLock);
    assertLock();
    processed.push(dayResult);
    if (dayResult.failed !== 0) {
      failed = true;
      rateLimited = dayResult.status === "rate_limited";
      retryInSeconds = Number(dayResult.retryInSeconds || 0);
      const { error } = await admin.from("garmin_sync_state").update({
        status: "error",
        last_error: `Abruffehler am ${cursorDate}; derselbe Tag wird beim nächsten Lauf erneut versucht.`,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("sync_type", syncType);
      if (error) throw error;
      break;
    }
    cursorDate = addUtcDays(cursorDate, 1);
    const finished = cursorDate > endDate;
    const { error } = await admin.from("garmin_sync_state").update({
      cursor_date: cursorDate,
      status: finished ? "completed" : "running",
      last_success_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("sync_type", syncType);
    if (error) throw error;
    if (finished) break;
  }
  const remainingDays = cursorDate > endDate ? 0 :
    Math.floor((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${cursorDate}T00:00:00Z`).getTime()) / 86400000) + 1;
  return {
    status: rateLimited ? "rate_limited" : failed ? "partial" : remainingDays === 0 ? "complete" : "in_progress",
    rateLimited,
    retryInSeconds,
    startDate, endDate, nextDate: cursorDate, processedDays: processed.length,
    remainingDays, batchLimit, results: processed,
  };
}


async function syncGarminHealthAutomaticBatch(
  admin: ReturnType<typeof createClient>,
  userId: string,
  today: string,
  assertLock: () => void = () => {},
) {
  assertLock();
  const { data: state, error } = await admin
    .from("garmin_sync_state")
    .select("cursor_date,status")
    .eq("user_id", userId)
    .eq("sync_type", "health_auto")
    .maybeSingle();
  if (error) throw error;
  let initialCursorDate: string | null = null;
  let initialStatus: string | null = null;
  if (!state) {
    // Reuse the legacy shared cursor only as a one-time migration seed. From
    // this point onward automatic sync writes exclusively to health_auto.
    const { data: legacyState, error: legacyError } = await admin
      .from("garmin_sync_state")
      .select("cursor_date,status")
      .eq("user_id", userId)
      .eq("sync_type", "health_history")
      .maybeSingle();
    if (legacyError) throw legacyError;
    if (legacyState?.cursor_date) {
      initialCursorDate = legacyState.cursor_date;
      initialStatus = legacyState.status;
    } else {
      const { data: latestRecord, error: latestError } = await admin
        .from("garmin_health_records")
        .select("record_date")
        .eq("user_id", userId)
        .lte("record_date", today)
        .order("record_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (latestRecord?.record_date) {
        initialCursorDate = addUtcDays(latestRecord.record_date, 1);
        initialStatus = "completed";
      }
    }
  }

  const range = buildAutomaticGarminSyncRange({
    today,
    cursorDate: state?.cursor_date ?? initialCursorDate,
    status: state?.status ?? initialStatus,
    maxDays: 2,
    initialOverlapDays: 1,
  });

  // Retry one historical no-data date per invocation. This is deliberately
  // outside the cursor batch: it must never rewind or advance health_auto.
  const retryCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: retryMarkers, error: retryMarkersError } = await admin
    .from("garmin_health_records")
    .select("record_date,data_type,payload,fetched_at")
    .eq("user_id", userId)
    .eq("record_key", "daily")
    .in("data_type", LATE_ARRIVING_HEALTH_TYPES)
    .eq("payload->>no_data", "true")
    .lt("fetched_at", retryCutoff)
    .lt("record_date", range.startDate)
    .order("fetched_at", { ascending: true })
    .limit(200);
  if (retryMarkersError) throw retryMarkersError;
  const lateDataRetryDate = selectLateArrivingHealthRetryDate(retryMarkers, {
    beforeDate: range.startDate,
  });

  let lateRetryResult: Record<string, unknown> | null = null;
  if (lateDataRetryDate) {
    assertLock();
    lateRetryResult = await syncGarminHealthDay(admin, userId, lateDataRetryDate, false, assertLock);
    assertLock();
    if (Number(lateRetryResult.failed || 0) > 0) {
      return {
        status: lateRetryResult.status === "rate_limited" ? "rate_limited" : "partial",
        rateLimited: lateRetryResult.status === "rate_limited",
        retryInSeconds: Number(lateRetryResult.retryInSeconds || 0),
        lateDataRetryDate,
        processedDays: 1,
        remainingDays: Math.max(0, Math.floor(
          (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${range.startDate}T00:00:00Z`).getTime()) / 86400000
        ) + 1),
        results: [{ ...lateRetryResult, lateDataRetry: true }],
      };
    }
  }

  // Keep the combined workload at no more than two calendar dates.
  const regularSync = await syncGarminHealthHistoryBatch(
    admin, userId, range.startDate, today, true, false,
    lateDataRetryDate ? 1 : 2, "health_auto", true, assertLock
  );
  return lateDataRetryDate
    ? {
        ...regularSync,
        processedDays: Number(regularSync.processedDays || 0) + 1,
        lateDataRetryDate,
        results: [{ ...lateRetryResult, lateDataRetry: true }, ...(regularSync.results || [])],
      }
    : regularSync;
}

async function syncGarminActivitiesAutomaticBatch(
  admin: ReturnType<typeof createClient>,
  userId: string,
  today: string,
  assertLock: () => void = () => {},
) {
  assertLock();
  const { data: state, error } = await admin
    .from("garmin_sync_state")
    .select("cursor_date,status")
    .eq("user_id", userId)
    .eq("sync_type", "activity_auto")
    .maybeSingle();
  if (error) throw error;
  let initialCursorDate: string | null = null;
  if (!state) {
    const { data: latestCoverage, error: coverageError } = await admin
      .from("garmin_activity_sync_days")
      .select("sync_date")
      .eq("user_id", userId)
      .lte("sync_date", today)
      .order("sync_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (coverageError) throw coverageError;
    if (latestCoverage?.sync_date) initialCursorDate = addUtcDays(latestCoverage.sync_date, 1);
  }

  const range = buildAutomaticGarminSyncRange({
    today,
    cursorDate: state?.cursor_date ?? initialCursorDate,
    status: state?.status ?? (initialCursorDate ? "completed" : null),
    maxDays: 14,
    initialOverlapDays: 1,
  });
  const result = await syncGarminActivitiesForUser(
    admin, userId, range.startDate, range.endDate, true, range.endDate, 2, assertLock
  );
  if (result.status === "skipped") return result;

  assertLock();
  const now = new Date().toISOString();
  const { error: stateError } = await admin.from("garmin_sync_state").upsert({
    user_id: userId,
    sync_type: "activity_auto",
    cursor_date: range.nextCursorDate,
    range_start_date: range.startDate,
    range_end_date: today,
    status: range.isComplete ? "completed" : "running",
    last_success_at: now,
    last_error: null,
    updated_at: now,
  }, { onConflict: "user_id,sync_type" });
  if (stateError) throw stateError;

  return {
    ...result,
    progress: {
      nextDate: range.nextCursorDate,
      processedThrough: range.endDate,
      remainingDays: range.isComplete
        ? 0
        : Math.floor((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${range.nextCursorDate}T00:00:00Z`).getTime()) / 86400000) + 1,
    },
  };
}

function activityRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["activities", "activityList", "data"]) {
      if (Array.isArray(record[key])) {
        return (record[key] as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
      }
    }
  }
  throw new Error("Garmin hat eine unerwartete Antwortstruktur für die Aktivitätenliste geliefert.");
}

async function probeGarminEndpoint(label: string, token: string, path: string) {
  try {
    const response = await fetch(`https://personal.connectapi.garmin.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const raw = await response.text();
    let payload: unknown = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = raw; }
    }
    let dataShape = "leer";
    let itemCount: number | null = null;
    if (Array.isArray(payload)) {
      itemCount = payload.length;
      dataShape = payload.length ? "Array mit Daten" : "leeres Array";
    } else if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const arrays = Object.entries(record).filter(([, value]) => Array.isArray(value));
      if (arrays.length) {
        itemCount = arrays.reduce((sum, [, value]) => sum + (value as unknown[]).length, 0);
        dataShape = itemCount ? "Objekt mit Datensätzen" : "Objekt mit leeren Listen";
      } else {
        dataShape = Object.keys(record).length ? "Objekt" : "leeres Objekt";
      }
    } else if (typeof payload === "string" && payload.length) {
      dataShape = "Nicht-JSON-Antwort";
    }
    return { label, status: response.status, ok: response.ok, dataShape, itemCount };
  } catch {
    return { label, status: 0, ok: false, dataShape: "Verbindungsfehler", itemCount: null };
  }
}

function safeActivityPreview(item: Record<string, unknown>) {
  const type = item.activityType && typeof item.activityType === "object"
    ? (item.activityType as Record<string, unknown>).typeKey ?? (item.activityType as Record<string, unknown>).type
    : item.activityType;
  return {
    activityId: item.activityId ?? item.id ?? null,
    activityName: item.activityName ?? item.name ?? "Garmin-Aktivität",
    startTimeLocal: item.startTimeLocal ?? item.startTime ?? null,
    startTimeGMT: item.startTimeGMT ?? null,
    duration: item.duration ?? item.elapsedDuration ?? null,
    distance: item.distance ?? null,
    averageHR: item.averageHR ?? item.avgHeartRate ?? null,
    maxHR: item.maxHR ?? item.maxHeartRate ?? null,
    trainingLoad: item.trainingLoad ?? item.activityTrainingLoad ?? item.aerobicTrainingLoad ?? null,
    aerobicTrainingEffect: item.aerobicTrainingEffect ?? item.trainingEffect ?? null,
    anaerobicTrainingEffect: item.anaerobicTrainingEffect ?? null,
    activityType: type ?? null,
  };
}

async function garminDownloadFit(token: string, activityId: string): Promise<string> {
  const response = await fetchWithTransientRetry(`https://personal.connectapi.garmin.com/download-service/files/activity/${encodeURIComponent(activityId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/zip, application/octet-stream, */*" },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Garmin-FIT-Download fehlgeschlagen (HTTP ${response.status}). ${detail.slice(0, 200)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Garmin hat eine leere Aktivitätsdatei geliefert.");
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}


async function garminDownloadFitFile(token: string, activityId: string): Promise<{ bytes: Uint8Array; extension: "zip" | "fit"; contentType: string }> {
  const response = await fetchWithTransientRetry(`https://personal.connectapi.garmin.com/download-service/files/activity/${encodeURIComponent(activityId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/zip, application/octet-stream, */*" },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Garmin-FIT-Download fehlgeschlagen (HTTP ${response.status}). ${detail.slice(0, 200)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Garmin hat eine leere Aktivitätsdatei geliefert.");
  if (bytes.length > 50 * 1024 * 1024) throw new Error("Die FIT-Datei überschreitet das konfigurierte Speicherlimit von 50 MB.");

  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06) || (bytes[2] === 0x07 && bytes[3] === 0x08));
  const isFit = bytes.length >= 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54;
  if (!isZip && !isFit) throw new Error("Garmin hat eine Datei mit unbekanntem Format geliefert. Es wurde nichts gespeichert.");

  return {
    bytes,
    extension: isZip ? "zip" : "fit",
    contentType: isZip ? "application/zip" : "application/fit",
  };
}

async function syncActivityFilesBatch(
  admin: ReturnType<typeof createClient>,
  userId: string,
  batchSize = 5,
) {
  const { data: activities, error: activitiesError } = await admin
    .from("garmin_activities")
    .select("garmin_activity_id, start_time")
    .eq("user_id", userId)
    .order("start_time", { ascending: false })
    .limit(1000);
  if (activitiesError) throw activitiesError;

  const { data: detailRows, error: detailRowsError } = await admin
    .from("garmin_activity_details")
    .select("garmin_activity_id, detail_synced_at, workouts_synced_at, fit_synced_at")
    .eq("user_id", userId);
  if (detailRowsError) throw detailRowsError;

  const detailById = new Map(
    (detailRows ?? []).map((row) => [String(row.garmin_activity_id), row]),
  );
  const pending = (activities ?? []).filter((activity) => {
    const saved = detailById.get(String(activity.garmin_activity_id));
    return !saved?.detail_synced_at || !saved?.workouts_synced_at || !saved?.fit_synced_at;
  });
  const selected = pending.slice(0, batchSize);

  if (!selected.length) {
    return {
      status: "complete",
      totalActivities: activities?.length ?? 0,
      pendingActivities: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
      results: [],
    };
  }

  const { data: credential, error: credentialError } = await admin
    .from("garmin_personal_credentials")
    .select("encrypted_api_key, encryption_iv")
    .eq("user_id", userId)
    .maybeSingle();
  if (credentialError) throw credentialError;
  if (!credential) throw new Error("Für dieses Konto ist kein Garmin-Schlüssel hinterlegt.");

  const apiKey = await decryptSecret(credential.encrypted_api_key, credential.encryption_iv);
  const token = await garminToken(apiKey);
  const results = [];

  for (const activity of selected) {
    const activityId = String(activity.garmin_activity_id);
    const saved = detailById.get(activityId);
    const result: Record<string, unknown> = {
      activityId,
      details: saved?.detail_synced_at ? "already_saved" : "pending",
      workouts: saved?.workouts_synced_at ? "already_saved" : "pending",
      fit: saved?.fit_synced_at ? "already_saved" : "pending",
      errors: [],
    };
    const errors: string[] = [];
    const now = new Date().toISOString();

    if (!saved?.detail_synced_at) {
      try {
        const detail = await garminGet(token, `/activity-service/activity/${encodeURIComponent(activityId)}`);
        if (detail == null) throw new Error("Keine Aktivitätsdetails von Garmin erhalten.");
        const { error } = await admin.from("garmin_activity_details").upsert({
          user_id: userId,
          garmin_activity_id: activityId,
          activity_detail: detail,
          detail_synced_at: now,
          updated_at: now,
        }, { onConflict: "user_id,garmin_activity_id" });
        if (error) throw error;
        result.details = "saved";
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Abruf der Details.";
        errors.push(`Details: ${message.slice(0, 220)}`);
        result.details = "error";
      }
    }

    if (!saved?.workouts_synced_at) {
      try {
        const workouts = await garminGet(token, `/activity-service/activity/${encodeURIComponent(activityId)}/workouts`);
        const { error } = await admin.from("garmin_activity_details").upsert({
          user_id: userId,
          garmin_activity_id: activityId,
          activity_workouts: workouts,
          workouts_synced_at: now,
          updated_at: now,
        }, { onConflict: "user_id,garmin_activity_id" });
        if (error) throw error;
        result.workouts = workouts == null ? "no_data" : "saved";
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Abruf der Workouts.";
        errors.push(`Workouts: ${message.slice(0, 220)}`);
        result.workouts = "error";
      }
    }

    if (!saved?.fit_synced_at) {
      try {
        const fitFile = await garminDownloadFitFile(token, activityId);
        const objectPath = `${userId}/${activityId}.${fitFile.extension}`;
        const { error: uploadError } = await admin.storage.from("garmin-fit").upload(
          objectPath,
          fitFile.bytes,
          { contentType: fitFile.contentType, upsert: true },
        );
        if (uploadError) throw uploadError;
        const { error: pathSaveError } = await admin.from("garmin_activity_details").upsert({
          user_id: userId,
          garmin_activity_id: activityId,
          fit_object_path: objectPath,
          fit_synced_at: now,
          updated_at: now,
        }, { onConflict: "user_id,garmin_activity_id" });
        if (pathSaveError) throw pathSaveError;
        result.fit = "saved";
        result.fileType = fitFile.extension;
        result.fileSizeBytes = fitFile.bytes.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unbekannter Fehler beim FIT-Download.";
        errors.push(`FIT: ${message.slice(0, 220)}`);
        result.fit = "error";
      }
    }

    if (errors.length) {
      result.errors = errors;
      await admin.from("garmin_activity_details").upsert({
        user_id: userId,
        garmin_activity_id: activityId,
        last_error: errors.join(" | ").slice(0, 1000),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,garmin_activity_id" });
    } else {
      await admin.from("garmin_activity_details").update({
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("garmin_activity_id", activityId);
      result.errors = [];
    }
    results.push(result);
  }

  const failed = results.filter((item) => item.details === "error" || item.workouts === "error" || item.fit === "error").length;
  const { data: refreshedDetails, error: refreshedError } = await admin
    .from("garmin_activity_details")
    .select("garmin_activity_id, detail_synced_at, workouts_synced_at, fit_synced_at")
    .eq("user_id", userId);
  if (refreshedError) throw refreshedError;
  const refreshedById = new Map(
    (refreshedDetails ?? []).map((row) => [String(row.garmin_activity_id), row]),
  );
  const remaining = (activities ?? []).filter((activity) => {
    const row = refreshedById.get(String(activity.garmin_activity_id));
    return !row?.detail_synced_at || !row?.workouts_synced_at || !row?.fit_synced_at;
  }).length;

  return {
    status: failed ? "partial" : remaining ? "in_progress" : "complete",
    totalActivities: activities?.length ?? 0,
    pendingActivities: pending.length,
    processed: selected.length,
    succeeded: selected.length - failed,
    failed,
    remaining,
    results,
  };
}

async function syncSingleActivityFiles(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: activity, error: activityError } = await admin
    .from("garmin_activities")
    .select("garmin_activity_id, start_time")
    .eq("user_id", userId)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activityError) throw activityError;
  if (!activity) throw new Error("Für dieses Konto wurde noch keine Garmin-Aktivität synchronisiert.");

  const activityId = String(activity.garmin_activity_id);
  const { data: credential, error: credentialError } = await admin
    .from("garmin_personal_credentials")
    .select("encrypted_api_key, encryption_iv")
    .eq("user_id", userId)
    .maybeSingle();
  if (credentialError) throw credentialError;
  if (!credential) throw new Error("Für dieses Konto ist kein Garmin-Schlüssel hinterlegt.");

  const apiKey = await decryptSecret(credential.encrypted_api_key, credential.encryption_iv);
  const token = await garminToken(apiKey);

  const [activityDetail, activityWorkouts, fitFile] = await Promise.all([
    garminGet(token, `/activity-service/activity/${encodeURIComponent(activityId)}`),
    garminGet(token, `/activity-service/activity/${encodeURIComponent(activityId)}/workouts`),
    garminDownloadFitFile(token, activityId),
  ]);
  if (activityDetail == null) throw new Error("Garmin hat keine Aktivitätsdetails geliefert. Es wurde nichts gespeichert.");

  const now = new Date().toISOString();
  const { error: detailSaveError } = await admin.from("garmin_activity_details").upsert({
    user_id: userId,
    garmin_activity_id: activityId,
    activity_detail: activityDetail,
    activity_workouts: activityWorkouts,
    detail_synced_at: now,
    workouts_synced_at: now,
    updated_at: now,
  }, { onConflict: "user_id,garmin_activity_id" });
  if (detailSaveError) throw detailSaveError;

  const objectPath = `${userId}/${activityId}.${fitFile.extension}`;
  const { error: uploadError } = await admin.storage.from("garmin-fit").upload(
    objectPath,
    fitFile.bytes,
    { contentType: fitFile.contentType, upsert: true },
  );
  if (uploadError) throw uploadError;

  const { error: pathSaveError } = await admin.from("garmin_activity_details").update({
    fit_object_path: objectPath,
    fit_synced_at: now,
    last_error: null,
    updated_at: now,
  }).eq("user_id", userId).eq("garmin_activity_id", activityId);
  if (pathSaveError) throw pathSaveError;

  return {
    status: "ok",
    activityId,
    detailStored: true,
    workoutsStored: activityWorkouts != null,
    fitStored: true,
    fileType: fitFile.extension,
    fileSizeBytes: fitFile.bytes.length,
    storagePathSaved: true,
  };
}

async function garminToken(apiKey: string): Promise<string> {
  const response = await fetch(
    "https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token",
    { method: "POST", headers: { Authorization: `ApiKey ${apiKey}` } },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Garmin hat den Schlüssel nicht bestätigt (HTTP ${response.status}). ${detail.slice(0, 250)}`);
  }
  // Garmin may return the access token as plain text rather than a JSON object.
  const responseBody = (await response.text()).trim();
  let token = responseBody;
  try {
    const payload = JSON.parse(responseBody);
    if (typeof payload === "string") {
      token = payload;
    } else if (payload && typeof payload === "object") {
      token = payload.access_token ?? payload.accessToken ?? payload.token ?? "";
    }
  } catch {
    // A raw JWT is expected to be plain text and is handled below.
  }
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Garmin-Antwort enthält kein erkanntes Zugriffstoken.");
  }
  return token.trim();
}

async function syncGarminActivitiesForUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  startDate: string,
  endDate: string,
  onlyMissingDays = false,
  rescanAnchorDate = endDate,
  scanWindowDaysInput = 14,
  assertSyncLock: () => void = () => {},
) {
  assertSyncLock();
  const { data: credential, error: credentialError } = await admin
    .from("garmin_personal_credentials")
    .select("encrypted_api_key, encryption_iv")
    .eq("user_id", userId)
    .maybeSingle();
  if (credentialError) throw credentialError;
  if (!credential) return { userId, status: "skipped", reason: "no_credential", fetched: 0, stored: 0 };

  const apiKey = await decryptSecret(credential.encrypted_api_key, credential.encryption_iv);
  const token = await garminToken(apiKey);
  const pageSize = 100;
  const maxPages = 20;
  const scanWindowDays = Math.max(1, Math.min(14, Math.floor(scanWindowDaysInput) || 14));
  let syncRanges: Array<{ startDate: string; endDate: string }> = [{ startDate, endDate }];
  let skippedDays = 0;

  if (onlyMissingDays) {
    // A coverage row is trusted only when its activity count agrees with the
    // activities already stored for that local calendar date.
    const { data: coveredRows, error: coveredError } = await admin
      .from("garmin_activity_sync_days")
      .select("sync_date,activity_count")
      .eq("user_id", userId)
      .gte("sync_date", startDate)
      .lte("sync_date", endDate);
    if (coveredError) throw coveredError;

    const storedActivities: Array<Record<string, unknown>> = [];
    const storedPageSize = 1000;
    for (let offset = 0; ; offset += storedPageSize) {
      assertSyncLock();
      const { data: pageRows, error: activitiesError } = await admin
        .from("garmin_activities")
        .select("activity,start_time,garmin_activity_id")
        .eq("user_id", userId)
        .order("garmin_activity_id", { ascending: true })
        .range(offset, offset + storedPageSize - 1);
      if (activitiesError) throw activitiesError;
      storedActivities.push(...(pageRows ?? []));
      if (!pageRows || pageRows.length < storedPageSize) break;
    }

    const plan = buildGarminActivityRescanPlan({
      startDate,
      endDate,
      coveredRows: coveredRows ?? [],
      storedActivities,
      rescanAnchorDate,
      scanWindowDays,
      maxRangeDays: 14,
    });
    syncRanges = plan.ranges;
    skippedDays = plan.skippedDays;
  }

  let fetched = 0;
  let stored = 0;
  let scannedDays = 0;
  const now = new Date().toISOString();

  for (const range of syncRanges) {
    assertSyncLock();
    const rows: Record<string, unknown>[] = [];
    for (let page = 0; page < maxPages; page++) {
      assertSyncLock();
      const params = new URLSearchParams({
        start: String(page * pageSize),
        limit: String(pageSize),
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const payload = await garminGet(token, `/activitylist-service/activities/search/activities?${params.toString()}`);
      assertSyncLock();
      const pageRows = activityRows(payload);
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
      if (page === maxPages - 1) {
        throw new Error(`Der Aktivitätszeitraum ${range.startDate} bis ${range.endDate} enthält mehr als 2.000 Einträge.`);
      }
    }

    const { data: deletionRows, error: deletionError } = await admin
      .from("activity_deletions")
      .select("garmin_activity_id")
      .eq("user_id", userId)
      .not("garmin_activity_id", "is", null);
    if (deletionError) throw deletionError;
    const deletedGarminIds = new Set((deletionRows ?? []).map((row) => String(row.garmin_activity_id)));

    const activityCounts = new Map<string, number>();
    const records = rows.map((item) => {
      const activity = safeActivityPreview(item);
      const activityId = activity.activityId == null ? "" : String(activity.activityId);
      if (!/^\d+$/.test(activityId)) return null;
      const rawStart = activity.startTimeGMT ?? activity.startTimeLocal;
      const parsedStart = rawStart ? new Date(String(rawStart)) : null;
      const startTime = parsedStart && Number.isFinite(parsedStart.getTime()) ? parsedStart.toISOString() : null;
      const activityDate = resolveGarminActivityDate(activity);
      if (activityDate && activityDate >= range.startDate && activityDate <= range.endDate) {
        activityCounts.set(activityDate, (activityCounts.get(activityDate) ?? 0) + 1);
      }
      if (deletedGarminIds.has(activityId)) return null;
      const duration = Number(activity.duration);
      const distance = Number(activity.distance);
      return {
        user_id: userId,
        garmin_activity_id: activityId,
        activity,
        start_time: startTime,
        activity_type: activity.activityType == null ? null : String(activity.activityType),
        duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
        distance_meters: Number.isFinite(distance) && distance > 0 ? distance : null,
        last_seen_at: now,
        updated_at: now,
      };
    }).filter((row) => row !== null);

    // Existing previews are compared before writing. Unchanged rows must not
    // refresh updated_at, otherwise every app opening downloads them again.
    const existingRows: Array<Record<string, unknown>> = [];
    for (let offset = 0; offset < records.length; offset += 100) {
      assertSyncLock();
      const batch = records.slice(offset, offset + 100);
      const ids = batch.map((row) => String(row.garmin_activity_id));
      const { data: existingBatch, error: existingBatchError } = await admin
        .from("garmin_activities")
        .select("garmin_activity_id,activity,start_time,activity_type,duration_seconds,distance_meters")
        .eq("user_id", userId)
        .in("garmin_activity_id", ids);
      if (existingBatchError) throw existingBatchError;
      existingRows.push(...(existingBatch ?? []));
    }

    const changedRecords = selectChangedGarminActivityRows(records, existingRows);
    for (let offset = 0; offset < changedRecords.length; offset += 100) {
      assertSyncLock();
      const { error: upsertError } = await admin.from("garmin_activities").upsert(changedRecords.slice(offset, offset + 100), {
        onConflict: "user_id,garmin_activity_id",
        ignoreDuplicates: false,
      });
      if (upsertError) throw upsertError;
    }

    // Mark coverage only after the list request and all upserts have succeeded.
    const coverageRows: Array<Record<string, unknown>> = [];
    for (let date = range.startDate; date <= range.endDate; date = addUtcDays(date, 1)) {
      coverageRows.push({
        user_id: userId,
        sync_date: date,
        activity_count: activityCounts.get(date) ?? 0,
        scanned_at: now,
      });
      scannedDays++;
    }
    if (coverageRows.length) {
      assertSyncLock();
      const { error: coverageError } = await admin
        .from("garmin_activity_sync_days")
        .upsert(coverageRows, { onConflict: "user_id,sync_date" });
      if (coverageError) throw coverageError;
    }

    fetched += rows.length;
    stored += changedRecords.length;
  }

  const { error: statusError } = await admin.from("garmin_connections").update({
    last_activity_sync_at: now,
    last_error: null,
    updated_at: now,
  }).eq("user_id", userId);
  if (statusError) throw statusError;

  return {
    userId, status: "ok", fetched, stored, scannedDays, skippedDays, startDate, endDate,
    ...(onlyMissingDays ? { checkedOnlyMissingDays: true, recentRescanDays: scanWindowDays } : {}),
  };
}

function buildGarminJsonTelemetry(details: Record<string, unknown>) {
  const descriptors = Array.isArray(details.metricDescriptors)
    ? details.metricDescriptors.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  const rows = Array.isArray(details.activityDetailMetrics)
    ? details.activityDetailMetrics.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  const descriptorByKey = new Map<string, { index: number; unitKey: string | null; factor: number | null; label: string | null }>();
  for (const descriptor of descriptors) {
    const key = typeof descriptor.key === "string" ? descriptor.key : "";
    const index = Number(descriptor.metricsIndex);
    if (!key || !Number.isInteger(index) || index < 0) continue;
    const unit = descriptor.unit && typeof descriptor.unit === "object"
      ? descriptor.unit as Record<string, unknown>
      : {};
    descriptorByKey.set(key, {
      index,
      unitKey: typeof unit.key === "string" ? unit.key : null,
      factor: typeof unit.factor === "number" ? unit.factor : null,
      label: typeof descriptor.label === "string" ? descriptor.label : null,
    });
  }
  const read = (row: Record<string, unknown>, key: string): number | null => {
    const descriptor = descriptorByKey.get(key);
    const values = Array.isArray(row.metrics) ? row.metrics : [];
    const value = descriptor ? values[descriptor.index] : null;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const samples = rows.map(row => ({ row, timestamp: read(row, "directTimestamp") }))
    .filter((item): item is { row: Record<string, unknown>; timestamp: number } =>
      item.timestamp !== null && item.timestamp >= 1000000000000 && item.timestamp <= 4000000000000)
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((item, index, all) => index === 0 || item.timestamp > all[index - 1].timestamp);
  if (samples.length < 2) throw new Error("Garmin-JSON enthält keine ausreichend lange, eindeutige Zeitreihe.");

  const startMs = samples[0].timestamp;
  const time = samples.map(item => (item.timestamp - startMs) / 1000);
  const collect = (key: string, validate: (value: number) => boolean, transform: (value: number) => number = value => value) => {
    const values = samples.map(item => {
      const value = read(item.row, key);
      return value !== null && validate(value) ? transform(value) : null;
    });
    return values.filter(value => value !== null).length >= 2 ? values : null;
  };
  const hr = collect("directHeartRate", value => value >= 30 && value <= 250);
  const altitude = collect("directElevation", value => value >= -500 && value <= 9000);
  const distance = collect("sumDistance", value => value >= 0, value => value / 1000);
  const respirationRate = collect("directRespirationRate", value => value >= 4 && value <= 80);
  const bodyBattery = collect("directBodyBattery", value => value >= 0 && value <= 100);

  // Preserve every additional numeric Garmin metric as raw values. Unit factors are
  // metadata only; no scaling, plausibility filtering, smoothing, or quality cleanup
  // is applied to these raw series at this stage.
  const metricSeries: Record<string, {
    label: string;
    unit: string | null;
    scaleFactor: number | null;
    values: Array<number | null>;
    nonNullCount: number;
  }> = {};
  for (const [key, descriptor] of descriptorByKey.entries()) {
    if (key === "directTimestamp" || !/^[A-Za-z0-9_-]+$/.test(key)) continue;
    const values = samples.map(item => read(item.row, key));
    const nonNullCount = values.filter(value => value !== null).length;
    if (nonNullCount === 0) continue;
    const readableKey = key.replace(/^direct/, "").replace(/^sum/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
    metricSeries[key] = {
      label: descriptor.label || readableKey || key,
      unit: descriptor.unitKey,
      scaleFactor: descriptor.factor,
      values,
      nonNullCount,
    };
  }

  return {
    source: "garmin-activity-details-json",
    time,
    metricSeriesTime: time,
    ...(hr ? { hr } : {}),
    ...(altitude ? { altitude } : {}),
    ...(distance ? { distance } : {}),
    ...(respirationRate ? { respirationRate } : {}),
    ...(bodyBattery ? { bodyBattery } : {}),
    metricSeries,
    metricSeriesCount: Object.keys(metricSeries).length,
    sampleCount: samples.length,
    startTimeIso: new Date(startMs).toISOString(),
    endTimeIso: new Date(samples[samples.length - 1].timestamp).toISOString(),
    durationSeconds: time[time.length - 1],
    importedAt: new Date().toISOString(),
  };
}

function prepareActivityTimeSeries(details: Record<string, unknown>) {
  const descriptors = Array.isArray(details.metricDescriptors)
    ? details.metricDescriptors.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  const rows = Array.isArray(details.activityDetailMetrics)
    ? details.activityDetailMetrics.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  const descriptorByKey = new Map<string, { index: number; unitKey: string | null; factor: number | null }>();
  for (const descriptor of descriptors) {
    const key = typeof descriptor.key === "string" ? descriptor.key : "";
    const index = Number(descriptor.metricsIndex);
    if (!key || !Number.isInteger(index) || index < 0) continue;
    const unit = descriptor.unit && typeof descriptor.unit === "object"
      ? descriptor.unit as Record<string, unknown>
      : {};
    descriptorByKey.set(key, {
      index,
      unitKey: typeof unit.key === "string" ? unit.key : null,
      factor: typeof unit.factor === "number" ? unit.factor : null,
    });
  }

  const valueAt = (row: Record<string, unknown>, key: string): number | null => {
    const descriptor = descriptorByKey.get(key);
    const metrics = Array.isArray(row.metrics) ? row.metrics : [];
    const value = descriptor ? metrics[descriptor.index] : null;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const timestampAt = (row: Record<string, unknown>) => valueAt(row, "directTimestamp");
  const heartRateAt = (row: Record<string, unknown>) => valueAt(row, "directHeartRate");
  const validRows = rows.map((row) => ({ row, timestamp: timestampAt(row) }))
    .filter((item): item is { row: Record<string, unknown>; timestamp: number } => item.timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
  const firstTimestamp = validRows.length ? validRows[0].timestamp : null;
  const lastTimestamp = validRows.length ? validRows[validRows.length - 1].timestamp : null;

  const fieldSummaries = descriptors
    .filter((descriptor) => typeof descriptor.key === "string" &&
      descriptor.key !== "directTimestamp" &&
      descriptor.key !== "directLatitude" &&
      descriptor.key !== "directLongitude")
    .map((descriptor) => {
      const key = String(descriptor.key);
      const values = rows.map((row) => valueAt(row, key)).filter((value): value is number => value !== null);
      return {
        key,
        metricsIndex: Number(descriptor.metricsIndex),
        unit: descriptorByKey.get(key)?.unitKey ?? null,
        scaleFactorMetadata: descriptorByKey.get(key)?.factor ?? null,
        nonNullCount: values.length,
        minRaw: values.length ? Math.min(...values) : null,
        maxRaw: values.length ? Math.max(...values) : null,
        averageRaw: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      };
    });

  const heartRates = validRows.map((item) => ({ timestamp: item.timestamp, value: heartRateAt(item.row) }))
    .filter((item): item is { timestamp: number; value: number } => item.value !== null);
  let hrArea = 0;
  let hrCoveredSeconds = 0;
  let intervalsOver30Seconds = 0;
  let maxGapSeconds = 0;
  const speedComparisons: Array<{ dt: number; distanceSpeed: number; rawSpeed: number; rawSpeedTimesPointOne: number }> = [];
  const verticalComparisons: Array<{ dt: number; elevationRate: number; rawVerticalSpeed: number; rawVerticalSpeedTimesPointOne: number }> = [];

  for (let i = 1; i < validRows.length; i++) {
    const previous = validRows[i - 1];
    const current = validRows[i];
    const dt = (current.timestamp - previous.timestamp) / 1000;
    if (!(dt > 0)) continue;
    maxGapSeconds = Math.max(maxGapSeconds, dt);
    if (dt > 30) intervalsOver30Seconds++;
    const previousHr = heartRateAt(previous.row);
    const currentHr = heartRateAt(current.row);
    if (previousHr !== null && currentHr !== null) {
      hrArea += ((previousHr + currentHr) / 2) * dt;
      hrCoveredSeconds += dt;
    }

    const previousDistance = valueAt(previous.row, "sumDistance");
    const currentDistance = valueAt(current.row, "sumDistance");
    const rawSpeed = valueAt(current.row, "directSpeed");
    if (previousDistance !== null && currentDistance !== null && rawSpeed !== null) {
      const distanceDelta = currentDistance - previousDistance;
      if (distanceDelta >= 0) {
        speedComparisons.push({
          dt,
          distanceSpeed: distanceDelta / dt,
          rawSpeed,
          rawSpeedTimesPointOne: rawSpeed * 0.1,
        });
      }
    }
    const previousElevation = valueAt(previous.row, "directElevation");
    const currentElevation = valueAt(current.row, "directElevation");
    const rawVerticalSpeed = valueAt(current.row, "directVerticalSpeed");
    if (previousElevation !== null && currentElevation !== null && rawVerticalSpeed !== null) {
      verticalComparisons.push({
        dt,
        elevationRate: (currentElevation - previousElevation) / dt,
        rawVerticalSpeed,
        rawVerticalSpeedTimesPointOne: rawVerticalSpeed * 0.1,
      });
    }
  }

  const average = (values: number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  const meanAbsoluteError = (left: number[], right: number[]) => {
    const count = Math.min(left.length, right.length);
    return count ? average(left.slice(0, count).map((value, index) => Math.abs(value - right[index]))) : null;
  };
  const distanceSpeeds = speedComparisons.map((item) => item.distanceSpeed);
  const rawSpeeds = speedComparisons.map((item) => item.rawSpeed);
  const scaledSpeeds = speedComparisons.map((item) => item.rawSpeedTimesPointOne);
  const elevationRates = verticalComparisons.map((item) => item.elevationRate);
  const rawVerticalSpeeds = verticalComparisons.map((item) => item.rawVerticalSpeed);
  const scaledVerticalSpeeds = verticalComparisons.map((item) => item.rawVerticalSpeedTimesPointOne);

  const toSample = (item: { row: Record<string, unknown>; timestamp: number }) => {
    const rawValues: Record<string, number | null> = {};
    for (const descriptor of descriptors) {
      const key = typeof descriptor.key === "string" ? descriptor.key : "";
      if (!key || key === "directTimestamp" || key === "directLatitude" || key === "directLongitude") continue;
      rawValues[key] = valueAt(item.row, key);
    }
    return {
      timestampMs: item.timestamp,
      timestampIso: new Date(item.timestamp).toISOString(),
      elapsedSeconds: firstTimestamp === null ? null : (item.timestamp - firstTimestamp) / 1000,
      heartRateBpm: heartRateAt(item.row),
      rawValues,
    };
  };

  return {
    rowCount: rows.length,
    timestampCount: validRows.length,
    startTimeIso: firstTimestamp === null ? null : new Date(firstTimestamp).toISOString(),
    endTimeIso: lastTimestamp === null ? null : new Date(lastTimestamp).toISOString(),
    durationFromTimestampsSeconds: firstTimestamp === null || lastTimestamp === null ? null : (lastTimestamp - firstTimestamp) / 1000,
    heartRate: {
      unit: "bpm",
      sampleCount: heartRates.length,
      min: heartRates.length ? Math.min(...heartRates.map((item) => item.value)) : null,
      max: heartRates.length ? Math.max(...heartRates.map((item) => item.value)) : null,
      arithmeticAverage: average(heartRates.map((item) => item.value)),
      timeWeightedAverage: hrCoveredSeconds > 0 ? hrArea / hrCoveredSeconds : null,
      coveredSeconds: hrCoveredSeconds,
    },
    samplingQuality: {
      intervalsCount: Math.max(0, validRows.length - 1),
      intervalsOver30Seconds,
      maxGapSeconds,
      note: "Zeitgewichtung nutzt trapezförmige Interpolation zwischen benachbarten gültigen Messpunkten; lange Lücken werden separat ausgewiesen.",
    },
    scalingChecks: {
      speed: {
        comparedIntervals: speedComparisons.length,
        averageDistanceDeltaPerSecond: average(distanceSpeeds),
        averageGarminRawSpeed: average(rawSpeeds),
        averageGarminRawSpeedTimes0_1: average(scaledSpeeds),
        meanAbsoluteErrorRaw: meanAbsoluteError(distanceSpeeds, rawSpeeds),
        meanAbsoluteErrorTimes0_1: meanAbsoluteError(distanceSpeeds, scaledSpeeds),
        note: "Vergleich von kumulierter Distanzänderung pro Zeitintervall mit Garmin-Geschwindigkeit; Stichprobenwerte können wegen unregelmäßiger Intervalle voneinander abweichen.",
      },
      verticalSpeed: {
        comparedIntervals: verticalComparisons.length,
        averageElevationChangePerSecond: average(elevationRates),
        averageGarminRawVerticalSpeed: average(rawVerticalSpeeds),
        averageGarminRawVerticalSpeedTimes0_1: average(scaledVerticalSpeeds),
        meanAbsoluteErrorRaw: meanAbsoluteError(elevationRates, rawVerticalSpeeds),
        meanAbsoluteErrorTimes0_1: meanAbsoluteError(elevationRates, scaledVerticalSpeeds),
        note: "Vergleich der Höhenänderung pro Zeitintervall mit direkter vertikaler Geschwindigkeit; Höhen- und Geschwindigkeitswerte bleiben unskaliert.",
      },
    },
    fieldSummaries,
    samples: {
      firstFive: validRows.slice(0, 5).map(toSample),
      lastFive: validRows.slice(-5).map(toSample),
    },
    excludedFromSamples: ["directLatitude", "directLongitude"],
    note: "Nur-Lese-Aufbereitung. Zeitstempel als Unix-Millisekunden; Herzfrequenz gemäß Garmin-Deskriptor in bpm. Skalierungsvarianten werden verglichen, nicht automatisch auf Rohwerte angewendet.",
  };
}

function summarizeActivityJson(payload: unknown) {
  const arrayPaths: Array<{ path: string; length: number }> = [];
  const matchingPaths: string[] = [];
  const seen = new Set<object>();
  const walk = (value: unknown, path = "$", depth = 0) => {
    if (depth > 8 || value == null || typeof value !== "object") return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    if (Array.isArray(value)) {
      arrayPaths.push({ path, length: value.length });
      if (/(sample|record|detail|heart.?rate|hr|time|timestamp)/i.test(path)) matchingPaths.push(path);
      value.slice(0, 3).forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (/(sample|record|detail|heart.?rate|timestamp|start.?time|elapsed.?time)/i.test(key)) matchingPaths.push(childPath);
      walk(child, childPath, depth + 1);
    }
  };
  walk(payload);
  return {
    present: payload != null,
    topLevelType: Array.isArray(payload) ? "array" : typeof payload,
    topLevelKeys: payload && typeof payload === "object" && !Array.isArray(payload)
      ? Object.keys(payload as Record<string, unknown>)
      : [],
    arrays: arrayPaths,
    relevantPaths: [...new Set(matchingPaths)].slice(0, 100),
  };
}


async function withGarminSyncLock<T>(
  admin: ReturnType<typeof createClient>,
  userId: string,
  work: (assertLock: () => void) => Promise<T>,
): Promise<T | null> {
  const lockToken = crypto.randomUUID();
  const { data: acquired, error: lockError } = await admin.rpc("try_acquire_garmin_sync_lock", {
    p_user_id: userId,
    p_lock_token: lockToken,
    p_lease_seconds: 900,
  });
  if (lockError) throw lockError;
  if (acquired !== true) return null;

  let lost = false;
  let lastConfirmedAt = Date.now();
  let heartbeat: Promise<void> | null = null;
  const assertLock = () => {
    if (lost || Date.now() - lastConfirmedAt >= 12 * 60 * 1000) {
      throw new Error("Die Garmin-Synchronisierungssperre ist nicht mehr gültig. Der Import wurde sicherheitshalber angehalten.");
    }
  };
  const timer = setInterval(() => {
    if (heartbeat) return;
    heartbeat = (async () => {
      try {
        const { data: renewed, error } = await admin.rpc("renew_garmin_sync_lock", {
          p_user_id: userId,
          p_lock_token: lockToken,
          p_lease_seconds: 900,
        });
        if (error) {
          console.error("Garmin sync lock renewal failed; the last confirmed lease remains valid until expiry:", error);
        } else if (renewed !== true) {
          lost = true;
          console.error("Garmin sync lock ownership was lost; the current sync will stop at its next checkpoint.");
        } else {
          lastConfirmedAt = Date.now();
        }
      } catch (error) {
        console.error("Garmin sync lock renewal request failed; the current lease remains active until expiry:", error);
      }
    })().finally(() => { heartbeat = null; });
  }, 60_000);

  try {
    assertLock();
    return await work(assertLock);
  } finally {
    clearInterval(timer);
    if (heartbeat) await heartbeat;
    try {
      const { error: releaseError } = await admin.rpc("release_garmin_sync_lock", {
        p_user_id: userId,
        p_lock_token: lockToken,
      });
      if (releaseError) console.error("Garmin sync lock release failed; the lease will expire automatically:", releaseError);
    } catch (releaseError) {
      console.error("Garmin sync lock release request failed; the lease will expire automatically:", releaseError);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Supabase-Umgebungsvariablen sind unvollständig.");

    const body = await req.json();
    const action = body?.action;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Server-to-server entry point for Supabase Cron. The shared secret is
    // stored only in Edge Function secrets and Supabase Vault, never in the app.
    if (action === "background-sync") {
      const expectedSecret = Deno.env.get("GARMIN_CRON_SECRET");
      const suppliedSecret = req.headers.get("x-garmin-cron-secret") ?? "";
      if (!expectedSecret || suppliedSecret.length < 32 || suppliedSecret !== expectedSecret) {
        return json(401, { error: "Nicht autorisierter Hintergrundabruf." });
      }
      const { data: connections, error: connectionError } = await admin
        .from("garmin_connections").select("user_id").eq("status", "connected");
      if (connectionError) throw connectionError;

      // The scheduled job runs at 07:00 UTC: 08:00 in German winter time
      // and 09:00 in German summer time. Use the athlete's local calendar date,
      // not the database/worker UTC date, for Garmin's daily health records.
      const today = dateInTimeZone(new Date(), "Europe/Berlin");
      const yesterday = addUtcDays(today, -1);
      const results = [];

      for (const connection of connections ?? []) {
        try {
          const result = await withGarminSyncLock(admin, connection.user_id, async (assertLock) => {
            const captureSyncError = (error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              if (/Synchronisierungssperre/i.test(message)) throw error;
              const rateLimited = /HTTP\s*429|rate.?limit/i.test(message);
              return {
                status: rateLimited ? "rate_limited" : "error",
                rateLimited,
                retryInSeconds: rateLimited ? 60 : 0,
                error: message.slice(0, 300),
              };
            };

            // Refresh yesterday and today so sleep/HRV values that were not
            // complete during an earlier app sync are fetched again in the morning.
            let healthSync;
            try {
              healthSync = await syncGarminHealthHistoryBatch(
                admin, connection.user_id, yesterday, today, true, true,
                2, "health_morning", false, assertLock
              );
            } catch (error) {
              healthSync = captureSyncError(error);
            }

            // Prioritize overnight health data. If Garmin rate-limits the
            // account, defer activity requests rather than worsening the limit.
            let activitySync;
            if (healthSync?.status === "rate_limited" || healthSync?.rateLimited === true) {
              activitySync = { status: "deferred", reason: "garmin_rate_limited_during_health_sync" };
            } else {
              try {
                activitySync = await syncGarminActivitiesAutomaticBatch(
                  admin, connection.user_id, today, assertLock
                );
              } catch (error) {
                activitySync = captureSyncError(error);
              }
            }

            const partial = ["error", "rate_limited", "partial"].includes(String(healthSync?.status || ""))
              || ["error", "rate_limited", "partial"].includes(String(activitySync?.status || ""));
            return { date: today, healthSync, activitySync, partial };
          });

          results.push(result === null
            ? { userId: connection.user_id, status: "skipped", reason: "sync_already_running" }
            : { userId: connection.user_id, ...result });
        } catch (syncError) {
          const message = syncError instanceof Error ? syncError.message.slice(0, 300) : "Unbekannter Fehler.";
          await admin.from("garmin_connections").update({
            last_error: message,
            updated_at: new Date().toISOString(),
          }).eq("user_id", connection.user_id);
          results.push({ userId: connection.user_id, status: "error", error: message });
        }
      }
      return json(200, { ok: true, processed: results.length, date: today, results });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Anmeldung erforderlich." });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json(401, { error: "Sitzung ungültig. Bitte erneut anmelden." });
    const userId = userData.user.id;

    if (action === "connect") {
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (apiKey.length < 20 || apiKey.length > 500) return json(400, { error: "Der Garmin-Schlüssel hat ein unerwartetes Format." });

      // Validate first; never persist a key that Garmin did not accept.
      await garminToken(apiKey);
      const encrypted = await encryptSecret(apiKey);
      const { error: saveError } = await admin.from("garmin_personal_credentials").upsert({
        user_id: userId,
        encrypted_api_key: encrypted.ciphertext,
        encryption_iv: encrypted.iv,
        key_version: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (saveError) throw saveError;

      const { error: registryError } = await admin.from("garmin_connections").upsert({
        user_id: userId,
        status: "connected",
        connected_at: new Date().toISOString(),
        last_error: null,
      }, { onConflict: "user_id" });
      if (registryError) throw registryError;
      return json(200, { ok: true, status: "connected", message: "Garmin-Schlüssel wurde geprüft und verschlüsselt gespeichert." });
    }

    if (action === "sync-today") {
      const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
      if (!date) return json(400, { error: "Für den Garmin-Tagesabgleich wurde kein gültiges lokales Datum übergeben." });
      const sync = await withGarminSyncLock(admin, userId, async (assertLock) => {
        const captureSyncError = (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (/Synchronisierungssperre/i.test(message)) throw error;
          const rateLimited = /HTTP\s*429|rate.?limit/i.test(message);
          return {
            status: rateLimited ? "rate_limited" : "error",
            rateLimited,
            retryInSeconds: rateLimited ? 60 : 0,
            error: message,
          };
        };

        // Automatic activities and health use separate persisted cursors.
        // Each subsystem is allowed to fail without suppressing the other.
        let activitySync;
        try {
          activitySync = await syncGarminActivitiesAutomaticBatch(admin, userId, date, assertLock);
        } catch (error) {
          activitySync = captureSyncError(error);
        }

        let healthSync;
        try {
          healthSync = await syncGarminHealthAutomaticBatch(admin, userId, date, assertLock);
        } catch (error) {
          healthSync = captureSyncError(error);
        }

        const partial = ["error", "rate_limited", "partial"].includes(String(activitySync?.status || ""))
          || ["error", "rate_limited", "partial"].includes(String(healthSync?.status || ""));
        return { date, activitySync, healthSync, partial };
      });
      if (sync === null) return json(409, { ok: false, code: "garmin_sync_already_running", error: "Für dieses Garmin-Konto läuft bereits eine Synchronisierung. Bitte warte, bis sie abgeschlossen ist." });
      return json(200, { ok: true, sync });
    }

    if (action === "sync-range") {
      const startDate = typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : "";
      const endDate = typeof body.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate) ? body.endDate : "";
      const today = new Date().toISOString().slice(0, 10);
      if (!startDate || !endDate || startDate > endDate || endDate > today) {
        return json(400, { error: "Bitte wähle einen gültigen Zeitraum bis einschließlich heute." });
      }
      const onlyMissingDays = body.onlyMissingDays === true;
      const activityRescanEndDate = typeof body.activityRescanEndDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(body.activityRescanEndDate) &&
        body.activityRescanEndDate >= endDate && body.activityRescanEndDate <= today
        ? body.activityRescanEndDate
        : endDate;
      const sync = await withGarminSyncLock(admin, userId, async (assertLock) => {
        const activitySync = body.includeActivities === false
          ? null
          : await syncGarminActivitiesForUser(admin, userId, startDate, endDate, onlyMissingDays, activityRescanEndDate, 14, assertLock);
        // Activity coverage and health-history cursor are independent. Do not restart
        // a completed health range just because activity sync is incremental.
        const healthSync = await syncGarminHealthHistoryBatch(admin, userId, startDate, endDate, false, false, 1, "health_history", false, assertLock);
        return { startDate, endDate, activitySync, healthSync };
      });
      if (sync === null) return json(409, { ok: false, code: "garmin_sync_already_running", error: "Für dieses Garmin-Konto läuft bereits eine Synchronisierung. Bitte warte, bis sie abgeschlossen ist." });
      return json(200, { ok: true, sync });
    }

    if (action === "sync-health-history-batch") {
      const result = await withGarminSyncLock(admin, userId, (assertLock) =>
        syncGarminHealthHistoryBatch(admin, userId, "2020-01-01", new Date().toISOString().slice(0, 10), false, false, 1, "health_history", false, assertLock)
      );
      if (result === null) return json(409, { ok: false, code: "garmin_sync_already_running", error: "Für dieses Garmin-Konto läuft bereits eine Synchronisierung. Bitte warte, bis sie abgeschlossen ist." });
      return json(200, { ok: true, sync: result });
    }

    if (action === "sync-activities") {
      const endDate = new Date().toISOString().slice(0, 10);
      const startDate = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const result = await withGarminSyncLock(admin, userId, (assertLock) =>
        syncGarminActivitiesForUser(admin, userId, startDate, endDate, false, endDate, 14, assertLock)
      );
      if (result === null) return json(409, { ok: false, code: "garmin_sync_already_running", error: "Für dieses Garmin-Konto läuft bereits eine Synchronisierung. Bitte warte, bis sie abgeschlossen ist." });
      return json(200, { ok: true, sync: result });
    }

    if (action === "preview-activities") {
      const { data: credential, error: credentialError } = await admin
        .from("garmin_personal_credentials")
        .select("encrypted_api_key, encryption_iv")
        .eq("user_id", userId)
        .maybeSingle();
      if (credentialError) throw credentialError;
      if (!credential) return json(409, { error: "Für dieses Konto ist kein Garmin-Schlüssel hinterlegt." });

      const apiKey = await decryptSecret(credential.encrypted_api_key, credential.encryption_iv);
      const token = await garminToken(apiKey);

      const today = new Date();
      const endDate = typeof body.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate)
        ? body.endDate
        : today.toISOString().slice(0, 10);
      const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const startDate = typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
        ? body.startDate
        : defaultStart;
      if (startDate > endDate) return json(400, { error: "Der Starttermin liegt nach dem Endtermin." });

      const params = new URLSearchParams({ start: "0", limit: "100", startDate, endDate });
      const payload = await garminGet(token, `/activitylist-service/activities/search/activities?${params.toString()}`);
      const rows = activityRows(payload);
      const activities = rows.slice(0, 100).map(safeActivityPreview);
      return json(200, {
        ok: true,
        preview: {
          startDate,
          endDate,
          count: activities.length,
          hasMore: activities.length === 100,
          activities,
        },
      });
    }

    if (action === "diagnose-activity-json") {
      const activityId = typeof body.activityId === "string" ? body.activityId : String(body.activityId ?? "");
      // This diagnostic is intentionally restricted to the single activity
      // explicitly approved for inspection. It performs no database writes.
      if (activityId !== "25077002341") {
        return json(403, { error: "Diese Nur-Lese-Diagnose ist auf die freigegebene Aktivität beschränkt." });
      }

      const { data: stored, error: storedError } = await admin
        .from("garmin_activity_details")
        .select("activity_detail, detail_synced_at, fit_object_path")
        .eq("user_id", userId)
        .eq("garmin_activity_id", activityId)
        .maybeSingle();
      if (storedError) throw storedError;

      const { data: credential, error: credentialError } = await admin
        .from("garmin_personal_credentials")
        .select("encrypted_api_key, encryption_iv")
        .eq("user_id", userId)
        .maybeSingle();
      if (credentialError) throw credentialError;
      if (!credential) return json(409, { error: "Für dieses Konto ist kein Garmin-Schlüssel hinterlegt." });

      const apiKey = await decryptSecret(credential.encrypted_api_key, credential.encryption_iv);
      const token = await garminToken(apiKey);
      const remote = await garminGet(token, `/activity-service/activity/${encodeURIComponent(activityId)}`);

      // Separate read-only probe for the activity time-series/detail endpoint.
      // Keep this independent so an unavailable details route does not hide the summary result.
      let remoteDetails: unknown = null;
      let remoteDetailsError: string | null = null;
      try {
        remoteDetails = await garminGet(token, `/activity-service/activity/${encodeURIComponent(activityId)}/details`);
      } catch (detailsError) {
        remoteDetailsError = detailsError instanceof Error
          ? detailsError.message.slice(0, 300)
          : "Unbekannter Fehler beim Abruf der Aktivitätsdetails.";
      }

      const detailRecord = remoteDetails && typeof remoteDetails === "object"
        ? remoteDetails as Record<string, unknown>
        : {};
      const descriptors = Array.isArray(detailRecord.metricDescriptors)
        ? detailRecord.metricDescriptors.slice(0, 32)
        : [];
      const detailRows = Array.isArray(detailRecord.activityDetailMetrics)
        ? detailRecord.activityDetailMetrics.slice(0, 3)
        : [];
      const heartRateDtos = detailRecord.heartRateDTOs;
      const heartRatePreview = Array.isArray(heartRateDtos)
        ? { type: "array", length: heartRateDtos.length, firstItems: heartRateDtos.slice(0, 3) }
        : heartRateDtos && typeof heartRateDtos === "object"
          ? { type: "object", keys: Object.keys(heartRateDtos as Record<string, unknown>), preview: heartRateDtos }
          : { type: typeof heartRateDtos, value: heartRateDtos ?? null };

      return json(200, {
        ok: true,
        readOnly: true,
        activityId,
        database: {
          rowFound: Boolean(stored),
          detailSyncedAt: stored?.detail_synced_at ?? null,
          fitObjectPathPresent: Boolean(stored?.fit_object_path),
          summary: summarizeActivityJson(stored?.activity_detail ?? null),
        },
        garmin: {
          summary: summarizeActivityJson(remote),
          details: summarizeActivityJson(remoteDetails),
          detailsPreview: {
            measurementCount: detailRecord.measurementCount ?? null,
            metricsCount: detailRecord.metricsCount ?? null,
            totalMetricsCount: detailRecord.totalMetricsCount ?? null,
            detailsAvailable: detailRecord.detailsAvailable ?? null,
            metricDescriptors: descriptors,
            firstDetailRows: detailRows,
            heartRateDTOs: heartRatePreview,
            preparedTimeSeries: prepareActivityTimeSeries(detailRecord),
          },
          detailsError: remoteDetailsError,
        },
        note: "Es wurden keine Daten geschrieben und keine FIT-Datei abgerufen.",
      });
    }

    if (action === "import-activity-json") {
      const activityId = typeof body.activityId === "string" ? body.activityId : String(body.activityId ?? "");
      // Authentifizierte Nutzer können ausschließlich Aktivitäten ihres eigenen
      // verbundenen Garmin-Kontos abrufen. Die ID muss numerisch sein.
      if (!/^\d+$/.test(activityId)) {
        return json(400, { error: "Ungültige Garmin-Aktivitäts-ID." });
      }
      const { data: credential, error: credentialError } = await admin
        .from("garmin_personal_credentials")
        .select("encrypted_api_key, encryption_iv")
        .eq("user_id", userId)
        .maybeSingle();
      if (credentialError) throw credentialError;
      if (!credential) return json(409, { error: "Für dieses Konto ist kein Garmin-Schlüssel hinterlegt." });

      const apiKey = await decryptSecret(credential.encrypted_api_key, credential.encryption_iv);
      const token = await garminToken(apiKey);
      const remoteDetails = await garminGet(token, `/activity-service/activity/${encodeURIComponent(activityId)}/details`);
      if (!remoteDetails || typeof remoteDetails !== "object") {
        return json(422, { error: "Garmin hat keine Aktivitätszeitreihe geliefert." });
      }
      const telemetry = buildGarminJsonTelemetry(remoteDetails as Record<string, unknown>);
      return json(200, {
        ok: true,
        readOnly: true,
        activityId,
        telemetry,
        note: "Garmin-JSON wurde abgerufen und aufbereitet. Der Server hat keine Datenbankänderung und keinen FIT-Download ausgeführt.",
      });
    }

    if (action === "download-fit") {
      const activityId = typeof body.activityId === "string" ? body.activityId : String(body.activityId ?? "");
      if (!/^\d+$/.test(activityId)) return json(400, { error: "Ungültige Garmin-Aktivitäts-ID." });
      const { data: credential, error: credentialError } = await admin
        .from("garmin_personal_credentials")
        .select("encrypted_api_key, encryption_iv")
        .eq("user_id", userId)
        .maybeSingle();
      if (credentialError) throw credentialError;
      if (!credential) return json(409, { error: "Für dieses Konto ist kein Garmin-Schlüssel hinterlegt." });
      const apiKey = await decryptSecret(credential.encrypted_api_key, credential.encryption_iv);
      const token = await garminToken(apiKey);
      const zipBase64 = await garminDownloadFit(token, activityId);
      return json(200, { ok: true, activityId, zipBase64 });
    }

    if (action === "disconnect") {
      const { error: deleteError } = await admin.from("garmin_personal_credentials").delete().eq("user_id", userId);
      if (deleteError) throw deleteError;
      const { error: updateError } = await admin.from("garmin_connections").upsert({
        user_id: userId, status: "disconnected", last_error: null,
      }, { onConflict: "user_id" });
      if (updateError) throw updateError;
      return json(200, { ok: true, status: "disconnected" });
    }

    if (action === "status") {
      const { data, error } = await admin.from("garmin_connections")
        .select("status, connected_at, last_activity_sync_at, last_health_sync_at, last_error")
        .eq("user_id", userId).maybeSingle();
      if (error) throw error;
      const { data: syncState, error: syncStateError } = await admin.from("garmin_sync_state")
        .select("status, cursor_date, range_end_date, last_success_at, last_error")
        .eq("user_id", userId).eq("sync_type", "health_history").maybeSingle();
      if (syncStateError) throw syncStateError;
      return json(200, {
        ok: true,
        connection: data ?? { status: "disconnected" },
        syncState: syncState ?? null,
      });
    }

    return json(400, { error: "Unbekannte Aktion." });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Unbekannter Fehler." });
  }
});