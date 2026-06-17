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
// Replace "REPLACE_ME_WITH_ADMIN_ORG_ID" with the actual admin org UUID before
// deploying to production. This is a UUID (not a secret key) — safe to commit
// once set to the real value. Until replaced, the bypass is effectively disabled
// because no real org_id will match this literal string.
const ADMIN_ORG_ID = "REPLACE_ME_WITH_ADMIN_ORG_ID";

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
  const { data: org } = await adminClient
    .from("organizations")
    .select("subscription_status")
    .eq("org_id", orgId)
    .single();

  const status = org?.subscription_status;

  // ── Step 5: Gate decision ─────────────────────────────────────────────────
  // Allow: active subscription or within the free trial window.
  // The DB DEFAULT for new orgs is 'trialing', so new sign-ups get access
  // automatically without needing to complete a payment first.
  if (status === "active" || status === "trialing") {
    return <>{children}</>;
  }

  // Deny: past_due, canceled, null/undefined — send to pricing page.
  redirect("/pricing");
}
