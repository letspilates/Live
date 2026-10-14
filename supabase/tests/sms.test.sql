-- Tests for client texts (run with supabase/tests/run-local.sh). Rolled back at the end.
-- All names and phone numbers are invented.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated, service_role;

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

-- Studio wall-clock text for now() + p.
create function t.at(p interval) returns text language sql as $$
  select to_char((now() + p) at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI')
$$;

-- Everything due now goes out (as sms-send would), reported SENT; returns the claimed rows.
create function t.send() returns setof public.sms_messages language plpgsql as $$
declare r record;
begin
  update public.sms_messages set send_after = now() - interval '1 second' where status = 'QUEUED';
  for r in select * from public.sms_claim(50) loop
    perform public.sms_result(r.out_id, 'SENT', 'SM' || md5(r.out_id::text), '', null);
    return query select * from public.sms_messages where id = r.out_id;
  end loop;
end $$;

grant execute on all functions in schema t to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'staff@test.local');
select app.grant_owner('owner@test.local', 'Olive Owner');
insert into public.staff_profiles (user_id, full_name, email, role, roles, status) values
  ('00000000-0000-0000-0000-0000000000b1', 'Sam Staff', 'staff@test.local', 'STAFF', '{STAFF}', 'ACTIVE');
insert into public.students (id, full_name, phone) values
  ('00000000-0000-0000-0000-0000000000c1', 'Mina Park', '(310) 555-0101'),
  ('00000000-0000-0000-0000-0000000000c2', 'Hana Cho', '213-555-0199'),
  ('00000000-0000-0000-0000-0000000000c3', 'Theo Grant', '');

select t.check('phone format', app.sms_phone('(310) 555-0101') = '+13105550101' and app.sms_phone('1-310-555-0101') = '+13105550101'
  and app.sms_phone('+82 10-1234-5678') = '+821012345678' and app.sms_phone('555-0101') is null and app.sms_phone('') is null);
select t.check('off and in test mode by default', (select not enabled and test_mode from public.sms_settings));

-- Who may do what ------------------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('staff cannot change settings', '42501', $$select public.save_sms_settings('{"enabled":true}')$$);
select t.expect_error('staff cannot send a test', '42501', $$select public.send_test_sms()$$);
select t.expect_error('staff cannot claim texts', '42501', $$select * from public.sms_claim()$$);
select t.check('staff sees no texts or settings',
  (select count(*) = 0 from public.sms_settings) and (select count(*) = 0 from public.sms_messages));
reset role;
set local role anon;
select t.expect_error('anon cannot claim texts', '42501', $$select * from public.sms_claim()$$);
reset role;

-- Off: nothing is queued ------------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.a', public.save_appointment(format('{"start":"%s","minutes":50,"staff_id":null,"service":"Private with Ivy",
  "capacity":3,"clients":[{"student_id":"00000000-0000-0000-0000-0000000000c1"},{"student_id":"00000000-0000-0000-0000-0000000000c2"},
  {"student_id":"00000000-0000-0000-0000-0000000000c3"}]}', t.at('3 hours'))::jsonb)::text, true);
select public.move_appointment(current_setting('t.a')::uuid, t.at('4 hours'));
reset role;
select app.sms_queue_reminders();
select t.check('off: no texts queued', (select count(*) = 0 from public.sms_messages));

-- On, test mode, Mina's number is the test number ------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.expect_error('bad test number refused', '22023', $$select public.save_sms_settings('{"test_phones":["555"]}')$$);
select t.expect_error('bad url refused', '23514', $$select public.save_sms_settings('{"functions_url":"https://evil.example.com"}')$$);
select public.save_sms_settings('{"enabled":true,"test_phones":["310.555.0101"],"functions_url":"https://abcdefghijklmnopqrst.supabase.co"}');
select t.check('settings saved', (select enabled and test_phones = '{+13105550101}' from public.sms_settings));
reset role;
update public.sms_settings set send_from = '00:00', send_until = '23:59:59.999' where id;  -- quiet hours aside

select app.sms_queue_reminders();
select app.sms_queue_reminders();
select t.check('one reminder per booking', (select count(*) = 3 from public.sms_messages where kind = 'REMINDER'));
set local role service_role;
create temp table sent as select * from t.send();
reset role;
select t.check('test mode: only the test number gets it',
  (select count(*) = 1 and bool_and(to_phone = '+13105550101' and body like '%Reminder - Private with Ivy, %. Reply STOP to opt out.'
                                     and twilio_sid like 'SM%') from sent)
  and (select status = 'SENT' from public.sms_messages where id = (select id from sent)));
select t.check('others skipped with the reason',
  (select count(*) = 1 from public.sms_messages where status = 'SKIPPED' and error = 'Test mode: not a test number.')
  and (select count(*) = 1 from public.sms_messages where status = 'SKIPPED' and error = 'No usable phone number.'));
drop table sent;

-- Change: waits the text delay, one text for several edits, none when moved back ------------------
update public.sms_settings set test_mode = false where id;
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.move_appointment(current_setting('t.a')::uuid, t.at('5 hours'));
select public.move_appointment(current_setting('t.a')::uuid, t.at('6 hours'));
reset role;
select t.check('change waits 15 minutes, one per client',
  (select count(*) = 3 and bool_and(send_after = now() + interval '15 minutes') from public.sms_messages where kind = 'CHANGE'));
set local role service_role;
create temp table sent as select * from t.send();
reset role;
select t.check('change text names the new and old time',
  (select count(*) = 2 and bool_and(body like '%Your Private with Ivy moved to % (was %)%') from sent));
drop table sent;

select t.login('00000000-0000-0000-0000-0000000000a1');
select public.move_appointment(current_setting('t.a')::uuid, t.at('8 hours'));
select public.move_appointment(current_setting('t.a')::uuid, t.at('6 hours'));
reset role;
set local role service_role;
select t.check('moved back: nothing sent', (select count(*) = 0 from t.send()));
reset role;
select t.check('moved back: skipped', (select count(*) = 3 from public.sms_messages where error = 'Moved back to the same time.'));

-- A new reminder for the new time (the old one no longer applies) ---------------------------------
select app.sms_queue_reminders();
select t.check('reminder for the new start', (select count(*) = 3 from public.sms_messages where kind = 'REMINDER' and status = 'QUEUED'));
delete from public.sms_messages where kind = 'REMINDER' and status = 'QUEUED';

-- Cancel: a client taken out, then the whole appointment ------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.save_appointment(jsonb_build_object('id', a.id, 'start', t.at('6 hours'), 'minutes', 50, 'staff_id', null,
  'service', 'Private with Ivy', 'capacity', 3, 'updated_at', a.updated_at,
  'clients', (select jsonb_agg(jsonb_build_object('id', b.id)) from public.appointment_clients b
               where b.appointment_id = a.id and b.student_id <> '00000000-0000-0000-0000-0000000000c2')))
  from public.appointments a where a.id = current_setting('t.a')::uuid;
reset role;
select t.check('client taken out: cancel text queued',
  (select count(*) = 1 from public.sms_messages m join public.appointment_clients b on b.id = m.booking_id
    where m.kind = 'CANCEL' and m.status = 'QUEUED' and b.student_id = '00000000-0000-0000-0000-0000000000c2'));
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.cancel_appointment(current_setting('t.a')::uuid);
reset role;
select t.check('appointment cancelled: one cancel text per booking',
  (select count(*) = 3 from public.sms_messages where kind = 'CANCEL' and status = 'QUEUED'));
set local role service_role;
create temp table sent as select * from t.send();
reset role;
select t.check('cancel text', (select count(*) = 2 and bool_and(body like '%Your Private with Ivy on % is cancelled.%') from sent));
drop table sent;

-- Far away: no change/cancel texts ---------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.far', public.save_appointment(format('{"start":"%s","minutes":50,"staff_id":null,"service":"Private",
  "capacity":1,"clients":[{"student_id":"00000000-0000-0000-0000-0000000000c1"}]}', t.at('30 days'))::jsonb)::text, true);
select public.move_appointment(current_setting('t.far')::uuid, t.at('31 days'));
select public.cancel_appointment(current_setting('t.far')::uuid);
reset role;
select t.check('more than 7 days ahead: no texts', (select count(*) = 0 from public.sms_messages m
  join public.appointment_clients b on b.id = m.booking_id where b.appointment_id = current_setting('t.far')::uuid));

-- STOP, test texts, quiet hours, daily cap -------------------------------------------------------
insert into public.sms_messages (kind, booking_id, starts_at)
  select 'REMINDER', b.id, now() + interval '1 day' from public.appointment_clients b
   where b.student_id = '00000000-0000-0000-0000-0000000000c1' and b.appointment_id = current_setting('t.far')::uuid;
update public.sms_messages set status = 'SENDING', sent_at = now()
 where booking_id in (select id from public.appointment_clients where appointment_id = current_setting('t.far')::uuid);
set local role service_role;
select public.sms_result(id, 'FAILED', null, '21610: Attempt to send to unsubscribed recipient', 21610)
  from public.sms_messages where status = 'SENDING';
reset role;
select t.check('STOP marks the client', (select sms_opted_out_at is not null from public.students
  where id = '00000000-0000-0000-0000-0000000000c1'));

select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('test text queued for each test number', public.send_test_sms() = 1);
reset role;
update public.sms_settings set enabled = false, send_from = '23:59:59.999' where id;
set local role service_role;
create temp table sent as select * from t.send();
reset role;
select t.check('test text ignores the switch and quiet hours',
  (select count(*) = 1 and bool_and(kind = 'TEST' and to_phone = '+13105550101') from sent));
drop table sent;

update public.sms_settings set enabled = true, send_from = '00:00', daily_cap = 1 where id;
insert into public.sms_messages (kind, to_phone, body) values ('TEST', '+13105550101', 'x'), ('TEST', '+13105550101', 'y');
set local role service_role;
select t.check('daily cap: the rest wait', (select count(*) = 0 from t.send()));
reset role;
select t.check('daily cap: still queued', (select count(*) = 2 from public.sms_messages where status = 'QUEUED' and kind = 'TEST'));

select app.check_api_exposure();

rollback;
\echo sms: all checks passed
