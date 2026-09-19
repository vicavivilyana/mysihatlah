-- ============================================================================
-- Atomic welcome-kit claim + scheduled data retention.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- claim_welcome_kit: everything in ONE transaction so the one-per-user rule,
-- stock decrement, survey record and audit entry can't drift apart.
-- Called only by the claim-kit Edge Function (service role). Sensitive survey
-- fields arrive already encrypted (ciphertext) from the function.
-- ---------------------------------------------------------------------------
create or replace function public.claim_welcome_kit(
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
begin
  -- Lock the machine row for the duration of the transaction.
  select * into v_machine from public.machines
  where machine_id = p_machine_code for update;

  if not found or v_machine.active = false then
    raise exception 'invalid_machine' using errcode = 'P0001';
  end if;

  if v_machine.stock_count <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0002';
  end if;

  v_hospital_id := coalesce(v_machine.hospital_id, p_hospital_id);
  v_location := coalesce(v_machine.location_name, p_location);
  select name into v_hospital_name from public.hospitals where id = v_hospital_id;

  -- One kit per user, for life. UNIQUE(user_id) turns a second claim into a
  -- unique_violation, which we translate to a clean 'already_claimed' error.
  begin
    insert into public.kit_claims
      (user_id, hospital_id, machine_id, status, release_token, token_expires_at)
    values
      (p_user_id, v_hospital_id, p_machine_code, 'released', p_token, p_token_expires)
    returning id into claim_id;
  exception when unique_violation then
    raise exception 'already_claimed' using errcode = 'P0003';
  end;

  -- Record the survey tied to this claim + hospital context.
  insert into public.survey_responses
    (user_id, hospital_id, machine_id, q1_for_whom, q2_age, q3_department, q4_need, q4_other_text, scanned_at)
  values
    (p_user_id, v_hospital_id, p_machine_code, p_q1, p_q2, p_q3_enc, p_q4_enc, p_q4other_enc, p_scanned_at);

  -- Decrement stock atomically (row already locked).
  update public.machines set stock_count = stock_count - 1 where id = v_machine.id;

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

-- ---------------------------------------------------------------------------
-- Data minimization / retention cleanup. Run on a schedule (pg_cron below).
--   * expire OTP codes past their TTL
--   * expire unredeemed release tokens
--   * purge appointments + survey responses older than the retention window
-- ---------------------------------------------------------------------------
create or replace function public.run_retention_cleanup(p_appt_retention_days int default 365)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- OTPs: delete anything expired (or already used) more than 1 day ago.
  delete from public.otp_codes where expires_at < now() - interval '1 day';

  -- Release tokens: expire pending/expired claims whose token TTL passed.
  update public.kit_claims
    set status = 'expired', release_token = null
  where status = 'pending' and token_expires_at is not null and token_expires_at < now();

  -- Old appointments beyond retention window (images are removed separately by
  -- the delete-my-account function / a storage lifecycle rule).
  delete from public.appointments where created_at < now() - make_interval(days => p_appt_retention_days);

  insert into public.audit_log (action, target_table, meta)
  values ('retention_cleanup', 'multiple', jsonb_build_object('ran_at', now()));
end;
$$;

-- Schedule daily at 03:00 UTC if pg_cron is available (Supabase hosted).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('healthgo-retention', '0 3 * * *', $cron$select public.run_retention_cleanup();$cron$);
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end;
$$;
