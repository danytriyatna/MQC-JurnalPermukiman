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
