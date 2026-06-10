"use client";
// omnis-ui/app/page.tsx
// Omnis MedTech Corp — Public Marketing Landing Page
//
// Client Component — reads Supabase auth state to dynamically route CTAs.
//
// Session-aware routing:
//   Authenticated   → Sign In / View Compliance Matrix → /dashboard
//                   → Get Started (bottom CTA)         → /dashboard
//   Unauthenticated → Sign In / View Compliance Matrix → /login
//                   → Get Started (bottom CTA)         → /signup
//
// Sections:
//   1. Header         — logo + Sign In only (no nav links)
//   2. Hero           — headline, sub-headline, trust badges (no CTA buttons)
//   3. How It Works   — 3-step pipeline
//   4. Product Preview — browser mockup with mini matrix + activity feed
//   5. Bottom CTA     — "Ready to automate your regulatory pipeline?"
//   6. Footer

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
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
} from "lucide-react";

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

// Mock data for the product preview section
const mockMatrixRows = [
  {
    clause: "5.1.1",
    title: "Software Development Planning",
    hash: "a3f9c2…d841",
    compliant: true,
  },
  {
    clause: "5.3.2",
    title: "Software Architectural Design",
    hash: "b7e10d…f229",
    compliant: true,
  },
  {
    clause: "5.5.1",
    title: "Software Unit Implementation",
    hash: "c2d84a…9b03",
    compliant: true,
  },
  {
    clause: "5.7.4",
    title: "Regression & Integration Testing",
    hash: "d91f3e…c571",
    compliant: false,
  },
];

const mockActivityFeed = [
  {
    status: "success",
    message: "omnis-run: Verification Successful — Payload Signed",
    ts: "2026-06-09T04:12:08Z",
    suite: "test_dicom_parser.py",
  },
  {
    status: "success",
    message: "omnis-run: Verification Successful — Payload Signed",
    ts: "2026-06-09T03:47:33Z",
    suite: "test_phi_anonymizer.py",
  },
  {
    status: "warning",
    message: "omnis-run: Anomaly Detected — AI Review Flagged",
    ts: "2026-06-09T03:11:55Z",
    suite: "test_cgm_alerts.py",
  },
  {
    status: "success",
    message: "omnis-run: Verification Successful — Payload Signed",
    ts: "2026-06-09T02:58:17Z",
    suite: "test_soup_codecs.py",
  },
  {
    status: "success",
    message: "omnis-run: Verification Successful — Payload Signed",
    ts: "2026-06-09T02:30:44Z",
    suite: "test_s3_ecg_pipeline.py",
  },
];

// ---------------------------------------------------------------------------
// Header — logo + Sign In only, no internal nav links
// ---------------------------------------------------------------------------

function Header({ isAuthenticated }: { isAuthenticated: boolean }) {
  const signInTarget = isAuthenticated ? "/dashboard" : "/login";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-slate-200 group-hover:ring-emerald-400 transition-all duration-200 dark:ring-slate-700">
            <ShieldCheck className="h-4 w-4 text-slate-800 dark:text-slate-200" strokeWidth={1.75} />
          </div>
          <div className="leading-none">
            <span className="block text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Omnis MedTech Corp
            </span>
            <span className="block text-[10px] font-medium tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
              RegOps Platform
            </span>
          </div>
        </Link>

        {/* Sign In — only CTA in the nav */}
        <Link
          href={signInTarget}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          {isAuthenticated ? "Dashboard" : "Sign In"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero — headline + trust badges only, no CTA buttons in this section
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white dark:bg-slate-950">
      {/* Grid background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-60 dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] dark:opacity-30"
      />
      {/* Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-96 w-[800px] rounded-full bg-emerald-400/10 blur-3xl dark:bg-emerald-600/10"
      />

      <div className="relative mx-auto max-w-5xl px-6 py-28 text-center md:py-36">
        {/* Eyebrow badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 dark:border-emerald-800 dark:bg-emerald-950">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-300">
            FDA eSTAR · IEC 62304 · 21 CFR Part 11
          </span>
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-[1.08] tracking-tight text-slate-900 dark:text-slate-50 md:text-6xl lg:text-7xl">
          Automated eSTAR Compliance{" "}
          <span className="text-emerald-600 dark:text-emerald-400">
            for Modern MedTech.
          </span>
        </h1>

        {/* Sub-headline */}
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500 dark:text-slate-400 md:text-xl">
          Continuous CI/CD traceability and automated IEC 62304 document
          generation — so your engineering team ships features, not paperwork.
        </p>

        {/* Trust badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {trustBadges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
            >
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How It Works
// ---------------------------------------------------------------------------

function HowItWorksSection() {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
            How It Works
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 md:text-3xl">
            From commit to compliance, automatically.
          </h2>
        </div>

        <div className="relative grid grid-cols-1 gap-8 md:grid-cols-3">
          <div
            aria-hidden="true"
            className="absolute left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] top-10 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent md:block dark:via-slate-700"
          />

          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.step} className="group relative flex flex-col items-center text-center">
                <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow group-hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                  <Icon className="h-8 w-8 text-slate-700 dark:text-slate-300" strokeWidth={1.5} />
                  <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-sm">
                    {step.step}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Product Preview — browser chrome mockup with two panels
// ---------------------------------------------------------------------------

function ProductPreviewSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const matrixTarget = isAuthenticated ? "/dashboard" : "/login";

  return (
    <section className="bg-white py-24 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section header */}
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
            Platform Preview
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 md:text-3xl">
            The Single Source of Compliance Truth.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Every CI/CD run, every regulatory clause, every digital signature — unified in one
            cryptographically-sealed ledger.
          </p>
        </div>

        {/* Browser chrome wrapper */}
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/60 dark:border-slate-700 dark:shadow-slate-900/60">
          {/* Browser top bar */}
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
            <div className="ml-3 flex h-6 flex-1 items-center rounded-md border border-slate-200 bg-white px-3 dark:border-slate-600 dark:bg-slate-700">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                omnis-regops.app / dashboard
              </span>
            </div>
          </div>

          {/* Inner app chrome — header strip */}
          <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
            <ShieldCheck className="h-4 w-4 text-slate-700 dark:text-slate-300" strokeWidth={1.75} />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Omnis RegOps</span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live · IEC 62304 · 21 CFR Part 11
            </span>
          </div>

          {/* Two-panel content area */}
          <div className="grid grid-cols-1 divide-y divide-slate-100 bg-slate-50 dark:divide-slate-800 dark:bg-slate-900/60 md:grid-cols-2 md:divide-x md:divide-y-0">

            {/* LEFT: Mini Compliance Matrix */}
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  IEC 62304 Traceability Matrix
                </p>
                <span className="text-[10px] text-slate-400">4 clauses</span>
              </div>
              <div className="space-y-2">
                {mockMatrixRows.map((row) => (
                  <div
                    key={row.clause}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {/* Status dot */}
                    {row.compliant ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-amber-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          §{row.clause}
                        </span>
                        <span className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          {row.title}
                        </span>
                      </div>
                      <span className="mt-0.5 font-mono text-[10px] text-slate-400">
                        sig: {row.hash}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                        row.compliant
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                      }`}
                    >
                      {row.compliant ? "Compliant" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/40">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  Submission Readiness
                </span>
                <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  75.0%
                </span>
              </div>
            </div>

            {/* RIGHT: CI/CD Activity Feed */}
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  CI/CD Activity Feed
                </p>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <Zap className="h-3 w-3" />
                  Live
                </span>
              </div>
              <div className="space-y-2">
                {mockActivityFeed.map((entry, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          entry.status === "success"
                            ? "bg-emerald-500"
                            : "bg-amber-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium leading-snug text-slate-700 dark:text-slate-300">
                          {entry.message}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400">
                            {entry.suite}
                          </span>
                          <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {entry.ts}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar with CTA */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[11px] text-slate-400">
              5 evidence logs · Last ingested 2 min ago
            </span>
            <Link
              href={matrixTarget}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400"
            >
              View Compliance Matrix
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bottom CTA
// ---------------------------------------------------------------------------

function BottomCTASection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const ctaTarget = isAuthenticated ? "/dashboard" : "/signup";

  return (
    <section className="border-t border-slate-200 bg-slate-50 py-24 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto max-w-3xl px-6 text-center">
        {/* Eyebrow */}
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 dark:border-emerald-800 dark:bg-emerald-950">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-300">
            Get Started Today
          </span>
        </div>

        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 md:text-4xl">
          Ready to automate your<br />regulatory pipeline?
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-slate-500 dark:text-slate-400">
          Get your workspace eSTAR-ready in less than five minutes.
        </p>

        <div className="mt-8">
          <Link
            href={ctaTarget}
            className="inline-flex items-center gap-2.5 rounded-xl bg-slate-900 px-8 py-4 text-sm font-bold text-white shadow-xl shadow-slate-900/20 transition-all hover:bg-slate-800 hover:shadow-slate-900/30 dark:bg-emerald-500 dark:text-slate-900 dark:shadow-emerald-900/30 dark:hover:bg-emerald-400"
          >
            {isAuthenticated ? "Go to Dashboard" : "Get Started"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Micro trust line */}
        <p className="mt-5 text-xs text-slate-400 dark:text-slate-600">
          No credit card required · IEC 62304 compliant from day one
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-500">
            © 2026 Omnis MedTech Corp. All rights reserved.
          </span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-600">
          IEC 62304 · 21 CFR Part 11 · FDA eSTAR Compliant Pipeline
        </p>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-slate-950">
      <Header isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <HeroSection />
        <HowItWorksSection />
        <ProductPreviewSection isAuthenticated={isAuthenticated} />
        <BottomCTASection isAuthenticated={isAuthenticated} />
      </main>
      <Footer />
    </div>
  );
}
