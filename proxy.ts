// omnis-ui/proxy.ts
// The Gatekeeper — Next.js middleware (file is named proxy.ts per project convention).
// Public routes:  /  (landing), /login, /signup
// Protected routes: /dashboard, /logs/*, /readiness
// Unauthenticated requests to protected routes are redirected to /login.
// Authenticated users hitting /login or /signup are bounced to /dashboard.
// Refreshes expired Supabase sessions on every request so that
// Server Components always receive a valid session from cookies().

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

  // "/" is the public marketing landing page — never redirect it.
  // Auth-required routes are /dashboard, /logs/*, and /readiness.
  const isProtected =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/logs") ||
    pathname.startsWith("/readiness");
  const isLoginPage = pathname === "/login";
  const isSignupPage = pathname === "/signup";

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated users visiting /login or /signup go straight to the dashboard.
  if ((isLoginPage || isSignupPage) && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
