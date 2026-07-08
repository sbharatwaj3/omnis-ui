// Feature: triage-inbox-resolution, Property 7: Write ownership check prevents cross-org mutations
/**
 * Validates: Requirements 3.3, 3.4
 *
 * For any triage item belonging to org A, calling resolveTriageItem with the
 * credentials of a user from org B must:
 *   1. Return { success: false } with an error containing "not found" or "permission"
 *   2. Issue zero .update() calls against ai_triage_queue, evidence_logs, or audit_logs
 *
 * The cross-org check is enforced by the Supabase query predicate
 * `.eq("evidence_logs.org_id", orgId)`. When the caller's orgId doesn't match
 * the triage row's evidence_logs.org_id, Supabase returns null — simulated here
 * by mocking the fetch to return { data: null, error: null }.
 */

import fc from "fast-check";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Module mocks must be declared before imports that use them ---
// We use explicit factory functions to guarantee the mock modules are used
// regardless of how vitest resolves the `@` path alias.
vi.mock("@/utils/supabase/admin", async () => {
  const { adminClient, getAdminClient, mockQueryBuilder } = await import(
    "../../../__mocks__/supabase-admin"
  );
  return { adminClient, getAdminClient, mockQueryBuilder };
});
vi.mock("@/utils/supabase/server", async () => {
  const { createClient, mockSupabaseServerClient } = await import(
    "../../../__mocks__/supabase-server"
  );
  return { createClient, mockSupabaseServerClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { mockSupabaseServerClient } from "../../../__mocks__/supabase-server";
import { mockQueryBuilder } from "../../../__mocks__/supabase-admin";
import { fcCrossOrgPair, fcResolution } from "../test-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Supabase server-client stub that satisfies
 * resolveCallerContext: auth.getUser → users.select → user_roles.select.
 * The caller is a QA manager belonging to `callerOrgId`.
 */
function buildAuthorizedServerClient(callerOrgId: string) {
  const userId = "user-from-org-b-" + callerOrgId.slice(0, 8);

  return mockSupabaseServerClient({
    user: { id: userId, email: "qa@orgb.test" },
  });
}

/**
 * Configures the mocked adminClient.from to:
 *   - First call (triage row fetch): return { data: null, error: null }
 *     — simulates the org_id predicate filtering out the row.
 *
 * Any subsequent .from() calls (update, insert) should NOT be reached;
 * we track them to assert zero mutations.
 */
function setupAdminMock() {
  const mockAdminFrom = vi.mocked(adminClient.from);
  mockAdminFrom.mockReset();

  // The fetch returns null because the caller's org_id doesn't match
  mockAdminFrom.mockReturnValueOnce(
    mockQueryBuilder({ data: null, error: null }) as ReturnType<typeof adminClient.from>,
  );

  // Any further call would be a mutation — we want to detect these
  // by using a spy that records calls. We return a builder that resolves
  // successfully so the action doesn't throw unexpectedly.
  mockAdminFrom.mockReturnValue(
    mockQueryBuilder({ data: null, error: null }) as ReturnType<typeof adminClient.from>,
  );

  return mockAdminFrom;
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("Property 7: Write ownership check prevents cross-org mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "returns failure and issues zero mutations when caller org does not match item org",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fcCrossOrgPair(),
          fcResolution(),
          async ({ callerOrgId, itemOrgId: _itemOrgId }, resolution) => {
            // --- Arrange ---

            // 1. Mock the server client so resolveCallerContext returns
            //    an authorized QA manager from callerOrgId.
            const serverClient = buildAuthorizedServerClient(callerOrgId);

            // Wire auth.getUser to return our QA user
            const userId = "user-from-org-b-" + callerOrgId.slice(0, 8);
            vi.mocked(serverClient.auth.getUser).mockResolvedValue({
              data: { user: { id: userId, email: "qa@orgb.test" } },
              error: null,
            } as Awaited<ReturnType<typeof serverClient.auth.getUser>>);

            // Wire users table query → returns callerOrgId
            const usersBuilder = mockQueryBuilder({
              data: { org_id: callerOrgId },
              error: null,
            });
            // Wire user_roles table query → returns qa_manager role
            const rolesBuilder = mockQueryBuilder({
              data: { role: "qa_manager" },
              error: null,
            });

            let fromCallCount = 0;
            vi.mocked(serverClient.from).mockImplementation(() => {
              fromCallCount++;
              if (fromCallCount === 1) return usersBuilder as ReturnType<typeof serverClient.from>;
              return rolesBuilder as ReturnType<typeof serverClient.from>;
            });

            vi.mocked(createClient).mockResolvedValue(serverClient);

            // 2. Mock adminClient.from so the triage row fetch returns null
            //    (simulating org_id mismatch — Supabase returns no row when
            //    .eq("evidence_logs.org_id", orgId) doesn't match).
            const mockAdminFrom = setupAdminMock();

            // --- Act ---
            const result = await resolveTriageItem("any-triage-id", resolution);

            // --- Assert: failure result ---
            expect(result.success).toBe(false);

            const errorMsg = (result.error ?? "").toLowerCase();
            const containsExpectedText =
              errorMsg.includes("not found") || errorMsg.includes("permission");
            expect(containsExpectedText).toBe(true);

            // --- Assert: zero mutations ---
            // The adminClient.from should only have been called ONCE for the
            // initial fetch. After that returns null, resolveTriageItem must
            // return immediately without issuing any UPDATE or INSERT calls.
            const allFromCalls = mockAdminFrom.mock.calls;

            // Gather all builder calls for tables that must NOT be mutated
            // by iterating over every from() invocation after the first.
            // (The first call is the permitted "fetch" attempt.)
            for (let i = 1; i < allFromCalls.length; i++) {
              const tableName = allFromCalls[i][0] as string;
              const isMutableTable =
                tableName === "ai_triage_queue" ||
                tableName === "evidence_logs" ||
                tableName === "audit_logs";

              // Any from() call after the failed fetch on a mutable table
              // constitutes an unauthorized cross-org mutation.
              expect(isMutableTable).toBe(false);
            }

            // Additionally, verify the update() mock was never invoked on
            // the builder returned by the first (fetch) call — the builder
            // chain should stop at the fetch, not proceed to update.
            const fetchBuilder = mockQueryBuilder({ data: null, error: null });
            // The key assertion: adminClient.from was called at most once
            // (only the fetch). If it was called more times, the loop above
            // would have already caught mutable-table violations.
            // We assert the total call count as a belt-and-suspenders check.
            expect(mockAdminFrom.mock.calls.length).toBe(1);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
