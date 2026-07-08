// Feature: triage-inbox-resolution, Property 13: Double-resolution always returns error
/**
 * Validates: Requirements 5.1, 5.2
 *
 * For any triage item whose `status` is 'approved' or 'rejected', calling
 * resolveTriageItem with any resolution value must return success: false with
 * an error message indicating the item has already been resolved. No rows in
 * ai_triage_queue, evidence_logs, or audit_logs may be mutated.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";

// Mock the server client so createClient() can be configured per-test.
// The admin client alias is already wired globally in vitest.config.ts to
// __mocks__/supabase-admin.ts — no vi.mock() call needed for that one.
vi.mock("@/utils/supabase/server");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { mockQueryBuilder } from "../../../__mocks__/supabase-admin";
import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import { fcUuid, fcResolvedStatus, fcResolution } from "../test-fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Helper: build a minimal SupabaseClient stub for an authorised QA manager.
// Constructs fresh vi.fn() instances on each call — immune to vi.clearAllMocks.
// ---------------------------------------------------------------------------

function buildQAManagerServerClient(userId: string, orgId: string): SupabaseClient {
  const profileBuilder = mockQueryBuilder({ data: { org_id: orgId }, error: null });
  const roleBuilder = mockQueryBuilder({ data: { role: "qa_manager" }, error: null });

  const fromFn = vi.fn((table: string) => {
    if (table === "users") return profileBuilder;
    if (table === "user_roles") return roleBuilder;
    return mockQueryBuilder({ data: null, error: null });
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
// Property 13: Double-resolution always returns error and never mutates the DB
// ---------------------------------------------------------------------------

describe("Property 13: Double-resolution always returns error and never mutates the DB", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset adminClient.from to a safe default between tests.
    const defaultBuilder = mockQueryBuilder({ data: null, error: null });
    vi.mocked(adminClient.from).mockReturnValue(
      defaultBuilder as ReturnType<typeof adminClient.from>,
    );
  });

  it(
    "returns success=false with 'already been resolved' for any already-resolved status and any resolution value",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // The ID of the triage item being resolved.
          fcUuid(),
          // The item's current status — already resolved ('approved' or 'rejected').
          fcResolvedStatus(),
          // The resolution the caller is attempting to apply (any valid value).
          fcResolution(),
          // Supporting identifiers for a realistic triage row.
          fcUuid(), // orgId for the caller's session
          fcUuid(), // evidenceLogId
          fcUuid(), // suggestedReqId (UUID placeholder — format doesn't matter)
          async (
            triageId,
            resolvedStatus,
            attemptedResolution,
            orgId,
            evidenceLogId,
            suggestedReqId,
          ) => {
            // ---- Auth -------------------------------------------------------
            // Build a fresh QA manager server client and wire it into createClient().
            const serverClient = buildQAManagerServerClient("qa-manager-user-id", orgId);
            vi.mocked(createClient).mockResolvedValue(serverClient);

            // ---- Triage row fetch -------------------------------------------
            // Wire adminClient.from("ai_triage_queue") to return an already-
            // resolved row. resolveTriageItem should bail out here without writes.
            const alreadyResolvedRow = {
              id: triageId,
              evidence_log_id: evidenceLogId,
              suggested_req_id: suggestedReqId,
              status: resolvedStatus,
              evidence_logs: { org_id: orgId, req_id: suggestedReqId },
            };

            const fetchBuilder = mockQueryBuilder({
              data: alreadyResolvedRow,
              error: null,
            });

            // Spy builder tracks any unexpected write calls after the status check.
            const updateSpy = vi.fn().mockReturnThis();
            const insertSpy = vi.fn().mockReturnThis();

            let adminFromCallCount = 0;
            vi.mocked(adminClient.from).mockImplementation((table: string) => {
              adminFromCallCount++;
              if (adminFromCallCount === 1 && table === "ai_triage_queue") {
                // First call: the triage row fetch — return the resolved row.
                return fetchBuilder as ReturnType<typeof adminClient.from>;
              }
              // Any further call is unexpected — return a spy builder.
              const unexpectedBuilder = {
                ...mockQueryBuilder({ data: null, error: null }),
                update: updateSpy,
                insert: insertSpy,
              };
              return unexpectedBuilder as ReturnType<typeof adminClient.from>;
            });

            // ---- Act --------------------------------------------------------
            const result = await resolveTriageItem(triageId, attemptedResolution);

            // ---- Assert 1: must return failure ------------------------------
            expect(result.success).toBe(false);

            // ---- Assert 2: error message must contain "already been resolved"
            expect(result.error).toBeDefined();
            expect(result.error!.toLowerCase()).toContain("already been resolved");

            // ---- Assert 3: only one adminClient.from call (the fetch) -------
            expect(adminFromCallCount).toBe(1);

            // ---- Assert 4: zero .update() / .insert() calls ----------------
            expect(updateSpy).not.toHaveBeenCalled();
            expect(insertSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
