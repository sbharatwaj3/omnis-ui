// omnis-ui/components/triage-stats-sidebar.tsx
//
// TriageStatsSidebar — sticky right-hand panel for the Triage Inbox page.
//
// Renders high-level system stats (pending / approved / rejected counts)
// and a system health indicator. Server Component — no interactivity needed.
//
// Design system compliance (QAVRO dark-canvas):
//   - bg-slate-800 surface, border border-slate-700 hairline
//   - rounded-sm (4px max), no shadow-*
//   - font-mono for all numeric values (21 CFR telemetry rule)
//   - Status colors: yellow = pending, green = approved, red = rejected
//   - top-6 sticky within the scrollable main column

import { getTriageStats } from "@/app/dashboard/triage/actions";
import { Activity } from "lucide-react";

// ---------------------------------------------------------------------------
// Sub-component: stat row
// ---------------------------------------------------------------------------

interface StatRowProps {
  label: string;
  value: number;
  valueClass: string;
}

function StatRow({ label, value, valueClass }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-700 last:border-b-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`font-mono text-sm font-medium tabular-nums ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TriageStatsSidebar
// ---------------------------------------------------------------------------

export async function TriageStatsSidebar() {
  const stats = await getTriageStats();

  const total = stats.pending + stats.approved + stats.rejected;
  const allClear = stats.pending === 0;

  return (
    <aside
      aria-label="Triage system stats"
      className="sticky top-6 flex flex-col gap-4"
    >
      {/* ── System health card ─────────────────────────────────────────── */}
      <div className="border border-slate-700 bg-slate-800 rounded-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity
            className={`h-3.5 w-3.5 ${allClear ? "text-green-500" : "text-yellow-500"}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            System Health
          </span>
        </div>
        <p
          className={`text-sm font-medium ${allClear ? "text-green-400" : "text-yellow-400"}`}
        >
          {allClear ? "All Clear" : "Review Required"}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {allClear
            ? "No items pending human review."
            : `${stats.pending} item${stats.pending === 1 ? "" : "s"} awaiting QA review.`}
        </p>
      </div>

      {/* ── Counts card ────────────────────────────────────────────────── */}
      <div className="border border-slate-700 bg-slate-800 rounded-sm p-4">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
          Queue Breakdown
        </p>
        <p className="text-xs text-slate-600 mb-3 font-mono tabular-nums">
          {total} total
        </p>

        <StatRow
          label="Pending Triages"
          value={stats.pending}
          valueClass={stats.pending > 0 ? "text-yellow-400" : "text-slate-400"}
        />
        <StatRow
          label="Approved"
          value={stats.approved}
          valueClass="text-green-500"
        />
        <StatRow
          label="Rejected"
          value={stats.rejected}
          valueClass="text-red-400"
        />
      </div>

      {/* ── Info card ──────────────────────────────────────────────────── */}
      <div className="border border-slate-700 bg-slate-800 rounded-sm p-4">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
          How This Works
        </p>
        <p className="text-xs leading-relaxed text-slate-500">
          When AWS Bedrock disagrees with the regulatory tag a developer applied
          to an evidence log, it flags the discrepancy here for human review.
        </p>
      </div>
    </aside>
  );
}
