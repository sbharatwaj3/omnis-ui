// omnis-ui/app/auth/callback/route.ts
// Supabase Auth Callback Handler
//
// This route is the server-side landing point for all Supabase redirect flows:
//   - Email confirmation ("Confirm your email address" link)
//   - OAuth provider callbacks (if added in future)
//   - Magic link sign-ins (if enabled)
//
// Flow:
//   1. Extract the `code` query parameter Supabase appends to the callback URL.
//   2. Exchange the code for a session via exchangeCodeForSession().
//   3. Route the user based on their onboarding state:
//        - org_id IS NULL  → /onboarding  (new user, needs to join/create org)
//        - org_id IS SET   → /dashboard   (returning user, resume session)
//   4. On any error → /login with error indicator.
//
// SECURITY: Identity is derived from the exchanged session, never from URL params.
// CONSTITUTION LAW II: No secrets hardcoded — all env access via process.env.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { waitForUserProfile, MAX_POLL_ATTEMPTS } from "@/utils/supabase/waitForUserProfile";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  // Prefer NEXT_PUBLIC_SITE_URL so Vercel preview deployments don't inject
  // their ephemeral preview origin into auth redirects. Falls back to the
  // request origin only if the env var is not set.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? requestUrl.origin;

  // If no code is present the user navigated here directly — send them to login.
  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignored — the middleware will handle cookie refresh.
          }
        },
      },
    },
  );

  // Exchange the one-time auth code for a persistent session cookie.
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[auth/callback] exchangeCodeForSession error:", exchangeError.message);
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  // Re-derive user identity from the newly established session.
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[auth/callback] getUser after exchange failed:", userError?.message);
    return NextResponse.redirect(`${origin}/login?error=session_not_established`);
  }

  // Determine the flow type from the callback URL.
  const type = requestUrl.searchParams.get("type");

  // Email-confirmation and password-recovery flows → static success page.
  // These links are commonly opened in a different browser/tab than the one
  // used to sign up, causing cross-tab session desync. The /auth/success page
  // is a self-contained dead-end that tells the user their email is confirmed
  // and to return to their original window.
  if (type === "signup" || type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/success`);
  }

  // OAuth flow: derive routing destination from the user's org_id in the
  // database. Identity is always sourced from the session JWT (getUser above),
  // never from URL parameters.

  // Bounded-poll: retry the public.users SELECT up to MAX_POLL_ATTEMPTS times
  // with exponential back-off to resolve pgBouncer connection-pool lag where
  // the on_auth_user_created trigger-written stub row may not yet be visible.
  const userProfile = await waitForUserProfile(supabase, user.id);

  if (userProfile === null) {
    // All poll attempts exhausted — row not found after MAX_POLL_ATTEMPTS tries.
    // IEC 62304 fail-loud: log structured error, redirect loudly.
    // NEVER silently misdirect to /onboarding when the row is absent.
    console.error(
      "[auth/callback] profile_unavailable: public.users row not found after",
      MAX_POLL_ATTEMPTS,
      "attempts for user", user.id
    );
    return NextResponse.redirect(`${origin}/login?error=profile_unavailable`);
  }

  if (userProfile.org_id) {
    // Returning user with an organisation — go to the app dashboard.
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // New user or user whose org_id is not yet set — needs onboarding.
  return NextResponse.redirect(`${origin}/onboarding`);
}
