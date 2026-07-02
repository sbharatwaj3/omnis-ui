# Implementation Plan: Token Usage Dashboard

## Overview

Extend the existing prototype at `app/dashboard/usage/` into a fully-featured token monitoring dashboard. The prototype already has `getDeveloperUsage()` (admin-only, no time filter, no Zod) and a basic RSC table. This plan upgrades it end-to-end: adds `getOrgQuota()`, Zod validation, time-range filtering, `qa_manager` access, the org-level gauge, skeleton loading states, Framer Motion animations, and axe-core accessibility validation — all conforming to the QAVRO design system.

---

## Tasks

- [x] 1. Upgrade server actions in `app/dashboard/usage/actions.ts`
  - [x] 1.1 Add shared types, Zod schema, and `getOrgQuota()` action
    - Add `import 'server-only'` guard at line 1 (already present — verify and retain)
    - Export `TimeFilter` union type `"7d" | "30d" | "90d" | "all"` 
    - Export `QuotaData` interface: `{ tokenUnitsUsed: number; tokenUnitsLimit: number; usagePct: number; status: "healthy" | "warning" | "exhausted" }`
    - Export `ActionResult<T>` interface: `{ data?: T; error?: { message: string } }`
    - Export `developerUsageInputSchema`: `z.object({ timeFilter: z.enum(["7d","30d","90d","all"]).default("30d") }).strip()`
    - Extract and export pure helper `deriveQuotaData(used: number, limit: number): QuotaData | { error: true }` — returns `{ error: true }` when `limit === 0`; otherwise computes `usagePct = Math.floor((used/limit)*100)` and `status` thresholds (healthy < 0.80, warning 0.80–1.00, exhausted ≥ 1.00)
    - Implement `getOrgQuota(): Promise<ActionResult<QuotaData>>` following the 5-step auth resolution pattern from `app/dashboard/page.tsx`: (1) `createClient().auth.getUser()`, (2) `adminClient` resolve `org_id` from `users`, (3) `adminClient` resolve role from `user_roles`, (4) gate: `admin | qa_manager` only, (5) query `organizations` for `token_units_used, token_units_limit` scoped to JWT-derived `org_id` using `.single()`
    - Apply zero-row guard per Req 9.6: if Supabase returns success but zero rows for `organizations`, log server-side and return `error: { message: "Quota data is unavailable. Contact your administrator." }`
    - Return `error: { message: "Quota not configured." }` when `deriveQuotaData` returns `{ error: true }` (limit === 0)
    - Never forward raw Supabase error text to the client; log via `console.error` only
    - _Requirements: 2.1, 2.7, 2.9, 6.1, 6.4, 6.5, 6.6, 9.1, 9.3, 9.6_

  - [x] 1.2 Upgrade `getDeveloperUsage()` with Zod validation, `qa_manager` access, and time-range filtering
    - Accept `rawInput: unknown` instead of no args; parse via `developerUsageInputSchema.safeParse(rawInput)` before any DB query; return `error: { message: "Invalid input." }` on parse failure
    - Upgrade role gate from `admin`-only to `admin | qa_manager`
    - Extract and export pure helper `getWindowStart(filter: TimeFilter): string | null` — returns `null` for `"all"`; otherwise builds UTC ISO string: subtract days (7/30/90), zero out hours/minutes/seconds/ms via `setUTCHours(0,0,0,0)`, return `.toISOString()`
    - Add `execution_timestamp` range predicate to the paginated `evidence_logs` query when `filter !== "all"`: `.gte("execution_timestamp", windowStart)` placed after the `.eq("org_id", orgId)` predicate (index order per Req 8.5)
    - Keep the existing in-memory grouping, `normaliseEmail`, and sort logic
    - Secondary sort on equal token counts: sort `developer_email ASC` as tiebreaker (Req 3.3)
    - Return `ActionResult<DeveloperUsageRow[]>` shape (not the old `{ rows, error }` shape); update all call-sites
    - Halt pagination and discard partial data on any mid-loop Supabase error (Req 8.6)
    - _Requirements: 1.6, 3.3, 3.5, 3.6, 3.11, 4.2, 4.3, 6.5, 8.2, 8.3, 8.5, 8.6_

  - [x] 1.3 Checkpoint — run `vitest --run` to confirm no TypeScript errors in actions module
    - Ensure `bun run test` passes (or reports only pre-existing failures unrelated to this module)

- [x] 2. Extract and test pure logic functions
  - [x] 2.1 Move `normaliseEmail`, `deriveQuotaData`, `getWindowStart`, and `buildLeaderboard` to `app/dashboard/usage/lib/usage-logic.ts`
    - `normaliseEmail(raw: string | null | undefined): string` — unchanged logic from existing `actions.ts`
    - `deriveQuotaData(used: number, limit: number): QuotaData | { error: true }` — extracted from task 1.1
    - `getWindowStart(filter: TimeFilter): string | null` — extracted from task 1.2
    - Export `buildLeaderboard(rows: Array<{ developer_email: string | null; ai_tokens_used: number | null }>): DeveloperUsageRow[]` — extracted from the grouping + sort logic in `getDeveloperUsage`; the action calls this function rather than inlining it
    - Import these functions back into `app/dashboard/usage/actions.ts`
    - _Requirements: 3.3, 3.5, 3.6, 4.2, 4.3_

  - [x] 2.2 Write property test — Property 5: `normaliseEmail` unknown variants collapse to one label
    - File: `app/dashboard/usage/__tests__/actions.property.test.ts`
    - Tag: `// Feature: token-usage-dashboard, Property 5: Email Normalisation — Unknown Variants Always Collapse to One Label`
    - Use `fc.oneof(fc.constant(null), fc.constant(""), fc.constant("unknown_developer"), fc.stringMatching(/^\s+$/))` to generate bad inputs; assert each maps to `"Unknown Developer"`
    - Use `fc.emailAddress()` for valid inputs; assert each maps to `input.trim()`
    - Minimum 100 iterations
    - _Requirements: 3.5_

  - [x] 2.3 Write property test — Property 3: `deriveQuotaData` gauge color classification
    - Tag: `// Feature: token-usage-dashboard, Property 3: Gauge Color Classification`
    - Use `fc.tuple(fc.nat(), fc.integer({ min: 1, max: 1_000_000 }))` as `(used, limit)` pairs
    - Assert `status === "healthy"` when `used/limit < 0.80`, `"warning"` when `0.80 ≤ used/limit < 1.00`, `"exhausted"` when `used/limit ≥ 1.00`
    - Assert `usagePct === Math.floor((used / limit) * 100)` in all cases
    - Assert `deriveQuotaData(n, 0)` returns `{ error: true }` for any non-negative integer `n`
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 2.4 Write property test — Property 4: `buildLeaderboard` grouping and sorting invariants
    - Tag: `// Feature: token-usage-dashboard, Property 4: Leaderboard Aggregation`
    - Use `fc.array(fc.record({ developer_email: fc.option(fc.emailAddress(), { nil: null }), ai_tokens_used: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }) }), { maxLength: 200 })`
    - Assert (a) output row count equals distinct normalised email labels; (b) each row's `total_logs_uploaded` equals input rows mapping to that label; (c) each row's `total_tokens_consumed` equals `SUM(ai_tokens_used ?? 0)` for that label; (d) rows are sorted primary `total_tokens_consumed DESC`, secondary `developer_email ASC`
    - _Requirements: 3.1, 3.3, 3.6_

  - [x] 2.5 Write property test — Property 6: `getWindowStart` time filter predicate
    - Tag: `// Feature: token-usage-dashboard, Property 6: Time Filter Predicate`
    - Assert `getWindowStart("all") === null`
    - Use `fc.constantFrom("7d", "30d", "90d")` and verify returned ISO string is a valid date in the past, is midnight UTC, and is approximately `N` days before now (within a 1-second tolerance)
    - _Requirements: 4.2, 4.3_

  - [x] 2.6 Write property test — Property 8: `developerUsageInputSchema` strips unknown fields
    - Tag: `// Feature: token-usage-dashboard, Property 8: Zod Schema Strips Unknown Fields`
    - Use `fc.record({ timeFilter: fc.constantFrom("7d","30d","90d","all") })` merged with `fc.dictionary(fc.string(), fc.anything(), { minKeys: 1 })` for extra keys
    - Assert `safeParse(input).success === true` and that `data` contains only the `timeFilter` key
    - _Requirements: 6.5_

  - [x] 2.7 Write property test — Property 9: error response never leaks raw Supabase text
    - Tag: `// Feature: token-usage-dashboard, Property 9: Error Response Never Leaks Raw Supabase Error Text`
    - Mock a Supabase error with a random raw message string via `fc.string({ minLength: 1 })`
    - Assert that the `ActionResult.error.message` returned is neither equal to nor a substring of the raw Supabase error string
    - Assert `error.message` is a non-empty string
    - _Requirements: 9.1, 9.3_

  - [x] 2.8 Write property test — Property 10: nav card rendered iff admin role
    - Tag: `// Feature: token-usage-dashboard, Property 10: Nav Card Presence Exclusive to Admin Role`
    - Export a pure `renderTokenUsageCard(role: string | null): boolean` helper from a new file `app/dashboard/usage/lib/nav-card-guard.ts`
    - Assert returns `true` only for `role === "admin"`, false for all others including `null`, `"qa_manager"`, `"developer"`, `"viewer"`
    - Use `fc.constantFrom("admin","qa_manager","developer","viewer", null)`
    - _Requirements: 5.1, 5.2_

- [x] 3. Build pure display components in `components/usage/`
  - [x] 3.1 Create `components/usage/usage-gauge-card.tsx`
    - Props: `{ data: QuotaData }`
    - Canvas: `bg-[#111827] border border-[#374151] rounded` (max 4px), no drop shadow
    - Display `token_units_used / token_units_limit` numerics in `font-['JetBrains_Mono'] text-[13px] font-medium`
    - Flat horizontal progress bar: `<div>` with inline `width: usagePct%` capped at 100%; height `h-2`; no `rounded-*` > `rounded`; no `shadow-*`
    - Bar color: `bg-[#05b169]` when healthy, `bg-[#f4b000]` when warning, `bg-[#cf202f]` when exhausted
    - Render `QuotaStatusBadge` when exhausted: square badge (`rounded-none`), `border border-[#cf202f] bg-transparent text-[#cf202f]` with label "QUOTA EXHAUSTED"
    - `usagePct` percentage label in JetBrains Mono
    - Error state: display a non-numeric error label (e.g. `"⚠ Quota data unavailable"`) — never render `0` or `0/0` when `ActionResult.error` is present (Req 9.4)
    - Skeleton placeholder: `animate-pulse` div matching gauge card dimensions, triggered when loading
    - `focus-visible:ring-2 focus-visible:ring-[#0052ff]` on all interactive elements; `aria-label` on progress bar
    - _Requirements: 2.1–2.9, 7.2–7.6, 7.8–7.9_

  - [x] 3.2 Create `components/usage/leaderboard-table.tsx`
    - Props: `{ rows: DeveloperUsageRow[] }`
    - Pure display component — no data fetching
    - Table container: `bg-[#111827] border border-[#374151]` (max 4px radius)
    - Table headers: `font-['Inter'] text-xs font-semibold uppercase tracking-[0.5px] text-[#9ca3af]` — columns: Rank, Developer Email, Logs Uploaded, Total Tokens
    - Row padding: `py-3` (12px vertical)
    - All numeric cells (rank, log count, token count) and email cells: `font-['JetBrains_Mono'] text-[13px] font-medium`
    - Row hover: `hover:bg-[#1f2937]` transition, no `hover:shadow-*`, no border-radius change
    - Row border: `border-b border-[#374151]` only (no vertical dividers)
    - Wrap `<motion.tr>` in Framer Motion with `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}`
    - Empty state: render a labelled message (no table rows) referencing the active filter label (Req 4.6)
    - `aria-label` on table; column `scope="col"` on headers; `role="rowgroup"` on `<tbody>`
    - _Requirements: 3.1–3.8, 7.5, 7.7, 7.8, 7.11, 7.13_

  - [x] 3.3 Create `components/usage/usage-skeleton.tsx`
    - Export `<GaugeSkeleton />`: `animate-pulse` block matching the gauge card dimensions (within 4px tolerance)
    - Export `<LeaderboardSkeleton />`: `animate-pulse` row blocks matching the leaderboard table rows
    - No generic spinner overlays; no `rounded-*` > `rounded`; no `shadow-*`
    - Dimensions must match target elements within 4px (Req 7.9)
    - _Requirements: 2.8, 4.4, 7.9_

- [x] 4. Build the client component `components/usage/usage-client.tsx`
  - [x] 4.1 Implement `UsageClient` with `TimeFilterBar` and leaderboard state management
    - `"use client"` directive
    - Props: `{ initialRows: DeveloperUsageRow[]; initialFilter: TimeFilter }` — always `"30d"` on page load (Req 4.5)
    - State: `rows`, `activeFilter`, `error: string | null`
    - `useTransition` for non-blocking server action calls; `isPending` drives skeleton display
    - Render `<TimeFilterBar activeFilter={activeFilter} isPending={isPending} onSelect={handleFilterChange} />`
    - `handleFilterChange(filter: TimeFilter)`: call `getDeveloperUsage({ timeFilter: filter })` inside `startTransition`; on success update `rows`; on error set `error` and clear `rows` (never show stale data on error per Req 4.7)
    - Timeout guard: use `setTimeout` inside the transition; if 10 seconds elapse with `isPending` still true, surface timeout error state (Req 4.4)
    - Wrap conditional content in `<AnimatePresence mode="wait">`; render `<LeaderboardSkeleton key="skeleton" />` when `isPending`, else `<LeaderboardTable key="table" rows={rows} />` or `<ErrorState />` or `<EmptyState />`
    - `active:scale-[0.98]` on all filter buttons
    - _Requirements: 4.1–4.7_

  - [x] 4.2 Implement `TimeFilterBar` within `usage-client.tsx`
    - Four `<motion.button>` buttons: "Last 7 days" (`7d`), "Last 30 days" (`30d`), "Last 90 days" (`90d`), "All Time" (`all`)
    - Active state: `border border-[#0052ff] text-[#f9fafb]`; inactive: `border border-[#374151] text-[#9ca3af]`
    - Disabled and `disabled:opacity-50 disabled:cursor-not-allowed` when `isPending`
    - `layout` prop with `transition={{ type: "spring", stiffness: 400, damping: 25 }}` for the selection indicator
    - `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052ff]` on each button
    - Explicit `aria-pressed` attribute reflecting active state; `role="group"` with `aria-label="Time range filter"` on wrapper
    - _Requirements: 4.1, 7.8, 7.10_

- [x] 5. Rewrite `app/dashboard/usage/page.tsx` as full-featured RSC
  - [x] 5.1 Implement RSC with role gate, gauge fetch, initial leaderboard fetch
    - Keep `export const dynamic = "force-dynamic"` (Req 8.1)
    - Auth sequence: `createClient().auth.getUser()` → redirect to `/login` if no user; `adminClient users` → redirect to `/login` if no `org_id`; `adminClient user_roles` → redirect to `/login` if no role row
    - Role gate: allow `admin | qa_manager`; render `<AccessDenied>` component for `developer | viewer` (Req 1.2, 1.3)
    - Derive `Org_ID` exclusively from JWT — never from URL params or query strings (Req 1.5)
    - Call `getOrgQuota()` server-side; pass resulting `ActionResult<QuotaData>` as props to `<UsageGaugeCard>`
    - Call `getDeveloperUsage({ timeFilter: "30d" })` server-side for initial data; pass as `initialRows` to `<UsageClient>`
    - Wrap in `<Suspense fallback={<UsagePageSkeleton />}>`
    - Page canvas: `bg-[#030712]` (Req 7.1); section headings in `font-['Inter'] text-2xl font-medium` (Req 7.6)
    - Keep `<DashboardHeader>` always rendered regardless of data errors (Req 9.5)
    - Error states scoped per component: gauge error does not suppress leaderboard and vice versa (design doc §Error Handling)
    - _Requirements: 1.1–1.6, 8.1, 9.5_

  - [x] 5.2 Checkpoint — verify auth gate redirects, role gate renders, and data flows end-to-end
    - Manually verify or write unit tests: unauthenticated → redirect `/login`; `developer` role → `<AccessDenied>`; `qa_manager` role → full dashboard; `admin` role → full dashboard including gauge
    - Ensure `bun run test` passes

- [x] 6. Update the main dashboard nav card in `app/dashboard/page.tsx`
  - [x] 6.1 Rename nav card label from "Team Usage" to "Token Usage"
    - In `app/dashboard/page.tsx`, find the existing `<Link href="/dashboard/usage">` nav card (currently rendered `{userRole === "admin" && ( ... )}`)
    - Update the visible label text from `"Team Usage"` to `"Token Usage"` (Req 5.5)
    - Confirm the role gate remains `userRole === "admin"` only — not `qa_manager` (Req 5.1, 5.2)
    - Confirm the skeleton placeholder is already rendered during `<Suspense>` loading (Req 5.3)
    - _Requirements: 5.1, 5.2, 5.5_

- [x] 7. Accessibility validation
  - [x] 7.1 Write axe-core accessibility test for the usage page
    - File: `app/dashboard/usage/__tests__/usage.a11y.test.tsx`
    - Use `@testing-library/react` to render `<UsageGaugeCard>`, `<LeaderboardTable>`, and `<TimeFilterBar>` with representative mock data
    - Run `axe` from `axe-core` via `@testing-library/jest-dom` or equivalent; assert zero critical violations (Req 7.8)
    - Verify contrast-passing text colors are applied (bg `#111827` / text `#f9fafb` and `#9ca3af` for muted — WCAG AA minimum 4.5:1)
    - Verify focus ring `focus-visible:ring-2 focus-visible:ring-[#0052ff]` is present on interactive elements (Req 7.10)
    - _Requirements: 7.8, 7.10_

- [x] 8. Final checkpoint — full test suite and build verification
  - Ensure all `vitest --run` tests pass (or document any intentionally skipped tests)
  - Run `bun run build` and confirm zero TypeScript compilation errors
  - Verify no `rounded-*` class exceeds `rounded` (4px) in any new file
  - Verify no `shadow-*` class appears in any new file
  - Verify all numeric and email values in new components use `font-['JetBrains_Mono']`
  - Verify `import 'server-only'` is present at line 1 of `app/dashboard/usage/actions.ts`
  - Ask the user if any questions have arisen before declaring the feature complete.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- All property tests target functions extracted into `app/dashboard/usage/lib/usage-logic.ts` — Supabase calls are mocked; pure functions are tested in isolation
- The PBT framework is `fast-check` v4 with Vitest v4 (`vitest --run`)
- Run tests with `bun run test` or `npx vitest --run` from `omnis-ui/`
- The `adminClient` proxy pattern (fresh client on every property access) is already established in `utils/supabase/admin.ts` — do not create a module-level singleton
- The existing `actions.ts` return shape `{ rows, error? }` is replaced by `ActionResult<T>` — update the `page.tsx` call-site accordingly in task 5.1
- `framer-motion` is not yet listed in `package.json` — add it as a dependency before implementing tasks 3.2 and 4.1
- The `components/usage/` directory does not yet exist — create it in task 3.1

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["4.1", "4.2"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["5.2", "6.1"] },
    { "id": 6, "tasks": ["7.1"] }
  ]
}
```
