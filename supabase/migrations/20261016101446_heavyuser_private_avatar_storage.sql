
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('heavyuser-avatars','heavyuser-avatars',false,2097152,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp']::text[];

create policy "HeavyUser avatar read own" on storage.objects for select to authenticated
using (bucket_id='heavyuser-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "HeavyUser avatar upload own" on storage.objects for insert to authenticated
with check (bucket_id='heavyuser-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "HeavyUser avatar update own" on storage.objects for update to authenticated
using (bucket_id='heavyuser-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='heavyuser-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "HeavyUser avatar delete own" on storage.objects for delete to authenticated
using (bucket_id='heavyuser-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
