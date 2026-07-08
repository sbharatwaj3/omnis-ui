# Requirements Document

## Introduction

The Triage Inbox Resolution feature is the human-in-the-loop review layer of the QAVRO Omnis RegOps compliance engine. When AWS Bedrock's AI analysis disagrees with the regulatory requirement tag (`req_id`) a developer applied to an evidence log, the discrepancy is automatically inserted into `ai_triage_queue` as a `pending` item. A QA Manager must then review the AI's flag, inspect its reasoning, and either approve the AI's suggested correction (which patches `evidence_logs.req_id`) or reject it (preserving the developer's original tag).

This feature governs the complete lifecycle of that review process: the inbox view, the resolution actions, contextual item detail, filtering and sorting, the audit trail, and the badge/counter that signals pending work. It must comply with FDA 21 CFR Part 11.10(e) (audit trails), 21 CFR Part 11.10(d) (operator identification), and IEC 62304 fail-safe principles. All UI must conform to the QAVRO dark-canvas design system.

The feature builds on top of existing infrastructure: the `ai_triage_queue` table, the `audit_logs` table, the `resolveTriageItem` Server Action, and the initial `TriageQueueClient` component. The requirements here define the full, production-grade surface area those foundations must grow into.

---

## Glossary

- **Triage_Inbox**: The `/dashboard/triage` page that lists all `pending` `ai_triage_queue` items for the authenticated user's organisation.
- **Triage_Item**: A single row in `ai_triage_queue`, representing one AI-flagged `req_id` discrepancy awaiting human review.
- **Resolution**: The act of a QA_Manager or Admin transitioning a Triage_Item's status from `pending` to `approved` or `rejected`.
- **Approve_Action**: A Resolution that accepts the AI's suggested `req_id` and patches `evidence_logs.req_id` to the `suggested_req_id` value.
- **Reject_Action**: A Resolution that dismisses the AI flag and retains the developer's `original_req_id` unchanged on the evidence log.
- **QA_Manager**: A user holding the `qa_manager` RBAC role as defined in `public.user_roles`.
- **Admin**: A user holding the `admin` RBAC role. Has the same Triage_Inbox access as QA_Manager.
- **Developer**: A user holding the `developer` RBAC role. May view only their own Triage_Items; may not perform Resolutions.
- **Viewer**: A user holding the `viewer` RBAC role. Has no access to the Triage_Inbox.
- **Audit_Log**: An append-only row in `public.audit_logs` capturing every Resolution with `action_type = 'TRIAGE_RESOLVE'` per 21 CFR Part 11.10(e).
- **Pending_Count**: The integer count of `ai_triage_queue` rows with `status = 'pending'` for the authenticated user's organisation.
- **Triage_Badge**: A numeric badge rendered on the Triage_Inbox navigation link that displays the Pending_Count.
- **Evidence_Log**: A row in `public.evidence_logs` referenced by a Triage_Item via `evidence_log_id`.
- **Regulatory_Rule**: A row in `public.regulatory_rules` identified by `req_id`, representing an FDA 21 CFR or IEC 62304 clause.
- **resolveTriageItem**: The existing Next.js Server Action in `omnis-ui/app/dashboard/triage/actions.ts` that executes Resolution writes.
- **adminClient**: The Supabase service-role client used by Server Actions to bypass RLS for cross-tenant-safe writes.
- **RLS**: Row Level Security enforced by PostgreSQL on all `public` schema tables per the existing Supabase migrations.

---

## Requirements

### Requirement 1: Triage Inbox Data Loading

**User Story:** As a QA Manager, I want the Triage Inbox to load all pending AI-flagged discrepancies for my organisation when I navigate to `/dashboard/triage`, so that I have a complete and current view of items requiring my attention.

#### Acceptance Criteria

1. WHEN a QA_Manager or Admin with a valid authenticated session navigates to `/dashboard/triage`, THE Triage_Inbox SHALL fetch all `ai_triage_queue` rows with `status = 'pending'` that are linked to `evidence_logs` belonging to the authenticated user's `org_id`.
2. THE Triage_Inbox SHALL render Triage_Items ordered by `created_at` ascending by default, so that the oldest unreviewed flags appear first.
3. WHEN no `pending` Triage_Items exist for the authenticated user's organisation, THE Triage_Inbox SHALL display a visible empty-state indicator (a non-empty text element present in the DOM) communicating that the inbox is clear.
4. IF the database query fails, THEN THE Triage_Inbox SHALL display an inline error banner containing a user-safe error message and SHALL NOT include raw PostgreSQL error text, error codes, or stack traces in the rendered output.
5. WHEN a Developer with a valid authenticated session navigates to `/dashboard/triage`, THE Triage_Inbox SHALL fetch only the `pending` Triage_Items linked to `evidence_logs` where `evidence_logs.user_id` equals that Developer's Supabase Auth `user_id`.
6. WHEN a Viewer attempts to access `/dashboard/triage`, THE Triage_Inbox SHALL redirect the Viewer to `/dashboard` and SHALL NOT render any Triage_Items.
7. THE Triage_Inbox page SHALL use `export const dynamic = "force-dynamic"` to prevent Next.js from caching the server response, ensuring QA_Managers always see resolutions applied by other reviewers.
8. WHEN an unauthenticated user (no valid session) attempts to access `/dashboard/triage`, THE Triage_Inbox SHALL redirect to the sign-in page and SHALL NOT render any Triage_Items.

---

### Requirement 2: Triage Item Display

**User Story:** As a QA Manager, I want each Triage_Item to display the developer's original tag, the AI's suggested tag, the AI's reasoning, the associated evidence log ID, and the timestamp, so that I have all the context I need to make a well-informed Resolution decision.

#### Acceptance Criteria

1. THE Triage_Item card SHALL display the `original_req_id` value with a label explicitly identifying it as the developer's original tag (e.g., "Developer Tag").
2. THE Triage_Item card SHALL display the `suggested_req_id` value with a label explicitly identifying it as the AI's suggestion (e.g., "AI Suggestion").
3. THE Triage_Item card SHALL render the full `ai_reasoning` text string in its entirety; no CSS `overflow: hidden`, `text-overflow: ellipsis`, `line-clamp`, or `-webkit-line-clamp` truncation SHALL be applied to this field.
4. THE Triage_Item card SHALL display the `evidence_log_id` value in `JetBrains Mono` font (`font-mono` Tailwind class), visually truncated to the first 8 characters, an ellipsis (`…`), and the last 4 characters, and SHALL expose the complete UUID value in a `title` attribute on the containing element.
5. THE Triage_Item card SHALL display the `created_at` timestamp formatted as `MMM DD, HH:mm UTC` (e.g., `Jun 24, 14:32 UTC`) in `JetBrains Mono` font (`font-mono` Tailwind class).
6. IF the `original_req_id` and `suggested_req_id` values differ, THEN THE Triage_Item card SHALL render `original_req_id` in `text-yellow-400` and `suggested_req_id` in `text-blue-400` to make the contrast immediately apparent.
7. THE Triage_Item card SHALL NOT render the `ai_triage_queue.id` UUID as a user-visible text label; the `evidence_log_id` is the sole human-relevant identifier surfaced on the card.
8. IF the `ai_reasoning` field is null or an empty string, THEN THE Triage_Item card SHALL display a placeholder label (e.g., "No AI reasoning provided") in place of the reasoning text.

---

### Requirement 3: Resolution Actions — Approve

**User Story:** As a QA Manager, I want to approve the AI's suggested `req_id` correction, so that the evidence log is re-tagged to the correct regulatory requirement and the compliance record is accurate.

#### Acceptance Criteria

1. WHEN a QA_Manager clicks the "Approve AI Fix" button on a Triage_Item, THE resolveTriageItem Server Action SHALL update that Triage_Item's `status` to `'approved'` in `ai_triage_queue`.
2. WHEN the Approve_Action is executed, THE resolveTriageItem Server Action SHALL patch `evidence_logs.req_id` to the Triage_Item's `suggested_req_id` value for the referenced `evidence_log_id`.
3. WHEN the Approve_Action is executed and the ownership check passes, THE resolveTriageItem Server Action SHALL verify that the referenced `evidence_log_id` belongs to the authenticated user's `org_id` before applying the patch.
4. IF the ownership check in criterion 3 fails (the `evidence_log_id` does not belong to the authenticated user's `org_id`), THEN THE resolveTriageItem Server Action SHALL return a Forbidden error and SHALL NOT apply any patch to `evidence_logs` or `ai_triage_queue`.
5. WHEN the Approve_Action succeeds, THE Triage_Inbox SHALL remove the resolved Triage_Item from the displayed list immediately upon action dispatch (before the Server Action response is received), and the item SHALL NOT reappear if the action subsequently succeeds.
6. WHEN the Approve_Action succeeds, THE Triage_Inbox SHALL display a success notification containing the `suggested_req_id` value that was applied, and the notification SHALL remain visible for at least 5 seconds or until the user dismisses it.
7. IF the `evidence_logs.req_id` patch fails after the `ai_triage_queue` status update to `'approved'` has already succeeded, THEN THE Triage_Inbox SHALL display an error notification containing the text "Contact an administrator" and SHALL NOT silently leave the evidence log unpatched; the `ai_triage_queue` row SHALL retain its `'approved'` status to enable manual reconciliation.
8. WHEN the Approve_Action is triggered, THE "Approve AI Fix" button SHALL replace its label with a Lucide `Loader2` spinner (`animate-spin`) and SHALL maintain its pre-click rendered width until the Server Action returns.
9. WHEN the Approve_Action succeeds, THE resolveTriageItem Server Action SHALL insert one row into `public.audit_logs` with `action_type = 'TRIAGE_RESOLVE'` per 21 CFR Part 11 non-repudiation requirements.

---

### Requirement 4: Resolution Actions — Reject

**User Story:** As a QA Manager, I want to reject the AI's suggestion and preserve the developer's original `req_id` tag, so that the evidence log retains the developer's intentional regulatory mapping.

#### Acceptance Criteria

1. WHEN a QA_Manager clicks the "Reject / Keep Original" button on a Triage_Item whose `status = 'pending'`, THE resolveTriageItem Server Action SHALL update that Triage_Item's `status` to `'rejected'` in `ai_triage_queue`.
2. WHEN the Reject_Action is executed, THE resolveTriageItem Server Action SHALL leave `evidence_logs.req_id` unchanged; no UPDATE SHALL be issued against the `evidence_logs` table for this action.
3. WHEN the Reject_Action succeeds, THE Triage_Inbox SHALL remove the resolved Triage_Item from the displayed list immediately upon action dispatch (before the Server Action response is received).
4. WHEN the Reject_Action succeeds, THE Triage_Inbox SHALL display a success notification confirming that the developer's `original_req_id` has been retained, and the notification SHALL remain visible for at least 4 seconds or until the user dismisses it.
5. WHEN the Reject_Action is triggered, THE "Reject / Keep Original" button SHALL replace its label with a Lucide `Loader2` spinner (`animate-spin`) and SHALL maintain its pre-click rendered width until the Server Action returns.
6. IF the Reject_Action fails, THEN THE Triage_Inbox SHALL restore the Triage_Item to the displayed list, display an error notification that persists for at least 4 seconds, and SHALL NOT have applied any mutation to `ai_triage_queue` or `evidence_logs`.
7. WHEN the Reject_Action is triggered, THE resolveTriageItem Server Action SHALL re-derive the caller's role from the Supabase server-side session and SHALL return a Forbidden error if the role is not `qa_manager` or `admin`.
8. WHEN the Reject_Action succeeds, THE resolveTriageItem Server Action SHALL insert one row into `public.audit_logs` with `action_type = 'TRIAGE_RESOLVE'` per 21 CFR Part 11 non-repudiation requirements.

---

### Requirement 5: Double-Resolution Prevention

**User Story:** As a compliance platform, I need to ensure that an already-resolved Triage_Item cannot be resolved a second time, so that the evidence ledger does not receive duplicate or contradictory patches.

#### Acceptance Criteria

1. WHEN the `resolveTriageItem` Server Action is called with the `id` of a Triage_Item whose `status` is `'approved'` or `'rejected'`, THE Server Action SHALL return an error response indicating the item has already been resolved.
2. WHEN the `resolveTriageItem` Server Action is called with the `id` of a Triage_Item whose `status` is `'approved'` or `'rejected'`, THE Server Action SHALL NOT execute any database write.
3. WHEN a reviewer clicks the Approve or Reject button on a Triage_Item, THE Triage_Inbox client component SHALL mark that item as having a pending Resolution action until a response from the `resolveTriageItem` Server Action is received.
4. WHILE a Triage_Item has a pending Resolution action, THE Triage_Inbox client component SHALL render the Approve and Reject buttons for that item in a disabled state.
5. IF a Triage_Item is resolved by a second reviewer between the first reviewer's page load and their button click, THEN THE Triage_Inbox SHALL display an error notification indicating that the item has already been resolved, and the notification SHALL remain visible until the reviewer explicitly dismisses it or 5 seconds have elapsed, whichever comes first.

---

### Requirement 6: Role-Gated Access Control

**User Story:** As a compliance platform, I need resolution actions to be restricted to authorised roles at both the UI and server layers, so that Developers cannot approve or reject compliance flags on their own submissions.

#### Acceptance Criteria

1. THE resolveTriageItem Server Action SHALL re-derive the caller's `user_id`, `org_id`, and `role` from the trusted Supabase server-side session on every invocation, independent of any client-supplied parameters.
2. IF a caller whose `role` is `'developer'` or `'viewer'` invokes `resolveTriageItem`, THEN THE Server Action SHALL return a `Forbidden` error and SHALL NOT execute any write.
3. IF the Supabase server-side session cannot be resolved (unauthenticated invocation), THEN THE resolveTriageItem Server Action SHALL return an `Unauthorized` error and SHALL NOT execute any write.
4. WHEN a Developer views a Triage_Item linked to their own evidence log, THE Triage_Inbox SHALL render the Approve and Reject buttons in a visibly disabled state with a tooltip or label indicating the item is linked to the viewer's own submission.
5. THE Triage_Inbox UI SHALL NOT rely solely on button visibility or disabling as a security boundary; server-side role enforcement as specified in criteria 1–3 is the authoritative gate.
6. WHILE a user has no `role` assignment in `user_roles` for their `org_id`, THE Triage_Inbox SHALL deny access and display a message that explicitly states no role is assigned and instructs the user to contact their administrator.

---

### Requirement 7: 21 CFR Part 11 Audit Trail

**User Story:** As a compliance officer, I need every Resolution action to be recorded in the immutable audit log with full before/after state and operator identity, so that the organisation satisfies FDA 21 CFR Part 11.10(e) electronic record audit trail requirements.

#### Acceptance Criteria

1. WHEN a Resolution (Approve_Action or Reject_Action) succeeds, THE resolveTriageItem Server Action SHALL atomically insert one row into `public.audit_logs` with `action_type = 'TRIAGE_RESOLVE'` and `entity_type = 'EVIDENCE_LOG'` as part of the same logical operation; if the audit insert fails, the resolution write SHALL be rolled back.
2. THE Audit_Log entry SHALL record `entity_id` as the `evidence_log_id` of the resolved Triage_Item.
3. THE Audit_Log entry SHALL record `user_id` as the authenticated reviewer's Supabase Auth `user_id` per 21 CFR Part 11.10(d) operator identification.
4. THE Audit_Log entry `changes.before` SHALL contain `{ "triage_id": "<uuid>", "status": "pending", "original_req_id": "<value>" }` where `original_req_id` is the value of `req_id` on the associated `evidence_logs` row at the time the Server Action processes the request.
5. THE Audit_Log entry `changes.after` SHALL contain the `resolution` value (`approved` or `rejected`), `resolved_by` set to the reviewer's `user_id`, and `req_id_updated_to` set to the `suggested_req_id` for Approve_Actions or explicitly `null` for Reject_Actions.
6. THE Audit_Log entry `timestamp` SHALL be set exclusively by the PostgreSQL server clock via `DEFAULT NOW()` and SHALL NOT be supplied by the client.
7. IF the `audit_logs` insert fails, THEN THE resolveTriageItem Server Action SHALL return an error to the caller, SHALL NOT commit the resolution write, and SHALL emit a `CRITICAL`-level log entry to the server console containing the triage item ID and the failure reason.

---

### Requirement 8: Pending Count Badge

**User Story:** As a QA Manager, I want a live badge on the Triage Inbox navigation link showing the count of pending items, so that I can see at a glance whether new AI flags require my attention without navigating to the inbox.

#### Acceptance Criteria

1. THE Dashboard navigation SHALL display a Triage_Badge on the Triage_Inbox link that shows the Pending_Count (the integer count of `ai_triage_queue` rows with `status = 'pending'` for the authenticated user's `org_id`) for the authenticated user's organisation.
2. IF the Pending_Count is zero, THEN THE Triage_Badge SHALL NOT be rendered in the DOM (display:none or conditional render), eliminating any visual noise for an empty queue.
3. WHEN the Pending_Count exceeds 99, THE Triage_Badge SHALL display the string `99+` rather than the raw numeric value.
4. THE Triage_Badge SHALL be rendered only for users whose `role` is `'admin'` or `'qa_manager'`; users with `'developer'` or `'viewer'` roles SHALL NOT have the Triage_Badge rendered in their DOM.
5. THE Triage_Badge count SHALL be fetched once during server-side rendering of the dashboard layout for the authenticated session; no client-side polling or WebSocket subscription is required on initial page load.
6. WHEN a Resolution is completed, THE Triage_Badge count SHALL reflect the updated Pending_Count after the next page navigation or after `revalidatePath` is called by the Server Action; the badge SHALL decrement by the number of items resolved in that operation.
7. IF the Pending_Count fetch fails during dashboard layout rendering, THEN THE Triage_Badge SHALL NOT render (treating the count as zero) rather than surfacing an error in the navigation chrome.

---

### Requirement 9: Filtering and Sorting

**User Story:** As a QA Manager handling a large volume of flagged items, I want to filter and sort the Triage_Inbox by status and date, so that I can efficiently prioritise my review work.

#### Acceptance Criteria

1. THE Triage_Inbox SHALL provide a status filter control with options: `All` (selected by default on initial load), `Pending`, `Approved`, `Rejected`.
2. WHEN a status filter is applied, THE Triage_Inbox SHALL display only Triage_Items matching the selected `status` value without a full page reload.
3. THE Triage_Inbox SHALL provide a sort control with options: `Oldest First` (default, ascending `created_at`) and `Newest First`.
4. WHEN the sort order is changed to `Newest First`, THE Triage_Inbox SHALL re-order the displayed Triage_Items by `created_at` descending; WHEN changed to `Oldest First`, the order SHALL be `created_at` ascending.
5. IF a Triage_Item has a `status` other than `'pending'`, THEN THE Triage_Inbox SHALL NOT render the Approve or Reject action buttons for that item regardless of which filter is active.
6. WHEN a Triage_Item's Approve or Reject action completes successfully and the `Pending` filter is active, THE resolved item SHALL be removed from the displayed list without a full page reload.

---

### Requirement 10: Skeleton Loading State

**User Story:** As a QA Manager, I want a skeleton loading state to appear while the inbox is fetching, so that the UI communicates activity without a disorienting content flash.

#### Acceptance Criteria

1. WHILE the Triage_Inbox data is loading via `React.Suspense`, THE Triage_Inbox SHALL display `animate-pulse` skeleton placeholder cards, each containing one header-line placeholder and two body-line placeholders, that match the expected dimensions of a loaded Triage_Item card.
2. WHILE the Triage_Inbox data is loading, THE skeleton placeholder cards SHALL use `bg-slate-800` background, `border border-slate-700` border, and a maximum border radius of `4px` (`rounded-sm`).
3. WHILE the Triage_Inbox data is loading, THE Triage_Inbox SHALL display between 3 and 5 skeleton placeholder cards (inclusive).
4. WHEN the Triage_Inbox data fetch completes successfully, THE skeleton cards SHALL be replaced by real Triage_Item cards using an `<AnimatePresence>` exit animation within the same React render tree, without a full page navigation.
5. IF the Triage_Inbox data fetch has not resolved after 10 seconds, THEN THE skeleton state SHALL be replaced by the error state (inline error banner per Requirement 1, criterion 4) within the same React render tree.

---

### Requirement 11: Design System Compliance

**User Story:** As the QAVRO platform, I need the Triage Inbox to adhere to the QAVRO dark-canvas design system, so that the interface projects the authority and precision expected of an FDA-grade compliance tool.

#### Acceptance Criteria

1. THE Triage_Inbox page SHALL use `#030712` (`canvas-dark`, `bg-gray-950`) as the main background colour with `#111827` (`surface-1`, `bg-gray-900`) for card and table surfaces.
2. THE Triage_Item cards SHALL use `1px solid` hairline borders (`border border-slate-700`) and SHALL NOT apply any `box-shadow`, `shadow-*`, or `drop-shadow` utility to card elements.
3. THE Triage_Item cards SHALL use a maximum border radius of `4px` (`rounded-sm` or `rounded`); `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`, or larger SHALL NOT be used.
4. ALL `evidence_log_id`, `req_id`, and `created_at` values rendered in the Triage_Inbox SHALL use the `font-mono` Tailwind class as required for FDA regulatory data by the QAVRO typography mandate.
5. ALL status badges (e.g., `PENDING`, `APPROVED`, `REJECTED`) SHALL use `rounded-none`, a `1px solid` border in the semantic status colour, and a transparent background. `PENDING` SHALL use `border-yellow-500 text-yellow-500`; `APPROVED` SHALL use `border-green-500 text-green-500`; `REJECTED` SHALL use `border-red-500 text-red-500`.
6. THE Triage_Inbox SHALL NOT use Tailwind arbitrary values (e.g., `w-[32px]`, `text-[15px]`); all spacing, sizing, and typography SHALL use standard Tailwind scale tokens.
7. WHEN a pointer enters a Triage_Item card, THE card background SHALL transition to `#1f2937` (`surface-2`, `hover:bg-slate-800`) and no `box-shadow` SHALL be added.
8. ALL Framer Motion card entrance animations SHALL use `transition={{ type: "spring", stiffness: 300, damping: 30 }}`; exit animations SHALL use `transition={{ type: "spring", stiffness: 200, damping: 25 }}` with `exit={{ opacity: 0, scale: 0.95 }}`; all conditionally removed cards SHALL be wrapped in `<AnimatePresence>`.
9. ALL button click states SHALL use `active:scale-95` (the standard Tailwind scale token) for tactile feedback in compliance with the micro-interactions mandate.

---

### Requirement 12: Accessibility

**User Story:** As a QA Manager using keyboard navigation or assistive technology, I need the Triage Inbox to meet WCAG 2.1 AA standards, so that I can review and resolve triage items without relying on a mouse.

#### Acceptance Criteria

1. THE Approve and Reject action buttons SHALL each have an `aria-label` attribute in the format `"Approve AI fix: apply [suggested_req_id]"` and `"Reject: keep original [original_req_id]"` respectively, with the actual `req_id` values interpolated at render time.
2. THE toast notification container SHALL have `aria-live="polite"` and `aria-atomic="true"` so that screen readers announce Resolution outcomes as complete messages without interrupting the user.
3. ALL interactive elements in the Triage_Inbox SHALL have a keyboard focus state that meets the WCAG 2.1 AA minimum 3:1 contrast ratio between the focus indicator and its adjacent colours; the `focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none` pattern SHALL be applied to achieve this.
4. WHEN the Triage_Inbox is in an empty state, THE empty-state indicator SHALL be a `<p>` element or heading element with a non-empty text node that is present in the browser accessibility tree (not hidden via `aria-hidden` or `display:none`).
5. THE Triage_Inbox page SHALL include a visible `<h1>` element as the primary landmark heading so that screen reader users can navigate to it directly.
6. WHILE a Resolution action button is in a loading state (spinner displayed), THE button SHALL retain its original `aria-label` value.
7. WHILE a Resolution action button is in a loading state (spinner displayed), THE button SHALL have `aria-disabled="true"` set on the element to communicate the non-interactive state to assistive technologies.
8. WHEN a Resolution action completes (successfully or with error) and the resolved Triage_Item is removed from the list, THE Triage_Inbox SHALL move keyboard focus to the next Triage_Item row in the list, or to the empty-state indicator element if no further items remain.
