"use client";
// omnis-ui/components/ingestion-hierarchy-box.tsx
// Smart Ingestion Hierarchy — three-tier reference panel shown below Step 3b
// on the CLI Setup page.
//
// Tier 1 · Markers        — deterministic, no AI, fastest path
// Tier 2 · Auto-Infer     — Bedrock AI classifies unmapped tests automatically
// Tier 3 · Manual Override — --results flag forces a specific req ID
//
// Pure presentational component: no props, no state, no side effects.

import { motion } from "framer-motion";
import { Zap, Cpu, Wrench, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const INGESTION_TIERS = [
  {
    rank: "Tier 1",
    label: "Markers",
    sublabel: "Recommended · Deterministic",
    icon: Zap,
    borderColor: "border-l-emerald-500",
    iconColor: "text-emerald-600",
    badgeColor: "border-emerald-300 text-emerald-700",
    description:
      "Add a requirement marker directly in your test source. The CLI reads the ID deterministically — no AI inference required. This is the fastest, most reliable path.",
    examples: [
      { lang: "PyTest", snippet: '@pytest.mark.req("21_CFR_820_30")' },
      { lang: "Jest",   snippet: "// @req: IEC_62304_5_1" },
    ],
  },
  {
    rank: "Tier 2",
    label: "Auto-Infer",
    sublabel: "Seamless · AI-Powered",
    icon: Cpu,
    borderColor: "border-l-blue-500",
    iconColor: "text-blue-600",
    badgeColor: "border-blue-300 text-blue-700",
    description:
      "No marker or flag provided? The CLI automatically sends the test name and output to AWS Bedrock (Titan Embed). The AI classifies the nearest regulatory requirement and maps it for you.",
    examples: [],
  },
  {
    rank: "Tier 3",
    label: "Manual Override",
    sublabel: "Break-glass · Force mapping",
    icon: Wrench,
    borderColor: "border-l-amber-500",
    iconColor: "text-amber-600",
    badgeColor: "border-amber-300 text-amber-700",
    description:
      "Need to force a specific requirement code regardless of what the AI infers? Pass the --results flag to override the classification entirely.",
    examples: [
      { lang: "Shell", snippet: "./omnis-run ./output.json --results 21_CFR_820_30" },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IngestionHierarchyBox() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "tween", ease: "easeOut", duration: 0.3, delay: 0.08 }}
      className="rounded border border-zinc-200 bg-zinc-50"
      aria-label="Smart Ingestion Hierarchy reference"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3.5 py-2.5">
        <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.75} />
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Smart Ingestion Hierarchy
        </p>
      </div>

      {/* ── Intro ───────────────────────────────────────────────────────── */}
      <div className="px-3.5 pt-3 pb-1">
        <p className="text-xs text-zinc-500 leading-relaxed">
          The CLI uses a three-tier decision tree to determine which FDA
          regulatory requirement each test maps to. Pick the tier that fits
          your workflow.
        </p>
      </div>

      {/* ── Tier rows ───────────────────────────────────────────────────── */}
      <div className="px-3.5 pb-3.5 pt-2.5">
        {INGESTION_TIERS.map((tier, idx) => {
          const Icon = tier.icon;
          return (
            <div
              key={tier.rank}
              className={`border-l-2 pl-3 ${tier.borderColor} ${
                idx < INGESTION_TIERS.length - 1 ? "mb-4" : ""
              }`}
            >
              {/* Row header */}
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${tier.iconColor}`}
                  strokeWidth={1.75}
                />
                <span className="text-xs font-semibold text-zinc-800">
                  {tier.label}
                </span>
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${tier.badgeColor} bg-transparent`}
                >
                  {tier.sublabel}
                </span>
              </div>

              {/* Description */}
              <p className="text-xs leading-relaxed text-zinc-500">
                {tier.description}
              </p>

              {/* Code examples */}
              {tier.examples.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {tier.examples.map((ex) => (
                    <div
                      key={ex.lang}
                      className="overflow-hidden rounded border border-zinc-200"
                    >
                      <div className="border-b border-zinc-200 bg-zinc-100 px-3 py-1">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          {ex.lang}
                        </span>
                      </div>
                      <pre className="overflow-x-auto bg-white px-3 py-2 text-[11px] leading-relaxed">
                        <code className="font-mono text-zinc-700 whitespace-pre">
                          {ex.snippet}
                        </code>
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
