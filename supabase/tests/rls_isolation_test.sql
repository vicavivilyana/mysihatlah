-- RLS + privilege + claim-transaction tests.
--  1. one user cannot read another user's data (RLS)
--  2. authenticated: 42501 on otp_codes/audit_log and on the privileged RPC
--  3. anon: 42501 on server-only tables; public read of hospitals allowed
--  4. service_role: can read/write server-only tables (explicit GRANTs, 0003)
--  5. claim_welcome_kit: pending status, consents inside the txn, stock guard,
--     already_claimed / out_of_stock, and one-time atomic release UPDATE
-- Run with: npm run sb:test
--
-- NOTE: pgTAP's 3-arg throws_ok(sql, errcode, ermsg) treats the 3rd arg as the
-- expected ERROR MESSAGE. Always use the 4-arg form (sql, errcode, ermsg, desc).
-- The suite runs against the live local DB, so every assertion keys on rows
-- THIS test inserted (synthetic ids/phones/hashes), never on live data.
begin;
select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'd@test.local')
on conflict do nothing;

-- Seed one appointment + survey + claim + consent for A and B (as postgres,
-- which bypasses RLS — simulating the service-role Edge Functions).
insert into public.appointments (user_id, clinic_name, followup_at)
values ('00000000-0000-0000-0000-00000000000a', 'A-Clinic', now()),
       ('00000000-0000-0000-0000-00000000000b', 'B-Clinic', now());
insert into public.survey_responses (user_id, q1_for_whom)
values ('00000000-0000-0000-0000-00000000000a', 'self'),
       ('00000000-0000-0000-0000-00000000000b', 'self');
insert into public.kit_claims (user_id, status)
values ('00000000-0000-0000-0000-00000000000a', 'released'),
       ('00000000-0000-0000-0000-00000000000b', 'released');
insert into public.consents (user_id, purpose, granted)
values ('00000000-0000-0000-0000-00000000000a', 'marketing', true),
       ('00000000-0000-0000-0000-00000000000b', 'marketing', true);
insert into public.otp_codes (phone, code_hash, expires_at)
values ('+60000000001', 'pgtap-seed-hash', now() + interval '5 min');

-- Medications for A and B (health data — owner-scoped like everything else).
insert into public.medications (id, user_id, name, dose, times, stock_left, refill_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'enc-A-med', 'enc-500mg', '{08:00}', 3, 5),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'enc-B-med', 'enc-10mg', '{09:00}', 30, 5);
insert into public.medication_doses (user_id, medication_id, due_date, due_time) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', current_date, '08:00'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', current_date, '09:00');


-- Helper: the dispenser's atomic redeem, as one guarded UPDATE, returning the
-- number of rows it claimed. (A data-modifying CTE cannot be used inside a
-- scalar subquery, so it lives in a function.) SECURITY INVOKER — it runs with
-- the privileges of whichever role calls it.
create function pg_temp.redeem(tok text) returns int language plpgsql as $fn$
declare n int;
begin
  update public.kit_claims set status = 'released', released_at = now()
  where release_token = tok and status = 'pending' and token_expires_at > now();
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- A dedicated test machine with stock 1.
insert into public.hospitals (id, name, code, active)
values ('pgtap-h', 'pgTAP Hospital', 'PGTAP', true) on conflict (id) do nothing;
insert into public.machines (machine_id, hospital_id, location_name, stock_count, active)
values ('PGTAP-M1', 'pgtap-h', 'Test bay', 1, true)
on conflict (machine_id) do update set stock_count = 1, active = true;

-- ===========================================================================
-- 1. Cross-user RLS as user A
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.appointments), 1, 'A sees only own appointment');
select is((select count(*)::int from public.appointments where clinic_name = 'B-Clinic'), 0, 'A cannot read B appointment');
select is((select count(*)::int from public.survey_responses), 1, 'A sees only own survey');
select is((select count(*)::int from public.kit_claims), 1, 'A sees only own claim');
select is((select count(*)::int from public.consents), 1, 'A sees only own consent');
select is((select count(*)::int from public.medications), 1, 'A sees only own medication');
select is((select count(*)::int from public.medications where name = 'enc-B-med'), 0, 'A cannot read B medication');
select is((select count(*)::int from public.medication_doses), 1, 'A sees only own medication doses');

-- ===========================================================================
-- 2. authenticated: server-only tables + privileged RPC → 42501
-- ===========================================================================
select throws_ok('select count(*) from public.otp_codes',
  '42501', 'permission denied for table otp_codes', 'authenticated cannot select otp_codes');
select throws_ok('select count(*) from public.audit_log',
  '42501', 'permission denied for table audit_log', 'authenticated cannot select audit_log');
select throws_ok($$insert into public.audit_log (action) values ('forged')$$,
  '42501', 'permission denied for table audit_log', 'authenticated cannot insert audit_log');
select throws_ok(
  $$select * from public.toggle_medication_dose(
      '00000000-0000-0000-0000-00000000000a'::uuid,
      '00000000-0000-0000-0000-0000000000a1'::uuid, current_date, '08:00', true)$$,
  '42501', 'permission denied for function toggle_medication_dose',
  'authenticated cannot execute toggle_medication_dose RPC');
select throws_ok(
  $$select * from public.claim_welcome_kit(
      '00000000-0000-0000-0000-00000000000a'::uuid, 'PGTAP-M1', null, null, null, now(),
      null, null, null, null, null, false, '2025-01', 'tok', now())$$,
  '42501', 'permission denied for function claim_welcome_kit',
  'authenticated cannot execute claim_welcome_kit RPC');

-- ===========================================================================
-- 3. anon
-- ===========================================================================
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select count(*) from public.otp_codes',
  '42501', 'permission denied for table otp_codes', 'anon cannot select otp_codes');
select throws_ok('select count(*) from public.audit_log',
  '42501', 'permission denied for table audit_log', 'anon cannot select audit_log');
select throws_ok($$insert into public.otp_codes (phone, code_hash, expires_at) values ('+6', 'x', now())$$,
  '42501', 'permission denied for table otp_codes', 'anon cannot insert otp_codes');
select lives_ok('select count(*) from public.hospitals', 'anon can select hospitals (RLS limits to active rows)');

-- ===========================================================================
-- 4. service_role: server-only tables
-- ===========================================================================
reset role;
set local role service_role;

select lives_ok(
  $$insert into public.otp_codes (phone, code_hash, expires_at)
    values ('+60000000002', 'pgtap-svc-hash', now() + interval '5 min')$$,
  'service_role can insert otp_codes');
select is(
  (select count(*)::int from public.otp_codes where code_hash in ('pgtap-seed-hash', 'pgtap-svc-hash')), 2,
  'service_role can select otp_codes');
select lives_ok(
  $$insert into public.audit_log (action, target_table) values ('pgtap', 'otp_codes')$$,
  'service_role can insert audit_log');

-- ===========================================================================
-- 5. Two-stage claim (0007): pending -> deposit -> finalize -> release.
--    claim_welcome_kit from 0004 is superseded; its service_role EXECUTE was
--    revoked in 0007 precisely so no pre-deposit path can issue a token.
-- ===========================================================================
select lives_ok(
  $$select * from public.create_pending_claim(
      '00000000-0000-0000-0000-00000000000c'::uuid, 'PGTAP-M1', null, null, now(),
      'self', '20to30', 'enc-q3', 'enc-q4', null, true, '2025-01')$$,
  'stage A: service_role can create a pending claim');

select is(
  (select status || '/' || coalesce(release_token, 'NULL') || '/' ||
          (select stock_count from public.machines m where m.machine_id = 'PGTAP-M1')::text
     from public.kit_claims where user_id = '00000000-0000-0000-0000-00000000000c'),
  'pending/NULL/1',
  'stage A issues NO token and takes NO stock');

select is(
  (select count(*)::int from public.consents where user_id = '00000000-0000-0000-0000-00000000000c'), 2,
  'stage A records terms + marketing consents');

select lives_ok(
  $$select * from public.finalize_kit_claim(
      '00000000-0000-0000-0000-00000000000c'::uuid, 'pgtap-token-c',
      now() + interval '60 seconds', 'mock', 2000, 'pgtap-ref')$$,
  'stage B: finalize issues the token and records the deposit');

select is(
  (select (select stock_count from public.machines m where m.machine_id = 'PGTAP-M1')::text || '/' ||
          (select status from public.deposits d where d.user_id = '00000000-0000-0000-0000-00000000000c')),
  '0/paid',
  'stage B decrements stock exactly once and records a paid deposit');

select throws_ok(
  $$select * from public.finalize_kit_claim(
      '00000000-0000-0000-0000-00000000000c'::uuid, 'tok2', now() + interval '60 seconds', 'mock', 2000, 'ref2')$$,
  'P0007', 'already_finalized', 'paying twice for the same claim is refused');

-- One-time atomic release: the guarded UPDATE succeeds exactly once.
select is(pg_temp.redeem('pgtap-token-c'), 1, 'guarded release UPDATE redeems a paid token once');
select is(pg_temp.redeem('pgtap-token-c'), 0, 'the same token cannot be redeemed twice');

reset role;
select * from finish();
rollback;
