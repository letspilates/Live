-- ============================================================================
-- Let's Pilates Admin Portal · Users: several roles each, ADMIN role, profile
-- details, and per-menu access for STAFF / INSTRUCTOR (Settings → Admin).
--
-- * staff_profiles.roles is the source of truth. The old single `role` column
--   stays, kept in sync as the highest role, so existing code keeps working.
-- * app.is_owner() now means "full access": OWNER or ADMIN. Only an OWNER may
--   give or take the OWNER role, or change / remove someone who has it.
-- * app.can(menu): OWNER/ADMIN always; STAFF/INSTRUCTOR when Settings → Admin
--   turns that menu on for one of their roles.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles and profile details
-- ---------------------------------------------------------------------------

alter table public.staff_profiles
  drop constraint staff_profiles_role_check,
  add constraint staff_profiles_role_check check (role in ('OWNER', 'ADMIN', 'STAFF', 'INSTRUCTOR')),
  add column roles text[] not null default '{}',
  add column phone text not null default '' check (length(phone) <= 50),
  add column address text not null default '' check (length(address) <= 300),
  add column certifications text not null default '' check (length(certifications) <= 1000),
  add column notes text not null default '' check (length(notes) <= 1000);

update public.staff_profiles set roles = array[role];

alter table public.staff_profiles
  add constraint staff_profiles_roles_check
  check (cardinality(roles) between 1 and 4 and roles <@ array['OWNER', 'ADMIN', 'STAFF', 'INSTRUCTOR']);

-- Highest first: OWNER, ADMIN, STAFF, INSTRUCTOR. `role` = roles[1].
create function app.sync_staff_role() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.roles is not distinct from old.roles and new.role is distinct from old.role then
    new.roles := array[new.role];   -- older single-role writers (set_staff_role, grant_owner)
  elsif coalesce(cardinality(new.roles), 0) = 0 then
    new.roles := array[new.role];
  end if;
  select array_agg(r order by array_position(array['OWNER', 'ADMIN', 'STAFF', 'INSTRUCTOR'], r))
    into new.roles
    from (select distinct unnest(new.roles) as r) x;
  new.role := new.roles[1];
  if not ('INSTRUCTOR' = any(new.roles)) then
    new.pricing_tier := null;      -- the tier only means something for instructors
  end if;
  return new;
end;
$$;

create trigger staff_profiles_sync_role
  before insert or update on public.staff_profiles
  for each row execute function app.sync_staff_role();

create function app.has_role(p_role text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff_profiles
                  where user_id = auth.uid() and status = 'ACTIVE' and p_role = any(roles));
$$;

-- Full access (owner or admin). Every owner-only policy and function uses this.
create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff_profiles
                  where user_id = auth.uid() and status = 'ACTIVE' and roles && array['OWNER', 'ADMIN']);
$$;

-- Admins manage everyone except owners; only an owner hands out or takes the OWNER role.
create function app.guard_owner_change(p_target uuid, p_new_roles text[] default null) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app.has_role('OWNER')
     and ('OWNER' = any(coalesce(p_new_roles, '{}'))
          or exists (select 1 from public.staff_profiles
                      where user_id = p_target and 'OWNER' = any(roles))) then
    raise exception 'Only an owner can change an owner account.' using errcode = '42501';
  end if;
end;
$$;

-- Earlier functions compared the caller's single role to OWNER; admins get the same rights.
do $$
declare
  r record;
begin
  for r in select p.oid from pg_catalog.pg_proc p
             join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'app') and p.prosrc like '%v_me.role <> ''OWNER''%'
  loop
    execute replace(pg_catalog.pg_get_functiondef(r.oid), 'v_me.role <> ''OWNER''', 'not app.is_owner()');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Menu access for STAFF / INSTRUCTOR (OWNER and ADMIN always have every menu)
-- ---------------------------------------------------------------------------

create table public.role_menu_access (
  role text not null check (role in ('STAFF', 'INSTRUCTOR')),
  menu text not null check (menu in ('schedule', 'clients', 'payments')),
  primary key (role, menu)
);

insert into public.role_menu_access (role, menu) values
  ('STAFF', 'schedule'), ('STAFF', 'clients'), ('STAFF', 'payments'),
  ('INSTRUCTOR', 'clients'), ('INSTRUCTOR', 'payments');

create trigger role_menu_access_audit
  after insert or update or delete on public.role_menu_access
  for each row execute function app.audit_row_change('menu');

alter table public.role_menu_access enable row level security;
revoke all on public.role_menu_access from public, anon, authenticated;
grant select on public.role_menu_access to authenticated;
create policy role_menu_access_select on public.role_menu_access
  for select to authenticated using ((select app.is_active_staff()));

create function app.can(p_menu text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_owner() or exists (
    select 1 from public.staff_profiles s
      join public.role_menu_access a on a.role = any(s.roles)
     where s.user_id = auth.uid() and s.status = 'ACTIVE' and a.menu = p_menu);
$$;

create function public.set_role_menu_access(p_role text, p_menu text, p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  if p_on then
    insert into public.role_menu_access (role, menu) values (p_role, p_menu) on conflict do nothing;
  else
    delete from public.role_menu_access where role = p_role and menu = p_menu;
  end if;
end;
$$;

-- Clients: whoever has the Clients menu may read the list (editing stays owner/admin).
drop policy students_select on public.students;
create policy students_select on public.students
  for select to authenticated using ((select app.can('clients')));

-- Payments: own records need the Payments menu; owners/admins see all.
-- ponytail: record_payment & co. still accept any active staff; the menu
-- switch hides the screen. Add app.can('payments') there if that matters.
drop policy payment_transactions_select on public.payment_transactions;
create policy payment_transactions_select on public.payment_transactions
  for select to authenticated
  using (((select auth.uid()) in (recorded_by, collected_by) and (select app.can('payments')))
         or (select app.is_owner()));

-- ---------------------------------------------------------------------------
-- Users (Settings → Users). Sign-in accounts are created by the staff-admin
-- Edge Function; these functions hold the rules.
-- ---------------------------------------------------------------------------

create function app.roles_of(p jsonb) returns text[]
language sql immutable set search_path = ''
as $$ select coalesce(array(select jsonb_array_elements_text(p -> 'roles')), '{}') $$;

-- p: full_name, roles[], phone, address, certifications, notes, pricing_tier.
-- p_user_id null = find the sign-in account by email (it already existed).
create function public.add_staff_user(p_user_id uuid, p_email text, p_invited boolean, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := p_user_id;
  v_roles text[] := app.roles_of(p);
begin
  perform app.require_owner();
  perform app.guard_owner_change(null, v_roles);
  if cardinality(v_roles) = 0 then
    raise exception 'Choose at least one role.' using errcode = '22023';
  end if;
  select id into v_user from auth.users
   where lower(email) = lower(btrim(p_email)) and (v_user is null or id = v_user);
  if v_user is null then
    raise exception 'No sign-in account with this email.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.staff_profiles where user_id = v_user) then
    raise exception 'This person is already a user.' using errcode = '23505';
  end if;
  insert into public.staff_profiles (
    user_id, email, full_name, roles, status, invited_at, pricing_tier, phone, address, certifications, notes)
  values (
    v_user, lower(btrim(p_email)), btrim(coalesce(p ->> 'full_name', '')), v_roles,
    case when p_invited then 'INVITED' else 'ACTIVE' end, case when p_invited then now() end,
    nullif(p ->> 'pricing_tier', ''), btrim(coalesce(p ->> 'phone', '')), btrim(coalesce(p ->> 'address', '')),
    btrim(coalesce(p ->> 'certifications', '')), btrim(coalesce(p ->> 'notes', '')));
  return v_user;
end;
$$;

create function public.update_staff_user(p_user_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_roles text[] := app.roles_of(p);
begin
  perform app.require_owner();
  perform app.guard_owner_change(p_user_id, v_roles);
  if cardinality(v_roles) = 0 then
    raise exception 'Choose at least one role.' using errcode = '22023';
  end if;
  if not ('OWNER' = any(v_roles)) then
    perform app.assert_keeps_an_owner(p_user_id);
  end if;
  update public.staff_profiles
     set full_name = btrim(coalesce(p ->> 'full_name', '')), roles = v_roles,
         pricing_tier = nullif(p ->> 'pricing_tier', ''),
         phone = btrim(coalesce(p ->> 'phone', '')), address = btrim(coalesce(p ->> 'address', '')),
         certifications = btrim(coalesce(p ->> 'certifications', '')), notes = btrim(coalesce(p ->> 'notes', ''))
   where user_id = p_user_id;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Removes a user who has no records. Anyone who recorded payments, expenses
-- or other history is deactivated instead, so that history stays attached.
create function public.delete_staff_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  perform app.guard_owner_change(p_user_id);
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account.' using errcode = '22023';
  end if;
  perform app.assert_keeps_an_owner(p_user_id);
  begin
    delete from public.staff_profiles where user_id = p_user_id;
  exception when foreign_key_violation then
    raise exception 'This person has records in the studio books. Deactivate them instead.' using errcode = 'LPREF';
  end;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Each user keeps their own contact details current (My account, first sign-in).
create function public.update_my_profile(p jsonb) returns void
language sql security definer set search_path = ''
as $$
  update public.staff_profiles
     set full_name = coalesce(nullif(btrim(p ->> 'full_name'), ''), full_name),
         phone = btrim(coalesce(p ->> 'phone', phone)), address = btrim(coalesce(p ->> 'address', address)),
         certifications = btrim(coalesce(p ->> 'certifications', certifications))
   where user_id = auth.uid();
$$;

drop function public.list_staff();
create function public.list_staff()
returns table (
  user_id uuid, full_name text, email text, role text, roles text[], status text, pricing_tier text,
  phone text, address text, certifications text, notes text,
  invited_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  return query
    select s.user_id, s.full_name, s.email, s.role, s.roles, s.status, s.pricing_tier,
           s.phone, s.address, s.certifications, s.notes, s.invited_at, u.last_sign_in_at
      from public.staff_profiles s
      left join auth.users u on u.id = s.user_id
     order by array_position(array['OWNER', 'ADMIN', 'STAFF', 'INSTRUCTOR'], s.role), s.status, s.full_name;
end;
$$;

-- Older single-purpose functions: same rules for admins (no touching owners).
create or replace function public.set_staff_role(p_user_id uuid, p_role text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  perform app.guard_owner_change(p_user_id, array[p_role]);
  if p_role not in ('OWNER', 'ADMIN', 'INSTRUCTOR', 'STAFF') then
    raise exception 'Unknown role.' using errcode = '22023';
  end if;
  if p_role <> 'OWNER' then
    perform app.assert_keeps_an_owner(p_user_id);
  end if;
  update public.staff_profiles set roles = array[p_role]
   where user_id = p_user_id and roles <> array[p_role];
  return found;
end;
$$;

create or replace function public.set_staff_status(p_user_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  perform app.guard_owner_change(p_user_id);
  if p_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'Status must be ACTIVE or INACTIVE.' using errcode = '22023';
  end if;
  if p_status = 'INACTIVE' then
    perform app.assert_keeps_an_owner(p_user_id);
  end if;
  update public.staff_profiles
     set status = p_status
   where user_id = p_user_id and status <> 'INVITED' and status <> p_status;
  return found;
end;
$$;

create or replace function public.add_staff_account(
  p_email text, p_full_name text, p_role text default 'INSTRUCTOR', p_pricing_tier text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.add_staff_user(null, p_email, false,
    jsonb_build_object('full_name', p_full_name, 'roles', jsonb_build_array(p_role), 'pricing_tier', p_pricing_tier));
end;
$$;

create or replace function public.cancel_staff_invite(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  perform app.guard_owner_change(p_user_id);
  delete from public.staff_profiles where user_id = p_user_id and status = 'INVITED';
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function
  app.sync_staff_role(), app.has_role(text), app.guard_owner_change(uuid, text[]), app.can(text),
  app.roles_of(jsonb), public.set_role_menu_access(text, text, boolean),
  public.add_staff_user(uuid, text, boolean, jsonb), public.update_staff_user(uuid, jsonb),
  public.delete_staff_user(uuid), public.update_my_profile(jsonb), public.list_staff(),
  public.set_staff_role(uuid, text), public.set_staff_status(uuid, text),
  public.add_staff_account(text, text, text, text), public.cancel_staff_invite(uuid)
from public, anon, authenticated;
grant execute on function
  app.can(text), app.has_role(text),
  public.set_role_menu_access(text, text, boolean),
  public.add_staff_user(uuid, text, boolean, jsonb), public.update_staff_user(uuid, jsonb),
  public.delete_staff_user(uuid), public.update_my_profile(jsonb), public.list_staff(),
  public.set_staff_role(uuid, text), public.set_staff_status(uuid, text),
  public.add_staff_account(text, text, text, text), public.cancel_staff_invite(uuid)
to authenticated;

select app.check_api_exposure();
