-- ============================================================================
-- 0006 — medication tracker (new feature).
--
-- ADDITIVE ONLY: two new tables. No existing table, column, policy, grant or
-- function is altered. Medication data is health data, so it follows the same
-- pattern as appointments: sensitive free text is AES-256-GCM encrypted by the
-- Edge Function, RLS scopes every row to its owner, and clients get only the
-- privileges their policies actually need.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- medications — one row per medicine the user tracks.
--   name / dose / note are CIPHERTEXT (written by the medications function).
--   times  : local HH:MM strings, one per daily dose (e.g. {08:00,20:00})
--   stock_left : tablets remaining; hits 0 = finished
--   refill_at  : reorder threshold; stock_left <= refill_at = time to order
-- ---------------------------------------------------------------------------
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,            -- ciphertext
  dose text,                     -- ciphertext
  note text,                     -- ciphertext ("After breakfast")
  times text[] not null default '{}',
  stock_left int not null default 0 check (stock_left >= 0),
  refill_at int not null default 5 check (refill_at >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index medications_user_idx on public.medications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- medication_doses — one row per scheduled dose the user has acted on.
-- No free text, so nothing here needs encrypting.
-- ---------------------------------------------------------------------------
create table public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  due_date date not null,
  due_time text not null,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  unique (medication_id, due_date, due_time)
);
create index medication_doses_user_day_idx on public.medication_doses (user_id, due_date);

-- ============================================================================
-- RLS — owner-read only; all writes go through the Edge Function (service role)
-- ============================================================================
alter table public.medications      enable row level security;
alter table public.medication_doses enable row level security;

create policy medications_select_own on public.medications
  for select using (auth.uid() = user_id);
create policy medication_doses_select_own on public.medication_doses
  for select using (auth.uid() = user_id);

-- ============================================================================
-- Explicit privileges (same discipline as 0003 — never rely on defaults)
-- ============================================================================
grant select on public.medications      to authenticated;
grant select on public.medication_doses to authenticated;
-- anon gets nothing on either table.

grant all privileges on public.medications      to service_role;
grant all privileges on public.medication_doses to service_role;

-- ---------------------------------------------------------------------------
-- toggle_medication_dose — flip a dose and move stock in ONE transaction, so
-- stock can never drift from the tick state and can never go below zero.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_medication_dose(
  p_user_id uuid,
  p_medication_id uuid,
  p_due_date date,
  p_due_time text,
  p_taken boolean
)
returns table (taken boolean, stock_left int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_med public.medications%rowtype;
  v_existing public.medication_doses%rowtype;
  v_was_taken boolean;
begin
  select * into v_med from public.medications m
  where m.id = p_medication_id and m.user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0006';
  end if;

  select * into v_existing from public.medication_doses d
  where d.medication_id = p_medication_id and d.due_date = p_due_date and d.due_time = p_due_time
  for update;
  v_was_taken := coalesce(v_existing.taken_at is not null, false);

  insert into public.medication_doses (user_id, medication_id, due_date, due_time, taken_at)
  values (p_user_id, p_medication_id, p_due_date, p_due_time,
          case when p_taken then now() else null end)
  on conflict (medication_id, due_date, due_time)
  do update set taken_at = case when p_taken then now() else null end;

  -- Only move stock when the tick state actually changed.
  if p_taken and not v_was_taken then
    update public.medications m set stock_left = greatest(m.stock_left - 1, 0) where m.id = p_medication_id;
  elsif not p_taken and v_was_taken then
    update public.medications m set stock_left = m.stock_left + 1 where m.id = p_medication_id;
  end if;

  select m.stock_left into stock_left from public.medications m where m.id = p_medication_id;
  taken := p_taken;
  return next;
end;
$$;

revoke execute on function public.toggle_medication_dose(uuid, uuid, date, text, boolean)
  from public, anon, authenticated;
grant execute on function public.toggle_medication_dose(uuid, uuid, date, text, boolean)
  to service_role;
