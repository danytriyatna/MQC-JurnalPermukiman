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
