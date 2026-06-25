// omnis-ui/app/dashboard/usage/page.tsx
// Team AI Usage — Per-Developer Bedrock Token Telemetry
//
// React Server Component. Calls getDeveloperUsage() server-side and renders
// a leaderboard table of developer token consumption for the caller's org.
//
// force-dynamic: disables Next.js static/ISR caching so every request
// reflects the live Supabase state.
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Activity,
  BarChart2,
  ShieldAlert,
} from "lucide-react";
import { SettingsMenu } from "@/components/settings-menu";
import { RoleBadge } from "@/components/role-badge";
import { getDeveloperUsage, type DeveloperUsageRow } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function UsageSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
        <div className="h-3 w-64 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="divide-y divide-zinc-100">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <div className="h-5 w-8 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 flex-1 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-28 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access-denied / error fallback
// ---------------------------------------------------------------------------

function UsageAccessDenied({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-16 text-center">
      <ShieldAlert
        className="mb-4 h-10 w-10 text-red-300"
        strokeWidth={1.25}
      />
      <p className="text-sm font-semibold text-red-700">Access Restricted</p>
      <p className="mt-1 max-w-sm text-xs text-red-500">{reason}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function UsageEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white py-16 text-center shadow-sm">
      <BarChart2
        className="mb-4 h-10 w-10 text-zinc-300"
        strokeWidth={1.25}
      />
      <p className="text-sm font-semibold text-zinc-600">No usage data yet.</p>
      <p className="mt-1 max-w-sm text-xs text-zinc-400">
        Upload your first evidence log via the CLI to begin tracking AI token
        consumption.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data table
// ---------------------------------------------------------------------------

function UsageTable({ rows }: { rows: DeveloperUsageRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      {/* Table header */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Rank
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Developer Email
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Logs Uploaded
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Total Tokens
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row, index) => {
              const rank = index + 1;
              const isFirst = rank === 1;
              return (
                <tr
                  key={row.developer_email}
                  className="transition-colors hover:bg-zinc-50/60"
                >
                  {/* Rank */}
                  <td className="px-6 py-3.5 text-left">
                    {isFirst ? (
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                        #1
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-zinc-400">
                        #{rank}
                      </span>
                    )}
                  </td>

                  {/* Developer email */}
                  <td className="px-6 py-3.5">
                    <span
                      className={
                        isFirst
                          ? "text-sm font-semibold text-zinc-900"
                          : "text-sm text-zinc-700"
                      }
                    >
                      {row.developer_email}
                    </span>
                  </td>

                  {/* Logs uploaded */}
                  <td className="px-6 py-3.5 text-right">
                    <span className="text-sm tabular-nums text-zinc-700">
                      {row.total_logs_uploaded.toLocaleString()}
                    </span>
                  </td>

                  {/* Total tokens */}
                  <td className="px-6 py-3.5 text-right">
                    <span
                      className={
                        isFirst
                          ? "text-sm font-semibold tabular-nums text-violet-700"
                          : "text-sm tabular-nums text-zinc-700"
                      }
                    >
                      {row.total_tokens_consumed.toLocaleString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer summary */}
      <div className="border-t border-zinc-100 bg-zinc-50 px-6 py-2.5">
        <p className="text-xs text-zinc-400">
          {rows.length} developer{rows.length !== 1 ? "s" : ""} ·{" "}
          {rows
            .reduce((sum, r) => sum + r.total_logs_uploaded, 0)
            .toLocaleString()}{" "}
          total logs ·{" "}
          {rows
            .reduce((sum, r) => sum + r.total_tokens_consumed, 0)
            .toLocaleString()}{" "}
          total tokens consumed
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async content — fetches data server-side, streamed into Suspense
// ---------------------------------------------------------------------------

async function UsageContent() {
  const { rows, error } = await getDeveloperUsage();

  if (error) {
    return <UsageAccessDenied reason={error} />;
  }

  if (rows.length === 0) {
    return <UsageEmptyState />;
  }

  return <UsageTable rows={rows} />;
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default async function UsagePage() {
  // Resolve user identity and role server-side before rendering content.
  // Step 1: Verify identity via the session client (JWT verification).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Step 2: Resolve org_id via adminClient to bypass RBAC-gated RLS.
  let userRole: string | null = null;
  if (user) {
    const { data: profile } = await adminClient
      .from("users")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    if (profile?.org_id) {
      // Step 3: Resolve role scoped to (user_id, org_id).
      const { data: roleRow } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", profile.org_id)
        .single();

      userRole = roleRow?.role ?? null;
    }
  }

  const isAdmin = userRole === "admin";
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl w-full items-center px-6 py-4 md:px-8 md:py-5">
          {/* Left: logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 group shrink-0"
          >
            <ShieldCheck
              className="h-5 w-5 md:h-6 md:w-6 text-zinc-800"
              strokeWidth={1.75}
            />
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-zinc-900">
                QAVRO
              </h1>
              <p className="hidden sm:block text-xs text-zinc-400">
                Team AI Usage · Token Telemetry
              </p>
            </div>
          </Link>

          {/* Centre: back to hub */}
          <div className="hidden sm:flex flex-1 justify-center items-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-sm font-semibold text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
            >
              Back to Dashboard
            </Link>
          </div>

          {/* Right: compliance badge + role badge + settings */}
          <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                AWS Bedrock · Token Telemetry
              </span>
            </span>
            <RoleBadge />
            <SettingsMenu />
          </div>
        </div>

        {/* Mobile sub-bar */}
        <div className="flex sm:hidden border-t border-zinc-100 px-4 py-2 gap-2">
          <Link
            href="/dashboard"
            className="flex-1 text-center rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main                                                                */}
      {/* ------------------------------------------------------------------ */}
      <main className="mx-auto max-w-screen-2xl w-full px-6 py-6 md:px-8 md:py-10">
        {/* Page heading */}
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm">
            <BarChart2 className="h-4.5 w-4.5 text-zinc-600" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">
              Team AI Usage
            </h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Monitor per-developer Bedrock token consumption and CLI upload
              activity.
            </p>
          </div>
        </div>

        {/* Data table — streamed via Suspense */}
        {isAdmin ? (
          <Suspense fallback={<UsageSkeleton />}>
            <UsageContent />
          </Suspense>
        ) : (
          <UsageAccessDenied reason="Forbidden: Team AI Usage is restricted to Admin accounts." />
        )}
      </main>
    </div>
  );
}
