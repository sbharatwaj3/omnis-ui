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
//   - This module reads evidence_logs / organizations for the caller's org only.
//   - No mutation — pure aggregation queries. No audit trail entry required.
//   - Errors surface loudly as structured ActionResult.error objects; raw
//     Supabase error text is logged server-side only and never forwarded to
//     the client (Req 9.1, 9.3).

import "server-only";

import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import {
  normaliseEmail,
  deriveQuotaData,
  getWindowStart,
  buildLeaderboard,
  developerUsageInputSchema,
} from "./lib/usage-logic";
import type {
  TimeFilter,
  QuotaData,
  DeveloperUsageRow,
  ActionResult,
} from "./lib/usage-logic";

// ---------------------------------------------------------------------------
// Re-export types from lib/usage-logic (single source of truth).
// Type-only exports are permitted in "use server" files because they are
// erased at compile time and never appear as runtime values.
// ---------------------------------------------------------------------------
export type {
  TimeFilter,
  QuotaData,
  DeveloperUsageRow,
  ActionResult,
} from "./lib/usage-logic";

// ---------------------------------------------------------------------------
// Action 1: getOrgQuota
// ---------------------------------------------------------------------------
// Reads organizations.token_units_used and organizations.token_units_limit
// for the caller's org and returns a structured QuotaData snapshot.
//
// Access: admin | qa_manager (Req 1.6).
// Auth pattern: 5-step (same as getDeveloperUsage below).
// ---------------------------------------------------------------------------

export async function getOrgQuota(): Promise<ActionResult<QuotaData>> {
  // Step 1: Verify the authenticated session via the session client.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: { message: "Unauthorized." } };
  }

  // Step 2: Resolve org_id via adminClient (bypasses RBAC-gated RLS).
  // user.id is from the verified JWT — never client-supplied.
  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    console.error(
      "[getOrgQuota] Could not resolve org_id for user:",
      user.id,
      profileError?.message,
    );
    return { error: { message: "Unauthorized." } };
  }

  const orgId: string = profile.org_id as string;

  // Step 3: Resolve role via adminClient.
  const { data: roleRow, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (roleError || !roleRow) {
    console.error(
      "[getOrgQuota] Could not resolve role for user:",
      user.id,
      roleError?.message,
    );
    return { error: { message: "Unauthorized." } };
  }

  const role: string = roleRow.role as string;

  // Step 4: Gate — admin | qa_manager only (Req 1.6).
  if (role !== "admin" && role !== "qa_manager") {
    return {
      error: {
        message:
          "Forbidden: only Admins and QA Managers may access token usage telemetry.",
      },
    };
  }

  // Step 5: Query organizations for this org's quota columns only (Req 8.4).
  const { data: orgRow, error: orgError } = await adminClient
    .from("organizations")
    .select("token_units_used, token_units_limit")
    .eq("org_id", orgId)
    .single();

  if (orgError || !orgRow) {
    // Req 9.6: a success response with zero rows is a data integrity violation.
    console.error(
      "[getOrgQuota] No organizations row for org_id:",
      orgId,
      orgError?.message,
    );
    return {
      error: {
        message: "Quota data is unavailable. Contact your administrator.",
      },
    };
  }

  // Step 6: Derive QuotaData, guarding against null columns and limit === 0 (Req 2.9).
  // Null columns from DB must not silently produce NaN — treat as unconfigured.
  const rawUsed = orgRow.token_units_used;
  const rawLimit = orgRow.token_units_limit;

  if (rawUsed == null || rawLimit == null) {
    console.error("[getOrgQuota] Null quota columns for org_id:", orgId);
    return { error: { message: "Quota not configured." } };
  }

  const derived = deriveQuotaData(rawUsed as number, rawLimit as number);

  if ("error" in derived) {
    return { error: { message: "Quota not configured." } };
  }

  return { data: derived };
}

// ---------------------------------------------------------------------------
// Action 2: getDeveloperUsage
// ---------------------------------------------------------------------------
// Fetches ALL evidence_logs rows for the caller's org (optionally scoped to
// a time window), groups them by developer_email, and returns a leaderboard
// sorted DESCENDING by total_tokens_consumed with developer_email ASC as the
// tiebreaker (Req 3.3).
//
// Access: admin | qa_manager (Req 1.6, 3.11).
// Input: Zod-validated rawInput; parse failure returns error immediately
//        without executing any DB query (Req 6.5).
// Pagination: batches of 1000 rows; any mid-loop error halts immediately and
//             discards partial data (Req 8.2, 8.6).
// ---------------------------------------------------------------------------

export async function getDeveloperUsage(
  rawInput: unknown,
): Promise<ActionResult<DeveloperUsageRow[]>> {
  // ── Input validation (Req 6.5) ──────────────────────────────────────────
  // Parse before any DB call. .strip() discards unknown keys.
  const parsed = developerUsageInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: { message: "Invalid input." } };
  }
  const { timeFilter } = parsed.data;

  // ── Step 1: Verify JWT ───────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: { message: "Unauthorized." } };
  }

  // ── Step 2: Resolve org_id ───────────────────────────────────────────────
  // user.id comes from the cryptographically-verified JWT — never trusted from
  // client input.
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
    return { error: { message: "Unauthorized." } };
  }

  const orgId: string = profile.org_id as string;

  // ── Step 3: Resolve role ─────────────────────────────────────────────────
  const { data: roleRow, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (roleError || !roleRow) {
    console.error(
      "[getDeveloperUsage] Could not resolve role for user:",
      user.id,
      roleError?.message,
    );
    return { error: { message: "Unauthorized." } };
  }

  const role: string = roleRow.role as string;

  // ── Step 4: Gate — admin | qa_manager only (Req 1.6, 3.11) ─────────────
  if (role !== "admin" && role !== "qa_manager") {
    return {
      error: {
        message:
          "Forbidden: only Admins and QA Managers may access token usage telemetry.",
      },
    };
  }

  // ── Step 5: Paginated query of evidence_logs ─────────────────────────────
  // Only developer_email and ai_tokens_used are selected (Req 8.3).
  // Predicate order: org_id first, execution_timestamp second (Req 8.5).
  // Any mid-loop error halts immediately and discards partial data (Req 8.6).

  const windowStart = getWindowStart(timeFilter);

  let from = 0;
  const pageSize = 1000;
  const allRows: Array<{ developer_email: string | null; ai_tokens_used: number | null }> = [];

  while (true) {
    let query = adminClient
      .from("evidence_logs")
      .select("developer_email, ai_tokens_used")
      .eq("org_id", orgId)
      .range(from, from + pageSize - 1);

    // Apply time-range predicate second, after org_id, per Req 8.5.
    if (windowStart) {
      query = query.gte("execution_timestamp", windowStart);
    }

    const { data: page, error: pageError } = await query;

    if (pageError) {
      console.error("[getDeveloperUsage] Supabase error:", pageError.message);
      return {
        error: { message: "Failed to load usage data. Please try again." },
      };
    }

    if (!page || page.length === 0) break;
    allRows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  // ── Step 6 & 7: Group by normalised email, sum tokens, sort ─────────────
  // Delegated to buildLeaderboard() from lib/usage-logic (Req 3.3, 3.5, 3.6).
  const sorted = buildLeaderboard(allRows);

  return { data: sorted };
}
