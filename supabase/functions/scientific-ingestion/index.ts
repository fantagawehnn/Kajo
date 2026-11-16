import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET_ID = "kajo-scientific-documents";
const MAX_TITLE_LENGTH = 500;
const MAX_AUTHORS = 50;

function json(status: number, body: unknown, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanOptionalString(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 && cleaned.length <= maxLength ? cleaned : null;
}

function validAuthors(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_AUTHORS) return null;
  const authors = value.map((item) =>
    typeof item === "string" ? item.trim() : ""
  );
  if (authors.some((author) => !author || author.length > 300)) return null;
  return authors;
}

function validHttpsUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}


function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readJsonLimited(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_BODY");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
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

async function getOwnedPrivateDocument(
  admin: ReturnType<typeof createClient>,
  documentId: string,
  userId: string,
) {
  return await admin
    .from("scientific_documents")
    .select("id,owner_id,visibility,storage_path,mime_type,file_size_bytes,processing_status,extraction_version,expected_chunk_count")
    .eq("id", documentId)
    .eq("owner_id", userId)
    .eq("visibility", "private")
    .maybeSingle();
}

Deno.serve(async (request) => {
  const configuredOrigin = Deno.env.get("APP_ORIGIN");
  if (!configuredOrigin) {
    return new Response("Service unavailable", { status: 503 });
  }

  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && requestOrigin !== configuredOrigin) {
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": configuredOrigin,
        "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" }, configuredOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const maxUploadBytesRaw = Deno.env.get("MAX_UPLOAD_BYTES");
  const maxUploadBytes = Number(maxUploadBytesRaw);

  if (
    !supabaseUrl || !anonKey || !serviceRoleKey ||
    !Number.isSafeInteger(maxUploadBytes) || maxUploadBytes <= 0
  ) {
    console.error("Scientific ingestion configuration is incomplete.");
    return json(503, { error: "Service unavailable" }, configuredOrigin);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json(401, { error: "Unauthorized" }, configuredOrigin);
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json(401, { error: "Unauthorized" }, configuredOrigin);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: unknown;
    try {
      body = await readJsonLimited(request, 900_000);
    } catch (error) {
      return json(400, {
        error: error instanceof Error && error.message === "BODY_TOO_LARGE"
          ? "Request body too large"
          : "Invalid request body",
      }, configuredOrigin);
    }
    if (!isRecord(body) || typeof body.action !== "string") {
      return json(400, { error: "Invalid request" }, configuredOrigin);
    }

    if (body.action === "create-upload-intent") {
      if (!isRecord(body.source) || !isRecord(body.file)) {
        return json(400, { error: "Invalid upload metadata" }, configuredOrigin);
      }

      const title = cleanOptionalString(body.source.title, MAX_TITLE_LENGTH);
      const authors = validAuthors(body.source.authors);
      const mimeType = body.file.mime_type;
      const sizeBytes = body.file.size_bytes;
      const publicationYear = body.source.publication_year;
      const doi = cleanOptionalString(body.source.doi, 255);
      const sourceUrl = validHttpsUrl(body.source.source_url);
      const language = cleanOptionalString(body.source.language, 20);
      const publicationType = body.source.publication_type;

      const publicationTypes = [
        "research_article",
        "systematic_review",
        "meta_analysis",
        "position_statement",
        "methodological",
        "conference_paper",
        "other",
      ];

      if (
        !title || !authors ||
        mimeType !== "application/pdf" ||
        !Number.isSafeInteger(sizeBytes) || (sizeBytes as number) <= 0 ||
        (sizeBytes as number) > maxUploadBytes ||
        (publicationYear !== undefined && publicationYear !== null &&
          (!Number.isInteger(publicationYear) || publicationYear < 1500 || publicationYear > 2200)) ||
        (body.source.doi !== undefined && body.source.doi !== null &&
          body.source.doi !== "" && !doi) ||
        (body.source.source_url !== undefined && body.source.source_url !== null &&
          body.source.source_url !== "" && !sourceUrl) ||
        (body.source.language !== undefined && body.source.language !== null &&
          body.source.language !== "" && !language) ||
        (publicationType !== undefined && publicationType !== null &&
          !publicationTypes.includes(String(publicationType)))
      ) {
        return json(400, { error: "Invalid or unsupported upload metadata" }, configuredOrigin);
      }

      const userId = authData.user.id;
      const { data: intentRows, error: intentError } = await admin.rpc(
        "kajo_create_scientific_upload_intent",
        {
          p_owner_id: userId,
          p_title: title,
          p_authors: authors,
          p_publication_year: publicationYear ?? null,
          p_doi: doi,
          p_source_url: sourceUrl,
          p_language: language,
          p_publication_type: publicationType ?? null,
          p_file_size_bytes: sizeBytes,
        },
      );

      const intent = Array.isArray(intentRows) ? intentRows[0] : null;
      if (intentError || !intent?.source_id || !intent?.document_id || !intent?.storage_path) {
        console.error("Scientific upload intent: atomic database operation failed.");
        return json(500, { error: "Could not create upload intent" }, configuredOrigin);
      }

      return json(201, {
        source_id: intent.source_id,
        document_id: intent.document_id,
        bucket_id: BUCKET_ID,
        storage_path: intent.storage_path,
        processing_status: "pending",
        upload: { upsert: false, content_type: "application/pdf" },
      }, configuredOrigin);
    }

    if (body.action === "get-document-status") {
      const documentId = typeof body.document_id === "string"
        ? body.document_id
        : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)) {
        return json(404, { error: "Document not found" }, configuredOrigin);
      }

      const { data, error } = await admin
        .from("scientific_documents")
        .select("id,source_id,processing_status,mime_type,file_size_bytes,created_at,updated_at,processing_error,extraction_version,extraction_page_count,expected_chunk_count,extracted_character_count,upload_confirmed_at,extraction_completed_at")
        .eq("id", documentId)
        .eq("owner_id", authData.user.id)
        .eq("visibility", "private")
        .maybeSingle();

      if (error) {
        console.error("Scientific document status lookup failed.");
        return json(500, { error: "Could not retrieve document status" }, configuredOrigin);
      }
      if (!data) {
        return json(404, { error: "Document not found" }, configuredOrigin);
      }

      let persistedChunkCount = 0;
      if (data.extraction_version) {
        const { count, error: chunkCountError } = await admin
          .from("scientific_document_chunks")
          .select("id", { count: "exact", head: true })
          .eq("document_id", data.id)
          .eq("extraction_version", data.extraction_version);
        if (chunkCountError) {
          console.error("Scientific document chunk checkpoint lookup failed.");
          return json(500, { error: "Could not retrieve document status" }, configuredOrigin);
        }
        persistedChunkCount = count ?? 0;
      }

      return json(200, {
        document: {
          ...data,
          persisted_chunk_count: persistedChunkCount,
          can_resume_extraction: data.processing_status === "extracting" &&
            Boolean(data.extraction_version) &&
            Number.isInteger(data.expected_chunk_count) &&
            data.expected_chunk_count > 0,
        },
      }, configuredOrigin);
    }

    if (body.action === "confirm-upload") {
      if (!isUuid(body.document_id)) {
        return json(404, { error: "Document not found" }, configuredOrigin);
      }

      const userId = authData.user.id;
      const { data: document, error: documentError } = await getOwnedPrivateDocument(
        admin,
        body.document_id,
        userId,
      );
      if (documentError) {
        console.error("Scientific upload confirmation: document lookup failed.");
        return json(500, { error: "Could not confirm upload" }, configuredOrigin);
      }
      if (!document) {
        return json(404, { error: "Document not found" }, configuredOrigin);
      }
      if (document.processing_status === "uploaded") {
        return json(200, { document_id: document.id, processing_status: "uploaded" }, configuredOrigin);
      }
      if (document.processing_status !== "pending" || !document.storage_path) {
        return json(409, { error: "Document is not awaiting an upload" }, configuredOrigin);
      }

      // Read authoritative object metadata from Storage, not browser claims.
      const { data: objectInfo, error: infoError } = await admin.storage
        .from(BUCKET_ID)
        .info(document.storage_path);
      if (infoError || !objectInfo) {
        return json(409, { error: "Uploaded PDF could not be found" }, configuredOrigin);
      }
      if (
        objectInfo.size !== document.file_size_bytes ||
        objectInfo.size <= 0 || objectInfo.size > maxUploadBytes ||
        (objectInfo.contentType && objectInfo.contentType !== "application/pdf")
      ) {
        return json(415, { error: "Uploaded file does not match the declared PDF metadata" }, configuredOrigin);
      }

      // Verify the actual file signature without downloading the complete PDF.
      const { data: signed, error: signedError } = await admin.storage
        .from(BUCKET_ID)
        .createSignedUrl(document.storage_path, 60);
      if (signedError || !signed?.signedUrl) {
        console.error("Scientific upload confirmation: signed URL creation failed.");
        return json(503, { error: "Could not verify uploaded PDF" }, configuredOrigin);
      }

      const signatureResponse = await fetch(signed.signedUrl, {
        headers: { Range: "bytes=0-4" },
      });
      if (signatureResponse.status !== 206) {
        await signatureResponse.body?.cancel();
        return json(415, { error: "Uploaded file is not a verifiable PDF" }, configuredOrigin);
      }
      const contentRange = signatureResponse.headers.get("Content-Range") ?? "";
      const contentLength = signatureResponse.headers.get("Content-Length");
      if (
        contentRange !== `bytes 0-4/${objectInfo.size}` ||
        (contentLength !== null && contentLength !== "5")
      ) {
        await signatureResponse.body?.cancel();
        return json(415, { error: "Uploaded file range could not be verified" }, configuredOrigin);
      }
      const signature = new Uint8Array(await signatureResponse.arrayBuffer());
      const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
      if (
        signature.length !== pdfSignature.length ||
        !pdfSignature.every((byte, index) => signature[index] === byte)
      ) {
        return json(415, { error: "Uploaded file is not a valid PDF" }, configuredOrigin);
      }

      const { data: updated, error: updateError } = await admin
        .from("scientific_documents")
        .update({
          processing_status: "uploaded",
          upload_confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", document.id)
        .eq("owner_id", userId)
        .eq("visibility", "private")
        .eq("processing_status", "pending")
        .select("id")
        .maybeSingle();

      if (updateError) {
        console.error("Scientific upload confirmation: status update failed.");
        return json(500, { error: "Could not confirm upload" }, configuredOrigin);
      }
      if (!updated) {
        const { data: latest } = await getOwnedPrivateDocument(admin, document.id, userId);
        if (latest?.processing_status !== "uploaded") {
          return json(409, { error: "Document state changed; refresh its status" }, configuredOrigin);
        }
      }

      return json(200, { document_id: document.id, processing_status: "uploaded" }, configuredOrigin);
    }

    if (body.action === "begin-extraction") {
      if (
        !isUuid(body.document_id) ||
        typeof body.extraction_version !== "string" ||
        body.extraction_version.trim().length < 1 ||
        body.extraction_version.length > 100 ||
        !Number.isSafeInteger(body.page_count) || body.page_count < 1 || body.page_count > 10000 ||
        !Number.isSafeInteger(body.expected_chunk_count) || body.expected_chunk_count < 1 || body.expected_chunk_count > 20000 ||
        !Number.isSafeInteger(body.extracted_character_count) || body.extracted_character_count < 1 || body.extracted_character_count > 20000000
      ) {
        return json(400, { error: "Invalid extraction metadata" }, configuredOrigin);
      }

      const { data: document, error: documentError } = await getOwnedPrivateDocument(
        admin, body.document_id, authData.user.id,
      );
      if (documentError || !document) {
        return json(documentError ? 500 : 404, { error: documentError ? "Could not verify document" : "Document not found" }, configuredOrigin);
      }
      if (document.processing_status !== "uploaded" && document.processing_status !== "extracting") {
        return json(409, { error: "Document is not ready for extraction" }, configuredOrigin);
      }

      const { data, error } = await admin.rpc("kajo_begin_scientific_extraction", {
        p_document_id: body.document_id,
        p_extraction_version: body.extraction_version.trim(),
        p_page_count: body.page_count,
        p_expected_chunk_count: body.expected_chunk_count,
        p_extracted_character_count: body.extracted_character_count,
      });
      if (error) {
        console.error("Scientific extraction claim failed.");
        return json(409, { error: "Could not start extraction" }, configuredOrigin);
      }
      return json(200, { document_id: body.document_id, processing_status: data }, configuredOrigin);
    }

    if (body.action === "submit-chunk-batch") {
      if (
        !isUuid(body.document_id) ||
        typeof body.extraction_version !== "string" ||
        body.extraction_version.trim().length < 1 ||
        body.extraction_version.length > 100 ||
        !Array.isArray(body.chunks) || body.chunks.length < 1 || body.chunks.length > 50
      ) {
        return json(400, { error: "Invalid chunk batch" }, configuredOrigin);
      }

      const { data: document, error: documentError } = await getOwnedPrivateDocument(
        admin, body.document_id, authData.user.id,
      );
      if (documentError || !document) {
        return json(documentError ? 500 : 404, { error: documentError ? "Could not verify document" : "Document not found" }, configuredOrigin);
      }
      if (
        document.processing_status !== "extracting" ||
        document.extraction_version !== body.extraction_version.trim()
      ) {
        return json(409, { error: "Document is not accepting this extraction batch" }, configuredOrigin);
      }

      const { data, error } = await admin.rpc("kajo_submit_scientific_chunk_batch", {
        p_document_id: body.document_id,
        p_extraction_version: body.extraction_version.trim(),
        p_chunks: body.chunks,
      });
      if (error) {
        console.error("Scientific chunk batch persistence failed.");
        return json(400, { error: "Chunk batch was rejected" }, configuredOrigin);
      }
      return json(200, { document_id: body.document_id, inserted_chunks: data }, configuredOrigin);
    }

    if (body.action === "mark-manual-review") {
      if (!isUuid(body.document_id)) {
        return json(404, { error: "Document not found" }, configuredOrigin);
      }
      const { data: document, error: documentError } = await getOwnedPrivateDocument(
        admin, body.document_id, authData.user.id,
      );
      if (documentError || !document) {
        return json(documentError ? 500 : 404, { error: documentError ? "Could not verify document" : "Document not found" }, configuredOrigin);
      }
      if (document.processing_status === "manual_review_required") {
        return json(200, { document_id: document.id, processing_status: "manual_review_required" }, configuredOrigin);
      }
      if (document.processing_status !== "uploaded" && document.processing_status !== "extracting") {
        return json(409, { error: "Document cannot be moved to manual review from its current state" }, configuredOrigin);
      }
      const { data: updated, error: updateError } = await admin
        .from("scientific_documents")
        .update({
          processing_status: "manual_review_required",
          processing_error: "No reliable machine-readable text was extracted; manual review is required.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", document.id)
        .eq("owner_id", authData.user.id)
        .eq("visibility", "private")
        .in("processing_status", ["uploaded", "extracting"])
        .select("id")
        .maybeSingle();
      if (updateError || !updated) {
        console.error("Scientific manual-review status update failed.");
        return json(409, { error: "Could not update document status" }, configuredOrigin);
      }
      return json(200, { document_id: document.id, processing_status: "manual_review_required" }, configuredOrigin);
    }

    if (body.action === "complete-extraction") {
      if (!isUuid(body.document_id) || typeof body.extraction_version !== "string" || body.extraction_version.trim().length < 1 || body.extraction_version.length > 100) {
        return json(400, { error: "Invalid extraction completion request" }, configuredOrigin);
      }

      const { data: document, error: documentError } = await getOwnedPrivateDocument(
        admin, body.document_id, authData.user.id,
      );
      if (documentError || !document) {
        return json(documentError ? 500 : 404, { error: documentError ? "Could not verify document" : "Document not found" }, configuredOrigin);
      }
      if (document.processing_status !== "extracting" && document.processing_status !== "private_ready") {
        return json(409, { error: "Document is not ready to complete" }, configuredOrigin);
      }
      if (document.extraction_version !== body.extraction_version.trim()) {
        return json(409, { error: "Extraction version does not match" }, configuredOrigin);
      }

      const { data, error } = await admin.rpc("kajo_complete_scientific_extraction", {
        p_document_id: body.document_id,
        p_extraction_version: body.extraction_version.trim(),
      });
      if (error) {
        console.error("Scientific extraction completion failed.");
        return json(409, { error: "Extraction is incomplete or could not be completed" }, configuredOrigin);
      }
      return json(200, { document_id: body.document_id, processing_status: data }, configuredOrigin);
    }

    if (body.action === "process-document") {
      // Deliberately unavailable until a Deno-compatible PDF parser, atomic
      // chunk persistence, and retry/claim semantics have been selected.
      return json(501, {
        error: "Document processing is not configured yet",
        code: "PARSER_NOT_CONFIGURED",
      }, configuredOrigin);
    }

    return json(400, { error: "Unknown action" }, configuredOrigin);
  } catch {
    console.error("Scientific ingestion request failed unexpectedly.");
    return json(500, { error: "Internal server error" }, configuredOrigin);
  }
});
