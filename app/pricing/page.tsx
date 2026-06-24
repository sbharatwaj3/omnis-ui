// omnis-ui/app/pricing/page.tsx
// Omnis RegOps — SaaS Pricing Page
//
// Three-tier pricing designed around Bedrock token consumption:
//   Starter  $499/mo   — 500 token-units    (teams getting started)
//   Growth   $899/mo   — 1,200 token-units  (active MedTech teams; 10% vs raw cost)
//   Scale    $1,399/mo — 2,500 token-units  (high-volume; $500 cheaper than overage)
//
// The Growth tier is highlighted as "Most Popular".
// CheckoutButton is embedded in each card; orgId is read from Supabase session.
// Page is a Server Component — auth check is done here, orgId passed to client.

import { cookies } from "next/headers";
import Link from "next/link";
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
import { createClient } from "@/utils/supabase/server";
import { CheckoutButton } from "@/components/CheckoutButton";
import { PricingSignOutButton } from "@/components/PricingSignOutButton";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

interface PricingTier {
  id: string;
  name: string;
  price: number;
  priceLabel: string;
  tokenUnits: string;
  tagline: string;
  highlight: boolean;
  badge?: string;
  valueNote: string;
  features: Array<{ icon: React.ElementType; text: string }>;
  ctaLabel: string;
}

const tiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    price: 499,
    priceLabel: "$499",
    tokenUnits: "500 token-units / mo",
    tagline: "For small MedTech teams shipping their first regulated device.",
    highlight: false,
    valueNote: "Ideal up to ~500 Bedrock inference calls per month.",
    features: [
      { icon: ShieldCheck, text: "Automated 21 CFR Part 11 Audits" },
      { icon: GitBranch,  text: "Unlimited CLI Ingestions (< 200ms)" },
      { icon: Brain,      text: "AWS Bedrock Document Intelligence" },
      { icon: BarChart3,  text: "Real-time Traceability Matrix" },
      { icon: Users,      text: "Role-Based Access Control (QA, Dev, Viewer)" },
      { icon: Lock,       text: "HMAC-Signed Evidence Ledger" },
    ],
    ctaLabel: "Get Started",
  },
  {
    id: "growth",
    name: "Growth",
    price: 899,
    priceLabel: "$899",
    tokenUnits: "1,200 token-units / mo",
    tagline: "For active teams running multiple concurrent device pipelines.",
    highlight: true,
    badge: "Most Popular",
    valueNote: "1,200 units at $0.75/unit — vs $1,000+ raw cost. Save 10%.",
    features: [
      { icon: ShieldCheck, text: "Everything in Starter" },
      { icon: GitBranch,  text: "Unlimited CLI Ingestions (< 200ms)" },
      { icon: Brain,      text: "Priority AWS Bedrock AI pipeline" },
      { icon: BarChart3,  text: "Advanced Traceability & Diff Reports" },
      { icon: Users,      text: "Up to 10 team members" },
      { icon: Lock,       text: "eSTAR PDF Export · Audit-Ready Package" },
    ],
    ctaLabel: "Start Growing",
  },
  {
    id: "scale",
    name: "Scale",
    price: 1399,
    priceLabel: "$1,399",
    tokenUnits: "2,500 token-units / mo",
    tagline: "For enterprise MedTech teams with high-volume submission cycles.",
    highlight: false,
    valueNote: "2,500 units for $1,399 — upgrading saves ~$500 vs Growth + overage.",
    features: [
      { icon: ShieldCheck, text: "Everything in Growth" },
      { icon: GitBranch,  text: "Unlimited CLI Ingestions (< 200ms)" },
      { icon: Brain,      text: "Dedicated Bedrock inference budget" },
      { icon: BarChart3,  text: "Multi-org Dashboard & Rollup Reports" },
      { icon: Users,      text: "Unlimited team members + SSO" },
      { icon: Lock,       text: "SLA Support · Custom Regulatory Mapping" },
    ],
    ctaLabel: "Scale Up",
  },
];

const complianceBadges = [
  "FDA 21 CFR Part 11",
  "IEC 62304",
  "eSTAR Ready",
  "HMAC-Sealed",
];

// ---------------------------------------------------------------------------
// Header — matches the landing page header
// ---------------------------------------------------------------------------

interface PricingHeaderProps {
  /** Authenticated user's email, or null if not signed in. */
  userEmail: string | null;
}

function PricingHeader({ userEmail }: PricingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-slate-200 group-hover:ring-emerald-400 transition-all duration-200">
            <ShieldCheck className="h-4 w-4 text-slate-800" strokeWidth={1.75} />
          </div>
          <div className="leading-none">
            <span className="block text-sm font-bold tracking-tight text-slate-900">
              QAVRO
            </span>
            <span className="block text-[10px] font-medium tracking-widest text-emerald-600 uppercase">
              FDA Assurance Platform
            </span>
          </div>
        </Link>

        {/* Right-side nav: escape hatch for authenticated-but-unsubscribed users */}
        {userEmail ? (
          // Authenticated: show the user's email + a Sign Out button so they
          // are never trapped on this page without a way to exit the session.
          <PricingSignOutButton email={userEmail} />
        ) : (
          // Unauthenticated: standard Sign In link.
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50"
          >
            Sign In
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
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
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-72 w-[700px] rounded-full bg-emerald-400/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-4xl px-6 py-20 text-center md:py-28">
        {/* Eyebrow */}
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5">
          <Zap className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold tracking-wide text-emerald-700">
            Simple, usage-based pricing
          </span>
        </div>
        {/* Headline */}
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
          Simple, transparent pricing for MedTech teams.
        </h1>
        {/* Compliance badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {complianceBadges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing Cards Grid
// ---------------------------------------------------------------------------

function PricingCards({ orgId }: { orgId: string | null }) {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6">

        {/* Token-unit explanation callout */}
        <div className="mx-auto mb-12 max-w-2xl rounded-xl border border-slate-200 bg-white px-5 py-4 text-center">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">What&apos;s a token-unit?</span>
            {" "}One unit equals one AWS Bedrock inference call through the Omnis pipeline —
            an AI document analysis, a semantic regulatory match, or a compliance summary.
            Unused units don&apos;t roll over; overage is billed at the next tier&apos;s rate.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8 lg:gap-10">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={[
                "relative flex flex-col rounded-2xl border bg-white p-7 shadow-sm transition-shadow",
                tier.highlight
                  ? "border-emerald-400 shadow-emerald-100 ring-2 ring-emerald-400"
                  : "border-slate-200 hover:shadow-md",
              ].join(" ")}
            >
              {/* Popular badge */}
              {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-500 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                    <Zap className="h-3 w-3" aria-hidden="true" />
                    {tier.badge}
                  </span>
                </div>
              )}

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
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5">
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
              <ul className="mb-7 flex-1 space-y-2.5" aria-label={`${tier.name} plan features`}>
                {tier.features.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2.5">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-slate-700">{text}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {orgId ? (
                <CheckoutButton
                  orgId={orgId}
                  label={tier.ctaLabel}
                  className={[
                    "inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                    tier.highlight
                      ? "bg-emerald-500 text-white shadow-emerald-200 hover:bg-emerald-600 focus-visible:ring-emerald-500"
                      : "bg-slate-900 text-white shadow-slate-200/60 hover:bg-slate-800 focus-visible:ring-slate-900",
                  ].join(" ")}
                />
              ) : (
                <Link
                  href={`/signup?tier=${tier.id}`}
                  className={[
                    "inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold shadow-sm transition-all",
                    tier.highlight
                      ? "bg-emerald-500 text-white hover:bg-emerald-600"
                      : "bg-slate-900 text-white hover:bg-slate-800",
                  ].join(" ")}
                >
                  {tier.ctaLabel}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Bottom micro-copy */}
        <p className="mt-8 text-center text-xs text-slate-400">
          30-day free trial · Cancel anytime · No setup fees
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Token-tier comparison table
// ---------------------------------------------------------------------------

function TokenComparisonTable() {
  const rows = [
    { label: "Monthly token-units",       starter: "500",     growth: "1,200",   scale: "2,500" },
    { label: "Cost per token-unit",        starter: "$1.00",   growth: "$0.75",   scale: "$0.56" },
    { label: "Overage rate (next tier)",   starter: "$0.75",   growth: "$0.56",   scale: "Contact us" },
    { label: "Team members",               starter: "Up to 3", growth: "Up to 10", scale: "Unlimited" },
    { label: "eSTAR PDF export",           starter: "✓",       growth: "✓",       scale: "✓" },
    { label: "HMAC-signed evidence ledger",starter: "✓",       growth: "✓",       scale: "✓" },
    { label: "SSO / SAML",                 starter: "—",       growth: "—",       scale: "✓" },
    { label: "SLA support",                starter: "—",       growth: "Email",   scale: "Priority" },
  ];

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Compare Plans
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            Understand what you&apos;re getting
          </h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm" aria-label="Plan feature comparison">
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
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bottom CTA — rendered between TokenComparisonTable and Footer
// ---------------------------------------------------------------------------

function BottomCTA({ orgId }: { orgId: string | null }) {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-16">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="mb-6 text-lg font-semibold text-slate-700">
          Ready to shift compliance left?
        </p>
        {orgId ? (
          <CheckoutButton
            orgId={orgId}
            label="Start 30-Day Free Trial"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-sm font-bold text-white shadow-sm shadow-emerald-200 transition-all hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          />
        ) : (
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-sm font-bold text-white shadow-sm shadow-emerald-200 transition-all hover:bg-emerald-600"
          >
            Start 30-Day Free Trial
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer — identical to landing page
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
          <span className="text-xs font-medium text-slate-500">
            © 2026 QAVRO. All rights reserved.
          </span>
        </div>
        <p className="text-xs text-slate-400">
          IEC 62304 · 21 CFR Part 11 · FDA eSTAR Compliant Pipeline
        </p>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page — Server Component
// ---------------------------------------------------------------------------

export default async function PricingPage() {
  // Read the Supabase session server-side to extract orgId and email.
  // If the user is not authenticated, CheckoutButton is replaced with a
  // sign-up link so unauthenticated visitors can still see the pricing page.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let orgId: string | null = null;
  if (user) {
    // Look up the org_id from the users table for the authenticated user.
    const { data: profile } = await supabase
      .from("users")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    orgId = profile?.org_id ?? null;
  }

  // userEmail is passed to the header so the escape-hatch component can display
  // "Logged in as <email>" alongside the Sign Out button.
  const userEmail = user?.email ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PricingHeader userEmail={userEmail} />
      <main className="flex-1">
        <PricingHero />
        <PricingCards orgId={orgId} />
        <TokenComparisonTable />
        <BottomCTA orgId={orgId} />
      </main>
      <Footer />
    </div>
  );
}
