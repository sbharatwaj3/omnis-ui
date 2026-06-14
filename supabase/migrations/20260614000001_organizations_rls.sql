-- =============================================================================
-- OMNIS REGOPS: RLS for public.organizations
-- Migration: 20260614000001_organizations_rls
-- =============================================================================
-- ROOT CAUSE OF "(no organisation assigned)" BANNER BUG:
--
--   app/readiness/page.tsx fetches the org name via a PostgREST FK embed:
--     supabase.from("users").select("org_id, organizations(company_name)")
--
--   The embed traverses the FK users.org_id → organizations.org_id.
--   The organizations table had RLS disabled AND only GRANT SELECT TO
--   service_role. The authenticated role had no SELECT grant at all, so
--   Postgres silently returned NULL for the embedded organizations row,
--   causing the banner to display "(no organisation assigned)" even though
--   the user had a valid org_id on their users row.
--
-- FIX:
--   1. Enable RLS on public.organizations.
--   2. Grant authenticated the minimum SELECT privilege required for RLS
--      evaluation to run.
--   3. Create a SELECT policy using private.get_auth_org_id() — the SECURITY
--      DEFINER helper introduced in migration 20260613191519. This ensures
--      a user can only read the single organizations row that belongs to their
--      own org, preventing org enumeration.
--
-- SAFETY:
--   - private.get_auth_org_id() is SECURITY DEFINER and reads users via the
--     table-owner role, bypassing RLS on users. This is the established
--     pattern in this codebase (see migration 20260613191519).
--   - INSERT/UPDATE/DELETE on organizations are NOT granted to authenticated.
--     Org creation goes through the service_role admin client in Server
--     Actions (onboarding/actions.ts). Authenticated users are read-only
--     with respect to the organizations table.
--   - service_role retains full access and bypasses RLS by design.
-- =============================================================================


-- 1. Enable and force RLS.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

-- 2. Revoke any blanket grants that might exist from prior DDL iterations.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.organizations FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.organizations FROM anon;

-- 3. Preserve service_role full access (used by the onboarding Server Action
--    admin client and the FastAPI ingest pipeline).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO service_role;

-- 4. Grant authenticated the minimum SELECT token so RLS can evaluate.
--    Without any grant, Postgres rejects the query before policies run.
GRANT SELECT ON public.organizations TO authenticated;

-- 5. Drop any legacy policy that might conflict.
DROP POLICY IF EXISTS "Org members can select organizations" ON public.organizations;

-- 6. SELECT policy: a user may only read the organizations row whose org_id
--    matches their own org_id, resolved via the private SECURITY DEFINER helper.
CREATE POLICY "Org members can select organizations"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (org_id = private.get_auth_org_id());


-- =============================================================================
-- Verification queries (run in Supabase SQL editor after applying):
-- =============================================================================

-- Confirm RLS is enabled and forced:
-- SELECT relname, relrowsecurity, relforcerowsecurity
-- FROM pg_class
-- WHERE relname = 'organizations';
-- Expected: relrowsecurity=true, relforcerowsecurity=true

-- Confirm the policy exists:
-- SELECT tablename, policyname, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'organizations';
-- Expected: authenticated | SELECT | (org_id = private.get_auth_org_id())

-- Confirm grants:
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'organizations';
-- Expected: service_role | SELECT/INSERT/UPDATE/DELETE
--           authenticated | SELECT
