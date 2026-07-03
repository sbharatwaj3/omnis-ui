# Requirements Document

## Introduction

This feature overhauling the Pricing Page UI, adds a 30-day free trial to the Stripe checkout flow, and introduces a strict subscription gate on every dashboard route via a new Next.js Server Component layout. An admin bypass allows designated internal organisations to skip the subscription check. The goal is to reduce friction for new sign-ups (free trial), communicate pricing clearly (updated hero and micro-copy), and ensure only paying or trialling customers can access the dashboard.

## Glossary

- **Pricing_Page**: The Next.js Server Component at `app/pricing/page.tsx` that renders the public SaaS pricing UI.
- **Dashboard_Layout**: The async Next.js Server Component layout at `app/dashboard/layout.tsx` that wraps every route under `/dashboard`.
- **Checkout_Session**: A Stripe-hosted payment session created by the `createCheckoutSession` server action in `app/actions/stripe.ts`.
- **Subscription_Status**: The `subscription_status` column in the `organizations` table. Valid values: `'trialing'`, `'active'`, `'past_due'`, `'canceled'`. Defaults to `'trialing'`.
- **Admin_Org_Id**: A compile-time placeholder constant (`ADMIN_ORG_ID`) in `Dashboard_Layout` identifying the privileged organisation that bypasses the subscription check.
- **CheckoutButton**: The existing React Client Component at `components/CheckoutButton.tsx` that invokes `createCheckoutSession` and redirects to Stripe.
- **orgId**: The `org_id` UUID of an authenticated user's organisation, resolved from the `users` table via the Supabase session client.
- **Admin_Client**: The service-role Supabase client exported from `utils/supabase/admin.ts` that bypasses Row-Level Security.
- **Session_Client**: The cookie-scoped Supabase client created by `createClient()` from `utils/supabase/server.ts`.

---

## Requirements

### Requirement 1: Pricing Page Hero Replacement

**User Story:** As a prospective MedTech customer, I want the pricing page to display pricing-focused copy so that I understand immediately what the page is about without generic marketing language distracting me.

#### Acceptance Criteria

1. THE `Pricing_Page` SHALL render the headline "Simple, transparent pricing for MedTech teams." in place of the existing "Automate FDA Compliance. Ship faster." headline and its coloured span.
2. THE `Pricing_Page` SHALL NOT render the sub-headline paragraph that previously read "Shift regulatory checks left into your CI/CD pipeline…".
3. THE `Pricing_Page` SHALL continue to render the eyebrow badge labelled "Simple, usage-based pricing" unchanged.
4. THE `Pricing_Page` SHALL continue to render the compliance badges row (FDA 21 CFR Part 11, IEC 62304, eSTAR Ready, HMAC-Sealed) unchanged.
5. THE `Pricing_Page` SHALL continue to render all decorative background elements (grid overlay, emerald glow) in the hero section unchanged.

### Requirement 2: Pricing Page Bottom CTA Section

**User Story:** As a prospective customer who has reviewed the comparison table, I want a clear call-to-action at the bottom of the pricing page so that I can start a free trial without scrolling back to the tier cards.

#### Acceptance Criteria

1. THE `Pricing_Page` SHALL render a new CTA section positioned immediately after the `TokenComparisonTable` component and immediately before the `Footer` component.
2. THE CTA section SHALL contain a prompt line with the text "Ready to shift compliance left?".
3. THE CTA section SHALL contain a primary button labelled "Start 30-Day Free Trial".
4. WHEN `orgId` is `null` (unauthenticated visitor), THE CTA button SHALL navigate to `/signup` using a Next.js `Link` component.
5. WHEN `orgId` is a non-null string (authenticated user), THE CTA button SHALL render a `CheckoutButton` component with the authenticated user's `orgId` and the label "Start 30-Day Free Trial".

### Requirement 3: Pricing Page Tier Card Unauthenticated Link Enhancement

**User Story:** As a prospective customer who clicks a specific tier button without being signed in, I want to be taken to a signup URL that includes my intended tier so that the system can reference my selection.

#### Acceptance Criteria

1. WHEN `orgId` is `null`, THE `Pricing_Page` tier card CTA links SHALL route to `/signup?tier={tier.id}` instead of plain `/signup`.
2. THE button label and visual styling for unauthenticated tier card CTAs SHALL remain unchanged from the current implementation.

### Requirement 4: Pricing Page Micro-Copy Update

**User Story:** As a prospective customer, I want the trust copy at the bottom of the pricing card section to reflect the current 30-day free trial offer so that I have accurate information before clicking to sign up.

#### Acceptance Criteria

1. THE `Pricing_Page` SHALL display the micro-copy text "30-day free trial · Cancel anytime · No setup fees" in place of the existing "All plans include a 14-day money-back guarantee · Cancel anytime · No setup fees" text.

### Requirement 5: Stripe 30-Day Free Trial

**User Story:** As a new customer initiating a subscription checkout, I want a 30-day free trial automatically applied so that I can evaluate the platform before being charged.

#### Acceptance Criteria

1. WHEN `createCheckoutSession` is called, THE `Checkout_Session` SHALL include `trial_period_days: 30` inside the `subscription_data` object.
2. THE `Checkout_Session` SHALL preserve `metadata: { orgId }` inside `subscription_data` when `trial_period_days` is added.
3. THE `Checkout_Session` `mode` SHALL remain `"subscription"` after the trial configuration is applied.
4. THE `Checkout_Session` SHALL preserve all other existing session parameters (line items, success URL, cancel URL, session-level metadata) unchanged.

### Requirement 6: Dashboard Subscription Gate Layout

**User Story:** As the product owner, I want every page under `/dashboard` to verify the user's organisation has an active or trialling subscription before granting access so that only paying or trial customers can use the product.

#### Acceptance Criteria

1. THE `Dashboard_Layout` SHALL be an async Server Component that wraps all routes under `/dashboard` via Next.js route-segment layout nesting.
2. THE `Dashboard_Layout` SHALL define a constant `const ADMIN_ORG_ID = "REPLACE_ME_WITH_ADMIN_ORG_ID"` at the top of the file as a clearly-marked placeholder.
3. WHEN a request reaches any `/dashboard` route with no authenticated session, THE `Dashboard_Layout` SHALL redirect to `/login?next=/dashboard` using `redirect()` from `next/navigation`.
4. WHEN an authenticated user has no `org_id` in the `users` table, THE `Dashboard_Layout` SHALL redirect to `/onboarding`.
5. WHEN the authenticated user's `org_id` equals `ADMIN_ORG_ID`, THE `Dashboard_Layout` SHALL render `children` and skip the subscription status check entirely.
6. WHEN the authenticated user's organisation has `subscription_status` of `'active'` OR `'trialing'`, THE `Dashboard_Layout` SHALL render `children`.
7. WHEN the authenticated user's organisation has `subscription_status` of `'past_due'`, `'canceled'`, or any value not equal to `'active'` or `'trialing'`, THE `Dashboard_Layout` SHALL redirect to `/pricing`.
8. THE `Dashboard_Layout` SHALL use `Session_Client` (`createClient()`) for the `auth.getUser()` call to verify the authenticated session.
9. THE `Dashboard_Layout` SHALL use `Session_Client` for the `users` table query to resolve `org_id`.
10. THE `Dashboard_Layout` SHALL use `Admin_Client` (`adminClient`) for the `organizations` table query to read `subscription_status`, bypassing RLS.
11. THE `Dashboard_Layout` SHALL use `redirect()` from `next/navigation` for all redirects.
12. THE `Dashboard_Layout` SHALL NOT modify, remove, or bypass any HMAC or JWT security logic in any file.

### Requirement 7: Git Commit and Push

**User Story:** As a developer, I want all changes committed and pushed in a single atomic commit so that the feature is tracked in version control with a clear, descriptive message.

#### Acceptance Criteria

1. WHEN all code changes are implemented and the TypeScript build passes without errors, THE Developer SHALL stage all modified and created files.
2. THE commit message SHALL be exactly: `feat(ui): pricing overhaul, 30-day trial, dashboard subscription gate`.
3. THE Developer SHALL push the commit to the remote repository tracking branch.
