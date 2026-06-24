// omnis-ui/app/dashboard/triage/page.tsx
// AI Triage Queue — Server Component page.
//
// Fetches pending triage items server-side and passes them to the client
// component for interactive rendering. Accessible only to admin/qa_manager
// roles (enforced in the Server Action; this page provides no auth bypass).
//
// force-dynamic: every request fetches a fresh snapshot so that items
// resolved by other QA reviewers are reflected immediately.

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { ShieldCheck, Activity, Brain } from "lucide-react";
import { getPendingTriageItems } from "@/app/dashboard/triage/actions";
import { TriageQueueClient } from "@/components/triage-queue-client";
import { SettingsMenu } from "@/components/settings-menu";
import { RoleBadge } from "@/components/role-badge";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TriageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content — async server component streamed inside Suspense
// ---------------------------------------------------------------------------

async function TriageContent() {
  const { items, error } = await getPendingTriageItems();

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-12 text-center">
        <Brain className="mb-3 h-8 w-8 text-red-300" strokeWidth={1.25} />
        <p className="text-sm font-semibold text-red-700">
          Could not load triage queue
        </p>
        <p className="mt-1 text-xs text-red-500">{error}</p>
      </div>
    );
  }

  return <TriageQueueClient initialItems={items} />;
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function TriagePage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl w-full items-center px-6 py-4 md:px-8 md:py-5">
          {/* Left: logo */}
          <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
            <ShieldCheck
              className="h-5 w-5 md:h-6 md:w-6 text-zinc-800"
              strokeWidth={1.75}
            />
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-zinc-900">
                QAVRO
              </h1>
              <p className="hidden sm:block text-xs text-zinc-400">
                FDA Assurance Dashboard · Live
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

          {/* Right: status badge + role + settings */}
          <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
            <span className="hidden md:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-zinc-600">
                IEC 62304 · 21 CFR Part 11
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
            className="flex-1 text-center rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-screen-2xl w-full px-6 py-6 md:px-8 md:py-10">
        {/* Page header */}
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Brain className="h-5 w-5 text-amber-500" strokeWidth={1.75} />
              <h2 className="text-xl font-bold tracking-tight text-zinc-900">
                AI Triage Inbox
              </h2>
            </div>
            <p className="mt-0.5 text-sm text-zinc-500">
              Review and resolve requirement tag discrepancies flagged by Claude
              during compliance analysis.
            </p>
          </div>
        </div>

        {/* Guidance banner */}
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-amber-700">
            <span className="font-semibold">How this works:</span> When
            Claude&apos;s AI analysis disagrees with the regulatory tag a developer
            applied to an evidence log, it flags the discrepancy here.{" "}
            <span className="font-semibold">Approve AI Fix</span> re-tags the
            original log to the AI&apos;s suggestion.{" "}
            <span className="font-semibold">Reject / Keep Original</span>{" "}
            dismisses the flag and preserves the developer&apos;s tag.
          </p>
        </div>

        {/* Queue */}
        <Suspense fallback={<TriageSkeleton />}>
          <TriageContent />
        </Suspense>
      </main>
    </div>
  );
}
