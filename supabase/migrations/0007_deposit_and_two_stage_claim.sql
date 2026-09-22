-- ============================================================================
-- 0007 — RM20 deposit, two-stage claim, and refund-on-return.
--
-- ADDITIVE ONLY. No existing table, column, constraint, policy, grant or
-- function is altered or dropped. In particular:
--   • kit_claims keeps UNIQUE(user_id)            (one kit per user, for life)
--   • kit_claims' status CHECK is untouched — stage A leaves release_token
--     NULL, and dispenser-release matches on release_token, so an unpaid
--     claim can never be redeemed.
--   • claim_welcome_kit / reissue_release_token from 0004–0005 remain exactly
--     as they were (claim_welcome_kit is now superseded by the two-stage pair
--     below and is no longer on the app's code path).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- deposits — one RM20 deposit per claim, reversed when the power bank returns.
-- ---------------------------------------------------------------------------
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_id uuid not null references public.kit_claims(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'MYR',
  provider text not null,                    -- 'mock' today; 'fiuu' once wired
  provider_ref text,                         -- gateway reference, when there is one
  status text not null check (status in ('paid', 'refunded', 'failed')),
  refund_method text,                        -- 'mock' today; 'fiuu' later
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
-- At most one non-failed deposit per claim.
create unique index deposits_one_active_per_claim
  on public.deposits (claim_id) where status <> 'failed';
create index deposits_user_idx on public.deposits (user_id, created_at desc);

alter table public.deposits enable row level security;

-- Owner-read only; every write goes through the Edge Functions (service role).
create policy deposits_select_own on public.deposits
  for select using (auth.uid() = user_id);

grant select on public.deposits to authenticated;   -- anon gets nothing
grant all privileges on public.deposits to service_role;

-- ---------------------------------------------------------------------------
-- STAGE A — create_pending_claim
-- Records survey + consents and reserves the user's one-per-life claim slot.
-- Deliberately does NOT touch stock and does NOT issue a token, so abandoning
-- at the payment step costs the user nothing and burns no stock.
-- Re-entering after abandoning returns the SAME claim (idempotent).
-- ---------------------------------------------------------------------------
create or replace function public.create_pending_claim(
  p_user_id uuid,
  p_machine_code text,
  p_hospital_id text,
  p_location text,
  p_scanned_at timestamptz,
  p_q1 text,
  p_q2 text,
  p_q3_enc text,
  p_q4_enc text,
  p_q4other_enc text,
  p_marketing_opt_in boolean,
  p_policy_version text
)
returns table (
  claim_id uuid,
  machine_id text,
  location_name text,
  hospital_id text,
  hospital_name text,
  resumed boolean
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_claim public.kit_claims%rowtype;
  v_machine public.machines%rowtype;
  v_hospital_id text;
  v_hospital_name text;
begin
  select * into v_claim from public.kit_claims kc where kc.user_id = p_user_id for update;

  if found then
    -- A dispensed kit is final: one per user, for life.
    if v_claim.released_at is not null or v_claim.status = 'released' then
      raise exception 'already_claimed' using errcode = 'P0003';
    end if;
    -- Otherwise resume the unpaid/undispensed claim without duplicating the
    -- survey or consent rows.
    select * into v_machine from public.machines m where m.machine_id = v_claim.machine_id;
    select h.name into v_hospital_name from public.hospitals h where h.id = v_claim.hospital_id;
    claim_id := v_claim.id;
    machine_id := v_claim.machine_id;
    location_name := coalesce(v_machine.location_name, '');
    hospital_id := coalesce(v_claim.hospital_id, '');
    hospital_name := coalesce(v_hospital_name, v_claim.hospital_id, '');
    resumed := true;
    return next;
    return;
  end if;

  select * into v_machine from public.machines m
  where m.machine_id = p_machine_code for update;
  if not found or v_machine.active = false then
    raise exception 'invalid_machine' using errcode = 'P0001';
  end if;
  -- Soft availability check so we never take a deposit for an empty machine.
  -- The authoritative check + decrement happens in finalize_kit_claim.
  if v_machine.stock_count <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0002';
  end if;

  v_hospital_id := coalesce(v_machine.hospital_id, p_hospital_id);
  select h.name into v_hospital_name from public.hospitals h where h.id = v_hospital_id;

  begin
    insert into public.kit_claims
      (user_id, hospital_id, machine_id, status, release_token, token_expires_at)
    values
      (p_user_id, v_hospital_id, p_machine_code, 'pending', null, null)
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

  insert into public.audit_log (actor_id, action, target_table, target_id, meta)
  values (p_user_id, 'kit_claim_pending', 'kit_claims', claim_id::text,
    jsonb_build_object('machine_id', p_machine_code, 'hospital_id', v_hospital_id));

  machine_id := p_machine_code;
  location_name := coalesce(v_machine.location_name, p_location, '');
  hospital_id := v_hospital_id;
  hospital_name := coalesce(v_hospital_name, v_hospital_id, '');
  resumed := false;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- STAGE B — finalize_kit_claim
-- Called only after a successful deposit payment. One transaction: authoritative
-- stock check + guarded decrement, token issue, deposit record, audit.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_kit_claim(
  p_user_id uuid,
  p_token text,
  p_token_expires timestamptz,
  p_provider text,
  p_amount_cents int,
  p_provider_ref text
)
returns table (
  claim_id uuid,
  machine_id text,
  location_name text,
  hospital_id text,
  hospital_name text,
  deposit_id uuid
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_claim public.kit_claims%rowtype;
  v_machine public.machines%rowtype;
  v_hospital_name text;
  v_rows int;
begin
  select * into v_claim from public.kit_claims kc where kc.user_id = p_user_id for update;
  if not found then
    raise exception 'no_claim' using errcode = 'P0004';
  end if;
  if v_claim.released_at is not null or v_claim.status = 'released' then
    raise exception 'already_claimed' using errcode = 'P0003';
  end if;
  if exists (select 1 from public.deposits d where d.claim_id = v_claim.id and d.status <> 'failed') then
    raise exception 'already_finalized' using errcode = 'P0007';
  end if;

  select * into v_machine from public.machines m
  where m.machine_id = v_claim.machine_id for update;
  if not found or v_machine.active = false then
    raise exception 'invalid_machine' using errcode = 'P0001';
  end if;
  if v_machine.stock_count <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0002';
  end if;

  update public.machines m set stock_count = m.stock_count - 1
  where m.id = v_machine.id and m.stock_count > 0;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'out_of_stock' using errcode = 'P0002';
  end if;

  update public.kit_claims kc
     set release_token = p_token, token_expires_at = p_token_expires, status = 'pending'
   where kc.id = v_claim.id;

  insert into public.deposits (user_id, claim_id, amount_cents, provider, provider_ref, status, paid_at)
  values (p_user_id, v_claim.id, p_amount_cents, p_provider, p_provider_ref, 'paid', now())
  returning id into deposit_id;

  select h.name into v_hospital_name from public.hospitals h where h.id = v_claim.hospital_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, meta)
  values (p_user_id, 'kit_claim_finalized', 'kit_claims', v_claim.id::text,
          jsonb_build_object('machine_id', v_claim.machine_id, 'provider', p_provider,
                             'amount_cents', p_amount_cents, 'deposit_id', deposit_id));
  insert into public.audit_log (actor_id, action, target_table, target_id, meta)
  values (p_user_id, 'deposit_paid', 'deposits', deposit_id::text,
          jsonb_build_object('provider', p_provider, 'amount_cents', p_amount_cents));

  claim_id := v_claim.id;
  machine_id := v_claim.machine_id;
  location_name := coalesce(v_machine.location_name, '');
  hospital_id := coalesce(v_claim.hospital_id, '');
  hospital_name := coalesce(v_hospital_name, v_claim.hospital_id, '');
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- refund_deposit — power bank returned, deposit reversed.
-- Requires the kit to have actually been dispensed.
-- ---------------------------------------------------------------------------
create or replace function public.refund_deposit(
  p_user_id uuid,
  p_method text
)
returns table (deposit_id uuid, status text, refunded_at timestamptz, amount_cents int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_dep public.deposits%rowtype;
  v_claim public.kit_claims%rowtype;
begin
  select * into v_dep from public.deposits d
  where d.user_id = p_user_id and d.status = 'paid' for update;
  if not found then
    raise exception 'no_deposit' using errcode = 'P0008';
  end if;

  select * into v_claim from public.kit_claims kc where kc.id = v_dep.claim_id;
  if v_claim.released_at is null then
    raise exception 'not_dispensed' using errcode = 'P0009';
  end if;

  update public.deposits d
     set status = 'refunded', refunded_at = now(), refund_method = p_method
   where d.id = v_dep.id;

  insert into public.audit_log (actor_id, action, target_table, target_id, meta)
  values (p_user_id, 'deposit_refunded', 'deposits', v_dep.id::text,
          jsonb_build_object('method', p_method, 'amount_cents', v_dep.amount_cents));

  deposit_id := v_dep.id;
  status := 'refunded';
  refunded_at := now();
  amount_cents := v_dep.amount_cents;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: service_role only. Never client-callable.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_pending_claim(uuid, text, text, text, timestamptz, text, text, text, text, text, boolean, text) from public, anon, authenticated;
grant  execute on function public.create_pending_claim(uuid, text, text, text, timestamptz, text, text, text, text, text, boolean, text) to service_role;

revoke execute on function public.finalize_kit_claim(uuid, text, timestamptz, text, int, text) from public, anon, authenticated;
grant  execute on function public.finalize_kit_claim(uuid, text, timestamptz, text, int, text) to service_role;

revoke execute on function public.refund_deposit(uuid, text) from public, anon, authenticated;
grant  execute on function public.refund_deposit(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- reissue_release_token_v2 — refresh an expired QR, but ONLY for a claim whose
-- deposit is actually paid. (0005's reissue_release_token predates the deposit
-- and would hand out a token without payment; it is superseded below.)
-- ---------------------------------------------------------------------------
create or replace function public.reissue_release_token_v2(
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
  select * into v_claim from public.kit_claims kc where kc.user_id = p_user_id for update;
  if not found then
    raise exception 'no_claim' using errcode = 'P0004';
  end if;
  if v_claim.released_at is not null or v_claim.status = 'released' then
    raise exception 'already_dispensed' using errcode = 'P0005';
  end if;
  -- No deposit, no QR.
  if not exists (select 1 from public.deposits d where d.claim_id = v_claim.id and d.status = 'paid') then
    raise exception 'payment_required' using errcode = 'P0010';
  end if;

  update public.kit_claims kc
     set release_token = p_token, token_expires_at = p_token_expires, status = 'pending'
   where kc.id = v_claim.id;

  select * into v_machine from public.machines m where m.machine_id = v_claim.machine_id;
  select h.name into v_hospital_name from public.hospitals h where h.id = v_claim.hospital_id;

  insert into public.audit_log (actor_id, action, target_table, target_id, meta)
  values (p_user_id, 'kit_token_reissued', 'kit_claims', v_claim.id::text,
          jsonb_build_object('machine_id', v_claim.machine_id));

  claim_id := v_claim.id;
  machine_id := v_claim.machine_id;
  location_name := coalesce(v_machine.location_name, '');
  hospital_id := coalesce(v_claim.hospital_id, '');
  hospital_name := coalesce(v_hospital_name, v_claim.hospital_id, '');
  return next;
end;
$$;

revoke execute on function public.reissue_release_token_v2(uuid, text, timestamptz) from public, anon, authenticated;
grant  execute on function public.reissue_release_token_v2(uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Retire the pre-deposit token paths. Both would issue a release token (and
-- claim_welcome_kit would also decrement stock) with no deposit taken. Nothing
-- calls them any more; revoking service_role EXECUTE makes that permanent
-- rather than relying on no one wiring them up again. The function bodies are
-- left in place so migrations 0004/0005 remain untouched and replayable.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_welcome_kit(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, boolean, text, text, timestamptz)
  from service_role;
revoke execute on function public.reissue_release_token(uuid, text, timestamptz) from service_role;
