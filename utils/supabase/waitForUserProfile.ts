// omnis-ui/utils/supabase/waitForUserProfile.ts
//
// Bounded-retry helper for polling the `public.users` stub row after OAuth
// callback. Resolves the pgBouncer connection-pool visibility lag where the
// `on_auth_user_created` trigger-written row may not yet be visible on the
// pooled connection that handles the callback request.
//
// SECURITY: `userId` MUST originate exclusively from `getUser()` JWT — never
// from URL parameters. The caller (`app/auth/callback/route.ts`) enforces this.
//
// IEC 62304 Fail-Loud: returns `null` (not a silent fallthrough) when all
// attempts are exhausted, allowing the caller to emit a structured error and
// redirect to `/login?error=profile_unavailable`.

export const MAX_POLL_ATTEMPTS = 5;
export const POLL_BASE_DELAY_MS = 100;

/**
 * Internal delay helper using real setTimeout.
 * Overridable in tests via the `delayFn` parameter on `waitForUserProfile`.
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `public.users` for a stub row matching `userId`, retrying up to
 * `MAX_POLL_ATTEMPTS` times with exponential back-off.
 *
 * Back-off schedule (4 delays for 5 attempts):
 *   Attempt 1: immediate
 *   Delay 100 ms → Attempt 2
 *   Delay 200 ms → Attempt 3
 *   Delay 400 ms → Attempt 4
 *   Delay 800 ms → Attempt 5
 *   Return null  (no delay after last attempt)
 *
 * Semantics:
 *   - Returns `{ org_id: string | null }` when a row is found (even if
 *     `org_id` is `null` — that is a valid stub-row state, not row absence).
 *   - Returns `null` when zero rows were returned across all attempts
 *     (i.e., the row is genuinely absent or still invisible on this connection).
 *   - Query errors are treated as non-fatal (row absent); a structured warning
 *     is logged and polling continues.
 *
 * @param supabase  SupabaseServerClient — SSR anon-key client with cookie store
 * @param userId    From `getUser()` JWT; NEVER from URL params
 * @param delayFn   Async delay function (injectable for deterministic tests)
 */
export async function waitForUserProfile(
  supabase: any, // SupabaseServerClient — typed as any for flexibility
  userId: string,
  delayFn: (ms: number) => Promise<void> = delay
): Promise<{ org_id: string | null } | null> {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    // Use .maybeSingle() — returns { data: null, error: null } for zero rows
    // instead of PGRST116 error from .single(). This cleanly distinguishes
    // "row absent" from "query error" and enables a clean retry loop.
    const result = await supabase
      .from("users")
      .select("org_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (result.error) {
      // Non-fatal query error — log a structured warning and treat as absent.
      console.warn(
        `[waitForUserProfile] attempt ${attempt}/${MAX_POLL_ATTEMPTS} query error:`,
        result.error.message
      );
      // Fall through to delay + retry logic below.
    } else if (result.data !== null) {
      // Row found — return immediately. `result.data.org_id` may be null (valid
      // stub-row state). The caller distinguishes null org_id from null result.
      return result.data as { org_id: string | null };
    }

    // Row absent (or error) on this attempt. Delay before the next attempt,
    // but do NOT delay after the last attempt.
    if (attempt < MAX_POLL_ATTEMPTS) {
      await delayFn(POLL_BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }

  // All attempts exhausted — no row found. Caller must handle loudly.
  return null;
}
