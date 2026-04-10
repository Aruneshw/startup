insert into storage.buckets (id, name, public) values ('workspace-files', 'workspace-files', true) on conflict do nothing;
create policy "Give users access to own folder" on storage.objects for all using ( bucket_id = 'workspace-files' );
