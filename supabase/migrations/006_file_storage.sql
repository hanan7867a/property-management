-- Run in the Supabase SQL Editor. Creates the private bucket the app uploads photos and PDFs to.
insert into storage.buckets (id, name, public, file_size_limit)
values ('kiraya-files', 'kiraya-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "kiraya_files_read" on storage.objects;
create policy "kiraya_files_read" on storage.objects
  for select to authenticated using (bucket_id = 'kiraya-files');

drop policy if exists "kiraya_files_insert" on storage.objects;
create policy "kiraya_files_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'kiraya-files');

drop policy if exists "kiraya_files_update" on storage.objects;
create policy "kiraya_files_update" on storage.objects
  for update to authenticated using (bucket_id = 'kiraya-files') with check (bucket_id = 'kiraya-files');

drop policy if exists "kiraya_files_delete" on storage.objects;
create policy "kiraya_files_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'kiraya-files');
