-- Tests for training courses and registrations (run with supabase/tests/run-local.sh).
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
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'inst@test.local');
select app.grant_owner('owner@test.local', 'Owner');
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.add_staff_account('inst@test.local', 'Inst', 'INSTRUCTOR', null);
reset role;

-- Owner saves courses -----------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: save 3 courses', public.save_training_courses($$[
  {"code":"A","name_en":" Foundation ","dates":"11/14 - 11/16","length_days":"3","capacity":"2","fee":"$350",
   "fee_early":"$250","early_until":"2099-01-01","active":true,"desc_kr":"설명"},
  {"code":"B","name_en":"Board","dates":"","length_days":"","capacity":"","active":true},
  {"code":"C","name_en":"Hidden","active":false}
]$$::jsonb) = 3);
select t.check('owner: name trimmed, blanks are null', (select name_en = 'Foundation' and capacity = 2
  and length_days = 3 and early_until = '2099-01-01' and desc_kr = '설명'
  from public.training_courses where code = 'A'));
select t.check('owner: no-limit capacity is null', (select capacity is null from public.training_courses where code = 'B'));
select t.check('owner: course audit rows', (select count(*) = 3 from public.audit_logs where entity_type = 'training_courses'));

-- Editing keeps ids; missing rows are deleted; unchanged rows are not rewritten.
select public.save_training_courses((
  select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name_en',
           case when code = 'A' then 'Foundation 2' else name_en end, 'active', active,
           'capacity', capacity, 'length_days', length_days, 'dates', dates, 'fee', fee,
           'fee_early', fee_early, 'early_until', early_until, 'desc_kr', desc_kr))
    from public.training_courses where code in ('A', 'B')));
select t.check('owner: edit + delete', (select string_agg(name_en, ',' order by code) = 'Foundation 2,Board'
  from public.training_courses));
select t.check('owner: unchanged row not rewritten', (select count(*) = 1 from public.audit_logs
  where entity_type = 'training_courses' and action = 'update'));
select t.expect_error('owner: bad capacity', '23514',
  $$select public.save_training_courses('[{"name_en":"X","capacity":"-1"}]')$$);
select t.expect_error('owner: not a list', '22023', $$select public.save_training_courses('{}')$$);
reset role;

-- Public form ---------------------------------------------------------------------
select set_config('t.course_a', (select id::text from public.training_courses where code = 'A'), true);
select t.as_anon();
select t.check('anon: sees open courses only', (select jsonb_array_length(public.public_training_courses()) = 2));
select t.check('anon: course shape', (select c ->> 'id' = 'A' and c ->> 'tag_en' = '3 days' and c ->> 'tag_kr' = '3일'
  and (c ->> 'taken')::int = 0 and c ->> 'early_until' = '2099-01-01'
  from jsonb_array_elements(public.public_training_courses()) c limit 1));
select public.submit_training_registration(jsonb_build_object(
  'course_ids', jsonb_build_array((select c ->> 'uid' from jsonb_array_elements(public.public_training_courses()) c where c ->> 'id' = 'A')),
  'courses_text', 'A - Foundation 2', 'full_name', ' Mina Cho ', 'email', 'Mina@Example.com',
  'phone', '213-555-0142', 'certification', 'None'));
select t.check('anon: taken counts the sign-up', (select (c ->> 'taken')::int = 1
  from jsonb_array_elements(public.public_training_courses()) c where c ->> 'id' = 'A'));
select t.expect_error('anon: no course', '22023',
  $$select public.submit_training_registration('{"course_ids":[],"full_name":"X","email":"x@y.z","phone":"1","certification":"c"}')$$);
select t.expect_error('anon: unknown course', '22023',
  $$select public.submit_training_registration('{"course_ids":["00000000-0000-0000-0000-000000000000"],"full_name":"X","email":"x@y.z","phone":"1","certification":"c"}')$$);
select t.expect_error('anon: bad email', '23514', format(
  $$select public.submit_training_registration('{"course_ids":["%s"],"full_name":"X","email":"nope","phone":"1","certification":"c"}')$$,
  current_setting('t.course_a')));
select t.expect_error('anon: missing phone', '22023', format(
  $$select public.submit_training_registration('{"course_ids":["%s"],"full_name":"X","email":"x@y.z","certification":"c"}')$$,
  current_setting('t.course_a')));
select t.expect_error('anon: reads no courses table', '42501', $$select * from public.training_courses$$);
select t.expect_error('anon: reads no registrations', '42501', $$select * from public.training_registrations$$);
select t.expect_error('anon: cannot save courses', '42501', $$select public.save_training_courses('[]')$$);
select t.expect_error('anon: cannot import', '42501', $$select public.import_training_registrations('[]')$$);
reset role;

-- Instructor: no access to enrollment data -------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('instructor: sees no courses', (select count(*) = 0 from public.training_courses));
select t.check('instructor: sees no registrations', (select count(*) = 0 from public.training_registrations));
select t.expect_error('instructor: cannot save', '42501', $$select public.save_training_courses('[]')$$);
select t.expect_error('instructor: cannot import', '42501', $$select public.import_training_registrations('[]')$$);
select t.expect_error('instructor: no direct insert', '42501',
  $$insert into public.training_registrations (full_name, email) values ('x', 'x@y.z')$$);
reset role;

-- Owner: reads registrations, imports the sheet once ------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: sees the sign-up', (select email = 'mina@example.com' and full_name = 'Mina Cho' and source = 'form'
  from public.training_registrations));
select t.check('owner: import 2 rows', public.import_training_registrations($$[
  {"submitted_at":"2026-09-01T10:00:00-07:00","courses_text":"A - Old","full_name":"Leo","email":"leo@x.com"},
  {"submitted_at":"2026-09-02T10:00:00-07:00","courses_text":"B - Board","course_ids":[],"full_name":"Ana","email":"ana@x.com"}
]$$::jsonb) = 2);
select t.check('owner: re-import skips duplicates', public.import_training_registrations($$[
  {"submitted_at":"2026-09-01T10:00:00-07:00","full_name":"Leo","email":"LEO@x.com"}
]$$::jsonb) = 0);
select t.check('owner: 3 registrations', (select count(*) = 3 from public.training_registrations));
select t.expect_error('owner: no direct delete', '42501', $$delete from public.training_registrations$$);
reset role;

select app.check_api_exposure();

rollback;
\echo training: all checks passed
