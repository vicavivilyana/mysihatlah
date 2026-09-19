-- ============================================================================
-- Explicit table/sequence/function privileges.
--
-- WHY: migrations 0001/0002 never issued a GRANT; they silently relied on
-- Supabase's ALTER DEFAULT PRIVILEGES (which grant to anon/authenticated/
-- service_role only for objects created by a covered role). When that default
-- doesn't apply, even service_role — which bypasses RLS but NOT table-level
-- privileges — gets 42501 "permission denied for table otp_codes".
--
-- POLICY: every privilege is explicit here so local and hosted behave the
-- same. We first strip the broad platform defaults from anon/authenticated on
-- every existing public object, then grant back only what each RLS policy
-- (and the client's direct usage) actually needs. service_role gets everything,
-- now and for future objects.
--
-- NOTE: ALTER DEFAULT PRIVILEGES without FOR ROLE applies to objects created by
-- the role running this migration (postgres via the Supabase CLI), i.e. every
-- future migration-created table/sequence/function.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Schema access (explicit, not assumed)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Reset anon/authenticated to zero on all EXISTING public objects
-- ---------------------------------------------------------------------------
revoke all privileges on all tables    in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;
-- PUBLIC gets EXECUTE on functions by default; that would expose the
-- SECURITY DEFINER RPCs through PostgREST (/rest/v1/rpc) to any caller.
revoke all privileges on all functions in schema public from public;

-- Future objects: do NOT inherit the platform's broad anon/authenticated grants.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 2. service_role: full access, now and for future objects
--    (Edge Functions use the service role; RLS is bypassed but privileges
--    are still required.)
-- ---------------------------------------------------------------------------
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- ---------------------------------------------------------------------------
-- 3. authenticated: exactly the verbs each RLS policy covers on user-owned
--    tables. Inserts/updates that go through Edge Functions (service role)
--    are intentionally NOT granted here.
--
--    table             policies (0001)                 client does directly
--    profiles          select/insert/update own        select (AuthProvider)
--    survey_responses  select own                      select
--    kit_claims        select own                      select (getClaimStatus)
--    appointments      select/delete own               select, delete
--    consents          select/insert own               select, insert (setConsent)
-- ---------------------------------------------------------------------------
grant select, insert, update on public.profiles         to authenticated;
grant select                 on public.survey_responses to authenticated;
grant select                 on public.kit_claims       to authenticated;
grant select, delete         on public.appointments     to authenticated;
grant select, insert         on public.consents         to authenticated;

-- ---------------------------------------------------------------------------
-- 4. anon + authenticated: public read of hospitals/machines
--    (RLS restricts rows to active = true)
-- ---------------------------------------------------------------------------
grant select on public.hospitals to anon, authenticated;
grant select on public.machines  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. otp_codes + audit_log: server-only. NO grants to anon/authenticated
--    (revoked above). RLS stays enabled with no policies as defense in depth.
--    Any client access must fail with 42501, not merely return zero rows.
-- ---------------------------------------------------------------------------
-- (nothing to do — deliberately no grants)

-- ---------------------------------------------------------------------------
-- 6. Privileged RPCs are callable ONLY by service_role.
--    claim_welcome_kit / run_retention_cleanup are SECURITY DEFINER; exposing
--    them to authenticated via PostgREST would let a user call them directly.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_welcome_kit(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.run_retention_cleanup(int) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant  execute on function public.claim_welcome_kit(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, timestamptz)
  to service_role;
grant  execute on function public.run_retention_cleanup(int) to service_role;
