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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

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

  // Check whether the user has already completed onboarding (has an org_id).
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  // Users with no org_id are new — route them to onboarding.
  // Users already in an org go directly to the dashboard.
  const destination = profile?.org_id ? "/dashboard" : "/onboarding";

  return NextResponse.redirect(`${origin}${destination}`);
}
