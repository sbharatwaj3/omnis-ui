// Feature: triage-inbox-resolution, Property 10: Audit log insert failure prevents resolution commit
/**
 * Validates: Requirement 7.7
 *
 * For any resolution where the `audit_logs` INSERT fails, `resolveTriageItem`
 * must return `success: false` with an error message containing "administrator".
 * A CRITICAL server console error must be emitted containing the triage item ID.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
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
// Helper: build a minimal server-client stub for an authorised QA manager.
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
// Property 10: Audit log insert failure prevents resolution commit
// ---------------------------------------------------------------------------

describe("Property 10: Audit log insert failure prevents resolution commit", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it(
    "returns success: false and emits a CRITICAL console error when audit_logs INSERT fails",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // The resolution being applied — both paths must be covered.
          fc.constantFrom<"approved" | "rejected">("approved", "rejected"),
          // Triage item ID — arbitrary 4–32 char string per task spec.
          fc.string({ minLength: 4, maxLength: 32 }),
          // Arbitrary UUIDs for caller and data entities.
          fcUuid(), // userId
          fcUuid(), // orgId
          fcUuid(), // evidenceLogId
          fc.string({ minLength: 4, maxLength: 32 }), // suggested_req_id
          fc.string({ minLength: 4, maxLength: 32 }), // original_req_id (current on evidence log)
          async (resolution, triageId, userId, orgId, evidenceLogId, suggestedReqId, currentReqId) => {
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

            // ---- Arrange: audit_logs INSERT error builder -------------------
            const auditFailureBuilder = mockQueryBuilder({
              data: null,
              error: { message: "DB write failed", code: "23505", details: "", hint: "" },
            });

            // ---- Arrange: adminClient.from call wiring ----------------------
            // The approve path makes 4 calls:
            //   1. ai_triage_queue SELECT (fetch triage row)
            //   2. ai_triage_queue UPDATE (set status = resolution)
            //   3. evidence_logs  UPDATE (patch req_id) — approve path only
            //   4. audit_logs     INSERT → FAIL
            //
            // The reject path makes 3 calls:
            //   1. ai_triage_queue SELECT (fetch triage row)
            //   2. ai_triage_queue UPDATE (set status = resolution)
            //   3. audit_logs     INSERT → FAIL

            const fetchBuilder = mockQueryBuilder({ data: pendingTriageRow, error: null });
            const statusUpdateBuilder = mockQueryBuilder({ data: null, error: null });
            const evidenceLogsUpdateBuilder = mockQueryBuilder({ data: null, error: null });

            let adminFromCallCount = 0;
            vi.mocked(adminClient.from).mockImplementation((table: string) => {
              adminFromCallCount++;

              // Call 1: fetch triage row
              if (adminFromCallCount === 1 && table === "ai_triage_queue") {
                return fetchBuilder as ReturnType<typeof adminClient.from>;
              }

              // Call 2: status update
              if (adminFromCallCount === 2 && table === "ai_triage_queue") {
                return statusUpdateBuilder as ReturnType<typeof adminClient.from>;
              }

              // Call 3 (approve): evidence_logs update → success
              if (adminFromCallCount === 3 && table === "evidence_logs" && resolution === "approved") {
                return evidenceLogsUpdateBuilder as ReturnType<typeof adminClient.from>;
              }

              // Call 3 (reject) or Call 4 (approve): audit_logs INSERT → error
              if (table === "audit_logs") {
                return auditFailureBuilder as ReturnType<typeof adminClient.from>;
              }

              // Fallback — should not be reached in a correct execution path
              return mockQueryBuilder({ data: null, error: null }) as ReturnType<
                typeof adminClient.from
              >;
            });

            // ---- Act --------------------------------------------------------
            const result = await resolveTriageItem(triageId, resolution);

            // ---- Assert 1: action must return success: false ----------------
            expect(result.success).toBe(false);

            // ---- Assert 2: error message must mention "administrator" -------
            expect(result.error).toBeDefined();
            expect(result.error).toContain("administrator");

            // ---- Assert 3: CRITICAL console error must have been emitted ----
            // actions.ts logs: console.error("[AUDIT TRAIL] CRITICAL: ...", { triage_id: id, ... })
            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining("CRITICAL"),
              expect.objectContaining({ triage_id: triageId }),
            );
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
