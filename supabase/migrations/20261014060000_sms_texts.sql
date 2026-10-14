-- ============================================================================
-- Client texts (SMS) through Twilio (2026-10-14)
--
-- Three texts to booked clients: a reminder 24 hours before, a notice when the
-- appointment moves, and a notice when it is cancelled. Changes wait
-- schedule_settings.change_text_minutes (null = no change/cancel texts) and
-- several edits in that time send one text; moved and moved back sends none.
-- Change and cancel texts only go out for appointments in the next 7 days, so
-- cancelling a whole weekly series doesn't text a client 50 times.
--
-- Flow: the schedule triggers below queue rows in sms_messages; pg_cron runs
-- app.sms_tick() every 5 minutes, which queues reminders and calls the
-- sms-send Edge Function; that function asks public.sms_claim() what is due,
-- sends it through Twilio and reports back with public.sms_result(). The
-- Twilio keys live only in the function's secrets.
--
-- Safety: sending is off until an owner turns it on (Settings › Notifications);
-- test mode (on by default) sends only to the test numbers; no texts between
-- 9pm and 8am (they wait); at most daily_cap texts a day. The Schedulista
-- import only inserts rows, so it never queues change texts.
-- ============================================================================

-- Set when Twilio refuses a number because the client replied STOP (error 21610);
-- cleared when a later text to them goes through (they replied START).
alter table public.students add column sms_opted_out_at timestamptz;

create table public.sms_settings (
  id             boolean primary key default true check (id),
  enabled        boolean not null default false,
  reminders      boolean not null default true,
  change_notices boolean not null default true,
  cancel_notices boolean not null default true,
  test_mode      boolean not null default true,     -- only test_phones get texts
  test_phones    text[] not null default '{}' check (cardinality(test_phones) <= 5),
  daily_cap      int not null default 300 check (daily_cap between 1 and 2000),
  send_from      time not null default '08:00',     -- studio time
  send_until     time not null default '21:00',
  -- https://<project>.supabase.co, saved by the portal so the 5-minute job can reach sms-send.
  functions_url  text check (functions_url ~ '^https://[a-z0-9]{20}\.supabase\.co$'),
  reminder_text  text not null default 'Let''s Pilates LA: Reminder - {service}, {time}. Reply STOP to opt out.'
                 check (char_length(reminder_text) between 1 and 320),
  change_text    text not null default 'Let''s Pilates LA: Your {service} moved to {time} (was {old_time}). Reply STOP to opt out.'
                 check (char_length(change_text) between 1 and 320),
  cancel_text    text not null default 'Let''s Pilates LA: Your {service} on {time} is cancelled. Reply STOP to opt out.'
                 check (char_length(cancel_text) between 1 and 320)
);
insert into public.sms_settings default values;

create table public.sms_messages (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('REMINDER', 'CHANGE', 'CANCEL', 'TEST')),
  booking_id  uuid references public.appointment_clients (id) on delete set null,
  starts_at   timestamptz,                    -- REMINDER: the start it reminds of; CHANGE: the start before the change
  to_phone    text not null default '',       -- +1..., filled when it is sent
  body        text not null default '',
  status      text not null default 'QUEUED' check (status in ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  send_after  timestamptz not null default now(),
  twilio_sid  text,
  error       text not null default '',
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index sms_messages_due on public.sms_messages (send_after) where status = 'QUEUED';
create index sms_messages_created on public.sms_messages (created_at desc);
-- One waiting change/cancel text per booking (later edits update it); one reminder per booking and start.
create unique index sms_messages_notice on public.sms_messages (booking_id)
  where status = 'QUEUED' and kind in ('CHANGE', 'CANCEL');
create unique index sms_messages_reminder on public.sms_messages (booking_id, starts_at) where kind = 'REMINDER';

alter table public.sms_settings enable row level security;
alter table public.sms_messages enable row level security;
revoke all on public.sms_settings, public.sms_messages from public, anon, authenticated;
grant select on public.sms_settings, public.sms_messages to authenticated;
create policy sms_settings_select on public.sms_settings for select to authenticated using ((select app.is_owner()));
create policy sms_messages_select on public.sms_messages for select to authenticated using ((select app.is_owner()));

-- A phone as Twilio wants it (+13105550101), or null when it isn't a usable number.
create function app.sms_phone(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when d ~ '^\d{10}$' then '+1' || d
    when d ~ '^1\d{10}$' then '+' || d
    when btrim(p) like '+%' and d ~ '^\d{8,15}$' then '+' || d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

-- 'Thu 10/16 at 10:00 AM' in studio time.
create function app.sms_when(p timestamptz) returns text
language sql stable set search_path = ''
as $$
  select to_char(p at time zone 'America/Los_Angeles', 'Dy FMMM/FMDD "at" FMHH12:MI AM')
$$;

-- Queue (or push back) the change/cancel text of one booking. The first old start is kept.
create function app.sms_notice(p_booking uuid, p_kind text, p_start timestamptz) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_delay int := (select change_text_minutes from public.schedule_settings where id);
begin
  if v_delay is null or not (select enabled from public.sms_settings where id) then
    return;
  end if;
  insert into public.sms_messages (kind, booking_id, starts_at, send_after)
  values (p_kind, p_booking, p_start, now() + make_interval(mins => v_delay))
  on conflict (booking_id) where status = 'QUEUED' and kind in ('CHANGE', 'CANCEL')
  do update set kind = excluded.kind, send_after = excluded.send_after;
end;
$$;

create function app.sms_appointment_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking uuid;
begin
  if greatest(old.starts_at, new.starts_at) <= now() or least(old.starts_at, new.starts_at) > now() + interval '7 days' then
    return null;
  end if;
  if old.status = 'CANCELLED' and new.status = 'BOOKED' then
    delete from public.sms_messages m
     using public.appointment_clients b
     where b.appointment_id = new.id and m.booking_id = b.id and m.status = 'QUEUED' and m.kind = 'CANCEL';
    return null;
  end if;
  if (old.status = 'BOOKED' and new.status = 'CANCELLED') or (new.status = 'BOOKED' and new.starts_at <> old.starts_at) then
    for v_booking in
      select b.id from public.appointment_clients b
       where b.appointment_id = new.id and b.status in ('BOOKED', 'CONFIRMED')
    loop
      perform app.sms_notice(v_booking, case when new.status = 'CANCELLED' then 'CANCEL' else 'CHANGE' end, old.starts_at);
    end loop;
  end if;
  return null;
end;
$$;
create trigger appointments_sms
  after update of starts_at, status on public.appointments
  for each row execute function app.sms_appointment_changed();

-- A client taken out of an appointment that still goes ahead.
create function app.sms_booking_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = new.appointment_id;
  if old.status in ('BOOKED', 'CONFIRMED') and new.status = 'CANCELLED' then
    if a.status = 'BOOKED' and a.starts_at > now() and a.starts_at <= now() + interval '7 days' then
      perform app.sms_notice(new.id, 'CANCEL', a.starts_at);
    end if;
  elsif old.status = 'CANCELLED' and new.status in ('BOOKED', 'CONFIRMED') then
    delete from public.sms_messages where booking_id = new.id and status = 'QUEUED' and kind = 'CANCEL';
  end if;
  return null;
end;
$$;
create trigger appointment_clients_sms
  after update of status on public.appointment_clients
  for each row execute function app.sms_booking_changed();

-- Reminders for bookings that start in 1 to 24 hours (a booking made less than an hour ahead gets none).
create function app.sms_queue_reminders() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select enabled and reminders from public.sms_settings where id) then
    return;
  end if;
  insert into public.sms_messages (kind, booking_id, starts_at)
  select 'REMINDER', b.id, a.starts_at
    from public.appointments a
    join public.appointment_clients b on b.appointment_id = a.id
   where a.status = 'BOOKED' and b.status in ('BOOKED', 'CONFIRMED')
     and a.starts_at > now() + interval '1 hour' and a.starts_at <= now() + interval '24 hours'
  on conflict do nothing;
end;
$$;

-- Every 5 minutes (pg_cron): queue reminders, then wake sms-send when something is due.
create function app.sms_tick() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text := (select functions_url from public.sms_settings where id);
begin
  perform app.sms_queue_reminders();
  if v_url is not null and exists (select 1 from public.sms_messages where status = 'QUEUED' and send_after <= now()) then
    -- Dynamic so this file also loads where pg_net isn't installed (the local test database).
    execute 'select net.http_post(url := $1, body := ''{}''::jsonb)' using v_url || '/functions/v1/sms-send';
  end if;
end;
$$;

-- For sms-send only (service role): the texts that are due now, worded and marked SENDING.
-- Texts that no longer apply are marked SKIPPED with the reason. Test texts ignore the
-- on/off switch and the quiet hours. out_test = the number is one of the test numbers.
create function public.sms_claim(p_limit int default 20)
returns table (out_id uuid, out_phone text, out_body text, out_test boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  s public.sms_settings;
  m record;
  v_open boolean;
  v_sent int;
  v_phone text;
  v_body text;
  v_skip text;
begin
  select * into s from public.sms_settings where id;
  -- A send that never reported back (the function stopped): never retried, so nobody gets it twice.
  update public.sms_messages set status = 'FAILED', error = 'The sender stopped before Twilio answered.'
   where status = 'SENDING' and sent_at < now() - interval '10 minutes';
  v_open := s.enabled and (now() at time zone 'America/Los_Angeles')::time >= s.send_from
                      and (now() at time zone 'America/Los_Angeles')::time < s.send_until;
  select count(*) into v_sent from public.sms_messages
   where status in ('SENDING', 'SENT')
     and sent_at >= (now() at time zone 'America/Los_Angeles')::date::timestamp at time zone 'America/Los_Angeles';

  for m in
    select x.id, x.kind, x.starts_at, x.to_phone, x.body, x.booking_id,
           a.starts_at as a_start, a.status as a_status, a.service, b.status as b_status,
           coalesce(nullif(st.phone, ''), b.client_phone) as client_phone
      from public.sms_messages x
      left join public.appointment_clients b on b.id = x.booking_id
      left join public.appointments a on a.id = b.appointment_id
      left join public.students st on st.id = b.student_id
     where x.status = 'QUEUED' and x.send_after <= now() and (x.kind = 'TEST' or v_open)
     order by x.send_after
     limit greatest(1, least(coalesce(p_limit, 20), 100))
       for update of x skip locked
  loop
    v_skip := null;
    if m.kind = 'TEST' then
      v_phone := m.to_phone;
      v_body := m.body;
    else
      v_phone := app.sms_phone(m.client_phone);
      v_skip := case
        when m.booking_id is null then 'The booking was removed.'
        when m.kind = 'REMINDER' and not s.reminders then 'Reminders are off.'
        when m.kind = 'CHANGE' and not s.change_notices then 'Change texts are off.'
        when m.kind = 'CANCEL' and not s.cancel_notices then 'Cancel texts are off.'
        when m.a_start <= now() then 'The appointment already started.'
        when m.kind = 'REMINDER' and (m.a_status <> 'BOOKED' or m.b_status not in ('BOOKED', 'CONFIRMED')
                                      or m.a_start <> m.starts_at) then 'No longer booked at that time.'
        when m.kind = 'CHANGE' and (m.a_status <> 'BOOKED' or m.b_status not in ('BOOKED', 'CONFIRMED')) then 'No longer booked.'
        when m.kind = 'CHANGE' and m.a_start = m.starts_at then 'Moved back to the same time.'
        when m.kind = 'CANCEL' and m.a_status = 'BOOKED' and m.b_status in ('BOOKED', 'CONFIRMED') then 'Booked again.'
        when v_phone is null then 'No usable phone number.'
      end;
      v_body := replace(replace(replace(
                  case m.kind when 'REMINDER' then s.reminder_text when 'CHANGE' then s.change_text else s.cancel_text end,
                  '{service}', coalesce(m.service, '')), '{old_time}', coalesce(app.sms_when(m.starts_at), '')),
                  '{time}', coalesce(app.sms_when(m.a_start), ''));
    end if;
    if v_skip is null and s.test_mode and not (v_phone = any(s.test_phones)) then
      v_skip := 'Test mode: not a test number.';
    end if;
    if v_skip is not null then
      update public.sms_messages set status = 'SKIPPED', error = v_skip, to_phone = coalesce(v_phone, '') where id = m.id;
      continue;
    end if;
    exit when v_sent >= s.daily_cap;  -- the rest wait for tomorrow
    update public.sms_messages set status = 'SENDING', to_phone = v_phone, body = v_body, sent_at = now() where id = m.id;
    v_sent := v_sent + 1;
    out_id := m.id; out_phone := v_phone; out_body := v_body; out_test := v_phone = any(s.test_phones);
    return next;
  end loop;
end;
$$;

-- For sms-send only: what happened to one claimed text. p_status SENT | FAILED | SKIPPED.
create function public.sms_result(p_id uuid, p_status text, p_sid text, p_error text, p_code int) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_student uuid := (select b.student_id from public.sms_messages x
                       join public.appointment_clients b on b.id = x.booking_id where x.id = p_id);
begin
  if p_status not in ('SENT', 'FAILED', 'SKIPPED') then
    raise exception 'Status must be SENT, FAILED or SKIPPED.' using errcode = '22023';
  end if;
  update public.sms_messages
     set status = p_status, twilio_sid = left(p_sid, 64), error = left(coalesce(p_error, ''), 500)
   where id = p_id and status = 'SENDING';
  if p_code = 21610 then
    update public.students set sms_opted_out_at = now() where id = v_student and sms_opted_out_at is null;
  elsif p_status = 'SENT' then
    update public.students set sms_opted_out_at = null where id = v_student and sms_opted_out_at is not null;
  end if;
end;
$$;

-- Settings › Notifications (Owner/Admin). Fields left out keep their value.
create function public.save_sms_settings(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_phones text[];
begin
  perform app.require_owner();
  if p ? 'test_phones' then
    v_phones := array(select app.sms_phone(x) from jsonb_array_elements_text(p -> 'test_phones') x);
    if array_position(v_phones, null) is not null then
      raise exception 'Check the test phone numbers.' using errcode = '22023';
    end if;
  end if;
  update public.sms_settings s set
    enabled        = coalesce((p ->> 'enabled')::boolean, s.enabled),
    reminders      = coalesce((p ->> 'reminders')::boolean, s.reminders),
    change_notices = coalesce((p ->> 'change_notices')::boolean, s.change_notices),
    cancel_notices = coalesce((p ->> 'cancel_notices')::boolean, s.cancel_notices),
    test_mode      = coalesce((p ->> 'test_mode')::boolean, s.test_mode),
    test_phones    = coalesce(v_phones, s.test_phones),
    functions_url  = coalesce(p ->> 'functions_url', s.functions_url),
    reminder_text  = coalesce(btrim(p ->> 'reminder_text'), s.reminder_text),
    change_text    = coalesce(btrim(p ->> 'change_text'), s.change_text),
    cancel_text    = coalesce(btrim(p ->> 'cancel_text'), s.cancel_text)
   where s.id;
end;
$$;

-- "Send test text": one text to each test number. Returns how many were queued.
create function public.send_test_sms() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
begin
  perform app.require_owner();
  insert into public.sms_messages (kind, to_phone, body)
  select 'TEST', x, 'Let''s Pilates LA: This is a test text from the studio portal. Reply STOP to opt out.'
    from unnest((select test_phones from public.sms_settings where id)) x;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function
  app.sms_phone(text), app.sms_when(timestamptz), app.sms_notice(uuid, text, timestamptz),
  app.sms_appointment_changed(), app.sms_booking_changed(), app.sms_queue_reminders(), app.sms_tick(),
  public.sms_claim(int), public.sms_result(uuid, text, text, text, int),
  public.save_sms_settings(jsonb), public.send_test_sms()
from public, anon, authenticated;
grant execute on function public.sms_claim(int), public.sms_result(uuid, text, text, text, int) to service_role;
grant execute on function public.save_sms_settings(jsonb), public.send_test_sms() to authenticated;

-- The 5-minute job. Supabase has pg_cron and pg_net on every plan; the local test database doesn't.
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('sms-tick', '*/5 * * * *', 'select app.sms_tick()');
  end if;
end;
$$;

select app.check_api_exposure();
