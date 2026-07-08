// Feature: triage-inbox-resolution, Property 3: Error messages never expose raw database error details
/**
 * Validates: Requirement 1.4
 *
 * For any Supabase error object (with arbitrary message, code, details, hint),
 * the error string returned by resolveTriageItem must NOT contain:
 *   - PostgreSQL error codes (5-digit numeric codes like 23505, 42P01)
 *   - The raw error.message value from the Supabase error
 *   - The raw error.code value from the Supabase error
 *
 * The triage row fetch failure path returns the Tier 1 user-safe string:
 * "Triage item not found or you do not have permission to resolve it."
 * This test verifies the sanitization pattern holds for any arbitrary error shape.
 */

import fc from "fast-check";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/supabase/admin", async () => {
  const mock = await import("../../../__mocks__/supabase-admin");
  return mock;
});
vi.mock("@/utils/supabase/server", async () => {
  const mock = await import("../../../__mocks__/supabase-server");
  return mock;
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { mockSupabaseServerClient } from "../../../__mocks__/supabase-server";
import { mockQueryBuilder } from "../../../__mocks__/supabase-admin";
import { fcSupabaseError, fcUuid } from "../test-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configures the server client mock so that resolveCallerContext resolves
 * to an authorized QA manager. This satisfies the auth/role checks so
 * resolveTriageItem proceeds to the triage row fetch — the point where the
 * mocked Supabase error is injected.
 */
function setupAuthorizedQaManager(userId: string, orgId: string) {
  const serverClient = mockSupabaseServerClient({ user: { id: userId } });

  const profileBuilder = mockQueryBuilder({ data: { org_id: orgId }, error: null });
  const rolesBuilder = mockQueryBuilder({ data: { role: "qa_manager" }, error: null });

  (serverClient.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === "users") return profileBuilder;
    if (table === "user_roles") return rolesBuilder;
    return mockQueryBuilder({ data: null, error: null });
  });

  vi.mocked(createClient).mockResolvedValue(serverClient);
}

// ---------------------------------------------------------------------------
// Property 3: Error messages never expose raw DB error details
// ---------------------------------------------------------------------------

describe("Property 3: Error messages never expose raw database error details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "error string returned by resolveTriageItem never contains raw Supabase error details",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fcSupabaseError(), // arbitrary Supabase error object (message, code, details, hint)
          fcUuid(),          // arbitrary triageId
          async (supabaseError, triageId) => {
            vi.clearAllMocks();

            const userId = "qa-user-id";
            const orgId = "qa-org-id";

            // Arrange: auth resolves to an authorized QA manager
            setupAuthorizedQaManager(userId, orgId);

            // Arrange: the first adminClient.from call (triage row fetch) returns
            // a Supabase-shaped error — this is the injection point for raw DB error data
            vi.mocked(adminClient.from).mockReturnValueOnce(
              mockQueryBuilder({
                data: null,
                error: supabaseError,
              }) as ReturnType<typeof adminClient.from>,
            );

            // Act: call the server action — it will hit the fetch error path
            const result = await resolveTriageItem(triageId, "approved");

            // Assert 1: the action must fail (not return a stale success)
            expect(result.success).toBe(false);

            const errorMsg = result.error ?? "";

            // Assert 2: the error string must NOT contain PostgreSQL 5-digit codes
            // (e.g. "23505", "42P01" are 5-digit alphanumeric PG codes)
            expect(errorMsg).not.toMatch(/\b\d{5}\b/);

            // Assert 3: the error string must NOT contain the raw error.message value.
            // We only check when the message is long enough to be a meaningful
            // leak (≥ 5 chars and not pure whitespace) — single-char fragments
            // like " " are coincidentally present in any English sentence and
            // cannot be considered a meaningful raw-error passthrough.
            const trimmedMessage = supabaseError.message.trim();
            if (trimmedMessage.length >= 5) {
              expect(errorMsg).not.toContain(supabaseError.message);
            }

            // Assert 4: the error string must NOT contain the raw error.code value.
            // Same guard: only check for codes of meaningful length (≥ 2 chars,
            // trimmed). Short or empty codes cannot constitute a meaningful leak.
            const trimmedCode = supabaseError.code.trim();
            if (trimmedCode.length >= 2) {
              expect(errorMsg).not.toContain(supabaseError.code);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
