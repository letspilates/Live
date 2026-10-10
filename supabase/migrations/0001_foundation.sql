-- ============================================================================
-- Let's Pilates Admin Portal · 0001 foundation
-- Staff accounts (OWNER / INSTRUCTOR), audit log, permission helpers.
--
-- How to apply: Supabase Dashboard → SQL Editor → paste this whole file → Run.
-- Runs as one transaction: either everything is created or nothing is.
-- Then create the owner accounts (docs/admin/SETUP-KO.md, step 4).
--
-- Security model (ADMIN-PORTAL-MASTER-PLAN.md §I):
--   · Every table has Row Level Security. No policy = no access.
--   · API roles get only the grants listed here. anon gets nothing.
--   · Roles live in staff_profiles, which users cannot write to.
--   · Privileged changes go through functions that check the caller first.
-- ============================================================================

begin;

-- Internal helpers live in "app", which the Data API does not expose.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;  -- RLS policies call app.is_owner()

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.staff_profiles (
  user_id        uuid primary key references auth.users (id) on delete restrict,
  full_name      text not null check (char_length(btrim(full_name)) between 1 and 80),
  email          text not null,
  role           text not null check (role in ('OWNER', 'INSTRUCTOR')),
  status         text not null default 'INVITED' check (status in ('INVITED', 'ACTIVE', 'INACTIVE')),
  pricing_tier   text check (pricing_tier in ('CERTIFIED', 'MASTER')),
  invited_at     timestamptz,
  created_at     timestamptz not null default now()
);
create unique index staff_profiles_email_key on public.staff_profiles (lower(email));

-- Append-only history of every change to money, permission and settings tables
-- (who, when, before/after), so rows need no updated_at/updated_by columns.
create table public.audit_logs (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  actor_user_id uuid,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  before        jsonb,
  after         jsonb,
  reason        text
);

-- ---------------------------------------------------------------------------
-- Permission helpers (read the caller's own staff row; SECURITY DEFINER so
-- policies can call them without recursing into staff_profiles RLS)
-- ---------------------------------------------------------------------------

create function app.is_active_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles
     where user_id = auth.uid() and status = 'ACTIVE'
  );
$$;

create function app.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles
     where user_id = auth.uid() and status = 'ACTIVE' and role = 'OWNER'
  );
$$;

create function app.require_owner() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app.is_owner() then
    raise exception 'Only an active owner can do this.' using errcode = '42501';
  end if;
end;
$$;

-- Serializes owner-count checks so two owners cannot demote each other at once.
create function app.assert_keeps_an_owner(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('lp.staff.owner_guard'));
  if exists (select 1 from public.staff_profiles
              where user_id = p_user_id and role = 'OWNER' and status = 'ACTIVE')
     and (select count(*) from public.staff_profiles
           where role = 'OWNER' and status = 'ACTIVE') <= 1 then
    raise exception 'The studio needs at least one active owner.' using errcode = '23514';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit trigger
-- ---------------------------------------------------------------------------

-- tg_argv[0] = name of the primary key column to record as entity_id.
-- Functions may pass a reason with: set_config('app.reason', '...', true)
create function app.audit_row_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before, after, reason)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(v_new, v_old) ->> tg_argv[0], v_old, v_new,
          nullif(current_setting('app.reason', true), ''));
  return null;
end;
$$;

create trigger staff_profiles_audit
  after insert or update or delete on public.staff_profiles
  for each row execute function app.audit_row_change('user_id');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.staff_profiles enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.staff_profiles, public.audit_logs from public, anon, authenticated;
grant select on public.staff_profiles, public.audit_logs to authenticated;

-- Everyone sees their own profile (so an inactive user can be told why);
-- owners see all staff.
create policy staff_profiles_select on public.staff_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_owner()));

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select app.is_owner()));

-- No insert/update/delete policies or grants: all writes go through the
-- functions below.

-- ---------------------------------------------------------------------------
-- API functions (callable by signed-in users; each checks the caller)
-- ---------------------------------------------------------------------------

-- The caller's profile. The first sign-in of an invited account activates it.
-- Returns null when the user has no staff profile (no portal access).
create function public.current_staff() returns public.staff_profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v public.staff_profiles;
begin
  update public.staff_profiles
     set status = 'ACTIVE'
   where user_id = auth.uid() and status = 'INVITED'
  returning * into v;
  if v.user_id is null then
    select * into v from public.staff_profiles where user_id = auth.uid();
  end if;
  return v;
end;
$$;

create function public.update_my_name(p_full_name text) returns void
language sql security definer set search_path = ''
as $$
  update public.staff_profiles set full_name = btrim(p_full_name) where user_id = auth.uid();
$$;

-- Staff list for the owner, with last sign-in from Supabase Auth.
create function public.list_staff()
returns table (
  user_id uuid, full_name text, email text, role text, status text,
  pricing_tier text, invited_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  return query
    select s.user_id, s.full_name, s.email, s.role, s.status, s.pricing_tier,
           s.invited_at, u.last_sign_in_at
      from public.staff_profiles s
      left join auth.users u on u.id = s.user_id
     order by (s.role = 'OWNER') desc, s.status, s.full_name;
end;
$$;

-- Called by the staff-admin Edge Function (with the owner's token) right
-- after Supabase Auth sent the invitation email. Re-inviting refreshes it.
create function public.record_staff_invite(
  p_user_id uuid, p_full_name text, p_email text, p_pricing_tier text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  if not exists (select 1 from auth.users
                  where id = p_user_id and lower(email) = lower(btrim(p_email))) then
    raise exception 'Invited user not found.' using errcode = 'P0002';
  end if;
  insert into public.staff_profiles (user_id, full_name, email, role, status, pricing_tier, invited_at)
  values (p_user_id, btrim(p_full_name), lower(btrim(p_email)), 'INSTRUCTOR', 'INVITED',
          p_pricing_tier, now())
  on conflict (user_id) do update
     set full_name = excluded.full_name,
         pricing_tier = excluded.pricing_tier,
         invited_at = now()
   where public.staff_profiles.status = 'INVITED';
end;
$$;

-- Only invitations nobody accepted can be cancelled; accepted accounts are
-- deactivated instead, so their history stays attached to them.
create function public.cancel_staff_invite(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  delete from public.staff_profiles where user_id = p_user_id and status = 'INVITED';
  return found;
end;
$$;

create function public.set_staff_status(p_user_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
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

create function public.set_staff_role(p_user_id uuid, p_role text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  if p_role not in ('OWNER', 'INSTRUCTOR') then
    raise exception 'Role must be OWNER or INSTRUCTOR.' using errcode = '22023';
  end if;
  if p_role = 'INSTRUCTOR' then
    perform app.assert_keeps_an_owner(p_user_id);
  end if;
  update public.staff_profiles
     set role = p_role
   where user_id = p_user_id and role <> p_role;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner bootstrap: SQL Editor only (no API role can execute it).
--   select app.grant_owner('owner@example.com', 'Full Name');
-- The user must exist first: Authentication → Users → Add user.
-- ---------------------------------------------------------------------------

create function app.grant_owner(p_email text, p_full_name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No user with email %. Create it first: Authentication > Users > Add user.', p_email;
  end if;
  perform set_config('app.reason', 'grant_owner (SQL Editor)', true);
  insert into public.staff_profiles (user_id, full_name, email, role, status)
  values (v_user, btrim(p_full_name), lower(btrim(p_email)), 'OWNER', 'ACTIVE')
  on conflict (user_id) do update
     set role = 'OWNER', status = 'ACTIVE', full_name = excluded.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges. Postgres lets PUBLIC execute every new function, so
-- revoke first, then grant exactly what the portal needs.
-- ---------------------------------------------------------------------------

revoke all on function
  app.is_active_staff(), app.is_owner(), app.require_owner(),
  app.assert_keeps_an_owner(uuid), app.audit_row_change(),
  app.grant_owner(text, text),
  public.current_staff(), public.update_my_name(text), public.list_staff(),
  public.record_staff_invite(uuid, text, text, text), public.cancel_staff_invite(uuid),
  public.set_staff_status(uuid, text), public.set_staff_role(uuid, text)
from public, anon, authenticated;

grant execute on function app.is_active_staff(), app.is_owner() to authenticated;
grant execute on function
  public.current_staff(), public.update_my_name(text), public.list_staff(),
  public.record_staff_invite(uuid, text, text, text), public.cancel_staff_invite(uuid),
  public.set_staff_status(uuid, text), public.set_staff_role(uuid, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Exposure check, re-run at the end of every migration: fails the whole
-- migration if anon can run a privileged function or read a portal table.
-- ---------------------------------------------------------------------------

create function app.check_api_exposure() returns void
language plpgsql set search_path = ''
as $$
declare
  v_bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app')
     and p.prosecdef
     and pg_catalog.has_function_privilege('anon', p.oid, 'execute');
  if v_bad is not null then
    raise exception 'anon can execute privileged functions: %', v_bad;
  end if;

  select string_agg(c.oid::regclass::text, ', ') into v_bad
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (not c.relrowsecurity
          or pg_catalog.has_table_privilege('anon', c.oid, 'select'));
  if v_bad is not null then
    raise exception 'tables without RLS or readable by anon: %', v_bad;
  end if;
end;
$$;
revoke all on function app.check_api_exposure() from public, anon, authenticated;

select app.check_api_exposure();

commit;
