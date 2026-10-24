-- OPTIONAL: avatar storage for the profile editor (2026-10-24, M4.5).
--
-- Creates a PUBLIC "avatars" bucket and policies scoped so authenticated
-- users can upload/update/delete only under their own prefix
-- (avatars/<uid>/...) while anyone may read. Public signup stays closed;
-- accounts are admin-created, so authenticated = operator-provisioned users.
-- Idempotent; apply with the other migrations (supabase db push / SQL editor).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read of avatars.
create policy "public read avatars"
on storage.objects for select
using (bucket_id = 'avatars');

-- Authenticated users manage only their own prefix.
create policy "user upload own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "user update own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "user delete own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
