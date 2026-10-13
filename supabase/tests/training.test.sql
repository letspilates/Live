-- Tests for training courses and registrations (run with supabase/tests/run-local.sh).
-- Everything happens inside one transaction that is rolled back at the end.

\set ON_ERROR_STOP 1
begin;

-- Start from no courses (the seed migration adds the studio's real ones).
set local session_replication_role = replica; -- skip triggers (audit log is append-only)
delete from public.training_courses;
delete from public.audit_logs where entity_type = 'training_courses';
set local session_replication_role = origin;

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

-- Owner saves courses one at a time (AUDIT-011) -------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.course_a', public.save_training_course($${"code":"A","name_en":" Foundation ","dates":"11/14 - 11/16",
  "length_days":"3","capacity":"2","fee":"$350","fee_early":"$250","early_until":"2099-01-01","active":true,"desc_kr":"설명"}$$)::text, true);
select set_config('t.course_b', public.save_training_course(
  $${"code":"B","name_en":"Board","dates":"","length_days":"","capacity":"","active":true}$$)::text, true);
select set_config('t.course_c', public.save_training_course($${"code":"C","name_en":"Hidden","active":false}$$)::text, true);
select t.check('owner: save 3 courses', (select count(*) = 3 from public.training_courses));
select t.check('owner: name trimmed, blanks are null', (select name_en = 'Foundation' and capacity = 2
  and length_days = 3 and early_until = '2099-01-01' and desc_kr = '설명'
  from public.training_courses where code = 'A'));
select t.check('owner: no-limit capacity is null', (select capacity is null from public.training_courses where code = 'B'));
select t.check('owner: course audit rows', (select count(*) = 3 from public.audit_logs where entity_type = 'training_courses'));

-- Editing sends the updated_at the screen loaded and keeps the id; an unchanged save rewrites nothing.
select set_config('t.a_version', (select updated_at::text from public.training_courses where code = 'A'), true);
select public.save_training_course((select to_jsonb(c) || '{"name_en":"Foundation 2"}' from public.training_courses c where code = 'A'));
select t.check('owner: edit keeps the id', (select name_en = 'Foundation 2' and id = current_setting('t.course_a')::uuid
  from public.training_courses where code = 'A'));
select public.save_training_course((select to_jsonb(c) from public.training_courses c where code = 'B'));
select t.check('owner: unchanged row not rewritten', (select count(*) = 1 from public.audit_logs
  where entity_type = 'training_courses' and action = 'update'));
-- A screen loaded before someone else's save is refused instead of undoing that save.
select t.expect_error('owner: stale save refused', 'LPSTL', format($q$select public.save_training_course(%L)$q$,
  (select to_jsonb(c) || jsonb_build_object('name_en', 'Old tab', 'updated_at', current_setting('t.a_version'))
     from public.training_courses c where code = 'A')));
select t.expect_error('owner: save without a version refused', 'LPSTL', format($q$select public.save_training_course(%L)$q$,
  (select to_jsonb(c) - 'updated_at' from public.training_courses c where code = 'A')));
select t.check('owner: refused saves changed nothing', (select name_en = 'Foundation 2' from public.training_courses where code = 'A'));
-- Saving one course leaves a course someone else just added (the old whole-list save deleted it).
select set_config('t.course_x', public.save_training_course('{"code":"D","name_en":"Added in another tab","active":true}')::text, true);
select public.save_training_course((select to_jsonb(c) || '{"active":false}' from public.training_courses c where code = 'C'));
select t.check('owner: saving one course leaves the others', (select count(*) = 4 from public.training_courses)
  and (select not active from public.training_courses where code = 'C'));
-- Letters A, B, C… are re-lettered on their own, without moving the version; unknown ids are ignored.
select set_config('t.c_version', (select updated_at::text from public.training_courses where code = 'C'), true);
select public.set_training_course_codes(jsonb_build_object(current_setting('t.course_c'), 'E', gen_random_uuid()::text, 'Z'));
select t.check('owner: codes re-lettered, version kept', (select code = 'E' and updated_at::text = current_setting('t.c_version')
  from public.training_courses where id = current_setting('t.course_c')::uuid)
  and not exists (select 1 from public.training_courses where code = 'Z'));
-- Delete: a course nobody signed up for goes (twice is fine); it can't be saved back from an old screen.
select public.delete_training_course(current_setting('t.course_x')::uuid);
select t.check('owner: course without registrants deleted', not exists (
  select 1 from public.training_courses where id = current_setting('t.course_x')::uuid));
select public.delete_training_course(current_setting('t.course_x')::uuid);
select t.expect_error('owner: deleted course not saved back', 'LPSTL', format(
  $q$select public.save_training_course('{"id":"%s","name_en":"X","updated_at":"2026-01-01T00:00:00Z"}')$q$, current_setting('t.course_x')));
select t.expect_error('owner: bad capacity', '23514', $$select public.save_training_course('{"name_en":"X","capacity":"-1"}')$$);
select t.expect_error('owner: not a course', '22023', $$select public.save_training_course('[]')$$);
select t.expect_error('owner: codes not a map', '22023', $$select public.set_training_course_codes('[]')$$);
-- The old whole-list save (a tab left open from before the update) is refused and deletes nothing.
select t.expect_error('owner: old whole-list save refused', 'LPSTL', $$select public.save_training_courses('[]')$$);
select t.check('owner: old save deleted nothing', (select count(*) = 3 from public.training_courses));
reset role;

-- Public form ---------------------------------------------------------------------
-- A course whose last day has passed is hidden; a future or unknown last day stays.
update public.training_courses set ends_on = '2000-01-01' where code = 'B';
select t.check('past course hidden from the site', not exists (
  select 1 from jsonb_array_elements(public.public_training_courses()) c where c ->> 'id' = 'B'));
update public.training_courses set ends_on = '2099-01-01' where code = 'B';
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.save_training_course((select to_jsonb(c) || '{"class_time":"9:00 AM"}' from public.training_courses c where code = 'B'));
select t.check('owner: save keeps ends_on', (select ends_on = '2099-01-01' and class_time = '9:00 AM'
  from public.training_courses where code = 'B'));
reset role;
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
select t.expect_error('anon: cannot save a course', '42501', $$select public.save_training_course('{"name_en":"X"}')$$);
select t.expect_error('anon: cannot delete a course', '42501', format($$select public.delete_training_course('%s')$$, current_setting('t.course_a')));
select t.expect_error('anon: cannot re-letter', '42501', $$select public.set_training_course_codes('{}')$$);
select t.expect_error('anon: cannot import', '42501', $$select public.import_training_registrations('[]')$$);
reset role;

-- Instructor: no access to enrollment data -------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('instructor: sees no courses', (select count(*) = 0 from public.training_courses));
select t.check('instructor: sees no registrations', (select count(*) = 0 from public.training_registrations));
select t.expect_error('instructor: cannot save', '42501', $$select public.save_training_courses('[]')$$);
select t.expect_error('instructor: cannot save a course', '42501', $$select public.save_training_course('{"name_en":"X"}')$$);
select t.expect_error('instructor: cannot delete a course', '42501', format($$select public.delete_training_course('%s')$$, current_setting('t.course_a')));
select t.expect_error('instructor: cannot re-letter', '42501', $$select public.set_training_course_codes('{}')$$);
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

-- Seats held by hand and registrants added by hand -------------------------------------
update public.training_courses set held_seats = 1 where code = 'A';  -- capacity 2, 1 sign-up
select t.as_anon();
select t.check('held seats count as taken', (select (c ->> 'taken')::int = 2
  from jsonb_array_elements(public.public_training_courses()) c where c ->> 'id' = 'A'));
select t.expect_error('held seats make the course full', '22023', format(
  $$select public.submit_training_registration('{"course_ids":["%s"],"full_name":"X","email":"x@y.z","phone":"1","certification":"c"}')$$,
  current_setting('t.course_a')));
select t.expect_error('anon: cannot add by hand', '42501',
  $$select public.add_training_registration('{"full_name":"X"}')$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('instructor: cannot add by hand', '42501',
  $$select public.add_training_registration('{"full_name":"X"}')$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.manual', public.add_training_registration(jsonb_build_object(
  'course_ids', jsonb_build_array(current_setting('t.course_a')), 'full_name', ' Jae Lee ',
  'phone', '213-555-0100', 'note', 'said yes on the phone'))::text, true);
select t.check('owner: adds a registrant by hand, no email', (select r.source = 'manual' and r.email = ''
  and r.full_name = 'Jae Lee' and r.phone = '213-555-0100' and r.courses_text like 'A - %'
  and r.questions = 'said yes on the phone'
  from public.training_registrations r where r.id = current_setting('t.manual')::uuid));
select t.expect_error('owner: hand add needs a name', '23514', format(
  $$select public.add_training_registration('{"course_ids":["%s"],"full_name":" "}')$$, current_setting('t.course_a')));
select t.expect_error('owner: hand add needs a course', '22023',
  $$select public.add_training_registration('{"full_name":"X"}')$$);
select t.expect_error('owner: hand add checks email', '23514', format(
  $$select public.add_training_registration('{"course_ids":["%s"],"full_name":"X","email":"nope"}')$$, current_setting('t.course_a')));
-- A course with registrants is never deleted (their course link would break): hide it instead.
select t.expect_error('owner: course with registrants not deleted', 'LPREG', format(
  $$select public.delete_training_course('%s')$$, current_setting('t.course_a')));
select public.save_training_course((select to_jsonb(c) || '{"active":false}' from public.training_courses c where code = 'A'));
select t.check('owner: hidden instead, registrants still linked', (select not active from public.training_courses
  where id = current_setting('t.course_a')::uuid)
  and (select count(*) = 2 from public.training_registrations r where current_setting('t.course_a')::uuid = any (r.course_ids)));
reset role;

-- Sign-ups per connection (AUDIT-018): at most 3 an hour from one client IP ------------------
-- Supabase passes the client address as the first x-forwarded-for entry. Each sign-up
-- below uses its own email so the per-email limit is not what stops it.
create function t.sign_up(p_email text) returns uuid language sql as $$
  select public.submit_training_registration(jsonb_build_object('course_ids', jsonb_build_array(current_setting('t.course_b')),
    'full_name', 'Applicant', 'email', p_email, 'phone', '1', 'certification', 'c'))
$$;
grant execute on function t.sign_up(text) to anon;
select t.as_anon();
select set_config('request.headers', '{"x-forwarded-for":"1.2.3.4, 10.0.0.1"}', true);
select t.check('ip: 3 sign-ups from one connection', t.sign_up('ip1@x.com') is not null
  and t.sign_up('ip2@x.com') is not null and t.sign_up('ip3@x.com') is not null);
select t.expect_error('ip: 4th sign-up from the same connection within the hour refused', '22023',
  $$select t.sign_up('ip4@x.com')$$);
select set_config('request.headers', '{"x-forwarded-for":"1.2.3.4"}', true);
select t.expect_error('ip: same client behind another proxy hop still refused', '22023', $$select t.sign_up('ip5@x.com')$$);
select set_config('request.headers', '{"x-forwarded-for":"5.6.7.8"}', true);
select t.check('ip: another connection is fine', t.sign_up('ip6@x.com') is not null);
select set_config('request.headers', '{"accept":"*/*"}', true);
select t.check('ip: no forwarded address is not blocked', t.sign_up('ip7@x.com') is not null
  and t.sign_up('ip8@x.com') is not null and t.sign_up('ip9@x.com') is not null and t.sign_up('ip10@x.com') is not null);
select set_config('request.headers', '', true);
select t.check('ip: no request headers is not blocked', t.sign_up('ip11@x.com') is not null);
reset role;
select t.check('ip: only a hash of the address is kept', (select count(*) = 3 from app.training_signup_ips
  where ip_hash = encode(sha256(convert_to('1.2.3.4', 'UTF8')), 'hex'))
  and (select count(*) = 4 from app.training_signup_ips)
  and not exists (select 1 from app.training_signup_ips where ip_hash like '%1.2.3.4%'));
update app.training_signup_ips set created_at = now() - interval '61 minutes';
select t.as_anon();
select set_config('request.headers', '{"x-forwarded-for":"1.2.3.4"}', true);
select t.check('ip: sign-ups older than an hour no longer count', t.sign_up('ip12@x.com') is not null);
select t.expect_error('anon: reads no address hashes', '42501', $$select * from app.training_signup_ips$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.expect_error('owner: reads no address hashes', '42501', $$select * from app.training_signup_ips$$);
reset role;

select app.check_api_exposure();

rollback;
\echo training: all checks passed
