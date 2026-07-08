"use client";
// omnis-ui/app/page.tsx
// Omnis MedTech Corp — Public Marketing Landing Page
//
// ALL DARK MODE CLASSES REMOVED. This page is hardcoded light-only.
// The application enforces light mode globally via globals.css and layout.tsx.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import { PerspectiveGrid } from "@/components/ui/perspective-grid";
import {
  ShieldCheck,
  GitBranch,
  Network,
  FileCheck2,
  ArrowRight,
  CheckCircle,
  CheckCircle2,
  Circle,
  Zap,
  Terminal,
  BrainCircuit,
  Lock,
  AlertTriangle,
  Hash,
  Link2,
  Database,
  Shield,
  Cpu,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Animation variants — institutional, fast, zero bounce (ease-out)
// ---------------------------------------------------------------------------

/** Fade up from 16px below. Used for most section content. */
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

/** Subtle fade-in with no positional shift. Used for containers & overlays. */
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/** Parent variant that drives staggered children. */
const staggerContainer = (staggerChildren = 0.08, delayChildren = 0) => ({
  hidden: {},
  visible: { transition: { staggerChildren, delayChildren } },
});

/** Shared transition: fast ease-out — no spring elasticity. */
const easeOut = { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const };

/** Slightly slower entrance for large hero text. */
const easeOutSlow = { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const };

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const steps = [
  {
    icon: GitBranch,
    step: "01",
    title: "Push Code",
    description:
      "Every commit to main triggers the omnis-run CI/CD wrapper, capturing test execution in real time.",
  },
  {
    icon: Network,
    step: "02",
    title: "Automated Traceability",
    description:
      "Evidence logs are HMAC-signed and linked to IEC 62304 clauses — no manual mapping required.",
  },
  {
    icon: FileCheck2,
    step: "03",
    title: "eSTAR Generation",
    description:
      "Export a submission-ready FDA eSTAR Software Documentation Attachment as a compiled PDF.",
  },
];

const trustBadges = [
  "IEC 62304 Compliant",
  "21 CFR Part 11",
  "HMAC-Signed Evidence",
  "FDA eSTAR Ready",
];

const mockMatrixRows = [
  { clause: "5.1.1", title: "Software Development Planning", hash: "a3f9c2…d841", compliant: true },
  { clause: "5.3.2", title: "Software Architectural Design", hash: "b7e10d…f229", compliant: true },
  { clause: "5.5.1", title: "Software Unit Implementation", hash: "c2d84a…9b03", compliant: true },
  { clause: "5.7.4", title: "Regression & Integration Testing", hash: "d91f3e…c571", compliant: false },
];

const mockActivityFeed = [
  { status: "success", message: "omnis-run: Verification Successful — Payload Signed", ts: "2026-06-09T04:12:08Z", suite: "test_dicom_parser.py" },
  { status: "success", message: "omnis-run: Verification Successful — Payload Signed", ts: "2026-06-09T03:47:33Z", suite: "test_phi_anonymizer.py" },
  { status: "warning", message: "omnis-run: Anomaly Detected — AI Review Flagged", ts: "2026-06-09T03:11:55Z", suite: "test_cgm_alerts.py" },
  { status: "success", message: "omnis-run: Verification Successful — Payload Signed", ts: "2026-06-09T02:58:17Z", suite: "test_soup_codecs.py" },
  { status: "success", message: "omnis-run: Verification Successful — Payload Signed", ts: "2026-06-09T02:30:44Z", suite: "test_s3_ecg_pipeline.py" },
];

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ isAuthenticated, userEmail }: { isAuthenticated: boolean; userEmail: string | null }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded ring-1 ring-slate-200 group-hover:ring-emerald-400 transition-all duration-200">
            <ShieldCheck className="h-4 w-4 text-slate-800" strokeWidth={1.75} />
          </div>
          <div className="leading-none">
            <span className="block text-sm font-medium tracking-tight text-slate-900">Qavro</span>
            <span className="block text-[10px] font-medium tracking-widest text-emerald-600 uppercase">FDA Assurance Platform</span>
          </div>
        </Link>

        <nav className="hidden sm:flex items-center gap-5">
          <Link href="/#how-it-works" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
            Learn more about us
          </Link>
          <Link href="/pricing" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
            Pricing
          </Link>
        </nav>

        {isAuthenticated ? (
          <div className="flex shrink-0 items-center gap-3">
            {userEmail && (
              <span className="hidden md:block text-xs font-medium text-slate-500 truncate max-w-[180px]">
                {userEmail}
              </span>
            )}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link href="/pricing" className="inline-flex items-center gap-1.5 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-600">
                Go to Dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link href="/login" className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-all hover:border-slate-400 hover:bg-slate-50">
                Sign In
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link href="/signup" className="hidden sm:inline-flex items-center gap-1.5 rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-slate-800">
                Get Started
              </Link>
            </motion.div>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* ----------------------------------------------------------------
          PerspectiveGrid background layer
          — gridSize reduced to 28 for a coarser, less visually noisy grid
          — opacity-[0.18] keeps it ghost-light so it never competes with text
          — showOverlay=false because we handle our own bottom fade below
          — pointer-events-none so hover tiles never intercept user clicks
      ---------------------------------------------------------------- */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
      >
        <PerspectiveGrid
          gridSize={28}
          showOverlay={false}
          className="h-full w-full bg-transparent [--fade-stop:transparent]"
        />
      </div>

      {/* Bottom fade — blends the grid into the white section below */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-white"
      />

      {/* Hero content */}
      <div className="relative mx-auto max-w-5xl px-6 py-28 text-center md:py-36">
        <motion.div
          variants={staggerContainer(0.1, 0.05)}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center"
        >
          {/* ----------------------------------------------------------------
              Shimmer eyebrow badge
              — pure-CSS glint: a ::before pseudo-band sweeps across via
                the `shimmer-sweep` keyframe defined in globals.css
              — overflow-hidden clips the band to the pill boundary
              — the badge itself is a translucent slate/emerald border pill
          ---------------------------------------------------------------- */}
          <motion.div
            variants={fadeUp}
            transition={easeOut}
            className="mb-6"
          >
            <span
              className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold tracking-wide text-slate-600"
              aria-label="Regulatory frameworks: FDA eSTAR, IEC 62304, 21 CFR Part 11"
            >
              {/* Shimmer sweep band */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-12deg] bg-gradient-to-r from-transparent via-white/70 to-transparent [animation:shimmer-sweep_2.8s_ease-in-out_infinite]"
              />
              <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="relative">FDA eSTAR · IEC 62304 · 21 CFR Part 11</span>
            </span>
          </motion.div>

          {/* H1 */}
          <motion.h1
            variants={fadeUp}
            transition={easeOutSlow}
            className="mx-auto max-w-4xl text-5xl font-semibold leading-[1.08] tracking-tight text-slate-900 md:text-6xl lg:text-7xl"
          >
            Automate 21 CFR Part 11 Compliance{" "}
            <span className="text-emerald-600">Without Slowing Down Engineering.</span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            variants={fadeUp}
            transition={easeOutSlow}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500 md:text-xl"
          >
            The first zero-touch QA pipeline for MedTech. Map FDA requirements
            directly in your code, let AI triage discrepancies, and generate
            audit-ready traceability matrices instantly.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            variants={fadeUp}
            transition={{ ...easeOut, delay: 0.15 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            {/* Primary */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                Start 30-Day Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Secondary — smooth-scrolls to #sample-matrix anchor */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="#sample-matrix"
                className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              >
                View Sample Matrix
              </Link>
            </motion.div>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            variants={staggerContainer(0.06, 0.2)}
            initial="hidden"
            animate="visible"
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            {trustBadges.map((badge) => (
              <motion.span
                key={badge}
                variants={fadeUp}
                transition={easeOut}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600"
              >
                <CheckCircle className="h-3 w-3 text-emerald-500" />
                {badge}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bento Feature Grid
// ---------------------------------------------------------------------------

/**
 * Card 1 visual — minimalist terminal mockup.
 * Light surface (bg-slate-50), JetBrains Mono-style code snippet. Pure HTML/CSS, no canvas.
 */
function TerminalMockup() {
  return (
    <div className="mt-5 overflow-hidden rounded border border-slate-200 bg-slate-50">
      {/* Chrome bar */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-red-400/70" />
        <span className="h-2 w-2 rounded-full bg-amber-400/70" />
        <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
        <span className="ml-2 text-[10px] font-medium tracking-wide text-slate-400">
          test_dicom_parser.py
        </span>
      </div>
      {/* Code body */}
      <div className="px-4 py-3 font-mono text-[11px] leading-relaxed">
        <p>
          <span className="text-slate-400">1 </span>
          <span className="text-violet-700">import</span>
          <span className="text-slate-800"> pytest</span>
        </p>
        <p>
          <span className="text-slate-400">2 </span>
          <span className="text-violet-700">from</span>
          <span className="text-slate-800"> omnis_run </span>
          <span className="text-violet-700">import</span>
          <span className="text-slate-800"> req</span>
        </p>
        <p className="mt-1">
          <span className="text-slate-400">3 </span>
        </p>
        <p>
          <span className="text-slate-400">4 </span>
          <span className="text-emerald-700">@pytest.mark.req</span>
          <span className="text-slate-800">(</span>
          <span className="text-amber-700">&quot;IEC-62304-5.1&quot;</span>
          <span className="text-slate-800">)</span>
        </p>
        <p>
          <span className="text-slate-400">5 </span>
          <span className="text-violet-700">def</span>
          <span className="text-sky-700"> test_dicom_parse</span>
          <span className="text-slate-800">():</span>
        </p>
        <p>
          <span className="text-slate-400">6 </span>
          <span className="text-slate-600 pl-4">assert parse_dicom(fixture) </span>
          <span className="text-slate-400">…</span>
        </p>
        <p className="mt-2 flex items-center gap-1.5">
          <span className="text-slate-400">$ </span>
          <span className="text-emerald-700">omnis-run</span>
          <span className="text-slate-800"> . ──</span>
          <span className="text-emerald-700"> SIGNED</span>
          <span className="inline-block h-3 w-0.5 animate-pulse bg-slate-400 align-middle" />
        </p>
      </div>
    </div>
  );
}

/**
 * Card 2 visual — AI triage inbox mockup.
 * Shows three triage rows: two PASS, one FLAGGED.
 */
function TriageMockup() {
  const rows = [
    { suite: "test_phi_anonymizer.py",  clause: "IEC-62304-5.7", status: "pass"    },
    { suite: "test_cgm_alerts.py",      clause: "IEC-62304-5.5", status: "flagged" },
    { suite: "test_s3_ecg_pipeline.py", clause: "IEC-62304-5.3", status: "pass"    },
  ] as const;

  return (
    <div className="mt-5 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          AI Triage Inbox
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
          <BrainCircuit className="h-3 w-3" />
          Bedrock Active
        </span>
      </div>

      {rows.map((row) => (
        <div
          key={row.suite}
          className="flex items-center gap-3 rounded border border-slate-100 bg-white px-3 py-2.5"
        >
          {/* Status indicator */}
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              row.status === "pass" ? "bg-emerald-500" : "bg-amber-400"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px] text-slate-700">{row.suite}</p>
            <p className="font-mono text-[10px] text-slate-400">{row.clause}</p>
          </div>
          {/* Badge */}
          <span
            className={`shrink-0 rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
              row.status === "pass"
                ? "border-emerald-300 text-emerald-700"
                : "border-amber-300 text-amber-700"
            }`}
          >
            {row.status === "pass" ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" /> Pass
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-2.5 w-2.5" /> Flagged
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Card 3 visual — cryptographic ledger mockup.
 * Hash chain visualization: three sealed blocks linked by a vertical hairline.
 */
function LedgerMockup() {
  const blocks = [
    { id: "LOG-0041", hash: "a3f9c2d8…4e1b", prev: "b7e10d22…f229", sealed: true  },
    { id: "LOG-0042", hash: "c2d84a91…9b03", prev: "a3f9c2d8…4e1b", sealed: true  },
    { id: "LOG-0043", hash: "d91f3e0c…c571", prev: "c2d84a91…9b03", sealed: false },
  ] as const;

  return (
    <div className="mt-5 relative">
      {/* Vertical chain line */}
      <div
        aria-hidden="true"
        className="absolute left-[1.1rem] top-6 bottom-6 w-px bg-slate-200"
      />
      <div className="space-y-2.5">
        {blocks.map((block, i) => (
          <div key={block.id} className="relative flex items-start gap-3">
            {/* Chain node icon */}
            <div
              className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                block.sealed
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              {block.sealed
                ? <Lock className="h-2.5 w-2.5 text-emerald-600" />
                : <Hash className="h-2.5 w-2.5 text-slate-400" />
              }
            </div>
            {/* Block data */}
            <div className="min-w-0 flex-1 rounded border border-slate-100 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold text-slate-600">{block.id}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    block.sealed
                      ? "border-emerald-200 text-emerald-700"
                      : "border-slate-200 text-slate-400"
                  }`}
                >
                  {block.sealed ? "Sealed" : "Pending"}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-slate-400 truncate">
                sha: {block.hash}
              </p>
              <div className="mt-0.5 flex items-center gap-1">
                <Link2 className="h-2.5 w-2.5 shrink-0 text-slate-300" />
                <span className="font-mono text-[10px] text-slate-300 truncate">
                  prev: {block.prev}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BentoSection() {
  const cards = [
    {
      tag:     "Zero-Touch CLI",
      heading: "Automated Ingestion",
      body:    "Map FDA requirements directly in your code. The omnis-run CLI binds test execution to regulatory clauses in real-time.",
      icon:    Terminal,
      visual:  <TerminalMockup />,
      /* Spans full width on the bento asymmetric layout on lg+ */
      wide:    false,
    },
    {
      tag:     "AI Triage Inbox",
      heading: "AWS Bedrock Triage",
      body:    "Stop manually reviewing false positives. Our AI agent automatically categorises test failures against your risk management files.",
      icon:    BrainCircuit,
      visual:  <TriageMockup />,
      wide:    false,
    },
    {
      tag:     "Immutable Audit Trails",
      heading: "Append-Only Ledgers",
      body:    "Cryptographically-sealed evidence logs. Generate 21 CFR Part 11 compliant traceability matrices instantly.",
      icon:    Lock,
      visual:  <LedgerMockup />,
      wide:    true, // bottom full-width card on desktop
    },
  ] as const;

  return (
    <section className="border-t border-slate-200 bg-white py-20">
      <div className="mx-auto max-w-7xl px-6">

        {/* Section header */}
        <motion.div
          className="mb-12 text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          transition={easeOut}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Core Platform
          </p>
          <h2 className="mt-2 text-2xl font-medium text-slate-900 md:text-3xl">
            Three pillars. Zero compliance debt.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
            Every layer of the Qavro pipeline is purpose-built for FDA submission requirements
            — not retrofitted onto a generic CI tool.
          </p>
        </motion.div>

        {/*
          Bento layout:
          — mobile:   1 column, all cards stack
          — md:       2 columns, card 1 & 2 sit side-by-side
          — lg:       2 columns top row + 1 full-width bottom card
          Using CSS grid areas for the asymmetric layout.
        */}
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
          variants={staggerContainer(0.1, 0)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
        >
          {/* Card 1 — Terminal */}
          <motion.div
            variants={fadeUp}
            transition={easeOut}
            className="group flex flex-col rounded border border-slate-200 bg-white p-6 transition-shadow duration-200 hover:shadow-md"
          >
            <BentoCardInner card={cards[0]} />
          </motion.div>

          {/* Card 2 — Triage */}
          <motion.div
            variants={fadeUp}
            transition={easeOut}
            className="group flex flex-col rounded border border-slate-200 bg-white p-6 transition-shadow duration-200 hover:shadow-md"
          >
            <BentoCardInner card={cards[1]} />
          </motion.div>

          {/* Card 3 — Ledger (spans both columns on md+) */}
          <motion.div
            variants={fadeUp}
            transition={easeOut}
            className="group flex flex-col rounded border border-slate-200 bg-white p-6 transition-shadow duration-200 hover:shadow-md md:col-span-2"
          >
            {/* On wide layout, split text/body left and visual right */}
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              <div className="flex flex-col md:w-80 md:shrink-0">
                <BentoCardHeader card={cards[2]} />
              </div>
              <div className="flex-1">
                <LedgerMockup />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/** Shared inner layout for cards 1 & 2 */
function BentoCardInner({
  card,
}: {
  card: {
    tag: string;
    heading: string;
    body: string;
    icon: React.ElementType;
    visual: React.ReactNode;
  };
}) {
  return (
    <>
      <BentoCardHeader card={card} />
      {card.visual}
    </>
  );
}

/** Header block: icon chip + tag + heading + body copy */
function BentoCardHeader({
  card,
}: {
  card: {
    tag: string;
    heading: string;
    body: string;
    icon: React.ElementType;
  };
}) {
  const Icon = card.icon;
  return (
    <>
      {/* Icon + tag chip */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50">
          <Icon className="h-3.5 w-3.5 text-slate-700" strokeWidth={1.75} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {card.tag}
        </span>
      </div>
      {/* Heading */}
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{card.heading}</h3>
      {/* Body */}
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{card.body}</p>
    </>
  );
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-t border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section header */}
        <motion.div
          className="mb-12 text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          transition={easeOut}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">How It Works</p>
          <h2 className="mt-2 text-2xl font-medium text-slate-900 md:text-3xl">
            From commit to compliance, automatically.
          </h2>
        </motion.div>

        {/* Step cards — staggered on scroll */}
        <motion.div
          className="relative grid grid-cols-1 gap-8 md:grid-cols-3"
          variants={staggerContainer(0.12, 0)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
        >
          <div
            aria-hidden="true"
            className="absolute left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] top-10 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent md:block"
          />
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.step}
                variants={fadeUp}
                transition={easeOut}
                className="group relative flex flex-col items-center text-center"
              >
                <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded border border-slate-200 bg-white transition-shadow group-hover:">
                  <Icon className="h-8 w-8 text-slate-700" strokeWidth={1.5} />
                  <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[10px] font-semibold text-white">
                    {step.step}
                  </span>
                </div>
                <h3 className="text-base font-medium text-slate-900">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{step.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Product Preview — id="sample-matrix" anchor target
// ---------------------------------------------------------------------------

/**
 * Expanded traceability matrix rows — 5 clauses with test suite + method columns.
 */
const expandedMatrixRows = [
  {
    clause: "5.1.1",
    title: "Software Development Planning",
    suite: "test_dev_plan_audit.py",
    method: "Doc Review",
    ts: "2026-06-09T04:12:08Z",
    hash: "a3f9c2…d841",
    compliant: true,
  },
  {
    clause: "5.3.2",
    title: "Software Architectural Design",
    suite: "test_arch_design.py",
    method: "Static Analysis",
    ts: "2026-06-09T03:47:33Z",
    hash: "b7e10d…f229",
    compliant: true,
  },
  {
    clause: "5.5.1",
    title: "Software Unit Implementation",
    suite: "test_dicom_parser.py",
    method: "Unit Test",
    ts: "2026-06-09T03:11:55Z",
    hash: "c2d84a…9b03",
    compliant: true,
  },
  {
    clause: "5.7.4",
    title: "Regression & Integration Testing",
    suite: "test_cgm_alerts.py",
    method: "CI/CD Suite",
    ts: "2026-06-09T02:58:17Z",
    hash: "d91f3e…c571",
    compliant: false,
  },
  {
    clause: "11.10(e)",
    title: "Audit Trail — Time-Stamped Records",
    suite: "test_audit_trail.py",
    method: "Log Ingestion",
    ts: "2026-06-09T02:30:44Z",
    hash: "e47a81…b362",
    compliant: true,
  },
] as const;

function ProductPreviewSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const matrixTarget = isAuthenticated ? "/dashboard" : "/login";

  return (
    <section id="sample-matrix" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section header */}
        <motion.div
          className="mb-12 text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          transition={easeOut}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Platform Preview</p>
          <h2 className="mt-2 text-2xl font-medium text-slate-900 md:text-3xl">
            The Single Source of Compliance Truth.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
            Every CI/CD run, every regulatory clause, every digital signature — unified in one
            cryptographically-sealed ledger.
          </p>
        </motion.div>

        {/* Mock browser window — max-w-6xl for wider matrix breathing room */}
        <motion.div
          className="mx-auto max-w-6xl overflow-hidden rounded border border-slate-200"
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          transition={{ ...easeOut, duration: 0.45 }}
        >
          {/* Browser chrome top bar */}
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3">
            <span className="h-3 w-3 rounded bg-red-400" />
            <span className="h-3 w-3 rounded bg-amber-400" />
            <span className="h-3 w-3 rounded bg-emerald-400" />
            <div className="ml-3 flex h-6 flex-1 items-center rounded border border-slate-200 bg-white px-3">
              <span className="text-[11px] text-slate-400">
                app.qavro.io / dashboard / traceability
              </span>
            </div>
          </div>

          {/* Inner app header strip */}
          <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-5 py-3">
            <ShieldCheck className="h-4 w-4 text-slate-700" strokeWidth={1.75} />
            <span className="text-xs font-semibold text-slate-700">Qavro</span>
            <span className="ml-2 text-[11px] text-slate-400">/</span>
            <span className="text-[11px] font-medium text-slate-600">
              IEC 62304 Traceability Matrix
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded bg-emerald-500 animate-pulse" />
              Live · 21 CFR Part 11
            </span>
          </div>

          {/*
            3-column grid (5 units total): matrix = 3 units, feed = 2 units.
            Mobile: stacks with matrix first.
          */}
          <div className="grid grid-cols-1 divide-y divide-slate-100 bg-slate-50 lg:grid-cols-5 lg:divide-x lg:divide-y-0">

            {/* ── LEFT (3/5): Traceability Matrix ─────────────────── */}
            <div className="lg:col-span-3 p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  IEC 62304 · 21 CFR Part 11 — Evidence Log
                </p>
                <span className="font-mono text-[10px] text-slate-400">
                  {expandedMatrixRows.length} clauses
                </span>
              </div>

              {/* Column headers */}
              <div className="mb-1.5 grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-3 border-b border-slate-100 pb-1.5">
                <span className="w-14 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                  Clause
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                  Requirement
                </span>
                <span className="w-20 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                  Method
                </span>
                <span className="w-20 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                  Sig
                </span>
                <span className="w-16 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
                  Status
                </span>
              </div>

              {/* Matrix rows */}
              <motion.div
                className="space-y-1.5"
                variants={staggerContainer(0.07, 0.15)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
              >
                {expandedMatrixRows.map((row) => (
                  <motion.div
                    key={row.clause}
                    variants={fadeUp}
                    transition={easeOut}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-3 rounded border border-slate-100 bg-white px-3 py-2"
                  >
                    {/* Clause + icon */}
                    <div className="flex w-14 items-center gap-1.5">
                      {row.compliant
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        : <Circle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      }
                      <span className="font-mono text-[10px] font-medium text-slate-500">
                        {row.clause}
                      </span>
                    </div>
                    {/* Title + suite */}
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-slate-800">
                        {row.title}
                      </p>
                      <p className="font-mono text-[10px] text-slate-400 truncate">
                        {row.suite}
                      </p>
                    </div>
                    {/* Method */}
                    <span className="w-20 text-[10px] text-slate-500 truncate">
                      {row.method}
                    </span>
                    {/* Sig */}
                    <span className="w-20 font-mono text-[10px] text-slate-400">
                      {row.hash}
                    </span>
                    {/* Status badge */}
                    <span
                      className={`w-16 rounded border px-1.5 py-0.5 text-center font-mono text-[9px] font-semibold uppercase tracking-wide ${
                        row.compliant
                          ? "border-emerald-200 text-emerald-700"
                          : "border-amber-200 text-amber-700"
                      }`}
                    >
                      {row.compliant ? "Compliant" : "Pending"}
                    </span>
                  </motion.div>
                ))}
              </motion.div>

              {/* Readiness footer */}
              <div className="mt-3 flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
                  <span className="text-[11px] font-semibold text-emerald-700">
                    Submission Readiness
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-emerald-600">
                    4/5 clauses verified
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-emerald-700">80.0%</span>
                </div>
              </div>
            </div>

            {/* ── RIGHT (2/5): Activity Feed ────────────────────────── */}
            <div className="lg:col-span-2 p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  CI/CD Activity
                </p>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                  <Zap className="h-3 w-3" />
                  Live
                </span>
              </div>
              <motion.div
                className="space-y-2"
                variants={staggerContainer(0.07, 0.25)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
              >
                {mockActivityFeed.map((entry, i) => (
                  <motion.div
                    key={i}
                    variants={fadeUp}
                    transition={easeOut}
                    className="rounded border border-slate-100 bg-white px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          entry.status === "success" ? "bg-emerald-500" : "bg-amber-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[10px] text-slate-600">
                          {entry.suite}
                        </p>
                        <p className="font-mono text-[9px] text-slate-400">{entry.ts}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                          entry.status === "success"
                            ? "border-emerald-200 text-emerald-700"
                            : "border-amber-200 text-amber-700"
                        }`}
                      >
                        {entry.status === "success" ? "Signed" : "Review"}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3">
            <span className="font-mono text-[11px] text-slate-400">
              5 evidence logs · Last ingested 2 min ago · Chain: VERIFIED
            </span>
            <Link
              href={matrixTarget}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
            >
              Open Full Matrix
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bottom CTA
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Security & Architecture Footer
// ---------------------------------------------------------------------------

const archPillars = [
  {
    icon:      Database,
    header:    "Supabase RLS",
    subheader: "Absolute data isolation.",
    body:      "Strict Row-Level Security policies enforced at the Postgres level. Multi-tenant architecture guarantees that cross-contamination of regulatory evidence is cryptographically impossible.",
  },
  {
    icon:      Shield,
    header:    "AES-256 Encryption",
    subheader: "Tamper-proof audit logs.",
    body:      "All Part 11 audit trails are hashed and encrypted at rest. Evidence ledgers are append-only, preventing post-execution mutation by any user or automated process.",
  },
  {
    icon:      Cpu,
    header:    "Deterministic CLI",
    subheader: "Zero silent failures.",
    body:      "The omnis-run binary is compiled under strict IEC 62304 bounds. Network drops or parsing errors trigger explicit aborts to guarantee pipeline integrity.",
  },
] as const;

function SecurityArchitectureSection() {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-20">
      <div className="mx-auto max-w-5xl px-6">
        {/* Section header */}
        <motion.div
          variants={staggerContainer(0.08, 0)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col items-center"
        >
          <motion.p
            variants={fadeUp}
            transition={easeOut}
            className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400"
          >
            Under the Hood
          </motion.p>
          <motion.h2
            variants={fadeUp}
            transition={easeOutSlow}
            className="text-center text-2xl font-medium tracking-tight text-slate-900 md:text-3xl"
          >
            Enterprise-Grade Architecture
          </motion.h2>
          <motion.div
            variants={fadeUp}
            transition={easeOut}
            className="mt-2 h-px w-12 bg-slate-300"
          />

          {/* Pillars grid — 1px hairline borders via gap-px on slate-200 wrapper */}
          <motion.div
            variants={staggerContainer(0.12, 0.1)}
            className="mt-12 grid w-full grid-cols-1 gap-px border border-slate-200 bg-slate-200 md:grid-cols-3"
          >
            {archPillars.map(({ icon: Icon, header, subheader, body }) => (
              <motion.div
                key={header}
                variants={fadeUp}
                transition={easeOut}
                /*
                 * Normal flow card — no absolute children, no overflow-hidden.
                 * The grid row height stretches uniformly across all 3 columns
                 * as the hovered card expands, keeping the 1px gap lines intact.
                 */
                className="group flex flex-col bg-slate-50 p-10 transition-colors duration-300 hover:bg-white"
              >
                {/* Icon chip */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-slate-200 bg-white transition-colors duration-300 group-hover:border-slate-300">
                  <Icon className="h-4 w-4 text-slate-500 transition-colors duration-300 group-hover:text-slate-800" strokeWidth={1.5} />
                </div>

                {/* Header — always visible */}
                <p className="mt-5 font-mono text-sm font-semibold tracking-tight text-slate-800">
                  {header}
                </p>

                {/* Sub-header — always visible, sits directly under header */}
                <p className="mt-1 text-xs text-slate-400">
                  {subheader}
                </p>

                {/*
                 * Body copy wrapper — max-height expansion from 0 → 200px.
                 * overflow-hidden is scoped to this div only, so the card
                 * itself is free to grow in the normal flow.
                 */}
                <div className="overflow-hidden transition-all duration-300 ease-in-out max-h-0 opacity-0 group-hover:max-h-[200px] group-hover:opacity-100 group-hover:mt-4">
                  <p className="text-sm leading-relaxed text-slate-500">
                    {body}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function BottomCTASection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const ctaTarget = isAuthenticated ? "/pricing" : "/signup";

  return (
    <section className="border-t border-slate-200 bg-slate-50 py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <motion.div
          variants={staggerContainer(0.1, 0)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          className="flex flex-col items-center"
        >
          <motion.div
            variants={fadeUp}
            transition={easeOut}
            className="mb-5 inline-flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3.5 py-1.5"
          >
            <span className="h-1.5 w-1.5 rounded bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold tracking-wide text-emerald-700">Get Started Today</span>
          </motion.div>

          <motion.h2
            variants={fadeUp}
            transition={easeOutSlow}
            className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl"
          >
            Ready to automate your<br />regulatory pipeline?
          </motion.h2>

          <motion.p
            variants={fadeUp}
            transition={easeOut}
            className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-slate-500"
          >
            Get your workspace eSTAR-ready in less than five minutes.
          </motion.p>

          <motion.div
            variants={fadeUp}
            transition={easeOut}
            className="mt-8"
          >
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                href={ctaTarget}
                className="inline-flex items-center gap-2.5 rounded bg-slate-900 px-8 py-4 text-sm font-medium text-white shadow-slate-900/20 transition-all hover:bg-slate-800"
              >
                {isAuthenticated ? "Go to Dashboard" : "Get Started"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </motion.div>

          <motion.p
            variants={fadeUp}
            transition={easeOut}
            className="mt-5 text-xs text-slate-400"
          >
            No credit card required · IEC 62304 compliant from day one
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <motion.footer
      className="border-t border-slate-200 bg-white py-8"
      variants={fadeIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.8 }}
      transition={{ ...easeOut, duration: 0.4 }}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
          <span className="text-xs font-medium text-slate-500">
            © 2026 Qavro. All rights reserved.
          </span>
        </div>
        <p className="text-xs text-slate-400">
          IEC 62304 · 21 CFR Part 11 · FDA eSTAR Compliant Pipeline
        </p>
      </div>
    </motion.footer>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setUserEmail(session?.user?.email ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setUserEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header isAuthenticated={isAuthenticated} userEmail={userEmail} />
      <main className="flex-1">
        <HeroSection />
        <BentoSection />
        <HowItWorksSection />
        <ProductPreviewSection isAuthenticated={isAuthenticated} />
        <SecurityArchitectureSection />
        <BottomCTASection isAuthenticated={isAuthenticated} />
      </main>
      <Footer />
    </div>
  );
}
