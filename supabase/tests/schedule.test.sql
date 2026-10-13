-- Tests for the Schedule calendar (run with supabase/tests/run-local.sh). Rolled back at the end.
-- All names and phone numbers are invented.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated;

create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception '[%] failed', p_label; end if;
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

-- The n-th date (1-based) of the series that appointment t.rep belongs to.
create function t.nth(p_n int) returns uuid language sql as $$
  select id from public.appointments
   where series_id = (select series_id from public.appointments where id = current_setting('t.rep')::uuid)
   order by starts_at offset p_n - 1 limit 1
$$;

create function t.la(p_id uuid) returns text language sql as $$
  select to_char(starts_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') from public.appointments where id = p_id
$$;

grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'staff@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'ivy@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'joann@test.local');
select app.grant_owner('owner@test.local', 'Olive Owner');
insert into public.staff_profiles (user_id, full_name, email, role, roles, status) values
  ('00000000-0000-0000-0000-0000000000a2', 'Ivan Admin', 'admin@test.local', 'ADMIN', '{ADMIN}', 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000000b1', 'Sam Staff', 'staff@test.local', 'STAFF', '{STAFF}', 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000000b2', 'Ivy Kim', 'ivy@test.local', 'INSTRUCTOR', '{INSTRUCTOR}', 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000000b3', 'Jo ann LEE', 'joann@test.local', 'INSTRUCTOR', '{INSTRUCTOR}', 'INACTIVE');
insert into public.students (id, full_name, phone, schedulista_key) values
  ('00000000-0000-0000-0000-0000000000c1', 'Mina Park', '(310) 555-0101', 'mina park|3105550101'),
  ('00000000-0000-0000-0000-0000000000c2', 'Hana Cho', '213-555-0199', null),
  ('00000000-0000-0000-0000-0000000000c3', 'Theo Grant', '', null);

select t.check('services seeded', (select count(*) = 4 from public.schedule_services)
  and exists (select 1 from public.schedule_services where name = 'Pilates Group' and capacity = 5 and sort = 3));
select t.check('text delay defaults to 15', (select change_text_minutes = 15 from public.schedule_settings));

-- Studio time, DST included ------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.dst1', public.save_appointment('{"start":"2026-03-08 10:00","minutes":50,
  "staff_id":"00000000-0000-0000-0000-0000000000b2","service":"Private","capacity":1,
  "clients":[{"student_id":"00000000-0000-0000-0000-0000000000c1","status":"BOOKED","notes":"Knee"}]}')::text, true);
select set_config('t.dst2', public.save_appointment('{"start":"2026-11-01 10:00","minutes":50,"staff_id":null,
  "service":"Workshop","capacity":10,"clients":[]}')::text, true);
select t.check('DST start day: 10:00 PDT = 17:00 UTC',
  (select starts_at = '2026-03-08 17:00:00+00' from public.appointments where id = current_setting('t.dst1')::uuid));
select t.check('DST end day: 10:00 PST = 18:00 UTC',
  (select starts_at = '2026-11-01 18:00:00+00' from public.appointments where id = current_setting('t.dst2')::uuid));
select t.check('booking copies name and phone from Clients', exists (select 1 from public.appointment_clients
  where appointment_id = current_setting('t.dst1')::uuid and student_id = '00000000-0000-0000-0000-0000000000c1'
    and client_name = 'Mina Park' and client_phone = '(310) 555-0101' and status = 'BOOKED' and notes = 'Knee'));
select t.check('created_by is the caller, no series', (select created_by = '00000000-0000-0000-0000-0000000000a1'
  and series_id is null and not series_changed from public.appointments where id = current_setting('t.dst1')::uuid));
select t.expect_error('bad start format', '22023',
  $$select public.save_appointment('{"start":"2026-3-8 10:00","minutes":50,"service":"Private","capacity":1,"clients":[]}')$$);
select t.expect_error('no such date', '22023',
  $$select public.save_appointment('{"start":"2026-02-30 10:00","minutes":50,"service":"Private","capacity":1,"clients":[]}')$$);
select t.expect_error('minutes out of range', '22023',
  $$select public.save_appointment('{"start":"2026-03-09 10:00","minutes":2,"service":"Private","capacity":1,"clients":[]}')$$);
select t.expect_error('unknown instructor', '23503',
  $$select public.save_appointment('{"start":"2026-03-09 10:00","minutes":50,"staff_id":"00000000-0000-0000-0000-0000000000ff",
    "service":"Private","capacity":1,"clients":[]}')$$);
select t.expect_error('unknown client', 'P0002',
  $$select public.save_appointment('{"start":"2026-03-09 10:00","minutes":50,"service":"Private","capacity":1,
    "clients":[{"student_id":"00000000-0000-0000-0000-0000000000ff"}]}')$$);
select t.expect_error('unknown appointment', 'P0002',
  $$select public.save_appointment('{"id":"00000000-0000-0000-0000-0000000000ff","start":"2026-03-09 10:00","minutes":50,
    "service":"Private","capacity":1,"clients":[]}')$$);
select t.expect_error('move: bad start', '22023',
  $$select public.move_appointment(current_setting('t.dst1')::uuid, '2026-03-08T10:00')$$);
select t.expect_error('table not writable directly', '42501',
  $$insert into public.appointments (starts_at, minutes, service) values (now(), 50, 'Direct')$$);
select t.expect_error('bookings not writable directly', '42501',
  $$update public.appointment_clients set status = 'ATTENDED'$$);

-- Capacity -------------------------------------------------------------------------------
select t.expect_error('class is full', '23514',
  $$select public.save_appointment('{"start":"2026-03-10 10:00","minutes":50,"service":"Private","capacity":1,"clients":[
    {"student_id":"00000000-0000-0000-0000-0000000000c1"},{"student_id":"00000000-0000-0000-0000-0000000000c2"}]}')$$);
select t.expect_error('same client twice', '23505',
  $$select public.save_appointment('{"start":"2026-03-10 10:00","minutes":50,"service":"Duet","capacity":2,"clients":[
    {"student_id":"00000000-0000-0000-0000-0000000000c1"},{"student_id":"00000000-0000-0000-0000-0000000000c1"}]}')$$);

-- Edit clients: added from Clients, removed ones cancelled (kept) ----------------------------
select public.save_appointment(jsonb_build_object('id', current_setting('t.dst1'), 'updated_at', (select updated_at from public.appointments where id = current_setting('t.dst1')::uuid), 'start', '2026-03-08 10:00', 'minutes', 50,
  'staff_id', '00000000-0000-0000-0000-0000000000b2', 'service', 'Duet', 'capacity', 2, 'clients', jsonb_build_array(
    jsonb_build_object('id', (select id from public.appointment_clients where appointment_id = current_setting('t.dst1')::uuid),
                       'student_id', '00000000-0000-0000-0000-0000000000c1', 'status', 'CONFIRMED', 'notes', 'Knee'),
    jsonb_build_object('student_id', '00000000-0000-0000-0000-0000000000c2', 'status', 'BOOKED', 'notes', ''))));
select t.check('edit: status changed, client added', (select count(*) = 2 from public.appointment_clients
  where appointment_id = current_setting('t.dst1')::uuid and status in ('CONFIRMED', 'BOOKED')));
select t.check('edit: no series, not marked changed', (select service = 'Duet' and capacity = 2 and not series_changed
  from public.appointments where id = current_setting('t.dst1')::uuid));
select t.expect_error('edit: capacity below bookings', '23514',
  $$select public.save_appointment(jsonb_build_object('id', current_setting('t.dst1'), 'updated_at', (select updated_at from public.appointments where id = current_setting('t.dst1')::uuid), 'start', '2026-03-08 10:00', 'minutes', 50,
    'service', 'Duet', 'capacity', 1, 'clients', (select jsonb_agg(jsonb_build_object('id', id)) from public.appointment_clients
      where appointment_id = current_setting('t.dst1')::uuid)))$$);
select public.save_appointment(jsonb_build_object('id', current_setting('t.dst1'), 'updated_at', (select updated_at from public.appointments where id = current_setting('t.dst1')::uuid), 'start', '2026-03-08 10:00', 'minutes', 50,
  'staff_id', '00000000-0000-0000-0000-0000000000b2', 'service', 'Private', 'capacity', 1, 'clients', jsonb_build_array(
    jsonb_build_object('id', (select id from public.appointment_clients
                               where appointment_id = current_setting('t.dst1')::uuid and student_id = '00000000-0000-0000-0000-0000000000c1')))));
select t.check('edit: left-out booking cancelled, not deleted', (select count(*) = 2 from public.appointment_clients
  where appointment_id = current_setting('t.dst1')::uuid)
  and exists (select 1 from public.appointment_clients where appointment_id = current_setting('t.dst1')::uuid
               and student_id = '00000000-0000-0000-0000-0000000000c2' and status = 'CANCELLED'));
select t.check('edit: kept booking keeps its status', exists (select 1 from public.appointment_clients
  where appointment_id = current_setting('t.dst1')::uuid and student_id = '00000000-0000-0000-0000-0000000000c1' and status = 'CONFIRMED'));

-- Weekly repeat ------------------------------------------------------------------------------
-- Mon + Wed, 4 dates, across the end of daylight time (Nov 1): Oct 26, Oct 28, Nov 2, Nov 4.
select set_config('t.rep', public.save_appointment('{"start":"2026-10-26 09:00","minutes":50,
  "staff_id":"00000000-0000-0000-0000-0000000000b2","service":"Pilates Group","capacity":5,
  "repeat":{"every":1,"days":[1,3],"ends":"count","count":4},
  "clients":[{"student_id":"00000000-0000-0000-0000-0000000000c1","status":"BOOKED","notes":""}]}')::text, true);
select t.check('repeat: 4 dates, one series', (select count(*) = 4 and count(distinct series_id) = 1 and bool_and(series_id is not null)
  from public.appointments where series_id = (select series_id from public.appointments where id = current_setting('t.rep')::uuid)));
select t.check('repeat: returns the first date', t.nth(1) = current_setting('t.rep')::uuid);
select t.check('repeat: Mon/Wed at 09:00 studio time on both sides of DST',
  t.la(t.nth(1)) = '2026-10-26 09:00' and t.la(t.nth(2)) = '2026-10-28 09:00'
  and t.la(t.nth(3)) = '2026-11-02 09:00' and t.la(t.nth(4)) = '2026-11-04 09:00'
  and (select starts_at = '2026-11-02 17:00:00+00' from public.appointments where id = t.nth(3)));
select t.check('repeat: client on every date', (select count(*) = 4 from public.appointment_clients
  where appointment_id in (t.nth(1), t.nth(2), t.nth(3), t.nth(4)) and student_id = '00000000-0000-0000-0000-0000000000c1'));
select set_config('t.r2', public.save_appointment('{"start":"2026-10-27 08:00","minutes":50,"service":"Gyrotonic",
  "capacity":1,"repeat":{"every":2,"days":[2],"ends":"never"},"clients":[]}')::text, true);
select t.check('repeat every 2 weeks, never = 52 weeks', (select count(*) = 26 and max(starts_at)::date = '2027-10-12'
  from public.appointments where series_id = (select series_id from public.appointments where id = current_setting('t.r2')::uuid)));
select set_config('t.r3', public.save_appointment('{"start":"2026-10-28 07:00","minutes":50,"service":"Gyrotonic",
  "capacity":1,"repeat":{"every":1,"days":[3],"ends":"until","until":"2026-11-11"},"clients":[]}')::text, true);
select t.check('repeat until a date', (select count(*) = 3 from public.appointments
  where series_id = (select series_id from public.appointments where id = current_setting('t.r3')::uuid)));
select t.expect_error('repeat: no weekday', '22023',
  $$select public.save_appointment('{"start":"2026-10-27 08:00","minutes":50,"service":"Gyrotonic","capacity":1,
    "repeat":{"every":1,"days":[],"ends":"never"},"clients":[]}')$$);

-- Move 'following': this and later dates shift, earlier ones stay.
select public.move_appointment(t.nth(3), '2026-11-02 10:00', 'following');
select t.check('move following: only this and later dates', t.la(t.nth(1)) = '2026-10-26 09:00' and t.la(t.nth(2)) = '2026-10-28 09:00'
  and t.la(t.nth(3)) = '2026-11-02 10:00' and t.la(t.nth(4)) = '2026-11-04 10:00');
select t.check('move following: not marked changed', (select count(*) = 0 from public.appointments
  where id in (t.nth(1), t.nth(2), t.nth(3), t.nth(4)) and series_changed));
-- Move 'one': marked changed; Undo puts back the time and the old flag.
select public.move_appointment(t.nth(1), '2026-10-26 11:30', 'one');
select t.check('move one: marked changed', (select series_changed from public.appointments where id = t.nth(1))
  and t.la(t.nth(1)) = '2026-10-26 11:30' and (select count(*) = 1 from public.appointments
    where id in (t.nth(1), t.nth(2), t.nth(3), t.nth(4)) and series_changed));
select public.move_appointment(t.nth(1), '2026-10-26 09:00', 'one', false);
select t.check('undo: time and flag back', t.la(t.nth(1)) = '2026-10-26 09:00'
  and not (select series_changed from public.appointments where id = t.nth(1)));
-- Save scope 'one' with a new instructor marks only that date.
select public.save_appointment(jsonb_build_object('id', t.nth(2), 'updated_at', (select updated_at from public.appointments where id = t.nth(2)::uuid), 'start', '2026-10-28 09:00', 'minutes', 50,
  'staff_id', '00000000-0000-0000-0000-0000000000a1', 'service', 'Pilates Group', 'capacity', 5, 'scope', 'one',
  'clients', (select jsonb_agg(jsonb_build_object('id', id)) from public.appointment_clients where appointment_id = t.nth(2))));
select t.check('save one: only this date changed and marked', (select series_changed and staff_id = '00000000-0000-0000-0000-0000000000a1'
  from public.appointments where id = t.nth(2))
  and (select bool_and(not series_changed and staff_id = '00000000-0000-0000-0000-0000000000b2')
         from public.appointments where id in (t.nth(1), t.nth(3), t.nth(4))));
-- Save scope 'following' from date 3: new service and time on dates 3 and 4; clients only on date 3.
select public.save_appointment(jsonb_build_object('id', t.nth(3), 'updated_at', (select updated_at from public.appointments where id = t.nth(3)::uuid), 'start', '2026-11-02 08:00', 'minutes', 55,
  'staff_id', '00000000-0000-0000-0000-0000000000b2', 'service', 'Gyrotonic Group', 'capacity', 3, 'scope', 'following',
  'clients', jsonb_build_array(jsonb_build_object('student_id', '00000000-0000-0000-0000-0000000000c3'))));
select t.check('save following: dates 3-4 changed, 1-2 not', t.la(t.nth(3)) = '2026-11-02 08:00' and t.la(t.nth(4)) = '2026-11-04 08:00'
  and (select bool_and(service = 'Gyrotonic Group' and minutes = 55 and capacity = 3 and not series_changed)
         from public.appointments where id in (t.nth(3), t.nth(4)))
  and (select bool_and(service = 'Pilates Group' and minutes = 50) from public.appointments where id in (t.nth(1), t.nth(2))));
select t.check('save following: clients only on this date', exists (select 1 from public.appointment_clients
  where appointment_id = t.nth(3) and student_id = '00000000-0000-0000-0000-0000000000c3' and status = 'BOOKED')
  and (select array_agg(student_id) = '{00000000-0000-0000-0000-0000000000c1}' from public.appointment_clients
        where appointment_id = t.nth(4) and status = 'BOOKED'));
select t.check('save following: removed client cancelled on this date', exists (select 1 from public.appointment_clients
  where appointment_id = t.nth(3) and student_id = '00000000-0000-0000-0000-0000000000c1' and status = 'CANCELLED'));
-- Cancel 'following' from date 3; bookings untouched.
select public.cancel_appointment(t.nth(3), 'following');
select t.check('cancel following', (select bool_and(status = 'CANCELLED') from public.appointments where id in (t.nth(3), t.nth(4)))
  and (select bool_and(status = 'BOOKED') from public.appointments where id in (t.nth(1), t.nth(2)))
  and (select count(*) = 1 from public.appointment_clients where appointment_id = t.nth(4) and status = 'BOOKED'));
select public.cancel_appointment(current_setting('t.dst2')::uuid);
select t.check('cancel one', (select status = 'CANCELLED' from public.appointments where id = current_setting('t.dst2')::uuid));
select t.expect_error('cancel: bad scope', '22023', $$select public.cancel_appointment(current_setting('t.dst2')::uuid, 'all')$$);

-- Instructors list -------------------------------------------------------------------------
select t.check('instructors: instructors plus the owner who teaches, inactive flagged',
  (select array_agg(full_name || ':' || active order by full_name) = '{"Ivy Kim:true","Jo ann LEE:false","Olive Owner:true"}'
     from public.schedule_instructors()));

-- Settings (Owner/Admin) -------------------------------------------------------------------
select public.set_calendar_color('00000000-0000-0000-0000-0000000000b2', '#7b55a8');
select t.check('color saved in capitals', (select calendar_color = '#7B55A8' from public.schedule_instructors() where full_name = 'Ivy Kim'));
select t.expect_error('color taken', '23505',
  $$select public.set_calendar_color('00000000-0000-0000-0000-0000000000b3', '#7B55A8')$$);
select t.expect_error('color format', '23514',
  $$select public.set_calendar_color('00000000-0000-0000-0000-0000000000b3', 'purple')$$);
select public.set_calendar_color('00000000-0000-0000-0000-0000000000b2', null);
select t.check('color cleared', (select calendar_color is null from public.schedule_instructors() where full_name = 'Ivy Kim'));
select public.save_schedule_service('{"name":"Duet","minutes":55,"capacity":2,"active":true}');
select public.save_schedule_service('{"name":"Private","minutes":55,"capacity":1,"active":false}');
select t.check('service added last, edit keeps its place', exists (select 1 from public.schedule_services where name = 'Duet' and sort = 5)
  and exists (select 1 from public.schedule_services where name = 'Private' and minutes = 55 and not active and sort = 1));
select public.set_change_text_minutes(30);
select t.check('text delay saved', (select change_text_minutes = 30 from public.schedule_settings));
select public.set_change_text_minutes(null);
select t.check('text delay off', (select change_text_minutes is null from public.schedule_settings));
select public.save_schedule_service('{"name":"Private","minutes":50,"capacity":1,"active":true}');

-- Categories and service details (Settings › Schedule)
select t.check('categories seeded with their services', (select count(*) = 3 from public.schedule_categories)
  and (select c.name = 'Pilates Classes' from public.schedule_services s join public.schedule_categories c on c.id = s.category_id
        where s.name = 'Pilates Group'));
select set_config('t.cat', public.save_schedule_category('{"name":"Workshops"}')::text, true);
select t.expect_error('category name unique', '23505', $$select public.save_schedule_category('{"name":" workshops "}')$$);
select set_config('t.svc', public.save_schedule_service(jsonb_build_object('name', 'Mat Workshop', 'minutes', 90, 'capacity', 8,
  'category_id', current_setting('t.cat'), 'price_cents', 4500, 'cleanup_minutes', 10, 'description', 'Bring socks',
  'staff_ids', json_build_array('00000000-0000-0000-0000-0000000000b2')))::text, true);
select t.check('service saved with category, price, cleanup, description, instructors', exists (select 1 from public.schedule_services
  where id = current_setting('t.svc')::uuid and category_id = current_setting('t.cat')::uuid and price_cents = 4500
    and cleanup_minutes = 10 and description = 'Bring socks' and staff_ids = array['00000000-0000-0000-0000-0000000000b2'::uuid]
    and sort = 6));
select set_config('t.mw', public.save_appointment('{"start":"2026-11-02 10:00","minutes":90,"staff_id":null,
  "service":"Mat Workshop","capacity":8,"clients":[]}')::text, true);
select public.save_schedule_service(jsonb_build_object('id', current_setting('t.svc'), 'name', 'Mat Class', 'minutes', 90, 'capacity', 8));
select t.check('rename keeps the other details and renames its appointments',
  (select service = 'Mat Class' from public.appointments where id = current_setting('t.mw')::uuid)
  and exists (select 1 from public.schedule_services where id = current_setting('t.svc')::uuid and name = 'Mat Class'
               and price_cents = 4500 and category_id = current_setting('t.cat')::uuid and staff_ids is not null));
-- A rename takes only the appointments of the instructors who teach the service; the others keep the old name.
select set_config('t.r1', public.save_appointment('{"start":"2026-11-04 10:00","minutes":55,
  "staff_id":"00000000-0000-0000-0000-0000000000b2","service":"Duet","capacity":2,"clients":[]}')::text, true);
select set_config('t.r2', public.save_appointment('{"start":"2026-11-04 12:00","minutes":55,
  "staff_id":"00000000-0000-0000-0000-0000000000a1","service":"Duet","capacity":2,"clients":[]}')::text, true);
select public.save_schedule_service(jsonb_build_object('id', (select id from public.schedule_services where name = 'Duet'),
  'name', 'Duet with Ivy', 'minutes', 55, 'capacity', 2, 'staff_ids', json_build_array('00000000-0000-0000-0000-0000000000b2')));
select t.check('rename: only its instructors'' appointments take the new name',
  (select service = 'Duet with Ivy' from public.appointments where id = current_setting('t.r1')::uuid)
  and (select service = 'Duet' from public.appointments where id = current_setting('t.r2')::uuid));
select t.expect_error('rename onto another service', '23505', $$select public.save_schedule_service(
  jsonb_build_object('id', current_setting('t.svc'), 'name', 'private', 'minutes', 90, 'capacity', 8))$$);
select t.expect_error('at least one instructor', '22023',
  $$select public.save_schedule_service('{"name":"Y","minutes":50,"capacity":1,"staff_ids":[]}')$$);
select t.expect_error('category with services stays', '23503',
  $$select public.delete_schedule_category(current_setting('t.cat')::uuid)$$);
select public.set_schedule_order(array[current_setting('t.cat')::uuid], array[current_setting('t.svc')::uuid]);
select t.check('drag order saved', (select sort = 1 from public.schedule_categories where id = current_setting('t.cat')::uuid)
  and (select sort = 1 from public.schedule_services where id = current_setting('t.svc')::uuid));
select public.save_schedule_service(jsonb_build_object('id', current_setting('t.svc'), 'name', 'Mat Class', 'minutes', 90,
  'capacity', 8, 'category_id', null, 'staff_ids', null));
select public.delete_schedule_category(current_setting('t.cat')::uuid);
select t.check('empty category deleted, service kept without one', not exists (select 1 from public.schedule_categories
  where id = current_setting('t.cat')::uuid) and (select category_id is null and staff_ids is null from public.schedule_services
  where id = current_setting('t.svc')::uuid));
select set_config('t.trio', public.save_schedule_service('{"name":"Trio","minutes":50,"capacity":3}')::text, true);
select set_config('t.ta', public.save_appointment('{"start":"2026-11-03 10:00","minutes":50,"staff_id":null,
  "service":"Trio","capacity":3,"clients":[]}')::text, true);
select public.delete_schedule_service(current_setting('t.trio')::uuid);
select t.check('service deleted, its appointments keep the name', not exists (select 1 from public.schedule_services
  where id = current_setting('t.trio')::uuid) and (select service = 'Trio' and capacity = 3 from public.appointments
  where id = current_setting('t.ta')::uuid));
-- Others: a guest category; its service names the guest instead of staff.
select set_config('t.ev', public.save_schedule_category('{"name":"Events","guest":true}')::text, true);
select set_config('t.ws', public.save_schedule_service(jsonb_build_object('name', 'Reformer Workshop', 'minutes', 120, 'capacity', 10,
  'category_id', current_setting('t.ev'), 'guest_instructor', ' Ana Guest '))::text, true);
select public.save_schedule_category(jsonb_build_object('id', current_setting('t.ev'), 'name', 'Events'));
select t.check('guest category and its service', (select guest from public.schedule_categories where id = current_setting('t.ev')::uuid)
  and (select guest_instructor = 'Ana Guest' from public.schedule_services where id = current_setting('t.ws')::uuid));
select public.save_schedule_service(jsonb_build_object('id', current_setting('t.ws'), 'name', 'Reformer Workshop', 'minutes', 120,
  'capacity', 10));
select t.check('a save without guest_instructor keeps it', (select guest_instructor = 'Ana Guest' from public.schedule_services
  where id = current_setting('t.ws')::uuid));
select set_config('t.ga', public.save_appointment('{"start":"2026-11-07 10:00","minutes":120,"staff_id":null,
  "guest_instructor":" Ana Guest ","service":"Reformer Workshop","capacity":10,"clients":[]}')::text, true);
select set_config('t.gb', public.save_appointment('{"start":"2026-11-07 14:00","minutes":50,
  "staff_id":"00000000-0000-0000-0000-0000000000b2","guest_instructor":"Ana Guest","service":"Private","capacity":1,"clients":[]}')::text, true);
select t.check('appointment names its guest only without staff',
  (select guest_instructor = 'Ana Guest' and staff_id is null from public.appointments where id = current_setting('t.ga')::uuid)
  and (select guest_instructor = '' from public.appointments where id = current_setting('t.gb')::uuid));
select public.save_appointment(jsonb_build_object('id', current_setting('t.ga'), 'updated_at', (select updated_at from public.appointments where id = current_setting('t.ga')::uuid), 'start', '2026-11-07 10:00', 'minutes', 120,
  'staff_id', null, 'guest_instructor', 'Bo Guest', 'service', 'Reformer Workshop', 'capacity', 10, 'clients', '[]'::jsonb));
select t.check('edit changes the guest', (select guest_instructor = 'Bo Guest' from public.appointments where id = current_setting('t.ga')::uuid));
select t.expect_error('guest name up to 80', '22023', $$select public.save_appointment(jsonb_build_object('start', '2026-11-08 10:00',
  'minutes', 50, 'staff_id', null, 'guest_instructor', repeat('x', 81), 'service', 'Reformer Workshop', 'capacity', 1, 'clients', '[]'::jsonb))$$);
select public.delete_schedule_service(current_setting('t.ws')::uuid);
select public.delete_schedule_category(current_setting('t.ev')::uuid);
reset role;

-- Admin: same as owner ---------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a2');
select public.move_appointment(current_setting('t.dst1')::uuid, '2026-03-08 11:00');
select public.set_calendar_color('00000000-0000-0000-0000-0000000000b3', '#D63A43');
select public.set_change_text_minutes(15);
select public.set_other_color(' #2e9aa6 ');
select t.check('admin sets the Other color', (select other_color = '#2E9AA6' from public.schedule_settings));
select t.expect_error('Other color must be #RRGGBB', '23514', $$select public.set_other_color('teal')$$);
select t.check('admin reads, moves, sets colors', t.la(current_setting('t.dst1')::uuid) = '2026-03-08 11:00'
  and (select calendar_color = '#D63A43' from public.schedule_instructors() where full_name = 'Jo ann LEE'));
reset role;

-- Staff with Schedule access (default): calendar yes, settings no ---------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('staff reads the calendar', (select count(*) > 0 from public.appointments)
  and (select count(*) > 0 from public.appointment_clients) and (select count(*) = 6 from public.schedule_services)
  and (select count(*) = 3 from public.schedule_categories) and (select count(*) = 1 from public.schedule_settings));
select set_config('t.st', public.save_appointment('{"start":"2026-10-30 12:00","minutes":50,"staff_id":null,
  "service":"Workshop","capacity":8,"clients":[{"student_id":"00000000-0000-0000-0000-0000000000c2"}]}')::text, true);
select public.move_appointment(current_setting('t.st')::uuid, '2026-10-30 13:00');
select public.cancel_appointment(current_setting('t.st')::uuid);
select t.check('staff saves, moves, cancels', (select status = 'CANCELLED' and created_by = '00000000-0000-0000-0000-0000000000b1'
  from public.appointments where id = current_setting('t.st')::uuid) and t.la(current_setting('t.st')::uuid) = '2026-10-30 13:00');
select t.expect_error('staff: no colors', '42501', $$select public.set_calendar_color('00000000-0000-0000-0000-0000000000b2', '#3C78C8')$$);
select t.expect_error('staff: no services', '42501', $$select public.save_schedule_service('{"name":"X","minutes":50,"capacity":1}')$$);
select t.expect_error('staff: no categories', '42501', $$select public.save_schedule_category('{"name":"X"}')$$);
select t.expect_error('staff: no reorder', '42501', $$select public.set_schedule_order(null, null)$$);
select t.expect_error('staff: no service delete', '42501', $$select public.delete_schedule_service(gen_random_uuid())$$);
select t.expect_error('staff: no text delay', '42501', $$select public.set_change_text_minutes(5)$$);
select t.expect_error('staff: no Other color', '42501', $$select public.set_other_color('#3C78C8')$$);
select t.expect_error('staff: no import', '42501', $$select public.import_schedule('[]', false)$$);
select t.check('staff: client search by name and phone', (select phone_last4 = '0101' from public.schedule_search_clients('mina'))
  and (select count(*) = 1 from public.schedule_search_clients('555-0199')) and (select count(*) = 0 from public.schedule_search_clients('m')));
reset role;

-- Instructor without Schedule access: nothing ------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('instructor reads 0 rows', (select count(*) = 0 from public.appointments)
  and (select count(*) = 0 from public.appointment_clients) and (select count(*) = 0 from public.schedule_services)
  and (select count(*) = 0 from public.schedule_categories));
select t.expect_error('instructor cannot save', '42501',
  $$select public.save_appointment('{"start":"2026-10-30 12:00","minutes":50,"service":"Private","capacity":1,"clients":[]}')$$);
select t.expect_error('instructor cannot move', '42501',
  $$select public.move_appointment(current_setting('t.dst1')::uuid, '2026-03-08 12:00')$$);
select t.expect_error('instructor cannot cancel', '42501', $$select public.cancel_appointment(current_setting('t.dst1')::uuid)$$);
select t.expect_error('instructor cannot list instructors', '42501', $$select public.schedule_instructors()$$);
select t.expect_error('instructor cannot search clients', '42501', $$select public.schedule_search_clients('mina')$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.set_role_menu_access('INSTRUCTOR', 'schedule', true);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('instructor with Schedule turned on reads it', (select count(*) > 0 from public.appointments));
reset role;

-- Signed out: nothing ----------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select t.expect_error('anon: no table', '42501', $$select * from public.appointments$$);
select t.expect_error('anon: no bookings', '42501', $$select * from public.appointment_clients$$);
select t.expect_error('anon: no list', '42501', $$select public.schedule_instructors()$$);
select t.expect_error('anon: no client search', '42501', $$select public.schedule_search_clients('mina')$$);
select t.expect_error('anon: no save', '42501',
  $$select public.save_appointment('{"start":"2026-10-30 12:00","minutes":50,"service":"Private","capacity":1,"clients":[]}')$$);
select t.expect_error('anon: no move', '42501', $$select public.move_appointment(current_setting('t.dst1')::uuid, '2026-03-08 12:00')$$);
select t.expect_error('anon: no cancel', '42501', $$select public.cancel_appointment(current_setting('t.dst1')::uuid)$$);
select t.expect_error('anon: no color', '42501', $$select public.set_calendar_color(null, null)$$);
select t.expect_error('anon: no service', '42501', $$select public.save_schedule_service('{}')$$);
select t.expect_error('anon: no text delay', '42501', $$select public.set_change_text_minutes(1)$$);
select t.expect_error('anon: no import', '42501', $$select public.import_schedule('[]', true)$$);
reset role;

-- Schedulista import -----------------------------------------------------------------------
-- Row 2 private (client matched by Schedulista key), rows 3-5 a group class with 3 clients
-- (matched by phone + name / not matched / no phone), row 6 unknown instructor, row 7 bad date,
-- row 8 same booking as row 2, row 9 a studio event (no instructor) in summer time.
select set_config('t.csv', $$[
  {"row":2,"start":"2026-01-05 10:00","minutes":50,"service":"Private","instructor":"Ivy","source_service":"Private Session",
   "client_name":"Mina  Park","client_phone":"(310) 555-0101","client_email":"","notes":"","price_cents":9500,"created":"2025-12-20 14:03:00"},
  {"row":3,"start":"2026-01-05 18:00","minutes":50,"service":"Group Mat","instructor":"Jo Ann","source_service":"Group Mat",
   "client_name":"Hana Cho","client_phone":"213.555.0199","client_email":"","notes":"","price_cents":null,"created":""},
  {"row":4,"start":"2026-01-05 18:00","minutes":55,"service":"Group Mat","instructor":"Jo Ann","source_service":"Group Mat",
   "client_name":"Leo Rivers","client_phone":"424-555-0123","client_email":"LEO@example.com","notes":"first class","price_cents":null,"created":""},
  {"row":5,"start":"2026-01-05 18:00","minutes":50,"service":"Group Mat","instructor":"Jo Ann","source_service":"Group Mat",
   "client_name":"Ray Example","client_phone":"","client_email":"","notes":"","price_cents":null,"created":""},
  {"row":6,"start":"2026-01-06 09:00","minutes":50,"service":"Private","instructor":"Nora Nobody","source_service":"Private Session",
   "client_name":"Mina Park","client_phone":"(310) 555-0101","client_email":"","notes":"","price_cents":null,"created":""},
  {"row":7,"start":"2026-13-40 09:00","minutes":50,"service":"Private","instructor":"Ivy","source_service":"Private Session",
   "client_name":"Mina Park","client_phone":"(310) 555-0101","client_email":"","notes":"","price_cents":null,"created":""},
  {"row":8,"start":"2026-01-05 10:00","minutes":50,"service":"Private","instructor":"Ivy","source_service":"Private Session",
   "client_name":"mina park","client_phone":"310-555-0101","client_email":"","notes":"","price_cents":null,"created":""},
  {"row":9,"start":"2026-07-06 10:00","minutes":120,"service":"Workshop","instructor":"","source_service":"Spring Workshop",
   "client_name":"Mina Park","client_phone":"(310) 555-0101","client_email":"","notes":"","price_cents":null,"created":""}
]$$, true);

select t.login('00000000-0000-0000-0000-0000000000a2');
select set_config('t.dry', public.import_schedule(current_setting('t.csv')::jsonb, false)::text, true);
reset role;
select t.check('dry run counts', current_setting('t.dry')::jsonb - 'errors'
  = '{"total":8,"importable":5,"duplicates":1,"failed":2,"appointments_new":3}'::jsonb);
select t.check('dry run errors', (current_setting('t.dry')::jsonb -> 'errors')
  = '[{"row":6,"reason":"Instructor not found: Nora Nobody"},{"row":7,"reason":"Missing or invalid date/time."}]'::jsonb);
select t.check('dry run wrote nothing', (select count(*) = 0 from public.appointments where source_key is not null)
  and (select count(*) = 0 from public.appointment_clients where source_key is not null));

select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.imp', public.import_schedule(current_setting('t.csv')::jsonb, true)::text, true);
reset role;
select t.check('commit counts = dry run', current_setting('t.imp')::jsonb = current_setting('t.dry')::jsonb);
select t.check('import: rows saved', (select count(*) = 3 from public.appointments where source_key like 'SCHEDULISTA|%')
  and (select count(*) = 5 from public.appointment_clients where source_key like 'SCHEDULISTA|%'));
select t.check('import: private at 10:00 PST, Ivy, client linked by key', exists (select 1 from public.appointments a
  join public.appointment_clients b on b.appointment_id = a.id
  where a.source_key = 'SCHEDULISTA|2026-01-05 10:00|private session' and a.starts_at = '2026-01-05 18:00:00+00'
    and a.staff_id = '00000000-0000-0000-0000-0000000000b2' and a.service = 'Private' and a.capacity = 1 and a.minutes = 50
    and b.student_id = '00000000-0000-0000-0000-0000000000c1' and b.client_name = 'Mina Park' and b.price_cents = 9500
    and b.source_created_at = '2025-12-20 14:03:00' and b.source_key = 'SCHEDULISTA|2026-01-05 10:00|private session|mina park|3105550101'));
select t.check('import: group of 3, inactive instructor matched, longest length, room for all', exists (select 1 from public.appointments a
  where a.source_key = 'SCHEDULISTA|2026-01-05 18:00|group mat' and a.starts_at = '2026-01-06 02:00:00+00'
    and a.staff_id = '00000000-0000-0000-0000-0000000000b3' and a.minutes = 55 and a.capacity = 3
    and (select count(*) = 3 from public.appointment_clients b where b.appointment_id = a.id)));
select t.check('import: matched by phone and name', exists (select 1 from public.appointment_clients
  where client_name = 'Hana Cho' and student_id = '00000000-0000-0000-0000-0000000000c2'));
select t.check('import: unmatched keeps name and phone', exists (select 1 from public.appointment_clients
  where client_name = 'Leo Rivers' and client_phone = '424-555-0123' and client_email = 'leo@example.com'
    and notes = 'first class' and student_id is null)
  and exists (select 1 from public.appointment_clients where client_name = 'Ray Example' and student_id is null));
select t.check('import: studio event at 10:00 PDT, no instructor', exists (select 1 from public.appointments
  where source_key like 'SCHEDULISTA|2026-07-06 10:00|%' and starts_at = '2026-07-06 17:00:00+00' and staff_id is null
    and minutes = 120 and capacity = 1));

select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.again', public.import_schedule(current_setting('t.csv')::jsonb, true)::text, true);
select t.check('import again: all duplicates, nothing new', current_setting('t.again')::jsonb - 'errors'
  = '{"total":8,"importable":0,"duplicates":6,"failed":2,"appointments_new":0}'::jsonb
  and (select count(*) = 3 from public.appointments where source_key is not null)
  and (select count(*) = 5 from public.appointment_clients where source_key is not null));
select set_config('t.late', public.import_schedule('[{"row":2,"start":"2026-01-05 18:00","minutes":50,"service":"Group Mat",
  "instructor":"jo ann","source_service":"Group Mat","client_name":"Theo Grant","client_phone":"","client_email":"","notes":"",
  "price_cents":null,"created":""}]', true)::text, true);
select t.check('import: a later booking joins the class and raises its capacity',
  (current_setting('t.late')::jsonb ->> 'appointments_new') = '0'
  and (select capacity = 4 from public.appointments where source_key = 'SCHEDULISTA|2026-01-05 18:00|group mat'));
select t.check('import: instructor matching two users fails', (public.import_schedule('[{"row":2,"start":"2026-01-07 10:00",
  "minutes":50,"service":"Private","instructor":"Iv","source_service":"x","client_name":"Pat Doe","client_phone":"","client_email":"",
  "notes":"","price_cents":null,"created":""}]', false) -> 'errors' -> 0 ->> 'reason') = 'Instructor matches more than one user: Iv');
select t.check('import: errors capped at 200, failed is the real count',
  (select r ->> 'failed' = '205' and jsonb_array_length(r -> 'errors') = 200
     from public.import_schedule((select jsonb_agg(jsonb_build_object('row', i, 'start', 'x')) from generate_series(1, 205) i), false) x(r)));
select t.expect_error('import: rows must be a list', '22023', $$select public.import_schedule('{}', false)$$);
-- Same phone, first name matches, but Mina Park has her own Schedulista key: someone else in the household.
select public.import_schedule('[{"row":2,"start":"2026-01-08 10:00","minutes":50,"service":"Private","instructor":"Ivy",
  "source_service":"Private Session","client_name":"Mina Lee","client_phone":"(310) 555-0101","client_email":"","notes":"",
  "price_cents":null,"created":""}]', true);
select t.check('import: phone match never takes a client who has their own key', exists (select 1 from public.appointment_clients
  where client_name = 'Mina Lee' and student_id is null));
select t.expect_error('repeat until more than a year ahead', '22023', $$select public.save_appointment('{"start":"2026-10-30 12:00",
  "minutes":50,"service":"Private","capacity":1,"clients":[],"repeat":{"every":1,"days":[5],"ends":"until","until":"2099-12-31"}}')$$);
-- A service renamed in Settings still takes the rows Schedulista exports under its old name.
select public.save_schedule_service(jsonb_build_object('id', (select id from public.schedule_services where name = 'Gyrotonic Group'),
  'name', 'Gyro Tower Group', 'minutes', 50, 'capacity', 3));
select public.import_schedule('[{"row":2,"start":"2026-01-09 10:00","minutes":50,"service":"Gyrotonic Group","instructor":"Ivy",
  "source_service":"Gyrotonic Group with Ivy","client_name":"Pat Doe","client_phone":"","client_email":"","notes":"",
  "price_cents":null,"created":""}]', true);
select t.check('import: a renamed service keeps taking its Schedulista rows', (select service = 'Gyro Tower Group' and capacity = 3
  from public.appointments where source_key = 'SCHEDULISTA|2026-01-09 10:00|gyrotonic group with ivy'));
-- A service named like Schedulista's whole name wins over the plain one.
select public.save_schedule_service('{"name":"Private with Ivy","minutes":50,"capacity":1}');
select public.import_schedule('[{"row":2,"start":"2026-01-09 11:00","minutes":50,"service":"Private","instructor":"Ivy",
  "source_service":"Private with Ivy -","client_name":"Pat Doe","client_phone":"","client_email":"","notes":"",
  "price_cents":null,"created":""}]', true);
select t.check('import: Schedulista''s whole service name picks that service', (select service = 'Private with Ivy'
  from public.appointments where source_key = 'SCHEDULISTA|2026-01-09 11:00|private with ivy -'));
-- Once the renamed service is Ivy's only, another instructor's rows keep the plain name.
select public.save_schedule_service(jsonb_build_object('id', (select id from public.schedule_services where name = 'Gyro Tower Group'),
  'name', 'Gyro Tower Group', 'minutes', 50, 'capacity', 3, 'staff_ids', json_build_array('00000000-0000-0000-0000-0000000000b2')));
select public.import_schedule('[{"row":2,"start":"2026-01-09 12:00","minutes":50,"service":"Gyrotonic Group","instructor":"jo ann",
  "source_service":"Gyrotonic Group with Jo","client_name":"Pat Doe","client_phone":"","client_email":"","notes":"",
  "price_cents":null,"created":""}]', true);
select t.check('import: a service only takes the rows of an instructor who teaches it', (select service = 'Gyrotonic Group'
  from public.appointments where source_key = 'SCHEDULISTA|2026-01-09 12:00|gyrotonic group with jo'));
-- Merging two clients moves the dropped one's bookings to the kept one.
select public.merge_clients('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'Mina Park');
select t.check('merge: bookings follow the kept client', not exists (select 1 from public.appointment_clients
  where student_id = '00000000-0000-0000-0000-0000000000c2')
  and exists (select 1 from public.appointment_clients where client_name = 'Hana Cho' and student_id = '00000000-0000-0000-0000-0000000000c1'));
reset role;

-- A save from an older copy of an appointment is refused (audit AUDIT-004) -----------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.st', public.save_appointment('{"start":"2026-12-01 10:00","minutes":60,
  "staff_id":"00000000-0000-0000-0000-0000000000b2","service":"Pilates Group","capacity":5,
  "clients":[{"student_id":"00000000-0000-0000-0000-0000000000c1"}]}')::text, true);
select set_config('t.st_old', (select updated_at::text from public.appointments where id = current_setting('t.st')::uuid), true);
-- Someone else adds a second client.
select public.save_appointment(jsonb_build_object('id', current_setting('t.st'), 'updated_at', current_setting('t.st_old'),
  'start', '2026-12-01 10:00', 'minutes', 60, 'staff_id', '00000000-0000-0000-0000-0000000000b2', 'service', 'Pilates Group', 'capacity', 5,
  'clients', jsonb_build_array(
    jsonb_build_object('id', (select id from public.appointment_clients where appointment_id = current_setting('t.st')::uuid)),
    jsonb_build_object('student_id', '00000000-0000-0000-0000-0000000000c2'))));
-- The first screen, not reloaded, changes the length with its old client list.
select t.expect_error('stale save refused', 'LPSTL',
  $$select public.save_appointment(jsonb_build_object('id', current_setting('t.st'), 'updated_at', current_setting('t.st_old'),
    'start', '2026-12-01 10:00', 'minutes', 90, 'staff_id', '00000000-0000-0000-0000-0000000000b2', 'service', 'Pilates Group', 'capacity', 5,
    'clients', jsonb_build_array(jsonb_build_object('id', (select id from public.appointment_clients
      where appointment_id = current_setting('t.st')::uuid and student_id = '00000000-0000-0000-0000-0000000000c1')))))$$);
select t.check('stale save: the added client stays booked, length unchanged',
  (select count(*) = 2 from public.appointment_clients where appointment_id = current_setting('t.st')::uuid and status = 'BOOKED')
  and (select minutes = 60 from public.appointments where id = current_setting('t.st')::uuid));
select t.expect_error('edit without updated_at refused', 'LPSTL',
  $$select public.save_appointment(jsonb_build_object('id', current_setting('t.st'), 'start', '2026-12-01 10:00', 'minutes', 90,
    'staff_id', '00000000-0000-0000-0000-0000000000b2', 'service', 'Pilates Group', 'capacity', 5, 'clients', '[]'::jsonb))$$);

-- Someone with appointments can't be deleted; deactivate instead (audit AUDIT-003) --------
select t.expect_error('delete instructor with appointments refused', 'LPREF',
  $$select public.delete_staff_user('00000000-0000-0000-0000-0000000000b2')$$);
select t.check('instructor still on their appointments',
  exists (select 1 from public.appointments where staff_id = '00000000-0000-0000-0000-0000000000b2'));
reset role;

select app.check_api_exposure();

rollback;
\echo schedule: all checks passed
