# Bugfix Requirements Document

## Introduction

The OAuth callback route (`omnis-ui/app/auth/callback/route.ts`) contains a race condition when routing users after an OAuth sign-in. After `exchangeCodeForSession()` succeeds, the route immediately queries `public.users` to read `org_id` and decide whether to send the user to `/onboarding` or `/dashboard`. However, the `on_auth_user_created` trigger that writes the `public.users` stub row fires within the Postgres transaction that creates `auth.users` — and under connection pooling (pgBouncer) or database load, that trigger-written row may not yet be visible to the callback route's SELECT on a separate connection. The route currently treats a missing row (`userData` is null) identically to a row with `org_id = NULL`, routing both cases to `/onboarding`. This means a returning user whose `public.users` row exists with a non-null `org_id` could be incorrectly routed to `/onboarding` if transient replication lag causes the row to appear absent. More critically, for genuinely new users the absence of the row means the callback has made a routing decision before the profile data is available, and if the onboarding flow then writes to `public.users` it will conflict with the trigger-written stub (UNIQUE constraint on `user_id`), potentially corrupting onboarding state. As a SaMD system bound by FDA 21 CFR Part 11/820 and IEC 62304, deterministic, auditable routing is mandatory — silent misdirection is a compliance failure.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the OAuth callback route queries `public.users` and the trigger-written stub row has not yet committed to the connection pool THEN the system returns zero rows (`userData` is null) and treats the absence of a row as confirmation that the user is new

1.2 WHEN `public.users` returns zero rows for a user who is genuinely new THEN the system redirects to `/onboarding` without waiting for the row to exist, so the onboarding flow may encounter a UNIQUE CONSTRAINT conflict when it attempts to write the `public.users` record the trigger has already created

1.3 WHEN `public.users` returns zero rows due to replication lag for a returning user who already has `org_id` set THEN the system incorrectly redirects to `/onboarding` instead of `/dashboard`, misdirecting an authenticated user

1.4 WHEN the callback route cannot distinguish between "row does not exist yet" and "row exists with `org_id = NULL`" THEN the system makes an indeterminate routing decision with no retry, no wait, and no error signal — silently failing in violation of IEC 62304 fail-loud requirements

### Expected Behavior (Correct)

2.1 WHEN the OAuth callback route has exchanged the code for a session and derived user identity from the JWT THEN the system SHALL poll `public.users` with bounded retries until the row is present before making any routing decision

2.2 WHEN `public.users` returns a row with a non-null `org_id` THEN the system SHALL redirect the user to `/dashboard` regardless of how many poll attempts were required to obtain that row

2.3 WHEN `public.users` returns a row with `org_id = NULL` THEN the system SHALL redirect the user to `/onboarding`, confirming the user is genuinely new and their stub row exists

2.4 WHEN the poll for `public.users` exhausts all retry attempts without finding the row THEN the system SHALL fail loudly by redirecting to `/login?error=profile_unavailable` and logging a structured error, never silently misdirecting the user

2.5 WHEN the routing decision is made THEN the system SHALL derive identity exclusively from the Supabase session JWT via `getUser()` and SHALL NOT use any URL parameter (`next`, `user_id`, `org_id`, `email`) as a routing input

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `type === 'signup'` or `type === 'recovery'` is present in the callback URL THEN the system SHALL CONTINUE TO redirect to `/auth/success` without querying `public.users`, as the email-confirmation flow is unaffected by this bug

3.2 WHEN `exchangeCodeForSession()` returns an error THEN the system SHALL CONTINUE TO redirect to `/login?error=auth_callback_failed` without any retry logic

3.3 WHEN `getUser()` returns an error or null user after code exchange THEN the system SHALL CONTINUE TO redirect to `/login?error=session_not_established`

3.4 WHEN no `code` query parameter is present in the callback URL THEN the system SHALL CONTINUE TO redirect to `/login`

3.5 WHEN a returning user's `public.users` row is immediately visible (no lag) and `org_id` is set THEN the system SHALL CONTINUE TO redirect to `/dashboard` on the first poll attempt with no observable latency change for the common case

3.6 WHEN a new user's `public.users` stub row is immediately visible (no lag) and `org_id` is NULL THEN the system SHALL CONTINUE TO redirect to `/onboarding` on the first poll attempt
