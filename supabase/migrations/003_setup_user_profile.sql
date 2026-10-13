-- Run in the Supabase SQL Editor.

-- 1. Let a signed-in user read only their own profile.
alter table public.profiles enable row level security;
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles
  for select to authenticated using (id = auth.uid());

-- 2. Create / fix the accountant profile (looked up by email, no UUID needed).
insert into public.profiles (id, full_name, role)
select id, 'Hanan', 'accountant'
from auth.users
where email = 'hananabdul3321@gmail.com'
on conflict (id) do update set role = 'accountant', is_active = true;

-- 3. Only signed-in users may touch app data (was open to anon).
do $$
declare t text;
begin
  foreach t in array array['plazas','units','tenants','rent_entries','payments','expenses','owner_payments','documents','notifications','activity_log']
  loop
    execute format('drop policy if exists "app_full_access" on public.%I', t);
    execute format('create policy "app_full_access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 4. To log an owner in, link their Auth user to an owner id used by the app
--    (owner-ali, owner-bilal, owner-hamza) and give them an owner profile:
-- update auth.users set raw_app_meta_data = raw_app_meta_data || '{"owner_id":"owner-ali"}'
--   where email = 'owner@example.com';
-- insert into public.profiles (id, full_name, role)
--   select id, 'Ali Raza', 'owner' from auth.users where email = 'owner@example.com'
--   on conflict (id) do update set role = 'owner';
