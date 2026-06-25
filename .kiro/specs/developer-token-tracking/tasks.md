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
  - [~] 6.2 After `db_mapper.lock_ai_insights(log_id, ai_data)` succeeds, issue: `supabase.table("evidence_logs").update({"ai_tokens_used": tokens_used}).eq("log_id", log_id_str).execute()`
  - [~] 6.3 Wrap the UPDATE in a try/except; log failures but do not re-raise (consistent with existing background-task error handling)
  - Requirement: REQ-6

- [-] 7. Commit and push changes
  - [~] 7.1 In `omnis-api/`, stage migration file + changed Python files, commit with message `feat: add developer_email and ai_tokens_used columns to evidence_logs`, push to a new branch
  - [~] 7.2 In `omnis-ui/`, stage `types/supabase.ts` + `app/api/ingest/route.ts`, commit with same message, push to a new branch
  - Requirement: REQ-7
