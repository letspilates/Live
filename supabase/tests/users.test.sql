-- Tests for several roles per user, the ADMIN role, user editing / deleting and
-- per-menu access (run with supabase/tests/run-local.sh). Rolled back at the end.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated;

create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.expect_error(p_label text, p_code text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_code then return; end if;
    raise exception '[%] expected SQLSTATE %, got %: %', p_label, p_code, sqlstate, sqlerrm;
  end;
  raise exception '[%] expected SQLSTATE %, but it succeeded', p_label, p_code;
end $$;

create function t.check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception '[%] failed', p_label; end if;
end $$;

grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'both@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'inst@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'invitee@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'second.owner@test.local');
select app.grant_owner('owner@test.local', 'Owner');

-- Owner adds users with several roles and details -----------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.add_staff_user('00000000-0000-0000-0000-0000000000a2', 'admin@test.local', false,
  '{"full_name":"Ada Admin","roles":["ADMIN"],"phone":"213-555-0100"}');
select public.add_staff_user('00000000-0000-0000-0000-0000000000b1', 'Both@Test.local', false,
  '{"full_name":"Bo Both","roles":["INSTRUCTOR","STAFF"],"pricing_tier":"MASTER","address":"1 Main St, LA",
    "certifications":"GYROTONIC® Level 1"}');
select public.add_staff_user(null, 'inst@test.local', false, '{"full_name":"Ian Inst","roles":["INSTRUCTOR"]}');
select public.add_staff_user('00000000-0000-0000-0000-0000000000c1', 'invitee@test.local', true,
  '{"full_name":"Ivy Invitee","roles":["STAFF"],"pricing_tier":"MASTER"}');
select t.check('roles sorted, primary role synced', (select roles = '{STAFF,INSTRUCTOR}' and role = 'STAFF'
  and pricing_tier = 'MASTER' and email = 'both@test.local' and certifications = 'GYROTONIC® Level 1'
  from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000000b1'));
select t.check('invited user waits; tier dropped without INSTRUCTOR', (select status = 'INVITED' and pricing_tier is null
  and invited_at is not null from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000000c1'));
select t.check('list_staff returns roles and details', (select count(*) = 5 and bool_or(phone = '213-555-0100')
  from public.list_staff()));
select t.expect_error('add: no roles', '22023',
  $$select public.add_staff_user('00000000-0000-0000-0000-0000000000c2', 'second.owner@test.local', false, '{"full_name":"X","roles":[]}')$$);
select t.expect_error('add: unknown role', '23514',
  $$select public.add_staff_user('00000000-0000-0000-0000-0000000000c2', 'second.owner@test.local', false, '{"full_name":"X","roles":["BOSS"]}')$$);
select t.expect_error('add: email must match the account', 'P0002',
  $$select public.add_staff_user('00000000-0000-0000-0000-0000000000c2', 'wrong@test.local', false, '{"full_name":"X","roles":["STAFF"]}')$$);
reset role;

-- Admin: full access, but cannot touch owners ------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a2');
select t.check('admin counts as full access', app.is_owner() and app.can('payments') and app.can('clients'));
select t.check('admin sees every user', (select count(*) = 5 from public.staff_profiles));
select t.expect_error('admin cannot add an owner', '42501',
  $$select public.add_staff_user('00000000-0000-0000-0000-0000000000c2', 'second.owner@test.local', false, '{"full_name":"X","roles":["OWNER"]}')$$);
select t.expect_error('admin cannot edit an owner', '42501',
  $$select public.update_staff_user('00000000-0000-0000-0000-0000000000a1', '{"full_name":"Hacked","roles":["OWNER"]}')$$);
select t.expect_error('admin cannot deactivate an owner', '42501',
  $$select public.set_staff_status('00000000-0000-0000-0000-0000000000a1', 'INACTIVE')$$);
select t.expect_error('admin cannot delete an owner', '42501',
  $$select public.delete_staff_user('00000000-0000-0000-0000-0000000000a1')$$);
select t.expect_error('admin cannot promote via old function', '42501',
  $$select public.set_staff_role('00000000-0000-0000-0000-0000000000b2', 'OWNER')$$);
select public.update_staff_user('00000000-0000-0000-0000-0000000000b2',
  '{"full_name":"Ian Instructor","roles":["INSTRUCTOR","ADMIN"],"phone":"310-555-0199","pricing_tier":"CERTIFIED"}');
select t.check('admin edits a user (details + roles)', (select full_name = 'Ian Instructor' and roles = '{ADMIN,INSTRUCTOR}'
  and role = 'ADMIN' and phone = '310-555-0199' and pricing_tier = 'CERTIFIED'
  from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000000b2'));
select public.update_staff_user('00000000-0000-0000-0000-0000000000b2', '{"full_name":"Ian Instructor","roles":["INSTRUCTOR"]}');
select t.check('payment rules treat admins as owners', not exists (select 1 from pg_proc where prosrc like '%v_me.role <> ''OWNER''%'));
reset role;

-- Owner: owner role changes, last-owner guard, delete --------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.expect_error('owner cannot drop the last owner', '23514',
  $$select public.update_staff_user('00000000-0000-0000-0000-0000000000a1', '{"full_name":"Owner","roles":["ADMIN"]}')$$);
select public.add_staff_user('00000000-0000-0000-0000-0000000000c2', 'second.owner@test.local', false,
  '{"full_name":"Second Owner","roles":["OWNER","INSTRUCTOR"]}');
select t.check('owner adds an owner + instructor', (select role = 'OWNER' from public.staff_profiles
  where user_id = '00000000-0000-0000-0000-0000000000c2'));
select t.expect_error('cannot delete yourself', '22023',
  $$select public.delete_staff_user('00000000-0000-0000-0000-0000000000a1')$$);
select public.delete_staff_user('00000000-0000-0000-0000-0000000000c1');
select t.check('user without records is deleted', not exists (select 1 from public.staff_profiles
  where user_id = '00000000-0000-0000-0000-0000000000c1'));
select t.expect_error('delete: unknown user', 'P0002',
  $$select public.delete_staff_user('00000000-0000-0000-0000-0000000000c1')$$);
reset role;

-- A user with records is kept (deactivate instead)
select t.login('00000000-0000-0000-0000-0000000000b1');
select public.add_student('Rec Ord', '213-555-0000');
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.expect_error('delete: user with records refused', 'LPREF',
  $$select public.delete_staff_user('00000000-0000-0000-0000-0000000000b1')$$);
reset role;

-- Menu access (Settings → Admin) -----------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('instructor: defaults are clients + payments', app.can('clients') and app.can('payments')
  and not app.can('schedule'));
select t.check('instructor: reads the access table', (select count(*) = 5 from public.role_menu_access));
select t.expect_error('instructor cannot change access', '42501',
  $$select public.set_role_menu_access('INSTRUCTOR', 'schedule', true)$$);
select t.expect_error('instructor cannot list users', '42501', $$select * from public.list_staff()$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000a2');
select public.set_role_menu_access('INSTRUCTOR', 'payments', false);
select public.set_role_menu_access('INSTRUCTOR', 'schedule', true);
select t.expect_error('access: unknown menu', '23514', $$select public.set_role_menu_access('INSTRUCTOR', 'expenses', true)$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('instructor: switches apply', not app.can('payments') and app.can('schedule'));
reset role;
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('instructor + staff: union of both roles', app.can('payments') and app.can('schedule') and app.can('clients'));
reset role;
select t.check('access changes are audited', (select count(*) = 2 from public.audit_logs where entity_type = 'role_menu_access'));

-- Own details ----------------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b2');
select public.update_my_profile('{"phone":"424-555-0123","address":"2 Elm St","certifications":"Pilates Level 2"}');
select t.check('my profile: details saved, roles untouched', (select phone = '424-555-0123' and address = '2 Elm St'
  and certifications = 'Pilates Level 2' and roles = '{INSTRUCTOR}' from public.current_staff()));
reset role;

select app.check_api_exposure();

rollback;
\echo users: all checks passed
