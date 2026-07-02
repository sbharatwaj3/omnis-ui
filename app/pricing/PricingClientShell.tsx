"use client";

// omnis-ui/app/pricing/PricingClientShell.tsx
//
// Client shell for the pricing page. All framer-motion animations live here.
// The parent page.tsx is a Server Component; it passes serialisable props
// (orgId, userEmail) down so secrets never leak to the client bundle.
//
// Animation mandate (animation-standards.md):
//  - Framer Motion only — no raw CSS transitions for entrances.
//  - MedTech aesthetic: fast, institutional, zero bounce.
//    The steering rules say "ease-out or linear easing profiles" and explicitly
//    forbid bounce/elasticity, so we use easeOut tweens (duration ≤ 0.35s)
//    instead of springs for page-level mounts.
//  - AnimatePresence wraps any conditionally rendered subtrees.
//  - Stagger: pricing cards stagger at 0.08s intervals.

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence, type Variants, type Transition } from "framer-motion";
import {
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Zap,
  BarChart3,
  Lock,
  Users,
  GitBranch,
  Brain,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CheckoutButton } from "@/components/CheckoutButton";
import { PricingSignOutButton } from "@/components/PricingSignOutButton";
import { tiers, complianceBadges } from "./pricing-data";
import type { PricingTier } from "./pricing-data";

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

/**
 * Subtle institutional entrance: fade + 10px Y lift, easeOut, no bounce.
 * Uses `custom` prop for per-element delay injection.
 * Typed explicitly so framer-motion v12's strict Variants type is satisfied.
 */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.32,
      ease: [0.0, 0.0, 0.2, 1.0] as [number, number, number, number], // cubic-bezier easeOut
      delay,
    } satisfies Transition,
  }),
};

/** Container that staggers its direct motion children. */
const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.12,
    } satisfies Transition,
  },
};

/** Card child variant — used inside the stagger container. */
const cardVariant: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.0, 0.0, 0.2, 1.0] as [number, number, number, number],
    } satisfies Transition,
  },
};

// ---------------------------------------------------------------------------
// Icon resolver (avoids passing React.ElementType across the server boundary)
// ---------------------------------------------------------------------------

const iconMap: Record<string, LucideIcon> = {
  ShieldCheck,
  GitBranch,
  Brain,
  BarChart3,
  Users,
  Lock,
};

function resolveIcon(name: string): LucideIcon {
  return iconMap[name] ?? ShieldCheck;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface PricingClientShellProps {
  orgId: string | null;
  userEmail: string | null;
}

function PricingHeader({ userEmail }: { userEmail: string | null }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded ring-1 ring-slate-200 group-hover:ring-emerald-400 transition-all duration-200">
            <ShieldCheck className="h-4 w-4 text-slate-800" strokeWidth={1.75} />
          </div>
          <div className="leading-none">
            <span className="block text-sm font-bold tracking-tight text-slate-900">
              Qavro
            </span>
            <span className="block text-[10px] font-medium tracking-widest text-emerald-600 uppercase">
              FDA Assurance Platform
            </span>
          </div>
        </Link>

        <AnimatePresence mode="wait">
          {userEmail ? (
            <motion.div
              key="signout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <PricingSignOutButton email={userEmail} />
            </motion.div>
          ) : (
            <motion.div
              key="signin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-all hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                Sign In
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero Section
// ---------------------------------------------------------------------------

function PricingHero() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* Subtle grid background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-60"
      />
      {/* Emerald glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-72 w-[700px] rounded bg-emerald-400/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-4xl px-6 py-20 text-center md:py-28">
        {/* Eyebrow badge */}
        <motion.div
          className="mb-5 inline-flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3.5 py-1.5"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <Zap className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold tracking-wide text-emerald-700">
            Simple, usage-based pricing
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl lg:text-6xl"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0.08}
        >
          Simple, transparent pricing for MedTech teams.
        </motion.h1>

        {/* Compliance badges — stagger as a group */}
        <motion.div
          className="mt-8 flex flex-wrap items-center justify-center gap-2.5"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {complianceBadges.map((badge) => (
            <motion.span
              key={badge}
              variants={cardVariant}
              className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {badge}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing Cards Grid
// ---------------------------------------------------------------------------

function PricingCard({
  tier,
  orgId,
}: {
  tier: PricingTier;
  orgId: string | null;
}) {
  return (
    <motion.div
      variants={cardVariant}
      className={[
        "relative flex flex-col rounded border bg-white p-7 transition-colors",
        tier.highlight
          ? "border-emerald-400 ring-2 ring-emerald-400"
          : "border-slate-200 hover:border-slate-300",
      ].join(" ")}
      // Hover lift is forbidden (no drop shadows). Subtle border shift handled
      // via Tailwind hover: above. We add a scale micro-interaction on click.
      whileTap={{ scale: 0.99 }}
    >
      {/* Popular badge */}
      <AnimatePresence>
        {tier.badge && (
          <motion.div
            className="absolute -top-3.5 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: "easeOut", delay: 0.35 }}
          >
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-500 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
              <Zap className="h-3 w-3" aria-hidden="true" />
              {tier.badge}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tier header */}
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          {tier.name}
        </p>
        <div className="mt-2 flex items-end gap-1.5">
          <span className="text-4xl font-extrabold tracking-tight text-slate-900">
            {tier.priceLabel}
          </span>
          <span className="mb-1.5 text-sm font-medium text-slate-400">
            / month
          </span>
        </div>
        {/* Token allocation */}
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-0.5">
          <Brain className="h-3 w-3 text-emerald-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-slate-600">
            {tier.tokenUnits}
          </span>
        </div>
      </div>

      {/* Tagline */}
      <p className="mb-1 text-sm leading-relaxed text-slate-500">
        {tier.tagline}
      </p>

      {/* Value note */}
      <p className="mb-5 text-[11px] font-medium text-emerald-600">
        {tier.valueNote}
      </p>

      {/* Features list */}
      <ul
        className="mb-7 flex-1 space-y-2.5"
        aria-label={`${tier.name} plan features`}
      >
        {tier.features.map(({ iconName, text }) => {
          const Icon = resolveIcon(iconName);
          return (
            <li key={text} className="flex items-start gap-2.5">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                aria-hidden="true"
              />
              <span className="text-sm text-slate-700">{text}</span>
            </li>
          );
        })}
      </ul>

      {/* CTA */}
      {orgId ? (
        <CheckoutButton
          orgId={orgId}
          label={tier.ctaLabel}
          className={[
            "inline-flex w-full items-center justify-center gap-2 rounded px-6 py-3.5 text-sm font-bold transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
            tier.highlight
              ? "bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500"
              : "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900",
          ].join(" ")}
        />
      ) : (
        <Link
          href={`/signup?tier=${tier.id}`}
          className={[
            "inline-flex w-full items-center justify-center gap-2 rounded px-6 py-3.5 text-sm font-bold transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            tier.highlight
              ? "bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500"
              : "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900",
          ].join(" ")}
        >
          {tier.ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </motion.div>
  );
}

function PricingCards({ orgId }: { orgId: string | null }) {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        {/* Token-unit explanation callout */}
        <motion.div
          className="mx-auto mb-12 max-w-2xl rounded border border-slate-200 bg-white px-5 py-4 text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          custom={0}
        >
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              What&apos;s a token-unit?
            </span>{" "}
            One unit equals one AWS Bedrock inference call through the Omnis
            pipeline — an AI document analysis, a semantic regulatory match, or
            a compliance summary. Unused units don&apos;t roll over; overage is
            billed at the next tier&apos;s rate.
          </p>
        </motion.div>

        {/* Cards — staggered grid */}
        <motion.div
          className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8 lg:gap-10"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          {tiers.map((tier) => (
            <PricingCard key={tier.id} tier={tier} orgId={orgId} />
          ))}
        </motion.div>

        {/* Bottom micro-copy */}
        <motion.p
          className="mt-8 text-center text-xs text-slate-400"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0.2}
        >
          30-day free trial &middot; Cancel anytime &middot; No setup fees
        </motion.p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Token-tier comparison table
// ---------------------------------------------------------------------------

function TokenComparisonTable() {
  const rows = [
    {
      label: "Monthly token-units",
      starter: "500",
      growth: "1,200",
      scale: "2,500",
    },
    {
      label: "Cost per token-unit",
      starter: "$1.00",
      growth: "$0.75",
      scale: "$0.56",
    },
    {
      label: "Overage rate (next tier)",
      starter: "$0.75",
      growth: "$0.56",
      scale: "Contact us",
    },
    {
      label: "Team members",
      starter: "Up to 3",
      growth: "Up to 10",
      scale: "Unlimited",
    },
    {
      label: "eSTAR PDF export",
      starter: "Yes",
      growth: "Yes",
      scale: "Yes",
    },
    {
      label: "HMAC-signed evidence ledger",
      starter: "Yes",
      growth: "Yes",
      scale: "Yes",
    },
    { label: "SSO / SAML", starter: "—", growth: "—", scale: "Yes" },
    {
      label: "SLA support",
      starter: "—",
      growth: "Email",
      scale: "Priority",
    },
  ];

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          className="mb-8 text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          custom={0}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Compare Plans
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            Understand what you&apos;re getting
          </h2>
        </motion.div>

        <motion.div
          className="overflow-x-auto rounded border border-slate-200"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          custom={0.1}
        >
          <table
            className="w-full text-sm"
            aria-label="Plan feature comparison"
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Feature
                </th>
                {["Starter", "Growth", "Scale"].map((name) => (
                  <th
                    key={name}
                    className={[
                      "px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wider",
                      name === "Growth"
                        ? "text-emerald-600"
                        : "text-slate-500",
                    ].join(" ")}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className="transition-colors hover:bg-slate-50"
                >
                  <td className="px-5 py-3 font-medium text-slate-700">
                    {row.label}
                  </td>
                  <td className="px-5 py-3 text-center text-slate-600">
                    {row.starter}
                  </td>
                  <td className="px-5 py-3 text-center font-semibold text-emerald-700">
                    {row.growth}
                  </td>
                  <td className="px-5 py-3 text-center text-slate-600">
                    {row.scale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bottom CTA
// ---------------------------------------------------------------------------

function BottomCTA({ orgId }: { orgId: string | null }) {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-16">
      <motion.div
        className="mx-auto max-w-3xl px-6 text-center"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
      >
        <motion.p
          className="mb-6 text-lg font-semibold text-slate-700"
          variants={cardVariant}
        >
          Ready to shift compliance left?
        </motion.p>

        <motion.div variants={cardVariant}>
          {orgId ? (
            <CheckoutButton
              orgId={orgId}
              label="Start 30-Day Free Trial"
              className="inline-flex items-center justify-center gap-2 rounded bg-emerald-500 px-8 py-3.5 text-sm font-bold text-white transition-all hover:bg-emerald-600 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            />
          ) : (
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded bg-emerald-500 px-8 py-3.5 text-sm font-bold text-white transition-all hover:bg-emerald-600 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              Start 30-Day Free Trial
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="h-4 w-4 text-slate-400"
            strokeWidth={1.75}
          />
          <span className="text-xs font-medium text-slate-500">
            &copy; 2026 Qavro. All rights reserved.
          </span>
        </div>
        <p className="text-xs text-slate-400">
          IEC 62304 &middot; 21 CFR Part 11 &middot; FDA eSTAR Compliant
          Pipeline
        </p>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Shell export - consumed by the Server Component page
// ---------------------------------------------------------------------------

export function PricingClientShell({ orgId, userEmail }: PricingClientShellProps) {
  return (
    <>
      <PricingHeader userEmail={userEmail} />
      <main className="flex-1">
        <PricingHero />
        <PricingCards orgId={orgId} />
        <TokenComparisonTable />
        <BottomCTA orgId={orgId} />
      </main>
      <Footer />
    </>
  );
}
