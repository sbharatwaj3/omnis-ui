# Implementation Plan: Google & GitHub OAuth Sign-In

## Overview

Wire Google and GitHub OAuth into the existing `/login` and `/signup` pages via a shared `OAuthButtons` client component. Update the `/auth/callback` route to branch between email-confirmation flows (→ `/auth/success`) and OAuth flows (→ `/onboarding` or `/dashboard` based on `org_id`). All existing email/password logic is untouched. Property-based tests cover the four correctness properties defined in the design.

## Tasks

- [x] 1. Install test dependencies
  - Add `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, and `fast-check` as `devDependencies` in `omnis-ui/package.json`
  - Create `omnis-ui/vitest.config.ts` that loads `@vitejs/plugin-react` and sets `environment: 'jsdom'`
  - Add a `"test": "vitest --run"` script to `package.json`
  - _Requirements: 2.4, 4.1, 4.2_

- [ ] 2. Create `OAuthButtons` component
  - [x] 2.1 Create `omnis-ui/components/auth/OAuthButtons.tsx` with `"use client"` directive
    - Internal state: `loadingProvider: 'google' | 'github' | null` and `error: string | null`
    - Render "Continue with Google" button with inline full-color Google SVG (`#4285F4` / `#34A853` / `#FBBC05` / `#EA4335`)
    - Render "Continue with GitHub" button with monochrome Invertocat SVG (`fill="currentColor"` + `text-slate-900`)
    - On click: call `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: \`${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback\` } })` using `createClient()` from `@/utils/supabase/client`
    - While loading: show `Loader2` spinner on active button; disable both buttons via `disabled={!!loadingProvider}`
    - On Supabase error: set `error` state; render inline alert (`border-red-200 bg-red-50`, `AlertCircle` icon) matching the existing auth error pattern
    - Render an "OR" divider (`<div>` with horizontal rules and centred "OR" label) below the buttons
    - Buttons styled: `w-full flex items-center justify-center gap-3 border border-gray-200 rounded-md shadow-sm bg-white text-gray-800 font-medium py-2.5 transition-colors hover:bg-gray-50` — no `dark:` variants
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 7.2, 7.4_

  - [x] 2.2 Write property test — Property 1: redirectTo URL construction is universal
    - File: `omnis-ui/components/auth/__tests__/OAuthButtons.property.test.tsx`
    - Tag: `// Feature: oauth-social-login, Property 1: redirectTo URL construction is universal`
    - Generate arbitrary base URL strings with fast-check (with/without trailing slash, various valid origins)
    - Mock `createClient()` to capture `signInWithOAuth` arguments; set `NEXT_PUBLIC_SITE_URL` to the generated value
    - Simulate button click for both providers; assert `redirectTo === normalizedBase + '/auth/callback'` with no double-slash and no hardcoded domain
    - Run minimum 100 iterations
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.3 Write property test — Property 2: inline error display for any Supabase error
    - Tag: `// Feature: oauth-social-login, Property 2: Inline error display for any Supabase error`
    - Generate arbitrary non-empty error message strings with fast-check
    - Mock `signInWithOAuth` to return `{ data: {}, error: { message: generatedString } }`
    - Simulate button click; assert the rendered output contains the generated error string in a visible element
    - Run minimum 100 iterations
    - _Requirements: 2.4_

- [x] 3. Integrate `OAuthButtons` into Login and Signup pages
  - [x] 3.1 In `omnis-ui/app/login/page.tsx` — inside `AuthForm`, import `OAuthButtons` and render `<OAuthButtons />` after the compliance pill `<div>` and before the `<form onSubmit={handleSubmit}>` block; no other changes to `AuthForm`, `BrandPanel`, or `LoginPage`
    - _Requirements: 1.1, 1.4, 1.5, 8.1, 8.3_

  - [x] 3.2 In `omnis-ui/app/signup/page.tsx` — inside `SignUpForm`, import `OAuthButtons` and render `<OAuthButtons />` after the compliance pill `<div>` and before the `<form onSubmit={handleSubmit}>` block; no other changes to `SignUpForm`, `BrandPanel`, or `SignUpPage`
    - _Requirements: 1.2, 1.4, 1.6, 8.2, 8.4_

- [x] 4. Update the auth callback route to branch on flow type and `org_id`
  - [x] 4.1 In `omnis-ui/app/auth/callback/route.ts`, after the existing `getUser()` success block:
    - Read `type` from `requestUrl.searchParams.get("type")`
    - If `type === 'signup' || type === 'recovery'`, return `NextResponse.redirect(\`${origin}/auth/success\`)` (preserves email-confirmation behavior)
    - Otherwise, query `public.users` using the SSR client: `SELECT org_id FROM public.users WHERE user_id = user.id`
    - If the row is absent or `org_id` is null → redirect to `${origin}/onboarding`
    - If `org_id` is a non-null UUID → redirect to `${origin}/dashboard`
    - Do NOT modify the existing `exchangeCodeForSession` error path or `getUser()` error path
    - Do NOT use any URL parameter (`next`, `user_id`, `email`, `org_id`) as a routing input
    - Identity stays derived exclusively from the session JWT via `getUser()`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.3, 7.5_

  - [x] 4.2 Write property test — Property 3: callback routing determined exclusively by `org_id`
    - File: `omnis-ui/app/auth/callback/__tests__/route.property.test.ts`
    - Tag: `// Feature: oauth-social-login, Property 3: Callback route routing is determined exclusively by org_id`
    - Generate arbitrary UUID strings (non-null `org_id`) and null/undefined (null cases) with fast-check
    - Mock `exchangeCodeForSession` to succeed; mock `getUser()` to return a user with a random user ID; mock `public.users` query to return the generated `org_id` (or no row)
    - Assert redirect is `${origin}/onboarding` for null/absent and `${origin}/dashboard` for any non-null UUID
    - Generate arbitrary `?next=` param values and assert they never appear in the redirect destination
    - Run minimum 100 iterations
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 7.1_

  - [x] 4.3 Write property test — Property 4: email-confirmation flow preserved for all type signals
    - Tag: `// Feature: oauth-social-login, Property 4: Email-confirmation flow is preserved for all type signals`
    - Generate arbitrary `type` param values with fast-check
    - Mock successful exchange and `getUser()`
    - If generated value is `'signup'` or `'recovery'`: assert redirect is `${origin}/auth/success`
    - Otherwise: assert redirect is `/onboarding` or `/dashboard` per `org_id`, never `/auth/success`
    - Run minimum 100 iterations
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 5. Checkpoint — ensure all tests pass
  - Run `bun run test` in `omnis-ui/`; all unit and property tests must be green before proceeding.
  - Ensure `proxy.ts` is unmodified (file hash check or manual inspection).
  - Ask the user if any questions arise.

- [x] 6. Commit and push all changes
  - [x] 6.1 In `omnis-ui/`, stage `components/auth/OAuthButtons.tsx`, `app/login/page.tsx`, `app/signup/page.tsx`, `app/auth/callback/route.ts`, `package.json`, `vitest.config.ts`, and all test files; commit with message `feat: add Google & GitHub OAuth sign-in (oauth-social-login)`
  - [x] 6.2 Push to a new branch (e.g., `feat/oauth-social-login`) with `git push -u origin feat/oauth-social-login`
  - _Requirements: all_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster first pass — they validate correctness properties but are not required for the feature to function.
- `proxy.ts` must not be modified; the existing session-cookie middleware already handles OAuth sessions correctly.
- No `dark:` Tailwind variants anywhere in `OAuthButtons.tsx` — the auth pages are light-mode locked.
- All secrets (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are read from `process.env` only — never hardcoded.
- The callback route must use `createServerClient` (SSR cookie client) for all server-side queries; `OAuthButtons` must use `createClient()` (browser client) only.
- Property tests use fast-check with a minimum of 100 iterations each, tagged with the format `// Feature: oauth-social-login, Property N: <title>`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "4.1"] },
    { "id": 2, "tasks": ["3.1", "3.2", "2.2", "2.3"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2"] }
  ]
}
```
