"use server";
// omnis-ui/app/logs/[id]/actions.ts
// 21 CFR Part 11 digital signature server action.
//
// CONSTITUTION LAW II: No auth bypass. Session is verified server-side on
// every invocation. The client never touches approved_by or approved_at
// directly — those writes happen exclusively here, inside a Server Action.
//
// SECURITY (Security Standard §II.1 — cross-tenant guard):
//   The UPDATE predicate includes BOTH log_id AND org_id (derived from the
//   verified session, never from the client) to prevent an authenticated user
//   from guessing a foreign org's log_id and stamping their signature on it.
//
// RBAC (Constitution §VII.2):
//   Only admin and qa_manager roles may affix a digital approval signature.
//   Developers and viewers are blocked at the action level — the UI
//   disables the button, but this server-side check is the authoritative gate.

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

export interface ApproveLogResult {
  success: boolean;
  error?: string;
}

export async function approveLog(logId: string): Promise<ApproveLogResult> {
  // Step 1: Verify the authenticated session server-side.
  // A forged or missing session terminates the action here — we never reach
  // the database write. This satisfies 21 CFR Part 11 §11.10(d) (system
  // access limited to authorized individuals).
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: "Unauthorized: valid session required to approve a log.",
    };
  }

  // Step 2: Resolve the caller's org_id and RBAC role from the verified session.
  // We use adminClient to bypass RBAC-gated RLS on the users/user_roles tables
  // (same pattern as requirements/actions.ts — sanctioned by Constitution §II).
  // user.id comes from the JWT above — never client-supplied.
  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    return {
      success: false,
      error: "Could not resolve your organization. Please complete onboarding.",
    };
  }

  const orgId: string = profile.org_id;

  // Step 3: RBAC gate — only admin and qa_manager may sign evidence logs.
  // 21 CFR Part 11 §11.10(d): system access limited to authorized individuals.
  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  const role = roleRow?.role ?? null;

  if (role !== "admin" && role !== "qa_manager") {
    return {
      success: false,
      error: "Forbidden: only Admins and QA Managers may approve evidence logs.",
    };
  }

  // Step 4: Write the digital signature.
  // approved_by   → the authenticated user's UUID (immutable audit trail)
  // approved_at   → server-side timestamp (now()) — never client-supplied
  //
  // CROSS-TENANT GUARD: the .eq("org_id", orgId) predicate ensures the UPDATE
  // can only succeed on a log that belongs to the caller's own organisation.
  // A guessed foreign log_id will produce 0 rows affected, not an error —
  // safe fail-closed behaviour. The .is("approved_by", null) guard prevents
  // re-signing an already-approved log (double-signature race condition).
  const { error: updateError } = await supabase
    .from("evidence_logs")
    .update({
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("log_id", logId)
    .eq("org_id", orgId)
    .is("approved_by", null);

  if (updateError) {
    console.error("approveLog: Supabase update error:", updateError.message);
    return {
      success: false,
      error: "Database error: could not write approval signature.",
    };
  }

  // Step 5: Invalidate the cached page so the UI reflects the new state
  // immediately without requiring a manual browser refresh.
  revalidatePath(`/logs/${logId}`);

  return { success: true };
}
