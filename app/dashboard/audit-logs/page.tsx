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
import { ShieldAlert } from "lucide-react";
import { SubpageHeader } from "@/components/subpage-header";
import { AuditLogsClient } from "@/components/audit-logs-client";
import { getAuditLogs } from "@/app/dashboard/requirements/actions";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AuditSkeleton() {
  return (
    <div className="overflow-hidden rounded border border-zinc-200 bg-white">
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
    <div className="flex flex-col items-center justify-center rounded border border-red-200 bg-red-50 py-16 text-center">
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
    <div className="flex flex-col min-h-full bg-zinc-50">
      <SubpageHeader
        title="Audit Logs"
        subtitle="Audit Trail · 21 CFR Part 11 Ledger"
        complianceText="21 CFR Part 11.10(e)"
      />

      <div className="w-full px-8 py-8">
        {/* Page heading */}
        <div className="mb-5 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-zinc-200 bg-white">
            <ShieldAlert className="h-4.5 w-4.5 text-zinc-600" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
              Audit Trail
            </h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Immutable, append-only record of all changes to requirements,
              mappings, and evidence logs. Read-only per 21 CFR Part 11.10(e).
            </p>
          </div>
        </div>

        {/* Compliance callout */}
        <div className="mb-5 rounded border border-blue-200 bg-blue-50 px-4 py-3">
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
      </div>
    </div>
  );
}
