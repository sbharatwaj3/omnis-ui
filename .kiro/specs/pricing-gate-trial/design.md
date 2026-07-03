# Design Document: Pricing Overhaul, 30-Day Trial & Dashboard Subscription Gate

## Overview

This feature touches three distinct areas of the `omnis-ui` Next.js application:

1. **Pricing Page** (`app/pricing/page.tsx`) — hero copy replacement, a new bottom CTA section with trial-aware routing, tier card link enhancement, and updated micro-copy.
2. **Stripe Server Action** (`app/actions/stripe.ts`) — a single `subscription_data.trial_period_days` addition.
3. **Dashboard Layout** (`app/dashboard/layout.tsx`) — a new async Server Component that gates all `/dashboard` routes behind a subscription check with an admin bypass.

No new dependencies are introduced. All changes follow the existing TypeScript / Tailwind / Supabase + Stripe patterns in the codebase.

---

## Architecture

```mermaid
flowchart TD
    subgraph "Browser"
        A[User visits /pricing]
        B[User clicks CTA / tier card button]
    end

    subgraph "Next.js Server (pricing/page.tsx)"
        C[createClient — read session]
        D{user authenticated?}
        E[Query users table for org_id]
        F[Render PricingHero — new headline]
        G[Render PricingCards — tier href /signup?tier=id]
        H[Render TokenComparisonTable]
        I[Render BottomCTA — CheckoutButton or Link /signup]
        J[Render Footer]
    end

    subgraph "Server Action (stripe.ts)"
        K[createCheckoutSession orgId]
        L[stripe.checkout.sessions.create — mode subscription, trial_period_days 30]
        M[Return session.url]
    end

    subgraph "Next.js Server (dashboard/layout.tsx)"
        N[createClient — auth.getUser]
        O{user exists?}
        P[Query users for org_id]
        Q{org_id exists?}
        R{org_id === ADMIN_ORG_ID?}
        S[Query organizations for subscription_status via adminClient]
        T{status active or trialing?}
        U[Render children]
        V[redirect /login?next=/dashboard]
        W[redirect /onboarding]
        X[redirect /pricing]
    end

    A --> C --> D
    D -- no --> F
    D -- yes --> E --> F
    F --> G --> H --> I --> J
    B -- authenticated --> K --> L --> M
    B -- unauthenticated --> signup[/signup or /signup?tier=id]

    N --> O
    O -- no --> V
    O -- yes --> P --> Q
    Q -- no --> W
    Q -- yes --> R
    R -- yes --> U
    R -- no --> S --> T
    T -- yes --> U
    T -- no --> X
```

---

## Components and Interfaces

### Modified: `PricingHero` (inside `app/pricing/page.tsx`)

Removes the existing `<h1>` and `<p>` sub-headline. Replaces with a new static `<h1>`:

```tsx
<h1 className="text-4xl font-extrabold ...">
  Simple, transparent pricing for MedTech teams.
</h1>
```

The eyebrow badge, compliance badges row, and decorative backgrounds are untouched.

### Modified: `PricingCards` (inside `app/pricing/page.tsx`)

**Tier card unauthenticated link** — the `href` changes from `/signup` to `/signup?tier=${tier.id}`:

```tsx
// Before
<Link href="/signup" ...>

// After
<Link href={`/signup?tier=${tier.id}`} ...>
```

**Bottom micro-copy** — string replacement only:

```tsx
// Before
"All plans include a 14-day money-back guarantee · Cancel anytime · No setup fees"

// After
"30-day free trial · Cancel anytime · No setup fees"
```

### New: `BottomCTA` component (inside `app/pricing/page.tsx`)

A new local server component rendered between `<TokenComparisonTable />` and `<Footer />`.

```tsx
function BottomCTA({ orgId }: { orgId: string | null }) {
  return (
    <section className="bg-slate-50 border-t border-slate-200 py-16 dark:bg-slate-900/50 dark:border-slate-800">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-6">
          Ready to shift compliance left?
        </p>
        {orgId ? (
          <CheckoutButton
            orgId={orgId}
            label="Start 30-Day Free Trial"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-sm font-bold text-white shadow-emerald-200 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:shadow-emerald-900/40"
          />
        ) : (
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-sm font-bold text-white hover:bg-emerald-600"
          >
            Start 30-Day Free Trial
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
```

### Modified: `createCheckoutSession` (`app/actions/stripe.ts`)

One field is added inside `subscription_data`:

```ts
subscription_data: {
  trial_period_days: 30,   // ← added
  metadata: {
    orgId,                 // ← preserved
  },
},
```

No other lines change.

### New: `app/dashboard/layout.tsx`

Async Server Component. Sits at `app/dashboard/layout.tsx` so Next.js automatically applies it to `app/dashboard/page.tsx` and any future sub-routes (e.g. `app/dashboard/settings/page.tsx`).

```tsx
// omnis-ui/app/dashboard/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ── Admin bypass ───────────────────────────────────────────────────────────
// Replace the value below with the real admin org UUID before deploying.
// DO NOT hardcode secrets here — this is a UUID, not a key.
const ADMIN_ORG_ID = "REPLACE_ME_WITH_ADMIN_ORG_ID";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Verify authenticated session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  // 2. Resolve org_id from users table (RLS satisfied by session client)
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) redirect("/onboarding");

  const orgId: string = profile.org_id;

  // 3. Admin bypass — skip subscription check for designated org
  if (orgId === ADMIN_ORG_ID) return <>{children}</>;

  // 4. Check subscription_status via service-role client (bypasses RLS)
  const { data: org } = await adminClient
    .from("organizations")
    .select("subscription_status")
    .eq("org_id", orgId)
    .single();

  const status = org?.subscription_status;

  if (status === "active" || status === "trialing") {
    return <>{children}</>;
  }

  redirect("/pricing");
}
```

**Why Server Component layout over Edge middleware:**
- Edge runtime cannot safely import the Node.js Supabase admin client.
- Server Component layouts run in the Node runtime, have full access to `adminClient`, and integrate naturally with Next.js route nesting.
- This avoids duplicating auth logic in middleware while keeping the gate colocated with dashboard routes.

---

## Data Models

No new tables or columns are introduced.

### `organizations` table (existing, from RBAC migration)

| Column | Type | Notes |
|---|---|---|
| `org_id` | `UUID PRIMARY KEY` | Identifies the organisation |
| `stripe_customer_id` | `TEXT` | Populated by Stripe webhook |
| `subscription_status` | `TEXT NOT NULL DEFAULT 'trialing'` | `'trialing' \| 'active' \| 'past_due' \| 'canceled'` |

The `DEFAULT 'trialing'` means every new organisation created during onboarding automatically passes the dashboard gate without needing a paid subscription.

### `users` table (existing)

| Column | Type | Notes |
|---|---|---|
| `user_id` | `UUID PRIMARY KEY` | Maps to `auth.users.id` |
| `org_id` | `UUID NOT NULL` | FK → `organizations.org_id` |

The dashboard layout reads `org_id` from this table using the session client (RLS is satisfied by `auth.uid() = user_id`).

### Stripe Checkout Session (logical model)

```
CheckoutSession {
  mode:            "subscription"
  line_items:      [{ price: resolvedPriceId, quantity: 1 }]
  subscription_data: {
    trial_period_days: 30        // new
    metadata: { orgId: string }  // preserved
  }
  metadata:        { orgId: string }
  success_url:     string
  cancel_url:      string
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tier card unauthenticated href embeds tier ID

*For any* tier with a non-empty `id` string, when the `Pricing_Page` renders in the unauthenticated state (`orgId = null`), the tier card CTA element's `href` attribute SHALL equal `/signup?tier={tier.id}`.

**Validates: Requirements 3.1**

### Property 2: Checkout session preserves orgId in subscription metadata

*For any* non-empty `orgId` string passed to `createCheckoutSession`, the `subscription_data.metadata.orgId` field in the object forwarded to `stripe.checkout.sessions.create` SHALL equal the input `orgId` exactly.

**Validates: Requirements 5.2**

### Property 3: Dashboard gate allows access iff subscription_status is active or trialing

*For any* `subscription_status` string value, the `Dashboard_Layout` gate SHALL allow access (render children) if and only if the value equals `'active'` or `'trialing'`; for all other values the layout SHALL redirect to `/pricing`.

**Validates: Requirements 6.6, 6.7**

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `supabase.auth.getUser()` returns no user in Dashboard_Layout | `redirect("/login?next=/dashboard")` |
| `users` query returns no row (no `org_id`) | `redirect("/onboarding")` |
| `organizations` query returns no row (`org` is null/undefined) | `status` is `undefined`; falls through to `redirect("/pricing")` |
| `createCheckoutSession` receives an undefined `STRIPE_PRICE_ID` | Throws `Error("STRIPE_PRICE_ID is not set…")` — surfaces to user via `CheckoutButton` error state |
| Stripe API call fails | `CheckoutButton` catches the error, sets `status = "error"`, renders inline error message |
| `ADMIN_ORG_ID` placeholder is never replaced | Admin org bypasses correctly only when `org_id` literally equals `"REPLACE_ME_WITH_ADMIN_ORG_ID"` — a safe default that effectively disables the bypass until configured |

---

## Testing Strategy

### PBT applicability assessment

This feature contains a mix of UI changes, a server action modification, and routing logic. Three distinct areas are suited for different test types:

- **Pricing Page rendering** (Requirements 1, 2, 3, 4): React component rendering tests using a test renderer (e.g. `@testing-library/react`). Static string assertions are best handled as example-based unit tests. The tier card href encoding (Requirement 3) has an input space that varies with tier ID and warrants a property-based test.
- **Stripe server action** (Requirement 5): Unit test with a mocked Stripe client. `orgId` preservation (Requirement 5.2) is a property across all org ID values.
- **Dashboard layout gate** (Requirement 6): Unit test with mocked Supabase clients. The gate decision (allow/deny) across the full `subscription_status` value space is a property.

### Property-based tests (fast-check)

Use [`fast-check`](https://github.com/dubzzz/fast-check) — the standard TypeScript property-testing library. Configure each test to run a minimum of 100 iterations.

**Property 1 — Tier card href embeds tier ID:**
```
// Feature: pricing-gate-trial, Property 1: tier card unauthenticated href embeds tier ID
fc.assert(
  fc.property(fc.string({ minLength: 1 }), (tierId) => {
    const tier = { ...baseTier, id: tierId };
    const href = buildUnauthenticatedHref(tier);
    return href === `/signup?tier=${tierId}`;
  }),
  { numRuns: 100 }
);
```

**Property 2 — orgId preserved in subscription_data.metadata:**
```
// Feature: pricing-gate-trial, Property 2: checkout session preserves orgId in subscription metadata
fc.assert(
  fc.property(fc.uuid(), async (orgId) => {
    const captured = await captureStripePayload(orgId); // mock stripe client
    return captured.subscription_data.metadata.orgId === orgId;
  }),
  { numRuns: 100 }
);
```

**Property 3 — Dashboard gate allows access iff status is active or trialing:**
```
// Feature: pricing-gate-trial, Property 3: dashboard gate allows access iff subscription_status is active or trialing
const ALLOWED = new Set(["active", "trialing"]);
fc.assert(
  fc.property(fc.string(), (status) => {
    const result = evaluateGate(status); // pure gate logic extracted
    return ALLOWED.has(status) ? result === "allow" : result === "redirect";
  }),
  { numRuns: 100 }
);
```

### Unit / example-based tests

- Render `PricingHero` → assert new headline text is present, old headline text is absent.
- Render `PricingHero` → assert eyebrow badge text and all four compliance badge strings are present.
- Render `PricingCards` with `orgId = null` → assert micro-copy string "30-day free trial · Cancel anytime · No setup fees" is present.
- Render `BottomCTA` with `orgId = null` → assert `<Link href="/signup">` is rendered with label "Start 30-Day Free Trial".
- Render `BottomCTA` with `orgId = "test-org"` → assert `CheckoutButton` is rendered (not a `Link`).
- Call `createCheckoutSession` with a mock Stripe client → assert `session.mode === "subscription"` and `subscription_data.trial_period_days === 30`.
- Dashboard_Layout with `user = null` → assert redirect target is `/login?next=/dashboard`.
- Dashboard_Layout with `user` present but `org_id = null` → assert redirect target is `/onboarding`.
- Dashboard_Layout with `org_id === ADMIN_ORG_ID` → assert `children` rendered, no subscription query issued.
- Dashboard_Layout with `status = "active"` → assert `children` rendered.
- Dashboard_Layout with `status = "past_due"` → assert redirect target is `/pricing`.
- Dashboard_Layout with `status = "canceled"` → assert redirect target is `/pricing`.
