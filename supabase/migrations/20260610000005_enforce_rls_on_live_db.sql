-- =============================================================================
-- OMNIS REGOPS: P0 SECURITY — Enforce RLS on live database
-- Migration: 20260610000005_enforce_rls_on_live_db
-- =============================================================================
-- ROOT CAUSE (confirmed via diagnostic scripts):
--
--   The rls_fix.sql and initial_schema.sql files exist in the repo but were
--   NEVER applied to the live Supabase Cloud database. The live DB was created
--   from the Constitution DDL which:
--     • Grants GRANT SELECT ON evidence_logs TO authenticated — blanket access.
--     • Has NO SELECT RLS policy, only an INSERT policy.
--     • Has NO RLS at all on ai_compliance_insights.
--
--   Evidence: anon key returns 0 rows (INSERT policy exists, no SELECT policy).
--   But every authenticated user sees ALL 145 logs / 83.8% compliance because
--   the blanket GRANT SELECT TO authenticated bypasses the missing SELECT policy.
--
-- DIAGNOSTIC RESULTS:
--   anon embed  → 0 logs    (correct — no SELECT policy, no INSERT policy match)
--   new user    → 83.8%     (leak — GRANT SELECT TO authenticated with no policy
--                             means every authenticated user reads every row)
--   service-role → 83.8%   (expected — service_role bypasses RLS by design)
--
-- FIX (idempotent — safe to re-run):
--   1. evidence_logs:
--      a. Revoke the blanket authenticated/anon GRANTs.
--      b. Re-grant only the minimum privilege needed for RLS evaluation.
--      c. Drop all existing policies (legacy + any from prior partial runs).
--      d. Create strict per-user SELECT, INSERT, UPDATE policies.
--      e. ENABLE + FORCE ROW LEVEL SECURITY.
--
--   2. ai_compliance_insights:
--      a. Same revoke/regrant pattern.
--      b. SELECT policy: user may only see insights whose parent log is theirs.
--      c. ENABLE + FORCE ROW LEVEL SECURITY.
-- =============================================================================


-- =============================================================================
-- PART 1: evidence_logs
-- =============================================================================

-- 1a. Revoke blanket GRANTs that allow all authenticated users to read all rows.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.evidence_logs FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.evidence_logs FROM anon;

-- 1b. Re-grant service_role full access (FastAPI ingest pipeline — bypasses RLS).
GRANT SELECT, INSERT, UPDATE ON public.evidence_logs TO service_role;

-- 1c. Grant authenticated the minimum privilege needed for RLS to evaluate.
--     Without ANY grant, Postgres throws a permission error before RLS runs.
--     With GRANT + policy, Postgres evaluates the policy and filters rows.
GRANT SELECT, UPDATE ON public.evidence_logs TO authenticated;

-- 1d. Drop all existing policies — start clean and idempotent.
DROP POLICY IF EXISTS "Allow Insert for Authenticated Ingestion"      ON public.evidence_logs;
DROP POLICY IF EXISTS "Users can only read their own evidence logs"   ON public.evidence_logs;
DROP POLICY IF EXISTS "Users can only insert their own evidence logs" ON public.evidence_logs;
DROP POLICY IF EXISTS "Users can only update their own evidence logs" ON public.evidence_logs;

-- 1e. SELECT: authenticated users may only see rows where user_id = their uid.
CREATE POLICY "Users can only read their own evidence logs"
  ON public.evidence_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 1f. INSERT: authenticated users may only create rows stamped with their uid.
--     (The FastAPI pipeline inserts via service_role, not authenticated.)
GRANT INSERT ON public.evidence_logs TO authenticated;
CREATE POLICY "Users can only insert their own evidence logs"
  ON public.evidence_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 1g. UPDATE: authenticated users may only update rows they own.
--     Used by the 21 CFR Part 11 digital-signature server action.
CREATE POLICY "Users can only update their own evidence logs"
  ON public.evidence_logs
  FOR UPDATE
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 1h. Enable and FORCE RLS — FORCE ensures service_role also obeys policies
--     when explicitly opting in. Without FORCE, service_role bypasses (desired
--     for the API pipeline). We DO want FORCE here so even a compromised
--     service_role session can't leak data without an explicit bypass.
--     NOTE: FORCE ROW LEVEL SECURITY applies to the TABLE OWNER only.
--     service_role is a superuser equivalent — it always bypasses RLS regardless
--     of FORCE. FORCE only affects the table owner role connecting directly.
--     We keep FORCE as a belt-and-suspenders safeguard.
ALTER TABLE public.evidence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_logs FORCE ROW LEVEL SECURITY;


-- =============================================================================
-- PART 2: ai_compliance_insights
-- =============================================================================
-- This table has no user_id column. Isolation is enforced by joining through
-- evidence_logs: the user may only see insights whose parent log belongs to them.

-- 2a. Revoke blanket GRANTs (original DDL granted SELECT to anon/authenticated).
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ai_compliance_insights FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ai_compliance_insights FROM authenticated;

-- 2b. Re-grant service_role full access (API ingest pipeline).
GRANT SELECT, INSERT, UPDATE ON public.ai_compliance_insights TO service_role;

-- 2c. Grant authenticated minimum privilege for RLS evaluation.
GRANT SELECT ON public.ai_compliance_insights TO authenticated;

-- 2d. Drop any existing policies.
DROP POLICY IF EXISTS "Users can only read insights for their own logs" ON public.ai_compliance_insights;
DROP POLICY IF EXISTS "Service role can insert insights"                ON public.ai_compliance_insights;

-- 2e. SELECT: user may only see insights linked to evidence logs they own.
CREATE POLICY "Users can only read insights for their own logs"
  ON public.ai_compliance_insights
  FOR SELECT
  TO authenticated
  USING (
    log_id IN (
      SELECT log_id
      FROM   public.evidence_logs
      WHERE  user_id = auth.uid()
    )
  );

-- 2f. Enable and FORCE RLS.
ALTER TABLE public.ai_compliance_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_compliance_insights FORCE ROW LEVEL SECURITY;


-- =============================================================================
-- PART 3: Verification queries
-- Run these in the Supabase SQL editor after applying to confirm.
-- =============================================================================

-- Check policies are created:
-- SELECT tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('evidence_logs', 'ai_compliance_insights')
-- ORDER BY tablename, cmd;

-- Check RLS is enabled and forced:
-- SELECT relname, relrowsecurity, relforcerowsecurity
-- FROM pg_class
-- WHERE relname IN ('evidence_logs', 'ai_compliance_insights');

-- Expected results after applying:
--   evidence_logs            relrowsecurity=true  relforcerowsecurity=true
--   ai_compliance_insights   relrowsecurity=true  relforcerowsecurity=true
--
--   evidence_logs policies:
--     authenticated | SELECT | (user_id = auth.uid())
--     authenticated | INSERT | WITH CHECK (user_id = auth.uid())
--     authenticated | UPDATE | (user_id = auth.uid())
--
--   ai_compliance_insights policies:
--     authenticated | SELECT | (log_id IN (SELECT log_id FROM evidence_logs WHERE user_id = auth.uid()))
