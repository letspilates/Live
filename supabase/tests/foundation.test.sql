-- Tests for the foundation migration (run with supabase/tests/run-local.sh).
-- Everything happens inside one transaction that is rolled back at the end.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated;

-- Act as a signed-in user (Supabase puts the JWT claims in request.jwt.claims).
create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

-- Runs p_sql and fails unless it raises SQLSTATE p_code.
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
  ('00000000-0000-0000-0000-0000000000a1', 'owner1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'owner2@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'inst.a@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'inst.b@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'invited@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'stranger@test.local');

-- Bootstrap (SQL Editor) -----------------------------------------------------
select app.grant_owner('OWNER1@test.local ', 'Owner One');
select t.check('bootstrap: owner row', (select role = 'OWNER' and status = 'ACTIVE'
  from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000000a1'));
select t.expect_error('bootstrap: unknown email', 'P0001',
  $$select app.grant_owner('nobody@test.local', 'Nobody')$$);

-- Owner invites three instructors ---------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: current_staff', (select role = 'OWNER' from public.current_staff()));
select public.record_staff_invite('00000000-0000-0000-0000-0000000000b1', 'Inst A', 'inst.a@test.local', 'CERTIFIED');
select public.record_staff_invite('00000000-0000-0000-0000-0000000000b2', 'Inst B', 'inst.b@test.local', null);
select public.record_staff_invite('00000000-0000-0000-0000-0000000000c1', 'Invited', 'invited@test.local', 'MASTER');
select t.expect_error('invite: email must match user', 'P0002',
  $$select public.record_staff_invite('00000000-0000-0000-0000-0000000000d1', 'X', 'wrong@test.local')$$);
select t.check('owner: list_staff sees 4', (select count(*) = 4 from public.list_staff()));
select t.check('owner: invited status', (select status = 'INVITED' from public.staff_profiles
  where user_id = '00000000-0000-0000-0000-0000000000b1'));
reset role;

-- First sign-in activates the invitation ----------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('inst A: activated on first sign-in', (select status = 'ACTIVE' from public.current_staff()));
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('inst B: activated', (select status = 'ACTIVE' from public.current_staff()));
reset role;

-- Instructor A: sees only self, cannot escalate ---------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('S2: instructor sees only own profile', (select count(*) = 1 from public.staff_profiles));
select t.check('S4: instructor reads no audit rows', (select count(*) = 0 from public.audit_logs));
select t.check('instructor: is_active_staff', app.is_active_staff());
select t.check('instructor: not owner', not app.is_owner());
select t.expect_error('S3: list_staff denied', '42501', $$select * from public.list_staff()$$);
select t.expect_error('S6: update own role', '42501',
  $$update public.staff_profiles set role = 'OWNER' where user_id = auth.uid()$$);
select t.expect_error('S6: insert profile', '42501',
  $$insert into public.staff_profiles (user_id, full_name, email, role) values (auth.uid(), 'x', 'x@x', 'OWNER')$$);
select t.expect_error('S6: delete profile', '42501', $$delete from public.staff_profiles$$);
select t.expect_error('S8: set_staff_role', '42501',
  $$select public.set_staff_role(auth.uid(), 'OWNER')$$);
select t.expect_error('S8: set_staff_status', '42501',
  $$select public.set_staff_status('00000000-0000-0000-0000-0000000000b2', 'INACTIVE')$$);
select t.expect_error('S8: record_staff_invite', '42501',
  $$select public.record_staff_invite('00000000-0000-0000-0000-0000000000d1', 'X', 'stranger@test.local')$$);
select t.expect_error('S8: cancel_staff_invite', '42501',
  $$select public.cancel_staff_invite('00000000-0000-0000-0000-0000000000c1')$$);
select t.expect_error('S8: grant_owner not callable', '42501',
  $$select app.grant_owner('inst.a@test.local', 'Me')$$);
select t.expect_error('S8: audit insert', '42501',
  $$insert into public.audit_logs (action, entity_type) values ('x', 'y')$$);
select public.update_my_name('  Instructor A  ');
select t.check('instructor: rename self', (select full_name = 'Instructor A' from public.current_staff()));
select t.expect_error('instructor: empty name rejected', '23514', $$select public.update_my_name('   ')$$);
reset role;

-- A signed-in user with no staff profile has no access --------------------------
select t.login('00000000-0000-0000-0000-0000000000d1');
select t.check('stranger: no profile', (select user_id is null from public.current_staff()));
select t.check('stranger: sees nothing', (select count(*) = 0 from public.staff_profiles));
select t.check('stranger: not staff', not app.is_active_staff());
reset role;

-- Anonymous (publishable key only) gets nothing ---------------------------------
select t.as_anon();
select t.expect_error('S10: anon table', '42501', $$select * from public.staff_profiles$$);
select t.expect_error('S10: anon audit', '42501', $$select * from public.audit_logs$$);
select t.expect_error('S10: anon current_staff', '42501', $$select public.current_staff()$$);
select t.expect_error('S10: anon list_staff', '42501', $$select * from public.list_staff()$$);
reset role;

-- Deactivation cuts access immediately ------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: deactivate B', public.set_staff_status('00000000-0000-0000-0000-0000000000b2', 'INACTIVE'));
select t.check('owner: deactivate again is a no-op', not public.set_staff_status('00000000-0000-0000-0000-0000000000b2', 'INACTIVE'));
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('S11: inactive is not active staff', not app.is_active_staff());
select t.check('S11: inactive sees status', (select status = 'INACTIVE' from public.current_staff()));
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: reactivate B', public.set_staff_status('00000000-0000-0000-0000-0000000000b2', 'ACTIVE'));

-- The last active owner cannot be removed ---------------------------------------
select t.expect_error('last owner: demote self', '23514',
  $$select public.set_staff_role(auth.uid(), 'INSTRUCTOR')$$);
select t.expect_error('last owner: deactivate self', '23514',
  $$select public.set_staff_status(auth.uid(), 'INACTIVE')$$);
reset role;
select app.grant_owner('owner2@test.local', 'Owner Two');
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('two owners: demote owner2', public.set_staff_role('00000000-0000-0000-0000-0000000000a2', 'INSTRUCTOR'));
select t.check('two owners: promote back', public.set_staff_role('00000000-0000-0000-0000-0000000000a2', 'OWNER'));
select t.check('owner: list_staff shows 5', (select count(*) = 5 from public.list_staff()));

-- Invitations: only unaccepted ones can be cancelled ----------------------------
select t.check('cancel: pending invite', public.cancel_staff_invite('00000000-0000-0000-0000-0000000000c1'));
select t.check('cancel: accepted account is kept', not public.cancel_staff_invite('00000000-0000-0000-0000-0000000000b1'));
select t.check('cancel: profile removed', (select count(*) = 0 from public.staff_profiles
  where user_id = '00000000-0000-0000-0000-0000000000c1'));

-- Audit trail -------------------------------------------------------------------
select t.check('audit: owner reads history', (select count(*) > 0 from public.audit_logs));
select t.check('audit: deactivation has actor', exists (
  select 1 from public.audit_logs
   where entity_type = 'staff_profiles'
     and entity_id = '00000000-0000-0000-0000-0000000000b2'
     and actor_user_id = '00000000-0000-0000-0000-0000000000a1'
     and after ->> 'status' = 'INACTIVE'));
select t.check('audit: bootstrap reason', exists (
  select 1 from public.audit_logs where reason = 'grant_owner (SQL Editor)'));
select t.check('audit: cancelled invite kept as delete', exists (
  select 1 from public.audit_logs
   where action = 'delete' and entity_id = '00000000-0000-0000-0000-0000000000c1'));
reset role;

-- Exposure check still passes ---------------------------------------------------
select app.check_api_exposure();

rollback;
\echo foundation: all checks passed
