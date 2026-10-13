-- Helper function to quickly set up a user role after creating them in Auth

create or replace function public.setup_user(
  p_email text,
  p_full_name text,
  p_role text,
  p_owner_id text default null
)
returns table(user_id uuid, email text, role text, owner_id text) as $$
declare
  v_user_id uuid;
  v_role public.user_role;
begin
  -- Get the user ID from their email
  select id into v_user_id
  from auth.users
  where email = p_email;

  if v_user_id is null then
    raise exception 'User with email % not found in Auth', p_email;
  end if;

  -- Validate role
  if p_role not in ('accountant', 'owner', 'admin') then
    raise exception 'Invalid role: %. Must be accountant, owner, or admin', p_role;
  end if;

  -- Create/update profile
  insert into public.profiles (id, full_name, role, is_active)
  values (v_user_id, p_full_name, p_role::public.user_role, true)
  on conflict (id) do update
  set full_name = p_full_name, role = p_role::public.user_role, is_active = true;

  -- If owner, link to owner record
  if p_role = 'owner' then
    if p_owner_id is null then
      raise exception 'owner_id is required for owner role';
    end if;

    if not exists (select 1 from public.owners where id = p_owner_id) then
      raise exception 'Owner % does not exist', p_owner_id;
    end if;

    update auth.users
    set raw_app_meta_data = raw_app_meta_data || format('{"owner_id":"%s"}', p_owner_id)::jsonb
    where id = v_user_id;
  end if;

  return query
  select v_user_id, p_email, p_role, p_owner_id;
end;
$$ language plpgsql;

-- USAGE EXAMPLES:
-- For accountant:
--   select * from public.setup_user('newuser@example.com', 'John Accountant', 'accountant');
--
-- For owner:
--   select * from public.setup_user('owner@example.com', 'Ali Raza', 'owner', 'owner-ali');
--
-- For admin:
--   select * from public.setup_user('admin@example.com', 'Admin User', 'admin');
