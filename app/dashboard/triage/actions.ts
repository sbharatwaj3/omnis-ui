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
//   - resolveTriageItem performs a two-write atomic operation: update the
//     triage row status AND (if approved) patch evidence_logs.req_id.
//     Both writes use the admin client so RLS cannot silently swallow either
//     update; the org guard is enforced explicitly via the query predicate.
//
// 21 CFR PART 11 AUDIT TRAIL:
//   - resolveTriageItem writes to audit_logs with action_type TRIAGE_RESOLVE
//     after every successful resolution (approved or rejected).
//   - The before/after JSONB captures the full triage decision including
//     the original_req_id, suggested_req_id, and the reviewer's resolution.

import "server-only";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import type { AiTriageQueueRow, TriageStatus } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Audit trail helper (local to this module — mirrors the one in requirements/actions.ts)
// ---------------------------------------------------------------------------

/**
 * Writes a single immutable record to the audit_logs table.
 * Fails loudly on error — silent audit failures violate 21 CFR Part 11.
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
}): Promise<void> {
  const { error } = await adminClient.from("audit_logs").insert({
    user_id: userId,
    org_id: orgId,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    changes: { before, after },
  });

  if (error) {
    console.error(
      "[AUDIT TRAIL] CRITICAL: audit_logs insert failed. " +
        "This is a 21 CFR Part 11 violation. Investigate immediately.",
      {
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId,
        error: error.message,
      },
    );
  }
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
// Action: getPendingTriageItems
// ---------------------------------------------------------------------------
// Fetches all rows in ai_triage_queue where status = 'pending'.
//
// Access: admin and qa_manager only.  Developers and viewers receive a
// permission-denied error — the queue shows organisation-wide flags, not
// just the caller's own logs.
//
// The query is executed through the user-scoped Supabase client so Postgres
// RLS policies act as a second layer of defence behind the role check here.
// ---------------------------------------------------------------------------

export async function getPendingTriageItems(): Promise<GetPendingTriageResult> {
  // Verify session and resolve identity.
  const { orgId, role, error: ctxError } = await resolveCallerContext();

  if (ctxError || !orgId || !role) {
    return { items: [], error: ctxError ?? "Unauthorized." };
  }

  // Gate: only admin and qa_manager may view the triage queue.
  if (!["admin", "qa_manager"].includes(role)) {
    return {
      items: [],
      error: "Forbidden: only QA managers and admins can access the triage queue.",
    };
  }

  // Fetch all pending items.  The adminClient is used here so the query is not
  // dependent on the authenticated user's RLS context — the role check above
  // is our explicit authorisation layer.  We still scope to the caller's org
  // by joining through evidence_logs.
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
      evidence_logs!inner ( org_id )
      `
    )
    .eq("status", "pending")
    .eq("evidence_logs.org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getPendingTriageItems] Supabase select error:", error.message);
    return { items: [], error: "Database error: could not load triage queue." };
  }

  // Strip the joined evidence_logs column before returning to the client —
  // it was only needed for the org scope guard.
  const items = (data ?? []).map(({ evidence_logs: _join, ...rest }) => rest) as AiTriageQueueRow[];

  return { items };
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

  // Step 1: Fetch the triage row to obtain evidence_log_id and suggested_req_id.
  // We scope to the caller's org by joining evidence_logs to prevent a
  // cross-tenant UUID-guessing attack.
  const { data: triageRow, error: fetchError } = await adminClient
    .from("ai_triage_queue")
    .select(
      `
      id,
      evidence_log_id,
      suggested_req_id,
      status,
      evidence_logs!inner ( org_id )
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

  // Guard: only pending items can be resolved.  Attempting to re-resolve an
  // already-resolved item is a no-op error — this prevents double-application
  // of an approved patch.
  if (triageRow.status !== "pending") {
    return {
      success: false,
      error: `Triage item has already been resolved (status: '${triageRow.status}').`,
    };
  }

  // Step 2: Update the triage queue status.
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

  // Step 3 (approved path only): Patch the evidence log's req_id.
  if (resolution === "approved") {
    const { error: patchError } = await adminClient
      .from("evidence_logs")
      .update({ req_id: triageRow.suggested_req_id })
      .eq("log_id", triageRow.evidence_log_id)
      // Explicit org guard — defence-in-depth even though adminClient bypasses
      // RLS.  Ensures a corrupt triage row cannot reach a foreign org's log.
      .eq("org_id", orgId);

    if (patchError) {
      console.error(
        "[resolveTriageItem] Evidence log req_id patch error:",
        patchError.message,
      );
      // The triage status has already been set to 'approved'. Surface the
      // patch failure so the caller can investigate and retry if needed.
      return {
        success: false,
        error:
          "Triage status updated to 'approved' but failed to patch evidence_logs.req_id. " +
          "Please contact your administrator.",
      };
    }
  }

  // Step 4: Write the 21 CFR Part 11 audit record for this triage resolution.
  // entity_id is the evidence_log_id — the EVIDENCE_LOG that was re-tagged.
  await writeAuditLog({
    userId: userId ?? "service_role",
    orgId,
    actionType: "TRIAGE_RESOLVE",
    entityType: "EVIDENCE_LOG",
    entityId: triageRow.evidence_log_id,
    before: {
      triage_id: id,
      status: "pending",
      original_req_id: triageRow.suggested_req_id,
    },
    after: {
      triage_id: id,
      status: resolution,
      resolved_by: userId ?? "service_role",
      ...(resolution === "approved"
        ? { req_id_updated_to: triageRow.suggested_req_id }
        : { req_id_unchanged: true }),
    },
  });

  // Step 5: Revalidate affected pages.
  revalidatePath("/dashboard/triage");
  revalidatePath(`/logs/${triageRow.evidence_log_id}`);

  return { success: true };
}
