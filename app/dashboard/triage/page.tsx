// omnis-ui/app/dashboard/triage/page.tsx
//
// AI Triage Queue — Server Component page.
//
// CONSTITUTION LAW (§VII):
//   - Identity and org_id are re-derived from the Supabase server-side JWT.
//   - Viewer role is redirected to /dashboard at the page level.
//   - Unauthenticated users are redirected to /login?next=/dashboard/triage.
//   - force-dynamic: every request fetches a fresh snapshot.
//
// Layout: two-column CSS Grid at ≥lg breakpoint.
//   Left column  — max-w-5xl centered feed (the Triage Queue)
//   Right column — sticky sidebar (TriageStatsSidebar: counts + health)
//
// Visual refresh (MedTech Slate):
//   - Page canvas: bg-slate-900 (softer than pure bg-gray-950)
//   - Cards: bg-slate-800 surface, border-slate-700 hairline
//
// Requirements satisfied: 1.6, 1.7, 1.8, 10.4, 10.5, 11.1, 12.5

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { getPendingTriageItems } from "@/app/dashboard/triage/actions";
import { TriageQueueClient } from "@/components/triage-queue-client";
import { TriageSkeleton } from "@/components/triage-skeleton";
import { DashboardHeader } from "@/components/dashboard-header";
import { TriageStatsSidebar } from "@/components/triage-stats-sidebar";

// ---------------------------------------------------------------------------
// Timeout sentinel — used by TriageContent to cap the fetch at 10 seconds
// ---------------------------------------------------------------------------

const TIMEOUT_SENTINEL = "TIMEOUT" as const;

// ---------------------------------------------------------------------------
// TriageContent — async Server Component streamed inside Suspense
// ---------------------------------------------------------------------------

async function TriageContent({
  viewerRole,
}: {
  viewerRole: "qa_manager" | "admin" | "developer";
}) {
  const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) =>
    setTimeout(() => resolve(TIMEOUT_SENTINEL), 10_000)
  );

  const result = await Promise.race([
    getPendingTriageItems(),
    timeoutPromise,
  ]);

  // Timeout path — Requirement 10.5
  if (result === TIMEOUT_SENTINEL) {
    return (
      <div className="border border-red-700 bg-slate-800 rounded-sm px-5 py-4">
        <p className="text-sm text-red-400">
          Loading triage queue timed out. Please refresh the page.
        </p>
      </div>
    );
  }

  const { items, error } = result;

  // Database error path — Requirement 1.4
  if (error) {
    return (
      <div className="border border-red-700 bg-slate-800 rounded-sm px-5 py-4">
        <p className="text-sm font-medium text-red-400">Could not load triage queue</p>
        <p className="mt-1 text-xs text-red-500">Please try again later.</p>
      </div>
    );
  }

  return <TriageQueueClient initialItems={items} viewerRole={viewerRole} />;
}

// ---------------------------------------------------------------------------
// TriagePage — page export
// ---------------------------------------------------------------------------

export default async function TriagePage() {
  // -------------------------------------------------------------------------
  // Auth: derive identity from the server-side Supabase session.
  // Never trust client-supplied parameters for identity or org resolution.
  // -------------------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Requirement 1.8 — unauthenticated → redirect to login
  if (!user) {
    redirect("/login?next=/dashboard/triage");
  }

  // Resolve org_id from the users table (never from client params)
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) {
    redirect("/login?next=/dashboard/triage");
  }

  // Resolve RBAC role via adminClient (bypasses RLS; org guard is explicit)
  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", profile.org_id)
    .single();

  const role = roleRow?.role ?? null;

  // Requirement 1.6 — viewer → redirect to /dashboard
  if (role === "viewer") {
    redirect("/dashboard");
  }

  // Cast to the union type accepted by TriageQueueClient
  const viewerRole = (role ?? "developer") as "qa_manager" | "admin" | "developer";

  // -------------------------------------------------------------------------
  // Render — MedTech Slate visual refresh (Requirement 11.1)
  // Two-column layout: centered feed (max-w-5xl) + sticky sidebar
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-900">
      <DashboardHeader subtitle="FDA Assurance Dashboard · Live" />

      <main className="mx-auto max-w-screen-xl w-full px-6 py-6 md:px-8 md:py-10">
        {/* Page header ───────────────────────────────────────────────────── */}
        {/* Requirement 12.5 — visible <h1> landmark heading */}
        <h1 className="text-xl font-semibold text-slate-100 mb-1">
          AI Triage Inbox
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Review and resolve requirement tag discrepancies flagged by AWS Bedrock.
        </p>

        {/* Two-column layout: feed + sidebar ─────────────────────────────── */}
        {/* On <lg screens stacks vertically (sidebar below feed) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

          {/* ── Left: triage feed, width-constrained ───────────────────── */}
          <div className="min-w-0">
            {/* Triage queue — streamed inside Suspense with skeleton fallback */}
            <Suspense fallback={<TriageSkeleton />}>
              <TriageContent viewerRole={viewerRole} />
            </Suspense>
          </div>

          {/* ── Right: sticky stats sidebar ────────────────────────────── */}
          <Suspense
            fallback={
              <div className="border border-slate-700 bg-slate-800 rounded-sm p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded-sm w-1/2 mb-3" />
                <div className="h-3 bg-slate-700 rounded-sm w-full mb-2" />
                <div className="h-3 bg-slate-700 rounded-sm w-3/4" />
              </div>
            }
          >
            <TriageStatsSidebar />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
