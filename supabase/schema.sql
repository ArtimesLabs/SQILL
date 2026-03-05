-- ============================================================
-- SQILL Schema — Run this in Supabase SQL Editor (fresh start)
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ============================================================
-- TENANTS
-- ============================================================
create table public.tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  llm_provider text not null default 'anthropic', -- 'anthropic' | 'openai'
  created_at timestamptz default now()
);

-- ============================================================
-- PROFILES (users → tenant)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  full_name text,
  avatar_url text,
  role text not null default 'recruiter', -- 'admin' | 'recruiter'
  created_at timestamptz default now()
);

-- ============================================================
-- CANDIDATES (CV pool)
-- ============================================================
create table public.candidates (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  full_name text,
  email text,
  storage_path text,                    -- path in Supabase Storage
  raw_text text,                        -- extracted text from PDF
  profile jsonb,                        -- structured CandidateProfile
  embedding vector(1536),               -- for pgvector pre-filter
  status text not null default 'pending', -- 'pending' | 'parsed' | 'error'
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- JOB ADS
-- ============================================================
create table public.job_ads (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  title text not null,
  raw_text text not null,
  profile jsonb,                        -- structured JobProfile
  embedding vector(1536),
  status text not null default 'pending', -- 'pending' | 'parsed' | 'error'
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- EVALUATIONS
-- ============================================================
create table public.evaluations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  job_ad_id uuid references public.job_ads(id) on delete cascade not null,
  candidate_id uuid references public.candidates(id) on delete cascade not null,
  result jsonb not null,               -- full evaluation result
  recommendation text not null,        -- 'STRONG SHORTLIST' | 'CONSIDER' | 'WEAK' | 'REJECT'
  score numeric(4,2),                  -- 0-100 derived from recommendation
  is_stale boolean default false,      -- true if job ad was edited after evaluation
  recruiter_override text,             -- manual bucket override
  created_at timestamptz default now(),
  unique(job_ad_id, candidate_id)
);

-- ============================================================
-- RLS POLICIES
-- ============================================================

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.candidates enable row level security;
alter table public.job_ads enable row level security;
alter table public.evaluations enable row level security;

-- Helper function: get current user's tenant_id
create or replace function public.get_tenant_id()
returns uuid
language sql stable
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

-- Tenants: users can only see their own tenant
create policy "tenant_select" on public.tenants
  for select using (id = public.get_tenant_id());

-- Profiles: users can see profiles in their tenant
create policy "profiles_select" on public.profiles
  for select using (tenant_id = public.get_tenant_id());

create policy "profiles_update" on public.profiles
  for update using (id = auth.uid());

-- Candidates: full CRUD within tenant
create policy "candidates_select" on public.candidates
  for select using (tenant_id = public.get_tenant_id());

create policy "candidates_insert" on public.candidates
  for insert with check (tenant_id = public.get_tenant_id());

create policy "candidates_update" on public.candidates
  for update using (tenant_id = public.get_tenant_id());

create policy "candidates_delete" on public.candidates
  for delete using (tenant_id = public.get_tenant_id());

-- Job ads: full CRUD within tenant
create policy "job_ads_select" on public.job_ads
  for select using (tenant_id = public.get_tenant_id());

create policy "job_ads_insert" on public.job_ads
  for insert with check (tenant_id = public.get_tenant_id());

create policy "job_ads_update" on public.job_ads
  for update using (tenant_id = public.get_tenant_id());

create policy "job_ads_delete" on public.job_ads
  for delete using (tenant_id = public.get_tenant_id());

-- Evaluations: full CRUD within tenant
create policy "evaluations_select" on public.evaluations
  for select using (tenant_id = public.get_tenant_id());

create policy "evaluations_insert" on public.evaluations
  for insert with check (tenant_id = public.get_tenant_id());

create policy "evaluations_update" on public.evaluations
  for update using (tenant_id = public.get_tenant_id());

create policy "evaluations_delete" on public.evaluations
  for delete using (tenant_id = public.get_tenant_id());

-- ============================================================
-- STORAGE BUCKET (CVs)
-- ============================================================
insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false);

create policy "cv_upload" on storage.objects
  for insert with check (
    bucket_id = 'cvs' and
    (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

create policy "cv_select" on storage.objects
  for select using (
    bucket_id = 'cvs' and
    (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

create policy "cv_delete" on storage.objects
  for delete using (
    bucket_id = 'cvs' and
    (storage.foldername(name))[1] = public.get_tenant_id()::text
  );

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger candidates_updated_at before update on public.candidates
  for each row execute function public.handle_updated_at();

create trigger job_ads_updated_at before update on public.job_ads
  for each row execute function public.handle_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  tenant_id uuid;
  tenant_slug text;
begin
  -- Create a new tenant for this user
  tenant_slug := lower(regexp_replace(
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 2)),
    '[^a-z0-9]', '-', 'g'
  )) || '-' || substr(new.id::text, 1, 8);

  insert into public.tenants (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    tenant_slug
  )
  returning id into tenant_id;

  -- Create profile linked to tenant
  insert into public.profiles (id, tenant_id, full_name, avatar_url, role)
  values (
    new.id,
    tenant_id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'admin'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
