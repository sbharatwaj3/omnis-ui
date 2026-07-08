// Feature: triage-inbox-resolution, Property 6: Reject is a no-op on evidence_logs
/**
 * Validates: Requirement 4.2
 *
 * For any pending triage item resolved with resolution = 'rejected', after
 * resolveTriageItem returns success: true, zero .update() calls are made on
 * the evidence_logs table. The developer's original req_id must remain
 * unchanged.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";

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
// Inline generator for a pending triage row — avoids the broken fcReqId
// generator (which uses fc.stringOf, removed in fast-check v4).
// We only need a few UUID fields and a string for req_id values here.
// ---------------------------------------------------------------------------
function fcInlinePendingTriageRow() {
  return fc.record({
    id: fcUuid(),
    evidence_log_id: fcUuid(),
    original_req_id: fc.string({ minLength: 4, maxLength: 32 }),
    suggested_req_id: fc.string({ minLength: 4, maxLength: 32 }),
    ai_reasoning: fc.oneof(fc.string({ minLength: 1, maxLength: 200 }), fc.constant(null)),
    status: fc.constant("pending" as const),
    created_at: fc.constant(new Date().toISOString()),
  });
}

// ---------------------------------------------------------------------------
// Helper: build a minimal SupabaseClient stub for an authorised QA manager.
// ---------------------------------------------------------------------------

function buildQAManagerServerClient(userId: string, orgId: string): SupabaseClient {
  const client = mockSupabaseServerClient({ user: { id: userId } });

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
// Property 6: Reject is a no-op on evidence_logs
// ---------------------------------------------------------------------------

describe("Property 6: Reject is a no-op on evidence_logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "never calls .update() on evidence_logs for any rejected pending triage item",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a pending triage row with arbitrary field values.
          fcInlinePendingTriageRow(),
          // Caller's org ID (matches the triage row's org).
          fcUuid(),
          async (triageRow, orgId) => {
            vi.clearAllMocks();

            const userId = "qa-manager-" + orgId.slice(0, 8);

            // ---- Auth -------------------------------------------------------
            const serverClient = buildQAManagerServerClient(userId, orgId);
            vi.mocked(createClient).mockResolvedValue(serverClient);

            // ---- Spy on evidence_logs update --------------------------------
            // This spy must NEVER be called on the reject path.
            const evidenceLogsUpdateSpy = vi.fn();

            // ---- Wire adminClient.from mock sequence for reject path --------
            // Call 1: ai_triage_queue select (fetch pending row)
            // Call 2: ai_triage_queue update (status → 'rejected')
            // Call 3: audit_logs insert
            // (NO evidence_logs update)

            const fetchRow = {
              id: triageRow.id,
              evidence_log_id: triageRow.evidence_log_id,
              suggested_req_id: triageRow.suggested_req_id,
              status: "pending" as const,
              evidence_logs: { org_id: orgId, req_id: triageRow.original_req_id },
            };

            const fetchBuilder = mockQueryBuilder({ data: fetchRow, error: null });
            const statusUpdateBuilder = mockQueryBuilder({ data: null, error: null });
            const auditInsertBuilder = mockQueryBuilder({ data: null, error: null });

            let adminFromCallIndex = 0;
            vi.mocked(adminClient.from).mockImplementation((table: string) => {
              adminFromCallIndex++;

              if (table === "evidence_logs") {
                // Any call to evidence_logs must not issue an .update().
                // Return a builder where update is the spy so we can detect it.
                const evidenceLogsBuilder = {
                  ...mockQueryBuilder({ data: null, error: null }),
                  update: evidenceLogsUpdateSpy,
                };
                return evidenceLogsBuilder as ReturnType<typeof adminClient.from>;
              }

              if (adminFromCallIndex === 1 && table === "ai_triage_queue") {
                // First call: fetch the triage row.
                return fetchBuilder as ReturnType<typeof adminClient.from>;
              }

              if (adminFromCallIndex === 2 && table === "ai_triage_queue") {
                // Second call: status update to 'rejected'.
                return statusUpdateBuilder as ReturnType<typeof adminClient.from>;
              }

              if (table === "audit_logs") {
                // Audit log insert — must succeed for success: true.
                return auditInsertBuilder as ReturnType<typeof adminClient.from>;
              }

              // Fallback for any unexpected table.
              return mockQueryBuilder({ data: null, error: null }) as ReturnType<
                typeof adminClient.from
              >;
            });

            // ---- Act --------------------------------------------------------
            const result = await resolveTriageItem(triageRow.id, "rejected");

            // ---- Assert 1: must return success --------------------------------
            expect(result.success).toBe(true);

            // ---- Assert 2: .update() was NEVER called on evidence_logs -------
            expect(evidenceLogsUpdateSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
