// omnis-ui/utils/supabase/__tests__/waitForUserProfile.test.ts
//
// Unit tests for the `waitForUserProfile` bounded-poll helper.
// All 9 required tests:
//   1. Returns row when found on attempt 1 — no delayFn calls fired
//   2. Returns row when found on attempt 2 — delayFn called once with 100
//   3. Returns row when found on attempt 3 — delayFn called with 100 then 200
//   4. Returns row when found on attempt 4 — delayFn called with 100, 200, 400
//   5. Returns row when found on attempt 5 — delayFn called with 100, 200, 400, 800
//   6. Returns null when all 5 attempts return no row — delayFn called exactly 4 times
//   7. Query error on attempt N is non-fatal; polling continues; row found on next attempt
//   8. Returns { org_id: null } when stub row exists with org_id = null
//   9. Returns null (not { org_id: null }) when all queries return { data: null, error: null }

import { describe, it, expect, vi } from "vitest";
import {
  waitForUserProfile,
  MAX_POLL_ATTEMPTS,
  POLL_BASE_DELAY_MS,
} from "@/utils/supabase/waitForUserProfile";

// ---------------------------------------------------------------------------
// Helper: build a mock Supabase client that replays `responses` in sequence.
// Each call to .maybeSingle() consumes the next entry in the array.
// ---------------------------------------------------------------------------
function makeSupabaseMock(
  responses: Array<{
    data: { org_id: string | null } | null;
    error: { message: string } | null;
  }>
) {
  let idx = 0;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn(
            async () => responses[idx++] ?? { data: null, error: null }
          ),
        }),
      }),
    }),
  };
}

const USER_ID = "test-user-id-00000000";
const ORG_ID = "org-id-aaaabbbb-1234";

// Shorthand response factories
const absent = () => ({ data: null, error: null });
const present = (orgId: string | null = ORG_ID) => ({
  data: { org_id: orgId },
  error: null,
});
const queryError = (msg = "DB error") => ({
  data: null,
  error: { message: msg },
});

describe("waitForUserProfile", () => {
  // -------------------------------------------------------------------------
  // Test 1: row found on attempt 1 — no delays fired
  // -------------------------------------------------------------------------
  it("returns row when found on attempt 1 — no delayFn calls fired", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const supabase = makeSupabaseMock([present()]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    expect(result).toEqual({ org_id: ORG_ID });
    expect(delayFn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: row found on attempt 2 — delayFn called once with 100
  // -------------------------------------------------------------------------
  it("returns row when found on attempt 2 — delayFn called once with 100", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const supabase = makeSupabaseMock([absent(), present()]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    expect(result).toEqual({ org_id: ORG_ID });
    expect(delayFn).toHaveBeenCalledTimes(1);
    expect(delayFn).toHaveBeenCalledWith(POLL_BASE_DELAY_MS); // 100
  });

  // -------------------------------------------------------------------------
  // Test 3: row found on attempt 3 — delayFn called with 100 then 200
  // -------------------------------------------------------------------------
  it("returns row when found on attempt 3 — delayFn called with 100 then 200", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const supabase = makeSupabaseMock([absent(), absent(), present()]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    expect(result).toEqual({ org_id: ORG_ID });
    expect(delayFn).toHaveBeenCalledTimes(2);
    expect(delayFn).toHaveBeenNthCalledWith(1, 100); // POLL_BASE_DELAY_MS * 2^0
    expect(delayFn).toHaveBeenNthCalledWith(2, 200); // POLL_BASE_DELAY_MS * 2^1
  });

  // -------------------------------------------------------------------------
  // Test 4: row found on attempt 4 — delayFn called with 100, 200, 400
  // -------------------------------------------------------------------------
  it("returns row when found on attempt 4 — delayFn called with 100, 200, 400", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const supabase = makeSupabaseMock([
      absent(),
      absent(),
      absent(),
      present(),
    ]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    expect(result).toEqual({ org_id: ORG_ID });
    expect(delayFn).toHaveBeenCalledTimes(3);
    expect(delayFn).toHaveBeenNthCalledWith(1, 100); // 2^0 * 100
    expect(delayFn).toHaveBeenNthCalledWith(2, 200); // 2^1 * 100
    expect(delayFn).toHaveBeenNthCalledWith(3, 400); // 2^2 * 100
  });

  // -------------------------------------------------------------------------
  // Test 5: row found on attempt 5 — delayFn called with 100, 200, 400, 800
  // -------------------------------------------------------------------------
  it("returns row when found on attempt 5 — delayFn called with 100, 200, 400, 800", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const supabase = makeSupabaseMock([
      absent(),
      absent(),
      absent(),
      absent(),
      present(),
    ]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    expect(result).toEqual({ org_id: ORG_ID });
    expect(delayFn).toHaveBeenCalledTimes(4);
    expect(delayFn).toHaveBeenNthCalledWith(1, 100); // 2^0 * 100
    expect(delayFn).toHaveBeenNthCalledWith(2, 200); // 2^1 * 100
    expect(delayFn).toHaveBeenNthCalledWith(3, 400); // 2^2 * 100
    expect(delayFn).toHaveBeenNthCalledWith(4, 800); // 2^3 * 100
  });

  // -------------------------------------------------------------------------
  // Test 6: all 5 attempts absent → returns null, delayFn called exactly 4 times
  // -------------------------------------------------------------------------
  it("returns null when all 5 attempts return no row — delayFn called exactly 4 times", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const supabase = makeSupabaseMock([
      absent(),
      absent(),
      absent(),
      absent(),
      absent(),
    ]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    expect(result).toBeNull();
    expect(delayFn).toHaveBeenCalledTimes(MAX_POLL_ATTEMPTS - 1); // 4
    expect(delayFn).toHaveBeenNthCalledWith(1, 100);
    expect(delayFn).toHaveBeenNthCalledWith(2, 200);
    expect(delayFn).toHaveBeenNthCalledWith(3, 400);
    expect(delayFn).toHaveBeenNthCalledWith(4, 800);
  });

  // -------------------------------------------------------------------------
  // Test 7: query error on attempt N is non-fatal; polling continues;
  //         row found on subsequent attempt is returned
  // -------------------------------------------------------------------------
  it("treats a query error on attempt N as absent (non-fatal); polling continues; row found on next attempt is returned", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    // attempt 1: error, attempt 2: error, attempt 3: row found
    const supabase = makeSupabaseMock([
      queryError("connection timeout"),
      queryError("read error"),
      present(),
    ]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    expect(result).toEqual({ org_id: ORG_ID });
    // 2 delays fired (before attempts 2 and 3)
    expect(delayFn).toHaveBeenCalledTimes(2);
    expect(delayFn).toHaveBeenNthCalledWith(1, 100);
    expect(delayFn).toHaveBeenNthCalledWith(2, 200);
  });

  // -------------------------------------------------------------------------
  // Test 8: stub row exists with org_id = null → returns { org_id: null },
  //         not null — distinguishes "row present, org_id null" from "row absent"
  // -------------------------------------------------------------------------
  it("returns { org_id: null } (not null) when stub row exists with org_id = null", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    // Row is present but org_id is null (new-user stub row)
    const supabase = makeSupabaseMock([present(null)]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    // Must be an object — NOT null
    expect(result).not.toBeNull();
    expect(result).toEqual({ org_id: null });
    expect(delayFn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 9: all queries return { data: null, error: null } → returns null,
  //         not { org_id: null } — confirms row-absent semantics
  // -------------------------------------------------------------------------
  it("returns null (not { org_id: null }) when all queries return { data: null, error: null }", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const supabase = makeSupabaseMock([
      absent(),
      absent(),
      absent(),
      absent(),
      absent(),
    ]);

    const result = await waitForUserProfile(supabase, USER_ID, delayFn);

    // Must be null — NOT { org_id: null }
    expect(result).toBeNull();
    expect(result).not.toEqual({ org_id: null });
  });
});
