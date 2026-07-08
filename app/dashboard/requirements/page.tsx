// omnis-ui/app/dashboard/requirements/page.tsx
// Requirements Management Page — SRS/SDS traceability artefact registry.
//
// RSC (React Server Component). Fetches requirements and regulatory clauses
// server-side, resolves the user's RBAC role for the Add button gate, then
// passes everything to <RequirementsClient> for client-side interactivity.
//
// Auth gate: inherited from /dashboard/layout.tsx (subscription + session check).
// RBAC: role resolved here and passed to the client; write operations are also
//       gated server-side in actions.ts.
//
// force-dynamic: ensures every request gets a fresh snapshot from Supabase
// (no stale cache after a requirement is created).
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { DashboardHeader } from "@/components/dashboard-header";
import { RequirementsClient } from "@/components/requirements-client";
import {
  listRequirements,
  listRegulatoryRules,
} from "@/app/dashboard/requirements/actions";

// ---------------------------------------------------------------------------
// Role resolver — used to pass the current user's RBAC role to the client
// ---------------------------------------------------------------------------

async function resolveUserRole(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return null;

  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", profile.org_id)
    .single();

  return roleRow?.role ?? null;
}

// ---------------------------------------------------------------------------
// Page content — async server component, streamed into Suspense
// ---------------------------------------------------------------------------

async function RequirementsContent() {
  const [reqResult, rulesResult, userRole] = await Promise.all([
    listRequirements(),
    listRegulatoryRules(),
    resolveUserRole(),
  ]);

  return (
    <RequirementsClient
      initialRequirements={reqResult.requirements}
      rules={rulesResult.rules}
      userRole={userRole}
    />
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function RequirementsSkeleton() {
  return (
    <div className="rounded border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
        <div className="space-y-1.5">
          <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
          <div className="h-3 w-56 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="divide-y divide-zinc-100">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <div className="h-5 w-20 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 flex-1 animate-pulse rounded bg-zinc-100" />
            <div className="hidden md:block h-3 w-48 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-28 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function RequirementsPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <DashboardHeader
        subtitle="Requirements Management · SRS Registry"
        complianceText="IEC 62304 · FDA 820.30(c)"
      />

      <main className="mx-auto max-w-screen-2xl w-full px-6 py-6 md:px-8 md:py-10">
        {/* Page heading */}
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-200 bg-white">
            <ClipboardList className="h-4.5 w-4.5 text-zinc-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Requirements Management
            </h1>
            <p className="mt-0.5 text-sm text-zinc-400">
              Capture and map SRS/SDS requirements to regulatory clauses for bidirectional
              traceability per IEC 62304 §5.2.6 and FDA 21 CFR 820.30(c).
            </p>
          </div>
        </div>

        <Suspense fallback={<RequirementsSkeleton />}>
          <RequirementsContent />
        </Suspense>
      </main>
    </div>
  );
}
