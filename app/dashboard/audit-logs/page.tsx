// omnis-ui/app/dashboard/audit-logs/page.tsx
// 21 CFR Part 11 Audit Trail — Read-Only Ledger View
//
// IMMUTABILITY MANDATE (21 CFR Part 11.10(e)):
//   This page is a LEGALLY IMMUTABLE READ-ONLY VIEW. There are no edit,
//   delete, update, or action buttons present on this page or in any
//   component it renders. Any future modification that introduces write
//   affordances to this route is a compliance violation.
//
// Access: admin and qa_manager only. The server action enforces this gate
// server-side; this page provides no additional auth bypass.
//
// force-dynamic: every request fetches a fresh snapshot. Audit records must
// reflect the live DB state — a cached stale view is not acceptable for
// compliance purposes.
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Activity,
  ShieldAlert,
} from "lucide-react";
import { SettingsMenu } from "@/components/settings-menu";
import { RoleBadge } from "@/components/role-badge";
import { AuditLogsClient } from "@/components/audit-logs-client";
import { getAuditLogs } from "@/app/dashboard/requirements/actions";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AuditSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
        <div className="h-3 w-72 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="divide-y divide-zinc-100">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-start gap-4 px-4 py-3">
            <div className="flex flex-col gap-1">
              <div className="h-3 w-20 animate-pulse rounded bg-zinc-200" />
              <div className="h-2.5 w-28 animate-pulse rounded bg-zinc-100" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
            <div className="h-5 w-20 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 flex-1 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access-denied fallback (shown when role gate blocks access)
// ---------------------------------------------------------------------------

function AuditAccessDenied({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-16 text-center">
      <ShieldAlert
        className="mb-4 h-10 w-10 text-red-300"
        strokeWidth={1.25}
      />
      <p className="text-sm font-semibold text-red-700">
        Access Restricted
      </p>
      <p className="mt-1 max-w-sm text-xs text-red-500">{reason}</p>
      <p className="mt-3 text-xs text-red-400">
        Audit trail access is limited to Admin and QA Manager roles under 21
        CFR Part 11.10(e).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async content — fetches first page of audit records server-side
// ---------------------------------------------------------------------------

const INITIAL_PAGE_SIZE = 100;

async function AuditContent() {
  const { logs, error } = await getAuditLogs(INITIAL_PAGE_SIZE, 0);

  if (error) {
    return <AuditAccessDenied reason={error} />;
  }

  return (
    <AuditLogsClient
      initialLogs={logs}
      // Pass a generous estimate; the client will set hasMore=false
      // when a Load More fetch returns < PAGE_SIZE rows.
      initialTotal={logs.length < INITIAL_PAGE_SIZE ? logs.length : logs.length + 1}
    />
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function AuditLogsPage() {
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
                Audit Trail · 21 CFR Part 11 Ledger
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

          {/* Right: compliance badge + role + settings */}
          <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                21 CFR Part 11.10(e)
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
        <div className="mb-5 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm">
            <ShieldAlert className="h-4.5 w-4.5 text-zinc-600" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">
              Audit Trail
            </h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Immutable, append-only record of all changes to requirements,
              mappings, and evidence logs. Read-only per 21 CFR Part 11.10(e).
            </p>
          </div>
        </div>

        {/* Compliance callout */}
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-blue-700">
            <span className="font-semibold">21 CFR Part 11.10(e):</span> This
            audit trail captures the date, time, and identity of every operator
            action that creates, modifies, or resolves electronic records. All
            entries are immutable — no record can be edited or deleted through
            any application interface.
          </p>
        </div>

        {/* Audit table */}
        <Suspense fallback={<AuditSkeleton />}>
          <AuditContent />
        </Suspense>
      </main>
    </div>
  );
}
