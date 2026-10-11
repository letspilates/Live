-- Regression tests for the database review fixes (20261011100000_review_fixes.sql).
-- Run with supabase/tests/run-local.sh. Rolled back at the end.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated;

create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
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
  ('00000000-0000-0000-0000-0000000000a3', 'owner2@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'staff@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'inst@test.local');
select app.grant_owner('owner@test.local', 'Owner');
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.add_staff_user('00000000-0000-0000-0000-0000000000a2', 'admin@test.local', false, '{"full_name":"Ada","roles":["ADMIN"]}');
select public.add_staff_user('00000000-0000-0000-0000-0000000000a3', 'owner2@test.local', true, '{"full_name":"Olga","roles":["OWNER"]}');
select public.add_staff_user('00000000-0000-0000-0000-0000000000b1', 'staff@test.local', false,
  '{"full_name":"Sam","roles":["STAFF"],"notes":"private note"}');
select public.add_staff_user('00000000-0000-0000-0000-0000000000b2', 'inst@test.local', false, '{"full_name":"Ian","roles":["INSTRUCTOR"]}');
reset role;

-- 1. Staff notes are for owners and admins only -------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('staff: cannot read own notes', '42501', 'select notes from public.staff_profiles');
select t.check('staff: current_staff hides notes', (select notes = '' and full_name = 'Sam' from public.current_staff()));
select t.check('staff: still reads own row', (select count(*) = 1 and bool_and(email = 'staff@test.local') from public.staff_profiles));
reset role;
select t.login('00000000-0000-0000-0000-0000000000a2');
select t.check('admin: sees notes in the user list', exists (select 1 from public.list_staff() where notes = 'private note'));
reset role;

-- 2. A deactivated user cannot edit their profile --------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.set_staff_status('00000000-0000-0000-0000-0000000000b2', 'INACTIVE');
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select public.update_my_profile('{"full_name":"Changed","phone":"999"}');
select public.update_my_name('Changed again');
reset role;
select t.check('deactivated: profile unchanged', (select full_name = 'Ian' and phone = ''
  from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000000b2'));
select t.login('00000000-0000-0000-0000-0000000000b1');
select public.update_my_profile('{"phone":"213-555-0100"}');
reset role;
select t.check('active: profile edit still works', (select phone = '213-555-0100'
  from public.staff_profiles where user_id = '00000000-0000-0000-0000-0000000000b1'));

-- 3. Admin cannot change an invited owner through record_staff_invite ----------------------
select t.login('00000000-0000-0000-0000-0000000000a2');
select t.expect_error('admin: record_staff_invite on an owner', '42501',
  $$select public.record_staff_invite('00000000-0000-0000-0000-0000000000a3', 'Renamed', 'owner2@test.local')$$);
reset role;

-- 4. Refunds never add up to more than the payment ---------------------------------------
select t.check('correct_payment locks the refunded payment', (
  select prosrc ~ 'related_transaction_id\s+for update' from pg_proc
   where oid = 'public.correct_payment(uuid,bigint,text,text,text,uuid,text)'::regprocedure));
select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.pay', (public.record_payment(gen_random_uuid(), 10000, 'CASH', null, 'Walk-in A',
  p_collected_by => '00000000-0000-0000-0000-0000000000b1')).id::text, true);
select set_config('t.ref', (public.record_refund(gen_random_uuid(), current_setting('t.pay')::uuid, 1000, 'CASH', 'part')).id::text, true);
select public.record_refund(gen_random_uuid(), current_setting('t.pay')::uuid, 5000, 'CASH', 'more');
select t.expect_error('refund raised past the payment', '22023',
  format('select public.correct_payment(%L, 6000, %L)', current_setting('t.ref'), 'CASH'));
select t.check('refund raised up to the payment', (select amount_cents = 5000
  from public.correct_payment(current_setting('t.ref')::uuid, 5000, 'CASH')));

-- 5. Correcting a payment received by someone since deactivated keeps who received it ------
select public.set_staff_status('00000000-0000-0000-0000-0000000000b1', 'INACTIVE');
select t.check('deactivated collector: amount corrected, collector kept', (
  select amount_cents = 10500 and collected_by = '00000000-0000-0000-0000-0000000000b1' and collected_by_name = 'Sam'
    from public.correct_payment(current_setting('t.pay')::uuid, 10500, 'CASH', '', 'typo')));
select t.check('same collector passed explicitly is kept too', (
  select collected_by = '00000000-0000-0000-0000-0000000000b1'
    from public.correct_payment(current_setting('t.pay')::uuid, 10500, 'CASH', '', 'typo', '00000000-0000-0000-0000-0000000000b1')));
select t.expect_error('moving it to a deactivated person is refused', '22023',
  format('select public.correct_payment(%L, 10500, %L, %L, %L, %L)', current_setting('t.pay'), 'CASH', '', '', '00000000-0000-0000-0000-0000000000b2'));

-- 6. Full and closed courses refuse sign-ups ---------------------------------------------
select public.save_training_courses('[{"code":"A","name_en":"One seat","capacity":1,"active":true},
  {"code":"B","name_en":"Closed","capacity":0,"active":true},{"code":"C","name_en":"No limit","active":true}]');
reset role;
select set_config('t.a', (select id::text from public.training_courses where code = 'A'), true);
select set_config('t.b', (select id::text from public.training_courses where code = 'B'), true);
select set_config('t.c', (select id::text from public.training_courses where code = 'C'), true);
select t.anon();
select public.submit_training_registration(jsonb_build_object('course_ids', jsonb_build_array(current_setting('t.a')),
  'full_name', 'First', 'email', 'first@x.com', 'phone', '1', 'certification', 'c'));
select t.expect_error('full course refused', '22023', format(
  $$select public.submit_training_registration('{"course_ids":["%s","%s"],"full_name":"X","email":"x@y.z","phone":"1","certification":"c"}')$$,
  current_setting('t.c'), current_setting('t.a')));
select t.expect_error('capacity 0 refused', '22023', format(
  $$select public.submit_training_registration('{"course_ids":["%s"],"full_name":"X","email":"x@y.z","phone":"1","certification":"c"}')$$,
  current_setting('t.b')));
select t.check('no-limit course still open', public.submit_training_registration(jsonb_build_object(
  'course_ids', jsonb_build_array(current_setting('t.c')), 'full_name', 'X', 'email', 'x@y.z', 'phone', '1', 'certification', 'c')) is not null);
reset role;

-- 7. Follow-ups (20261011110000_review_followups.sql) --------------------------------
-- Spam limits: a 4th sign-up from one email within a day is refused.
-- (one sign-up from x@y.z exists from test 6; now() is fixed inside a transaction, so backdate the others)
insert into public.training_registrations (course_ids, full_name, email, phone, submitted_at)
values (array[current_setting('t.c')::uuid], 'X', 'x@y.z', '1', now() - interval '2 hours'),
       (array[current_setting('t.c')::uuid], 'X', 'x@y.z', '1', now() - interval '20 hours');
select t.anon();
select t.expect_error('spam: 4th sign-up from one email today refused', '22023', format(
  $$select public.submit_training_registration('{"course_ids":["%s"],"full_name":"X","email":"x@y.z","phone":"1","certification":"c"}')$$,
  current_setting('t.c')));
select t.check('spam: another email still fine', public.submit_training_registration(jsonb_build_object(
  'course_ids', jsonb_build_array(current_setting('t.c')), 'full_name', 'Y', 'email', 'other@y.z', 'phone', '1', 'certification', 'c')) is not null);
reset role;
select set_config('t.reg', (select id::text from public.training_registrations where email = 'other@y.z'), true);
-- Delete an applicant: staff refused, owner ok, audit row kept, anon refused.
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('staff: cannot delete applicant', '42501', format($$select public.delete_training_registration('%s')$$, current_setting('t.reg')));
reset role;
select t.anon();
select t.expect_error('anon: cannot delete applicant', '42501', format($$select public.delete_training_registration('%s')$$, current_setting('t.reg')));
reset role;
select t.login('00000000-0000-0000-0000-0000000000a2');
select public.delete_training_registration(current_setting('t.reg')::uuid);
select t.expect_error('admin: deleting twice reports not found', 'P0002', format($$select public.delete_training_registration('%s')$$, current_setting('t.reg')));
reset role;
select t.check('applicant gone', not exists (select 1 from public.training_registrations where email = 'other@y.z'));
select t.check('applicant delete audited', exists (select 1 from public.audit_logs
  where entity_type = 'training_registrations' and action = 'delete' and entity_id = current_setting('t.reg')));
-- set_staff_status: unknown user false, repeat true.
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('status: unknown user is false', not public.set_staff_status('00000000-0000-0000-0000-0000000000ff', 'INACTIVE'));
select t.check('status: already inactive is still true', public.set_staff_status('00000000-0000-0000-0000-0000000000b2', 'INACTIVE'));
reset role;

select app.check_api_exposure();

rollback;
\echo review: all checks passed
