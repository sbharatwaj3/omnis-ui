# Requirements Document

## Introduction

The Token Usage Dashboard is a UI feature within the QAVRO/Omnis RegOps platform that gives organization admins and QA managers full visibility into AWS Bedrock AI token consumption across their tenant. The platform already captures per-log token data (`evidence_logs.ai_tokens_used`, `evidence_logs.developer_email`) and org-level quota state (`organizations.token_units_used`, `organizations.token_units_limit`). This feature surfaces that data through a purpose-built dashboard route (`/dashboard/usage`) that replaces the existing single-table prototype with a fully-featured monitoring experience.

The dashboard must satisfy SaMD compliance constraints (21 CFR Part 11/820, IEC 62304), enforce strict multi-tenant data isolation via the existing RBAC and RLS architecture, and conform to the QAVRO design system (dark canvas `#030712`, max 4px border radius, JetBrains Mono for all numeric/ID data, no drop shadows).

---

## Glossary

- **Dashboard**: The Token Usage Dashboard UI at `/dashboard/usage`.
- **Token_Unit**: One discrete AWS Bedrock AI inference call, as recorded in `evidence_logs.ai_tokens_used`.
- **Org_Quota**: The org-level token ceiling stored in `organizations.token_units_limit`.
- **Org_Usage**: The running count of consumed token units stored in `organizations.token_units_used`.
- **Usage_Gauge**: The UI component that visualises `Org_Usage` against `Org_Quota` as a percentage.
- **Developer_Leaderboard**: The per-developer breakdown table derived from `evidence_logs` grouped by `developer_email`.
- **Time_Filter**: A date-range selector that scopes the Developer_Leaderboard to a specific time window.
- **Admin**: A platform user holding `role = 'admin'` in the `user_roles` table.
- **QA_Manager**: A platform user holding `role = 'qa_manager'` in the `user_roles` table.
- **Developer**: A platform user holding `role = 'developer'` in the `user_roles` table.
- **Viewer**: A platform user holding `role = 'viewer'` in the `user_roles` table.
- **JWT**: The Supabase-issued JSON Web Token representing the authenticated user session.
- **Server_Action**: A Next.js App Router Server Action; treated as a public HTTP endpoint per the System Constitution.
- **RLS**: Row Level Security enforced by Supabase on all tenant-scoped tables.
- **Org_ID**: The UUID identifying the authenticated user's organization, resolved exclusively from the verified JWT session.
- **Bedrock**: AWS Bedrock, the AI inference service used by the `omnis-api` pipeline.

---

## Requirements

### Requirement 1: Role-Gated Access Control

**User Story:** As an Admin, I want only Admins and QA Managers to access the Token Usage Dashboard, so that token consumption data cannot be viewed by Developers or Viewers who lack the need to monitor organizational AI spend.

#### Acceptance Criteria

1. WHEN an authenticated user navigates to `/dashboard/usage`, THE Dashboard SHALL call `createClient().auth.getUser()` server-side and block all page rendering until a valid user identity is confirmed; IF `getUser()` returns an error or a null user, THEN THE Dashboard SHALL redirect the user to the sign-in page without rendering any page content.
2. WHEN the authenticated user's `role` in `user_roles` is `'admin'` or `'qa_manager'`, THE Dashboard SHALL render the full token usage interface.
3. WHEN the authenticated user's `role` in `user_roles` is `'developer'` or `'viewer'`, THE Dashboard SHALL render an access-denied state consisting of a message indicating the user lacks permission and no token usage data — including aggregate counts, per-model breakdowns, cost estimates, or user-level consumption records — shall be included in the server response payload.
4. WHEN the authenticated user has no `user_roles` record (pending or no-org state), THE Dashboard SHALL redirect the user to the sign-in page.
5. THE Dashboard SHALL derive `Org_ID` exclusively from the verified JWT session; it SHALL NOT accept `org_id` as a URL parameter, query string, or request body argument; IF the JWT session is absent or expired, THEN THE Dashboard SHALL redirect the user to the sign-in page without processing the request further.
6. WHEN any Server_Action on the Dashboard is invoked, THE Server_Action SHALL re-derive user identity and `Org_ID` from `createClient().auth.getUser()` independently of the page-level session check; IF the re-derived identity is absent, invalid, or does not hold the `'admin'` or `'qa_manager'` role, THEN THE Server_Action SHALL return an error response indicating authorization failure and SHALL NOT return or mutate any token usage data.

---

### Requirement 2: Org-Level Token Quota Gauge

**User Story:** As an Admin, I want to see my organization's current token usage against its plan limit at a glance, so that I can take action before the quota is exhausted and Bedrock calls are blocked.

#### Acceptance Criteria

1. WHEN the Dashboard loads for an authenticated user with the `'admin'` role, THE Usage_Gauge SHALL display the current `Org_Usage` value in tokens, the `Org_Quota` value in tokens, and the consumption percentage calculated as `floor((Org_Usage / Org_Quota) * 100)`.
2. THE Usage_Gauge SHALL render `Org_Usage` and `Org_Quota` numeric values in `JetBrains Mono` font.
3. IF `Org_Usage / Org_Quota` is less than 0.80, THEN THE Usage_Gauge SHALL render the progress indicator in `#05b169` (semantic-compliant).
4. WHEN `Org_Usage / Org_Quota` is greater than or equal to 0.80 and less than 1.00, THE Usage_Gauge SHALL render the progress indicator in `#f4b000` (semantic-pending).
5. IF `Org_Usage / Org_Quota` is greater than or equal to 1.00, THEN THE Usage_Gauge SHALL render the progress indicator in `#cf202f` (semantic-violation) and display a quota-exhausted warning label.
6. THE Usage_Gauge SHALL use a flat horizontal progress bar with no border radius exceeding 4px and no drop shadow.
7. IF the `organizations` record for the authenticated user's `Org_ID` cannot be fetched, THEN THE Dashboard SHALL display an error message indicating the data could not be loaded and SHALL NOT render a partially populated gauge.
8. WHILE the Usage_Gauge data is loading, THE Dashboard SHALL display an `animate-pulse` skeleton placeholder matching the dimensions of the gauge component; it SHALL NOT display a generic spinner overlay.
9. IF `Org_Quota` equals 0, THEN THE Usage_Gauge SHALL display an error message indicating the quota is not configured and SHALL NOT attempt to calculate a percentage.

---

### Requirement 3: Per-Developer Token Leaderboard

**User Story:** As an Admin or QA Manager, I want to see a ranked breakdown of token consumption by developer email, so that I can identify which team members are driving the highest AI usage and make informed decisions about plan upgrades.

#### Acceptance Criteria

1. WHEN the Dashboard loads, THE Developer_Leaderboard SHALL display one row per distinct `developer_email` value found in `evidence_logs` for the authenticated user's `Org_ID`.
2. THE Developer_Leaderboard SHALL display the following columns for each row: rank (ordinal position), developer email, total logs uploaded, and total tokens consumed.
3. THE Developer_Leaderboard SHALL sort rows in descending order by total tokens consumed; rows with identical total tokens consumed SHALL be sorted secondarily by `developer_email` ascending, with the highest-consuming developer at rank 1.
4. THE Developer_Leaderboard SHALL render all numeric values (rank, log count, token count) in `JetBrains Mono` font.
5. IF a `developer_email` value in `evidence_logs` is `NULL`, empty string, whitespace-only, or `'unknown_developer'`, THEN THE Developer_Leaderboard SHALL group those rows under a single `Unknown Developer` display label.
6. THE Developer_Leaderboard SHALL calculate `total_tokens_consumed` as the `SUM(ai_tokens_used)` across all matching rows; rows with `ai_tokens_used = NULL` SHALL contribute 0 to the sum.
7. THE Developer_Leaderboard SHALL render table header labels in uppercase, 12px Inter, weight 600, with 0.5px letter-spacing, matching the `table-header` typography token.
8. THE Developer_Leaderboard SHALL render table rows with 12px vertical padding to maximise information density on a 1080p display.
9. WHILE the authenticated user session is active, THE Developer_Leaderboard SHALL only display rows derived from `evidence_logs` where `org_id` equals the `Org_ID` re-derived from the server-side JWT on every fetch.
10. IF the authenticated user's `Org_ID` has zero rows in `evidence_logs`, THEN THE Developer_Leaderboard SHALL display an empty state message indicating no usage records exist and SHALL NOT render any table rows.
11. WHEN the Dashboard renders the Developer_Leaderboard, THE component SHALL be visible only to users with `role = 'admin'` or `role = 'qa_manager'`; users with any other role SHALL NOT receive leaderboard data in the server response.

---

### Requirement 4: Time-Range Filtering

**User Story:** As an Admin or QA Manager, I want to filter the developer leaderboard by date range, so that I can scope token usage analysis to a specific billing cycle or incident window without losing the ability to see all-time totals.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a Time_Filter control offering the following preset windows: Last 7 days, Last 30 days, Last 90 days, and All Time.
2. WHEN a user selects a Time_Filter preset, THE Developer_Leaderboard SHALL update to display only rows derived from `evidence_logs` where `execution_timestamp` is greater than or equal to the UTC start of the selected window and less than the current UTC instant, without a full page reload.
3. WHEN the Time_Filter is set to "All Time", THE Developer_Leaderboard SHALL aggregate all `evidence_logs` rows for the `Org_ID` regardless of `execution_timestamp`.
4. WHEN the Time_Filter is changed, THE Developer_Leaderboard SHALL display an `animate-pulse` skeleton loader matching the dimensions of the leaderboard table rows while the new data loads; IF the skeleton loader is still displayed after 10 seconds, THEN THE Dashboard SHALL surface an error state indicating the request timed out.
5. WHEN the Dashboard page initially loads, THE Time_Filter SHALL display "Last 30 days" as the active selection and SHALL fetch leaderboard data scoped to the last 30 days.
6. IF the filtered time window returns zero rows, THEN THE Developer_Leaderboard SHALL display an empty state message that references the active filter label (e.g., "No usage recorded in the last 30 days") and SHALL NOT render any table rows.
7. IF a Server_Action invoked by a Time_Filter change returns an error, THEN THE Developer_Leaderboard SHALL display an error state with a descriptive message and SHALL NOT render partial or stale data.

---

### Requirement 5: Dashboard Navigation Entry Point

**User Story:** As an Admin, I want a clearly labelled navigation entry for the Token Usage Dashboard on the main dashboard page, so that I can reach token monitoring without needing to know the direct URL.

#### Acceptance Criteria

1. WHEN the authenticated user's `role` is `'admin'`, THE Main_Dashboard SHALL render a navigation card linking to `/dashboard/usage`.
2. WHEN the authenticated user's `role` is `'qa_manager'`, `'developer'`, `'viewer'`, or any role other than `'admin'`, THE Main_Dashboard SHALL NOT render the `/dashboard/usage` navigation card.
3. WHILE the server-side role resolution is pending, THE Main_Dashboard SHALL render an `animate-pulse` skeleton placeholder in place of the navigation card area, and SHALL NOT render the navigation card or any partial version of it.
4. IF the server-side role resolution fails or returns no session, THEN THE Main_Dashboard SHALL NOT render the `/dashboard/usage` navigation card and SHALL render the remaining dashboard layout without the card slot.
5. WHEN the authenticated user's `role` is `'admin'`, THE navigation card SHALL display a visible text label of "Token Usage" identifying its destination.

---

### Requirement 6: Data Isolation and Multi-Tenant Security

**User Story:** As a platform operator, I want all token usage queries to be strictly scoped to the authenticated user's organization, so that no tenant can observe another tenant's token consumption data, satisfying 21 CFR Part 11 access control requirements.

#### Acceptance Criteria

1. THE Dashboard SHALL scope every `evidence_logs` query by `org_id` equal to the value resolved from the authenticated user's JWT; any `org_id` value supplied by the client SHALL be ignored and the JWT-derived value used exclusively.
2. THE Dashboard SHALL scope every `organizations` query by `org_id` equal to the value resolved from the authenticated user's JWT; any `org_id` value supplied by the client SHALL be ignored and the JWT-derived value used exclusively.
3. WHEN a user's JWT resolves to `Org_ID = X`, THE Dashboard SHALL return zero rows if the user attempts to access token data belonging to `Org_ID ≠ X` through any of the following vectors: URL path segment substitution, query parameter injection, or request body field injection.
4. THE Server_Action that fetches usage data SHALL include `import 'server-only'` at the top of the module to prevent Supabase credentials from bundling into the client-side JavaScript.
5. THE Server_Action SHALL validate its inputs with a Zod schema, stripping any unexpected fields before executing database queries.
6. IF the JWT is absent, expired, or invalid when a Server_Action is invoked, THEN THE Server_Action SHALL return an error response indicating that the request is unauthorized and SHALL NOT execute any database query.

---

### Requirement 7: UI Design System Conformance

**User Story:** As a QA Manager reviewing the dashboard, I want the Token Usage Dashboard to visually match the rest of the QAVRO platform, so that the interface projects the institutional-grade authority required for an FDA compliance tool.

#### Acceptance Criteria

1. THE Dashboard SHALL use `#030712` as the page canvas background color.
2. THE Dashboard SHALL use `#111827` (surface-1) for card and table container backgrounds, with `1px solid #374151` (hairline) borders.
3. THE Dashboard SHALL NOT use any border radius greater than 4px on any element.
4. THE Dashboard SHALL NOT apply any `box-shadow` drop shadow to any element.
5. THE Dashboard SHALL render all numeric values, token counts, timestamps, developer email addresses, evidence log IDs, signature hashes, and FDA clause codes in `JetBrains Mono` font at 13px, weight 500.
6. THE Dashboard SHALL render page titles and section headings in `Inter` font at the `display-md` scale (24px, weight 500).
7. THE Dashboard SHALL use `#05b169` exclusively for compliant/healthy states, `#cf202f` exclusively for violation/error states, and `#f4b000` exclusively for warning/pending states; these colors SHALL NOT be applied to navigational links, decorative graphics, or primary action buttons.
8. THE Dashboard SHALL produce zero critical violations on an automated axe-core accessibility scan; all text elements SHALL meet a minimum contrast ratio of 4.5:1 against their background, and all interactive elements SHALL have explicit ARIA labels or roles where native semantics are insufficient.
9. WHEN data is loading, THE Dashboard SHALL display `animate-pulse` skeleton UI components whose dimensions match the target data elements within a 4px tolerance; it SHALL NOT display a generic spinner overlay.
10. WHEN an interactive element on the Dashboard receives keyboard focus via keyboard navigation, THE Dashboard SHALL display a focus ring using `focus-visible:ring-2 focus-visible:ring-[#0052ff]`; the focus ring SHALL NOT render when the element is focused via mouse click.
11. THE Developer_Leaderboard table header row SHALL render all column labels in uppercase Inter, 12px, weight 600, with 0.5px letter-spacing.
12. WHEN a compliance status badge is rendered on the Dashboard, THE badge SHALL use a square shape (`border-radius: 0px`), a `1px solid` border in the matching semantic color, and a transparent background fill; it SHALL NOT use a solid background fill.
13. WHEN a user hovers over an interactive card or table row, THE element's background SHALL transition from `#111827` (surface-1) to `#1f2937` (surface-2) with no drop shadow and no border-radius change.

---

### Requirement 8: Performance and Data Freshness

**User Story:** As an Admin checking token usage before a Bedrock call is blocked, I want the dashboard to load current data within a predictable time bound, so that my operational decisions are based on an accurate quota state.

#### Acceptance Criteria

1. THE Dashboard route SHALL set `export const dynamic = "force-dynamic"` to disable Next.js static and ISR caching, ensuring every page request reflects the live Supabase state.
2. IF the `evidence_logs` table contains more than 1,000 rows for the authenticated `Org_ID`, THEN THE Server_Action SHALL fetch rows in batches of 1,000 using range-based pagination, continuing until a page returns fewer than 1,000 rows, at which point the loop SHALL terminate.
3. THE Developer_Leaderboard Server_Action SHALL query only the `developer_email` and `ai_tokens_used` columns from `evidence_logs`; it SHALL NOT select `raw_logs`, `sanitized_payload`, `signature_hash`, `previous_log_hash`, or `sanitized_payload` columns.
4. THE Usage_Gauge Server_Action SHALL query only the `token_units_used` and `token_units_limit` columns from `organizations`.
5. WHEN constructing time-range queries against `evidence_logs`, THE Server_Action SHALL place the `org_id` equality predicate first and the `execution_timestamp` range predicate second in the query filter chain.
6. IF any Supabase query within the pagination loop returns an error, THEN THE Server_Action SHALL halt pagination immediately, discard any partially accumulated data, and return an error response to the page component.
7. THE Server_Action SHALL complete all Supabase queries and return a response to the page component within 5 seconds of invocation; IF the 5-second threshold is exceeded, THEN THE Dashboard SHALL surface an error state to the Admin.

---

### Requirement 9: IEC 62304 Fail-Safe Error Handling

**User Story:** As an Admin, I want the dashboard to fail loudly and visibly if data cannot be loaded, so that I never mistake a silent failure for a zero-usage state, satisfying IEC 62304 no-silent-failures constraints.

#### Acceptance Criteria

1. IF a Supabase query inside any Server_Action throws an exception or returns a Supabase error object, THEN THE Server_Action SHALL log the error message server-side and return a structured error response containing a boolean `error: true` flag and a non-empty `message` string to the page component.
2. WHEN a Server_Action returns an error response, THE Dashboard SHALL render a dedicated error UI region containing a non-empty message identifying the failure; it SHALL NOT render an empty table, a zero-value gauge, or any representation that could be mistaken for a valid empty or zero state.
3. THE Server_Action error response SHALL NOT include raw Supabase error messages or stack traces in the client-facing payload; internal details SHALL be logged server-side only.
4. IF the `organizations` query returns zero rows or a null result for the authenticated `Org_ID`, THEN THE Usage_Gauge SHALL display a non-numeric error label that SHALL NOT display `0` or `0/0`, to prevent masking a data integrity violation.
5. WHEN the Dashboard is in an error state, THE page header and navigation elements SHALL remain rendered and interactive; the error SHALL be contained to the affected component and SHALL NOT cause the entire page to become unresponsive.
6. IF any Server_Action receives a success response from Supabase but the result set contains zero rows for the `organizations` table query, THEN THE Server_Action SHALL treat this as a data integrity error, log it server-side, and return a structured error response rather than propagating the empty result as a valid zero-usage state.
