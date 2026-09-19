-- ============================================================================
-- 0005 — phone-displayed QR release.
--
-- The dispenser no longer shows a QR for the phone to scan; the phone shows a
-- QR that the machine's scanner reads. Two changes support that:
--
--   1. claim_welcome_kit now also returns hospital_id, because the QR payload
--      embeds it. Claim semantics are otherwise UNCHANGED (one-per-user,
--      machine lock, stock guard, survey + consents + audit, all in one txn).
--   2. reissue_release_token lets a user re-display a QR for a claim that was
--      never dispensed (token expired, or app closed). It mints a fresh token
--      on the SAME claim row — it never decrements stock and never creates a
--      second claim, so a user can still only ever receive one kit.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. claim_welcome_kit v3 — identical logic, returns hospital_id as well.
--    (Return type changes, so the function must be dropped and recreated.)
-- ---------------------------------------------------------------------------
drop function if exists public.claim_welcome_kit(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean, text, text, timestamptz);

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
  hospital_id text,
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
  -- One kit per user, for life — checked first so a repeat claim never touches
  -- machine stock. (UNIQUE(user_id) below is the concurrency backstop.)
  if exists (select 1 from public.kit_claims kc where kc.user_id = p_user_id) then
    raise exception 'already_claimed' using errcode = 'P0003';
  end if;

  select * into v_machine from public.machines m
  where m.machine_id = p_machine_code for update;

  if not found or v_machine.active = false then
    raise exception 'invalid_machine' using errcode = 'P0001';
  end if;
  if v_machine.stock_count <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0002';
  end if;

  v_hospital_id := coalesce(v_machine.hospital_id, p_hospital_id);
  v_location := coalesce(v_machine.location_name, p_location);
  select h.name into v_hospital_name from public.hospitals h where h.id = v_hospital_id;

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

  insert into public.consents (user_id, purpose, granted, policy_version) values
    (p_user_id, 'terms_privacy', true, p_policy_version),
    (p_user_id, 'marketing', coalesce(p_marketing_opt_in, false), p_policy_version);

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
  hospital_id := v_hospital_id;
  hospital_name := coalesce(v_hospital_name, v_hospital_id);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. reissue_release_token — new QR for an UNDISPENSED claim.
--    Refuses once the kit has actually been released, so it can never yield a
--    second kit. No stock movement: the stock was taken at claim time.
-- ---------------------------------------------------------------------------
create or replace function public.reissue_release_token(
  p_user_id uuid,
  p_token text,
  p_token_expires timestamptz
)
returns table (
  claim_id uuid,
  machine_id text,
  location_name text,
  hospital_id text,
  hospital_name text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_claim public.kit_claims%rowtype;
  v_machine public.machines%rowtype;
  v_hospital_name text;
begin
  select * into v_claim from public.kit_claims kc
  where kc.user_id = p_user_id for update;

  if not found then
    raise exception 'no_claim' using errcode = 'P0004';
  end if;

  -- Already physically dispensed → nothing to re-show.
  if v_claim.released_at is not null or v_claim.status = 'released' then
    raise exception 'already_dispensed' using errcode = 'P0005';
  end if;

  -- Fresh token on the SAME claim; back to 'pending' if retention expired it.
  update public.kit_claims kc
     set release_token = p_token,
         token_expires_at = p_token_expires,
         status = 'pending'
   where kc.id = v_claim.id;

  select * into v_machine from public.machines m where m.machine_id = v_claim.machine_id;
  select h.name into v_hospital_name from public.hospitals h where h.id = v_claim.hospital_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, meta)
  values (p_user_id, 'kit_token_reissued', 'kit_claims', v_claim.id::text,
    jsonb_build_object('machine_id', v_claim.machine_id, 'previous_status', v_claim.status));

  claim_id := v_claim.id;
  machine_id := v_claim.machine_id;
  location_name := coalesce(v_machine.location_name, '');
  hospital_id := coalesce(v_claim.hospital_id, '');
  hospital_name := coalesce(v_hospital_name, v_claim.hospital_id, '');
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Privileges: service_role only (Edge Functions). Never client-callable.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_welcome_kit(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_welcome_kit(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean, text, text, timestamptz)
  to service_role;

revoke execute on function public.reissue_release_token(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reissue_release_token(uuid, text, timestamptz)
  to service_role;
