// Feature: triage-inbox-resolution, Property 16: Role gate always blocks non-authorized roles
/**
 * Validates: Requirements 4.7, 6.1, 6.2
 *
 * For any invocation of resolveTriageItem by a caller whose session-derived
 * role is 'developer', 'viewer', or null (no role assignment), the Server
 * Action must return success: false with a Forbidden error and must not
 * execute any database write.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";

// Mock both supabase clients so no live DB calls are made.
// The vitest.config.ts alias routes @/utils/supabase/admin → __mocks__/supabase-admin.ts,
// but we also call vi.mock() with an explicit factory so Vitest hoists the stub
// module correctly before the action module is imported.
vi.mock("@/utils/supabase/server", async () => {
  const mock = await import("../../../__mocks__/supabase-server");
  return mock;
});
vi.mock("@/utils/supabase/admin", async () => {
  const mock = await import("../../../__mocks__/supabase-admin");
  return mock;
});

import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { mockSupabaseServerClient } from "../../../__mocks__/supabase-server";
import { mockQueryBuilder } from "../../../__mocks__/supabase-admin";
import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import { fcUuid } from "../test-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the supabase server client mock so that resolveCallerContext returns
 * a caller with the given role (or no role when role === null).
 *
 * resolveCallerContext makes three chained queries:
 *   1. auth.getUser()                           → returns a valid user
 *   2. from("users").select("org_id")...single() → returns a profile with org_id
 *   3. from("user_roles").select("role")...single() → returns the role row (or error for null)
 */
function mockServerClientForRole(
  userId: string,
  orgId: string,
  role: "developer" | "viewer" | null,
) {
  const client = mockSupabaseServerClient({ user: { id: userId } });

  // Patch the `from` method to return different query builders depending on
  // which table is being queried.
  const profileBuilder = mockQueryBuilder({ data: { org_id: orgId }, error: null });

  let roleBuilder: ReturnType<typeof mockQueryBuilder>;
  if (role === null) {
    // Simulate no role assignment — the query returns an error, which causes
    // resolveCallerContext to return { role: null, error: "No role assignment..." }.
    roleBuilder = mockQueryBuilder({
      data: null,
      error: { message: "No rows", code: "PGRST116", details: "", hint: "" },
    });
  } else {
    roleBuilder = mockQueryBuilder({ data: { role }, error: null });
  }

  (client.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "users") return profileBuilder;
    if (table === "user_roles") return roleBuilder;
    // Default — should not be reached for the role-gate path.
    return mockQueryBuilder({ data: null, error: null });
  });

  vi.mocked(createClient).mockResolvedValue(client);
}

// ---------------------------------------------------------------------------
// Property 16: Role gate always blocks non-authorized roles
// ---------------------------------------------------------------------------

describe("Property 16: Role gate always blocks non-authorized roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset adminClient.from to a safe default so we can track calls.
    const defaultBuilder = mockQueryBuilder({ data: null, error: null });
    vi.mocked(adminClient.from).mockReturnValue(defaultBuilder as ReturnType<typeof adminClient.from>);
  });

  it(
    "resolveTriageItem returns success:false for every non-authorized role and makes no DB writes",
    () => {
      fc.assert(
        fc.asyncProperty(
          // Generate an unauthorized role value.
          fc.constantFrom<"developer" | "viewer" | null>("developer", "viewer", null),
          // Generate arbitrary item ID and resolution so we cover the full input space.
          fcUuid(),
          fc.constantFrom<"approved" | "rejected">("approved", "rejected"),
          async (role, itemId, resolution) => {
            vi.clearAllMocks();

            const userId = "test-user-id";
            const orgId = "test-org-id";

            // Configure the server client to simulate the given unauthorized role.
            mockServerClientForRole(userId, orgId, role);

            // Reset and spy on adminClient.from to assert no writes occur.
            const updateSpy = vi.fn().mockReturnThis();
            const adminBuilder = {
              ...mockQueryBuilder({ data: null, error: null }),
              update: updateSpy,
            };
            vi.mocked(adminClient.from).mockReturnValue(
              adminBuilder as ReturnType<typeof adminClient.from>,
            );

            // Act.
            const result = await resolveTriageItem(itemId, resolution);

            // Assert 1: action must return success: false.
            expect(result.success).toBe(false);

            // Assert 2: no .update() call was made on any table — no DB writes.
            expect(updateSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
