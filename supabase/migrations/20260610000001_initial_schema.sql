-- =============================================================================
-- OMNIS REGOPS: INITIAL SCHEMA MIGRATION
-- Migration: 20260610000001_initial_schema
-- =============================================================================
-- Full canonical schema sourced from the System Constitution (architecture.md)
-- plus the P0 RLS security policies from the rls_fix migration.
--
-- This file represents the authoritative, code-controlled database state.
-- All future schema changes must be made as new numbered migration files —
-- never edit this file directly once it has been applied to production.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- EXTENSIONS
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;


-- -----------------------------------------------------------------------------
-- 1. ORGANIZATIONS (Parent — top of the hierarchy)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
    org_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- -----------------------------------------------------------------------------
-- 2. BUILDS (Child of organizations)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.builds (
    build_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
    version_string TEXT NOT NULL,
    compiled_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- -----------------------------------------------------------------------------
-- 3. USERS (Child of organizations — maps to auth.users via developer_email)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
    user_id         UUID PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
    developer_email TEXT NOT NULL UNIQUE,
    public_key      TEXT NOT NULL
);


-- -----------------------------------------------------------------------------
-- 4. REVOKED_KEYS (Child of users)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.revoked_keys (
    key_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    reason     TEXT,
    revoked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- -----------------------------------------------------------------------------
-- 5. REGULATORY_RULES (Parent to evidence_logs)
-- Constitution note: notion_page_id is a legacy column retained for DB schema
-- compatibility only. Notion has been fully decommissioned. Do not read or
-- write this field in any application code.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.regulatory_rules (
    req_id        TEXT PRIMARY KEY,
    rule_source   TEXT NOT NULL,
    description   TEXT,
    evidence_type TEXT,
    notion_page_id TEXT NOT NULL  -- legacy, retained for schema compatibility only
);


-- -----------------------------------------------------------------------------
-- 6. EVIDENCE_LOGS (The central compliance ledger)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.evidence_logs (
    log_id              UUID PRIMARY KEY,

    -- Core foreign keys (ERD-mapped)
    org_id              UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    build_id            UUID NOT NULL REFERENCES public.builds(build_id) ON DELETE CASCADE,
    req_id              TEXT NOT NULL REFERENCES public.regulatory_rules(req_id) ON DELETE CASCADE,

    -- Cryptographic & state tracking
    previous_log_hash   TEXT,
    signature_hash      TEXT NOT NULL,
    raw_command         TEXT NOT NULL,
    sanitized_payload   JSONB NOT NULL,
    execution_status    TEXT NOT NULL,
    execution_timestamp TIMESTAMPTZ NOT NULL,
    is_deprecated       BOOLEAN DEFAULT FALSE,
    event_source        TEXT NOT NULL,

    -- 21 CFR Part 11 digital signature fields
    approved_by         UUID REFERENCES auth.users(id),
    approved_at         TIMESTAMPTZ,

    -- Concurrency handling — recursive FK to itself (unique: one supersession per log)
    supersedes_log_id   UUID REFERENCES public.evidence_logs(log_id) UNIQUE
);


-- -----------------------------------------------------------------------------
-- 7. AI_COMPLIANCE_INSIGHTS (Sister table to evidence_logs)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_compliance_insights (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    log_id              UUID REFERENCES public.evidence_logs(log_id) ON DELETE CASCADE,
    ai_test_suite       TEXT,
    ai_result_summary   TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    ai_confidence_score SMALLINT,
    ai_reasoning        TEXT
);


-- -----------------------------------------------------------------------------
-- 8. REGULATORY_FRAMEWORKS (Vector store for AI semantic search)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.regulatory_frameworks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    framework         VARCHAR(50) NOT NULL,       -- e.g. 'FDA 21 CFR Part 820'
    clause_code       VARCHAR(50) NOT NULL,       -- e.g. '820.30(g)'
    title             VARCHAR(255) NOT NULL,       -- e.g. 'Design Validation'
    description       TEXT NOT NULL,              -- official regulatory text
    clinical_heuristic TEXT NOT NULL,             -- translated logic for the AI
    embedding         vector(1536),               -- Titan Embed v1 output dimension
    created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- 9. SEMANTIC SEARCH FUNCTION (cosine similarity over regulatory_frameworks)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_regulatory_codes(
    query_embedding vector(1536),
    match_threshold FLOAT,
    match_count     INT
)
RETURNS TABLE (
    id                UUID,
    framework         VARCHAR,
    clause_code       VARCHAR,
    title             VARCHAR,
    clinical_heuristic TEXT,
    similarity        FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        rf.id,
        rf.framework,
        rf.clause_code,
        rf.title,
        rf.clinical_heuristic,
        1 - (rf.embedding <=> query_embedding) AS similarity
    FROM public.regulatory_frameworks rf
    WHERE 1 - (rf.embedding <=> query_embedding) > match_threshold
    ORDER BY rf.embedding <=> query_embedding
    LIMIT match_count;
$$;


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================


-- -----------------------------------------------------------------------------
-- evidence_logs: strict per-user isolation
-- -----------------------------------------------------------------------------

ALTER TABLE public.evidence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_logs FORCE ROW LEVEL SECURITY;

-- Drop legacy / over-permissive policies before recreating clean ones
DROP POLICY IF EXISTS "Allow Insert for Authenticated Ingestion" ON public.evidence_logs;
DROP POLICY IF EXISTS "Users can only read their own evidence logs"   ON public.evidence_logs;
DROP POLICY IF EXISTS "Users can only insert their own evidence logs" ON public.evidence_logs;

-- SELECT: authenticated users see only rows they own
CREATE POLICY "Users can only read their own evidence logs"
    ON public.evidence_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- INSERT: authenticated users can only create rows stamped with their own uid
CREATE POLICY "Users can only insert their own evidence logs"
    ON public.evidence_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- UPDATE: authenticated users can only update their own rows
--         (used by the 21 CFR Part 11 digital signature server action)
CREATE POLICY "Users can only update their own evidence logs"
    ON public.evidence_logs
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- ai_compliance_insights: isolation via parent evidence_logs join
-- (no direct user_id column — ownership derived through log_id)
-- -----------------------------------------------------------------------------

ALTER TABLE public.ai_compliance_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_compliance_insights FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only read insights for their own logs" ON public.ai_compliance_insights;

-- SELECT: user may only see insights whose parent log belongs to them
CREATE POLICY "Users can only read insights for their own logs"
    ON public.ai_compliance_insights
    FOR SELECT
    TO authenticated
    USING (
        log_id IN (
            SELECT log_id
            FROM public.evidence_logs
            WHERE user_id = auth.uid()
        )
    );


-- =============================================================================
-- GRANTS
-- =============================================================================
-- service_role bypasses RLS (used by the FastAPI ingest pipeline).
-- authenticated role is granted only the minimum needed — RLS policies
-- do the actual row-level filtering on top of these table-level grants.
-- anon role gets zero access to compliance data tables.
-- =============================================================================

-- organizations
GRANT SELECT ON public.organizations TO service_role;

-- builds
GRANT SELECT ON public.builds TO service_role;

-- users
GRANT SELECT ON public.users TO authenticated, service_role;

-- regulatory_rules (read-only for authenticated — no user data here)
GRANT SELECT ON public.regulatory_rules TO authenticated, service_role;

-- evidence_logs
GRANT SELECT           ON public.evidence_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.evidence_logs TO service_role;

-- ai_compliance_insights
GRANT SELECT           ON public.ai_compliance_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_compliance_insights TO service_role;

-- regulatory_frameworks (read-only for all — public regulatory text)
GRANT ALL ON public.regulatory_frameworks TO authenticated, service_role;

-- semantic search function
GRANT EXECUTE ON FUNCTION match_regulatory_codes TO authenticated, service_role;
