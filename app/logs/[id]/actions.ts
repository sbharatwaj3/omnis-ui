"use server";
// omnis-ui/app/logs/[id]/actions.ts
// 21 CFR Part 11 digital signature server action.
//
// CONSTITUTION LAW II: No auth bypass. Session is verified server-side on
// every invocation. The client never touches approved_by or approved_at
// directly — those writes happen exclusively here, inside a Server Action.

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

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

  // Step 2: Write the digital signature.
  // approved_by   → the authenticated user's UUID (immutable audit trail)
  // approved_at   → server-side timestamp (now()) — never client-supplied
  const { error: updateError } = await supabase
    .from("evidence_logs")
    .update({
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("log_id", logId)
    // Safety guard: only sign logs that have not already been approved.
    // This prevents a race condition where two simultaneous requests both
    // succeed and overwrite each other's signature.
    .is("approved_by", null);

  if (updateError) {
    console.error("approveLog: Supabase update error:", updateError.message);
    return {
      success: false,
      error: "Database error: could not write approval signature.",
    };
  }

  // Step 3: Invalidate the cached page so the UI reflects the new state
  // immediately without requiring a manual browser refresh.
  revalidatePath(`/logs/${logId}`);

  return { success: true };
}
