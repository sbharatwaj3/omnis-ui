# Implementation Plan: OAuth Callback Race Condition Fix

## Overview

Fix the race condition in `app/auth/callback/route.ts` where a single no-retry `SELECT` on `public.users` silently misdirects users when the `on_auth_user_created` trigger-written stub row has not yet propagated to the pgBouncer connection serving the callback request. The fix introduces a bounded-poll helper (`waitForUserProfile`) with exponential back-off and replaces the bare single-shot SELECT with a call to this helper. A loud failure redirect (`/login?error=profile_unavailable`) is added when all retries are exhausted.

Tasks are sequenced: helper implementation → helper unit tests → helper property tests → route modification → route property tests → checkpoint → commit/push.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Single No-Retry SELECT Silently Misdirects Users
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug: a zero-row SELECT on the UNFIXED route causes silent misdirection with no retry and no loud failure
  - **File**: `omnis-ui/utils/supabase/__tests__/waitForUserProfile.property.test.ts`
  - **Scoped PBT Approach**: Scope the property to the concrete failing case — mock the SELECT to return `{ data: null, error: null }` (simulating pgBouncer lag) for all attempts; assert the FIXED helper returns `null` and the route redirects to `/login?error=profile_unavailable`; on UNFIXED code this test will FAIL because the bare `.single()` call redirects to `/onboarding` with no retry and no error signal
  - Specifically: for any `appearOnAttempt` in `[1..MAX_POLL_ATTEMPTS]`, mock the SELECT to return null for the first `appearOnAttempt - 1` calls and `{ org_id: 'some-uuid' }` on attempt `appearOnAttempt`; assert the helper returns the row; on UNFIXED code (no helper, bare single SELECT) this fails for `appearOnAttempt > 1`
  - Secondary scoped case: mock all 5 attempts returning null; assert helper returns `null`; on UNFIXED code this fails because no retry loop exists and the route silently falls through to `/onboarding`
  - Run test on UNFIXED code (before creating `waitForUserProfile.ts`)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists: no retry, no loud failure, silent misdirection)
  - Document counterexamples found (e.g., "row appearing on attempt 2 is never seen — route already redirected to `/onboarding` on attempt 1")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Inputs Produce Identical Routing
  - **File**: `omnis-ui/app/auth/callback/__tests__/route.property.test.ts`
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED `route.ts` for inputs where the bug condition does NOT hold, then write tests capturing those behaviors
  - Observe: `type === 'signup'` → redirects to `/auth/success` (no `public.users` query)
  - Observe: `type === 'recovery'` → redirects to `/auth/success` (no `public.users` query)
  - Observe: `exchangeCodeForSession` error → redirects to `/login?error=auth_callback_failed`
  - Observe: `getUser()` error or null → redirects to `/login?error=session_not_established`
  - Observe: no `code` param → redirects to `/login`
  - Observe: row immediately visible (attempt 1), `org_id` non-null → redirects to `/dashboard`
  - Observe: row immediately visible (attempt 1), `org_id` null → redirects to `/onboarding`
  - Write property-based test using fast-check: generate arbitrary `type` param values; assert `'signup'` and `'recovery'` always produce `/auth/success`; all other values produce `/onboarding` or `/dashboard` based on `org_id`, never `/auth/success`
  - Write property-based test: generate arbitrary non-null `org_id` UUIDs (fast-check uuid); assert redirect is always `${origin}/dashboard`
  - Write property-based test: for `org_id = null` with immediately visible row; assert redirect is always `${origin}/onboarding`
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All preservation tests PASS on unfixed code (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Implement `waitForUserProfile` helper

  - [x] 3.1 Create `omnis-ui/utils/supabase/waitForUserProfile.ts` (new file)
    - Export `MAX_POLL_ATTEMPTS = 5` and `POLL_BASE_DELAY_MS = 100` as named constants for testability
    - Implement internal `delay(ms: number): Promise<void>` using `setTimeout`
    - Implement `waitForUserProfile(supabase, userId, delayFn = delay)` with signature:
      - `supabase`: `SupabaseServerClient` (SSR anon-key client with cookie store)
      - `userId`: `string` (from `getUser()` JWT — never from URL params)
      - `delayFn`: injectable async delay (defaults to real `delay`; injected in tests for deterministic fast execution)
      - Returns: `{ org_id: string | null } | null`
    - Loop `FOR attempt FROM 1 TO MAX_POLL_ATTEMPTS`:
      - Query using `.maybeSingle()` (NOT `.single()`) — returns `{ data: null, error: null }` for zero rows instead of `PGRST116` error, cleanly distinguishing "row absent" from "query error"
      - If `result.error`: log structured warning with attempt number and error message; treat as absent (non-fatal), continue polling
      - If `result.data !== null`: return `result.data` immediately (row found — `org_id` may be null for stub rows, which is valid)
      - If `attempt < MAX_POLL_ATTEMPTS`: `await delayFn(POLL_BASE_DELAY_MS * 2 ** (attempt - 1))` — produces delays of 100ms, 200ms, 400ms, 800ms (4 delays for 5 attempts, ~1500ms worst-case total)
    - After loop exhaustion: return `null` (all attempts exhausted — no row found)
    - Back-off schedule: attempt 1 immediate; delay 100ms before attempt 2; delay 200ms before attempt 3; delay 400ms before attempt 4; delay 800ms before attempt 5; no delay after attempt 5
    - _Bug_Condition: `isBugCondition(input)` — OAuth callback where `exchangeCodeForSession()` succeeded, `getUser()` returned valid user, and `public.users` SELECT returns zero rows due to pgBouncer connection-pool lag (row exists in DB but not yet visible on this connection)_
    - _Expected_Behavior: `waitForUserProfile` returns `{ org_id }` on the attempt where the row first becomes visible (1 ≤ N ≤ MAX_POLL_ATTEMPTS); returns `null` only after all 5 attempts are exhausted_
    - _Preservation: Injectable `delayFn` defaults ensure zero behavior change for callers that don't pass a custom delay; `.maybeSingle()` semantics preserve clean null/data distinction_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Write unit tests for `waitForUserProfile`
    - **File**: `omnis-ui/utils/supabase/__tests__/waitForUserProfile.test.ts`
    - Test: returns row when found on attempt 1 (no `delayFn` calls fired)
    - Test: returns row when found on attempt 2 — `delayFn` called once with `100`
    - Test: returns row when found on attempt 3 — `delayFn` called with `100` then `200`
    - Test: returns row when found on attempt 4 — `delayFn` called with `100`, `200`, `400`
    - Test: returns row when found on attempt 5 — `delayFn` called with `100`, `200`, `400`, `800`
    - Test: returns `null` when all 5 attempts return no row — `delayFn` called exactly 4 times
    - Test: a query error on attempt N is treated as absent (non-fatal); polling continues; row found on subsequent attempt is returned
    - Test: returns `{ org_id: null }` (not `null`) when the stub row exists with `org_id = null` — distinguishes "row present, org_id null" from "row absent"
    - Test: returns `null` (not `{ org_id: null }`) when all queries return `{ data: null, error: null }` — confirms row-absent semantics
    - Use injected `delayFn` mock (`vi.fn()`) for all tests — no real timers, deterministic and fast
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Write property-based tests for `waitForUserProfile` — Properties 1 & 3
    - **File**: `omnis-ui/utils/supabase/__tests__/waitForUserProfile.property.test.ts`
    - Tag: `// Feature: oauth-callback-race-condition, Property 1: Bug Condition — Bounded Polling Terminates with Correct Row`
    - **Property 1: Bug Condition** - Bounded Polling Terminates with Correct Row
      - Use fast-check: generate `appearOnAttempt` as integer in `[1..MAX_POLL_ATTEMPTS]` and `orgId` as uuid-or-null
      - Mock SELECT: return `{ data: null, error: null }` for the first `appearOnAttempt - 1` calls, then return `{ data: { org_id: orgId }, error: null }` on attempt `appearOnAttempt`
      - Assert `waitForUserProfile` returns `{ org_id: orgId }` for all combinations
      - Assert `delayFn` was called exactly `appearOnAttempt - 1` times with the correct exponential intervals
      - Minimum 100 iterations
      - _Requirements: 2.1, 2.2, 2.3_
    - Tag: `// Feature: oauth-callback-race-condition, Property 3: Exhausted Retries Always Produce Null`
    - **Property 3: Loud Failure** - All Retries Exhausted Returns Null
      - Use fast-check: generate any userId string (non-empty)
      - Mock all 5 SELECT calls to return `{ data: null, error: null }`
      - Assert `waitForUserProfile` returns `null` (not `{ org_id: null }`)
      - Assert `delayFn` was called exactly 4 times (delays before attempts 2–5)
      - Assert delay values are exactly `[100, 200, 400, 800]`
      - Minimum 100 iterations
      - _Requirements: 2.4_

- [ ] 4. Modify `omnis-ui/app/auth/callback/route.ts`

  - [x] 4.1 Replace bare single-shot SELECT with `waitForUserProfile` call
    - Import `waitForUserProfile` and `MAX_POLL_ATTEMPTS` from `@/utils/supabase/waitForUserProfile`
    - Remove the existing `const { data: userData } = await supabase.from("users").select("org_id").eq("user_id", user.id).single()` block and the two redirects beneath it (lines ~80–83 and the `if (userData?.org_id)` / fallthrough)
    - Replace with:
      ```typescript
      const userProfile = await waitForUserProfile(supabase, user.id);

      if (userProfile === null) {
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
    - Do NOT modify any of the existing guard conditions: `!code` → `/login`, `exchangeError` → `/login?error=auth_callback_failed`, `userError || !user` → `/login?error=session_not_established`, `type === 'signup' || type === 'recovery'` → `/auth/success`
    - Identity remains derived exclusively from `getUser()` JWT — no URL params used for routing
    - _Bug_Condition: `isBugCondition(input)` where `exchangeCodeForSession()` succeeded, `getUser()` returned valid user, type is not 'signup'/'recovery', and the `public.users` SELECT returns zero rows due to pgBouncer lag_
    - _Expected_Behavior: route calls `waitForUserProfile`; if row found → route by `org_id`; if null after all retries → `console.error` + redirect to `/login?error=profile_unavailable`_
    - _Preservation: all four existing guard conditions (`!code`, `exchangeError`, `userError || !user`, type check) are byte-for-byte unchanged; row immediately visible on attempt 1 produces identical routing to the original bare SELECT_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 4.2 Write property-based tests for `route.ts` — Properties 2 & 4
    - **File**: `omnis-ui/app/auth/callback/__tests__/route.property.test.ts`
    - Extend the file created in task 2 with the following two properties on the FIXED route
    - Tag: `// Feature: oauth-callback-race-condition, Property 2: Preservation — Non-Buggy Inputs Produce Identical Routing`
    - **Property 2: Preservation** - Non-Buggy Inputs Produce Identical Routing
      - Use fast-check: generate arbitrary `type` param values (string or null)
      - Mock successful `exchangeCodeForSession`, `getUser()` returning a valid user, and `waitForUserProfile` returning `{ org_id: 'some-uuid' }` or `{ org_id: null }` as needed
      - Assert: `type === 'signup'` always produces redirect to `${origin}/auth/success` (no `waitForUserProfile` call — verify mock was NOT called)
      - Assert: `type === 'recovery'` always produces redirect to `${origin}/auth/success` (no `waitForUserProfile` call)
      - Assert: any other `type` produces `/dashboard` or `/onboarding` based on `org_id`, never `/auth/success`
      - Use fast-check uuid for `org_id`: assert any non-null uuid → `/dashboard`, null → `/onboarding`
      - Minimum 100 iterations per property
      - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
    - Tag: `// Feature: oauth-callback-race-condition, Property 4: Identity Derives Exclusively from JWT — URL Params Never Influence Routing`
    - **Property 4: URL Param Isolation** - Identity Derives Exclusively from JWT
      - Use fast-check: generate arbitrary query param objects with keys `next`, `user_id`, `org_id`, `email`, plus random string keys and values
      - Inject these params into the callback URL alongside a legitimate session (mocked `getUser()` returning a valid user, `waitForUserProfile` returning a row with a known `org_id`)
      - Assert the redirect destination is always one of: `${origin}/dashboard`, `${origin}/onboarding`, `${origin}/login?error=*`, `${origin}/auth/success`
      - Assert the injected param values (e.g., the attacker's `org_id` UUID) never appear in the redirect URL
      - Assert `org_id` in the redirect decision comes from `waitForUserProfile` return value, not from URL params
      - Minimum 100 iterations
      - _Requirements: 2.5_

  - [ ] 4.3 Verify bug condition exploration test (Property 1) now passes
    - **Property 1: Expected Behavior** - Bounded Polling Terminates with Correct Row
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (row appearing on attempt N is returned; all-absent returns null)
    - Run `waitForUserProfile.property.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the `waitForUserProfile` helper correctly implements bounded polling and the route uses it)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 4.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Inputs Produce Identical Routing
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `route.property.test.ts`
    - **EXPECTED OUTCOME**: All preservation tests PASS (confirms no regressions in email-confirmation flow, error paths, no-code path, and immediate-visibility routing)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 5. Checkpoint — Ensure all tests pass
  - Run `bun run test` in `omnis-ui/` (or `npx vitest --run`); all unit tests and property-based tests must be green
  - Confirm: `waitForUserProfile.test.ts` — all 9 unit tests pass
  - Confirm: `waitForUserProfile.property.test.ts` — Property 1 (≥100 iterations) and Property 3 (≥100 iterations) both pass
  - Confirm: `route.property.test.ts` — Property 2 (≥100 iterations) and Property 4 (≥100 iterations) both pass
  - Confirm: existing `oauth-social-login` property tests are still green (no regression in prior callback test file)
  - Confirm: `route.ts` imports are clean (no unused `.single()` call remains, no stale `userData` reference)
  - Ask the user if any questions arise before proceeding to commit

- [ ] 6. Commit and push all changes
  - [ ] 6.1 In `omnis-ui/`, stage the following files:
    - `utils/supabase/waitForUserProfile.ts` (new)
    - `utils/supabase/__tests__/waitForUserProfile.test.ts` (new)
    - `utils/supabase/__tests__/waitForUserProfile.property.test.ts` (new)
    - `app/auth/callback/route.ts` (modified)
    - `app/auth/callback/__tests__/route.property.test.ts` (modified — extended with Properties 2 & 4)
    - Commit with message: `fix: bounded-poll waitForUserProfile to resolve OAuth callback race condition`
  - [ ] 6.2 Push to a new branch (e.g., `fix/oauth-callback-race-condition`) with `git push -u origin fix/oauth-callback-race-condition`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## Notes

- `waitForUserProfile` uses `.maybeSingle()` (not `.single()`) — this is the critical semantic change: `.single()` returns `PGRST116` for zero rows and cannot be polled cleanly; `.maybeSingle()` returns `{ data: null, error: null }` for zero rows, enabling the retry loop.
- The `delayFn` injectable parameter is the only mechanism needed for deterministic fast testing — no `vi.useFakeTimers()` required. Pass `vi.fn().mockResolvedValue(undefined)` as `delayFn` in tests.
- Back-off schedule (4 delays, 5 attempts): 0ms → attempt 1; 100ms delay → attempt 2; 200ms delay → attempt 3; 400ms delay → attempt 4; 800ms delay → attempt 5; worst-case ~1500ms total wait before `/login?error=profile_unavailable`.
- Task 1 (bug condition exploration test) is expected to FAIL on unfixed code — this is the correct outcome. Do not modify the test to make it pass; implement the fix instead.
- Task 2 (preservation tests) is expected to PASS on unfixed code — these capture baseline behavior that must survive the fix.
- All routing decisions use `user.id` from `getUser()` JWT — never from URL params. This invariant is tested by Property 4.
- The `oauth-social-login` spec test file (`app/auth/callback/__tests__/route.property.test.ts`) is extended in-place for task 4.2 — both specs share the same test file, with each property tagged with its originating feature name.
- No new npm/bun dependencies are needed — vitest and fast-check are already installed from the `oauth-social-login` spec.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["5"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2"] }
  ]
}
```
