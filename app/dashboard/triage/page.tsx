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
import { Brain } from "lucide-react";
import { getPendingTriageItems } from "@/app/dashboard/triage/actions";
import { TriageQueueClient } from "@/components/triage-queue-client";
import { DashboardHeader } from "@/components/dashboard-header";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TriageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded border border-zinc-200 bg-zinc-50"
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
      <div className="flex flex-col items-center justify-center rounded border border-red-200 bg-red-50 py-12 text-center">
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
      <DashboardHeader subtitle="FDA Assurance Dashboard · Live" />

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
        <div className="mb-5 rounded border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="mb-2 text-xs font-semibold text-amber-800">How this works</p>
          <p className="text-xs leading-relaxed text-amber-700">
            When Claude&apos;s AI analysis disagrees with the regulatory tag a developer
            applied to an evidence log, it flags the discrepancy here for human review.
          </p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-amber-700">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Approve AI Fix
              </span>
              <span>Re-tags the original evidence log to the AI&apos;s suggested regulatory requirement.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                Reject / Keep Original
              </span>
              <span>Dismisses the flag and preserves the developer&apos;s original tag.</span>
            </li>
          </ul>
        </div>

        {/* Queue */}
        <Suspense fallback={<TriageSkeleton />}>
          <TriageContent />
        </Suspense>
      </main>
    </div>
  );
}
