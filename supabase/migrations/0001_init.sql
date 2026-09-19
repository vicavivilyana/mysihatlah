-- ============================================================================
-- HealthGo — initial schema, RLS, and one-kit-per-user enforcement.
-- Sensitive fields (survey department/need, appointment clinic/ref/raw text)
-- are stored as ciphertext produced by the Edge Functions (AES-256-GCM).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  email text,
  lang text default 'en',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- otp_codes: server-only (no client RLS policy = no client access at all)
-- ---------------------------------------------------------------------------
create table public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  -- Registration details captured at request time, used to seed the profile
  -- on successful verification. Not client-readable (server-only table).
  name text,
  email text,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index otp_codes_phone_idx on public.otp_codes (phone, created_at desc);

-- ---------------------------------------------------------------------------
-- hospitals + machines: public read (active only)
-- ---------------------------------------------------------------------------
create table public.hospitals (
  id text primary key,
  name text not null,
  code text unique,
  active boolean not null default true
);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  machine_id text unique not null,
  hospital_id text references public.hospitals(id),
  location_name text,
  lat double precision,
  lng double precision,
  stock_count int not null default 0,
  active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- survey_responses: q3_department + q4_need stored ENCRYPTED (ciphertext text)
-- ---------------------------------------------------------------------------
create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hospital_id text,
  machine_id text,
  q1_for_whom text,
  q2_age text,
  q3_department text,        -- ciphertext
  q4_need text,              -- ciphertext
  q4_other_text text,        -- ciphertext (nullable)
  scanned_at timestamptz,
  created_at timestamptz not null default now()
);
create index survey_responses_user_idx on public.survey_responses (user_id);

-- ---------------------------------------------------------------------------
-- kit_claims: ONE welcome kit per user FOR LIFE (DB UNIQUE, not app logic)
-- ---------------------------------------------------------------------------
create table public.kit_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade, -- one per user, ever
  hospital_id text,
  machine_id text,
  status text not null default 'pending' check (status in ('pending', 'released', 'expired')),
  release_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create unique index kit_claims_release_token_idx on public.kit_claims (release_token) where release_token is not null;

-- ---------------------------------------------------------------------------
-- appointments: clinic_name / reference_no / raw_ocr_text stored ENCRYPTED
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_name text,          -- ciphertext
  followup_at timestamptz,
  pickup_at date,
  reference_no text,         -- ciphertext (nullable)
  image_path text,
  raw_ocr_text text,         -- ciphertext (nullable)
  created_at timestamptz not null default now()
);
create index appointments_user_idx on public.appointments (user_id, followup_at);

-- ---------------------------------------------------------------------------
-- consents: append-only history; latest row per purpose wins
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('terms_privacy', 'marketing')),
  granted boolean not null,
  policy_version text,
  created_at timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, purpose, created_at desc);

-- ---------------------------------------------------------------------------
-- audit_log: server-only writes; no client access
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_table text,
  target_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles          enable row level security;
alter table public.otp_codes         enable row level security;
alter table public.hospitals         enable row level security;
alter table public.machines          enable row level security;
alter table public.survey_responses  enable row level security;
alter table public.kit_claims        enable row level security;
alter table public.appointments      enable row level security;
alter table public.consents          enable row level security;
alter table public.audit_log         enable row level security;

-- profiles: owner full access
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- hospitals + machines: anyone (incl. anon) may read ACTIVE rows only
create policy hospitals_public_read on public.hospitals
  for select using (active = true);
create policy machines_public_read on public.machines
  for select using (active = true);

-- survey_responses: owner read only (writes via service role in Edge Function)
create policy survey_select_own on public.survey_responses
  for select using (auth.uid() = user_id);

-- kit_claims: owner read only (claims/releases via service role)
create policy kit_claims_select_own on public.kit_claims
  for select using (auth.uid() = user_id);

-- appointments: owner may read + delete own; inserts/updates via service role
create policy appointments_select_own on public.appointments
  for select using (auth.uid() = user_id);
create policy appointments_delete_own on public.appointments
  for delete using (auth.uid() = user_id);

-- consents: owner may read + insert own (append-only; no update/delete)
create policy consents_select_own on public.consents
  for select using (auth.uid() = user_id);
create policy consents_insert_own on public.consents
  for insert with check (auth.uid() = user_id);

-- NOTE: otp_codes and audit_log have RLS enabled with NO policies, so all
-- client access is denied. Only the service role (Edge Functions) can touch them.

-- ============================================================================
-- Private storage bucket for appointment card images (signed URLs only)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('appointment-cards', 'appointment-cards', false)
on conflict (id) do nothing;

-- Users may only work with objects inside their own uid-prefixed folder.
create policy appt_cards_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'appointment-cards' and (storage.foldername(name))[1] = auth.uid()::text);

create policy appt_cards_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'appointment-cards' and (storage.foldername(name))[1] = auth.uid()::text);

create policy appt_cards_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'appointment-cards' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- Auto-create a profile row when an auth user is created
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, email)
  values (new.id, new.phone, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
