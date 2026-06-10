-- =============================================================================
-- OMNIS REGOPS: PERMANENT FIX — Sync auth.users → public.users
-- Migration: 20260610000004_sync_auth_users_to_public
-- =============================================================================
-- ROOT CAUSE:
--   evidence_logs.user_id FK → public.users(user_id), NOT auth.users(id).
--   When users sign up via Supabase Auth, a row is created in auth.users but
--   NOT in public.users. Any evidence_log insert for that user fails the FK,
--   and RLS (user_id = auth.uid()) can never match because auth.uid() is the
--   auth.users.id — which is absent from public.users.
--
-- FIX PART 1 — Backfill existing auth users into public.users:
--   Insert every auth.users account that is not already in public.users,
--   using the shared sentinel org "Omnis AI Test Org" as the owner org.
--   Idempotent: ON CONFLICT DO NOTHING.
--
-- FIX PART 2 — Auto-sync trigger:
--   A trigger on auth.users AFTER INSERT automatically mirrors each new
--   signup into public.users so this can never happen again.
--   Falls back to the sentinel org if no specific org is supplied.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1: Backfill all existing auth.users into public.users
-- -----------------------------------------------------------------------------
-- The sentinel org is the canonical "no specific org" owner.
-- public.users rows created here get a placeholder public_key; the real key
-- is updated by the client when the user completes onboarding.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_sentinel_org_id UUID := '00000000-0000-0000-0000-000000000001';
  v_inserted        INT  := 0;
  rec               RECORD;
BEGIN
  -- Verify the sentinel org exists (safety guard — should always be true).
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE org_id = v_sentinel_org_id) THEN
    RAISE EXCEPTION
      'ABORT: Sentinel org 00000000-0000-0000-0000-000000000001 not found. '
      'Ensure initial_schema migration has been applied.';
  END IF;

  FOR rec IN
    SELECT au.id, au.email
    FROM   auth.users au
    WHERE  NOT EXISTS (
      SELECT 1 FROM public.users pu WHERE pu.user_id = au.id
    )
  LOOP
    INSERT INTO public.users (user_id, org_id, developer_email, public_key)
    VALUES (
      rec.id,
      v_sentinel_org_id,
      COALESCE(rec.email, rec.id::TEXT),   -- email is the canonical key
      'PENDING_ONBOARDING'                 -- placeholder; updated post-signup
    )
    ON CONFLICT (user_id) DO NOTHING;

    v_inserted := v_inserted + 1;
    RAISE NOTICE 'Synced auth user % (%) into public.users', rec.id, rec.email;
  END LOOP;

  RAISE NOTICE 'Backfill complete: % auth.users row(s) synced into public.users', v_inserted;
END;
$$;


-- -----------------------------------------------------------------------------
-- PART 2: Trigger function — fires on every future auth.users INSERT
-- -----------------------------------------------------------------------------
-- Uses SECURITY DEFINER so it runs with owner privileges and can write to
-- public.users from the auth schema trigger context.
-- Wrapped in ON CONFLICT DO NOTHING so retries are always safe.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sentinel_org_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.users (user_id, org_id, developer_email, public_key)
  VALUES (
    NEW.id,
    v_sentinel_org_id,
    COALESCE(NEW.email, NEW.id::TEXT),
    'PENDING_ONBOARDING'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Grant execute to postgres role (required for auth-schema trigger context).
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres;


-- -----------------------------------------------------------------------------
-- PART 3: Attach the trigger to auth.users
-- Drop first so this migration is idempotent (safe to re-run).
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
