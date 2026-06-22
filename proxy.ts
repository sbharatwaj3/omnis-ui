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
//   /logs/*, and /readiness until they create or join an organization.
//   Once org_id is set, /onboarding redirects to /dashboard automatically.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
  const isSetupPage  = pathname === "/dashboard/setup";
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

      // ── CLI Setup Gate ────────────────────────────────────────────────────
      // ROLE-BASED GATE: Only users with the 'developer' role are required to
      // complete the CLI download / first-log flow before accessing the main
      // dashboard. Admin, QA Manager, and Viewer roles bypass this gate and
      // go directly to the compliance dashboard — they do not use the CLI.
      //
      // If the org has zero evidence logs AND the user is a developer AND they
      // are NOT already on /dashboard/setup, redirect to the setup page.
      // The setup page itself, settings, and integration sub-routes are
      // exempted so the user can generate an API key without a redirect loop.
      const isSetupExempt =
        isSetupPage ||
        pathname === "/dashboard/settings" ||
        pathname.startsWith("/dashboard/settings/") ||
        pathname.startsWith("/dashboard/integration/");

      if (!isSetupExempt) {
        // Resolve role and log count using the service-role client to bypass
        // RBAC-gated RLS. The org_id scope ensures we only read this user's org.
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (!serviceRoleKey || !supabaseUrl) {
          console.error(
            "[proxy] FATAL: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not set. " +
            "Cannot perform setup gate check — bypassing to prevent false redirect."
          );
        } else {
          const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });

          // Step 1: Fetch the user's role in their org.
          const { data: roleRow } = await adminSupabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("org_id", profile.org_id)
            .single();

          const userRole = roleRow?.role as string | undefined;

          // Non-developer roles bypass the CLI gate entirely — they have no
          // need to install the CLI or ingest their first log.
          if (userRole !== "developer") {
            console.log(
              `[proxy] CLI setup gate — user=${user.id} role=${userRole ?? "none"} — bypassing (non-developer).`
            );
          } else {
            // Developer role: gate on zero evidence logs.
            const { count, error: countError } = await adminSupabase
              .from("evidence_logs")
              .select("log_id", { count: "exact", head: true })
              .eq("org_id", profile.org_id);

            console.log(
              `[proxy] CLI setup gate — user=${user.id} org_id=${profile.org_id} role=developer ` +
              `logCount=${count} error=${countError?.message ?? "none"} pathname=${pathname}`
            );

            if (countError) {
              console.error(
                `[proxy] evidence_logs count query failed for org ${profile.org_id}: ` +
                countError.message +
                " — bypassing setup gate to prevent false redirect loop."
              );
            } else if ((count ?? 0) === 0) {
              const setupUrl = request.nextUrl.clone();
              setupUrl.pathname = "/dashboard/setup";
              setupUrl.search = "";
              return NextResponse.redirect(setupUrl);
            }
          }
        }
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
