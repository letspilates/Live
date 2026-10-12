-- Tests for Members: Mindbody and Schedulista imports (run with supabase/tests/run-local.sh).
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
  ('00000000-0000-0000-0000-0000000000b1', 'ana@test.local');
select app.grant_owner('owner@test.local', 'Owner');
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.add_staff_account('ana@test.local', 'Ana', 'INSTRUCTOR', null);
-- A student added earlier from the payment screen
select set_config('t.mina', public.add_student('Mina Cho', '(213) 555-0142')::text, true);
reset role;

select t.check('same_name: order and case', app.same_name('Cho Mina', 'mina cho'));
select t.check('same_name: first name', app.same_name('Jisun', 'Jisun Park'));
select t.check('same_name: different people', not app.same_name('Hannah Lee', 'David Lee'));

-- Mindbody ---------------------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('mindbody: first import', public.import_members('MINDBODY', $$[
  {"mindbody_id":"165","full_name":"Mina Cho","phone":"213-555-0142","email":"mina@example.com","address":"1 Main St, LA"},
  {"mindbody_id":"46","full_name":"Hannah Lee","phone":"2135550100"},
  {"mindbody_id":"47","full_name":"David Lee","phone":"2135550100"},
  {"mindbody_id":"","full_name":"No Id"},
  {"mindbody_id":"48","full_name":"  "}
]$$) = '{"added":2,"linked":1,"updated":0,"skipped":2}');
select t.check('mindbody: linked to the payment-screen student, blanks filled', (select mindbody_id = '165'
  and email = 'mina@example.com' and address = '1 Main St, LA' and phone = '(213) 555-0142'
  from public.students where id = current_setting('t.mina')::uuid));
select t.check('mindbody: family sharing a phone stays two people', (select count(*) = 2 from public.students where phone = '2135550100'));
select t.check('mindbody: re-import updates, adds nothing', public.import_members('MINDBODY', $$[
  {"mindbody_id":"165","full_name":"Mina Cho","phone":"999","email":"other@example.com"},
  {"mindbody_id":"46","full_name":"Hannah Lee","phone":"2135550100"}
]$$) = '{"added":0,"linked":0,"updated":2,"skipped":0}');
select t.check('mindbody: owner data not overwritten', (select email = 'mina@example.com' and phone = '(213) 555-0142'
  from public.students where mindbody_id = '165'));

-- Schedulista: matches by phone + name, keeps its own fields ------------------------------
select t.check('schedulista: import', public.import_members('SCHEDULISTA', $$[
  {"full_name":"Lee Hannah","phone":"(213) 555-0100","last_visit":"2026-09-18 18:30:00","next_visit":"2026-10-13 18:30:00",
   "visits":"44","services":["Private with Sunnie ","Pilates Group"],"notes":"Knee injury"},
  {"full_name":"Sara Kim","phone":"3105550199","visits":"3","services":[]},
  {"full_name":"Grace Lee","phone":"2135550100","visits":"1"}
]$$) = '{"added":2,"linked":1,"updated":0,"skipped":0}');
select t.check('schedulista: Hannah is one member from both systems', (select mindbody_id = '46'
  and schedulista_key = 'lee hannah|2135550100' and schedulista_visits = 44
  and schedulista_last_visit = '2026-09-18 18:30:00' and schedulista_services = '{Private with Sunnie,Pilates Group}'
  and schedulista_notes = 'Knee injury' and schedulista_imported_at is not null and mindbody_imported_at is not null
  from public.students where full_name = 'Hannah Lee'));
select t.check('schedulista: re-import is idempotent', public.import_members('SCHEDULISTA', $$[
  {"full_name":"Sara Kim","phone":"3105550199","visits":"4"}
]$$) = '{"added":0,"linked":0,"updated":1,"skipped":0}');
select t.check('5 members in all', (select count(*) = 5 from public.students));
select t.expect_error('import: bad source', '22023', $$select public.import_members('EXCEL', '[]')$$);
reset role;

-- Edit ----------------------------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.update_member((select id from public.students where full_name = 'Sara Kim'),
  'Sara Kim-Park', '310-555-0199', 'SARA@x.com', '', 'prefers mornings', 'INACTIVE');
select t.check('edit: saved', (select email = 'sara@x.com' and notes = 'prefers mornings' and status = 'INACTIVE'
  from public.students where full_name = 'Sara Kim-Park'));
select t.check('edit: inactive members leave staff search', (select count(*) = 0 from public.search_students('sara')));
select t.expect_error('edit: blank name', '23514', format($$select public.update_member('%s', ' ', '', '', '', '', 'ACTIVE')$$,
  current_setting('t.mina')));
select t.expect_error('edit: unknown member', 'P0002',
  $$select public.update_member('00000000-0000-0000-0000-00000000ffff', 'X', '', '', '', '', 'ACTIVE')$$);
reset role;

-- Instructors cannot import or edit members; reading follows Settings → Admin (Clients) ------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('instructor: no import', '42501', $$select public.import_members('MINDBODY', '[]')$$);
select t.expect_error('instructor: no edit', '42501', format($$select public.update_member('%s', 'X', '', '', '', '', 'ACTIVE')$$,
  current_setting('t.mina')));
select t.check('instructor: Clients menu on by default, reads members', (select count(*) > 0 from public.students));
reset role;
delete from public.role_menu_access where role = 'INSTRUCTOR' and menu = 'clients';
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('instructor: Clients menu off, members table reads 0 rows', (select count(*) = 0 from public.students));
select t.check('instructor: finds an imported member in search', (select count(*) = 1 and min(phone_last4) = '0100'
  from public.search_students('hannah')));
reset role;
select t.as_anon();
select t.expect_error('anon: no import', '42501', $$select public.import_members('MINDBODY', '[]')$$);
reset role;

-- Merge duplicates (same name from both systems) ------------------------------------------------
reset role;
insert into public.students (full_name, phone, email, mindbody_id) values
  ('Jiwoo Han', '', 'jiwoo@example.com', '900'),              -- Mindbody, email only
  ('Lena Park', '3105550001', '', '901'),                      -- same name, different phone: maybe two people
  ('Lena Park', '3105550002', '', '902'),
  ('김하나', '2135550777', '', '903');
insert into public.students (full_name, phone, schedulista_key, schedulista_visits, notes) values
  ('han, jiwoo', '(323) 555-0123', 'han, jiwoo|3235550123', 7, 'prefers evenings'),   -- Schedulista, phone only
  ('김하나', '', '김하나|', 2, '');
insert into public.payment_transactions (student_id, payer_name, amount_cents, method, business_date, recorded_by, recorded_by_name, client_request_id, collected_by, collected_by_name)
select id, full_name, 5000, 'CASH', '2026-10-01', '00000000-0000-0000-0000-0000000000a1', 'Owner', gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', 'Owner'
  from public.students where schedulista_key = 'han, jiwoo|3235550123';
select t.check('merge: name key', app.client_name_key('Han,  JIWOO 2') = 'han jiwoo' and app.client_name_key('김하나') = '김하나');
select t.check('merge: result', app.merge_duplicate_clients() = '{"merged":2,"left_apart":1}');
select t.check('merge: one Jiwoo from both systems, payment kept on it', (select count(*) = 1 and bool_and(
    mindbody_id = '900' and schedulista_key = 'han, jiwoo|3235550123' and schedulista_visits = 7
    and email = 'jiwoo@example.com' and phone = '(323) 555-0123' and notes = 'prefers evenings' and status = 'ACTIVE'
    and (select count(*) = 1 from public.payment_transactions p where p.student_id = s.id))
  from public.students s where merged_into is null and app.client_name_key(full_name) = 'han jiwoo'));
select t.check('merge: hidden row kept, not deleted', (select count(*) = 2 and bool_and(status = 'INACTIVE'
    and mindbody_id is null and schedulista_key is null)
  from public.students where merged_into is not null));
select t.check('merge: Korean name merged', (select count(*) = 1 from public.students where full_name = '김하나' and merged_into is null));
select t.check('merge: same name, different phones left apart', (select count(*) = 2 from public.students
  where full_name = 'Lena Park' and merged_into is null));
select t.check('merge: running again changes nothing', app.merge_duplicate_clients() = '{"merged":0,"left_apart":1}');
-- Re-import after merging matches the kept client; a new same-name person from the other system links instead of duplicating
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('merge: merged client leaves staff search', (select count(*) = 1 from public.search_students('jiwoo')));
select t.check('merge: re-import finds the kept client', public.import_members('SCHEDULISTA', $$[
  {"full_name":"han, jiwoo","phone":"(323) 555-0123","visits":"8"},
  {"full_name":"김하나","visits":"3"}
]$$) = '{"added":0,"linked":0,"updated":2,"skipped":0}');
select t.check('merge: import links by name when nothing conflicts', public.import_members('MINDBODY', $$[
  {"mindbody_id":"904","full_name":"Grace Lee","email":"grace@example.com"}
]$$) = '{"added":0,"linked":1,"updated":0,"skipped":0}');
select t.check('merge: import keeps same name with another phone apart', public.import_members('SCHEDULISTA', $$[
  {"full_name":"Lena Park","phone":"3105550003"}
]$$) = '{"added":1,"linked":0,"updated":0,"skipped":0}');
reset role;

select app.check_api_exposure();

rollback;
\echo members: all checks passed
