"use client";
// omnis-ui/components/submission-readiness-column.tsx
//
// Replaces the old Live System Telemetry card in the dashboard right column.
//
// Contains two blocks:
//   1. Submission Readiness — Recharts PieChart (donut) showing 84.6% IEC 62304
//      & CFR 820 compliance progress. Loaded with dynamic import (ssr: false)
//      to prevent Next.js hydration mismatch on the SVG canvas.
//   2. Action Required: 21 CFR Part 11 — minimalist signature-queue inbox
//      listing the top 3 test suites awaiting human electronic signature.
//   3. Generate eSTAR e-Copy — CTA anchored to the card footer.
//
// DESIGN SYSTEM:
//   - Flat elevation. No box-shadows. Border-radius ≤ 4px.
//   - JetBrains Mono for all IDs, timestamps, and CFR clause codes.
//   - Square status badges with 1px semantic border, transparent fill.
//   - Framer Motion spring physics for entrance.

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Download, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Recharts donut — dynamic import with ssr: false prevents hydration errors
// because Recharts reads window dimensions on mount.
// ---------------------------------------------------------------------------

const ReadinessDonut = dynamic(() => import("./readiness-donut"), {
  ssr: false,
  loading: () => (
    // Skeleton that matches the donut's rendered footprint
    <div className="flex flex-col items-center gap-3">
      <div className="h-[160px] w-[160px] animate-pulse rounded-full bg-slate-100" />
      <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Signature queue data — top 3 test suites awaiting 21 CFR Part 11 approval
// ---------------------------------------------------------------------------

const SIGNATURE_QUEUE = [
  { id: "SQ-001", suite: "ECG: S3 Pipeline Test",         clause: "CFR-11.50" },
  { id: "SQ-002", suite: "DICOM: Corruption Handling Test", clause: "CFR-11.70" },
  { id: "SQ-003", suite: "PHI Anonymizer: Compliance Test", clause: "CFR-11.100" },
] as const;

// ---------------------------------------------------------------------------
// SignatureQueueItem — single inbox row
// ---------------------------------------------------------------------------

function SignatureQueueItem({
  suite,
  clause,
  id,
}: {
  suite: string;
  clause: string;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        {/* Test suite name — primary anchor */}
        <p className="truncate text-sm font-medium text-slate-800">{suite}</p>
        {/* Clause code — monospace per design system mandate */}
        <code className="mt-0.5 block font-mono text-[10px] text-slate-400">
          {id} · {clause}
        </code>
      </div>

      {/* Pending Approval badge — amber, square, 1px border, transparent fill */}
      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        <Clock className="h-2.5 w-2.5" />
        Pending Approval
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubmissionReadinessColumn — exported card component
// ---------------------------------------------------------------------------

export function SubmissionReadinessColumn() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.15 }}
    >
      <Card className="flex flex-col border-slate-200 bg-white">
        {/* ── Card header ─────────────────────────────────────────────── */}
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-800">
              Submission Readiness
            </CardTitle>
            {/* Regulatory scope badge */}
            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              FDA 21 CFR
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            IEC 62304 &amp; CFR 820 compliance progress toward eSTAR submission
          </p>
        </CardHeader>

        {/* ── Card body ───────────────────────────────────────────────── */}
        <CardContent className="flex flex-1 flex-col gap-5 pt-5">

          {/* ── Block 1: Donut Chart ─────────────────────────────────── */}
          <div className="flex flex-col items-center">
            <ReadinessDonut />
            {/* Subtitle beneath the chart */}
            <p className="mt-3 text-center text-xs font-medium text-slate-500">
              IEC 62304 &amp; CFR 820 Satisfied
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* ── Block 2: Signature Queue ─────────────────────────────── */}
          <div>
            {/* Section header */}
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Action Required: 21 CFR Part 11
              </p>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
              The following test suites require a human electronic signature
              before evidence can be considered legally binding.
            </p>

            {/* Inbox list */}
            <div className="rounded border border-slate-200 bg-slate-50 px-3">
              {SIGNATURE_QUEUE.map((item) => (
                <SignatureQueueItem
                  key={item.id}
                  id={item.id}
                  suite={item.suite}
                  clause={item.clause}
                />
              ))}
            </div>
          </div>

          {/* ── Block 3: eSTAR CTA ──────────────────────────────────── */}
          <button
            type="button"
            className="mt-auto w-full rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Generate eSTAR e-Copy
          </button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
