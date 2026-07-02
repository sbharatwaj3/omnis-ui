# Design Document: Token Usage Dashboard

## Overview

The Token Usage Dashboard is a new sub-route (`/dashboard/usage`) within the QAVRO/Omnis RegOps platform that replaces the single-table prototype with a fully-featured AI token monitoring experience. It surfaces two data domains: (1) the org-level quota gauge from `organizations.token_units_used` / `organizations.token_units_limit`, and (2) a per-developer leaderboard aggregated from `evidence_logs.developer_email` + `evidence_logs.ai_tokens_used`.

Access is gated to `admin` and `qa_manager` roles only. Every data-fetching path re-derives `Org_ID` from the verified Supabase JWT session and never trusts a client-supplied value. The feature satisfies 21 CFR Part 11 / IEC 62304 fail-safe constraints: errors surface loudly with structured error responses, never as silent zero-states.

The existing `app/dashboard/usage/page.tsx` and `actions.ts` serve as the prototype foundation. This design extends them to add: the org-level quota gauge, time-range filtering, skeleton loading states, QA-manager access parity, Zod input validation, and full QAVRO design system conformance.

**Research Summary:**
- The `organizations` table gained `token_units_used` (INTEGER DEFAULT 0) and `token_units_limit` (INTEGER DEFAULT 500) in migration `20260618000000`. Both columns are confirmed present.
- The `evidence_logs` table gained `developer_email` (TEXT NULL) and `ai_tokens_used` (INTEGER DEFAULT 0) in migration `20260626000000`.
- Performance indexes `idx_evidence_logs_org_id` and `idx_evidence_logs_org_id_timestamp` exist on `evidence_logs`; queries placing `org_id` first will use the composite index.
- The existing `adminClient` proxy pattern (fresh client on every property access) is the correct approach for all data queries; `createClient()` is used exclusively for JWT verification.
- The project uses `fast-check` v4 + Vitest v4 for property-based testing — confirmed in `package.json`.
- The `user_roles.role` CHECK constraint includes `'admin'` (migration `20260621000000`).

---

## Architecture

The feature is entirely within `omnis-ui` (Next.js App Router). It does not add any routes to `omnis-api`. All data access flows from the browser → Next.js Server Component / Server Action → Supabase (via `adminClient` with explicit `org_id` scope guard).

```
Browser
  │
  ▼
/dashboard/usage  (React Server Component — app/dashboard/usage/page.tsx)
  │   force-dynamic; re-derives identity via createClient().auth.getUser()
  │   server-side role check: admin | qa_manager → proceed, else → AccessDenied
  │
  ├── <UsageGaugeSection>        (server-renders gauge data)
  │     └── getOrgQuota()        (server action — app/dashboard/usage/actions.ts)
  │
  ├── <LeaderboardSection>       (server-renders initial 30-day data)
  │     └── getDeveloperUsage()  (server action — app/dashboard/usage/actions.ts)
  │
  └── <UsageClient>              (client component — handles time filter state)
        └── getDeveloperUsage()  (called from client on filter change via useTransition)
```

**Key architectural decisions:**

1. **Gauge is server-rendered only** — quota data does not change on filter interaction. It is fetched once at page load in the Server Component and passed as props to the client layer. No client-side refetch needed.
2. **Leaderboard is client-interactive** — time filter changes call `getDeveloperUsage()` as a Server Action from the client component wrapped in `useTransition`, giving a `isPending` flag for skeleton display without a full page reload.
3. **No ISR/static caching** — `export const dynamic = "force-dynamic"` ensures every page request hits Supabase live.
4. **adminClient for all data queries** — consistent with the existing codebase pattern (see `dashboard/page.tsx`). The RBAC-gated RLS chain on `evidence_logs` and `organizations` can fail silently for certain account states; `adminClient` bypasses RLS while the explicit `org_id` scope guard enforces isolation.
5. **createClient for JWT verification only** — `createClient().auth.getUser()` is the single trust anchor. Identity is never taken from URL params, query strings, or request body fields.

---

## Components and Interfaces

### Component Tree

```
app/dashboard/usage/page.tsx                  [RSC — async, force-dynamic]
├── DashboardHeader                            [shared server component]
├── Suspense fallback=<UsagePageSkeleton />
└── UsagePageContent (async RSC)
    ├── Role gate → AccessDenied | null
    ├── UsageGaugeCard                         [RSC, pure display]
    │   ├── QuotaBar (div with inline width %)
    │   └── QuotaStatusBadge
    └── UsageClient                            ["use client"]
        ├── TimeFilterBar
        │   └── TimeFilterButton × 4
        ├── AnimatePresence (Framer Motion)
        │   ├── LeaderboardSkeleton (isPending)
        │   └── LeaderboardTable | EmptyState | ErrorState
        └── LeaderboardFooterSummary
```

### File Layout

```
omnis-ui/
└── app/
    └── dashboard/
        └── usage/
            ├── page.tsx          ← RSC, auth gate, gauge fetch, initial leaderboard fetch
            ├── actions.ts        ← getOrgQuota(), getDeveloperUsage() server actions
            └── __tests__/
                └── actions.property.test.ts  ← property-based tests
└── components/
    └── usage/
        ├── usage-gauge-card.tsx   ← pure display; receives QuotaData as props
        ├── usage-client.tsx       ← "use client"; owns filter state + leaderboard render
        ├── leaderboard-table.tsx  ← pure table render; receives DeveloperUsageRow[]
        └── usage-skeleton.tsx     ← animate-pulse skeletons for gauge + leaderboard
```

### Server Action Signatures

```typescript
// app/dashboard/usage/actions.ts
"use server";
import "server-only";

// ── Zod input schema (strips unknown fields per Security Standard §III.1) ──
export const developerUsageInputSchema = z.object({
  timeFilter: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
}).strip();

export type TimeFilter = "7d" | "30d" | "90d" | "all";

// ── Return types ──
export interface QuotaData {
  tokenUnitsUsed: number;
  tokenUnitsLimit: number;
  usagePct: number;          // floor((used/limit)*100), always 0 if limit=0
  status: "healthy" | "warning" | "exhausted";
}

export interface DeveloperUsageRow {
  developer_email: string;   // normalised; "Unknown Developer" for null/empty/'unknown_developer'
  total_logs_uploaded: number;
  total_tokens_consumed: number;
}

export interface ActionResult<T> {
  data?: T;
  error?: { message: string }; // never includes raw Supabase error text
}

// ── Action 1: Org quota gauge ─────────────────────────────────────────────
export async function getOrgQuota(): Promise<ActionResult<QuotaData>>

// ── Action 2: Per-developer leaderboard ──────────────────────────────────
export async function getDeveloperUsage(
  rawInput: unknown   // Zod-parsed inside the action; client never trusted
): Promise<ActionResult<DeveloperUsageRow[]>>
```

### Component Props

```typescript
// UsageGaugeCard — pure RSC, receives pre-fetched data
interface UsageGaugeCardProps {
  data: QuotaData;
}

// UsageClient — owns filter state; initial data is pre-fetched server-side
interface UsageClientProps {
  initialRows: DeveloperUsageRow[];
  initialFilter: TimeFilter;  // always "30d" on page load
}

// LeaderboardTable — pure render, no data fetching
interface LeaderboardTableProps {
  rows: DeveloperUsageRow[];
}

// TimeFilterBar — controlled by UsageClient
interface TimeFilterBarProps {
  activeFilter: TimeFilter;
  isPending: boolean;
  onSelect: (filter: TimeFilter) => void;
}
```

---

## Data Models

### Supabase Queries

**getOrgQuota — organizations table:**
```sql
SELECT token_units_used, token_units_limit
FROM   organizations
WHERE  org_id = <jwt_derived_org_id>  -- ONLY value trusted
LIMIT  1;
```
Columns: `token_units_used` (INTEGER DEFAULT 0), `token_units_limit` (INTEGER DEFAULT 500).
Error if: zero rows returned (data integrity violation, per Req 9.6), or Supabase error.

**getDeveloperUsage — evidence_logs table (paginated, batches of 1000):**
```sql
-- Per batch (range from → from+999):
SELECT developer_email, ai_tokens_used
FROM   evidence_logs
WHERE  org_id = <jwt_derived_org_id>          -- predicate 1 (uses composite index)
  AND  execution_timestamp >= <utc_window_start>  -- predicate 2 (skipped for "all")
RANGE  from TO from+999;
```
Columns selected: `developer_email` (TEXT NULL), `ai_tokens_used` (INTEGER DEFAULT 0).
**Excluded columns:** `raw_logs`, `sanitized_payload`, `signature_hash`, `previous_log_hash`, `log_id`, `req_id`, `execution_status`, `event_source` — per Req 8.3.

**UTC window start calculation (TypeScript):**
```typescript
function getWindowStart(filter: TimeFilter): string | null {
  if (filter === "all") return null;
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString(); // "YYYY-MM-DDTHH:mm:ss.sssZ"
}
```

### In-Memory Aggregation

After fetching all pages, the action groups rows in TypeScript using a `Map<string, { logs: number; tokens: number }>`:

```typescript
const UNKNOWN_LABEL = "Unknown Developer";

function normaliseEmail(raw: string | null | undefined): string {
  if (!raw) return UNKNOWN_LABEL;
  const t = raw.trim();
  if (t === "" || t === "unknown_developer") return UNKNOWN_LABEL;
  return t;
}
```

Output is sorted: primary `total_tokens_consumed DESC`, secondary `developer_email ASC` (for stable ordering when tokens are equal).

### QuotaData Derivation

```typescript
function deriveQuotaData(used: number, limit: number): QuotaData | { error: true } {
  if (limit === 0) return { error: true };  // Req 2.9 — never divide by zero
  const ratio = used / limit;
  const usagePct = Math.floor(ratio * 100);
  const status = ratio >= 1.0 ? "exhausted"
               : ratio >= 0.8 ? "warning"
               : "healthy";
  return { tokenUnitsUsed: used, tokenUnitsLimit: limit, usagePct, status };
}
```

### Updated TypeScript Types (additions to existing)

The existing `DeveloperUsageRow` and `normaliseEmail` in `actions.ts` are retained and extended with `TimeFilter` support and the new `getOrgQuota` action.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Role Gate — Data Exposure Matches Role

*For any* user role value in `{'admin', 'qa_manager', 'developer', 'viewer'}`, invoking `getDeveloperUsage()` or `getOrgQuota()` with a session whose role is `'admin'` or `'qa_manager'` SHALL return `data` with no `error` field; invoking it with role `'developer'` or `'viewer'` SHALL return `error` with no `data` field.

**Validates: Requirements 1.2, 1.3, 1.6, 3.11**

### Property 2: Multi-Tenant Isolation — JWT Org_ID Is the Only Data Scope

*For any* two distinct org UUIDs `orgA` and `orgB`, a session authenticated for `orgA` that calls `getDeveloperUsage()` or `getOrgQuota()` SHALL never return rows or quota values that belong to `orgB`, regardless of any `org_id` value supplied by the client in URL parameters, query strings, or request body fields.

**Validates: Requirements 1.5, 6.1, 6.2, 6.3**

### Property 3: Gauge Color Classification — Status Is Determined Exclusively by the Usage Ratio

*For any* non-zero `tokenUnitsLimit` and any `tokenUnitsUsed >= 0`, the `deriveQuotaData` function SHALL assign `status = "healthy"` when `used / limit < 0.80`, `status = "warning"` when `0.80 <= used / limit < 1.00`, and `status = "exhausted"` when `used / limit >= 1.00`. `usagePct` SHALL always equal `Math.floor((used / limit) * 100)`.

**Validates: Requirements 2.1, 2.3, 2.4, 2.5**

### Property 4: Leaderboard Aggregation — Grouping and Sorting Invariants

*For any* array of raw log rows `{ developer_email: string | null, ai_tokens_used: number | null }[]`, the `buildLeaderboard` aggregation function SHALL produce an output array where: (a) the number of rows equals the count of distinct normalised email labels; (b) each row's `total_logs_uploaded` equals the count of input rows mapping to that label; (c) each row's `total_tokens_consumed` equals `SUM(ai_tokens_used ?? 0)` for rows mapping to that label; (d) rows are sorted primary `total_tokens_consumed DESC`, secondary `developer_email ASC`.

**Validates: Requirements 3.1, 3.3, 3.6**

### Property 5: Email Normalisation — Unknown Variants Always Collapse to One Label

*For any* `developer_email` value that is `null`, the empty string, a string composed entirely of whitespace characters, or the literal string `'unknown_developer'`, the `normaliseEmail` function SHALL return exactly `"Unknown Developer"`. *For any* non-null, non-empty, non-whitespace-only string that is not `'unknown_developer'`, `normaliseEmail` SHALL return the trimmed input unchanged.

**Validates: Requirements 3.5**

### Property 6: Time Filter Predicate — All Returned Rows Satisfy the Active Window

*For any* time filter in `{"7d", "30d", "90d"}` and any array of log rows with arbitrary `execution_timestamp` values, the filtered output produced by `applyTimeFilter` SHALL contain only rows where `execution_timestamp >= utcWindowStart(filter)`. When the filter is `"all"`, the output SHALL contain all input rows unmodified.

**Validates: Requirements 4.2, 4.3**

### Property 7: Pagination Completeness — All Rows Accumulated Without Duplication

*For any* total dataset of N rows (where N is any non-negative integer) split into pages of 1000, the paginated fetch loop SHALL produce an accumulated result containing exactly N rows with no duplicates and no omissions. If any page fetch returns a Supabase error, the loop SHALL halt immediately and return no accumulated data.

**Validates: Requirements 8.2, 8.6**

### Property 8: Zod Schema Strips Unknown Fields

*For any* input object with arbitrary extra keys beyond the schema's declared fields (`timeFilter`), parsing through `developerUsageInputSchema.safeParse()` SHALL produce a `success: true` result whose `data` object contains only the declared keys. The extra keys SHALL be absent from `data`.

**Validates: Requirements 6.5**

### Property 9: Error Response Never Leaks Raw Supabase Error Text

*For any* Supabase error message string `rawMsg`, when an action catches that error and constructs an `ActionResult`, the `error.message` field in the returned result SHALL NOT equal `rawMsg` and SHALL NOT be a substring match of `rawMsg`. The `error.message` SHALL be a non-empty, human-readable string safe for client display.

**Validates: Requirements 9.1, 9.3**

### Property 10: Nav Card Presence Exclusive to Admin Role

*For any* user role value, the `renderTokenUsageCard(role)` predicate SHALL return `true` (card rendered) if and only if `role === 'admin'`, and `false` for all other role values including `null`.

**Validates: Requirements 5.1, 5.2**

---

## Error Handling

All error handling follows IEC 62304 no-silent-failures mandate. The system must never display a zero-value gauge or empty table that could be mistaken for valid zero-usage data.

### Server Action Error Contract

Every action returns `ActionResult<T>`:
- On success: `{ data: T }` — `error` key absent.
- On failure: `{ error: { message: string } }` — `data` key absent. `message` is a human-readable string; raw Supabase error text and stack traces are logged server-side via `console.error` and never forwarded to the client.

**Error classification matrix:**

| Condition | Action Response | UI Render |
|---|---|---|
| `auth.getUser()` fails / null user | `error: "Unauthorized."` | Redirect to `/login` |
| No `user_roles` row | `error: "Unauthorized."` | Redirect to `/login` |
| Role is `developer` or `viewer` | `error: "Forbidden: ..."` | `<AccessDenied>` component |
| Supabase query error (any) | `error: "Failed to load..."` | Dedicated error UI region |
| `organizations` returns 0 rows | `error: "Data integrity..."` | Non-numeric gauge error label |
| `organizations.token_units_limit = 0` | `error: "Quota not configured"` | Gauge error label, no % calculated |
| Mid-pagination Supabase error | `error: "Failed to load..."` | Leaderboard error state, no partial data |
| `getDeveloperUsage` timeout >5s | Client-side `useTransition` timeout | Leaderboard timeout error state |

### Client-Side Error Boundaries

- `<UsageGaugeCard>` renders a dedicated error region with a labelled message when `ActionResult.error` is present. It does not render `0` or `0/0`.
- `<UsageClient>` renders a dedicated error region (not an empty table) when the leaderboard action returns an error. Stale data from a previous successful fetch is discarded, not shown.
- Errors are scoped: a gauge error does not suppress the leaderboard, and vice versa.
- The `<DashboardHeader>` and page navigation always remain mounted regardless of data errors (Req 9.5).

### Supabase Zero-Row Guard

Per Requirement 9.6, a successful Supabase response for `organizations` that returns zero rows is treated as a data integrity violation, not valid zero-usage state:

```typescript
const { data, error } = await adminClient
  .from("organizations")
  .select("token_units_used, token_units_limit")
  .eq("org_id", orgId)
  .single();

if (error || !data) {
  console.error("[getOrgQuota] No organizations row for org_id:", orgId);
  return { error: { message: "Quota data is unavailable. Contact your administrator." } };
}
```

---

## Testing Strategy

### Dual Testing Approach

The feature uses both property-based tests (for logic correctness across all inputs) and example-based unit tests (for specific states and integration points).

**Property-Based Testing library:** `fast-check` v4 (already installed, confirmed in `package.json`).  
**Test runner:** Vitest v4 (`vitest --run` for single-shot execution).  
**Minimum iterations:** 100 per property test.  
**Test file location:** `app/dashboard/usage/__tests__/actions.property.test.ts`

### Property-Based Tests

Each property maps directly to a correctness property in this design. All Supabase calls are mocked. Pure functions are extracted from `actions.ts` and tested in isolation.

**Tag format: `// Feature: token-usage-dashboard, Property N: <property_text>`**

| Test | Property | Fast-check Generators |
|---|---|---|
| Role gate fires on all four roles | Property 1 | `fc.constantFrom('admin', 'qa_manager', 'developer', 'viewer')` |
| Multi-tenant: client org_id never used | Property 2 | `fc.tuple(fc.uuid(), fc.uuid())` |
| Gauge color classification for all ratios | Property 3 | `fc.tuple(fc.nat(), fc.nat(1, 1_000_000))` |
| Leaderboard grouping/sort invariants | Property 4 | `fc.array(fc.record({ developer_email: fc.option(fc.emailAddress()), ai_tokens_used: fc.option(fc.integer()) }))` |
| Email normalisation — unknown variants | Property 5 | `fc.oneof(fc.constant(null), fc.constant(''), fc.constant('unknown_developer'), fc.stringMatching(/^\s+$/))` |
| Email normalisation — valid emails | Property 5 | `fc.emailAddress()` |
| Time filter predicate | Property 6 | `fc.tuple(fc.constantFrom('7d','30d','90d','all'), fc.array(fc.record({ execution_timestamp: fc.date() })))` |
| Pagination completeness | Property 7 | `fc.integer({ min: 0, max: 5000 })` (simulated N rows) |
| Zod schema strips unknown keys | Property 8 | `fc.record({ timeFilter: fc.constantFrom('7d','30d','90d','all') }, { withDeletedKeys: false })` merged with arbitrary extra keys |
| Error response never leaks raw DB text | Property 9 | `fc.string({ minLength: 1 })` as mock Supabase error message |
| Nav card presence iff admin | Property 10 | `fc.constantFrom('admin', 'qa_manager', 'developer', 'viewer', null)` |

### Example-Based Unit Tests

Specific scenarios that require concrete examples rather than universal properties:

- Unauthed user → `getOrgQuota()` returns `error: "Unauthorized."`
- No `user_roles` row → action returns `error: "Unauthorized."`
- `token_units_limit = 0` → `deriveQuotaData` returns error sentinel
- `organizations` query returns 0 rows → action returns data integrity error
- Mid-pagination Supabase error → partial data discarded, error returned
- Filter = "Last 30 days" is the default on page load
- `getDeveloperUsage` with "all" filter returns all rows regardless of timestamp
- Empty `evidence_logs` for org → leaderboard returns `[]` (not error)

### Accessibility / Design System Integration Tests

- axe-core scan of the rendered page produces zero critical violations (WCAG 2.1 AA)
- Focus ring appears on interactive elements via keyboard navigation
- Semantic color tokens used only for compliance state indicators, not navigation

### What Is Not Unit-Tested

- QAVRO dark canvas colors, border radius compliance, drop shadow absence — verified via visual review and design audit
- `animate-pulse` skeleton dimensions — verified via visual regression
- JetBrains Mono font rendering — verified via visual review
- 5-second query timeout — performance/integration test only
- `import 'server-only'` enforcement — build-time check via Next.js bundler
- `export const dynamic = "force-dynamic"` — runtime behavior, not unit-testable

---

## Low-Level Implementation Notes

### QAVRO Design System Compliance

All components must conform to the design system tokens. Key implementation constraints:

**Colors (Tailwind CSS custom properties / direct hex):**
- Page canvas: `bg-[#030712]` (canvas-dark)
- Card/table containers: `bg-[#111827] border border-[#374151]` (surface-1 + hairline)
- Hover state: `hover:bg-[#1f2937]` (surface-2), no `hover:shadow-*`
- Gauge healthy: `bg-[#05b169]`
- Gauge warning: `bg-[#f4b000]`
- Gauge exhausted: `bg-[#cf202f]`

**Typography:**
- Page title: `font-['Inter'] text-2xl font-medium` (display-md: 24px weight 500)
- Section headings: `font-['Inter'] text-lg font-medium`
- Table headers: `font-['Inter'] text-xs font-semibold uppercase tracking-[0.5px] text-[#9ca3af]`
- All numeric values, token counts, emails, timestamps: `font-['JetBrains_Mono'] text-[13px] font-medium`
- Table row padding: `py-3` (12px vertical per design density requirement)

**Geometry:**
- No `rounded-*` class greater than `rounded` (4px) anywhere
- No `shadow-*` class anywhere — use `border border-[#374151]` for elevation
- Status badges: `rounded-none border border-[<semantic-color>] bg-transparent`

**Focus rings:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052ff] focus-visible:ring-offset-2`

**Active state:** `active:scale-[0.98]` on all interactive elements

### Framer Motion Conventions

```tsx
// Filter button selection — rapid micro-interaction
<motion.button
  layout
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
>

// Leaderboard row entrance — general UI entrance
<motion.tr
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -4 }}
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
>

// AnimatePresence wraps the conditional leaderboard content:
<AnimatePresence mode="wait">
  {isPending ? <LeaderboardSkeleton key="skeleton" />
             : <LeaderboardTable key="table" rows={rows} />}
</AnimatePresence>
```

### Server Action Internal Structure

Both `getOrgQuota` and `getDeveloperUsage` follow the same 4-step resolution pattern used throughout the codebase:

```
Step 1: createClient().auth.getUser()     → verify JWT
Step 2: adminClient users.select(org_id)  → resolve orgId (never from client)
Step 3: adminClient user_roles.select()   → resolve role
Step 4: Gate check (admin | qa_manager)   → proceed or return Forbidden
Step 5: Execute Supabase data query(ies)  → adminClient with org_id predicate
Step 6: Transform + return ActionResult
```

`getDeveloperUsage` accepts `rawInput: unknown` and calls `developerUsageInputSchema.safeParse(rawInput)` before Step 5. If `!result.success`, it returns `{ error: { message: "Invalid input." } }` without executing any database query.

### Dashboard Page Navigation Card Update

The existing `app/dashboard/page.tsx` already conditionally renders the "Team Usage" nav card for `userRole === "admin"`. Per Requirement 5.2, this gate must remain `userRole === "admin"` only — the card must NOT be shown to `qa_manager`. The current implementation is correct and requires no change.

The nav card label is already `"Team Usage"` in the existing code; Requirement 5.5 specifies `"Token Usage"`. This label should be updated to `"Token Usage"` during implementation.
