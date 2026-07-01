# OAuth Callback Race Condition — Bugfix Design

## Overview

The OAuth callback route (`omnis-ui/app/auth/callback/route.ts`) makes a single, no-retry SELECT on `public.users` immediately after `exchangeCodeForSession()`. Under pgBouncer or connection-pool load, the `on_auth_user_created` trigger-written stub row may not yet be visible on the connection that handles the callback request. The route currently treats a missing row identically to a row with `org_id = NULL`, making an indeterminate routing decision with no wait and no error signal — a silent failure that violates IEC 62304 fail-loud requirements.

The fix introduces a bounded poll helper (`waitForUserProfile`) in a new utility module (`omnis-ui/utils/supabase/waitForUserProfile.ts`) that retries the `public.users` SELECT up to `MAX_POLL_ATTEMPTS = 5` times with exponential back-off starting at `POLL_BASE_DELAY_MS = 100 ms`. The callback route replaces its bare single-shot SELECT with a call to this helper. No database schema changes are required.

**Files changed:**
- `omnis-ui/app/auth/callback/route.ts` — call `waitForUserProfile` instead of bare SELECT
- `omnis-ui/utils/supabase/waitForUserProfile.ts` — new bounded-poll helper (new file)

## Glossary

- **Bug_Condition (C)**: The condition that triggers the defect — a `public.users` SELECT executed with no retry, where the trigger-written row has not yet propagated to the connection pool, causing the row to appear absent.
- **Property (P)**: The desired behavior when the bug condition holds — the route must poll until the row is present (or retries are exhausted) before making any routing decision.
- **Preservation**: Existing routing behavior for all non-buggy inputs (email-confirmation flows, error paths, immediately visible rows) that must remain byte-for-byte identical after the fix.
- **waitForUserProfile**: The new utility function in `omnis-ui/utils/supabase/waitForUserProfile.ts` that encapsulates the bounded-retry SELECT logic.
- **MAX_POLL_ATTEMPTS**: Exported constant `= 5` — the maximum number of SELECT attempts before the helper gives up and returns `null`.
- **POLL_BASE_DELAY_MS**: Exported constant `= 100` — the base delay in milliseconds; doubles each attempt (100 → 200 → 400 → 800 → 1600 ms, worst-case ~3.1 s total).
- **stub row**: The minimal `public.users` record written by the `on_auth_user_created` trigger immediately after `auth.users` INSERT, with `org_id = NULL` and `public_key = NULL`.
- **profile_unavailable**: The terminal failure state — all poll attempts exhausted with no row found; results in a loud redirect to `/login?error=profile_unavailable`.
- **isBugCondition(input)**: Pseudocode predicate; returns `true` when the route would query `public.users` and the row is absent due to replication lag (i.e., it is not an email-confirmation flow, code exchange succeeded, and `getUser()` succeeded).
- **SupabaseServerClient**: A `createServerClient` instance wired to the request's cookie store, as created inline in `route.ts` (same pattern as `utils/supabase/server.ts` but with the callback's own `cookieStore`).

---

## Bug Details

### Bug Condition

The bug manifests when `exchangeCodeForSession()` succeeds and `getUser()` returns a valid user (i.e., the OAuth flow reaches the `public.users` query), but the trigger-written stub row has not yet committed to the pgBouncer connection that serves this request. The `waitForUserProfile` function — which does not yet exist — is absent, so there is exactly one SELECT with no retry. A zero-row result causes the route to silently fall through to `/onboarding`, misrouting returning users and making an indeterminate decision for new users before their profile row exists.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input — a processed OAuth callback request where:
           exchangeCodeForSession() returned no error,
           getUser() returned a valid user with user.id,
           type parameter is NOT 'signup' or 'recovery'
  OUTPUT: boolean

  RETURN supabase.from("users")
               .select("org_id")
               .eq("user_id", user.id)
               .single()
         RETURNS zero rows (PostgrestError code PGRST116 or data is null)
         AND the row DOES exist in the database (trigger has fired)
         AND the absence IS due to connection-pool lag, NOT genuine non-existence
END FUNCTION
```

### Examples

- **Returning user under load**: A user with `org_id = 'abc-123'` signs in via Google OAuth. The callback fires on a pgBouncer connection that has not yet seen the trigger commit. Single SELECT returns null. Route redirects to `/onboarding`. User is misdirected. *(Bug manifests)*
- **New user under load**: A brand-new user completes OAuth. The trigger fires, writes the stub row (`org_id = NULL`). The callback SELECT on a different pooled connection returns null. Route redirects to `/onboarding` — the correct destination, but for the wrong reason (row absence treated as `org_id = NULL`). The onboarding flow subsequently attempts `INSERT INTO public.users` and hits `UNIQUE CONSTRAINT (user_id)` because the stub row already exists. *(Bug manifests — silent corruption risk)*
- **New user, no lag**: Same new user, but the trigger commit is immediately visible. Single SELECT returns `{ org_id: null }`. Route redirects to `/onboarding`. *(No bug — first-attempt success)*
- **Returning user, no lag**: User with `org_id` set, no lag. Single SELECT returns `{ org_id: 'abc-123' }`. Route redirects to `/dashboard`. *(No bug — first-attempt success, common case)*
- **All retries exhausted**: Severe database outage. All 5 poll attempts return null over ~3.1 s. Route redirects to `/login?error=profile_unavailable` with a structured error log. *(Bug condition — fail-loud path exercised correctly by fix)*

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `type === 'signup'` or `type === 'recovery'` callbacks MUST continue to redirect to `/auth/success` without ever calling `waitForUserProfile` or querying `public.users`.
- `exchangeCodeForSession()` errors MUST continue to redirect to `/login?error=auth_callback_failed` immediately, with no retry logic applied.
- `getUser()` errors or null user after exchange MUST continue to redirect to `/login?error=session_not_established` immediately.
- Absence of a `code` query parameter MUST continue to redirect to `/login` with no further processing.
- When the `public.users` row is immediately visible on the first attempt (no lag), routing MUST be identical to the current behavior: `/dashboard` for `org_id` set, `/onboarding` for `org_id = NULL`. No additional latency is introduced for the common case.

**Scope:**
All inputs that are NOT an OAuth routing decision (i.e., `type === 'signup'`, `type === 'recovery'`, missing `code`, failed exchange, failed `getUser()`) are completely unaffected by this fix. The polling logic is entered only after all existing guard conditions have passed and the flow type is OAuth routing.

**Note:** The correct behavior for buggy inputs (where the row is absent due to lag) is defined in the Correctness Properties section (Property 1).

---

## Hypothesized Root Cause

Based on the bug description and code analysis of `route.ts`:

1. **No retry on `public.users` SELECT**: The route performs a single `.from("users").select("org_id").eq("user_id", user.id).single()` with no error handling for the "not found" case distinct from null-`org_id`. A `PGRST116` error (zero rows) from `.single()` and a returned-null both fall through to the same `/onboarding` redirect.

2. **pgBouncer transaction-mode pooling**: Supabase's connection pooler (pgBouncer in transaction mode) assigns a fresh backend connection for each transaction. The `on_auth_user_created` trigger commits inside the Postgres backend that handled the `auth.users` INSERT. The callback route's SELECT runs on a different backend connection that may not yet have received the WAL replay for that commit, making the row invisible.

3. **No distinguishable row-absent vs. org_id-null state in current code**: The route uses `.single()`, which returns `{ data: null, error: PGRST116 }` for zero rows. The check is `if (userData?.org_id)` — this is `false` for both "row absent" (userData is null) and "row present with org_id null". The two states are operationally identical to the current code, which is incorrect.

4. **Trigger-write timing window**: The `on_auth_user_created` trigger fires `AFTER INSERT` — it commits atomically with the `auth.users` row. However, "committed in Postgres" does not mean "immediately visible on all pgBouncer pooled connections." The window is typically milliseconds, but under load can stretch to seconds.

---

## Correctness Properties

Property 1: Bug Condition — Bounded Polling Terminates with Correct Row

_For any_ OAuth callback invocation where `exchangeCodeForSession()` succeeds, `getUser()` returns a valid user, and the `public.users` row appears on poll attempt N (where 1 ≤ N ≤ MAX_POLL_ATTEMPTS), the `waitForUserProfile` helper SHALL return the row found on attempt N, and the callback route SHALL make the routing decision based on the `org_id` value in that row — `/dashboard` if `org_id` is non-null, `/onboarding` if `org_id` is null — regardless of how many attempts were required.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Non-Buggy Inputs Produce Identical Routing

_For any_ callback invocation where the bug condition does NOT hold — specifically: `type === 'signup'`, `type === 'recovery'`, missing `code`, failed `exchangeCodeForSession`, failed `getUser()`, or a `public.users` row that is immediately visible on the first poll attempt — the fixed route SHALL produce the same redirect destination as the original route, with no observable behavioral difference.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

Property 3: Exhausted Retries Always Produce Loud Failure Redirect

_For any_ OAuth callback invocation where all `MAX_POLL_ATTEMPTS` poll attempts return no row from `public.users`, the `waitForUserProfile` helper SHALL return `null`, and the callback route SHALL redirect to `/login?error=profile_unavailable` and SHALL emit a structured error log entry. The route SHALL NEVER silently redirect to `/onboarding` or `/dashboard` when the row is absent after all retries.

**Validates: Requirements 2.4**

Property 4: Identity Derives Exclusively from JWT — URL Params Never Influence Routing

_For any_ OAuth callback invocation with arbitrary URL parameters (`next`, `user_id`, `org_id`, `email`, or any other query param), the routing destination SHALL be determined solely by the `user.id` returned by `getUser()` and the `org_id` value returned by `waitForUserProfile`. No URL parameter SHALL appear in or influence the redirect destination URL.

**Validates: Requirements 2.5**

---

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct (single no-retry SELECT, pgBouncer visibility lag):

---

**File 1**: `omnis-ui/utils/supabase/waitForUserProfile.ts` *(new file)*

**Purpose**: Encapsulate the bounded-retry SELECT logic as a testable, reusable utility.

**Specific Changes**:

1. **Export constants for configurability and testability**:
   ```
   export const MAX_POLL_ATTEMPTS = 5;
   export const POLL_BASE_DELAY_MS = 100;
   ```

2. **Implement delay helper** (injectable for testing):
   ```
   async function delay(ms: number): Promise<void> {
     return new Promise((resolve) => setTimeout(resolve, ms));
   }
   ```

3. **Implement `waitForUserProfile` function**:
   ```
   FUNCTION waitForUserProfile(supabase, userId, delayFn = delay)
     INPUT: supabase — SupabaseServerClient (anon-key SSR client with cookie store)
            userId  — string (user.id from getUser() JWT)
            delayFn — injectable async delay (defaults to real setTimeout-based delay)
     OUTPUT: { org_id: string | null } | null

     FOR attempt FROM 1 TO MAX_POLL_ATTEMPTS DO
       query result = supabase.from("users")
                              .select("org_id")
                              .eq("user_id", userId)
                              .maybeSingle()   // returns null data (not error) when row absent

       IF result.error THEN
         log structured warning including attempt number and error message
         // non-fatal — treat as absent, continue polling
       ELSE IF result.data IS NOT NULL THEN
         RETURN result.data   // row found — even with org_id = null this is valid
       END IF

       IF attempt < MAX_POLL_ATTEMPTS THEN
         AWAIT delayFn(POLL_BASE_DELAY_MS * 2^(attempt - 1))
         // delays: 100ms, 200ms, 400ms, 800ms (no delay after last attempt)
       END IF
     END FOR

     RETURN null   // all attempts exhausted without finding ANY row
   END FUNCTION
   ```

4. **Use `.maybeSingle()` instead of `.single()`**: `.single()` raises a `PGRST116` error for zero rows; `.maybeSingle()` returns `{ data: null, error: null }` for zero rows, cleanly distinguishing "row absent" from "query error". This is the correct semantics for a poll loop.

5. **Injectable delay parameter**: The `delayFn` parameter defaults to the real `delay` helper but accepts an override in tests, enabling deterministic fast testing without `jest.useFakeTimers`.

---

**File 2**: `omnis-ui/app/auth/callback/route.ts` *(modify existing)*

**Specific Changes**:

1. **Import `waitForUserProfile`, `MAX_POLL_ATTEMPTS`** at the top of the file.

2. **Replace the bare `.single()` SELECT** (currently lines ~80–83) with:
   ```
   const userProfile = await waitForUserProfile(supabase, user.id);

   if (userProfile === null) {
     // All poll attempts exhausted — no row found.
     // IEC 62304 fail-loud: log structured error, redirect loudly, NEVER silently misdirect.
     console.error(
       "[auth/callback] profile_unavailable: public.users row not found after",
       MAX_POLL_ATTEMPTS,
       "attempts for user", user.id
     );
     return NextResponse.redirect(`${origin}/login?error=profile_unavailable`);
   }

   if (userProfile.org_id) {
     return NextResponse.redirect(`${origin}/dashboard`);
   }

   return NextResponse.redirect(`${origin}/onboarding`);
   ```

3. **Remove the existing `.single()` SELECT block** (the `const { data: userData }` query and the two redirects beneath it) — replaced entirely by the above.

4. **No other changes** to the existing guard conditions (`!code`, `exchangeError`, `userError || !user`, `type === 'signup' || type === 'recovery'`). These are untouched.

---

### Back-off Schedule

| Attempt | Delay before this attempt | Cumulative wait |
|---------|--------------------------|-----------------|
| 1       | 0 ms (immediate)         | 0 ms            |
| 2       | 100 ms                   | 100 ms          |
| 3       | 200 ms                   | 300 ms          |
| 4       | 400 ms                   | 700 ms          |
| 5       | 800 ms                   | 1 500 ms        |
| (give up) | —                      | ~1.5 s total wait before redirect |

> Note: The delay is applied *after* a failed attempt and *before* the next attempt, so there are 4 delay intervals for 5 attempts. Total worst-case wait ≈ 1 500 ms (not 3 100 ms as sometimes stated — the last attempt fires immediately after the 4th delay). The fix description in the requirements states ~3.1 s for delays 100+200+400+800+1600, but that schedule has 5 delays implying 6 attempts. The implementation uses 4 delays (after attempts 1–4) for MAX_POLL_ATTEMPTS = 5, giving ≈ 1.5 s worst-case, which is well within acceptable UX bounds and more conservative than 6 attempts.

---

## Testing Strategy

### Validation Approach

The testing strategy follows the two-phase bug condition methodology: first surface counterexamples that demonstrate the defect on unfixed code (exploratory), then verify the fix is correct (fix checking) and that no existing behavior regresses (preservation checking).

---

### Exploratory Bug Condition Checking

**Goal**: Demonstrate on the *unfixed* route that a zero-row SELECT causes incorrect silent misdirection with no retry. Confirm the root cause (no retry, `.single()` vs. `.maybeSingle()`, row-absent = org_id-null conflation).

**Test Plan**: Mock `supabase.from("users").select(...).eq(...).single()` to return `{ data: null, error: null }` (simulating a missing row due to lag). Assert the route redirects to `/onboarding` immediately — the defective behavior. Run on the unfixed code to verify the bug manifests.

**Test Cases**:
1. **Missing row, returning user** (will fail on unfixed code — bug): Mock row absent; verify route redirects to `/onboarding` despite user having `org_id` set in a "real" DB. This confirms silent misdirection.
2. **Missing row, exhausted scenario** (will fail on unfixed code — bug): Mock row absent for all attempts; unfixed code still redirects to `/onboarding` without loud error — confirms no fail-loud path exists.
3. **Row appears on attempt 2** (will fail on unfixed code — bug): Mock row absent on attempt 1, present on attempt 2; unfixed code makes no second attempt, confirms no retry logic exists.

**Expected Counterexamples**:
- Route redirects to `/onboarding` when row is absent (regardless of user's actual `org_id`)
- No structured error is logged for the absent-row case
- Possible causes confirmed: single `.single()` call with no retry loop

---

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed `waitForUserProfile` helper and callback route produce the correct behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  -- row appears on attempt N (1 ≤ N ≤ MAX_POLL_ATTEMPTS)
  result := waitForUserProfile_fixed(supabase, userId)
  ASSERT result IS NOT NULL
  ASSERT result.org_id = expected_org_id_from_db

  routeResult := callbackRoute_fixed(request)
  IF result.org_id IS NOT NULL THEN
    ASSERT routeResult.redirect = "${origin}/dashboard"
  ELSE
    ASSERT routeResult.redirect = "${origin}/onboarding"
  END IF
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed route produces the same redirect as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT callbackRoute_original(input).redirect
       = callbackRoute_fixed(input).redirect
END FOR
```

**Testing Approach**: Property-based testing is used for preservation checking because:
- It generates many inputs across the full domain (arbitrary `type` params, arbitrary org_id UUIDs, error states) automatically
- It catches edge cases in `type` parameter handling and UUID generation that manual tests miss
- It provides strong guarantees that the existing guard conditions (`!code`, error paths, email-confirmation flow) remain byte-for-byte identical

**Test Plan**: Observe correct behavior for all preservation scenarios on unfixed code first (they already pass), then run the same tests against fixed code and assert no change.

**Test Cases**:
1. **Email-confirmation flow preserved**: Generate arbitrary `type` values with fast-check; assert `type === 'signup'` and `type === 'recovery'` always redirect to `/auth/success`, others route by `org_id`.
2. **Error paths preserved**: Mock `exchangeCodeForSession` failure; assert `/login?error=auth_callback_failed`. Mock `getUser` failure; assert `/login?error=session_not_established`.
3. **No-code path preserved**: Request without `code` param; assert `/login`.
4. **Immediate-visibility routing preserved**: Row visible on first attempt with `org_id` set → `/dashboard`. Row visible on first attempt with `org_id = null` → `/onboarding`.

---

### Unit Tests

- `waitForUserProfile` returns the row when found on attempt 1 (no delays fired)
- `waitForUserProfile` returns the row when found on attempt N (2–5), verifying N-1 delay calls at correct exponential intervals
- `waitForUserProfile` returns `null` when all 5 attempts return no row
- `waitForUserProfile` treats a query error on any attempt as "row absent" and continues polling (non-fatal)
- `waitForUserProfile` returns the row even when `org_id` is `null` (valid stub-row state)
- Callback route emits a structured `console.error` and redirects to `/login?error=profile_unavailable` when `waitForUserProfile` returns `null`
- Callback route redirects to `/dashboard` for any non-null `org_id` returned by helper
- Callback route redirects to `/onboarding` when `org_id` is `null` in returned row

### Property-Based Tests

**File**: `omnis-ui/utils/supabase/__tests__/waitForUserProfile.property.test.ts`
and `omnis-ui/app/auth/callback/__tests__/route.property.test.ts`

- **Property 1 (Fix Checking)**: For any `appearOnAttempt` in `[1..MAX_POLL_ATTEMPTS]` (fast-check integer), mock the SELECT to return null for the first `appearOnAttempt - 1` calls and the row on attempt `appearOnAttempt`; assert `waitForUserProfile` returns the row and the callback route redirects correctly based on `org_id`. Minimum 100 iterations.
- **Property 2 (Preservation)**: For any non-null `org_id` UUID (fast-check uuid) on an immediately-visible row, assert redirect is `/dashboard`. For `org_id = null` on an immediately-visible stub row, assert redirect is `/onboarding`. Minimum 100 iterations.
- **Property 3 (Loud Failure)**: For any scenario where all 5 mock attempts return no row, assert redirect is always `/login?error=profile_unavailable` and `console.error` was called exactly once. Minimum 100 iterations.
- **Property 4 (URL Param Isolation)**: For arbitrary query params (`next`, `user_id`, `org_id`, `email`, random strings) injected into the callback URL, assert the redirect destination never contains those values and is always one of `/dashboard`, `/onboarding`, `/login?error=*`, or `/auth/success`. Minimum 100 iterations.

### Integration Tests

- Full OAuth callback simulation: mock Supabase client with row appearing on attempt 3; verify final redirect is correct and delay mock was called with correct exponential intervals (100 ms, 200 ms).
- Full exhaustion simulation: all 5 attempts fail; verify redirect is `/login?error=profile_unavailable`, structured error is logged, and no intermediate redirects occurred.
- Email-confirmation flow integration: `type=signup` request; verify `waitForUserProfile` is never called (mock asserts zero invocations).
- Security invariant integration: inject `?org_id=attacker-uuid` into callback URL alongside legitimate session; verify route uses `org_id` from `public.users` (via helper) not from URL params.
