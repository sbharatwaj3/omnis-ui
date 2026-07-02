// app/dashboard/usage/lib/usage-logic.ts
//
// Pure logic functions and shared types for the Token Usage Dashboard.
// Extracted from actions.ts so they can be tested in a browser / Vitest
// environment without triggering the `server-only` guard.
//
// DO NOT add `import 'server-only'` here — this file must remain importable
// in test runners and client contexts.
//
// All shared types are defined here; actions.ts imports them from here.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared types (single source of truth — actions.ts re-imports these)
// ---------------------------------------------------------------------------

/** Time-range presets available in the Developer Leaderboard filter (Req 4.1). */
export type TimeFilter = "7d" | "30d" | "90d" | "all";

/**
 * Org-level quota snapshot derived from organizations.token_units_used /
 * organizations.token_units_limit (Req 2.1).
 */
export interface QuotaData {
  tokenUnitsUsed: number;
  tokenUnitsLimit: number;
  /** floor((used / limit) * 100). Always 0 when limit === 0. */
  usagePct: number;
  status: "healthy" | "warning" | "exhausted";
}

/**
 * Per-developer aggregated leaderboard row (Req 3.1–3.6).
 * All string values are normalised; never null in the output.
 */
export interface DeveloperUsageRow {
  developer_email: string;
  total_logs_uploaded: number;
  total_tokens_consumed: number;
}

/**
 * Standard return envelope for every Server Action in this module.
 * On success, `data` is present and `error` is absent.
 * On failure, `error` is present and `data` is absent (Req 9.1).
 * Raw Supabase error text MUST NOT appear in `error.message` (Req 9.3).
 */
export interface ActionResult<T> {
  data?: T;
  error?: { message: string };
}

// ---------------------------------------------------------------------------
// developerUsageInputSchema — re-exported from here so tests can import it
// without pulling in `actions.ts` (which carries `import "server-only"`).
// ---------------------------------------------------------------------------
/**
 * Validates the raw client-supplied input for getDeveloperUsage().
 * .strip() silently drops any extra keys (Security Standard §III.1, Req 6.5).
 *
 * Exported for property-based testing (Property 8 in design.md).
 */
export const developerUsageInputSchema = z
  .object({
    timeFilter: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  })
  .strip();

// ---------------------------------------------------------------------------
// Canonical sentinel for unknown / empty developer emails (Req 3.5).
// ---------------------------------------------------------------------------
const UNKNOWN_LABEL = "Unknown Developer";

// ---------------------------------------------------------------------------
// normaliseEmail
// ---------------------------------------------------------------------------
/**
 * Normalises a raw `developer_email` value to a stable display label.
 *
 * The following values all map to `"Unknown Developer"`:
 *   - `null` / `undefined`
 *   - empty string
 *   - whitespace-only strings
 *   - the literal `"unknown_developer"`
 *
 * Any other value is returned trimmed.
 *
 * Exported for property-based testing (Property 5 in design.md).
 *
 * Requirements: 3.5
 */
export function normaliseEmail(raw: string | null | undefined): string {
  if (!raw) return UNKNOWN_LABEL;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "unknown_developer") return UNKNOWN_LABEL;
  return trimmed;
}

// ---------------------------------------------------------------------------
// deriveQuotaData
// ---------------------------------------------------------------------------
/**
 * Derives a `QuotaData` snapshot from raw DB integers, or returns an error
 * sentinel when `limit === 0` (Req 2.9 — never divide by zero).
 *
 * Status thresholds:
 *   - `ratio < 0.80`          → `"healthy"`
 *   - `0.80 ≤ ratio < 1.00`   → `"warning"`
 *   - `ratio ≥ 1.00`           → `"exhausted"`
 *
 * Exported for property-based testing (Property 3 in design.md).
 *
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.9
 */
export function deriveQuotaData(
  used: number,
  limit: number,
): QuotaData | { error: true } {
  if (limit === 0) return { error: true };

  const ratio = used / limit;
  const usagePct = Math.floor(ratio * 100);
  const status: QuotaData["status"] =
    ratio >= 1.0 ? "exhausted" : ratio >= 0.8 ? "warning" : "healthy";

  return { tokenUnitsUsed: used, tokenUnitsLimit: limit, usagePct, status };
}

// ---------------------------------------------------------------------------
// getWindowStart
// ---------------------------------------------------------------------------
/**
 * Returns the UTC ISO-8601 string for midnight (00:00:00.000Z) at the start
 * of the requested rolling window, or `null` when `filter === "all"`.
 *
 * Callers should place the `org_id` predicate first and this timestamp
 * predicate second (Req 8.5) so the composite index is used.
 *
 * Exported for property-based testing (Property 6 in design.md).
 *
 * Requirements: 4.2, 4.3
 */
export function getWindowStart(filter: TimeFilter): string | null {
  if (filter === "all") return null;

  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// buildLeaderboard
// ---------------------------------------------------------------------------
/**
 * Groups raw `evidence_logs` rows by normalised developer email, sums
 * `ai_tokens_used`, counts log rows, and returns the aggregated result
 * sorted by:
 *   - Primary:   `total_tokens_consumed` DESC
 *   - Secondary: `developer_email` ASC  (tiebreaker, Req 3.3)
 *
 * Null `ai_tokens_used` values contribute `0` to the sum (Req 3.6).
 * Null / empty / whitespace / `"unknown_developer"` emails are all grouped
 * under `"Unknown Developer"` (Req 3.5).
 *
 * Exported for property-based testing (Property 4 in design.md).
 *
 * Requirements: 3.1, 3.3, 3.5, 3.6, 4.2, 4.3
 */
export function buildLeaderboard(
  rows: Array<{
    developer_email: string | null;
    ai_tokens_used: number | null;
  }>,
): DeveloperUsageRow[] {
  const groupMap = new Map<
    string,
    { total_logs_uploaded: number; total_tokens_consumed: number }
  >();

  for (const row of rows) {
    const label = normaliseEmail(row.developer_email);
    const tokens = row.ai_tokens_used ?? 0;
    const existing = groupMap.get(label);

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

  return Array.from(groupMap.entries())
    .map(([developer_email, stats]) => ({ developer_email, ...stats }))
    .sort((a, b) => {
      const tokenDiff = b.total_tokens_consumed - a.total_tokens_consumed;
      if (tokenDiff !== 0) return tokenDiff;
      // Tiebreaker: email ascending (Req 3.3)
      return a.developer_email.localeCompare(b.developer_email);
    });
}
