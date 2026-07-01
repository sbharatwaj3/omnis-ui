# Tasks: Developer Token Usage Tracking

## Task List

- [x] 1. Create the SQL migration
  - [x] 1.1 Generate a new migration file in `omnis-api/supabase/migrations/` named `<timestamp>_developer_token_tracking.sql`
  - [x] 1.2 Add idempotent `ALTER TABLE public.evidence_logs ADD COLUMN IF NOT EXISTS developer_email TEXT DEFAULT NULL`
  - [x] 1.3 Add idempotent `ALTER TABLE public.evidence_logs ADD COLUMN IF NOT EXISTS ai_tokens_used INTEGER DEFAULT 0`
  - [x] 1.4 Wrap both statements in a `BEGIN` / `COMMIT` transaction with `DO $$` idempotency guards matching the style of `20260618000000_token_tracking_and_indexes.sql`
  - Requirement: REQ-1

- [x] 2. Update TypeScript Supabase type definitions
  - [x] 2.1 In `omnis-ui/types/supabase.ts`, add `developer_email: string | null` and `ai_tokens_used: number | null` to `evidence_logs.Row`
  - [x] 2.2 Add `developer_email?: string | null` and `ai_tokens_used?: number | null` to `evidence_logs.Insert`
  - [x] 2.3 Add `developer_email?: string | null` and `ai_tokens_used?: number | null` to `evidence_logs.Update`
  - Requirement: REQ-2

- [x] 3. Update the ingest route to accept and persist `developer_email`
  - [x] 3.1 Add `developer_email?: string` to the `IngestPayload` interface in `omnis-ui/app/api/ingest/route.ts`
  - [x] 3.2 Add `developer_email: payload.developer_email?.trim() || null` to the `evidenceRow` object (Step 9 of `handleIngest`)
  - [x] 3.3 Verify that omitting `developer_email` still results in a successful 201 response (no breaking change)
  - Requirement: REQ-3

- [x] 4. Update the FastAPI Pydantic model
  - [x] 4.1 Add `developer_email: Optional[str] = None` to `EvidenceLogPayload` in `omnis-api/models/ai_schemas.py`
  - Requirement: REQ-4

- [x] 5. Capture Bedrock token count in the AI engine
  - [x] 5.1 In `omnis-api/services/bedrock_engine.py`, inspect the Bedrock response body for `usage.input_tokens` and `usage.output_tokens`
  - [x] 5.2 Change `extract_compliance_data` to return `tuple[ComplianceExtraction, int]` — `(insights, total_tokens)`
  - [x] 5.3 If `usage` is absent, return `(insights, 0)` — no exception, no `None`
  - Requirement: REQ-5

- [x] 6. Write token count back to `evidence_logs` after Bedrock
  - [x] 6.1 In `process_evidence_with_ai` in `omnis-api/routers/evidence.py`, unpack the tuple: `ai_data, tokens_used = extract_compliance_data(raw_logs, org_id)`
  - [x] 6.2 After `db_mapper.lock_ai_insights(log_id, ai_data)` succeeds, issue: `supabase.table("evidence_logs").update({"ai_tokens_used": tokens_used}).eq("log_id", log_id_str).execute()`
  - [x] 6.3 Wrap the UPDATE in a try/except; log failures but do not re-raise (consistent with existing background-task error handling)
  - Requirement: REQ-6

- [x] 7. Commit and push changes
  - [x] 7.1 In `omnis-api/`, stage migration file + changed Python files, commit with message `feat: add developer_email and ai_tokens_used columns to evidence_logs`, push to a new branch
  - [x] 7.2 In `omnis-ui/`, stage `types/supabase.ts` + `app/api/ingest/route.ts`, commit with same message, push to a new branch
  - Requirement: REQ-7

- [ ] 8. Create getDeveloperUsage server action
  - [ ] 8.1 Create `omnis-ui/app/dashboard/usage/actions.ts` with `"use server"` and `import "server-only"`
  - [ ] 8.2 Implement `getDeveloperUsage()`: verify session via `createClient`, resolve `org_id`, then use `adminClient` to fetch all `evidence_logs` rows (`log_id`, `developer_email`, `ai_tokens_used`) scoped to the user's `org_id`
  - [ ] 8.3 Group rows by `developer_email` in TypeScript: treat `null`, empty string, and `"unknown_developer"` as the same group, displayed as `"Unknown Developer"`
  - [ ] 8.4 For each group calculate `total_logs_uploaded` (COUNT) and `total_tokens_consumed` (SUM of `ai_tokens_used`, coercing null to 0)
  - [ ] 8.5 Sort results descending by `total_tokens_consumed` (leaderboard order) and return typed array
  - Requirement: REQ-8

- [ ] 9. Create the Team Usage page
  - [ ] 9.1 Create `omnis-ui/app/dashboard/usage/page.tsx` as a React Server Component with `export const dynamic = "force-dynamic"`
  - [ ] 9.2 Add the standard QAVRO header: logo on the left, `"Back to Dashboard"` outlined pill button centred (text only, no Lucide icon — matches audit-logs and requirements pages exactly), compliance badge + RoleBadge + SettingsMenu on the right
  - [ ] 9.3 Add the mobile sub-bar with the same `"Back to Dashboard"` pill link
  - [ ] 9.4 Add page heading with `BarChart2` icon, title `"Team AI Usage"`, and subtitle `"Monitor per-developer Bedrock token consumption and CLI upload activity."`
  - [ ] 9.5 Build the data table: columns Developer Email, Logs Uploaded, Tokens Consumed; highlight the top row (rank 1) with a small `"#1"` violet badge; apply QAVRO light-mode styling (white bg, zinc borders, crisp typography)
  - [ ] 9.6 Add an empty-state card (no data yet) and a loading skeleton via `<Suspense>`
  - Requirement: REQ-9

- [ ] 10. Add "Team Usage" card to the main Dashboard Hub
  - [ ] 10.1 In `omnis-ui/app/dashboard/page.tsx`, import `BarChart2` from `lucide-react` (add to existing import)
  - [ ] 10.2 Add a 4th card to the action card grid linking to `/dashboard/usage` with violet accent colours, `BarChart2` icon, title `"Team Usage"`, and subtext `"Monitor AI token consumption and CLI activity."`
  - [ ] 10.3 Update the grid from `sm:grid-cols-3` to `sm:grid-cols-2 lg:grid-cols-4` so the 4-card layout renders cleanly at all breakpoints
  - Requirement: REQ-10

- [ ] 11. Commit and push Phase 3 UI changes
  - [ ] 11.1 In `omnis-ui/`, stage `app/dashboard/usage/actions.ts`, `app/dashboard/usage/page.tsx`, and `app/dashboard/page.tsx`, commit with message `feat: add Team AI Usage dashboard (Phase 3)`, push to a new branch
  - Requirement: REQ-11
