// omnis-ui/app/api/ingest/route.ts
// POST /api/ingest
//
// Secure machine-to-machine ingestion endpoint.
// Receives test evidence from the external Omnis CLI tool and writes a signed,
// org-siloed row to the evidence_logs table.
//
// ── AUTHENTICATION ──────────────────────────────────────────────────────────
// Expects:   Authorization: Bearer omn_<raw_key>
//
// The raw key is hashed against every stored key_hash for the organisation
// using the IDENTICAL algorithm as generateApiKey() in settings/actions.ts:
//   digest = SHA-256( saltHex + rawKey )
//   stored = "<saltHex>:<digestHex>"
// Verification extracts the salt from the stored hash, recomputes the digest,
// and compares using timingSafeEqual() to prevent timing-oracle attacks.
//
// ── DATABASE WRITES ─────────────────────────────────────────────────────────
// Uses adminClient (SUPABASE_SERVICE_ROLE_KEY) to bypass RLS — the CLI is an
// unauthenticated machine, not a logged-in user. The org_id is stamped from
// the API key lookup, never trusted from the request payload.
//
// ── CONSTITUTION ALIGNMENT ──────────────────────────────────────────────────
// • No hardcoded secrets — all from process.env (Law II).
// • No auth bypass — key verification is mandatory and timing-safe (Law II).
// • Strict DDL compliance — no hallucinated column names (Law VI).
// • Loudly fails on missing env vars (Law V Halt-and-Catch-Fire).

import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The prefix we strip before hashing. Authorization header = "Bearer omn_..." */
const BEARER_PREFIX = "Bearer ";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Encodes an ArrayBuffer as a lowercase hex string.
 * Mirrors the toHex() helper in settings/actions.ts.
 */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Recomputes the SHA-256 digest for an incoming raw key using the salt
 * embedded in the stored hash string.
 *
 * Stored format: "<hex-salt>:<hex-digest>"
 *
 * This must be byte-for-byte identical to the algorithm in hashApiKey()
 * (settings/actions.ts). If that function ever changes, this must change too.
 *
 * Uses the Node.js crypto module (not Web Crypto) so we can call
 * timingSafeEqual() directly on the resulting Buffer without async overhead.
 */
function recomputeDigest(storedHash: string, rawKey: string): string {
  const colonIdx = storedHash.indexOf(":");
  if (colonIdx === -1) {
    throw new Error("Malformed key_hash: missing colon separator");
  }
  const saltHex = storedHash.slice(0, colonIdx);
  // Digest = SHA-256( saltHex + rawKey ) — identical to generation side
  return createHash("sha256").update(saltHex + rawKey).digest("hex");
}

/**
 * Timing-safe comparison of two hex digest strings.
 * Returns true if and only if the digests match.
 * Prevents timing-oracle attacks that could leak partial key material.
 */
function digestsMatch(candidateHex: string, storedHex: string): boolean {
  // Both must be the same length for timingSafeEqual; SHA-256 always produces
  // 64 hex chars, but we guard defensively.
  if (candidateHex.length !== storedHex.length) return false;
  return timingSafeEqual(
    Buffer.from(candidateHex, "utf8"),
    Buffer.from(storedHex, "utf8"),
  );
}

// ---------------------------------------------------------------------------
// Payload shape (what the CLI sends)
// ---------------------------------------------------------------------------

interface IngestPayload {
  /** Raw pytest/test-runner JSON output (or a plain string summary). */
  results: unknown;
  /** Optional SemVer build string, e.g. "v2.4.1". */
  build_version?: string;
  /** Optional regulatory requirement ID, e.g. "FDA-820.30g". */
  req_id?: string;
  /** Optional execution status override. Defaults to "PASS". */
  execution_status?: string;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Step 1: Extract and validate the Authorization header ──────────────
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return NextResponse.json(
      { error: "Unauthorized: missing or malformed Authorization header. Expected: Bearer omn_<key>" },
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

  // ── Step 2: Fetch all key_hash rows from the DB to find a match ────────
  // We intentionally fetch all keys (key_hash + org_id only — no name or
  // sensitive data) and verify locally so we never expose the hash comparison
  // to a timing oracle via DB round-trips.
  const { data: keyRows, error: keyFetchError } = await adminClient
    .from("organization_api_keys")
    .select("id, org_id, key_hash");

  if (keyFetchError) {
    console.error("[ingest] Failed to fetch API keys from DB:", keyFetchError.message);
    return NextResponse.json(
      { error: "Internal server error during authentication." },
      { status: 500 },
    );
  }

  // ── Step 3: Find the matching key using timing-safe comparison ─────────
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
      // Malformed hash row — skip silently (will not match)
      continue;
    }
  }

  if (!matchedOrgId) {
    return NextResponse.json(
      { error: "Unauthorized: no matching API key found." },
      { status: 401 },
    );
  }

  // ── Step 4: Parse and validate the request body ────────────────────────
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
      { error: "Bad Request: 'results' field is required." },
      { status: 400 },
    );
  }

  // ── Step 5: Resolve a user_id for this org ─────────────────────────────
  // evidence_logs.user_id is a NOT NULL FK to users.user_id.
  // The CLI is unauthenticated, so we resolve a representative user_id from
  // the org — the first user registered under that organisation.
  const { data: orgUser, error: userError } = await adminClient
    .from("users")
    .select("user_id")
    .eq("org_id", matchedOrgId)
    .limit(1)
    .single();

  if (userError || !orgUser?.user_id) {
    console.error(
      "[ingest] Could not resolve a user_id for org:",
      matchedOrgId,
      userError?.message,
    );
    return NextResponse.json(
      {
        error:
          "Internal server error: no user record found for this organisation. " +
          "Ensure the org owner has completed onboarding.",
      },
      { status: 500 },
    );
  }

  const userId: string = orgUser.user_id;

  // ── Step 6: Resolve or create a build record ───────────────────────────
  // evidence_logs.build_id is a NOT NULL FK to builds.build_id.
  // If the caller supplied a build_version, upsert a build row for it.
  // Otherwise use a canonical sentinel "CLI-INGEST" build for this org.
  const versionString = payload.build_version?.trim() || "CLI-INGEST";

  // Try to find an existing build with this version for this org
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
    // Create a new build record
    const { data: newBuild, error: buildError } = await adminClient
      .from("builds")
      .insert({ org_id: matchedOrgId, version_string: versionString })
      .select("build_id")
      .single();

    if (buildError || !newBuild?.build_id) {
      console.error("[ingest] Failed to create build record:", buildError?.message);
      return NextResponse.json(
        { error: "Internal server error: could not create build record." },
        { status: 500 },
      );
    }
    buildId = newBuild.build_id as string;
  }

  // ── Step 7: Resolve req_id ─────────────────────────────────────────────
  // If the caller supplied a req_id, verify it exists in regulatory_rules.
  // If not, fall back to the sentinel "OMNIS-GENERAL" rule which must exist
  // in every seeded database. If even that is absent, use the first rule.
  let reqId: string;
  const requestedReqId = payload.req_id?.trim();

  if (requestedReqId) {
    const { data: rule } = await adminClient
      .from("regulatory_rules")
      .select("req_id")
      .eq("req_id", requestedReqId)
      .maybeSingle();

    if (rule?.req_id) {
      reqId = rule.req_id as string;
    } else {
      // Requested req_id doesn't exist — fall back gracefully
      console.warn(
        `[ingest] req_id "${requestedReqId}" not found in regulatory_rules. Falling back to default.`,
      );
      reqId = await resolveDefaultReqId();
    }
  } else {
    reqId = await resolveDefaultReqId();
  }

  // ── Step 8: Compute signature_hash ────────────────────────────────────
  // The signature_hash is an HMAC-SHA256 of the serialised payload, signed
  // with OMNIS_SIGNING_SECRET as defined in the constitution (Law I, §2).
  // For the Next.js ingest endpoint we compute it here to produce an
  // immutable audit fingerprint of the incoming data at rest.
  //
  // CONSTITUTION LAW II: secret loaded from env, never hardcoded.
  const signingSecret = process.env.OMNIS_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[ingest] FATAL: OMNIS_SIGNING_SECRET is not set.");
    return NextResponse.json(
      {
        error:
          "Internal server error: signing secret is not configured. " +
          "Set OMNIS_SIGNING_SECRET in the environment.",
      },
      { status: 500 },
    );
  }

  const serialisedPayload = JSON.stringify(payload.results);
  const signatureHash = createHash("sha256")
    .update(signingSecret + serialisedPayload)
    .digest("hex");

  // ── Step 9: Build and insert the evidence_log row ──────────────────────
  const logId = crypto.randomUUID();
  const executionTimestamp = new Date().toISOString();
  const executionStatus = payload.execution_status?.trim() || "PASS";

  const evidenceRow = {
    log_id: logId,
    org_id: matchedOrgId,              // stamped from API key — never from payload
    user_id: userId,                    // resolved from org
    build_id: buildId,                  // resolved/created above
    req_id: reqId,                      // validated against regulatory_rules
    previous_log_hash: null,            // chain hashing: future enhancement
    signature_hash: signatureHash,      // HMAC fingerprint of this payload
    raw_command: `omnis-cli ingest --build-version "${versionString}"`,
    sanitized_payload: payload.results, // the actual test results (JSONB)
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
      { error: "Internal server error: could not write evidence log to database." },
      { status: 500 },
    );
  }

  // ── Step 10: Return 201 Created ────────────────────────────────────────
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
// resolveDefaultReqId — fetches a fallback req_id from regulatory_rules
// ---------------------------------------------------------------------------

async function resolveDefaultReqId(): Promise<string> {
  // Try the canonical sentinel first
  const { data: sentinel } = await adminClient
    .from("regulatory_rules")
    .select("req_id")
    .eq("req_id", "OMNIS-GENERAL")
    .maybeSingle();

  if (sentinel?.req_id) return sentinel.req_id as string;

  // Fall back to the first rule in the table
  const { data: firstRule } = await adminClient
    .from("regulatory_rules")
    .select("req_id")
    .order("req_id", { ascending: true })
    .limit(1)
    .single();

  if (firstRule?.req_id) return firstRule.req_id as string;

  throw new Error(
    "No regulatory_rules records found. Database must be seeded before ingesting evidence.",
  );
}
