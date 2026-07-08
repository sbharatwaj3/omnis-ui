// omnis-ui/components/live-system-telemetry.tsx
// Live System Telemetry Card — client component.
//
// Contains:
//   1. Status rows (Ingestion Pipeline, Bedrock AI Engine, Evidence Ledger,
//      DICOM Connector) with hover tooltips showing "Last check: Xs ago".
//   2. LiveSignalVisualizer — a Framer Motion animated SVG sine wave that
//      continuously scrolls to simulate real-time data ingestion.
//   3. "Generate eSTAR e-Copy" quick-export CTA at the card footer.
//
// DESIGN SYSTEM:
//   - Flat elevation. No box-shadows.
//   - Square badges with 1px border, transparent fill.
//   - Framer Motion spring physics for entrance; CSS animation for the
//     continuous SVG scroll (more performant than JS-driven rAF loops).
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Activity, Cpu, Wifi, WifiOff, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusItem {
  icon: React.ElementType;
  label: string;
  status: string;
  color: string;
  bg: string;
  border: string;
  /** Seconds since last health check — simulated, increments in real time */
  lastCheckBase: number;
}

// ---------------------------------------------------------------------------
// Status items config
// ---------------------------------------------------------------------------

const STATUS_ITEMS: StatusItem[] = [
  {
    icon: Cpu,
    label: "Ingestion Pipeline",
    status: "Operational",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    lastCheckBase: 2,
  },
  {
    icon: Wifi,
    label: "Bedrock AI Engine",
    status: "Connected",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    lastCheckBase: 5,
  },
  {
    icon: Activity,
    label: "Evidence Ledger",
    status: "Writing",
    color: "text-sky-600",
    bg: "bg-sky-50",
    border: "border-sky-200",
    lastCheckBase: 1,
  },
  {
    icon: WifiOff,
    label: "DICOM Connector",
    status: "Standby",
    color: "text-zinc-500",
    bg: "bg-zinc-50",
    border: "border-zinc-200",
    lastCheckBase: 30,
  },
];

// ---------------------------------------------------------------------------
// LiveSignalVisualizer
//
// Renders two stacked SVG sine waves that continuously scroll rightward,
// creating the illusion of a live signal stream. The animation is driven by
// a CSS keyframe (translateX) rather than JS rAF to avoid layout thrashing.
// The SVG viewBox is double-wide (2 × 400) so one period is always visible
// as the first copy scrolls off-screen and the second seamlessly replaces it.
// ---------------------------------------------------------------------------

function buildSinePath(
  width: number,
  height: number,
  amplitude: number,
  frequency: number,
  phaseShift: number = 0,
): string {
  const midY = height / 2;
  const points: string[] = [];
  const steps = 120;

  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = midY + amplitude * Math.sin((i / steps) * Math.PI * 2 * frequency + phaseShift);
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return points.join(" ");
}

// Pre-compute paths (static — no recalculation on render)
const W = 400;
const H = 64;
const PRIMARY_PATH = buildSinePath(W, H, 10, 2.5, 0);
const SECONDARY_PATH = buildSinePath(W, H, 6, 3, Math.PI * 0.6);

function LiveSignalVisualizer() {
  return (
    <div
      className="relative overflow-hidden rounded border border-zinc-200 bg-slate-50"
      style={{ height: H }}
      aria-hidden="true"
    >
      {/* Scrolling SVG container — CSS animation keeps this off the main thread */}
      <div className="live-signal-scroll flex" style={{ width: W * 2, height: H }}>
        {/* Two identical SVG tiles side-by-side for seamless loop */}
        {[0, 1].map((tile) => (
          <svg
            key={tile}
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0 }}
          >
            {/* Secondary (background) wave — muted */}
            <path
              d={SECONDARY_PATH}
              stroke="#cbd5e1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.5"
            />
            {/* Primary wave — slate-400 */}
            <path
              d={PRIMARY_PATH}
              stroke="#94a3b8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ))}
      </div>

      {/* Fade masks on both edges for a clean viewport illusion */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-slate-50 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-50 to-transparent" />

      {/* Pulse dot — anchored to mid-right to indicate "live head" */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] font-medium text-zinc-400 font-mono">LIVE</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusRow — single service row with hover tooltip
// ---------------------------------------------------------------------------

function StatusRow({ item, elapsed }: { item: StatusItem; elapsed: number }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  const secondsAgo = item.lastCheckBase + elapsed;
  const timeLabel = secondsAgo < 60
    ? `${secondsAgo}s ago`
    : `${Math.floor(secondsAgo / 60)}m ago`;

  return (
    <div
      className="relative flex items-center justify-between rounded border border-zinc-100 bg-zinc-50 px-4 py-3 transition-colors hover:bg-zinc-100"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded ${item.bg} border ${item.border}`}
        >
          <Icon className={`h-4 w-4 ${item.color}`} strokeWidth={1.75} />
        </div>
        <span className="text-sm font-medium text-zinc-700">{item.label}</span>
      </div>

      {/* Status badge — shows tooltip text on hover */}
      <span
        className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-all ${item.bg} ${item.border} ${item.color}`}
      >
        {hovered ? `Last check: ${timeLabel}` : item.status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveSystemTelemetry — exported card component
// ---------------------------------------------------------------------------

export function LiveSystemTelemetry() {
  // Tick every second so "Last check: Xs ago" updates in real time
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.15 }}
    >
      <Card className="border-zinc-200 bg-white flex flex-col">
        {/* ── Card header ───────────────────────────────────────────────── */}
        <CardHeader className="border-b border-zinc-100 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-zinc-800">
              Live System Telemetry
            </CardTitle>
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Real-time ingestion pipeline health and system signals
          </p>
        </CardHeader>

        {/* ── Card body ─────────────────────────────────────────────────── */}
        <CardContent className="flex flex-1 flex-col gap-3 pt-5">
          {/* Status rows */}
          {STATUS_ITEMS.map((item) => (
            <StatusRow key={item.label} item={item} elapsed={tick} />
          ))}

          {/* Live signal visualizer */}
          <div className="mt-1">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Signal Stream
            </p>
            <LiveSignalVisualizer />
          </div>

          {/* Quick-export CTA */}
          <button
            type="button"
            className="mt-2 w-full rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            Generate eSTAR e-Copy
          </button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
