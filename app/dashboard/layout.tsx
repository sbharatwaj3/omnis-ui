// omnis-ui/app/dashboard/layout.tsx
// Dashboard Subscription Gate + Command Center Shell — async Server Component Layout
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
// Command Center Shell:
//   After the gate passes, children are rendered inside the full-height
//   AppSidebar + main content shell instead of a bare <div>.
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
import { getPendingCount } from "@/app/dashboard/triage/actions";
import { TriageBadge } from "@/components/triage-badge";
import { DashboardShell } from "@/components/dashboard-shell";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  // ── Step 2: Resolve org_id ────────────────────────────────────────────────
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
  if (orgId === ADMIN_ORG_ID) {
    const { count: pendingCount } = await getPendingCount();
    return (
      <DashboardShell role="admin" pendingCount={pendingCount ?? 0}>
        {children}
      </DashboardShell>
    );
  }

  // ── Step 4: Resolve the user's RBAC role ──────────────────────────────────
  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  const role = roleRow?.role ?? null;

  // Non-admin joined members bypass the pricing gate entirely.
  if (role && role !== "admin") {
    const { count: pendingCount } = await getPendingCount();
    return (
      <DashboardShell role={role} pendingCount={pendingCount ?? 0}>
        {children}
      </DashboardShell>
    );
  }

  // ── Step 5: Admin checkout gate ──────────────────────────────────────────
  const { data: org, error: orgError } = await adminClient
    .from("organizations")
    .select("subscription_status, stripe_customer_id")
    .eq("org_id", orgId)
    .single();

  if (orgError) {
    console.error("[DashboardLayout] Failed to resolve subscription:", orgError.message);
    redirect("/pricing");
  }

  const status = org?.subscription_status;
  const hasCompletedCheckout = !!org?.stripe_customer_id;

  // ── Step 6: Gate decision (admin only) ────────────────────────────────────
  if (
    status === "active" ||
    (status === "trialing" && hasCompletedCheckout)
  ) {
    const { count: pendingCount } = await getPendingCount();
    return (
      <DashboardShell role={role ?? "admin"} pendingCount={pendingCount ?? 0}>
        {children}
      </DashboardShell>
    );
  }

  redirect("/pricing");
}
