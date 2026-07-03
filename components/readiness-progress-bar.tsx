"use client";
// omnis-ui/components/readiness-progress-bar.tsx
// Animated segmented FDA Submission Readiness progress bar.
//
// Each segment (Compliant / Pending / Missing) fills from left to right on
// mount using an ease-out tween, matching the animation-standards mandate:
// fast, institutional, zero bounce.
//
// Colors are strictly semantic per ui-design-system.md:
//   Compliant      → emerald-600  (soft institutional green)
//   Pending        → amber-500    (muted clinical amber)
//   Missing        → slate-400    (flat desaturated neutral — avoids neon red)
//
// The bar track is a plain div with overflow-hidden so the motion.divs are
// clipped cleanly. No border radii > 4px. No box-shadow.

import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface ReadinessProgressBarProps {
  compliant: number;
  pending: number;
  missing: number;
  total: number;
  completionPercent: number;
}

const SEGMENT_DELAY_BASE = 0.1;
const SEGMENT_DURATION = 0.65;

export function ReadinessProgressBar({
  compliant,
  pending,
  missing,
  total,
  completionPercent,
}: ReadinessProgressBarProps) {
  const compliantPct = total > 0 ? (compliant / total) * 100 : 0;
  const pendingPct   = total > 0 ? (pending   / total) * 100 : 0;
  const missingPct   = total > 0 ? (missing   / total) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* ── Percentage readout ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          FDA Submission Readiness
        </span>
        <motion.span
          className={`text-2xl font-bold tabular-nums ${
            completionPercent === 100
              ? "text-emerald-600"
              : completionPercent >= 50
                ? "text-amber-500"
                : "text-slate-400"
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: "tween", ease: "easeOut", duration: 0.4, delay: 0.05 }}
        >
          {completionPercent.toFixed(1)}%
        </motion.span>
      </div>

      {/* ── Segmented track ── */}
      {/* h-3 matches the original Progress component height */}
      <div
        className="relative h-3 w-full overflow-hidden rounded-sm bg-zinc-100"
        role="progressbar"
        aria-valuenow={completionPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`FDA Submission Readiness: ${completionPercent.toFixed(1)}%`}
      >
        {/* The three segments sit in a row via absolute left offsets so they
            animate their widths independently from 0 without stacking issues. */}

        {/* Segment 1 — Compliant (emerald-600 — soft institutional green) */}
        {compliantPct > 0 && (
          <motion.div
            className="absolute left-0 top-0 h-full bg-emerald-600"
            style={{ left: "0%" }}
            initial={{ width: 0 }}
            animate={{ width: `${compliantPct}%` }}
            transition={{
              type: "tween",
              ease: "easeOut",
              duration: SEGMENT_DURATION,
              delay: SEGMENT_DELAY_BASE,
            }}
          />
        )}

        {/* Segment 2 — Pending Approval (amber-500 — muted clinical amber) — starts right after compliant */}
        {pendingPct > 0 && (
          <motion.div
            className="absolute top-0 h-full bg-amber-500"
            style={{ left: `${compliantPct}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${pendingPct}%` }}
            transition={{
              type: "tween",
              ease: "easeOut",
              duration: SEGMENT_DURATION,
              delay: SEGMENT_DELAY_BASE + 0.1,
            }}
          />
        )}

        {/* Segment 3 — Missing Evidence (slate-400 — flat desaturated neutral) — starts after compliant + pending */}
        {missingPct > 0 && (
          <motion.div
            className="absolute top-0 h-full bg-slate-400"
            style={{ left: `${compliantPct + pendingPct}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${missingPct}%` }}
            transition={{
              type: "tween",
              ease: "easeOut",
              duration: SEGMENT_DURATION,
              delay: SEGMENT_DELAY_BASE + 0.2,
            }}
          />
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          {compliant} Compliant
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          {pending} Pending Approval
        </span>
        <span className="flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-slate-400" />
          {missing} Missing Evidence
        </span>
      </div>
    </div>
  );
}
