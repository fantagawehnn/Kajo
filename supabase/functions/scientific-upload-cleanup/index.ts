import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET_ID = "kajo-scientific-documents";
const MAX_BODY_BYTES = 128;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function constantTimeSecretMatch(expected: string, supplied: string): boolean {
  const expectedBytes = new TextEncoder().encode(expected);
  const suppliedBytes = new TextEncoder().encode(supplied);
  let difference = expectedBytes.length ^ suppliedBytes.length;
  const length = Math.max(expectedBytes.length, suppliedBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (suppliedBytes[index] ?? 0);
  }
  return difference === 0;
}

async function readSmallJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("INVALID_CONTENT_TYPE");
  }
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("BODY_TOO_LARGE");
  }
  if (!request.body) throw new Error("INVALID_BODY");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const enabled = Deno.env.get("SCIENTIFIC_UPLOAD_CLEANUP_ENABLED") === "true";
  const expectedSecret = Deno.env.get("SCIENTIFIC_UPLOAD_CLEANUP_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-kajo-cleanup-secret") ?? "";
  if (!enabled || expectedSecret.length < 32 ||
      !constantTimeSecretMatch(expectedSecret, suppliedSecret)) {
    return json(404, { error: "Not found" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Scientific upload cleanup configuration is incomplete.");
    return json(503, { error: "Service unavailable" });
  }

  let body: unknown;
  try {
    body = await readSmallJson(request);
  } catch {
    return json(400, { error: "Invalid request body" });
  }
  if (!isRecord(body) || body.action !== "run") {
    return json(400, { error: "Invalid request" });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // One document per invocation keeps the 15-minute claim lease conservative.
    const { data: claimedRows, error: claimError } = await admin.rpc(
      "kajo_claim_expired_scientific_uploads",
      { p_limit: 1 },
    );
    if (claimError || !Array.isArray(claimedRows)) {
      console.error("Scientific upload cleanup: claim operation failed.");
      return json(503, { error: "Could not claim expired upload" });
    }

    if (claimedRows.length === 0) {
      return json(200, {
        claimed_count: 0,
        finalized_count: 0,
        retry_required: false,
        deferred: false,
      });
    }

    const item = claimedRows[0];
    if (
      !isRecord(item) ||
      !isUuid(item.document_id) ||
      !isUuid(item.source_id) ||
      !isUuid(item.claim_token) ||
      typeof item.lease_expires_at !== "string" ||
      !Number.isFinite(Date.parse(item.lease_expires_at)) ||
      Date.parse(item.lease_expires_at) <= Date.now() ||
      typeof item.cleanup_ready_at !== "string" ||
      !Number.isFinite(Date.parse(item.cleanup_ready_at)) ||
      typeof item.storage_path !== "string" ||
      item.storage_path.split("/").length !== 3 ||
      !isUuid(item.storage_path.split("/")[0]) ||
      item.storage_path.split("/")[0] !== item.source_id ||
      item.storage_path !== `${item.source_id}/${item.document_id}/original.pdf`
    ) {
      console.error("Scientific upload cleanup: claim returned an invalid object reference.");
      return json(503, { error: "Invalid cleanup claim" });
    }

    if (Date.parse(item.cleanup_ready_at) > Date.now()) {
      return json(200, {
        claimed_count: 1,
        finalized_count: 0,
        retry_required: false,
        deferred: true,
        cleanup_ready_at: item.cleanup_ready_at,
      });
    }

    const { error: removeError } = await admin.storage
      .from(BUCKET_ID)
      .remove([item.storage_path]);
    if (removeError) {
      console.error("Scientific upload cleanup: Storage deletion failed.");
      return json(503, { error: "Storage cleanup failed; retry required" });
    }

    const { data: finalized, error: finalizeError } = await admin.rpc(
      "kajo_finalize_expired_scientific_upload",
      {
        p_document_id: item.document_id,
        p_claim_token: item.claim_token,
      },
    );
    if (finalizeError || finalized !== true) {
      console.error("Scientific upload cleanup: metadata finalization did not complete.");
      return json(503, { error: "Metadata finalization failed; retry required" });
    }

    return json(200, {
      claimed_count: 1,
      finalized_count: 1,
      retry_required: false,
      deferred: false,
    });
  } catch {
    console.error("Scientific upload cleanup request failed unexpectedly.");
    return json(500, { error: "Internal server error" });
  }
});
