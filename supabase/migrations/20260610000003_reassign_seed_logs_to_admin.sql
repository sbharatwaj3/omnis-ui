-- =============================================================================
-- OMNIS REGOPS: DATA RECOVERY v2 — Reassign non-auth-owned evidence_logs
-- Migration: 20260610000003_reassign_seed_logs_to_admin
-- =============================================================================
-- ROOT CAUSE (diagnosed against live DB):
--   The previous backfill (20260610000002) only targeted rows WHERE
--   user_id IS NULL. But the 145 evidence_logs were NOT null — they carry
--   public.users UUIDs created by scripts/seed_test_logs.ts
--   (seed-submitter / seed-approver). Those UUIDs do not exist in auth.users,
--   so the RLS policy (user_id = auth.uid()) can never match them and the
--   logs are invisible to every real login account.
--
--   Observed ownership:
--     63687235-ee29-487a-99c8-e0f396be6ccc :  30 logs   (not in auth.users)
--     10c25479-dcbe-4160-a684-fdf42070f14f : 115 logs   (not in auth.users)
--
-- FIX:
--   Reassign EVERY evidence_log whose user_id is not a real auth.users id
--   (covers NULL and stale seed UUIDs) to admin@omnis.com so the admin
--   account can see them under RLS.
--
-- Idempotent: re-running only touches rows not already owned by a real
-- auth.users account, so logs correctly owned by other real users are safe.
-- =============================================================================

DO $$
DECLARE
    v_admin_id      UUID;
    v_rows_updated  INT;
BEGIN
    -- Resolve admin UUID by email — never hardcode the UUID.
    SELECT id
    INTO   v_admin_id
    FROM   auth.users
    WHERE  email = 'admin@omnis.com'
    LIMIT  1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION
            'ABORT: No user found with email admin@omnis.com in auth.users.';
    END IF;

    -- Reassign any log whose owner is NULL or not a real auth.users id.
    UPDATE public.evidence_logs
    SET    user_id = v_admin_id
    WHERE  user_id IS NULL
       OR  user_id NOT IN (SELECT id FROM auth.users);

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RAISE NOTICE 'SUCCESS: % evidence_log row(s) reassigned to admin UUID %',
        v_rows_updated, v_admin_id;
END;
$$;
