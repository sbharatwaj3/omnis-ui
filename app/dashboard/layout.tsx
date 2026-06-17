// omnis-ui/app/dashboard/layout.tsx
// Dashboard Subscription Gate — async Server Component Layout
//
// Wraps ALL routes under /dashboard via Next.js route-segment layout nesting.
// Every request to /dashboard or any sub-route (settings, integration, setup)
// passes through this gate before the page component renders.
//
// Gate logic (in order):
//   1. No authenticated session         → redirect /login?next=/dashboard
//   2. No org_id in users table         → redirect /onboarding
//   3. org_id === ADMIN_ORG_ID          → allow (admin bypass, skip sub check)
//   4. subscription_status active|trialing → allow
//   5. Anything else (past_due, canceled, null) → redirect /pricing
//
// SECURITY: Session verification uses the anon-key session client (createClient).
//           Subscription status is read via adminClient (service-role) to bypass
//           the RBAC-gated RLS policy on organizations. The org_id scoping ensures
//           a user can only read their own org's subscription record.
//
// CONSTITUTION LAW II: All secrets loaded via process.env — never hardcoded.
//           ADMIN_ORG_ID below is a UUID placeholder, NOT a secret.

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ── Admin bypass ────────────────────────────────────────────────────────────
// ADMIN_ORG_ID is loaded from process.env (never hardcoded) so that the admin
// org UUID is configurable per deployment without a code change or commit.
// Set ADMIN_ORG_ID in .env.local (development) and in the Vercel/Render
// environment variables panel (production). If the variable is not set, the
// bypass is disabled — all orgs must pass the subscription check.
// CONSTITUTION LAW II: All secrets and deployment-specific values via process.env.
const ADMIN_ORG_ID = process.env.ADMIN_ORG_ID ?? "";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ── Step 1: Verify authenticated session ──────────────────────────────────
  // createClient() rehydrates the session from the request cookie.
  // auth.getUser() is the only call that verifies the JWT with Supabase's
  // auth server — use it (not getSession) for security-critical checks.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  // ── Step 2: Resolve org_id ────────────────────────────────────────────────
  // The users table RLS policy allows auth.uid() = user_id reads with the
  // session client — no need for adminClient here.
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) {
    redirect("/onboarding");
  }

  const orgId: string = profile.org_id;

  // ── Step 3: Admin bypass ──────────────────────────────────────────────────
  // Designated admin org bypasses subscription check entirely.
  if (orgId === ADMIN_ORG_ID) {
    return <>{children}</>;
  }

  // ── Step 4: Check subscription_status ────────────────────────────────────
  // Use adminClient (service-role) to bypass the RBAC-gated RLS policy on
  // organizations. The org_id filter ensures we only read this org's record.
  // FAIL-CLOSED: any error (network, Supabase down, missing row) is treated
  // the same as a denied subscription — redirect to /pricing immediately.
  const { data: org, error: orgError } = await adminClient
    .from("organizations")
    .select("subscription_status")
    .eq("org_id", orgId)
    .single();

  // If the DB query fails for any reason, deny access rather than grant it.
  if (orgError) {
    console.error("[DashboardLayout] Failed to resolve subscription_status:", orgError.message);
    redirect("/pricing");
  }

  const status = org?.subscription_status;

  // ── Step 5: Gate decision ─────────────────────────────────────────────────
  // STRICT ALLOWLIST: only 'active' or 'trialing' passes.
  // Everything else — 'past_due', 'canceled', null, undefined, any unknown
  // value, or a DB error (handled above) — redirects to /pricing.
  if (status === "active" || status === "trialing") {
    return <>{children}</>;
  }

  // Deny: past_due, canceled, null/undefined/unknown — send to pricing page.
  redirect("/pricing");
}
