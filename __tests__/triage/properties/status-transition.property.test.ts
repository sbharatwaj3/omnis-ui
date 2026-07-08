// Feature: triage-inbox-resolution, Property 8: Status transition is correct for both resolution types
/**
 * Validates: Requirements 3.1, 4.1
 *
 * For any pending triage item, resolving with `resolution = 'approved'` must
 * result in ai_triage_queue.status = 'approved', and resolving with
 * `resolution = 'rejected'` must result in ai_triage_queue.status = 'rejected'.
 * No other status values may be written by resolveTriageItem.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";

// Module mocks hoisted before imports that consume them.
vi.mock("@/utils/supabase/server", async () => {
  const mock = await import("../../../__mocks__/supabase-server");
  return mock;
});
vi.mock("@/utils/supabase/admin", async () => {
  const mock = await import("../../../__mocks__/supabase-admin");
  return mock;
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { mockSupabaseServerClient } from "../../../__mocks__/supabase-server";
import { mockQueryBuilder } from "../../../__mocks__/supabase-admin";
import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import { fcUuid } from "../test-fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Local generator: a pending triage row using fc.string() (not fcReqId which
// relies on fc.stringOf — unavailable in the installed fast-check version).
// ---------------------------------------------------------------------------
const fcPendingRow = () =>
  fc.record({
    id: fcUuid(),
    evidence_log_id: fcUuid(),
    original_req_id: fc.string({ minLength: 4, maxLength: 32 }),
    suggested_req_id: fc.string({ minLength: 4, maxLength: 32 }),
    ai_reasoning: fc.oneof(fc.string({ minLength: 1, maxLength: 200 }), fc.constant(null)),
    status: fc.constant("pending" as const),
    created_at: fc.constant(new Date().toISOString()),
  });

// ---------------------------------------------------------------------------
// Helper: build an authorised QA manager server client stub.
// Constructs fresh vi.fn() instances so tests are isolated from each other.
// ---------------------------------------------------------------------------

function buildQAManagerServerClient(userId: string, orgId: string): SupabaseClient {
  const client = mockSupabaseServerClient({ user: { id: userId, email: "qa@example.com" } });

  const profileBuilder = mockQueryBuilder({ data: { org_id: orgId }, error: null });
  const roleBuilder = mockQueryBuilder({ data: { role: "qa_manager" }, error: null });

  (client.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "users") return profileBuilder;
    if (table === "user_roles") return roleBuilder;
    return mockQueryBuilder({ data: null, error: null });
  });

  return client;
}

// ---------------------------------------------------------------------------
// Property 8: Status transition is correct for both resolution types
// ---------------------------------------------------------------------------

describe("Property 8: Status transition is correct for both resolution types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "writes exactly { status: resolution } to ai_triage_queue and no other status values",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // The resolution being applied — only 'approved' or 'rejected' are valid.
          fc.constantFrom<"approved" | "rejected">("approved", "rejected"),
          // A full pending triage row to be returned by the fetch mock.
          fcPendingRow(),
          // The caller's org id (must match the triage row's evidence_logs.org_id).
          fcUuid(),
          async (resolution, pendingRow, orgId) => {
            // ---- Arrange: Auth -------------------------------------------
            const userId = "qa-manager-user-id";
            const serverClient = buildQAManagerServerClient(userId, orgId);
            vi.mocked(createClient).mockResolvedValue(serverClient);

            // ---- Arrange: triage row fetch (first adminClient.from call) ----
            // Return the pending row with the org_id injected into the join.
            const triageRowWithJoin = {
              ...pendingRow,
              evidence_logs: { org_id: orgId, req_id: pendingRow.original_req_id },
            };
            const fetchBuilder = mockQueryBuilder({
              data: triageRowWithJoin,
              error: null,
            });

            // ---- Arrange: update spy (second adminClient.from call) ----------
            // Capture the argument passed to .update() on ai_triage_queue.
            let capturedUpdateArg: unknown;
            const updateSpy = vi.fn().mockImplementation((arg: unknown) => {
              capturedUpdateArg = arg;
              return updateBuilder; // return chainable builder
            });

            // Build a chainable update builder that resolves successfully.
            const updateBuilder: Record<string, unknown> = {};
            const updateChainMethods = ["eq", "neq", "filter", "match", "is", "in", "not", "or"];
            for (const method of updateChainMethods) {
              updateBuilder[method] = vi.fn().mockReturnValue(updateBuilder);
            }
            updateBuilder["then"] = (
              resolve: (value: { data: null; error: null }) => void,
              reject: (reason: unknown) => void,
            ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);

            // The update builder returned on the second call to adminClient.from("ai_triage_queue")
            const updateBuilderWithSpy = { ...updateBuilder, update: updateSpy };

            // ---- Arrange: subsequent calls (evidence_logs update for approve,
            //               audit_logs insert) — return success so the action
            //               reaches success: true.
            const successBuilder = mockQueryBuilder({ data: null, error: null });

            // Track all adminClient.from calls to wire mocks correctly.
            let adminFromCallCount = 0;
            vi.mocked(adminClient.from).mockImplementation((table: string) => {
              adminFromCallCount++;
              if (adminFromCallCount === 1 && table === "ai_triage_queue") {
                // First call: the fetch of the pending triage row.
                return fetchBuilder as ReturnType<typeof adminClient.from>;
              }
              if (adminFromCallCount === 2 && table === "ai_triage_queue") {
                // Second call: the status update — return our spy builder.
                return updateBuilderWithSpy as ReturnType<typeof adminClient.from>;
              }
              // Subsequent calls (evidence_logs update for approve, audit_logs insert)
              // all succeed without side effects.
              return successBuilder as ReturnType<typeof adminClient.from>;
            });

            // ---- Act --------------------------------------------------------
            const result = await resolveTriageItem(pendingRow.id, resolution);

            // ---- Assert 1: success -------------------------------------------
            expect(result.success).toBe(true);

            // ---- Assert 2: update() was called exactly once -----------------
            expect(updateSpy).toHaveBeenCalledTimes(1);

            // ---- Assert 3: the captured update arg is exactly { status: resolution }
            expect(capturedUpdateArg).toEqual({ status: resolution });

            // ---- Assert 4: no other status values written --------------------
            // Verify that the only value written is the one passed in as resolution.
            const writtenStatus = (capturedUpdateArg as { status: string }).status;
            expect(writtenStatus).toBe(resolution);
            expect(writtenStatus === "approved" || writtenStatus === "rejected").toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
