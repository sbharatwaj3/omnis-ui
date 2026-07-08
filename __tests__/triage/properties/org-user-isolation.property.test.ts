// Feature: triage-inbox-resolution, Property 1: Org and user isolation for reads
/**
 * Validates: Requirements 1.1, 1.5
 *
 * For any authenticated user, getPendingTriageItems must:
 *   - Pass .eq("evidence_logs.org_id", orgId) to the Supabase query (all roles)
 *   - For developer callers: additionally pass .eq("evidence_logs.user_id", userId)
 *   - For admin/qa_manager callers: NOT pass .eq("evidence_logs.user_id", ...)
 *
 * Because getPendingTriageItems uses adminClient with explicit .eq() predicates,
 * we verify correctness by capturing the .eq() call arguments — not by filtering
 * a mock dataset ourselves.
 */

import fc from "fast-check";
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Module mocks must be declared before imports that use them ---
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

import { getPendingTriageItems } from "@/app/dashboard/triage/actions";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { mockSupabaseServerClient } from "../../../__mocks__/supabase-server";
import { mockQueryBuilder } from "../../../__mocks__/supabase-admin";
import { fcUuid } from "../test-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a mocked server client where resolveCallerContext returns a user
 * with the specified orgId and role.
 */
function buildServerClientForCaller(params: {
  userId: string;
  orgId: string;
  role: string;
}) {
  const { userId, orgId, role } = params;

  const serverClient = mockSupabaseServerClient({ user: { id: userId } });

  const usersBuilder = mockQueryBuilder({ data: { org_id: orgId }, error: null });
  const rolesBuilder = mockQueryBuilder({ data: { role }, error: null });

  let fromCallCount = 0;
  vi.mocked(serverClient.from).mockImplementation(() => {
    fromCallCount++;
    if (fromCallCount === 1) return usersBuilder as ReturnType<typeof serverClient.from>;
    return rolesBuilder as ReturnType<typeof serverClient.from>;
  });

  vi.mocked(createClient).mockResolvedValue(serverClient);
}

/**
 * Builds an adminClient mock where `.eq()` is a spy that returns the same
 * builder (for chaining). Exposes the eqSpy so callers can inspect calls.
 *
 * All chain methods (select, order, limit, etc.) must return the same
 * spy-equipped builder so that .eq() calls anywhere in the chain are captured.
 */
function buildAdminMockWithEqSpy() {
  const eqSpy = vi.fn();

  // Build a base from mockQueryBuilder but then replace ALL chaining methods
  // so every step in the chain returns THIS same object (with the spy).
  const mockBuilder: Record<string, unknown> = {
    ...mockQueryBuilder({ data: [], error: null }),
    eq: eqSpy,
  };

  // Make all chaining methods return mockBuilder so the eq spy is always in scope.
  const chainMethods = [
    "select", "insert", "update", "upsert", "delete",
    "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is",
    "filter", "match", "not", "or", "order", "limit", "range",
    "abortSignal", "returns", "throwOnError",
  ];
  for (const method of chainMethods) {
    mockBuilder[method] = vi.fn().mockReturnValue(mockBuilder);
  }

  // eq spy returns the builder itself for chaining.
  eqSpy.mockReturnValue(mockBuilder);

  vi.mocked(adminClient.from).mockReturnValue(
    mockBuilder as ReturnType<typeof adminClient.from>,
  );

  return { eqSpy, mockBuilder };
}

// ---------------------------------------------------------------------------
// Property 1a: Admin / QA Manager path — org scoping only
// ---------------------------------------------------------------------------

describe("Property 1a: Admin/QA Manager — org-level .eq() predicate is passed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "passes .eq('evidence_logs.org_id', orgId) and does NOT pass .eq('evidence_logs.user_id', ...) for admin/qa_manager",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fcUuid(), // orgId
          fcUuid(), // userId
          fc.constantFrom("qa_manager", "admin"),
          async (orgId, userId, role) => {
            vi.clearAllMocks();

            // Arrange: mock session for admin/qa_manager with known orgId
            buildServerClientForCaller({ userId, orgId, role });

            // Arrange: mock adminClient with eq spy
            const { eqSpy } = buildAdminMockWithEqSpy();

            // Act
            await getPendingTriageItems();

            // Assert 1: .eq("evidence_logs.org_id", orgId) was called
            const eqCalls = eqSpy.mock.calls as [string, unknown][];
            const orgCheck = eqCalls.some(
              ([col, val]) => col === "evidence_logs.org_id" && val === orgId,
            );
            expect(orgCheck).toBe(true);

            // Assert 2: .eq("evidence_logs.user_id", ...) was NOT called
            const userIdCheck = eqCalls.some(([col]) => col === "evidence_logs.user_id");
            expect(userIdCheck).toBe(false);
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 1b: Developer path — org + user scoping
// ---------------------------------------------------------------------------

describe("Property 1b: Developer — both org and user .eq() predicates are passed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "passes both .eq('evidence_logs.org_id', orgId) and .eq('evidence_logs.user_id', userId) for developer",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fcUuid(), // orgId
          fcUuid(), // userId
          async (orgId, userId) => {
            vi.clearAllMocks();

            // Arrange: mock session for developer with known orgId and userId
            buildServerClientForCaller({ userId, orgId, role: "developer" });

            // Arrange: mock adminClient with eq spy
            const { eqSpy } = buildAdminMockWithEqSpy();

            // Act
            await getPendingTriageItems();

            // Assert 1: .eq("evidence_logs.org_id", orgId) was called
            const eqCalls = eqSpy.mock.calls as [string, unknown][];
            const orgCheck = eqCalls.some(
              ([col, val]) => col === "evidence_logs.org_id" && val === orgId,
            );
            expect(orgCheck).toBe(true);

            // Assert 2: .eq("evidence_logs.user_id", userId) was also called
            const userIdCheck = eqCalls.some(
              ([col, val]) => col === "evidence_logs.user_id" && val === userId,
            );
            expect(userIdCheck).toBe(true);
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});
