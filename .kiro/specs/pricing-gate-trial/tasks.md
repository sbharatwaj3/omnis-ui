# Implementation Plan: Pricing Overhaul, 30-Day Trial & Dashboard Subscription Gate

## Overview

Three files are modified or created. Each task is discrete, builds on the previous one, and ends with all code wired together. Testing sub-tasks are placed immediately after their parent implementation step so bugs surface early.

Implementation language: **TypeScript** (matching the existing codebase).

---

## Tasks

- [x] 1. Update `app/pricing/page.tsx` — Hero section copy
  - In the `PricingHero` function, replace the existing `<h1>` content ("Automate FDA Compliance. Ship faster." with its coloured span) with the single static string "Simple, transparent pricing for MedTech teams."
  - Remove the `<p>` sub-headline paragraph that follows the `<h1>` ("Shift regulatory checks left into your CI/CD pipeline…").
  - Do NOT touch the eyebrow badge `<div>`, the compliance badges `<div>`, or any decorative background elements.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.1 Write unit tests for PricingHero copy changes
    - Render `PricingHero` with `@testing-library/react` and assert: new headline text is present; old headline text "Automate FDA Compliance" is absent; sub-headline "Shift regulatory checks" is absent; eyebrow badge text "Simple, usage-based pricing" is present; all four compliance badge strings are present.
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Update `app/pricing/page.tsx` — Tier card links and micro-copy
  - In `PricingCards`, change the unauthenticated tier card `<Link href="/signup">` to `<Link href={\`/signup?tier=${tier.id}\`}>`. The `orgId ? <CheckoutButton> : <Link>` branching structure stays the same.
  - In `PricingCards`, change the bottom micro-copy string from "All plans include a 14-day money-back guarantee · Cancel anytime · No setup fees" to "30-day free trial · Cancel anytime · No setup fees".
  - _Requirements: 3.1, 3.2, 4.1_

  - [ ]* 2.1 Write property test for tier card href (Property 1)
    - Extract a pure helper `buildUnauthenticatedHref(tier: { id: string }): string` that returns the href string used for the unauthenticated CTA link.
    - **Property 1: Tier card unauthenticated href embeds tier ID**
    - Use `fast-check` with `fc.string({ minLength: 1 })` as the arbitrary; assert `buildUnauthenticatedHref({ id: tierId }) === \`/signup?tier=${tierId}\``.
    - Run minimum 100 iterations.
    - Tag: `// Feature: pricing-gate-trial, Property 1: tier card unauthenticated href embeds tier ID`
    - **Validates: Requirements 3.1**

  - [ ]* 2.2 Write unit test for micro-copy string
    - Render `PricingCards` with `orgId = null` and assert the text "30-day free trial · Cancel anytime · No setup fees" is present in the output; assert "14-day money-back guarantee" is absent.
    - _Requirements: 4.1_

- [x] 3. Update `app/pricing/page.tsx` — Add `BottomCTA` section
  - Add a new local `BottomCTA` function component inside `pricing/page.tsx` that accepts `{ orgId: string | null }`.
  - The section renders: a `<p>` with "Ready to shift compliance left?" and a CTA that is either a `<CheckoutButton orgId={orgId} label="Start 30-Day Free Trial" ...>` (authenticated) or a `<Link href="/signup" ...>Start 30-Day Free Trial</Link>` (unauthenticated).
  - In the page's JSX, insert `<BottomCTA orgId={orgId} />` between `<TokenComparisonTable />` and `<Footer />`.
  - Import `BottomCTA` receives `orgId` which is already resolved in the page Server Component — no additional data fetching needed.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 3.1 Write unit tests for BottomCTA
    - Render `BottomCTA` with `orgId = null` → assert prompt text "Ready to shift compliance left?" is present; assert a `Link` element with `href="/signup"` and text "Start 30-Day Free Trial" is rendered; assert no `CheckoutButton` is rendered.
    - Render `BottomCTA` with `orgId = "test-org-123"` → assert `CheckoutButton` is rendered with `label="Start 30-Day Free Trial"`; assert no plain `Link` to "/signup" is rendered.
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

- [x] 4. Checkpoint — Pricing page
  - Ensure all tests for tasks 1–3 pass. Run `tsc --noEmit` to confirm no TypeScript errors in `app/pricing/page.tsx`. Ask the user if any questions arise.

- [x] 5. Update `app/actions/stripe.ts` — Add 30-day free trial
  - Inside `createCheckoutSession`, add `trial_period_days: 30` as the first field inside the `subscription_data` object, immediately before the existing `metadata: { orgId }` entry.
  - Do NOT change any other field in the file — `mode`, `line_items`, `success_url`, `cancel_url`, `automatic_tax`, and session-level `metadata` are all preserved exactly.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 5.1 Write unit test for trial_period_days
    - Mock `stripe.checkout.sessions.create` to capture the arguments passed to it.
    - Call `createCheckoutSession("test-org-uuid")` and assert the captured call includes `subscription_data.trial_period_days === 30` and `session.mode === "subscription"`.
    - _Requirements: 5.1, 5.3_

  - [ ]* 5.2 Write property test for orgId metadata preservation (Property 2)
    - Mock `stripe.checkout.sessions.create` to return a fake session URL and capture the call arguments.
    - **Property 2: Checkout session preserves orgId in subscription metadata**
    - Use `fast-check` with `fc.uuid()` as the arbitrary for `orgId`; for each generated `orgId` call `createCheckoutSession(orgId)` and assert `capturedArgs.subscription_data.metadata.orgId === orgId`.
    - Also assert `capturedArgs.metadata.orgId === orgId` (session-level metadata preserved).
    - Run minimum 100 iterations.
    - Tag: `// Feature: pricing-gate-trial, Property 2: checkout session preserves orgId in subscription metadata`
    - **Validates: Requirements 5.2, 5.4**

- [x] 6. Create `app/dashboard/layout.tsx` — Subscription gate
  - Create the file `app/dashboard/layout.tsx` as a new async Server Component.
  - At the top of the file, define `const ADMIN_ORG_ID = "REPLACE_ME_WITH_ADMIN_ORG_ID";` with a comment explaining it must be replaced with the real admin org UUID before deploying.
  - Implement the gate logic in this exact order:
    1. `const supabase = await createClient();` then `auth.getUser()` — if no user, `redirect("/login?next=/dashboard")`.
    2. Query `users` table for `org_id` matching `user.id` — if no `org_id`, `redirect("/onboarding")`.
    3. If `org_id === ADMIN_ORG_ID`, return `<>{children}</>` immediately (skip subscription check).
    4. Query `organizations` table via `adminClient` for `subscription_status` where `org_id` matches.
    5. If `status === "active" || status === "trialing"`, return `<>{children}</>`.
    6. Otherwise, `redirect("/pricing")`.
  - Import `createClient` from `@/utils/supabase/server` and `adminClient` from `@/utils/supabase/admin`.
  - Import `redirect` from `next/navigation`.
  - Do NOT add `export const dynamic` — let the layout inherit dynamic behaviour from its children.
  - Do NOT modify `app/dashboard/page.tsx` or any HMAC/JWT security logic.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_

  - [ ]* 6.1 Write unit tests for Dashboard_Layout redirect cases
    - Mock `createClient` and `adminClient`. Test each branch:
      - `user = null` → assert `redirect` called with `/login?next=/dashboard`.
      - `user` present, `profile.org_id = null` → assert `redirect` called with `/onboarding`.
      - `org_id === ADMIN_ORG_ID` → assert `children` rendered, `adminClient.from("organizations")` NOT called.
      - `subscription_status = "active"` → assert `children` rendered.
      - `subscription_status = "trialing"` → assert `children` rendered.
      - `subscription_status = "past_due"` → assert `redirect` called with `/pricing`.
      - `subscription_status = "canceled"` → assert `redirect` called with `/pricing`.
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 6.2 Write property test for dashboard gate logic (Property 3)
    - Extract a pure function `evaluateGate(status: string | undefined): "allow" | "redirect"` from the layout's decision logic.
    - **Property 3: Dashboard gate allows access iff subscription_status is active or trialing**
    - Use `fast-check` with `fc.string()` as the arbitrary; assert `evaluateGate(status) === "allow"` iff `status === "active" || status === "trialing"`, and `"redirect"` for all other values (including `undefined`).
    - Run minimum 100 iterations.
    - Tag: `// Feature: pricing-gate-trial, Property 3: dashboard gate allows access iff subscription_status is active or trialing`
    - **Validates: Requirements 6.6, 6.7**

- [x] 7. Final checkpoint — Build and full test suite
  - Run `tsc --noEmit` from the `omnis-ui` directory and confirm zero TypeScript errors across all modified and created files.
  - Run the test suite and confirm all tests pass.
  - Ask the user if any questions arise before proceeding to the commit step.

- [x] 8. Git commit and push
  - Stage the following files exactly:
    - `app/pricing/page.tsx`
    - `app/actions/stripe.ts`
    - `app/dashboard/layout.tsx`
  - Create a commit with the message: `feat(ui): pricing overhaul, 30-day trial, dashboard subscription gate`
  - Push to the remote repository on the current tracking branch.
  - _Requirements: 7.1, 7.2, 7.3_

---

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] },
    { "wave": 6, "tasks": ["6"] },
    { "wave": 7, "tasks": ["7"] },
    { "wave": 8, "tasks": ["8"] }
  ]
}
```

---

## Notes

- Sub-tasks marked with `*` are optional and can be skipped for a faster delivery run.
- All implementation tasks (unmarked) MUST be completed.
- The `ADMIN_ORG_ID` placeholder must be replaced with the real admin org UUID before deploying to production.
- `fast-check` must be added as a dev dependency if not already present: `bun add -D fast-check`.
- Property tests each run a minimum of 100 iterations to cover edge cases in the input space.
- The `evaluateGate` helper in task 6.2 should be a pure function extracted alongside the layout, not a separate file — it exists only to make the gate logic unit-testable without mocking the full Next.js redirect infrastructure.
