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
-- Storage bucket for uploaded manuscript files (.docx).
-- Paste into Supabase Studio > SQL Editor after 0001_init.sql.

insert into storage.buckets (id, name, public)
values ('manuscripts', 'manuscripts', false)
on conflict (id) do nothing;

create policy "authenticated staff can read manuscript files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'manuscripts');

create policy "authenticated staff can upload manuscript files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'manuscripts');
-- Adds soft-delete support to manuscripts (DELETE /api/manuscripts/:id).
-- Paste into Supabase Studio > SQL Editor after 0001 and 0002.

alter table public.manuscripts
  add column deleted_at timestamptz;

create index manuscripts_deleted_at_idx on public.manuscripts (deleted_at);
-- Makes the advertised 50MB upload cap real at the storage layer, and lets a
-- staff member remove their own object when the screening request that should
-- have recorded it never completed.
-- Paste into Supabase Studio > SQL Editor after 0001-0003.

update storage.buckets
  set file_size_limit = 52428800 -- 50MB, matching MAX_UPLOAD_SIZE_BYTES
  where id = 'manuscripts';

-- Keys are built as "<user id>/<uuid>.docx", so the first path segment is the
-- owner. Scoping the policy to that segment keeps one account from deleting
-- another's manuscript file.
create policy "staff can delete their own manuscript files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'manuscripts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- Reference verification — checking each bibliography entry against open
-- bibliographic registries (Crossref, OpenAlex, OpenLibrary) and, for cited
-- web pages, against the link itself.
-- Paste into Supabase Studio > SQL Editor after 0001-0004.

-- ============================================================
-- reference_check_runs — one row per verification pass over a
-- manuscript version. Kept separate from screening_runs because
-- verification depends on third-party APIs and the network, so it
-- is re-runnable on demand and must never be mistaken for part of
-- the deterministic rule tally.
-- ============================================================

create table public.reference_check_runs (
  id uuid primary key default gen_random_uuid(),
  manuscript_version_id uuid not null
    references public.manuscript_versions(id) on delete cascade,
  -- Which sources and thresholds produced this run, so a stored result can be
  -- read back knowing the logic behind it (the role rule_set_version plays for
  -- screening).
  source_set_version text not null,
  total_references integer not null default 0,
  started_at timestamptz not null default now(),
  -- Null while batches are still being processed. The client verifies in
  -- batches so no single request runs long enough to hit a serverless
  -- function's execution limit.
  completed_at timestamptz
);

create index reference_check_runs_version_idx
  on public.reference_check_runs (manuscript_version_id, started_at desc);

alter table public.reference_check_runs enable row level security;

create policy "authenticated staff can manage reference check runs"
  on public.reference_check_runs for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- reference_checks — one row per bibliography entry. Inserted up
-- front with verdict 'pending' so the run's size is known before
-- any lookup happens, then updated batch by batch.
-- ============================================================

create table public.reference_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null
    references public.reference_check_runs(id) on delete cascade,
  -- 1-based position in the reference list, as a reviewer would count it.
  entry_index integer not null,
  raw_text text not null,
  kind text not null
    check (kind in ('journal', 'book', 'regulation', 'web', 'unknown')),
  doi text,
  url text,
  title text,
  cited_year text,

  -- 'pending' is a storage state, not a verdict: it marks a row whose lookup
  -- has not run yet.
  verdict text not null default 'pending'
    check (verdict in (
      'pending', 'verified', 'doi_invalid', 'metadata_mismatch',
      'url_unreachable', 'regulation_inconsistent', 'not_found',
      'not_verifiable', 'check_failed'
    )),
  confidence text check (confidence in ('high', 'medium', 'low')),
  note text,

  -- The record a source returned, kept so a reviewer can see what the verdict
  -- was based on instead of having to trust it.
  match_source text
    check (match_source in ('crossref', 'openalex', 'openlibrary', 'url', 'structure')),
  match_title text,
  match_year text,
  match_url text,
  match_similarity real,

  checked_at timestamptz,
  unique (run_id, entry_index)
);

create index reference_checks_run_id_idx on public.reference_checks (run_id);
-- Supports "fetch the next batch still to be looked up".
create index reference_checks_pending_idx
  on public.reference_checks (run_id, entry_index)
  where verdict = 'pending';

alter table public.reference_checks enable row level security;

create policy "authenticated staff can manage reference checks"
  on public.reference_checks for all
  to authenticated
  using (true)
  with check (true);
