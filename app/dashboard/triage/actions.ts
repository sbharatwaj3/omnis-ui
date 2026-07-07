"use server";
// omnis-ui/app/dashboard/triage/actions.ts
//
// Server Actions for the AI Triage Queue — the human review layer that sits
// between Claude's discrepancy flags and the authoritative evidence ledger.
//
// CONSTITUTION LAW I (§VII):
//   - Every action treats itself as a public HTTP endpoint.
//   - Identity and org_id are ALWAYS re-derived from the Supabase JWT session.
//     No parameter passed by the client is trusted as an org boundary.
//   - Role is checked server-side on every write. QA managers and admins only.
//   - 'server-only' import prevents this module from leaking into client bundles.
//
// CONSTITUTION LAW II:
//   - No auth bypass. verify session → verify role → then act.
//   - resolveTriageItem now implements an APPEND-ONLY correction pattern to
//     comply with 21 CFR Part 11 immutability requirements:
//       1. Fetch the original evidence_log in full.
//       2. Clone it with a new log_id, the corrected req_id, a fresh
//          signature_hash, event_source = "triage-correction", and
//          supersedes_log_id pointing at the original.
//       3. Insert the corrected clone as a new evidence_logs row.
//       4. Mark the original log is_deprecated = true (hidden from active
//          views; preserved in the audit ledger).
//       5. Update ai_triage_queue.status → 'approved'.
//     The original row is NEVER mutated — only deprecated.
//
// 21 CFR PART 11 AUDIT TRAIL:
//   - resolveTriageItem writes to audit_logs with action_type TRIAGE_RESOLVE
//     after every successful resolution (approved or rejected).
//   - The before/after JSONB captures the full triage decision including
//     the original_req_id, suggested_req_id, and the reviewer's resolution.

import "server-only";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import type { AiTriageQueueRow, TriageStatus } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Audit trail helper (local to this module — mirrors the one in requirements/actions.ts)
// ---------------------------------------------------------------------------

/**
 * Writes a single immutable record to the audit_logs table.
 * Returns { error: string | null } so the caller can detect failure.
 * Silent audit failures violate 21 CFR Part 11 — callers must propagate errors.
 */
async function writeAuditLog({
  userId,
  orgId,
  actionType,
  entityType,
  entityId,
  before,
  after,
}: {
  userId: string;
  orgId: string;
  actionType: "CREATE" | "UPDATE" | "DELETE" | "TRIAGE_RESOLVE";
  entityType: "REQUIREMENT" | "MAPPING" | "EVIDENCE_LOG";
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): Promise<{ error: string | null }> {
  const { error } = await adminClient.from("audit_logs").insert({
    user_id: userId,
    org_id: orgId,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    changes: { before, after },
  });

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GetPendingTriageResult {
  items: AiTriageQueueRow[];
  error?: string;
}

export interface ResolveTriageResult {
  success: boolean;
  error?: string;
  /** The AI-suggested req_id that was applied (approve path) or would have been applied (reject path). */
  suggestedReqId?: string;
  /** The actual req_id on the evidence_log at the time of resolution (captured at call time). */
  originalReqId?: string;
  /** The new log_id of the corrected clone that was inserted (approve path only). */
  correctedLogId?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the caller's user_id, org_id, and role from the trusted server-side
 * Supabase JWT session.  Throws nothing — returns null fields on any failure so
 * the caller can return a structured error to the client.
 */
async function resolveCallerContext(): Promise<{
  userId: string | null;
  orgId: string | null;
  role: string | null;
  error: string | null;
}> {
  const supabase = await createClient();

  // Step 1: Authenticate.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { userId: null, orgId: null, role: null, error: "Unauthorized: valid session required." };
  }

  // Step 2: Resolve org_id from the users table — never from client params.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    return {
      userId: null,
      orgId: null,
      role: null,
      error: "Could not resolve your organization. Please complete onboarding.",
    };
  }

  // Step 3: Resolve RBAC role.
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", profile.org_id)
    .single();

  if (roleError || !roleRow?.role) {
    return {
      userId: null,
      orgId: null,
      role: null,
      error: "No role assignment found. Contact your administrator.",
    };
  }

  return {
    userId: user.id,
    orgId: profile.org_id,
    role: roleRow.role,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Action: getAllTriageItems
// ---------------------------------------------------------------------------
// Fetches ALL rows in ai_triage_queue (pending, approved, and rejected) for
// the caller's org. This replaces the previous getPendingTriageItems which
// only fetched status = 'pending', causing the Approved and Rejected filter
// tabs to always render empty even when records existed.
//
// The client-side status filter in TriageQueueClient now works correctly
// because the full dataset is loaded once on mount.
//
// Access rules by role:
//   admin / qa_manager → all items for the org (all statuses)
//   developer          → only items linked to their own evidence logs
//   viewer             → Forbidden; returns empty list + error
//
// Both org_id and user_id are selected from the evidence_logs join to enable
// filtering, but both are stripped before the items are returned to the
// client to avoid leaking internal join data.
// ---------------------------------------------------------------------------

export async function getAllTriageItems(): Promise<GetPendingTriageResult> {
  // Verify session and resolve identity.
  const { userId, orgId, role, error: ctxError } = await resolveCallerContext();

  if (ctxError || !orgId || !role) {
    return { items: [], error: ctxError ?? "Unauthorized." };
  }

  // Gate: viewers have no access to the triage queue whatsoever.
  if (role === "viewer") {
    return {
      items: [],
      error: "Forbidden: viewers do not have access to the triage queue.",
    };
  }

  // Gate: only admin, qa_manager, and developer may access the triage queue.
  if (!["admin", "qa_manager", "developer"].includes(role)) {
    return {
      items: [],
      error: "Forbidden: only QA managers and admins can access the triage queue.",
    };
  }

  // Developer path: scope results to only the developer's own evidence logs.
  // No status filter — all statuses are returned so client-side tabs work.
  if (role === "developer") {
    const { data, error } = await adminClient
      .from("ai_triage_queue")
      .select(
        `
        id,
        evidence_log_id,
        original_req_id,
        suggested_req_id,
        ai_reasoning,
        status,
        created_at,
        evidence_logs!inner ( org_id, user_id )
        `
      )
      .eq("evidence_logs.org_id", orgId)
      .eq("evidence_logs.user_id", userId!)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[getAllTriageItems] Supabase select error (developer path):", error.message);
      return { items: [], error: "Database error: could not load triage queue." };
    }

    const items = (data ?? []).map(({ evidence_logs: _join, ...rest }) => rest) as AiTriageQueueRow[];
    return { items };
  }

  // Admin / QA Manager path: all items for the org, all statuses.
  const { data, error } = await adminClient
    .from("ai_triage_queue")
    .select(
      `
      id,
      evidence_log_id,
      original_req_id,
      suggested_req_id,
      ai_reasoning,
      status,
      created_at,
      evidence_logs!inner ( org_id, user_id )
      `
    )
    .eq("evidence_logs.org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getAllTriageItems] Supabase select error:", error.message);
    return { items: [], error: "Database error: could not load triage queue." };
  }

  const items = (data ?? []).map(({ evidence_logs: _join, ...rest }) => rest) as AiTriageQueueRow[];
  return { items };
}

// ---------------------------------------------------------------------------
// Action: getPendingTriageItems (kept for backwards compatibility)
// ---------------------------------------------------------------------------
// Legacy alias — delegates to getAllTriageItems so existing callers are not
// broken. New code should call getAllTriageItems directly.
// ---------------------------------------------------------------------------

export async function getPendingTriageItems(): Promise<GetPendingTriageResult> {
  return getAllTriageItems();
}

// ---------------------------------------------------------------------------
// Action: resolveTriageItem
// ---------------------------------------------------------------------------
// Resolves a single triage item by transitioning its status to 'approved' or
// 'rejected'.
//
// When resolution === 'approved':
//   1. Updates ai_triage_queue.status → 'approved'.
//   2. Patches evidence_logs.req_id to the suggested_req_id from the triage
//      row.  This is the authoritative re-tagging step.
//
// When resolution === 'rejected':
//   1. Updates ai_triage_queue.status → 'rejected'.
//   2. The evidence_log.req_id is left unchanged — the developer's original
//      tag stands.
//
// ATOMICITY NOTE:
//   Supabase's REST API does not expose DDL-level transactions from the client.
//   We perform the two writes sequentially using the adminClient.  If the
//   second write (evidence_log patch) fails after the first (status update)
//   succeeds, the triage row remains 'approved' but the log has not been
//   updated.  This is recoverable — the UI should surface the error and the
//   admin can retry.  A future enhancement can wrap both writes in a Postgres
//   function called via .rpc() for true atomicity.
//
// Access: admin and qa_manager only.
// ---------------------------------------------------------------------------

export async function resolveTriageItem(
  id: string,
  resolution: TriageStatus,
): Promise<ResolveTriageResult> {
  // Guard: only 'approved' and 'rejected' are valid resolutions.
  if (resolution !== "approved" && resolution !== "rejected") {
    return {
      success: false,
      error: `Invalid resolution '${resolution}'. Must be 'approved' or 'rejected'.`,
    };
  }

  // Verify session and resolve identity.
  const { userId, orgId, role, error: ctxError } = await resolveCallerContext();

  if (ctxError || !orgId || !role) {
    return { success: false, error: ctxError ?? "Unauthorized." };
  }

  // Gate: only admin and qa_manager may resolve triage items.
  if (!["admin", "qa_manager"].includes(role)) {
    return {
      success: false,
      error: "Forbidden: only QA managers and admins can resolve triage items.",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Fetch the triage row + the FULL original evidence_log row.
  //
  // We need the complete evidence_log to clone it (append-only pattern).
  // We scope to the caller's org via the join predicate to prevent a
  // cross-tenant UUID-guessing attack.
  // ─────────────────────────────────────────────────────────────────────────
  const { data: triageRow, error: fetchError } = await adminClient
    .from("ai_triage_queue")
    .select(
      `
      id,
      evidence_log_id,
      suggested_req_id,
      status,
      evidence_logs!inner (
        log_id,
        org_id,
        user_id,
        build_id,
        req_id,
        previous_log_hash,
        signature_hash,
        raw_command,
        sanitized_payload,
        execution_status,
        execution_timestamp,
        is_deprecated,
        event_source,
        developer_email,
        ai_tokens_used
      )
      `
    )
    .eq("id", id)
    .eq("evidence_logs.org_id", orgId)
    .single();

  if (fetchError || !triageRow) {
    console.error("[resolveTriageItem] Triage row fetch error:", fetchError?.message);
    return {
      success: false,
      error: "Triage item not found or you do not have permission to resolve it.",
    };
  }

  // Guard: only pending items can be resolved.
  if (triageRow.status !== "pending") {
    return {
      success: false,
      error: `Triage item has already been resolved (status: '${triageRow.status}').`,
    };
  }

  // Type the joined evidence_log row (from the !inner join result).
  const originalLog = triageRow.evidence_logs as unknown as {
    log_id: string;
    org_id: string;
    user_id: string;
    build_id: string;
    req_id: string;
    previous_log_hash: string | null;
    signature_hash: string;
    raw_command: string;
    sanitized_payload: unknown;
    execution_status: string;
    execution_timestamp: string;
    is_deprecated: boolean | null;
    event_source: string;
    developer_email: string | null;
    ai_tokens_used: number | null;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 (approved path only): APPEND-ONLY correction per 21 CFR Part 11.
  //
  // Instead of mutating the cryptographically signed original row, we:
  //   a. Clone the original payload, substituting req_id with suggested_req_id.
  //   b. Re-sign the clone: SHA-256(OMNIS_SIGNING_SECRET + serialisedPayload).
  //   c. Insert the clone as a brand-new evidence_logs row with:
  //        - new log_id (UUID)
  //        - event_source = "triage-correction"  ← marks it as QA-corrected
  //        - supersedes_log_id = original log_id  ← chain link for audits
  //        - previous_log_hash = original signature_hash  ← cryptographic chain
  //   d. Mark the original row is_deprecated = true so it is hidden from
  //      active views but remains fully intact in the immutable ledger.
  // ─────────────────────────────────────────────────────────────────────────
  let correctedLogId: string | null = null;

  if (resolution === "approved") {
    // a. Re-sign with the corrected payload.
    const signingSecret = process.env.OMNIS_SIGNING_SECRET;
    if (!signingSecret) {
      console.error("[resolveTriageItem] FATAL: OMNIS_SIGNING_SECRET is not set.");
      return {
        success: false,
        error: "Server misconfiguration: OMNIS_SIGNING_SECRET is not set. Contact an administrator.",
      };
    }

    const serialisedPayload = JSON.stringify(originalLog.sanitized_payload);
    const newSignatureHash = createHash("sha256")
      .update(signingSecret + serialisedPayload)
      .digest("hex");

    // b. Build the corrected clone row.
    correctedLogId = crypto.randomUUID();
    const correctedRow = {
      log_id:                correctedLogId,
      org_id:                originalLog.org_id,
      user_id:               originalLog.user_id,
      build_id:              originalLog.build_id,
      req_id:                triageRow.suggested_req_id,        // ← corrected code
      previous_log_hash:     originalLog.signature_hash,       // ← chain to original
      signature_hash:        newSignatureHash,                  // ← fresh signature
      raw_command:           originalLog.raw_command,
      sanitized_payload:     originalLog.sanitized_payload,
      execution_status:      originalLog.execution_status,
      execution_timestamp:   originalLog.execution_timestamp,
      is_deprecated:         false,
      event_source:          "triage-correction",              // ← QA-corrected marker
      supersedes_log_id:     originalLog.log_id,              // ← points to original
      developer_email:       originalLog.developer_email ?? null,
      ai_tokens_used:        originalLog.ai_tokens_used ?? null,
    };

    // c. Insert the corrected clone.
    const { error: insertError } = await adminClient
      .from("evidence_logs")
      .insert(correctedRow);

    if (insertError) {
      console.error("[resolveTriageItem] Corrected log insert error:", insertError.message);
      return {
        success: false,
        error: "Database error: could not insert corrected evidence log. The original log has NOT been deprecated.",
      };
    }

    // d. Deprecate the original log.
    const { error: deprecateError } = await adminClient
      .from("evidence_logs")
      .update({ is_deprecated: true })
      .eq("log_id", originalLog.log_id)
      .eq("org_id", orgId); // org guard — defence in depth

    if (deprecateError) {
      console.error("[resolveTriageItem] Deprecation error:", deprecateError.message);
      // Corrected log was already inserted. We must surface this so an admin
      // can manually deprecate the original — the ledger is not in a broken
      // state, just has a duplicate active row until resolved.
      return {
        success: false,
        error:
          "Corrected log was inserted but the original log could not be deprecated. " +
          "Contact your administrator to manually set is_deprecated = true on log_id: " +
          originalLog.log_id,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Update the triage queue status.
  // ─────────────────────────────────────────────────────────────────────────
  const { error: statusError } = await adminClient
    .from("ai_triage_queue")
    .update({ status: resolution })
    .eq("id", id);

  if (statusError) {
    console.error("[resolveTriageItem] Status update error:", statusError.message);
    return {
      success: false,
      error: "Database error: could not update triage item status.",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Write the 21 CFR Part 11 audit record for this triage resolution.
  //
  // entity_id is the CORRECTED log id (approved) or the original (rejected).
  // The before snapshot captures the original log's req_id at call time —
  // NOT the cached original_req_id from when the triage item was created.
  // ─────────────────────────────────────────────────────────────────────────
  const auditBefore = {
    triage_id: id,
    status: "pending",
    original_log_id: originalLog.log_id,
    original_req_id: originalLog.req_id,
  };

  const auditAfter =
    resolution === "approved"
      ? {
          resolution: "approved",
          resolved_by: userId ?? "service_role",
          corrected_log_id: correctedLogId,
          req_id_updated_to: triageRow.suggested_req_id,
          original_log_deprecated: true,
        }
      : {
          resolution: "rejected",
          resolved_by: userId ?? "service_role",
          req_id_updated_to: null,
          original_log_deprecated: false,
        };

  const auditResult = await writeAuditLog({
    userId: userId ?? "service_role",
    orgId,
    actionType: "TRIAGE_RESOLVE",
    entityType: "EVIDENCE_LOG",
    entityId: correctedLogId ?? triageRow.evidence_log_id,
    before: auditBefore,
    after: auditAfter,
  });

  if (auditResult.error) {
    console.error(
      "[AUDIT TRAIL] CRITICAL: audit_logs insert failed for triage item " +
        id +
        ". This is a 21 CFR Part 11 violation. Investigate immediately.",
      {
        triage_id: id,
        action_type: "TRIAGE_RESOLVE",
        entity_type: "EVIDENCE_LOG",
        entity_id: correctedLogId ?? triageRow.evidence_log_id,
        error: auditResult.error,
      },
    );
    return {
      success: false,
      error: "Compliance audit record failed to write. Contact an administrator.",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Revalidate affected pages.
  // ─────────────────────────────────────────────────────────────────────────
  revalidatePath("/dashboard/triage");
  revalidatePath("/dashboard");
  revalidatePath("/readiness");
  revalidatePath(`/logs/${originalLog.log_id}`);
  if (correctedLogId) revalidatePath(`/logs/${correctedLogId}`);

  return {
    success: true,
    suggestedReqId: triageRow.suggested_req_id,
    originalReqId: originalLog.req_id,
    correctedLogId: correctedLogId ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Action: getPendingCount
// ---------------------------------------------------------------------------
// Returns the number of pending triage items for the caller's org.
//
// Used by DashboardLayout during SSR to populate the navigation badge.
// Does NOT require a QA Manager / Admin role — the caller is responsible for
// not rendering the badge for developer/viewer roles (Requirement 8.7).
//
// All failure modes (unauthenticated, missing org, DB error) return
// { count: 0 } so the badge silently hides rather than surfacing an error
// in the navigation chrome.
// ---------------------------------------------------------------------------

export async function getPendingCount(): Promise<{ count: number; error?: string }> {
  // Resolve the caller's org_id from the trusted server-side session.
  // If this fails for any reason, return { count: 0 } — do NOT surface an error.
  const { orgId, error: ctxError } = await resolveCallerContext();

  if (ctxError || !orgId) {
    return { count: 0 };
  }

  // COUNT query — { count: "exact", head: true } avoids fetching row data.
  // Org scoping is enforced via the evidence_logs join predicate.
  const { count, error } = await adminClient
    .from("ai_triage_queue")
    .select("id, evidence_logs!inner ( org_id )", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("evidence_logs.org_id", orgId);

  if (error) {
    // DB errors are swallowed — the badge silently hides (Requirement 8.7).
    console.error("[getPendingCount] Supabase count error:", error.message);
    return { count: 0 };
  }

  return { count: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Action: getTriageStats
// ---------------------------------------------------------------------------
// Returns a breakdown of pending / approved / rejected counts for the
// caller's org. Used by TriageStatsSidebar to display high-level system
// health at a glance. Read-only — no mutations.
//
// All failure modes return zeroed counts so the sidebar renders gracefully.
// ---------------------------------------------------------------------------

export interface TriageStatsResult {
  pending: number;
  approved: number;
  rejected: number;
}

export async function getTriageStats(): Promise<TriageStatsResult> {
  const { orgId, error: ctxError } = await resolveCallerContext();

  if (ctxError || !orgId) {
    return { pending: 0, approved: 0, rejected: 0 };
  }

  // Run three COUNT queries in parallel — one per status.
  const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
    adminClient
      .from("ai_triage_queue")
      .select("id, evidence_logs!inner ( org_id )", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("evidence_logs.org_id", orgId),
    adminClient
      .from("ai_triage_queue")
      .select("id, evidence_logs!inner ( org_id )", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("evidence_logs.org_id", orgId),
    adminClient
      .from("ai_triage_queue")
      .select("id, evidence_logs!inner ( org_id )", { count: "exact", head: true })
      .eq("status", "rejected")
      .eq("evidence_logs.org_id", orgId),
  ]);

  return {
    pending: pendingResult.count ?? 0,
    approved: approvedResult.count ?? 0,
    rejected: rejectedResult.count ?? 0,
  };
}
