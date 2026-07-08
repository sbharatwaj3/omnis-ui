// Feature: triage-inbox-resolution, Property 9: Every resolution produces exactly one correctly structured audit log entry
/**
 * Validates: Requirements 3.9, 4.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 *
 * For any successful resolution (approve or reject), resolveTriageItem must
 * insert exactly one row into audit_logs with:
 *   - action_type = 'TRIAGE_RESOLVE'
 *   - entity_type = 'EVIDENCE_LOG'
 *   - entity_id = evidence_log_id
 *   - user_id = the caller's auth.uid()
 *   - org_id = the caller's org_id
 *   - changes.before = { triage_id, status: "pending", original_req_id }
 *     (from evidence_logs.req_id at call time)
 *   - changes.after = { resolution, resolved_by, req_id_updated_to: suggested_req_id }
 *     for approve, and { resolution, resolved_by, req_id_updated_to: null } for reject
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
// Helper: build an authorised QA manager server client stub.
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
// Property 9: Every resolution produces exactly one correctly structured audit log entry
// ---------------------------------------------------------------------------

describe("Property 9: Every resolution produces exactly one correctly structured audit log entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "inserts exactly one audit_logs row with the correct structure for any resolution",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Resolution: either 'approved' or 'rejected'
          fc.constantFrom<"approved" | "rejected">("approved", "rejected"),
          // Known IDs so we can assert exact values in the audit payload
          fcUuid(), // triageId
          fcUuid(), // orgId
          fcUuid(), // evidenceLogId
          // Use fc.string instead of fcReqId (fcReqId uses the broken fc.stringOf)
          fc.string({ minLength: 4, maxLength: 32 }), // suggestedReqId
          fc.string({ minLength: 4, maxLength: 32 }), // currentReqId (evidence_logs.req_id at call time)
          async (resolution, triageId, orgId, evidenceLogId, suggestedReqId, currentReqId) => {
            vi.clearAllMocks();

            // userId must be a real string from the auth mock so it appears in resolved_by
            const userId = "qa-manager-" + triageId.slice(0, 8);

            // ---- Arrange: auth (QA manager) ---------------------------------
            const serverClient = buildQAManagerServerClient(userId, orgId);
            vi.mocked(createClient).mockResolvedValue(serverClient);

            // ---- Arrange: triage row returned by the fetch ------------------
            const pendingTriageRow = {
              id: triageId,
              evidence_log_id: evidenceLogId,
              suggested_req_id: suggestedReqId,
              status: "pending" as const,
              evidence_logs: { org_id: orgId, req_id: currentReqId },
            };

            // ---- Arrange: capture audit_logs.insert argument ----------------
            let capturedInsertArg: unknown = undefined;
            let auditInsertCallCount = 0;

            // Build a chainable audit insert builder that captures the payload.
            const auditInsertBuilder: Record<string, unknown> = {};
            const chainMethods = ["eq", "neq", "filter", "match", "is", "in", "not", "or",
              "select", "update", "upsert", "delete", "order", "limit", "range"];
            for (const method of chainMethods) {
              auditInsertBuilder[method] = vi.fn().mockReturnValue(auditInsertBuilder);
            }
            auditInsertBuilder["single"] = vi.fn().mockResolvedValue({ data: null, error: null });
            auditInsertBuilder["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
            auditInsertBuilder["then"] = (
              resolve: (value: { data: null; error: null }) => void,
              reject: (reason: unknown) => void,
            ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);

            // The insert spy captures the argument and returns the chainable builder
            const auditInsertSpy = vi.fn((arg: unknown) => {
              capturedInsertArg = arg;
              auditInsertCallCount++;
              return auditInsertBuilder;
            });
            auditInsertBuilder["insert"] = auditInsertSpy;

            // ---- Arrange: wire adminClient.from call sequence ---------------
            // Approve path:
            //   Call 1: ai_triage_queue select → pending row
            //   Call 2: ai_triage_queue update → success
            //   Call 3: evidence_logs update → success
            //   Call 4: audit_logs insert → capture arg, return success
            //
            // Reject path:
            //   Call 1: ai_triage_queue select → pending row
            //   Call 2: ai_triage_queue update → success
            //   Call 3: audit_logs insert → capture arg, return success

            const fetchBuilder = mockQueryBuilder({ data: pendingTriageRow, error: null });
            const statusUpdateBuilder = mockQueryBuilder({ data: null, error: null });
            const evidenceLogsUpdateBuilder = mockQueryBuilder({ data: null, error: null });

            let adminFromCallIndex = 0;
            vi.mocked(adminClient.from).mockImplementation((table: string) => {
              adminFromCallIndex++;

              if (adminFromCallIndex === 1 && table === "ai_triage_queue") {
                // Call 1: fetch the pending triage row
                return fetchBuilder as ReturnType<typeof adminClient.from>;
              }
              if (adminFromCallIndex === 2 && table === "ai_triage_queue") {
                // Call 2: status update
                return statusUpdateBuilder as ReturnType<typeof adminClient.from>;
              }
              if (table === "evidence_logs") {
                // Call 3 (approve only): evidence_logs req_id patch
                return evidenceLogsUpdateBuilder as ReturnType<typeof adminClient.from>;
              }
              if (table === "audit_logs") {
                // Final call: audit_logs insert — return the spy builder
                return auditInsertBuilder as ReturnType<typeof adminClient.from>;
              }

              // Fallback (should not be reached in a correct path)
              return mockQueryBuilder({ data: null, error: null }) as ReturnType<
                typeof adminClient.from
              >;
            });

            // ---- Act --------------------------------------------------------
            const result = await resolveTriageItem(triageId, resolution);

            // ---- Assert 1: action must succeed ------------------------------
            expect(result.success).toBe(true);

            // ---- Assert 2: audit_logs.insert called exactly once ------------
            expect(auditInsertSpy).toHaveBeenCalledTimes(1);

            // ---- Assert 3: captured insert payload has the correct structure -
            expect(capturedInsertArg).toMatchObject({
              user_id: userId,
              org_id: orgId,
              action_type: "TRIAGE_RESOLVE",
              entity_type: "EVIDENCE_LOG",
              entity_id: evidenceLogId,
              changes: {
                before: {
                  triage_id: triageId,
                  status: "pending",
                  original_req_id: currentReqId,
                },
                after: {
                  resolution,
                  resolved_by: userId,
                  req_id_updated_to: resolution === "approved" ? suggestedReqId : null,
                },
              },
            });
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
