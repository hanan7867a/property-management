-- Owners are referenced by text ids elsewhere in the app (e.g. plazas.ownership ->> 'ownerId'),
-- so this table uses a text id too, matching that convention instead of auth.users' uuid.
create table if not exists public.owners (
  id       text primary key,
  name     text not null,
  phone    text not null default '',
  bank     text not null default '',
  accounts jsonb
);

alter table public.owners enable row level security;

drop policy if exists "app_full_access" on public.owners;
create policy "app_full_access" on public.owners
  for all to authenticated using (true) with check (true);

-- Replace setup_user: check this table instead of the nonexistent one it referenced before.
create or replace function public.setup_user(
  p_email text,
  p_full_name text,
  p_role text,
  p_owner_id text default null
)
returns table(user_id uuid, email text, role text, owner_id text) as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then
    raise exception 'User with email % not found in Auth', p_email;
  end if;

  if p_role not in ('accountant', 'owner', 'admin') then
    raise exception 'Invalid role: %. Must be accountant, owner, or admin', p_role;
  end if;

  insert into public.profiles (id, full_name, role, is_active)
  values (v_user_id, p_full_name, p_role::public.user_role, true)
  on conflict (id) do update
  set full_name = p_full_name, role = p_role::public.user_role, is_active = true;

  if p_role = 'owner' then
    if p_owner_id is null then
      raise exception 'owner_id is required for owner role';
    end if;
    if not exists (select 1 from public.owners where id = p_owner_id) then
      raise exception 'Owner % does not exist. Add it from the app first (Properties > Add owner), or insert it into public.owners.', p_owner_id;
    end if;
    update auth.users
    set raw_app_meta_data = raw_app_meta_data || format('{"owner_id":"%s"}', p_owner_id)::jsonb
    where id = v_user_id;
  end if;

  return query select v_user_id, p_email, p_role, p_owner_id;
end;
$$ language plpgsql;

-- USAGE:
--   select * from public.setup_user('owner@example.com', 'Owner Name', 'owner', 'owner-id-from-the-app');
