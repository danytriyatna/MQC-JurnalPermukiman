-- Adds soft-delete support to manuscripts (DELETE /api/manuscripts/:id).
-- Paste into Supabase Studio > SQL Editor after 0001 and 0002.

alter table public.manuscripts
  add column deleted_at timestamptz;

create index manuscripts_deleted_at_idx on public.manuscripts (deleted_at);
