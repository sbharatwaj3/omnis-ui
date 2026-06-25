# Design: Developer Token Usage Tracking

## Overview

Add `developer_email` and `ai_tokens_used` to `evidence_logs` so the planned "AI Token Usage by Developer" dashboard can aggregate per-developer API costs from the existing ledger — without adding a new table or changing the query surface for any existing view.

---

## Affected Systems

| Layer | File | Change |
|---|---|---|
| Database migration | `omnis-api/supabase/migrations/<timestamp>_developer_token_tracking.sql` | ALTER TABLE adds two columns |
| TypeScript types | `omnis-ui/types/supabase.ts` | `evidence_logs` Row/Insert/Update gain the two new fields |
| Ingest route | `omnis-ui/app/api/ingest/route.ts` | Accept `developer_email` from request body; write it on insert |
| FastAPI backend | `omnis-api/routers/evidence.py` + `omnis-api/models/ai_schemas.py` | Pass `ai_tokens_used` back to Supabase after Bedrock responds |

---

## Database Design

### New columns on `public.evidence_logs`

```sql
-- Nullable TEXT — backwards-compatible with all existing rows
developer_email TEXT DEFAULT NULL;

-- Nullable INTEGER — NULL on rows that predate this feature or where Bedrock was never called
ai_tokens_used  INTEGER DEFAULT 0;
```

**Why nullable / defaulted?**
- `evidence_logs` already has thousands of rows with no email or token data. Making either column NOT NULL would require a non-trivial backfill and block the migration on large tables.
- A `DEFAULT 0` on `ai_tokens_used` means dashboard aggregations (`SUM`) work correctly on old rows (they contribute 0, not NULL-propagation).
- `developer_email` is left `DEFAULT NULL` so the dashboard can distinguish "old log — email unknown" from "new log — email provided".

### Migration file

Filename follows the existing convention: `YYYYMMDDHHMMSS_developer_token_tracking.sql`

The migration wraps both `ALTER TABLE` statements in a `DO $$ BEGIN ... END $$` idempotency guard (matching the pattern in `20260618000000_token_tracking_and_indexes.sql`) so it is safe to re-run on an environment where one column may already exist.

---

## Ingest Route Changes (`omnis-ui/app/api/ingest/route.ts`)

### Payload extension

`IngestPayload` gains an optional field:

```typescript
interface IngestPayload {
  results: unknown;
  build_version?: string;
  req_id?: string;
  execution_status?: string;
  developer_email?: string;   // NEW — sent explicitly by the CLI
}
```

`developer_email` is optional so existing CLI versions that do not send it continue to work (the field is written as `null` / omitted from the insert and the DB column defaults to NULL).

### Insert row extension

The `evidenceRow` object (Step 9) gains:

```typescript
developer_email: payload.developer_email?.trim() || null,
```

`ai_tokens_used` is NOT set at insert time — it starts at the DB default (0) and is updated asynchronously by the FastAPI background task after the Bedrock response is received (see below).

### No auth changes

The route's double-lock (API key verification + SHA-256 signature) is **not modified**. `developer_email` is untrusted caller-supplied data, stored as informational metadata only. It is never used for authorization decisions.

---

## FastAPI Backend Changes

### `omnis-api/models/ai_schemas.py`

`EvidenceLogPayload` gains an optional field consistent with the new column:

```python
developer_email: Optional[str] = None
```

`ai_tokens_used` is **not** added to the inbound payload model because the token count is only known after the Bedrock call completes inside `process_evidence_with_ai` — it does not travel with the initial ingest request.

### `omnis-api/services/bedrock_engine.py`

The `extract_compliance_data` function (or its caller) must capture the token usage from the Bedrock response. AWS Bedrock's `invoke_model` response body includes:

```json
{
  "usage": {
    "input_tokens": 512,
    "output_tokens": 128
  }
}
```

The total (`input_tokens + output_tokens`) is returned alongside the existing `ComplianceExtraction` data.

**Return type change:** `extract_compliance_data` returns a tuple `(ComplianceExtraction, int)` where the `int` is the total token count. If Bedrock does not return usage metadata (e.g., older model versions), the function returns `0` for tokens — no silent failure.

### `omnis-api/routers/evidence.py` — background task

`process_evidence_with_ai` already calls `db_mapper.lock_ai_insights`. After that succeeds, it fires an additional Supabase UPDATE to stamp the token count:

```python
supabase.table("evidence_logs") \
    .update({"ai_tokens_used": tokens_used}) \
    .eq("log_id", log_id_str) \
    .execute()
```

This is a fire-and-forget UPDATE inside the background task — it does not block or affect the `200 OK` already returned to the caller.

### `omnis-api/services/database_mapper.py`

`lock_ai_insights` signature remains unchanged. The token UPDATE is a separate, explicit call in the background task — not bundled into `lock_ai_insights` — to keep that function's responsibility narrow.

---

## TypeScript Type Changes (`omnis-ui/types/supabase.ts`)

Three sections of the `evidence_logs` entry are updated:

```typescript
// Row
developer_email: string | null
ai_tokens_used: number | null

// Insert
developer_email?: string | null
ai_tokens_used?: number | null

// Update
developer_email?: string | null
ai_tokens_used?: number | null
```

`ai_tokens_used` uses `number | null` in TypeScript (not `number`) because rows created before this migration have a DB default of 0, but rows where Bedrock was never invoked may legitimately be `null` if the default is overridden in the future. Using nullable keeps the type honest.

---

## Data Flow Summary

```
CLI  →  POST /api/ingest  (includes developer_email)
          │
          ├─ Writes evidence_logs row
          │    developer_email = payload.developer_email
          │    ai_tokens_used  = 0  (DB default)
          │
          └─ after() → POST omnis-api /api/v1/evidence/ingest
                          │
                          └─ BackgroundTask: process_evidence_with_ai
                               │
                               ├─ Bedrock call → returns (insights, token_count)
                               ├─ lock_ai_insights(log_id, insights)
                               └─ UPDATE evidence_logs SET ai_tokens_used = token_count
                                    WHERE log_id = ?
```

---

## What Is Explicitly Out of Scope

- No UI changes (dashboard, charts, tables).
- No CLI changes beyond documenting that `developer_email` is an accepted field.
- No changes to `omnis-run` (Go layer).
- No new Supabase RPC functions.
- No backfill of `developer_email` on historical rows.
