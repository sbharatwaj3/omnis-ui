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
//      Wired to GenerateReportButton which opens the ExportProgressModal
//      and calls the Render LaTeX microservice.
//
// DESIGN SYSTEM:
//   - Flat elevation. No box-shadows. Border-radius ≤ 4px.
//   - JetBrains Mono for all IDs, timestamps, and CFR clause codes.
//   - Square status badges with 1px semantic border, transparent fill.
//   - Framer Motion spring physics for entrance.

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateReportButton } from "@/components/generate-report-button";

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
          {/* GenerateReportButton opens the ExportProgressModal which fires  */}
          {/* the real PDF compile pipeline via /api/generate-report?format=pdf. */}
          {/* completionPercent mirrors the static donut value (84.6%). The    */}
          {/* draft-warning dialog will surface since the matrix is < 100%.    */}
          <div className="mt-auto">
            <GenerateReportButton completionPercent={84.6} />
          </div>

          {/* ── Live System Feedback ─────────────────────────────────── */}
          <div className="mt-6 flex flex-col gap-6">

            {/* CLI Connection Status */}
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center gap-2">
                {/* Pulsing green dot */}
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <p className="text-xs font-medium text-slate-700">
                  omnis-run CLI: Connected &amp; Listening
                </p>
              </div>
            </div>

            {/* Recent Activity Feed */}
            <div>
              {/* Section header */}
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Recent Activity (21 CFR Part 11)
              </p>

              {/* Activity items */}
              <ul className="flex flex-col gap-2">
                <li className="flex items-start gap-2">
                  <code className="shrink-0 font-mono text-[10px] text-slate-400 pt-px">
                    10:42 AM
                  </code>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Sidharth R. approved ECG: S3 Pipeline Test.
                  </p>
                </li>
                <li className="flex items-start gap-2">
                  <code className="shrink-0 font-mono text-[10px] text-slate-400 pt-px">
                    09:15 AM
                  </code>
                  <p className="text-xs leading-relaxed text-slate-500">
                    System auto-cleared 4 DICOM false positives.
                  </p>
                </li>
                <li className="flex items-start gap-2">
                  <code className="shrink-0 font-mono text-[10px] text-slate-400 pt-px">
                    08:00 AM
                  </code>
                  <p className="text-xs leading-relaxed text-slate-500">
                    New test evidence ingested via Windows CLI.
                  </p>
                </li>
              </ul>
            </div>

          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
