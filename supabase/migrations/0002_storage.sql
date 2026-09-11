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
