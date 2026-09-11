-- MQC Assistant — initial schema
-- Paste this whole file into Supabase Studio > SQL Editor and run once.
-- Future schema changes should be added as new numbered files (0002_...sql),
-- not by editing this one.

create extension if not exists "pgcrypto";

-- ============================================================
-- profiles — 1:1 with auth.users, holds display name for staff
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by authenticated staff"
  on public.profiles for select
  to authenticated
  using (true);

-- Auto-create a profile row whenever a new auth user is created.
-- full_name is read from the user's metadata (set via Studio > Authentication
-- > Users > "User Metadata" as {"full_name": "Nama Staf"} when creating the
-- account); falls back to the email's local-part if not provided.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- manuscripts — one row per manuscript, carries a denormalized
-- summary of its current version's screening result so the
-- dashboard can query this table alone.
-- ============================================================

create table public.manuscripts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  original_file_name text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  status text not null default 'processing'
    check (status in ('processing', 'needs_revision', 'passed', 'processing_failed')),
  version_number integer not null default 1,
  total_rules_checked integer not null default 0,
  total_rules_passed integer not null default 0,
  error_findings integer not null default 0,
  warning_findings integer not null default 0,
  current_version_id uuid, -- FK added below, after manuscript_versions exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index manuscripts_updated_at_idx on public.manuscripts (updated_at desc);
create index manuscripts_status_idx on public.manuscripts (status);

alter table public.manuscripts enable row level security;

create policy "authenticated staff can manage manuscripts"
  on public.manuscripts for all
  to authenticated
  using (true)
  with check (true);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger manuscripts_set_updated_at
  before update on public.manuscripts
  for each row execute function public.set_updated_at();

-- ============================================================
-- manuscript_versions — full upload history per manuscript.
-- Not queried by the dashboard yet; ready for the upload/parsing
-- phase.
-- ============================================================

create table public.manuscript_versions (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  version_number integer not null,
  original_file_name text not null,
  file_storage_path text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  parse_status text not null default 'success'
    check (parse_status in ('success', 'partial', 'failed')),
  parse_error_message text,
  unique (manuscript_id, version_number)
);

alter table public.manuscripts
  add constraint manuscripts_current_version_fk
  foreign key (current_version_id) references public.manuscript_versions(id)
  on delete set null;

alter table public.manuscript_versions enable row level security;

create policy "authenticated staff can manage manuscript versions"
  on public.manuscript_versions for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- screening_runs — one row per automated screening pass over a
-- manuscript version.
-- ============================================================

create table public.screening_runs (
  id uuid primary key default gen_random_uuid(),
  manuscript_version_id uuid not null references public.manuscript_versions(id) on delete cascade,
  rule_set_version text not null,
  total_rules_checked integer not null default 0,
  total_rules_passed integer not null default 0,
  run_at timestamptz not null default now()
);

alter table public.screening_runs enable row level security;

create policy "authenticated staff can manage screening runs"
  on public.screening_runs for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- findings — individual rule-check results within a screening run.
-- ============================================================

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  screening_run_id uuid not null references public.screening_runs(id) on delete cascade,
  section text not null
    check (section in (
      'title_author', 'abstract', 'structure_heading',
      'tables_figures_equations', 'references_citation'
    )),
  rule_id text not null,
  severity text not null check (severity in ('error', 'warning')),
  check_type text not null check (check_type in ('automated', 'manual_review_suggested')),
  location text not null,
  current_value text not null,
  expected_value text not null,
  suggested_fix text not null
);

create index findings_screening_run_id_idx on public.findings (screening_run_id);

alter table public.findings enable row level security;

create policy "authenticated staff can manage findings"
  on public.findings for all
  to authenticated
  using (true)
  with check (true);
