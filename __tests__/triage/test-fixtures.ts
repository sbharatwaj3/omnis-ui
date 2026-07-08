/**
 * omnis-ui/__tests__/triage/test-fixtures.ts
 *
 * Reusable fast-check Arbitrary generators shared across all 17 property tests
 * for the triage-inbox-resolution feature.
 *
 * Every generator produces values that satisfy the constraints imposed by the
 * ai_triage_queue schema and the AiTriageQueueRow TypeScript interface.
 */

import fc from "fast-check";

// ---------------------------------------------------------------------------
// Domain types (mirrored from the feature schema — no runtime import of app
// code here so this file is safe to import from any test context)
// ---------------------------------------------------------------------------

export type TriageStatus = "pending" | "approved" | "rejected";

export interface AiTriageQueueRow {
  id: string;             // UUID
  evidence_log_id: string; // UUID
  original_req_id: string;
  suggested_req_id: string;
  ai_reasoning: string | null;
  status: TriageStatus;
  created_at: string;     // ISO 8601 timestamp string
}

export type UserRole = "qa_manager" | "admin" | "developer" | "viewer";

export type ResolutionValue = "approved" | "rejected";

// ---------------------------------------------------------------------------
// Primitive generators
// ---------------------------------------------------------------------------

/**
 * Generates a valid RFC 4122 v4 UUID string.
 * Uses fast-check's built-in uuid generator for full spec compliance.
 */
export const fcUuid = (): fc.Arbitrary<string> => fc.uuid();

/**
 * Generates an ISO 8601 timestamp string within a realistic date range
 * (2020-01-01 to 2035-12-31) so comparisons and formatting tests are
 * exercised against plausible real-world values.
 */
export const fcIsoTimestamp = (): fc.Arbitrary<string> => {
  const minMs = new Date("2020-01-01T00:00:00.000Z").getTime();
  const maxMs = new Date("2035-12-31T23:59:59.999Z").getTime();
  return fc
    .integer({ min: minMs, max: maxMs })
    .map((ms) => new Date(ms).toISOString());
};

/**
 * Generates a regulatory requirement ID string (e.g. "CFR-820.30",
 * "IEC-62304-5.1"). Constrained to printable ASCII, 4–32 characters,
 * so they are human-readable and safe to embed in aria-label strings.
 */
export const fcReqId = (): fc.Arbitrary<string> =>
  // Generates a regulatory requirement ID starting with a letter followed by
  // 3–31 alphanumeric/separator characters — e.g. "CFR-820.30", "IEC-62304-5.1".
  // Uses fc.stringMatching (available in fast-check v4.x) instead of fc.stringOf.
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9\-._]{3,31}$/);

/**
 * Generates an AI reasoning string or null.
 * Covers both the populated and the null/empty edge cases tested by Property 4g.
 */
export const fcAiReasoning = (): fc.Arbitrary<string | null> =>
  fc.oneof(
    { arbitrary: fc.string({ minLength: 1, maxLength: 500 }), weight: 6 },
    { arbitrary: fc.constant(null), weight: 1 },
    { arbitrary: fc.constant(""), weight: 1 },
  );

/**
 * Generates one of the three valid triage statuses.
 */
export const fcTriageStatus = (): fc.Arbitrary<TriageStatus> =>
  fc.constantFrom<TriageStatus>("pending", "approved", "rejected");

/**
 * Generates a status that is NOT pending (i.e. already resolved).
 * Used by Property 13 (double-resolution) and Property 15 (no action buttons).
 */
export const fcResolvedStatus = (): fc.Arbitrary<"approved" | "rejected"> =>
  fc.constantFrom<"approved" | "rejected">("approved", "rejected");

/**
 * Generates one of the two valid resolution inputs accepted by resolveTriageItem.
 */
export const fcResolution = (): fc.Arbitrary<ResolutionValue> =>
  fc.constantFrom<ResolutionValue>("approved", "rejected");

/**
 * Generates one of the four RBAC role values.
 */
export const fcUserRole = (): fc.Arbitrary<UserRole> =>
  fc.constantFrom<UserRole>("qa_manager", "admin", "developer", "viewer");

/**
 * Generates a role that is NOT authorised to call resolveTriageItem.
 * Used by Property 16 (role gate).
 */
export const fcUnauthorizedRole = (): fc.Arbitrary<"developer" | "viewer" | null> =>
  fc.constantFrom<"developer" | "viewer" | null>("developer", "viewer", null);

/**
 * Generates an authorised resolver role (qa_manager or admin).
 */
export const fcAuthorizedRole = (): fc.Arbitrary<"qa_manager" | "admin"> =>
  fc.constantFrom<"qa_manager" | "admin">("qa_manager", "admin");

// ---------------------------------------------------------------------------
// Composite generators
// ---------------------------------------------------------------------------

/**
 * Generates a complete AiTriageQueueRow with all fields populated to valid,
 * arbitrary values. By default the status is drawn from all three variants.
 */
export const fcAiTriageQueueRow = (
  overrides: Partial<{
    status: fc.Arbitrary<TriageStatus>;
    ai_reasoning: fc.Arbitrary<string | null>;
  }> = {},
): fc.Arbitrary<AiTriageQueueRow> =>
  fc.record<AiTriageQueueRow>({
    id: fcUuid(),
    evidence_log_id: fcUuid(),
    original_req_id: fcReqId(),
    suggested_req_id: fcReqId(),
    ai_reasoning: overrides.ai_reasoning ?? fcAiReasoning(),
    status: overrides.status ?? fcTriageStatus(),
    created_at: fcIsoTimestamp(),
  });

/**
 * Generates a pending AiTriageQueueRow (status is always "pending").
 * Used by Properties 4, 5, 6, 8, 17.
 */
export const fcPendingTriageRow = (): fc.Arbitrary<AiTriageQueueRow> =>
  fcAiTriageQueueRow({ status: fc.constant<TriageStatus>("pending") });

/**
 * Generates an already-resolved AiTriageQueueRow (status is "approved" or
 * "rejected"). Used by Properties 13 and 15.
 */
export const fcResolvedTriageRow = (): fc.Arbitrary<AiTriageQueueRow> =>
  fcAiTriageQueueRow({ status: fcResolvedStatus() });

/**
 * Generates an array of AiTriageQueueRow with arbitrary mixed statuses.
 * Used by Properties 2, 14.
 */
export const fcTriageRowArray = (
  options: { minLength?: number; maxLength?: number } = {},
): fc.Arbitrary<AiTriageQueueRow[]> =>
  fc.array(fcAiTriageQueueRow(), {
    minLength: options.minLength ?? 0,
    maxLength: options.maxLength ?? 20,
  });

/**
 * Generates a non-empty array of AiTriageQueueRow.
 * Useful for sort-order tests (Property 2) where an empty array is trivially sorted.
 */
export const fcNonEmptyTriageRowArray = (): fc.Arbitrary<AiTriageQueueRow[]> =>
  fcTriageRowArray({ minLength: 1, maxLength: 20 });

/**
 * Generates a Supabase-shaped error object (the shape returned by the
 * Supabase JS client's `.error` property). Used by Property 3 to verify
 * error sanitization never leaks raw DB error details.
 */
export const fcSupabaseError = (): fc.Arbitrary<{
  message: string;
  code: string;
  details: string;
  hint: string;
}> =>
  fc.record({
    message: fc.string({ minLength: 1, maxLength: 200 }),
    // PostgreSQL error codes are 5-digit strings; generate realistic ones.
    code: fc.oneof(
      fc.string({
        unit: fc.constantFrom("0","1","2","3","4","5","6","7","8","9"),
        minLength: 5,
        maxLength: 5,
      }),
      fc.constant("23505"), // unique_violation
      fc.constant("42P01"), // undefined_table
      fc.constant("23503"), // foreign_key_violation
      fc.constant("PGRST116"),
    ),
    details: fc.string({ minLength: 0, maxLength: 200 }),
    hint: fc.string({ minLength: 0, maxLength: 200 }),
  });

/**
 * Generates a non-negative integer representing a pending badge count.
 * Used by Property 11.
 */
export const fcPendingCount = (): fc.Arbitrary<number> =>
  fc.nat({ max: 200 });

/**
 * Generates a pair of (callerOrgId, itemOrgId) where the two values are
 * guaranteed to be different — simulating a cross-org access attempt.
 * Used by Property 7.
 */
export const fcCrossOrgPair = (): fc.Arbitrary<{
  callerOrgId: string;
  itemOrgId: string;
}> =>
  fc
    .tuple(fcUuid(), fcUuid())
    .filter(([a, b]) => a !== b)
    .map(([callerOrgId, itemOrgId]) => ({ callerOrgId, itemOrgId }));
