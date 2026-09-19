-- ============================================================================
-- 0004 — schema/code alignment + fully transactional claim.
--
-- Audit of every Edge Function insert/select/RPC against migrations 0001–0003:
--   otp-request      inserts otp_codes(phone, code_hash, name, email, expires_at)
--                    -> name/email exist in 0001 as shipped here, but a hosted
--                       DB created from an earlier draft of 0001 lacks them.
--                       Added idempotently below.
--   otp-verify       selects otp_codes(id, code_hash, name, email, expires_at,
--                    attempts), updates attempts/used; upserts profiles
--                    (id, name, phone, email)                          -> OK
--   claim-kit        rpc claim_welcome_kit(...)  -> signature CHANGES here:
--                    consents were inserted OUTSIDE the transaction by the
--                    function; they now go inside (new params below).
--   dispenser-release update kit_claims(status, released_at) where
--                    release_token/status='pending'/token_expires_at -> requires
--                    claims to start as 'pending' (they were inserted as
--                    'released'). Fixed in the new function body.
--   save/list-appointments  appointments(clinic_name, followup_at, pickup_at,
--                    reference_no, raw_ocr_text, image_path)          -> OK
--   export/delete    profiles/survey_responses/kit_claims/appointments/
--                    consents/audit_log                               -> OK
--   seed-demo        hospitals(id,name,code,active),
--                    machines(machine_id,hospital_id,location_name,lat,lng,
--                    stock_count,active)                              -> OK
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. otp_codes: registration details captured at request time (idempotent)
-- ---------------------------------------------------------------------------
alter table public.otp_codes add column if not exists name text;
alter table public.otp_codes add column if not exists email text;

-- ---------------------------------------------------------------------------
-- 2. claim_welcome_kit v2 — ONE transaction:
--      existing-claim check -> machine row lock -> stock check ->
--      claim (status 'pending') -> survey -> consents (terms + marketing) ->
--      guarded stock decrement -> audit -> return.
--    Concurrency: SELECT ... FOR UPDATE serialises claims per machine; the
--    UPDATE ... WHERE stock_count > 0 guard + UNIQUE(user_id) are the DB-level
--    backstops. Business failures raise named errors the function maps to
--    clean client reasons (never a 500).
-- ---------------------------------------------------------------------------
drop function if exists public.claim_welcome_kit(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, timestamptz);

create function public.claim_welcome_kit(
  p_user_id uuid,
  p_machine_code text,
  p_hospital_id text,
  p_location text,
  p_issued_at timestamptz,
  p_scanned_at timestamptz,
  p_q1 text,
  p_q2 text,
  p_q3_enc text,
  p_q4_enc text,
  p_q4other_enc text,
  p_marketing_opt_in boolean,
  p_policy_version text,
  p_token text,
  p_token_expires timestamptz
)
returns table (
  claim_id uuid,
  machine_id text,
  location_name text,
  hospital_name text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_machine public.machines%rowtype;
  v_hospital_id text;
  v_hospital_name text;
  v_location text;
  v_rows int;
begin
  -- One kit per user, for life — check first so a repeat claim never touches
  -- machine stock. (UNIQUE(user_id) below is the concurrency backstop.)
  if exists (select 1 from public.kit_claims where user_id = p_user_id) then
    raise exception 'already_claimed' using errcode = 'P0003';
  end if;

  -- Lock the machine row for the rest of the transaction.
  select * into v_machine from public.machines
  where machines.machine_id = p_machine_code for update;

  if not found or v_machine.active = false then
    raise exception 'invalid_machine' using errcode = 'P0001';
  end if;
  if v_machine.stock_count <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0002';
  end if;

  v_hospital_id := coalesce(v_machine.hospital_id, p_hospital_id);
  v_location := coalesce(v_machine.location_name, p_location);
  select name into v_hospital_name from public.hospitals h where h.id = v_hospital_id;

  begin
    insert into public.kit_claims
      (user_id, hospital_id, machine_id, status, release_token, token_expires_at)
    values
      (p_user_id, v_hospital_id, p_machine_code, 'pending', p_token, p_token_expires)
    returning id into claim_id;
  exception when unique_violation then
    raise exception 'already_claimed' using errcode = 'P0003';
  end;

  insert into public.survey_responses
    (user_id, hospital_id, machine_id, q1_for_whom, q2_age, q3_department, q4_need, q4_other_text, scanned_at)
  values
    (p_user_id, v_hospital_id, p_machine_code, p_q1, p_q2, p_q3_enc, p_q4_enc, p_q4other_enc, p_scanned_at);

  -- Consents recorded in the same transaction: mandatory + optional, separately.
  insert into public.consents (user_id, purpose, granted, policy_version) values
    (p_user_id, 'terms_privacy', true, p_policy_version),
    (p_user_id, 'marketing', coalesce(p_marketing_opt_in, false), p_policy_version);

  -- Guarded decrement: can never go below zero even under concurrency.
  update public.machines set stock_count = stock_count - 1
  where id = v_machine.id and stock_count > 0;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'out_of_stock' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, meta)
  values (p_user_id, 'kit_claimed', 'kit_claims', claim_id::text,
    jsonb_build_object('machine_id', p_machine_code, 'hospital_id', v_hospital_id,
                       'issued_at', p_issued_at, 'scanned_at', p_scanned_at));

  machine_id := p_machine_code;
  location_name := v_location;
  hospital_name := coalesce(v_hospital_name, v_hospital_id);
  return next;
end;
$$;

-- Explicit privileges (0003's default privileges also cover this, but be explicit).
revoke execute on function public.claim_welcome_kit(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_welcome_kit(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean, text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Lookup index for dispenser redemption (token is already UNIQUE via the
--    partial index in 0001; this covers the status/expiry guard columns).
-- ---------------------------------------------------------------------------
create index if not exists kit_claims_pending_token_idx
  on public.kit_claims (release_token, token_expires_at) where status = 'pending';
