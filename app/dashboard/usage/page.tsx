// omnis-ui/app/dashboard/usage/page.tsx
// Token Usage Dashboard — Server Component
//
// CONSTITUTION LAW II:
//   - Identity derived exclusively from the verified Supabase JWT.
//   - Org_ID is NEVER taken from URL parameters, query strings, or request body.
//   - All data queries use adminClient (service role) with explicit org_id scope.
//   - `force-dynamic` ensures every request reflects live Supabase state (Req 8.1).
//
// IEC 62304 / 21 CFR Part 11:
//   - Auth failures redirect to /login; role violations render <AccessDenied>.
//   - DashboardHeader is always rendered regardless of data errors (Req 9.5).
//   - Errors are scoped per section — gauge error does not suppress leaderboard.
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { UsageGaugeCard } from "@/components/usage/usage-gauge-card";
import { UsageClient } from "@/components/usage/usage-client";
import { UsagePageSkeleton } from "@/components/usage/usage-skeleton";
import { getOrgQuota, getDeveloperUsage } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Access-denied component (Req 1.3) — no token data in payload
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="bg-card border border-border rounded p-6 text-center">
      <p className="text-sm text-destructive">
        ⚠ You do not have permission to view token usage data.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async content — auth gate, role gate, parallel data fetch
// ---------------------------------------------------------------------------

async function UsagePageContent() {
  // Step 1: Verify JWT (Req 1.1)
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // Step 2: Resolve org_id from JWT via adminClient — never from URL (Req 1.5)
  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    redirect("/login");
  }

  const orgId = profile.org_id as string;

  // Step 3: Resolve role (Req 1.1, 1.4)
  const { data: roleRow, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (roleError || !roleRow) {
    redirect("/login");
  }

  const role = roleRow.role as string;

  // Step 4: Role gate — admin | qa_manager only (Req 1.2, 1.3)
  if (role !== "admin" && role !== "qa_manager") {
    return <AccessDenied />;
  }

  // Step 5: Parallel fetch — gauge + initial 30-day leaderboard
  const [quotaResult, usageResult] = await Promise.all([
    getOrgQuota(),
    getDeveloperUsage({ timeFilter: "30d" }),
  ]);

  const initialRows = usageResult.data ?? [];

  return (
    <div className="space-y-6">
      {/* Section: Org Quota Gauge — admin only per spec design (Req 2.1) */}
      {role === "admin" && (
        <section>
          <h2 className="text-2xl font-medium text-foreground mb-4">
            Organization Quota
          </h2>
          <UsageGaugeCard result={quotaResult} />
        </section>
      )}

      {/* Section: Developer Leaderboard — admin | qa_manager (Req 3.11) */}
      <section>
        <h2 className="text-2xl font-medium text-foreground mb-4">
          Developer Token Usage
        </h2>
        {usageResult.error ? (
          <div className="bg-card border border-border rounded p-6">
            <p className="text-sm text-destructive">
              ⚠ {usageResult.error.message}
            </p>
          </div>
        ) : (
          <UsageClient initialRows={initialRows} initialFilter="30d" />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default async function UsagePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* DashboardHeader always rendered regardless of data errors (Req 9.5) */}
      <DashboardHeader
        subtitle="Token Usage · AI Bedrock Telemetry"
        complianceText="AWS Bedrock · Token Telemetry"
      />

      <main className="mx-auto max-w-screen-2xl w-full px-6 py-6 md:px-8 md:py-10">
        <Suspense fallback={<UsagePageSkeleton />}>
          <UsagePageContent />
        </Suspense>
      </main>
    </div>
  );
}
