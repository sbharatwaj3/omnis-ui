-- =============================================================================
-- OMNIS REGOPS: DATA RECOVERY — Backfill orphaned evidence_logs to admin user
-- Migration: 20260610000002_backfill_admin_user_id
-- =============================================================================
-- Context: The 145 evidence logs ingested before RLS was introduced have
-- user_id = NULL. The RLS SELECT policy (user_id = auth.uid()) hides them
-- from everyone, including the admin account.
--
-- This migration reassigns all NULL-user_id logs to admin@omnis.com so they
-- become visible again under that account's RLS context.
--
-- Safe to run multiple times — the WHERE user_id IS NULL clause is idempotent.
-- =============================================================================

DO $$
DECLARE
    v_admin_id UUID;
    v_rows_updated INT;
BEGIN
    -- Step 1: Resolve the admin user's UUID from auth.users.
    -- This uses the email as the stable lookup key — never hardcode the UUID.
    SELECT id
    INTO v_admin_id
    FROM auth.users
    WHERE email = 'admin@omnis.com'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION
            'ABORT: No user found with email admin@omnis.com in auth.users. '
            'Verify the email address and re-run.';
    END IF;

    -- Step 2: Stamp all orphaned logs (user_id IS NULL) with the admin UUID.
    -- Only touches NULL rows — never overwrites a log that already has an owner.
    UPDATE public.evidence_logs
    SET    user_id = v_admin_id
    WHERE  user_id IS NULL;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RAISE NOTICE 'SUCCESS: % evidence_log row(s) reassigned to admin UUID %',
        v_rows_updated, v_admin_id;
END;
$$;
