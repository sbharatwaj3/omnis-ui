// omnis-ui/app/api/ingest/route.ts
// POST /api/ingest
//
// Secure machine-to-machine ingestion endpoint.
// Receives test evidence from the external Omnis CLI tool and writes a signed,
// org-siloed row to the evidence_logs table.
//
// ── RUNTIME ──────────────────────────────────────────────────────────────────
// Explicitly set to Node.js. This route uses node:crypto (createHash,
// timingSafeEqual) which are not available on the Vercel Edge runtime.
// Without this export Vercel may default to the Edge runtime and throw a
// module-not-found error at cold start, producing a blank 500.
export const runtime = "nodejs";

// ── AUTHENTICATION ──────────────────────────────────────────────────────────
// Expects:   Authorization: Bearer omn_<raw_key>
//
// The raw key is verified against the stored key_hash using the IDENTICAL
// algorithm as generateApiKey() in settings/actions.ts:
//   stored  = "<hex-salt>:<sha256(saltHex + rawKey)>"
//   verify  = re-extract salt, recompute digest, compare with timingSafeEqual
//
// ── DATABASE WRITES ─────────────────────────────────────────────────────────
// Uses adminClient (SUPABASE_SERVICE_ROLE_KEY) to bypass RLS — the CLI is an
// unauthenticated machine, not a logged-in user. org_id is stamped from the
// API key lookup, never trusted from the request payload.
//
// ── CONSTITUTION ALIGNMENT ──────────────────────────────────────────────────
// • No hardcoded secrets — all from process.env (Law II).
// • No auth bypass — key verification mandatory and timing-safe (Law II).
// • Strict DDL compliance — no hallucinated column names (Law VI).
// • Entire handler wrapped in try/catch — no silent crashes (Law V).

import { NextRequest, NextResponse } from "next/server";
// node: prefix guarantees we get the real Node.js built-in, not a
// browser polyfill that lacks createHash / timingSafeEqual.
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BEARER_PREFIX = "Bearer ";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recomputes the SHA-256 digest for an incoming raw key using the salt that is
 * embedded in the stored hash string.
 *
 * Stored format (set by hashApiKey in settings/actions.ts):
 *   "<hex-salt>:<sha256(saltHex + rawKey)>"
 *
 * MUST remain byte-for-byte identical to the generation-side algorithm.
 */
function recomputeDigest(storedHash: string, rawKey: string): string {
  const colonIdx = storedHash.indexOf(":");
  if (colonIdx === -1) {
    throw new Error("Malformed key_hash: missing colon separator");
  }
  const saltHex = storedHash.slice(0, colonIdx);
  return createHash("sha256").update(saltHex + rawKey).digest("hex");
}

/**
 * Timing-safe string comparison.
 * Both arguments must be the same byte length (SHA-256 hex = always 64 chars).
 */
function digestsMatch(candidateHex: string, storedHex: string): boolean {
  if (candidateHex.length !== storedHex.length) return false;
  return timingSafeEqual(
    Buffer.from(candidateHex, "utf8"),
    Buffer.from(storedHex, "utf8"),
  );
}

// ---------------------------------------------------------------------------
// Payload shape (what the CLI / PowerShell test sends)
// ---------------------------------------------------------------------------

interface IngestPayload {
  /** Nested test results object — required. */
  results: unknown;
  /** Optional SemVer string, e.g. "v1.0.0". */
  build_version?: string;
  /** Optional regulatory requirement ID, e.g. "FDA-820.30g". */
  req_id?: string;
  /** Optional execution status. Defaults to "PASS". */
  execution_status?: string;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Outer try/catch: guarantees we never return a blank 500. Any unhandled
  // exception (env var missing, DB unreachable, etc.) surfaces as a
  // structured JSON error body so it can be diagnosed without Vercel logs.
  try {
    return await handleIngest(request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ingest] Unhandled exception:", message, err);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        detail: message,
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Core handler — separated so the outer try/catch is clean
// ---------------------------------------------------------------------------

async function handleIngest(request: NextRequest): Promise<NextResponse> {
  // ── Step 1: Extract and validate the Authorization header ──────────────
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return NextResponse.json(
      {
        error:
          "Unauthorized: missing or malformed Authorization header. " +
          "Expected: Authorization: Bearer omn_<key>",
      },
      { status: 401 },
    );
  }

  const rawKey = authHeader.slice(BEARER_PREFIX.length).trim();
  if (!rawKey.startsWith("omn_") || rawKey.length < 8) {
    return NextResponse.json(
      { error: "Unauthorized: API key must start with 'omn_'." },
      { status: 401 },
    );
  }

  // ── Step 2: Parse request body BEFORE hitting the DB ───────────────────
  // Moved earlier so a malformed body is caught before we make DB calls.
  let payload: IngestPayload;
  try {
    payload = (await request.json()) as IngestPayload;
  } catch {
    return NextResponse.json(
      { error: "Bad Request: request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!payload.results) {
    return NextResponse.json(
      { error: "Bad Request: 'results' field is required in the JSON body." },
      { status: 400 },
    );
  }

  // ── Step 3: Verify OMNIS_SIGNING_SECRET is configured ──────────────────
  // Checked early so the error message is actionable (not a generic crash).
  const signingSecret = process.env.OMNIS_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[ingest] FATAL: OMNIS_SIGNING_SECRET env var is not set.");
    return NextResponse.json(
      {
        error:
          "Server misconfiguration: OMNIS_SIGNING_SECRET is not set. " +
          "Add it to your Vercel environment variables and redeploy.",
      },
      { status: 500 },
    );
  }

  // ── Step 4: Fetch all API key rows and find a timing-safe match ─────────
  const { data: keyRows, error: keyFetchError } = await adminClient
    .from("organization_api_keys")
    .select("id, org_id, key_hash");

  if (keyFetchError) {
    console.error(
      "[ingest] Failed to fetch API keys from DB:",
      keyFetchError.message,
    );
    return NextResponse.json(
      {
        error: "Internal server error during authentication.",
        detail: keyFetchError.message,
      },
      { status: 500 },
    );
  }

  let matchedOrgId: string | null = null;

  for (const row of keyRows ?? []) {
    if (!row.key_hash || typeof row.key_hash !== "string") continue;
    try {
      const candidateDigest = recomputeDigest(row.key_hash, rawKey);
      const colonIdx = row.key_hash.indexOf(":");
      const storedDigest = row.key_hash.slice(colonIdx + 1);
      if (digestsMatch(candidateDigest, storedDigest)) {
        matchedOrgId = row.org_id as string;
        break;
      }
    } catch {
      // Malformed hash row — skip and continue
      continue;
    }
  }

  if (!matchedOrgId) {
    return NextResponse.json(
      { error: "Unauthorized: no matching API key found." },
      { status: 401 },
    );
  }

  // ── Step 5: Resolve a user_id for this org ─────────────────────────────
  // evidence_logs.user_id is NOT NULL FK → users.user_id.
  // The CLI has no authenticated user; we resolve the org's first user.
  const { data: orgUser, error: userError } = await adminClient
    .from("users")
    .select("user_id")
    .eq("org_id", matchedOrgId)
    .limit(1)
    .single();

  if (userError || !orgUser?.user_id) {
    console.error(
      "[ingest] Could not resolve user_id for org:",
      matchedOrgId,
      userError?.message,
    );
    return NextResponse.json(
      {
        error:
          "No user record found for this organisation. " +
          "Ensure the org owner has completed onboarding.",
        detail: userError?.message ?? "No rows returned",
      },
      { status: 500 },
    );
  }

  const userId: string = orgUser.user_id;

  // ── Step 6: Resolve or create a build record ───────────────────────────
  // evidence_logs.build_id is NOT NULL FK → builds.build_id.
  const versionString = payload.build_version?.trim() || "CLI-INGEST";

  const { data: existingBuild } = await adminClient
    .from("builds")
    .select("build_id")
    .eq("org_id", matchedOrgId)
    .eq("version_string", versionString)
    .limit(1)
    .maybeSingle();

  let buildId: string;
  if (existingBuild?.build_id) {
    buildId = existingBuild.build_id as string;
  } else {
    // builds.build_id has no gen_random_uuid() default in the DDL — we must
    // supply the UUID explicitly to satisfy the NOT NULL primary key constraint.
    const newBuildId = crypto.randomUUID();
    const { data: newBuild, error: buildError } = await adminClient
      .from("builds")
      .insert({ build_id: newBuildId, org_id: matchedOrgId, version_string: versionString })
      .select("build_id")
      .single();

    if (buildError || !newBuild?.build_id) {
      console.error("[ingest] Failed to create build record:", buildError?.message);
      return NextResponse.json(
        {
          error: "Could not create build record.",
          detail: buildError?.message ?? "No build_id returned",
        },
        { status: 500 },
      );
    }
    buildId = newBuild.build_id as string;
  }

  // ── Step 7: Resolve req_id ─────────────────────────────────────────────
  // Validates the caller's req_id exists; falls back to first seeded rule.
  const requestedReqId = payload.req_id?.trim();
  let reqId: string;

  if (requestedReqId) {
    const { data: rule } = await adminClient
      .from("regulatory_rules")
      .select("req_id")
      .eq("req_id", requestedReqId)
      .maybeSingle();

    if (rule?.req_id) {
      reqId = rule.req_id as string;
    } else {
      console.warn(
        `[ingest] req_id "${requestedReqId}" not found in regulatory_rules. Falling back to default.`,
      );
      reqId = await resolveDefaultReqId();
    }
  } else {
    reqId = await resolveDefaultReqId();
  }

  // ── Step 8: Compute signature_hash ─────────────────────────────────────
  // SHA-256( OMNIS_SIGNING_SECRET + serialisedPayload ) — immutable audit
  // fingerprint stored alongside the evidence data at rest.
  const serialisedPayload = JSON.stringify(payload.results);
  const signatureHash = createHash("sha256")
    .update(signingSecret + serialisedPayload)
    .digest("hex");

  // ── Step 9: Insert the evidence_log row ────────────────────────────────
  const logId = crypto.randomUUID();
  const executionTimestamp = new Date().toISOString();
  const executionStatus = payload.execution_status?.trim() || "PASS";

  const evidenceRow = {
    log_id: logId,
    org_id: matchedOrgId,                   // from API key — never from payload
    user_id: userId,                         // resolved from org
    build_id: buildId,                       // resolved/created above
    req_id: reqId,                           // validated against regulatory_rules
    previous_log_hash: null,                 // chain hashing: future enhancement
    signature_hash: signatureHash,           // fingerprint of this payload
    raw_command: `omnis-cli ingest --build-version "${versionString}"`,
    sanitized_payload: payload.results,      // test results (JSONB)
    execution_status: executionStatus,
    execution_timestamp: executionTimestamp,
    is_deprecated: false,
    event_source: "omnis-cli",
  };

  const { data: insertedLog, error: insertError } = await adminClient
    .from("evidence_logs")
    .insert(evidenceRow)
    .select("log_id")
    .single();

  if (insertError) {
    console.error("[ingest] Failed to insert evidence log:", insertError.message);
    return NextResponse.json(
      {
        error: "Could not write evidence log to database.",
        detail: insertError.message,
      },
      { status: 500 },
    );
  }

  // ── Step 10: Fire-and-forget trigger to omnis-api AI pipeline ───────────
  //
  // The Vercel ingest route writes the evidence log but is completely blind
  // to the FastAPI backend. This non-blocking trigger notifies omnis-api so
  // it can run the Bedrock AI analysis as a background task.
  //
  // CONSTITUTION ALIGNMENT:
  //   • Non-blocking: we intentionally do NOT await the fetch response body.
  //     A .catch() handler is attached so Vercel never surfaces a rejected
  //     promise, but we never block the 201 response on the AI call.
  //   • Auth: we forward a service-to-service JWT (signed with
  //     SUPABASE_JWT_SECRET) and an HMAC-SHA256 signature over the raw body
  //     bytes so the double-lock on /ingest stays intact (Law II).
  //   • No hardcoded URLs: OMNIS_BACKEND_URL loaded from env (Law II).
  //   • Payload to FastAPI mirrors EvidenceLogPayload schema exactly (Law VI).
  const backendUrl = process.env.OMNIS_BACKEND_URL;
  if (backendUrl) {
    // Build the EvidenceLogPayload that FastAPI's Pydantic model expects.
    const backendPayload = {
      log_id: logId,
      org_id: matchedOrgId,
      user_id: userId,
      build_id: buildId,
      req_id: reqId,
      previous_log_hash: null,          // nullable — first log in chain
      signature_hash: signatureHash,
      raw_command: `omnis-cli ingest --build-version "${versionString}"`,
      sanitized_payload: payload.results,
      execution_status: executionStatus,
      execution_timestamp: executionTimestamp,
      is_deprecated: false,
      event_source: "omnis-cli",
    };

    const backendBodyBytes = JSON.stringify(backendPayload);

    // Sign the payload for the FastAPI HMAC double-lock.
    // CONSTITUTION LAW II (RAW BYTE HMAC): We sign the exact bytes we are
    // about to transmit — no JSON re-serialization after this point.
    const { createHmac } = await import("node:crypto");
    const hmacSignature = createHmac("sha256", signingSecret)
      .update(backendBodyBytes)
      .digest("hex");

    // Mint a short-lived service JWT so FastAPI's verify_jwt accepts this call.
    // We use the same SUPABASE_JWT_SECRET the backend trusts.
    const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
    let serviceJwt = "";
    if (supabaseJwtSecret) {
      // Manual HS256 JWT construction — avoids pulling in a server-side JWT
      // library on the Vercel edge.  Header and payload are base64url-encoded;
      // signature is HMAC-SHA256 over "<header>.<payload>".
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
        .toString("base64url");
      const jwtPayload = Buffer.from(
        JSON.stringify({
          sub: "omnis-vercel-service",
          role: "service_role",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60, // 60-second TTL
        }),
      ).toString("base64url");
      const signingInput = `${header}.${jwtPayload}`;
      const { createHmac: _hmac } = await import("node:crypto");
      const jwtSig = _hmac("sha256", supabaseJwtSecret)
        .update(signingInput)
        .digest("base64url");
      serviceJwt = `${signingInput}.${jwtSig}`;
    }

    const backendIngestUrl = `${backendUrl.replace(/\/$/, "")}/api/v1/evidence/ingest`;

    // Fire-and-forget: attach only a .catch() — never await the body or
    // chain a .then() that could delay returning the 201 to the CLI.
    fetch(backendIngestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceJwt && { Authorization: `Bearer ${serviceJwt}` }),
        "X-Omnis-Signature": hmacSignature,
      },
      body: backendBodyBytes,
    }).catch((err) => {
      // Non-fatal: the evidence row is already written to Supabase.
      // Log the trigger failure so it appears in Vercel Function logs.
      console.error("[ingest] Fire-and-forget trigger to omnis-api failed:", err);
    });
  } else {
    console.warn(
      "[ingest] OMNIS_BACKEND_URL is not set — AI analysis will not be triggered. " +
        "Add OMNIS_BACKEND_URL to your Vercel environment variables.",
    );
  }

  // ── Step 11: Purge stale Next.js Router Cache for dashboard pages ────────
  // force-dynamic on the dashboard page bypasses the Data Cache, but the
  // Vercel Router Cache can still serve a stale prefetch. revalidatePath
  // marks both routes as stale so the next navigation fetches fresh data.
  revalidatePath("/dashboard");
  revalidatePath("/readiness");

  // ── Step 12: 201 Created ───────────────────────────────────────────────
  return NextResponse.json(
    {
      success: true,
      message: "Evidence log ingested successfully.",
      log_id: insertedLog.log_id,
      org_id: matchedOrgId,
      build_id: buildId,
      req_id: reqId,
      execution_timestamp: executionTimestamp,
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// resolveDefaultReqId
// ---------------------------------------------------------------------------

async function resolveDefaultReqId(): Promise<string> {
  // Try a canonical sentinel row first
  const { data: sentinel } = await adminClient
    .from("regulatory_rules")
    .select("req_id")
    .eq("req_id", "OMNIS-GENERAL")
    .maybeSingle();

  if (sentinel?.req_id) return sentinel.req_id as string;

  // Fall back to the first rule alphabetically
  const { data: firstRule } = await adminClient
    .from("regulatory_rules")
    .select("req_id")
    .order("req_id", { ascending: true })
    .limit(1)
    .single();

  if (firstRule?.req_id) return firstRule.req_id as string;

  throw new Error(
    "No regulatory_rules records found. " +
      "The database must be seeded before ingesting evidence.",
  );
}
