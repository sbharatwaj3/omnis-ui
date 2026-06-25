"use server";
// omnis-ui/app/dashboard/usage/actions.ts
// Developer Token Usage — Server Actions
//
// CONSTITUTION LAW II:
//   - Session verified server-side on every invocation. No auth bypass.
//   - Identity derived from the Supabase JWT (createClient → auth.getUser()).
//   - All data queries use adminClient (service role) to bypass RLS chain
//     resolution issues introduced by the RBAC migration (20260616).
//   - All secrets loaded via process.env; nothing hardcoded.
//
// IEC 62304 / 21 CFR PART 11:
//   - This action reads evidence_logs for the caller's org only.
//   - No mutation — pure aggregation query. No audit trail entry required.

import "server-only";

import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeveloperUsageRow {
  /** Display label — never null in the output */
  developer_email: string;
  total_logs_uploaded: number;
  total_tokens_consumed: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Canonical "unknown" sentinel values that get grouped under one label. */
const UNKNOWN_LABEL = "Unknown Developer";

function normaliseEmail(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "" || raw.trim() === "unknown_developer") {
    return UNKNOWN_LABEL;
  }
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Action: getDeveloperUsage
// ---------------------------------------------------------------------------
// Fetches ALL evidence_logs rows for the caller's org, groups them by
// developer_email, and returns a leaderboard sorted DESCENDING by
// total_tokens_consumed.
//
// Pagination: rows are fetched in batches of 1000 to stay within the
// Supabase default range limit (same pattern as fetchAllLogs on the main
// dashboard).
//
// Access: any authenticated member of the org may call this action.
// ---------------------------------------------------------------------------

export async function getDeveloperUsage(): Promise<{
  rows: DeveloperUsageRow[];
  error?: string;
}> {
  // Step 1: Verify the authenticated session via the session client.
  // auth.getUser() validates the JWT cryptographically server-side —
  // the resolved user.id is the only trusted identity source.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { rows: [], error: "Unauthorized." };
  }

  // Step 2: Resolve org_id via adminClient to bypass any RLS evaluation
  // that could silently return null for certain RBAC configurations.
  // The user.id here comes from the verified JWT above — never client-supplied.
  let orgId: string;
  try {
    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.org_id) {
      console.error(
        "[getDeveloperUsage] Could not resolve org_id for user:",
        user.id,
        profileError?.message,
      );
      return { rows: [], error: "Unauthorized." };
    }

    orgId = profile.org_id as string;
  } catch (err) {
    console.error("[getDeveloperUsage] Unexpected error resolving org_id:", err);
    return { rows: [], error: "Failed to resolve organisation." };
  }

  // Step 3: Fetch ALL evidence_logs rows for this org in batches of 1000.
  // We only need developer_email and ai_tokens_used to minimise data transfer.
  interface RawLogRow {
    developer_email: string | null;
    ai_tokens_used: number | null;
  }

  let allRows: RawLogRow[] = [];
  let from = 0;
  const batchSize = 1000;

  try {
    while (true) {
      const { data: batch, error: fetchError } = await adminClient
        .from("evidence_logs")
        .select("developer_email, ai_tokens_used")
        .eq("org_id", orgId)
        .range(from, from + batchSize - 1);

      if (fetchError) {
        console.error(
          "[getDeveloperUsage] Supabase error fetching evidence_logs:",
          fetchError.message,
        );
        return { rows: [], error: "Failed to load usage data." };
      }

      if (!batch || batch.length === 0) break;
      allRows = allRows.concat(batch as RawLogRow[]);
      if (batch.length < batchSize) break;
      from += batchSize;
    }
  } catch (err) {
    console.error("[getDeveloperUsage] Unexpected error during fetch:", err);
    return { rows: [], error: "Failed to load usage data." };
  }

  // Step 4: Group rows in TypeScript by normalised developer_email.
  // Any null / empty / "unknown_developer" values are bucketed under
  // the display label "Unknown Developer".
  const groupMap = new Map<
    string,
    { total_logs_uploaded: number; total_tokens_consumed: number }
  >();

  for (const row of allRows) {
    const label = normaliseEmail(row.developer_email);
    const existing = groupMap.get(label);
    const tokens = row.ai_tokens_used ?? 0;

    if (existing) {
      existing.total_logs_uploaded += 1;
      existing.total_tokens_consumed += tokens;
    } else {
      groupMap.set(label, {
        total_logs_uploaded: 1,
        total_tokens_consumed: tokens,
      });
    }
  }

  // Step 5: Convert to array and sort DESCENDING by total_tokens_consumed.
  const sorted: DeveloperUsageRow[] = Array.from(groupMap.entries())
    .map(([developer_email, stats]) => ({
      developer_email,
      ...stats,
    }))
    .sort((a, b) => b.total_tokens_consumed - a.total_tokens_consumed);

  return { rows: sorted };
}
