// omnis-ui/proxy.ts
// The Gatekeeper — Next.js middleware (file is named proxy.ts per project convention).
// Public routes:  /  (landing), /login, /signup
// Protected routes: /dashboard, /logs/*, /readiness, /onboarding
// Unauthenticated requests to protected routes are redirected to /login.
// Authenticated users hitting /login or /signup are bounced based on profile state.
// Refreshes expired Supabase sessions on every request so that
// Server Components always receive a valid session from cookies().
//
// ONBOARDING GATE:
//   After login, if public.users.org_id IS NULL the user is in a "pending"
//   state. They are forced onto /onboarding and blocked from /dashboard,
//   /logs/*, and /readiness until they create or join an organisation.
//   Once org_id is set, /onboarding redirects to /dashboard automatically.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Build a Supabase client that reads/writes cookies on the request/response.
  // The cookie setAll handler MUST update supabaseResponse so the refreshed
  // session token is forwarded to the browser and downstream Server Components.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not add any logic between createServerClient and
  // getUser(). Doing so breaks session refresh for all Server Components.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Route classification
  const isProtected =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/logs") ||
    pathname.startsWith("/readiness");
  const isOnboarding = pathname === "/onboarding";
  const isLoginPage  = pathname === "/login";
  const isSignupPage = pathname === "/signup";

  // ── Unauthenticated ──────────────────────────────────────────────────────
  // Redirect unauthenticated users away from every protected route.
  if (!user && (isProtected || isOnboarding)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Authenticated — check onboarding state ───────────────────────────────
  if (user) {
    // Bounce /login and /signup to the appropriate next destination.
    // We defer the org_id check below for the proper redirect target.
    if (isLoginPage || isSignupPage) {
      // Fetch profile to decide where to land.
      const { data: profile } = await supabase
        .from("users")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      const isPending = !profile || profile.org_id === null;
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = isPending ? "/onboarding" : "/dashboard";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    // For all other authenticated requests hitting a protected app route,
    // check if the user is still pending onboarding.
    if (isProtected) {
      const { data: profile } = await supabase
        .from("users")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      const isPending = !profile || profile.org_id === null;
      if (isPending) {
        const onboardingUrl = request.nextUrl.clone();
        onboardingUrl.pathname = "/onboarding";
        onboardingUrl.search = "";
        return NextResponse.redirect(onboardingUrl);
      }
    }

    // An already-onboarded user landing on /onboarding is redirected to
    // /dashboard — no need to re-onboard.
    if (isOnboarding) {
      const { data: profile } = await supabase
        .from("users")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      const isOnboarded = profile && profile.org_id !== null;
      if (isOnboarded) {
        const dashboardUrl = request.nextUrl.clone();
        dashboardUrl.pathname = "/dashboard";
        dashboardUrl.search = "";
        return NextResponse.redirect(dashboardUrl);
      }
    }
  }

  return supabaseResponse;
}

// Next.js requires the middleware export to be named `middleware`.
// The implementation lives in `proxy` per project convention.
export { proxy as middleware };

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
