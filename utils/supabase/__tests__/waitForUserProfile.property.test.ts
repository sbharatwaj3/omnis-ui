// Feature: oauth-callback-race-condition, Property 1: Bug Condition — Bounded Polling Terminates with Correct Row
//
// PURPOSE: Bug condition exploration test.
//
// This test encodes the EXPECTED (fixed) behavior of the `waitForUserProfile` helper:
//   - If the public.users row appears on attempt N (1 ≤ N ≤ MAX_POLL_ATTEMPTS), the helper
//     returns the row found on attempt N.
//   - If all MAX_POLL_ATTEMPTS attempts return no row, the helper returns null.
//
// EXPECTED OUTCOME ON UNFIXED CODE: FAIL
//   The module `@/utils/supabase/waitForUserProfile` does not exist yet.
//   The test will fail at import time with MODULE_NOT_FOUND / cannot find module.
//   This failure is intentional — it proves the bug exists:
//     - No retry helper exists
//     - The bare .single() call in route.ts makes exactly one attempt with no polling
//     - A row appearing on attempt 2+ is never seen; route immediately misdirects to /onboarding
//
// COUNTEREXAMPLE DOCUMENTED:
//   "Row appearing on attempt 2 (or any attempt > 1) is never seen —
//    the unfixed route already redirected to /onboarding on the single attempt 1 failure.
//    No retry loop exists. No loud failure redirect to /login?error=profile_unavailable exists."
//
// DO NOT attempt to fix this test or the implementation when it fails.
// This test will pass after Task 3 implements waitForUserProfile correctly.

import * as fc from 'fast-check';
import { waitForUserProfile, MAX_POLL_ATTEMPTS } from '@/utils/supabase/waitForUserProfile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Supabase client mock whose .from("users")...maybeSingle()
 * returns the responses in `callResponses` in order (one per poll attempt).
 */
function makeSupabaseMock(callResponses: Array<{ data: { org_id: string | null } | null; error: null }>) {
  let callIndex = 0;
  const maybeSingleMock = vi.fn(async () => {
    const response = callResponses[callIndex] ?? { data: null, error: null };
    callIndex++;
    return response;
  });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
    }),
    _maybeSingleMock: maybeSingleMock,
  };
}

// ---------------------------------------------------------------------------
// Property 1 — Bug Condition: Bounded Polling Terminates with Correct Row
//
// For any appearOnAttempt in [1..MAX_POLL_ATTEMPTS] and any orgId (UUID or null),
// mock SELECT to return null for the first (appearOnAttempt - 1) calls and
// { org_id: orgId } on attempt appearOnAttempt.
// Assert waitForUserProfile returns { org_id: orgId }.
// Assert delayFn was called exactly (appearOnAttempt - 1) times.
//
// VALIDATES: Requirements 2.1, 2.2, 2.3
// ---------------------------------------------------------------------------

describe('waitForUserProfile – Property 1: Bounded Polling Terminates with Correct Row', () => {
  it('returns the row on the attempt it first appears (1 ≤ appearOnAttempt ≤ MAX_POLL_ATTEMPTS)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: MAX_POLL_ATTEMPTS }),
        fc.oneof(fc.uuid(), fc.constant(null)),
        async (appearOnAttempt, orgId) => {
          const delayFn = vi.fn().mockResolvedValue(undefined);

          // Build call responses: null for attempts 1..N-1, row on attempt N
          const callResponses: Array<{ data: { org_id: string | null } | null; error: null }> = [];
          for (let i = 1; i < appearOnAttempt; i++) {
            callResponses.push({ data: null, error: null });
          }
          callResponses.push({ data: { org_id: orgId }, error: null });

          const supabase = makeSupabaseMock(callResponses) as any;

          const result = await waitForUserProfile(supabase, 'test-user-id', delayFn);

          // Assert: row is returned correctly
          if (result === null) return false;
          if (result.org_id !== orgId) return false;

          // Assert: delayFn was called exactly (appearOnAttempt - 1) times
          if (delayFn.mock.calls.length !== appearOnAttempt - 1) return false;

          // Assert: exponential back-off intervals are correct
          for (let i = 0; i < delayFn.mock.calls.length; i++) {
            const expectedDelay = 100 * Math.pow(2, i); // 100, 200, 400, 800
            if (delayFn.mock.calls[i][0] !== expectedDelay) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns { org_id: null } (not null) when stub row exists with org_id = null', async () => {
    // Distinguishes "row present, org_id null" from "row absent"
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: MAX_POLL_ATTEMPTS }),
        async (appearOnAttempt) => {
          const delayFn = vi.fn().mockResolvedValue(undefined);

          const callResponses: Array<{ data: { org_id: string | null } | null; error: null }> = [];
          for (let i = 1; i < appearOnAttempt; i++) {
            callResponses.push({ data: null, error: null });
          }
          callResponses.push({ data: { org_id: null }, error: null });

          const supabase = makeSupabaseMock(callResponses) as any;

          const result = await waitForUserProfile(supabase, 'test-user-id', delayFn);

          // Must return the stub row object, not null
          if (result === null) return false;
          if (result.org_id !== null) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 — Exhausted Retries Always Produce Null
//
// For any userId, mock all MAX_POLL_ATTEMPTS SELECT calls to return no row.
// Assert waitForUserProfile returns null (not { org_id: null }).
// Assert delayFn was called exactly 4 times with delays [100, 200, 400, 800].
//
// VALIDATES: Requirements 2.4
// ---------------------------------------------------------------------------

describe('waitForUserProfile – Property 3: Exhausted Retries Always Produce Null', () => {
  it('returns null when all MAX_POLL_ATTEMPTS attempts return no row', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (userId) => {
          const delayFn = vi.fn().mockResolvedValue(undefined);

          // All attempts return no row (simulating pgBouncer lag for all attempts)
          const callResponses = Array.from(
            { length: MAX_POLL_ATTEMPTS },
            () => ({ data: null, error: null })
          );

          const supabase = makeSupabaseMock(callResponses) as any;

          const result = await waitForUserProfile(supabase, userId, delayFn);

          // Must return null, not { org_id: null }
          if (result !== null) return false;

          // Assert: delayFn called exactly 4 times (delays before attempts 2–5)
          if (delayFn.mock.calls.length !== MAX_POLL_ATTEMPTS - 1) return false;

          // Assert: delay values are exactly [100, 200, 400, 800]
          const expectedDelays = [100, 200, 400, 800];
          for (let i = 0; i < expectedDelays.length; i++) {
            if (delayFn.mock.calls[i][0] !== expectedDelays[i]) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
