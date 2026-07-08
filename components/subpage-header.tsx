// omnis-ui/components/subpage-header.tsx
// Gold-Standard Subpage Header — matches the Dashboard PageHeader exactly.
//
// STRUCTURE:
//   h-[72px] — matches the sidebar logo header height so both bars form a
//   single unbroken horizontal baseline across the full viewport.
//
//   Left:   page title (h1) + subtitle (p) — flush with sidebar edge via pl-8.
//   Center: "Back to Dashboard" navigation link — absolutely centered in the bar.
//   Right:  compliance badge — pushed to viewport right edge via ml-auto pr-6.
//
// Usage:
//   <SubpageHeader
//     title="Requirements Management"
//     subtitle="SRS/SDS Registry"
//     complianceText="IEC 62304 · FDA 820.30(c)"   // optional, defaults to standard
//   />

import { Activity, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface SubpageHeaderProps {
  /** Primary h1 text — the page name (e.g. "Triage Inbox") */
  title: string;
  /** Secondary line beneath the title (e.g. "AI-flagged discrepancies") */
  subtitle: string;
  /** Compliance badge text. Defaults to "IEC 62304 · 21 CFR Part 11". */
  complianceText?: string;
}

export function SubpageHeader({
  title,
  subtitle,
  complianceText = "IEC 62304 · 21 CFR Part 11",
}: SubpageHeaderProps) {
  return (
    // h-[72px] matches the sidebar logo header height exactly so both header
    // bars form a single unbroken horizontal baseline across the viewport.
    // position:relative on the header lets the center link be absolutely
    // positioned without affecting the left/right flex children.
    <header className="relative h-[72px] flex items-center border-b border-zinc-200 bg-white w-full pr-6 shrink-0">

      {/* Left: page title + subtitle — pl-8 aligns flush with sidebar edge */}
      <div className="pl-8 flex items-center min-w-0 flex-1">
        <div>
          <h1 className="text-sm font-semibold text-zinc-900">{title}</h1>
          <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>
        </div>
      </div>

      {/* Center: Back to Dashboard — absolute so it is always geometrically
          centered between the left title and the right compliance badge,
          regardless of how wide either side is. */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Dashboard
        </Link>
      </div>

      {/* Right: compliance badge — pushed to viewport right edge */}
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <span className="hidden md:inline-flex items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 select-none">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-medium text-zinc-600">
            {complianceText}
          </span>
        </span>
      </div>

    </header>
  );
}
