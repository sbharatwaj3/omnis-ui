# Requirements Document

## Introduction

This feature adds Google and GitHub OAuth sign-in to the Qavro enterprise UI (`omnis-ui`). OAuth buttons are placed on both the `/login` and `/signup` pages above the existing email/password form. A shared `OAuthButtons` component eliminates duplication. The existing Supabase auth callback route is updated to correctly branch between email-confirmation flows (which retain their current `/auth/success` dead-end behavior) and OAuth flows (which route the user to `/onboarding` or `/dashboard` based on org membership). All existing email/password authentication behavior is preserved unchanged.

---

## Glossary

- **OAuth_Button**: A clickable UI control that initiates a Supabase OAuth sign-in flow for a specific provider (Google or GitHub).
- **OAuthButtons**: A shared React client component that renders both the Google and GitHub OAuth_Buttons together with an "OR" divider, consumed by both `/login` and `/signup` pages.
- **Auth_Callback_Route**: The Next.js App Router server route at `/auth/callback/route.ts` that receives Supabase redirect codes, exchanges them for sessions, and routes the user.
- **Login_Page**: The existing client component at `app/login/page.tsx`.
- **Signup_Page**: The existing client component at `app/signup/page.tsx`.
- **Supabase_Client**: The browser-side Supabase client returned by `createClient()` from `utils/supabase/client.ts`.
- **Supabase_Server_Client**: The server-side Supabase client constructed with `createServerClient` from `@supabase/ssr`, used in server route handlers.
- **NEXT_PUBLIC_SITE_URL**: An environment variable already present in `.env.local` that holds the canonical base URL for the deployment (e.g., `https://app.qavro.com`).
- **Onboarding_Route**: The Next.js page at `/onboarding` where new users without an `org_id` create or join an organization.
- **Dashboard_Route**: The Next.js page at `/dashboard` where authenticated users with an established `org_id` land after sign-in.
- **Email_Confirm_Flow**: The existing Supabase email-confirmation redirect flow, which currently lands at `/auth/success` and must not be changed.
- **OAuth_Flow**: The redirect-based sign-in flow initiated by `supabase.auth.signInWithOAuth`, which also uses the `/auth/callback` route.
- **Session**: The Supabase user session established after a successful authentication exchange, stored as a secure HTTP-only cookie by the Supabase SSR helpers.
- **org_id**: A UUID column on the `public.users` table that is `NULL` for users who have not yet joined or created an organization, and non-NULL for established members.
- **Provider**: One of the two supported OAuth identity providers: `google` or `github`.

---

## Requirements

### Requirement 1: OAuth Buttons on Login and Signup Pages

**User Story:** As a Qavro user, I want to sign in or sign up using my Google or GitHub account, so that I can access the platform without creating a separate password.

#### Acceptance Criteria

1. THE Login_Page SHALL render an OAuthButtons component above the email/password form.
2. THE Signup_Page SHALL render an OAuthButtons component above the email/password form.
3. THE OAuthButtons component SHALL render a "Continue with Google" button and a "Continue with GitHub" button.
4. THE OAuthButtons component SHALL render a visual "OR" divider between the OAuth buttons section and the email/password form section on both pages.
5. WHEN the OAuthButtons component is rendered on the Login_Page, THE Login_Page SHALL preserve all existing email/password form fields, labels, and submission logic without modification.
6. WHEN the OAuthButtons component is rendered on the Signup_Page, THE Signup_Page SHALL preserve all existing email/password form fields, labels, and submission logic without modification.

---

### Requirement 2: Shared OAuthButtons Component

**User Story:** As a developer maintaining the Qavro codebase, I want a single shared component for OAuth buttons, so that Login and Signup pages stay consistent and future provider additions require only one change.

#### Acceptance Criteria

1. THE OAuthButtons component SHALL be defined in a single file (e.g., `components/auth/OAuthButtons.tsx`) and imported by both the Login_Page and the Signup_Page.
2. THE OAuthButtons component SHALL be a React client component (using `"use client"` directive).
3. THE OAuthButtons component SHALL accept no required props that differ between the Login_Page and Signup_Page contexts, so both pages can use an identical import.
4. IF an OAuth provider sign-in attempt returns an error from the Supabase_Client, THEN THE OAuthButtons component SHALL display an inline error message visible to the user.

---

### Requirement 3: OAuth Button Styling

**User Story:** As a Qavro user, I want the OAuth sign-in buttons to look consistent with the rest of the Qavro enterprise UI, so that the experience feels cohesive and trustworthy.

#### Acceptance Criteria

1. THE OAuthButtons component SHALL render buttons using the existing Qavro styling palette: `border border-gray-200`, `rounded-md`, `shadow-sm`, `w-full`, `py-2.5`, `font-medium`, and `transition-colors` Tailwind classes.
2. THE OAuthButtons component SHALL render the "Continue with Google" button with the official Google SVG brand icon (full-color `#4285F4` / `#34A853` / `#FBBC05` / `#EA4335`).
3. THE OAuthButtons component SHALL render the "Continue with GitHub" button with a monochrome GitHub SVG Invertocat icon in `text-slate-900` fill.
4. THE OAuthButtons component SHALL NOT use any `dark:` Tailwind variant classes AND SHALL use the Qavro enterprise styling palette, consistent with the light-mode lock applied across all auth pages.
5. THE OAuthButtons component SHALL render buttons with a white (`bg-white`) background and `text-gray-800` label text, visually distinct from the primary `bg-slate-900` submit button.

---

### Requirement 4: OAuth Sign-In Initiation

**User Story:** As a Qavro user, I want clicking an OAuth button to immediately redirect me to the chosen provider's consent screen, so that I can authorize access and return to the application.

#### Acceptance Criteria

1. WHEN a user clicks the "Continue with Google" button, THE OAuthButtons component SHALL call `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '<NEXT_PUBLIC_SITE_URL>/auth/callback' } })` using the Supabase_Client.
2. WHEN a user clicks the "Continue with GitHub" button, THE OAuthButtons component SHALL call `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: '<NEXT_PUBLIC_SITE_URL>/auth/callback' } })` using the Supabase_Client.
3. THE OAuthButtons component SHALL construct the `redirectTo` URL using `process.env.NEXT_PUBLIC_SITE_URL` with the path `/auth/callback` appended, matching the pattern already used by the Signup_Page's `emailRedirectTo`.
4. THE OAuthButtons component SHALL NOT hardcode any domain, URL, API key, or secret value — all origin information MUST be derived from `NEXT_PUBLIC_SITE_URL`.
5. WHEN an OAuth button is clicked and the sign-in call is in progress, THE OAuthButtons component SHALL render a loading indicator on the active button and disable both buttons to prevent duplicate submissions; both buttons MAY also be disabled in other states (e.g., component initialization or an error state) and the OAuth call SHALL proceed regardless of whether the loading indicator successfully renders.

---

### Requirement 5: Auth Callback Route — OAuth Flow Routing

**User Story:** As a Qavro user completing an OAuth sign-in, I want to be sent to the right destination after authenticating, so that new users are guided through onboarding and returning users go directly to their dashboard.

#### Acceptance Criteria

1. WHEN the Auth_Callback_Route receives a `code` query parameter and the code exchange succeeds, THE Auth_Callback_Route SHALL derive user identity from the Session established by `supabase.auth.exchangeCodeForSession(code)` — never from URL parameters.
2. WHEN the Auth_Callback_Route has established a valid Session, THE Auth_Callback_Route SHALL query `public.users` for the authenticated user's `org_id` using the Supabase_Server_Client.
3. WHEN the authenticated user's `org_id` IS NULL (new user, no organization), THE Auth_Callback_Route SHALL redirect to `<NEXT_PUBLIC_SITE_URL>/onboarding`.
4. WHEN the authenticated user's `org_id` IS NOT NULL (returning user, organization established), THE Auth_Callback_Route SHALL redirect to `<NEXT_PUBLIC_SITE_URL>/dashboard`.
5. WHEN the `public.users` row does not exist for the authenticated user (first OAuth sign-in, profile row not yet created), THE Auth_Callback_Route SHALL treat the missing row as equivalent to `org_id IS NULL` and redirect to `<NEXT_PUBLIC_SITE_URL>/onboarding`.
6. THE Auth_Callback_Route SHALL NOT use the `next` query parameter or any other client-supplied URL as a redirect target — all routing decisions MUST be derived from the server-side Session and database state.

---

### Requirement 6: Auth Callback Route — Email Confirmation Flow Preservation

**User Story:** As a Qavro user who signed up via email, I want my existing email confirmation flow to continue working exactly as before, so that clicking my confirmation link still lands me on the success page.

#### Acceptance Criteria

1. THE Auth_Callback_Route SHALL preserve the existing redirect to `<NEXT_PUBLIC_SITE_URL>/auth/success` for email confirmation callbacks.
2. WHEN the Auth_Callback_Route can distinguish an email confirmation flow from an OAuth flow, THE Auth_Callback_Route SHALL route email confirmations to `/auth/success` and OAuth flows to `/onboarding` or `/dashboard` per Requirement 5.
3. WHERE the Supabase callback does not include a reliable flow-type signal, THE Auth_Callback_Route SHALL fall back to the org_id routing logic (Requirement 5 criteria 3–5), which is safe for both flows because a brand-new email-confirmed user also has no `org_id`.
4. IF the code exchange fails for any reason, THEN THE Auth_Callback_Route SHALL redirect to `<NEXT_PUBLIC_SITE_URL>/login?error=auth_callback_failed`.
5. IF the `getUser()` call after a successful exchange returns no user, THEN THE Auth_Callback_Route SHALL redirect to `<NEXT_PUBLIC_SITE_URL>/login?error=session_not_established`.

---

### Requirement 7: No Auth Bypass and Identity Security

**User Story:** As a Qavro system security officer, I want all OAuth sign-in paths to comply with the architecture constitution, so that no authentication checks are weakened or bypassed.

#### Acceptance Criteria

1. THE Auth_Callback_Route SHALL derive user identity exclusively from the Supabase session JWT returned by `exchangeCodeForSession` and `getUser()` — never from `user_id`, `email`, or `org_id` values passed as URL query parameters.
2. THE OAuthButtons component SHALL NOT store, log, or expose any token, secret, or session credential in the browser DOM, `localStorage`, or `sessionStorage`.
3. THE Auth_Callback_Route SHALL use the Supabase_Server_Client (SSR cookie-based client) for all server-side identity and profile queries — never the browser client.
4. THE OAuthButtons component SHALL use the Supabase_Client (browser client from `utils/supabase/client.ts`) exclusively for the `signInWithOAuth` call on the client side.
5. WHEN adding OAuth support, THE Auth_Callback_Route SHALL NOT remove, comment out, or weaken the existing `exchangeCodeForSession` error handling or `getUser()` identity re-derivation.

---

### Requirement 8: Existing Email/Password Auth Flows Unchanged

**User Story:** As an existing Qavro user who signs in with email and password, I want my login and signup flows to continue working exactly as they do today, so that adding OAuth buttons does not break anything I currently rely on.

#### Acceptance Criteria

1. WHEN a user submits the email/password form on the Login_Page, THE Login_Page SHALL continue to call `supabase.auth.signInWithPassword` and handle the response identically to the current implementation.
2. WHEN a user submits the email/password form on the Signup_Page, THE Signup_Page SHALL continue to call `supabase.auth.signUp` with `emailRedirectTo: ${siteUrl}/auth/callback` and handle the response identically to the current implementation.
3. THE Login_Page form validation, error display, and loading state behavior SHALL remain unchanged after the OAuthButtons component is integrated; partial changes to non-critical presentational behaviors are permissible provided the core validation, error-message, and submit-loading logic is unmodified.
4. THE Signup_Page core form validation (password length check, confirm-password match check) and error display SHALL remain unchanged after the OAuthButtons component is integrated; partial changes to non-critical presentational behaviors are permissible provided the core validation and error-message logic is unmodified.
5. THE proxy middleware (`proxy.ts`) SHALL NOT be modified as part of this feature — the existing session-cookie-based routing for authenticated users hitting `/login` or `/signup` already handles OAuth sessions correctly.
