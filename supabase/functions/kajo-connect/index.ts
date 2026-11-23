import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kajo.fantagawehn.workers.dev",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

function json(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(length: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(length)));
}

async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function pairingCodeHash(code: string): Promise<string> {
  const pepper = Deno.env.get("KAJO_CONNECT_PAIRING_PEPPER");
  if (!pepper || pepper.length < 32) throw new Error("KAJO_CONNECT_PAIRING_PEPPER is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(code));
  return hex(new Uint8Array(signature));
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

async function tokenEncryptionKey(): Promise<CryptoKey> {
  const encoded = Deno.env.get("KAJO_CONNECT_TOKEN_ENCRYPTION_KEY");
  if (!encoded) throw new Error("KAJO_CONNECT_TOKEN_ENCRYPTION_KEY is not configured.");
  const raw = decodeBase64(encoded);
  if (raw.length !== 32) throw new Error("KAJO_CONNECT_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await tokenEncryptionKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return {
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    iv: encodeBase64(iv),
  };
}

async function decryptToken(ciphertext: string, iv: string): Promise<string> {
  const key = await tokenEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(iv) },
    key,
    decodeBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function requestIdentity(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || forwarded
    || "unknown";
}

async function consumeRateLimit(
  admin: ReturnType<typeof createClient>,
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const bucketKey = await pairingCodeHash(scope + ":" + identity);
  const { data, error } = await admin.rpc("kajo_connect_consume_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("Supabase authentication configuration is incomplete.");
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(date: string, amount: number): string {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function adaptiveZones(
  date: string,
  profile: JsonRecord,
  settings: JsonRecord,
  checkins: JsonRecord,
) {
  const maxHr = Number(profile.maxHr);
  if (!Number.isFinite(maxHr) || maxHr < 100 || maxHr > 240) return null;

  const zoneSettings = settings.heartRateZoneSettings && typeof settings.heartRateZoneSettings === "object"
    ? settings.heartRateZoneSettings as JsonRecord
    : {};
  const configuredWindow = Number(zoneSettings.restingHrWindowDays ?? 14);
  const days = Math.min(28, Math.max(3, Math.round(configuredWindow) || 14));
  const startDate = addDays(date, -(days - 1));
  const readings: number[] = [];

  for (const [key, row] of Object.entries(checkins)) {
    if (key < startDate || key > date || !row || typeof row !== "object") continue;
    const value = Number((row as JsonRecord).garminRhr);
    if (Number.isFinite(value) && value >= 30 && value <= 120) readings.push(value);
  }

  let restingHr: number | null = null;
  let source = "unavailable";
  let quality = "unavailable";
  const minimumReadings = Math.max(3, Math.ceil(days * 0.6));
  if (readings.length >= minimumReadings) {
    readings.sort((a, b) => a - b);
    const middle = Math.floor(readings.length / 2);
    restingHr = readings.length % 2
      ? readings[middle]
      : (readings[middle - 1] + readings[middle]) / 2;
    restingHr = Number(restingHr.toFixed(1));
    source = "rolling-median";
    quality = "sufficient";
  } else {
    const fallback = Number(profile.restingHr);
    if (Number.isFinite(fallback) && fallback >= 30 && fallback <= 120) {
      restingHr = fallback;
      source = "profile-fallback";
      quality = "limited";
    }
  }

  if (restingHr == null || maxHr <= restingHr + 20) return null;
  const reserve = maxHr - restingHr;
  const upperBounds = [0.6, 0.7, 0.8, 0.9].map((fraction) =>
    Math.round(restingHr! + reserve * fraction)
  );
  if (!upperBounds.every((value, index) => index === 0 || value > upperBounds[index - 1])) return null;

  return {
    date,
    zones: upperBounds,
    source,
    quality,
    windowDays: days,
    readingCount: readings.length,
  };
}

type PlannedWorkoutStep = {
  id: string;
  type: "warmup" | "work" | "recovery" | "cooldown" | "other";
  label: string;
  durationSeconds: number;
  target: string | null;
};

type PlannedSession = {
  id: string | number | null;
  date: string;
  name: string;
  type: string;
  duration: unknown;
  targetTss: unknown;
  category: string | null;
  desc: string | null;
  discipline: string | null;
  raceFormat: string | null;
  waterType: string | null;
  intensity: string | null;
  objective: string | null;
  warmup: string | null;
  mainSet: string | null;
  cooldown: string | null;
  notes: string | null;
  steps: PlannedWorkoutStep[];
};

function safeWorkoutSteps(value: unknown): PlannedWorkoutStep[] {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set(["warmup", "work", "recovery", "cooldown", "other"]);
  const steps: PlannedWorkoutStep[] = [];
  for (const [index, raw] of value.slice(0, 40).entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const step = raw as JsonRecord;
    const label = typeof step.label === "string" ? step.label.trim().slice(0, 80) : "";
    const durationSeconds = Number(step.durationSeconds);
    const type = typeof step.type === "string" && allowedTypes.has(step.type) ? step.type as PlannedWorkoutStep["type"] : "other";
    if (!label || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 21600) continue;
    steps.push({
      id: typeof step.id === "string" ? step.id.slice(0, 80) : "step-" + (index + 1),
      type, label, durationSeconds,
      target: typeof step.target === "string" ? step.target.trim().slice(0, 120) || null : null,
    });
  }
  return steps;
}

const ALLOWED_DISPLAY_METRICS = new Set([
  "speedNow", "speedAvg", "speedMax", "heartRate", "heartRateZone",
  "heartRateAvg", "heartRateMax", "distance", "elapsed", "calories",
  "cadence", "power", "trainingEffect", "altitude", "ascent", "descent", "gpsAccuracy",
]);

function safeDisplayLayouts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { id: "layout-" + (index + 1), name: "Datenseite " + (index + 1), metrics: [] };
    }
    const source = raw as JsonRecord;
    const seen = new Set<string>();
    const metrics = (Array.isArray(source.metrics) ? source.metrics : [])
      .filter((metric): metric is JsonRecord => Boolean(metric) && typeof metric === "object" && !Array.isArray(metric))
      .filter((metric) => typeof metric.id === "string" && ALLOWED_DISPLAY_METRICS.has(metric.id))
      .filter((metric) => {
        const id = metric.id as string;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 4);
    const defaultPositions = metrics.length === 1 ? [4]
      : metrics.length === 2 ? [0, 1]
      : metrics.length === 3 ? [0, 1, 4] : [0, 1, 2, 3];
    const usedPositions = new Set<number>();
    const safeMetrics = metrics.map((metric, metricIndex) => {
      let position = Number.isInteger(metric.position) && Number(metric.position) >= 0 && Number(metric.position) <= 4
        ? Number(metric.position) : defaultPositions[metricIndex];
      if (usedPositions.has(position)) {
        position = defaultPositions[metricIndex];
        if (usedPositions.has(position)) {
          position = [0, 1, 2, 3, 4].find((candidate) => !usedPositions.has(candidate)) ?? defaultPositions[metricIndex];
        }
      }
      usedPositions.add(position);
      return {
        id: metric.id,
        size: ["small", "medium", "large"].includes(String(metric.size)) ? metric.size : "medium",
        position,
      };
    });
    return { id: "layout-" + (index + 1), name: "Datenseite " + (index + 1), metrics: safeMetrics };
  });
}

function safePlannedSession(value: unknown): PlannedSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const session = value as JsonRecord;
  if (!validDate(session.date)) return null;
  return {
    id: typeof session.id === "string" ? session.id.slice(0, 80) : typeof session.id === "number" ? session.id : null,
    date: session.date,
    name: typeof session.name === "string" ? session.name.slice(0, 120) : "Geplante Einheit",
    type: typeof session.type === "string" ? session.type.slice(0, 60) : "Training",
    duration: typeof session.duration === "number" ? session.duration : typeof session.duration === "string" ? session.duration.slice(0, 30) : null,
    targetTss: typeof session.targetTss === "number" ? session.targetTss : typeof session.targetTss === "string" ? session.targetTss.slice(0, 30) : null,
    category: typeof session.category === "string" ? session.category.slice(0, 80) : null,
    desc: typeof session.desc === "string" ? session.desc.slice(0, 200) : null,
    discipline: typeof session.discipline === "string" ? session.discipline.slice(0, 40) : null,
    raceFormat: typeof session.raceFormat === "string" ? session.raceFormat.slice(0, 40) : null,
    waterType: typeof session.waterType === "string" ? session.waterType.slice(0, 40) : null,
    intensity: typeof session.intensity === "string" ? session.intensity.slice(0, 120) : null,
    objective: typeof session.objective === "string" ? session.objective.slice(0, 300) : null,
    warmup: typeof session.warmup === "string" ? session.warmup.slice(0, 300) : null,
    mainSet: typeof session.mainSet === "string" ? session.mainSet.slice(0, 500) : null,
    cooldown: typeof session.cooldown === "string" ? session.cooldown.slice(0, 300) : null,
    notes: typeof session.notes === "string" ? session.notes.slice(0, 300) : null,
    steps: safeWorkoutSteps(session.steps),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: JsonRecord;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { error: "A JSON object is required." });
    }
    body = parsed as JsonRecord;
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  try {
    const admin = adminClient();
    const action = body.action;

    // The watch creates a short-lived pairing request and retains the poll secret.
    if (action === "create-pairing") {
      if (!await consumeRateLimit(admin, "pairing-create", requestIdentity(request), 5, 600)) {
        return json(429, { error: "Too many pairing requests. Wait a few minutes and try again." });
      }
      const code = (BigInt("0x" + randomHex(8)) % 1000000000000n).toString().padStart(12, "0");
      const pollSecret = randomHex(32);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { error: cleanupError } = await admin.from("kajo_connect_pairing_requests")
        .delete().lt("expires_at", new Date().toISOString());
      if (cleanupError) throw cleanupError;
      const oldRateLimitCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error: rateCleanupError } = await admin.from("kajo_connect_rate_limits")
        .delete().lt("updated_at", oldRateLimitCutoff);
      if (rateCleanupError) throw rateCleanupError;
      const deviceLabel = typeof body.deviceLabel === "string"
        ? body.deviceLabel.trim().slice(0, 80)
        : "KAJO Connect";
      const { error } = await admin.from("kajo_connect_pairing_requests").insert({
        code_hash: await pairingCodeHash(code),
        poll_secret_hash: await sha256(pollSecret),
        device_label: deviceLabel || "KAJO Connect",
        expires_at: expiresAt,
      });
      if (error) throw error;
      return json(200, { ok: true, code, pollSecret, expiresAt });
    }

    // The logged-in KAJO app claims the code. The user JWT is verified explicitly.
    if (action === "claim-pairing") {
      const user = await authenticatedUser(request);
      if (!user) return json(401, { error: "An authenticated KAJO account is required." });
      if (!await consumeRateLimit(admin, "pairing-claim", user.id, 5, 600)) {
        return json(429, { error: "Too many code attempts. Wait a few minutes and try again." });
      }
      const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
      if (!/^\d{12}$/.test(code)) return json(400, { error: "The pairing code must contain twelve digits." });

      const { data: pairing, error: lookupError } = await admin
        .from("kajo_connect_pairing_requests")
        .select("id,device_label")
        .eq("code_hash", await pairingCodeHash(code))
        .is("claimed_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!pairing) return json(404, { error: "The pairing code is invalid or has expired." });

      const deviceToken = randomHex(32);
      const encrypted = await encryptToken(deviceToken);
      const deviceId = crypto.randomUUID();
      const tokenHash = await sha256(deviceToken);
      const { data: deviceRegistered, error: registerError } = await admin.rpc(
        "kajo_connect_register_device",
        {
          p_device_id: deviceId,
          p_user_id: user.id,
          p_device_label: pairing.device_label,
          p_token_hash: tokenHash,
          p_max_devices: 5,
        },
      );
      if (registerError) throw registerError;
      if (deviceRegistered !== true) {
        return json(409, { error: "This KAJO account already has the maximum of five active devices." });
      }

      const { data: claimed, error: claimError } = await admin
        .from("kajo_connect_pairing_requests")
        .update({
          user_id: user.id,
          device_id: deviceId,
          token_ciphertext: encrypted.ciphertext,
          token_iv: encrypted.iv,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", pairing.id)
        .is("claimed_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("id")
        .maybeSingle();

      if (claimError || !claimed) {
        const { error: cleanupDeviceError } = await admin.from("kajo_connect_devices")
          .delete().eq("id", deviceId);
        if (cleanupDeviceError) throw cleanupDeviceError;
        if (claimError) throw claimError;
        return json(409, { error: "The pairing code has already been claimed." });
      }
      return json(200, { ok: true, status: "claimed", deviceLabel: pairing.device_label });
    }

    // Only the device holding both the displayed code and private poll secret can retrieve its token.
    if (action === "poll-pairing") {
      const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
      const pollSecret = typeof body.pollSecret === "string" ? body.pollSecret : "";
      if (!/^\d{12}$/.test(code) || !/^[a-f0-9]{64}$/.test(pollSecret)) {
        return json(400, { error: "Invalid pairing credentials." });
      }
      if (!await consumeRateLimit(admin, "pairing-poll", code + ":" + pollSecret, 15, 120)) {
        return json(429, { error: "Pairing polling is temporarily rate limited." });
      }

      const { data: pairing, error: lookupError } = await admin
        .from("kajo_connect_pairing_requests")
        .select("id,user_id,token_ciphertext,token_iv,token_delivered_at")
        .eq("code_hash", await pairingCodeHash(code))
        .eq("poll_secret_hash", await sha256(pollSecret))
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!pairing) return json(404, { error: "Pairing request not found or expired." });
      if (!pairing.user_id) return json(200, { ok: true, status: "pending" });
      if (!pairing.token_ciphertext || !pairing.token_iv) {
        return json(200, { ok: true, status: "claimed" });
      }

      // Keep the encrypted token available until the pairing request expires.
      // This lets the watch safely retry if the first HTTP response is lost.
      if (!pairing.token_delivered_at) {
        const { error: markError } = await admin
          .from("kajo_connect_pairing_requests")
          .update({ token_delivered_at: new Date().toISOString() })
          .eq("id", pairing.id)
          .is("token_delivered_at", null);
        if (markError) throw markError;
      }

      const deviceToken = await decryptToken(pairing.token_ciphertext, pairing.token_iv);
      return json(200, { ok: true, status: "paired", deviceToken });
    }

    // Device management is restricted to the currently authenticated KAJO account.
    if (action === "list-devices") {
      const user = await authenticatedUser(request);
      if (!user) return json(401, { error: "An authenticated KAJO account is required." });
      if (!await consumeRateLimit(admin, "device-list", user.id, 30, 60)) {
        return json(429, { error: "Too many device-list requests." });
      }
      const { data, error } = await admin
        .from("kajo_connect_devices")
        .select("id,device_label,created_at,last_seen_at,revoked_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json(200, { ok: true, devices: data ?? [] });
    }

    if (action === "revoke-device") {
      const user = await authenticatedUser(request);
      if (!user) return json(401, { error: "An authenticated KAJO account is required." });
      if (!await consumeRateLimit(admin, "device-revoke", user.id, 10, 60)) {
        return json(429, { error: "Too many device-revocation requests." });
      }
      const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)) {
        return json(400, { error: "Invalid device ID." });
      }
      const { data, error } = await admin
        .from("kajo_connect_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", deviceId)
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Active device not found for this account." });
      return json(200, { ok: true, status: "revoked" });
    }

    // All watch requests after pairing use a random bearer token; only its hash is stored.
    if (action === "sync") {
      const authorization = request.headers.get("Authorization") || "";
      const match = authorization.match(/^Bearer\s+([a-f0-9]{64})$/i);
      if (!match) return json(401, { error: "A valid device token is required." });
      const tokenHash = await sha256(match[1]);
      const { data: device, error: deviceError } = await admin
        .from("kajo_connect_devices")
        .select("id,user_id")
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .maybeSingle();
      if (deviceError) throw deviceError;
      if (!device) return json(401, { error: "This device is not paired or has been revoked." });
      if (!await consumeRateLimit(admin, "device-sync", device.id, 30, 60)) {
        return json(429, { error: "Device sync is temporarily rate limited." });
      }

      const now = new Date().toISOString();
      const { error: touchError } = await admin.from("kajo_connect_devices")
        .update({ last_seen_at: now }).eq("id", device.id);
      if (touchError) throw touchError;

      const { data: snapshot, error: snapshotError } = await admin
        .from("user_data")
        .select("data,version,updated_at")
        .eq("user_id", device.user_id)
        .maybeSingle();
      if (snapshotError) throw snapshotError;
      if (!snapshot?.data || typeof snapshot.data !== "object") {
        return json(200, { ok: true, schemaVersion: 1, plannedSessions: [], heartRateZones: null, displayLayouts: [], snapshotVersion: 0 });
      }

      const data = snapshot.data as JsonRecord;
      const localDate = validDate(body.localDate) ? body.localDate : now.slice(0, 10);
      const plannedRaw = Array.isArray(data.planned) ? data.planned : [];
      const plannedSessions = plannedRaw
        .map(safePlannedSession)
        .filter((session): session is PlannedSession => session !== null)
        .filter((session) => session.date >= addDays(localDate, -1) && session.date <= addDays(localDate, 14))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 30);

      const profile = data.profile && typeof data.profile === "object" ? data.profile as JsonRecord : {};
      const settings = data.settings && typeof data.settings === "object" ? data.settings as JsonRecord : {};
      const checkins = data.checkins && typeof data.checkins === "object" ? data.checkins as JsonRecord : {};
      const heartRateZones = adaptiveZones(localDate, profile, settings, checkins);
      const displayLayouts = safeDisplayLayouts(settings.kajoConnectDisplayLayouts);

      return json(200, {
        ok: true,
        schemaVersion: 1,
        serverTime: now,
        snapshotVersion: Number(snapshot.version || 1),
        snapshotUpdatedAt: snapshot.updated_at ?? null,
        plannedSessions,
        heartRateZones,
        displayLayouts,
      });
    }

    return json(400, { error: "Unknown action." });
  } catch (error) {
    console.error("KAJO Connect request failed:", error);
    return json(500, { error: "KAJO Connect request failed." });
  }
});
