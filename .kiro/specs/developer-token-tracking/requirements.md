# Requirements: Developer Token Usage Tracking

## Introduction

Enterprise customers need per-developer visibility into Bedrock AI API costs. This feature adds two columns to `evidence_logs` — `developer_email` and `ai_tokens_used` — to power a future "AI Token Usage by Developer" dashboard. The columns must be backwards-compatible so existing data and all running CLI versions are unaffected.

---

## Requirements

### REQ-1: Database Migration

**The system must add `developer_email` (TEXT, nullable) and `ai_tokens_used` (INTEGER, default 0) to `public.evidence_logs`.**

Acceptance criteria:
- A new SQL migration file exists in `omnis-api/supabase/migrations/` with a timestamp filename.
- Both columns are added via idempotent `ALTER TABLE` statements (using `IF NOT EXISTS` guards) inside a transaction.
- All existing rows are unaffected after the migration runs (no backfill required).
- The migration follows the style and commenting conventions of `20260618000000_token_tracking_and_indexes.sql`.

---

### REQ-2: TypeScript Type Definitions

**The `evidence_logs` type in `omnis-ui/types/supabase.ts` must reflect the new columns.**

Acceptance criteria:
- `Row` gains `developer_email: string | null` and `ai_tokens_used: number | null`.
- `Insert` gains `developer_email?: string | null` and `ai_tokens_used?: number | null`.
- `Update` gains `developer_email?: string | null` and `ai_tokens_used?: number | null`.
- No other tables or types in the file are modified.

---

### REQ-3: Ingest Route Accepts `developer_email`

**`POST /api/ingest` must accept an optional `developer_email` field in the request body and persist it to `evidence_logs`.**

Acceptance criteria:
- `IngestPayload` in `omnis-ui/app/api/ingest/route.ts` includes `developer_email?: string`.
- The value is trimmed and written to `evidenceRow.developer_email`; if absent, `null` is stored.
- Requests that omit `developer_email` continue to succeed (field is optional, existing CLI versions unaffected).
- The existing API key authentication and SHA-256 signature checks are not modified.
- `ai_tokens_used` is **not** set in the ingest route — it remains at the DB default (0) until the Bedrock background task updates it.

---

### REQ-4: FastAPI Pydantic Model Updated

**`EvidenceLogPayload` in `omnis-api/models/ai_schemas.py` must include the optional `developer_email` field.**

Acceptance criteria:
- `developer_email: Optional[str] = None` is added to `EvidenceLogPayload`.
- No other fields in the model are changed.
- Existing test payloads that omit `developer_email` remain valid.

---

### REQ-5: Bedrock Token Count Captured

**`extract_compliance_data` in `omnis-api/services/bedrock_engine.py` must return the actual Bedrock token count (input + output tokens) alongside the compliance data.**

Acceptance criteria:
- The function extracts `usage.input_tokens + usage.output_tokens` from the Bedrock API response body.
- If the `usage` key is absent (e.g., model version does not return it), the function returns `0` for tokens — it must not raise an exception or return `None`.
- The return type is a tuple `(ComplianceExtraction, int)`.
- The IEC 62304 "fail loudly" mandate applies to *clinical* payload issues, not to missing usage metadata — missing usage is a graceful degradation to 0.

---

### REQ-6: Token Count Written to `evidence_logs` After Bedrock

**The background task in `omnis-api/routers/evidence.py` must update `evidence_logs.ai_tokens_used` with the actual token count after a successful Bedrock call.**

Acceptance criteria:
- `process_evidence_with_ai` unpacks the `(insights, token_count)` tuple from `extract_compliance_data`.
- After `lock_ai_insights` succeeds, an UPDATE is issued: `evidence_logs SET ai_tokens_used = token_count WHERE log_id = <log_id>`.
- This UPDATE uses the existing authenticated `supabase` client — no new credentials or clients are introduced.
- If the UPDATE itself fails, the failure is logged but does not affect the `200 OK` already returned, consistent with the existing background-task error-handling pattern.
- The `lock_ai_failure` sentinel written on Bedrock errors is not affected by this change.

---

### REQ-7: Commit and Push

**All changes must be staged, committed, and pushed.**

Acceptance criteria:
- Changes in `omnis-api/` are committed to the `omnis-api` git repository.
- Changes in `omnis-ui/` are committed to the `omnis-ui` git repository.
- Each repo is pushed to a new branch (not `main`/`master` directly).
- Commit messages are descriptive and reference this feature.
