# Implementation Plan: Triage Inbox Resolution

## Overview

Implement the production-grade triage inbox at `/dashboard/triage`, building on the existing `actions.ts` skeleton and `triage-queue-client.tsx` prototype. The work covers: hardening both Server Actions to full spec (including `getPendingCount` and Developer-scoped reads), replacing the prototype components with design-system-compliant production components, adding the `TriageBadge` to `DashboardLayout`, and wiring property-based and unit tests for all 17 correctness properties.

Existing files that must be **replaced/extended** (not created from scratch):
- `omnis-ui/app/dashboard/triage/actions.ts` — add `getPendingCount`, Developer path, extended `ResolveTriageResult`, audit `before.original_req_id` fix
- `omnis-ui/app/dashboard/triage/page.tsx` — full design-system rewrite, Viewer redirect, `<h1>`, timeout logic
- `omnis-ui/components/triage-queue-client.tsx` — full spec-compliant rewrite with filter/sort/inFlight/focus management

New files to create:
- `omnis-ui/components/triage-item-card.tsx`
- `omnis-ui/components/triage-skeleton.tsx`
- `omnis-ui/components/triage-status-badge.tsx`
- `omnis-ui/components/triage-badge.tsx`
- `omnis-ui/__tests__/triage/properties/` (property test files)
- `omnis-ui/__tests__/triage/unit/` (unit test files)

---

## Tasks

- [x] 1. Harden Server Actions in `actions.ts`
  - [x] 1.1 Extend `ResolveTriageResult` and fix audit `before.original_req_id`
    - Add `suggestedReqId?: string` and `originalReqId?: string` to `ResolveTriageResult` interface
    - In `resolveTriageItem`, fetch `evidence_logs.req_id` at call time (not `ai_triage_queue.original_req_id`) for the audit `before.original_req_id` field — currently the prototype uses `triageRow.suggested_req_id` incorrectly
    - Return `suggestedReqId` and `originalReqId` on the `success: true` path so the client can build accurate toast messages
    - Propagate `success: false` + `CRITICAL` console log when the `audit_logs` INSERT fails, and surface the error string to the caller
    - _Requirements: 3.6, 4.4, 7.4, 7.7_

  - [x] 1.2 Add Developer-scoped read path to `getPendingTriageItems`
    - After the role check, when `role === 'developer'`, extend the Supabase query with `.eq("evidence_logs.user_id", userId)` so developers see only their own items
    - Strip both `org_id` and `user_id` from the join columns before returning to the client
    - Return a Forbidden error for `viewer` role
    - _Requirements: 1.5, 1.6_

  - [x] 1.3 Add `getPendingCount` Server Action
    - Implement `getPendingCount(): Promise<{ count: number; error?: string }>` using `adminClient` with `{ count: "exact", head: true }` to avoid fetching row data
    - Derive `orgId` from the session via `resolveCallerContext`; return `{ count: 0 }` (not an error) if the query fails so the badge silently hides
    - Export from `actions.ts`; mark file with `import 'server-only'` (already present, verify it remains)
    - _Requirements: 8.1, 8.5, 8.7_

  - [x]* 1.4 Write property test: Property 16 — role gate on `resolveTriageItem`
    - `// Feature: triage-inbox-resolution, Property 16: Role gate always blocks non-authorized roles`
    - Mock `resolveCallerContext` to return arbitrary `role` values from `fc.constantFrom('developer', 'viewer', null)`; assert `success: false` and zero DB calls
    - Mock `adminClient` and assert no `.update()` calls are made for blocked roles
    - File: `omnis-ui/__tests__/triage/properties/resolve-role-gate.property.test.ts`
    - **Validates: Requirements 4.7, 6.1, 6.2**

  - [x]* 1.5 Write property test: Property 13 — double-resolution prevention
    - `// Feature: triage-inbox-resolution, Property 13: Double-resolution always returns error`
    - Mock the triage row fetch to return `status: fc.constantFrom('approved', 'rejected')`; assert `success: false` and zero `.update()` / `.insert()` calls
    - File: `omnis-ui/__tests__/triage/properties/double-resolution.property.test.ts`
    - **Validates: Requirements 5.1, 5.2**

  - [x]* 1.6 Write property test: Property 7 — cross-org write ownership
    - `// Feature: triage-inbox-resolution, Property 7: Write ownership check prevents cross-org mutations`
    - Mock the triage row fetch to return `null` (simulating org mismatch); assert `success: false` and zero mutating DB calls
    - File: `omnis-ui/__tests__/triage/properties/cross-org-ownership.property.test.ts`
    - **Validates: Requirements 3.3, 3.4**


- [x] 2. Implement resolution write correctness and audit trail
  - [x] 2.1 Verify and harden the two-write sequence in `resolveTriageItem`
    - Confirm Step 4 (approve path `evidence_logs.req_id` patch) uses the `org_id` guard predicate as defence-in-depth
    - Confirm `writeAuditLog` failure path returns `success: false` with the Tier 3 error message and emits the CRITICAL console log with the triage item ID
    - Add the `revalidatePath("/dashboard")` call alongside the existing triage revalidation so the layout badge updates on next navigation
    - _Requirements: 3.2, 3.9, 4.8, 7.1, 7.7_

  - [x]* 2.2 Write property test: Property 8 — status transition correctness
    - `// Feature: triage-inbox-resolution, Property 8: Status transition is correct for both resolution types`
    - Generate `fc.constantFrom('approved', 'rejected')` as resolution; mock the DB calls; assert the `.update({ status: resolution })` call matches the input exactly and no other status values are written
    - File: `omnis-ui/__tests__/triage/properties/status-transition.property.test.ts`
    - **Validates: Requirements 3.1, 4.1**

  - [x]* 2.3 Write property test: Property 5 — approve always patches `evidence_logs.req_id`
    - `// Feature: triage-inbox-resolution, Property 5: Approve always patches evidence_logs.req_id to suggested_req_id`
    - Generate arbitrary `suggested_req_id` strings; mock `adminClient`; assert the `.update({ req_id: suggested_req_id })` call uses exactly the triage row's `suggested_req_id` value
    - File: `omnis-ui/__tests__/triage/properties/approve-patches-req-id.property.test.ts`
    - **Validates: Requirement 3.2**

  - [x]* 2.4 Write property test: Property 6 — reject is a no-op on `evidence_logs`
    - `// Feature: triage-inbox-resolution, Property 6: Reject is a no-op on evidence_logs`
    - Mock `adminClient`; assert zero `.update()` calls are made on the `evidence_logs` table when `resolution === 'rejected'`
    - File: `omnis-ui/__tests__/triage/properties/reject-noop.property.test.ts`
    - **Validates: Requirement 4.2**

  - [x]* 2.5 Write property test: Property 9 — audit log structure
    - `// Feature: triage-inbox-resolution, Property 9: Every resolution produces exactly one correctly structured audit log entry`
    - Generate arbitrary resolution inputs; assert the `audit_logs` INSERT is called exactly once with `action_type = 'TRIAGE_RESOLVE'`, correct `before`/`after` structure, and `req_id_updated_to = null` for reject
    - File: `omnis-ui/__tests__/triage/properties/audit-log-structure.property.test.ts`
    - **Validates: Requirements 3.9, 4.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

  - [x]* 2.6 Write property test: Property 10 — audit insert failure prevents resolution commit
    - `// Feature: triage-inbox-resolution, Property 10: Audit log insert failure prevents resolution commit`
    - Mock `adminClient.from("audit_logs").insert` to return an error; assert `success: false` and CRITICAL log emitted
    - File: `omnis-ui/__tests__/triage/properties/audit-failure-blocks-commit.property.test.ts`
    - **Validates: Requirement 7.7**

- [x] 3. Checkpoint — Server Action layer complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 4. Build `TriageStatusBadge` component
  - [x] 4.1 Create `omnis-ui/components/triage-status-badge.tsx`
    - Implement `TriageStatusBadge` accepting `status: "pending" | "approved" | "rejected"`
    - `PENDING`: `border-yellow-500 text-yellow-500`; `APPROVED`: `border-green-500 text-green-500`; `REJECTED`: `border-red-500 text-red-500`
    - Apply `rounded-none`, `border`, transparent background, uppercase text — no `shadow-*`, no `rounded-*` other than `rounded-none`
    - _Requirements: 11.5_

  - [x]* 4.2 Write unit test: `TriageStatusBadge` renders correct classes for each status
    - Render with each of the three status values; assert correct Tailwind border/text class is present and no `shadow` or rounded-other-than-none class appears
    - File: `omnis-ui/__tests__/triage/unit/triage-status-badge.test.tsx`
    - _Requirements: 11.5_

- [x] 5. Build `TriageItemCard` component
  - [x] 5.1 Create `omnis-ui/components/triage-item-card.tsx`
    - Implement `TriageItemCard` accepting the `TriageItemCardProps` interface from the design: `item`, `isInFlight`, `isViewerOwned`, `onApprove`, `onReject`
    - `evidence_log_id`: render first-8 + `…` + last-4 in `font-mono` with full UUID in `title` attribute
    - `created_at`: format as `MMM DD, HH:mm UTC` in `font-mono`
    - `original_req_id` in `text-yellow-400`, `suggested_req_id` in `text-blue-400` when they differ
    - If `ai_reasoning` is null/empty, render "No AI reasoning provided" placeholder
    - The `ai_triage_queue.id` must NOT appear as a visible text node
    - Include `TriageStatusBadge` for the item status
    - Card: `bg-gray-900 border border-slate-700 rounded-sm` hover → `hover:bg-slate-800`; no `shadow-*`
    - Wrap in `<motion.div>` with spring entrance `transition={{ type: "spring", stiffness: 300, damping: 30 }}`
    - Approve button: `aria-label="Approve AI fix: apply [suggested_req_id]"`, `disabled` + `aria-disabled="true"` when `isInFlight` or `isViewerOwned`, shows `Loader2 animate-spin` during in-flight; `active:scale-95`
    - Reject button: `aria-label="Reject: keep original [original_req_id]"`, same disabled rules; `active:scale-95`
    - When `isViewerOwned`: render both buttons disabled with tooltip indicating own submission
    - Non-pending items: do NOT render Approve/Reject buttons
    - All interactive elements: `focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none`
    - No arbitrary Tailwind values (`w-[...]`, `text-[...]`)
    - _Requirements: 2.1–2.8, 3.8, 4.5, 6.4, 9.5, 11.1–11.9, 12.1, 12.3, 12.6, 12.7_

  - [x]* 5.2 Write property test: Property 4 — card renders all required fields for any triage item
    - `// Feature: triage-inbox-resolution, Property 4: Card renders all required fields correctly for any triage item`
    - Generate arbitrary `AiTriageQueueRow` shapes via `fc.record`; render with RTL; assert all 7 sub-criteria (a)–(g) from the property definition
    - File: `omnis-ui/__tests__/triage/properties/card-renders-required-fields.property.test.ts`
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8**

  - [x]* 5.3 Write property test: Property 15 — non-pending items never render action buttons
    - `// Feature: triage-inbox-resolution, Property 15: Non-pending items never render action buttons`
    - Generate items with `status: fc.constantFrom('approved', 'rejected')`; assert Approve and Reject buttons are absent from the rendered DOM
    - File: `omnis-ui/__tests__/triage/properties/non-pending-no-action-buttons.property.test.ts`
    - **Validates: Requirement 9.5**

  - [x]* 5.4 Write property test: Property 17 — aria-labels contain interpolated req_id values
    - `// Feature: triage-inbox-resolution, Property 17: aria-labels contain interpolated req_id values for any triage item`
    - Generate arbitrary `suggested_req_id` and `original_req_id` strings; assert the rendered button `aria-label` attributes contain the exact generated values
    - File: `omnis-ui/__tests__/triage/properties/aria-label-interpolation.property.test.ts`
    - **Validates: Requirement 12.1**

  - [x]* 5.5 Write unit tests for `TriageItemCard` UI rules
    - Test: `ai_reasoning` null → placeholder text rendered
    - Test: `ai_reasoning` empty string → placeholder text rendered
    - Test: `isInFlight=true` → both buttons have `aria-disabled="true"` and `Loader2` spinner is present
    - Test: `isViewerOwned=true` → both buttons disabled with tooltip text present
    - Test: design system classes present (`bg-gray-900`, `border-slate-700`, `rounded-sm`, `font-mono` on `evidence_log_id` and `created_at`)
    - Test: no `shadow-*` class in rendered output
    - File: `omnis-ui/__tests__/triage/unit/triage-item-card.test.tsx`
    - _Requirements: 2.3, 2.8, 3.8, 4.5, 6.4, 11.2, 12.6, 12.7_


- [x] 6. Build `TriageSkeleton` component
  - [x] 6.1 Create `omnis-ui/components/triage-skeleton.tsx`
    - Render exactly 3 `animate-pulse` placeholder cards (satisfies "3–5" lower bound and keeps it deterministic)
    - Each card: `bg-slate-800 border border-slate-700 rounded-sm`; one header-line placeholder and two body-line placeholders matching `TriageItemCard` dimensions
    - No `shadow-*`, no arbitrary Tailwind values
    - _Requirements: 10.1, 10.2, 10.3_

  - [x]* 6.2 Write unit test: `TriageSkeleton` renders correct structure and classes
    - Assert 3 skeleton cards in the DOM, each with `animate-pulse`, `bg-slate-800`, `border-slate-700`, `rounded-sm`
    - Assert no `shadow-*` class present
    - File: `omnis-ui/__tests__/triage/unit/triage-skeleton.test.tsx`
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 7. Build `TriageBadge` component and `getPendingCount` integration
  - [x] 7.1 Create `omnis-ui/components/triage-badge.tsx`
    - Implement `TriageBadge` accepting `{ count: number; role: string }`
    - If `count === 0` or role is `developer` / `viewer`: return `null` (nothing in DOM)
    - If `1 ≤ count ≤ 99`: display the numeric string; if `count > 99`: display `"99+"`
    - Extract `formatBadgeCount(count: number): string | null` as a pure exported helper function (needed for property test)
    - Badge styling: `rounded-none`, `border`, semantic color per design system; no `shadow-*`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 7.2 Integrate `TriageBadge` into `DashboardLayout`
    - In `omnis-ui/app/dashboard/layout.tsx`, call `getPendingCount()` after the role is resolved
    - Import and render `<TriageBadge count={pendingCount} role={role ?? ''} />` in the navigation adjacent to the triage inbox link
    - The badge fetch must be server-side; no client polling
    - _Requirements: 8.1, 8.4, 8.5, 8.6_

  - [x]* 7.3 Write property test: Property 11 — badge count display with 99+ cap
    - `// Feature: triage-inbox-resolution, Property 11: Badge displays correct count with 99+ cap`
    - Use `fc.nat()` generator; test `formatBadgeCount` pure function; assert null for 0, string(n) for 1–99, "99+" for >99
    - File: `omnis-ui/__tests__/triage/properties/badge-count-cap.property.test.ts`
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [x]* 7.4 Write property test: Property 12 — badge only visible to admin and qa_manager
    - `// Feature: triage-inbox-resolution, Property 12: Badge is only visible to admin and qa_manager roles`
    - Enumerate all four roles; render `TriageBadge` with `count=5`; assert badge absent for `developer`/`viewer`, present for `admin`/`qa_manager`
    - File: `omnis-ui/__tests__/triage/properties/badge-role-visibility.property.test.ts`
    - **Validates: Requirement 8.4**

  - [x]* 7.5 Write unit test: `TriageBadge` does not render when count is zero
    - Render with `count=0` for `admin` and `qa_manager` roles; assert no badge element in DOM
    - File: `omnis-ui/__tests__/triage/unit/triage-badge.test.tsx`
    - _Requirements: 8.2_


- [x] 8. Rewrite `TriageQueueClient` to full spec
  - [x] 8.1 Rewrite `omnis-ui/components/triage-queue-client.tsx`
    - Accept `TriageQueueClientProps`: `{ initialItems: AiTriageQueueRow[]; viewerRole: "qa_manager" | "admin" | "developer" }`
    - Own state: `items`, `inFlight: Set<string>`, `statusFilter: StatusFilter`, `sortOrder: SortOrder`
    - Derive `displayItems` via `useMemo` applying filter then sort (oldest_first = ascending `created_at`, newest_first = descending)
    - `handleResolve`: guard `inFlight.has(id)` (double-click prevention); optimistic remove with `setItems(prev => prev.filter(i => i.id !== id))`; restore with duplicate guard `!prev.some(i => i.id === id)` on failure
    - Toast rules: success (approve) ≥5s; success (reject) ≥4s; general error 5s; "already resolved" error persists (`duration: null`) until explicit dismiss
    - Use `result.suggestedReqId` / `result.originalReqId` from the updated `ResolveTriageResult` for toast messages
    - Toast container: `aria-live="polite"` and `aria-atomic="true"`
    - Wrap item list in `<AnimatePresence>`; exit: `opacity: 0, scale: 0.95`; exit transition `{ type: "spring", stiffness: 200, damping: 25 }`
    - Card entrance transition: `{ type: "spring", stiffness: 300, damping: 30 }`
    - Focus management: after removal, move focus to next `TriageItemCard` or to empty-state `<p>` if none remain (Requirement 12.8)
    - Filter controls: `All | Pending | Approved | Rejected`; sort controls: `Oldest First | Newest First`
    - Empty state: `<p>` with non-empty text, not `aria-hidden`
    - Pass `isInFlight={inFlight.has(item.id)}` and `isViewerOwned={viewerRole === 'developer'}` to each `TriageItemCard`
    - All interactive elements: `focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none`
    - _Requirements: 1.3, 3.5, 3.6, 4.3, 4.4, 5.3, 5.4, 5.5, 9.1–9.6, 11.8, 12.2, 12.3, 12.8_

  - [x]* 8.2 Write property test: Property 2 — sort order invariant
    - `// Feature: triage-inbox-resolution, Property 2: Sort order invariant`
    - Generate `fc.array(fc.record({ ...AiTriageQueueRow fields }))` with arbitrary ISO `created_at` strings; extract and test the `displayItems` sort logic as a pure function; assert non-decreasing for `oldest_first` and non-increasing for `newest_first`
    - File: `omnis-ui/__tests__/triage/properties/sort-order-invariant.property.test.ts`
    - **Validates: Requirements 1.2, 9.4**

  - [x]* 8.3 Write property test: Property 14 — filter scopes displayed items to selected status
    - `// Feature: triage-inbox-resolution, Property 14: Filter correctly scopes displayed items to selected status`
    - Generate mixed-status item arrays; assert no item with a non-matching status appears in the filtered display list for each non-`all` filter value
    - File: `omnis-ui/__tests__/triage/properties/filter-status-scope.property.test.ts`
    - **Validates: Requirement 9.2**

  - [x]* 8.4 Write unit tests for `TriageQueueClient` state management
    - Test: optimistic remove on action dispatch
    - Test: item restored at list head on server failure (no duplicate guard violation)
    - Test: "already resolved" error toast persists (no auto-dismiss call triggered)
    - Test: `inFlight` Set prevents second action on same item (double-click guard)
    - Test: empty state `<p>` element is present and accessible after all items resolved
    - File: `omnis-ui/__tests__/triage/unit/triage-queue-client.test.tsx`
    - _Requirements: 3.5, 4.3, 5.3, 5.4, 5.5, 1.3, 12.4_

- [x] 9. Checkpoint — Component layer complete
  - Ensure all tests pass, ask the user if questions arise.


- [x] 10. Rewrite `TriagePage` and `TriageContent` Server Components
  - [x] 10.1 Rewrite `omnis-ui/app/dashboard/triage/page.tsx`
    - Confirm `export const dynamic = "force-dynamic"` is present
    - Add Viewer redirect: call `resolveCallerContext()` at the top; if `role === 'viewer'`, call `redirect('/dashboard')`
    - Add unauthenticated redirect: if no session, call `redirect('/login?next=/dashboard/triage')`
    - Render a visible `<h1>` element as the primary landmark heading (e.g., "AI Triage Inbox")
    - Replace `TriageSkeleton` with the new `triage-skeleton.tsx` component
    - Replace the ad-hoc skeleton style (`bg-zinc-50`, `border-zinc-200`) with the design-system skeleton from Task 6
    - Wrap `<TriageContent>` in `<Suspense fallback={<TriageSkeleton />}`
    - Replace all `bg-zinc-50`, `bg-white`, `border-zinc-200` occurrences with `bg-gray-950` / `bg-gray-900` / `border-slate-700` per the QAVRO dark-canvas design system
    - Remove the inline guidance banner's `bg-amber-50` / `border-amber-200` — replace with a `border border-slate-700 bg-gray-900` styled info panel
    - No arbitrary Tailwind values; no `shadow-*`
    - _Requirements: 1.7, 1.6, 1.8, 10.4, 11.1, 12.5_

  - [x] 10.2 Implement 10-second Suspense timeout in `TriageContent`
    - Wrap `getPendingTriageItems()` with `Promise.race()` against a `new Promise(resolve => setTimeout(resolve, 10_000))` that resolves with a timeout sentinel
    - If the timeout fires first, render the inline error banner (Requirement 1.4) rather than stalling indefinitely
    - Pass `viewerRole` from the resolved session context down to `TriageQueueClient`
    - _Requirements: 10.5_

  - [x]* 10.3 Write unit tests for `TriagePage` structure
    - Test: `export const dynamic = "force-dynamic"` is exported from the module
    - Test: `<h1>` element is present in the rendered output
    - Test: error banner renders without raw DB error text for various mocked error strings
    - Test: empty state `<p>` element is in the accessibility tree (not `aria-hidden`)
    - File: `omnis-ui/__tests__/triage/unit/triage-page.test.tsx`
    - _Requirements: 1.3, 1.4, 1.7, 12.4, 12.5_

- [x] 11. Error sanitization and `getPendingTriageItems` read isolation
  - [x] 11.1 Add error sanitization helpers to `actions.ts`
    - Ensure all Supabase error objects are caught and mapped to the user-safe Tier 1/2/3 strings defined in the design's Error Handling section — no raw `error.message`, PostgreSQL codes, or stack traces may reach the `error` return value
    - Review all three tiers in `resolveTriageItem` and `getPendingTriageItems` to confirm no raw error text leaks
    - _Requirements: 1.4_

  - [x]* 11.2 Write property test: Property 3 — error messages never expose raw DB error details
    - `// Feature: triage-inbox-resolution, Property 3: Error messages never expose raw database error details`
    - Generate arbitrary Supabase-shaped error objects via `fc.record({ message: fc.string(), code: fc.string(), details: fc.string() })`; pass through the sanitization logic; assert the returned string contains no PostgreSQL codes (`/\d{5}/`), no raw `error.message` passthrough, no stack trace substrings
    - File: `omnis-ui/__tests__/triage/properties/error-sanitization.property.test.ts`
    - **Validates: Requirement 1.4**

  - [x]* 11.3 Write property test: Property 1 — org and user isolation for reads
    - `// Feature: triage-inbox-resolution, Property 1: Org and user isolation for reads`
    - Mock `adminClient` to return a dataset containing items from multiple `org_id` values; assert the returned items contain only rows matching the caller's `org_id`; for developer callers also assert `user_id` scoping
    - File: `omnis-ui/__tests__/triage/properties/org-user-isolation.property.test.ts`
    - **Validates: Requirements 1.1, 1.5**

- [x] 12. Checkpoint — Full integration, run complete test suite
  - Ensure all tests pass, ask the user if questions arise.


- [x] 13. Install `fast-check` dependency and create test infrastructure
  - [x] 13.1 Verify fast-check is available and create `__tests__/triage/` directory structure
    - Confirm `fast-check` `^4.8.0` is in `package.json` `devDependencies` (already present per existing file)
    - Create empty index files / `.gitkeep` markers for `omnis-ui/__tests__/triage/properties/` and `omnis-ui/__tests__/triage/unit/` so the directories are tracked
    - Create `omnis-ui/__tests__/triage/test-fixtures.ts` exporting reusable `fc.Arbitrary` generators for `AiTriageQueueRow`, UUID strings, ISO timestamps, and role values to be shared across all property tests
    - Verify `vitest.config.ts` `resolve.alias` mocks (`server-only`, `framer-motion`) cover the new test files; add `@/utils/supabase/admin` mock if needed for Server Action tests
    - _Requirements: all (test infrastructure)_

  - [x]* 13.2 Write smoke test confirming test infrastructure works
    - Minimal property test using `fc.nat()` to confirm `fast-check` runs in the Vitest environment without configuration issues
    - File: `omnis-ui/__tests__/triage/properties/smoke.property.test.ts`
    - _Requirements: all (test infrastructure)_

- [x] 14. Final checkpoint — All 17 properties covered, full suite green
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery, but are required for full 21 CFR Part 11 / IEC 62304 compliance validation
- `fast-check` v4.8.0 is already listed in `devDependencies` — no installation step required
- The existing `actions.ts` and `triage-queue-client.tsx` are prototypes that must be **replaced**, not extended incrementally; treat them as a foundation to rewrite in-place
- All component files must use `import 'server-only'` where applicable; Server Actions already have this guard — verify it is not removed during rewrites
- The `vitest.config.ts` mocks `framer-motion` and `server-only` — property tests testing Server Action logic must mock `@/utils/supabase/admin` and `@/utils/supabase/server` to avoid live DB calls
- Each property test file must include the tag comment `// Feature: triage-inbox-resolution, Property N: <property_text>` on the first line of the test
- `formatBadgeCount` (from Task 7.1) should be a pure function exported separately from `TriageBadge` so it can be tested without rendering React
- The `resolveCallerContext` helper in `actions.ts` should remain private to the module; test it indirectly through the exported Server Actions


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["13.1"] },
    { "id": 1, "tasks": ["1.1", "1.2", "1.3", "13.2"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.6", "2.1", "4.1", "6.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "5.1", "7.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "4.2", "6.2", "7.3", "7.4", "7.5", "8.1"] },
    { "id": 5, "tasks": ["7.2", "8.2", "8.3", "8.4"] },
    { "id": 6, "tasks": ["10.1", "10.2", "11.1"] },
    { "id": 7, "tasks": ["10.3", "11.2", "11.3"] }
  ]
}
```
