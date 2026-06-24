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
import Link from "next/link";
import {
  ShieldCheck,
  Activity,
  ClipboardList,
} from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { SettingsMenu } from "@/components/settings-menu";
import { RoleBadge } from "@/components/role-badge";
import { RequirementsClient } from "@/components/requirements-client";
import {
  listRequirements,
  listRegulatoryClauses,
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
  const [reqResult, clauseResult, userRole] = await Promise.all([
    listRequirements(),
    listRegulatoryClauses(),
    resolveUserRole(),
  ]);

  return (
    <RequirementsClient
      initialRequirements={reqResult.requirements}
      clauses={clauseResult.clauses}
      userRole={userRole}
    />
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function RequirementsSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
        <div className="space-y-1.5">
          <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
          <div className="h-3 w-56 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded-lg bg-zinc-200" />
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
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-4 md:px-8 md:py-5">
          {/* Left: logo */}
          <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
            <ShieldCheck
              className="h-5 w-5 md:h-6 md:w-6 text-zinc-800"
              strokeWidth={1.75}
            />
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-zinc-900">
                Omnis RegOps
              </h1>
              <p className="hidden sm:block text-xs text-zinc-400">
                Requirements Management · SRS Registry
              </p>
            </div>
          </Link>

          {/* Centre: back to Dashboard */}
          <div className="hidden sm:flex flex-1 justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
            >
              ← Back to Dashboard
            </Link>
          </div>

          {/* Right: compliance badge + role badge + settings */}
          <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                IEC 62304 · FDA 820.30(c)
              </span>
            </span>
            <RoleBadge />
            <SettingsMenu />
          </div>
        </div>

        {/* Mobile sub-bar */}
        <div className="flex sm:hidden border-t border-zinc-100 px-4 py-2">
          <Link
            href="/dashboard"
            className="flex-1 text-center rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
        {/* Page heading */}
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm">
            <ClipboardList className="h-4.5 w-4.5 text-zinc-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
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
