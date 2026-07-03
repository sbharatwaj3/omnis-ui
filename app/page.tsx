"use client";
// omnis-ui/app/page.tsx
// Omnis MedTech Corp — Public Marketing Landing Page
//
// ALL DARK MODE CLASSES REMOVED. This page is hardcoded light-only.
// The application enforces light mode globally via globals.css and layout.tsx.

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
            <span className="block text-sm font-bold tracking-tight text-slate-900">Qavro</span>
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
      {/* Subtle grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-60"
      />
      {/* Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-96 w-[800px] rounded bg-emerald-400/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl px-6 py-28 text-center md:py-36">
        {/* Stagger container for all hero children */}
        <motion.div
          variants={staggerContainer(0.1, 0.05)}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center"
        >
          {/* Eyebrow badge */}
          <motion.div
            variants={fadeUp}
            transition={easeOut}
            className="mb-6 inline-flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3.5 py-1.5"
          >
            <span className="h-1.5 w-1.5 rounded bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold tracking-wide text-emerald-700">
              FDA eSTAR · IEC 62304 · 21 CFR Part 11
            </span>
          </motion.div>

          {/* H1 */}
          <motion.h1
            variants={fadeUp}
            transition={easeOutSlow}
            className="mx-auto max-w-4xl text-5xl font-extrabold leading-[1.08] tracking-tight text-slate-900 md:text-6xl lg:text-7xl"
          >
            Automated eSTAR Compliance{" "}
            <span className="text-emerald-600">for Modern MedTech.</span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            variants={fadeUp}
            transition={easeOutSlow}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500 md:text-xl"
          >
            Continuous CI/CD traceability and automated IEC 62304 document
            generation — so your engineering team ships features, not paperwork.
          </motion.p>

          {/* Trust badges — stagger each badge */}
          <motion.div
            variants={staggerContainer(0.06, 0.1)}
            initial="hidden"
            animate="visible"
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            {trustBadges.map((badge) => (
              <motion.span
                key={badge}
                variants={fadeUp}
                transition={easeOut}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
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
// How It Works
// ---------------------------------------------------------------------------

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
          <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">
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
                  <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[10px] font-bold text-white">
                    {step.step}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{step.title}</h3>
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
// Product Preview
// ---------------------------------------------------------------------------

function ProductPreviewSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const matrixTarget = isAuthenticated ? "/dashboard" : "/login";

  return (
    <section className="bg-white py-24">
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
          <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">
            The Single Source of Compliance Truth.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
            Every CI/CD run, every regulatory clause, every digital signature — unified in one
            cryptographically-sealed ledger.
          </p>
        </motion.div>

        {/* Mock browser window */}
        <motion.div
          className="mx-auto max-w-5xl overflow-hidden rounded border border-slate-200 shadow-slate-200/60"
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
              <span className="text-[11px] text-slate-400">omnis-regops.app / dashboard</span>
            </div>
          </div>

          {/* Inner app header strip */}
          <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-5 py-3">
            <ShieldCheck className="h-4 w-4 text-slate-700" strokeWidth={1.75} />
            <span className="text-xs font-semibold text-slate-700">Qavro</span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded bg-emerald-500 animate-pulse" />
              Live · IEC 62304 · 21 CFR Part 11
            </span>
          </div>

          {/* Two-panel content */}
          <div className="grid grid-cols-1 divide-y divide-slate-100 bg-slate-50 md:grid-cols-2 md:divide-x md:divide-y-0">
            {/* LEFT: Compliance Matrix — rows stagger in */}
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">IEC 62304 Traceability Matrix</p>
                <span className="text-[10px] text-slate-400">4 clauses</span>
              </div>
              <motion.div
                className="space-y-2"
                variants={staggerContainer(0.07, 0.15)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
              >
                {mockMatrixRows.map((row) => (
                  <motion.div
                    key={row.clause}
                    variants={fadeUp}
                    transition={easeOut}
                    className="flex items-center gap-3 rounded border border-slate-100 bg-white px-3 py-2.5"
                  >
                    {row.compliant
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      : <Circle className="h-4 w-4 shrink-0 text-amber-400" />
                    }
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-500">§{row.clause}</span>
                        <span className="truncate text-[11px] font-medium text-slate-700">{row.title}</span>
                      </div>
                      <span className="mt-0.5 font-mono text-[10px] text-slate-400">sig: {row.hash}</span>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      row.compliant ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {row.compliant ? "Compliant" : "Pending"}
                    </span>
                  </motion.div>
                ))}
              </motion.div>
              <div className="mt-3 flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span className="text-[11px] font-semibold text-emerald-700">Submission Readiness</span>
                <span className="text-sm font-bold tabular-nums text-emerald-700">75.0%</span>
              </div>
            </div>

            {/* RIGHT: Activity Feed — rows stagger in with slight delay offset */}
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">CI/CD Activity Feed</p>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                  <Zap className="h-3 w-3" />Live
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
                    className="rounded border border-slate-100 bg-white px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded ${entry.status === "success" ? "bg-emerald-500" : "bg-amber-400"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium leading-snug text-slate-700">{entry.message}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400">{entry.suite}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="font-mono text-[10px] text-slate-400">{entry.ts}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3">
            <span className="text-[11px] text-slate-400">5 evidence logs · Last ingested 2 min ago</span>
            <Link href={matrixTarget} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 transition-colors hover:text-emerald-700">
              View Compliance Matrix
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
            className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl"
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
                className="inline-flex items-center gap-2.5 rounded bg-slate-900 px-8 py-4 text-sm font-bold text-white shadow-slate-900/20 transition-all hover:bg-slate-800"
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
        <HowItWorksSection />
        <ProductPreviewSection isAuthenticated={isAuthenticated} />
        <BottomCTASection isAuthenticated={isAuthenticated} />
      </main>
      <Footer />
    </div>
  );
}
