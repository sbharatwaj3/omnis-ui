// Feature: triage-inbox-resolution, Property 5: Approve always patches evidence_logs.req_id to suggested_req_id
/**
 * Validates: Requirement 3.2
 *
 * For any pending triage item resolved with resolution = 'approved', after
 * resolveTriageItem returns success: true, the .update({ req_id: suggested_req_id })
 * call on evidence_logs must use exactly the triage row's suggested_req_id value.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("@/utils/supabase/server");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { mockQueryBuilder } from "../../../__mocks__/supabase-admin";
import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import { fcUuid, fcReqId } from "../test-fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Helper: build a minimal server-client stub for an authorised QA manager.
// Constructs fresh vi.fn() instances on each call so vi.clearAllMocks()
// between runs doesn't silently break the stubs.
// ---------------------------------------------------------------------------

function buildQAManagerServerClient(userId: string, orgId: string): SupabaseClient {
  const profileBuilder = mockQueryBuilder({ data: { org_id: orgId }, error: null });
  const roleBuilder = mockQueryBuilder({ data: { role: "qa_manager" }, error: null });

  let fromCallCount = 0;
  const fromFn = vi.fn((_table: string) => {
    fromCallCount++;
    if (fromCallCount === 1) return profileBuilder;
    return roleBuilder;
  });

  return {
    from: fromFn,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email: "qa@example.com" } },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Property 5: Approve always patches evidence_logs.req_id to suggested_req_id
// ---------------------------------------------------------------------------

describe("Property 5: Approve always patches evidence_logs.req_id to suggested_req_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset adminClient.from to a safe default between runs.
    const defaultBuilder = mockQueryBuilder({ data: null, error: null });
    vi.mocked(adminClient.from).mockReturnValue(
      defaultBuilder as ReturnType<typeof adminClient.from>,
    );
  });

  it(
    "calls evidence_logs.update with exactly { req_id: suggested_req_id } for any approved resolution",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fcUuid(),    // triageId
          fcUuid(),    // userId
          fcUuid(),    // orgId
          fcUuid(),    // evidenceLogId
          fcReqId(),   // suggested_req_id — arbitrary regulatory clause string
          fcReqId(),   // original_req_id (the current req_id on the evidence log)
          async (triageId, userId, orgId, evidenceLogId, suggestedReqId, currentReqId) => {
            // ---- Arrange: auth (QA manager) ---------------------------------
            const serverClient = buildQAManagerServerClient(userId, orgId);
            vi.mocked(createClient).mockResolvedValue(serverClient);

            // ---- Arrange: triage row fetch result ---------------------------
            const pendingTriageRow = {
              id: triageId,
              evidence_log_id: evidenceLogId,
              suggested_req_id: suggestedReqId,
              status: "pending",
              evidence_logs: { org_id: orgId, req_id: currentReqId },
            };

            // Build per-call builders for the 4 adminClient.from calls made
            // during the approve path of resolveTriageItem:
            //   1. ai_triage_queue select (fetch triage row)
            //   2. ai_triage_queue update (set status = 'approved')
            //   3. evidence_logs update  (patch req_id)  ← we capture this
            //   4. audit_logs insert

            // Call 1: fetch triage row
            const fetchBuilder = mockQueryBuilder({
              data: pendingTriageRow,
              error: null,
            });

            // Call 2: status update on ai_triage_queue — success, no data needed
            const statusUpdateBuilder = mockQueryBuilder({ data: null, error: null });

            // Call 3: evidence_logs update — capture the argument and return success
            let capturedEvidenceLogUpdateArg: unknown = undefined;
            const evidenceLogsUpdateBuilder = {
              ...mockQueryBuilder({ data: null, error: null }),
              update: vi.fn((payload: unknown) => {
                capturedEvidenceLogUpdateArg = payload;
                return evidenceLogsUpdateBuilder;
              }),
            };

            // Call 4: audit_logs insert — success
            const auditInsertBuilder = mockQueryBuilder({ data: null, error: null });

            // Wire adminClient.from with a call counter to dispatch the right builder
            let adminFromCallCount = 0;
            vi.mocked(adminClient.from).mockImplementation((table: string) => {
              adminFromCallCount++;

              if (adminFromCallCount === 1 && table === "ai_triage_queue") {
                return fetchBuilder as ReturnType<typeof adminClient.from>;
              }
              if (adminFromCallCount === 2 && table === "ai_triage_queue") {
                return statusUpdateBuilder as ReturnType<typeof adminClient.from>;
              }
              if (adminFromCallCount === 3 && table === "evidence_logs") {
                return evidenceLogsUpdateBuilder as ReturnType<typeof adminClient.from>;
              }
              if (adminFromCallCount === 4 && table === "audit_logs") {
                return auditInsertBuilder as ReturnType<typeof adminClient.from>;
              }
              // Fallback — should not be reached in a correct approve path
              return mockQueryBuilder({ data: null, error: null }) as ReturnType<
                typeof adminClient.from
              >;
            });

            // ---- Act --------------------------------------------------------
            const result = await resolveTriageItem(triageId, "approved");

            // ---- Assert 1: action must succeed ------------------------------
            expect(result.success).toBe(true);

            // ---- Assert 2: evidence_logs.update was called exactly once -----
            expect(evidenceLogsUpdateBuilder.update).toHaveBeenCalledTimes(1);

            // ---- Assert 3: the update payload is { req_id: suggestedReqId } exactly
            expect(capturedEvidenceLogUpdateArg).toEqual({ req_id: suggestedReqId });

            // ---- Assert 4: the req_id value comes from the triage row's
            //   suggested_req_id — not from any other field (e.g. original_req_id
            //   or currentReqId which are intentionally different in this test)
            const patchedValue = (capturedEvidenceLogUpdateArg as { req_id: string }).req_id;
            expect(patchedValue).toBe(suggestedReqId);
            expect(patchedValue).not.toBe(currentReqId); // unless they happen to coincide
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
