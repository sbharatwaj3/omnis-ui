"use client";
// omnis-ui/components/readiness-donut.tsx
//
// Isolated Recharts donut — imported via `dynamic(..., { ssr: false })` in
// submission-readiness-column.tsx to prevent Next.js hydration errors.
//
// Renders an 84.6% / 15.4% PieChart (donut configuration):
//   - Completed segment: #10b981 (MedTech green / emerald-500)
//   - Remaining segment: #f1f5f9 (slate-100 muted fill)
//   - No default Recharts tooltip or legend
//   - "84.6%" percentage label absolutely centred inside the donut hole

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const READINESS_PERCENT = 84.6;

const DATA = [
  { name: "Satisfied",  value: READINESS_PERCENT },
  { name: "Remaining",  value: 100 - READINESS_PERCENT },
];

const COLORS = [
  "#10b981", // emerald-500 — satisfied segment
  "#f1f5f9", // slate-100   — remaining segment
];

// ---------------------------------------------------------------------------
// ReadinessDonut
// ---------------------------------------------------------------------------

export default function ReadinessDonut() {
  return (
    // Outer wrapper: fixed square so the ResponsiveContainer has a concrete
    // height to measure (avoids the classic "0px height" Recharts pitfall).
    <div className="relative h-[160px] w-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={DATA}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={72}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            stroke="none"
            isAnimationActive={true}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {DATA.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Centred label inside the donut hole — absolutely positioned.
          Uses inset-0 + flex centering to guarantee dead-center alignment
          regardless of any Recharts internal SVG margin offsets. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-2xl font-semibold tabular-nums leading-none text-slate-800">
          84.6%
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-widest leading-none text-slate-400">
          Complete
        </span>
      </div>
    </div>
  );
}
