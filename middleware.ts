// omnis-ui/middleware.ts
// Omnis RegOps — Next.js Edge Middleware
//
// Responsibilities:
//   1. Refresh the Supabase session cookie on every request (SSR session sync).
//   2. Guard protected routes — unauthenticated requests are redirected to
//      /login?next=<original-path> so users land back where they intended
//      after signing in.
//   3. Redirect already-authenticated users away from /login and /signup to
//      /dashboard so they don't see the auth pages unnecessarily.
//
// CONSTITUTION LAW II: All secrets are loaded via process.env — never hardcoded.
// CONSTITUTION LAW (NO AUTH BYPASSING): This middleware refreshes cookies and
// enforces protected-route guards. It does NOT bypass verify_jwt or HMAC checks
// on the API layer — those are the omnis-api concern.

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Routes that require an authenticated session.
const PROTECTED_PREFIXES = ["/dashboard", "/readiness", "/logs"];

// Auth routes — redirect authenticated users away from these.
const AUTH_ROUTES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Create a Supabase client that can read/write cookies in the middleware
  // edge context. The setAll callback writes refreshed session cookies back
  // into the response so they reach the browser.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // First, apply cookies to the request (needed for subsequent reads
          // within the same middleware pass).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Rebuild supabaseResponse so it includes all original response
          // properties plus the new cookies.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() is preferred over getSession() in middleware because
  // it validates the JWT with the Supabase Auth server on every request,
  // preventing spoofed session cookies from bypassing the guard.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Guard: protected routes ───────────────────────────────────────────────
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !user) {
    // Preserve the intended destination so AuthForm can redirect back after login.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Guard: auth routes for authenticated users ────────────────────────────
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  if (isAuthRoute && user) {
    // Already signed in — send to dashboard instead of showing login/signup.
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  // Return the (potentially cookie-refreshed) response for all other routes.
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     *  - public assets (svg, png, jpg, gif, webp)
     *
     * This is the Supabase-recommended matcher pattern for SSR session refresh.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
