// omnis-ui/app/pricing/pricing-data.ts
// Pure static data — no server imports. Safe for both Server and Client Components.

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  priceLabel: string;
  tokenUnits: string;
  tagline: string;
  highlight: boolean;
  badge?: string;
  valueNote: string;
  features: Array<{ iconName: string; text: string }>;
  ctaLabel: string;
}

export const tiers: PricingTier[] = [
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
      { iconName: "ShieldCheck", text: "Automated 21 CFR Part 11 Audits" },
      { iconName: "GitBranch",   text: "Unlimited CLI Ingestions (< 200ms)" },
      { iconName: "Brain",       text: "AWS Bedrock Document Intelligence" },
      { iconName: "BarChart3",   text: "Real-time Traceability Matrix" },
      { iconName: "Users",       text: "Role-Based Access Control (QA, Dev, Viewer)" },
      { iconName: "Lock",        text: "HMAC-Signed Evidence Ledger" },
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
      { iconName: "ShieldCheck", text: "Everything in Starter" },
      { iconName: "GitBranch",   text: "Unlimited CLI Ingestions (< 200ms)" },
      { iconName: "Brain",       text: "Priority AWS Bedrock AI pipeline" },
      { iconName: "BarChart3",   text: "Advanced Traceability & Diff Reports" },
      { iconName: "Users",       text: "Up to 10 team members" },
      { iconName: "Lock",        text: "eSTAR PDF Export — Audit-Ready Package" },
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
      { iconName: "ShieldCheck", text: "Everything in Growth" },
      { iconName: "GitBranch",   text: "Unlimited CLI Ingestions (< 200ms)" },
      { iconName: "Brain",       text: "Dedicated Bedrock inference budget" },
      { iconName: "BarChart3",   text: "Multi-org Dashboard & Rollup Reports" },
      { iconName: "Users",       text: "Unlimited team members + SSO" },
      { iconName: "Lock",        text: "SLA Support — Custom Regulatory Mapping" },
    ],
    ctaLabel: "Scale Up",
  },
];

export const complianceBadges = [
  "FDA 21 CFR Part 11",
  "IEC 62304",
  "eSTAR Ready",
  "HMAC-Sealed",
];
