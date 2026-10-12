-- ============================================================================
-- Schedule: the studio calendar (2026-10-12)
--
-- Each block on the calendar is one appointment (a private, a group class, a
-- workshop) with the clients booked in it. Weekly repeats are saved as one row
-- per date that share a series_id. Whoever has Schedule access (Settings ›
-- Admin access) can view, create, edit, move and cancel; Settings › Schedule
-- (instructor colors, services, change-text delay, Schedulista CSV import) is
-- Owner/Admin only. Nothing is ever deleted: appointments and bookings are
-- cancelled instead.
-- Times cross the API as studio wall-clock text 'YYYY-MM-DD HH:MM'
-- (America/Los_Angeles), never as the browser's time.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

alter table public.staff_profiles add column calendar_color text check (calendar_color ~ '^#[0-9A-F]{6}$');
create unique index staff_profiles_calendar_color on public.staff_profiles (calendar_color);

-- Picker list for new appointments (Settings › Schedule).
create table public.schedule_services (
  name     text primary key check (char_length(btrim(name)) between 1 and 60),
  minutes  int not null check (minutes between 5 and 720),
  capacity int not null check (capacity between 1 and 50),
  active   boolean not null default true,
  sort     int not null default 0
);
insert into public.schedule_services (name, minutes, capacity, sort) values
  ('Private', 50, 1, 1), ('Gyrotonic', 50, 1, 2), ('Pilates Group', 50, 5, 3), ('Gyrotonic Group', 50, 3, 4);

-- One row. change_text_minutes null = don't send.
create table public.schedule_settings (
  id                  boolean primary key default true check (id),
  change_text_minutes int default 15 check (change_text_minutes between 0 and 1440)
);
insert into public.schedule_settings default values;

create table public.appointments (
  id             uuid primary key default gen_random_uuid(),
  starts_at      timestamptz not null,
  minutes        int not null check (minutes between 5 and 720),
  staff_id       uuid references public.staff_profiles (user_id) on delete set null,  -- null = studio event / workshop
  service        text not null check (char_length(btrim(service)) between 1 and 120),
  capacity       int not null default 1 check (capacity between 1 and 50),
  series_id      uuid,                                -- weekly repeats share one id
  series_changed boolean not null default false,      -- this date was changed on its own
  status         text not null default 'BOOKED' check (status in ('BOOKED', 'CANCELLED')),
  source_key     text unique,                         -- Schedulista import key (import_schedule)
  created_by     uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index appointments_starts_at on public.appointments (starts_at);
create index appointments_series on public.appointments (series_id, starts_at) where series_id is not null;

-- Who is booked in an appointment. Name and phone are kept as they were at booking time.
create table public.appointment_clients (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null references public.appointments (id) on delete cascade,
  student_id        uuid references public.students (id) on delete set null,   -- null = not matched to a client
  client_name       text not null check (char_length(btrim(client_name)) between 1 and 120),
  client_phone      text not null default '' check (char_length(client_phone) <= 30),
  client_email      text not null default '' check (char_length(client_email) <= 254),
  status            text not null default 'BOOKED'
    check (status in ('BOOKED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'LATE_CANCEL', 'CANCELLED')),
  notes             text not null default '' check (char_length(notes) <= 2000),
  price_cents       int check (price_cents >= 0),     -- Schedulista "Price" when present
  source_key        text unique,                      -- import key
  source_created_at timestamp,                        -- Schedulista "Appointment Created", as given
  created_at        timestamptz not null default now()
);
create index appointment_clients_appointment on public.appointment_clients (appointment_id);
-- A client is booked at most once per appointment (cancelled bookings don't count).
create unique index appointment_clients_once on public.appointment_clients (appointment_id, student_id)
  where student_id is not null and status <> 'CANCELLED';
-- The import looks clients up by their other Schedulista keys (merged clients).
create index students_extra_source_keys on public.students using gin (extra_source_keys);

create trigger appointments_audit
  after insert or update or delete on public.appointments
  for each row execute function app.audit_row_change('id');
create trigger appointment_clients_audit
  after insert or update or delete on public.appointment_clients
  for each row execute function app.audit_row_change('id');

alter table public.schedule_services enable row level security;
alter table public.schedule_settings enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_clients enable row level security;
revoke all on public.schedule_services, public.schedule_settings, public.appointments, public.appointment_clients
  from public, anon, authenticated;
grant select on public.schedule_services, public.schedule_settings, public.appointments, public.appointment_clients
  to authenticated;

create policy schedule_services_select on public.schedule_services
  for select to authenticated using ((select app.can('schedule')));
create policy schedule_settings_select on public.schedule_settings
  for select to authenticated using ((select app.can('schedule')));
create policy appointments_select on public.appointments
  for select to authenticated using ((select app.can('schedule')));
create policy appointment_clients_select on public.appointment_clients
  for select to authenticated using ((select app.can('schedule')));

-- No insert/update/delete grants: every write goes through the functions below.

-- 'YYYY-MM-DD HH:MM' studio wall-clock time → timestamptz, or null when it isn't a real time.
create function app.studio_time(p text) returns timestamptz
language plpgsql stable set search_path = ''
as $$
begin
  return case when p ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then p::timestamp at time zone 'America/Los_Angeles' end;
exception when others then
  return null;
end;
$$;

-- Merging two clients (Clients screen, import) also moves their bookings to the kept client.
create or replace function app.merge_client(p_keep uuid, p_drop uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d public.students;
begin
  select * into d from public.students where id = p_drop and merged_into is null for update;
  if d.id is null or p_keep = p_drop then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;
  update public.payment_transactions set student_id = p_keep where student_id = p_drop;
  -- Bookings move too, unless the kept client is already booked in that class.
  update public.appointment_clients b set student_id = p_keep
   where b.student_id = p_drop
     and (b.status = 'CANCELLED' or not exists (select 1 from public.appointment_clients k
           where k.appointment_id = b.appointment_id and k.student_id = p_keep and k.status <> 'CANCELLED'));
  -- Source keys are unique: clear them on the hidden row before the kept row takes them.
  update public.students set merged_into = p_keep, status = 'INACTIVE', mindbody_id = null, schedulista_key = null,
                             extra_source_keys = '{}'
   where id = p_drop;
  update public.students s set
    phone   = case when s.phone = '' then d.phone else s.phone end,
    email   = case when s.email = '' then d.email else s.email end,
    address = case when s.address = '' then d.address else s.address end,
    notes   = case when d.notes = '' or d.notes = s.notes then s.notes
                   when s.notes = '' then d.notes
                   else left(s.notes || E'\n' || d.notes, 2000) end,
    status  = case when d.status = 'ACTIVE' then 'ACTIVE' else s.status end,
    extra_source_keys = s.extra_source_keys || d.extra_source_keys
      || case when s.mindbody_id is not null and d.mindbody_id is not null then array['MINDBODY:' || d.mindbody_id] else '{}' end
      || case when s.schedulista_key is not null and d.schedulista_key is not null then array['SCHEDULISTA:' || d.schedulista_key] else '{}' end,
    mindbody_id          = coalesce(s.mindbody_id, d.mindbody_id),
    mindbody_imported_at = case when s.mindbody_id is null then d.mindbody_imported_at else s.mindbody_imported_at end,
    schedulista_key         = coalesce(s.schedulista_key, d.schedulista_key),
    schedulista_imported_at = case when s.schedulista_key is null then d.schedulista_imported_at else s.schedulista_imported_at end,
    schedulista_last_visit  = case when s.schedulista_key is null then d.schedulista_last_visit else s.schedulista_last_visit end,
    schedulista_next_visit  = case when s.schedulista_key is null then d.schedulista_next_visit else s.schedulista_next_visit end,
    schedulista_visits      = case when s.schedulista_key is null then d.schedulista_visits else s.schedulista_visits end,
    schedulista_services    = case when s.schedulista_key is null then d.schedulista_services else s.schedulista_services end,
    schedulista_notes       = case when s.schedulista_key is null then d.schedulista_notes else s.schedulista_notes end
   where s.id = p_keep and s.merged_into is null;
  if not found then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Instructors for the calendar: everyone with the INSTRUCTOR role, plus anyone
-- who has appointments (an owner who teaches). Only active rows go in the picker.
create function public.schedule_instructors()
returns table (user_id uuid, full_name text, calendar_color text, active boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app.can('schedule') then
    raise exception 'Schedule is turned off for your role.' using errcode = '42501';
  end if;
  return query
    select s.user_id, s.full_name, s.calendar_color, s.status = 'ACTIVE'
      from public.staff_profiles s
     where 'INSTRUCTOR' = any(s.roles) or exists (select 1 from public.appointments a where a.staff_id = s.user_id)
     order by s.full_name;
end;
$$;

-- Client search in the appointment dialog: name or phone digits, active clients only.
-- (search_students needs Payments access and shows payments; this needs Schedule access.)
create function public.schedule_search_clients(p_query text)
returns table (id uuid, full_name text, phone_last4 text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  if not app.can('schedule') then
    raise exception 'Schedule is turned off for your role.' using errcode = '42501';
  end if;
  return query
    select s.id, s.full_name, right(regexp_replace(s.phone, '\D', '', 'g'), 4)
      from public.students s
     where s.status = 'ACTIVE' and char_length(v_q) >= 2
       and (strpos(lower(s.full_name), v_q) > 0
            or (char_length(v_digits) >= 3 and strpos(regexp_replace(s.phone, '\D', '', 'g'), v_digits) > 0))
     order by s.full_name
     limit 10;
end;
$$;

-- p: {id?, start, minutes, staff_id, service, capacity, scope?, repeat?, clients: [{id?, student_id, status, notes}]}
-- New: one row, or with repeat one row per chosen weekday every N weeks
--   (ends never = 52 weeks ahead, after count dates, or on the until date); every date gets the same clients.
-- Edit 'one': this row; a repeating date changed on its own is marked series_changed.
-- Edit 'following': this row and the later booked dates of its series (moved by the same
--   wall-clock shift). Clients change on this row only; ones left out of the list are cancelled.
create function public.save_appointment(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_minutes int := (p ->> 'minutes')::int;
  v_staff uuid := (p ->> 'staff_id')::uuid;
  v_service text := btrim(coalesce(p ->> 'service', ''));
  v_capacity int := coalesce((p ->> 'capacity')::int, 1);
  v_scope text := coalesce(p ->> 'scope', 'one');
  v_clients jsonb := coalesce(p -> 'clients', '[]');
  v_rep jsonb := p -> 'repeat';
  v_local timestamp;
  v_shift interval;
  v_every int; v_days int[]; v_ends text; v_count int; v_last date; v_date date;
  v_series uuid;
  v_ids uuid[] := '{}';
  v_book uuid[];
  v public.appointments;
begin
  if not app.can('schedule') then
    raise exception 'Schedule is turned off for your role.' using errcode = '42501';
  end if;
  if app.studio_time(p ->> 'start') is null or v_minutes is null or v_minutes not between 5 and 720
     or char_length(v_service) not between 1 and 120 or v_capacity not between 1 and 50
     or v_scope not in ('one', 'following') or jsonb_typeof(v_clients) <> 'array' then
    raise exception 'Check the start, length, service, capacity and clients.' using errcode = '22023';
  end if;
  v_local := (p ->> 'start')::timestamp;
  if exists (select 1 from jsonb_array_elements(v_clients) c
              where c ->> 'id' is null
                and not exists (select 1 from public.students s where s.id = (c ->> 'student_id')::uuid)) then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;

  if v_id is null then
    if jsonb_typeof(v_rep) = 'object' then
      v_series := gen_random_uuid();
      v_every := coalesce((v_rep ->> 'every')::int, 1);
      v_days := array(select jsonb_array_elements_text(coalesce(v_rep -> 'days', '[]'))::int);
      v_ends := coalesce(v_rep ->> 'ends', 'never');
      v_count := (v_rep ->> 'count')::int;
      if v_every not between 1 and 4 or cardinality(v_days) = 0 or not v_days <@ array[0, 1, 2, 3, 4, 5, 6]
         or v_ends not in ('never', 'count', 'until')
         or (v_ends = 'count' and coalesce(v_count, 0) not between 1 and 100)
         or (v_ends = 'until' and case when app.studio_time((v_rep ->> 'until') || ' 00:00') is null then true
                                       else (v_rep ->> 'until')::date > v_local::date + 366 end) then
        raise exception 'Check the repeat.' using errcode = '22023';
      end if;
    else
      v_every := 1; v_days := array[extract(dow from v_local)::int]; v_ends := 'count'; v_count := 1;
    end if;
    v_last := case v_ends when 'never' then v_local::date + 363
                          when 'until' then (v_rep ->> 'until')::date
                          else v_local::date + v_count * 7 * v_every end;
    -- Weeks count from the Sunday of the start's week (0 = Sun).
    for v_date in
      select d from (select v_local::date + i as d from generate_series(0, v_last - v_local::date) i) x
       where extract(dow from d)::int = any(v_days)
         and ((d - (v_local::date - extract(dow from v_local)::int)) / 7) % v_every = 0
       order by d
       limit case when v_ends = 'count' then v_count end
    loop
      insert into public.appointments (starts_at, minutes, staff_id, service, capacity, series_id)
      values ((v_date + v_local::time) at time zone 'America/Los_Angeles', v_minutes, v_staff, v_service, v_capacity, v_series)
      returning id into v_id;
      v_ids := v_ids || v_id;
    end loop;
    if cardinality(v_ids) = 0 then
      raise exception 'No dates match the repeat.' using errcode = '22023';
    end if;
    v_id := v_ids[1];
    v_book := v_ids;
  else
    select * into v from public.appointments where id = v_id for update;
    if not found then
      raise exception 'Appointment not found.' using errcode = 'P0002';
    end if;
    v_shift := v_local - (v.starts_at at time zone 'America/Los_Angeles');
    with u as (
      update public.appointments a set
        starts_at = ((a.starts_at at time zone 'America/Los_Angeles') + v_shift) at time zone 'America/Los_Angeles',
        minutes = v_minutes, staff_id = v_staff, service = v_service, capacity = v_capacity, updated_at = now(),
        series_changed = a.series_changed or (v_scope = 'one' and a.series_id is not null
          and (v_shift <> interval '0' or (a.staff_id, a.service, a.minutes) is distinct from (v_staff, v_service, v_minutes)))
       where a.id = v_id
          or (v_scope = 'following' and a.series_id = v.series_id and a.status = 'BOOKED' and a.starts_at > v.starts_at)
      returning a.id)
    select array_agg(id) into v_ids from u;

    -- Bookings left out of the list are cancelled, never deleted.
    update public.appointment_clients set status = 'CANCELLED'
     where appointment_id = v_id and status <> 'CANCELLED'
       and id not in (select (c ->> 'id')::uuid from jsonb_array_elements(v_clients) c where c ->> 'id' is not null);
    update public.appointment_clients b
       set status = coalesce(c ->> 'status', b.status), notes = coalesce(btrim(c ->> 'notes'), b.notes)
      from jsonb_array_elements(v_clients) c
     where b.appointment_id = v_id and b.id = (c ->> 'id')::uuid
       and (b.status, b.notes) is distinct from (coalesce(c ->> 'status', b.status), coalesce(btrim(c ->> 'notes'), b.notes));
    v_book := array[v_id];
  end if;

  insert into public.appointment_clients (appointment_id, student_id, client_name, client_phone, client_email, status, notes)
  select a.id, s.id, s.full_name, s.phone, s.email, coalesce(c ->> 'status', 'BOOKED'), coalesce(btrim(c ->> 'notes'), '')
    from unnest(v_book) a(id)
   cross join jsonb_array_elements(v_clients) c
    join public.students s on s.id = (c ->> 'student_id')::uuid
   where c ->> 'id' is null;

  if exists (select 1 from public.appointments a
              where a.id = any(v_ids)
                and a.capacity < (select count(*) from public.appointment_clients b
                                   where b.appointment_id = a.id and b.status <> 'CANCELLED')) then
    raise exception 'Class is full.' using errcode = '23514';
  end if;
  return v_id;
end;
$$;

-- Drag and drop. 'one': this date (marked changed when it repeats; Undo passes the old flag back).
-- 'following': this and the later booked dates of its series, by the same wall-clock shift.
create function public.move_appointment(p_id uuid, p_start text, p_scope text default 'one',
                                        p_series_changed boolean default true) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.appointments;
begin
  if not app.can('schedule') then
    raise exception 'Schedule is turned off for your role.' using errcode = '42501';
  end if;
  if app.studio_time(p_start) is null or coalesce(p_scope, '') not in ('one', 'following') then
    raise exception 'Check the start and scope.' using errcode = '22023';
  end if;
  select * into v from public.appointments where id = p_id for update;
  if not found then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  update public.appointments a set
    starts_at = ((a.starts_at at time zone 'America/Los_Angeles')
                 + (p_start::timestamp - (v.starts_at at time zone 'America/Los_Angeles'))) at time zone 'America/Los_Angeles',
    series_changed = case when p_scope = 'one' and a.series_id is not null then coalesce(p_series_changed, true)
                          else a.series_changed end,
    updated_at = now()
   where a.id = p_id
      or (p_scope = 'following' and a.series_id = v.series_id and a.status = 'BOOKED' and a.starts_at > v.starts_at);
end;
$$;

-- Cancels this date, or this and the later dates of its series. Bookings stay as they are.
create function public.cancel_appointment(p_id uuid, p_scope text default 'one') returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.appointments;
begin
  if not app.can('schedule') then
    raise exception 'Schedule is turned off for your role.' using errcode = '42501';
  end if;
  if coalesce(p_scope, '') not in ('one', 'following') then
    raise exception 'Scope must be one or following.' using errcode = '22023';
  end if;
  select * into v from public.appointments where id = p_id for update;
  if not found then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  update public.appointments a set status = 'CANCELLED', updated_at = now()
   where a.id = p_id
      or (p_scope = 'following' and a.series_id = v.series_id and a.status = 'BOOKED' and a.starts_at > v.starts_at);
end;
$$;

-- Settings › Schedule (Owner/Admin) ------------------------------------------------------------

-- '#RRGGBB'; null = the default palette color.
create function public.set_calendar_color(p_user uuid, p_color text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  update public.staff_profiles set calendar_color = upper(nullif(btrim(p_color), '')) where user_id = p_user;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- p: {name, minutes, capacity, active, sort?}. Same name = edit; a new one goes last unless sort is given.
create function public.save_schedule_service(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  insert into public.schedule_services (name, minutes, capacity, active, sort)
  values (btrim(p ->> 'name'), (p ->> 'minutes')::int, (p ->> 'capacity')::int, coalesce((p ->> 'active')::boolean, true),
          coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.schedule_services)))
  on conflict (name) do update
     set minutes = excluded.minutes, capacity = excluded.capacity, active = excluded.active,
         sort = coalesce((p ->> 'sort')::int, public.schedule_services.sort);
end;
$$;

-- Minutes after a change to text the client; null = don't send.
create function public.set_change_text_minutes(p_minutes int) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  update public.schedule_settings set change_text_minutes = p_minutes where id;
end;
$$;

-- Schedulista appointments CSV, one row per booking (the page parses the file).
-- p_rows: [{row, start, minutes, service, instructor, source_service, client_name, client_phone,
--           client_email, notes, price_cents, created}]
-- Rows already imported are skipped (never overwritten), so the same file can be imported again.
-- Instructor: the staff whose name, letters only, starts with the CSV name ('Sukyung' = 'Su kyung YI').
-- Client: same Schedulista key as the Clients import, or same phone and a matching name; else name/phone only.
-- p_commit false = dry run: same work, then undone, so the counts are exact. Returns
-- {total, importable, duplicates, failed, appointments_new, errors: [{row, reason}] (first 200)}.
create function public.import_schedule(p_rows jsonb, p_commit boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  v_start text; v_at timestamptz; v_minutes int; v_service text; v_instructor text; v_ikey text;
  v_name text; v_phone text; v_digits text; v_akey text; v_bkey text; v_reason text;
  v_n int; v_staff uuid; v_student uuid; v_appt uuid;
  v_new uuid[] := '{}';
  v_ok int := 0; v_dup int := 0; v_failed int := 0;
  v_errors jsonb := '[]';
begin
  perform app.require_owner();
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.' using errcode = '22023';
  end if;

  begin
    for r in select * from jsonb_array_elements(p_rows) loop
      v_start := btrim(coalesce(r ->> 'start', ''));
      v_at := app.studio_time(v_start);
      v_minutes := case when r ->> 'minutes' ~ '^\d{1,4}$' then (r ->> 'minutes')::int end;
      v_service := left(btrim(coalesce(r ->> 'service', '')), 120);
      v_instructor := btrim(coalesce(r ->> 'instructor', ''));
      v_ikey := regexp_replace(lower(v_instructor), '[^[:alpha:]]', '', 'g');
      v_name := left(btrim(regexp_replace(coalesce(r ->> 'client_name', ''), '\s+', ' ', 'g')), 120);
      v_phone := left(btrim(coalesce(r ->> 'client_phone', '')), 30);
      v_digits := right(regexp_replace(v_phone, '\D', '', 'g'), 10);
      v_reason := case
        when v_at is null then 'Missing or invalid date/time.'
        when v_minutes is null or v_minutes not between 5 and 720 then 'Length must be 5 to 720 minutes.'
        when v_service = '' then 'Missing service.'
        when v_name = '' then 'Missing client name.' end;
      v_staff := null;
      if v_reason is null and v_ikey <> '' then
        select count(*), (array_agg(s.user_id))[1] into v_n, v_staff from public.staff_profiles s
         where starts_with(regexp_replace(lower(s.full_name), '[^[:alpha:]]', '', 'g'), v_ikey);
        v_reason := case when v_n = 0 then 'Instructor not found: ' || v_instructor
                         when v_n > 1 then 'Instructor matches more than one user: ' || v_instructor end;
      end if;
      if v_reason is not null then
        v_failed := v_failed + 1;
        if v_failed <= 200 then
          v_errors := v_errors || jsonb_build_object('row', r -> 'row', 'reason', v_reason);
        end if;
        continue;
      end if;

      v_akey := 'SCHEDULISTA|' || v_start || '|' || lower(btrim(coalesce(r ->> 'source_service', '')));
      v_bkey := v_akey || '|' || lower(v_name) || '|' || v_digits;
      if exists (select 1 from public.appointment_clients where source_key = v_bkey) then
        v_dup := v_dup + 1;
        continue;
      end if;
      select id into v_student from public.students
       where schedulista_key = lower(v_name) || '|' || v_digits
          or extra_source_keys @> array['SCHEDULISTA:' || lower(v_name) || '|' || v_digits];
      if v_student is null and length(v_digits) >= 7 then
        select id into v_student from public.students
         where right(regexp_replace(phone, '\D', '', 'g'), 10) = v_digits and app.same_name(full_name, v_name)
           and merged_into is null and schedulista_key is null  -- a client with their own key would have matched it
         order by created_at limit 1;
      end if;
      select id into v_appt from public.appointments where source_key = v_akey;
      -- Already booked in this appointment under another spelling: also a duplicate.
      if exists (select 1 from public.appointment_clients
                  where appointment_id = v_appt and student_id = v_student and status <> 'CANCELLED') then
        v_dup := v_dup + 1;
        continue;
      end if;

      if v_appt is null then
        insert into public.appointments (starts_at, minutes, staff_id, service, capacity, source_key)
        values (v_at, v_minutes, v_staff, v_service,
                coalesce((select capacity from public.schedule_services where lower(name) = lower(v_service)), 1), v_akey)
        returning id into v_appt;
        v_new := v_new || v_appt;
      end if;
      insert into public.appointment_clients (appointment_id, student_id, client_name, client_phone, client_email,
                                              notes, price_cents, source_key, source_created_at)
      values (v_appt, v_student, v_name, v_phone, left(lower(btrim(coalesce(r ->> 'client_email', ''))), 254),
              left(btrim(coalesce(r ->> 'notes', '')), 2000),
              case when r ->> 'price_cents' ~ '^\d{1,9}$' then (r ->> 'price_cents')::int end, v_bkey,
              case when r ->> 'created' ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then (r ->> 'created')::timestamp end);
      v_ok := v_ok + 1;
      -- Room for everyone booked; a new appointment is as long as its longest row.
      update public.appointments a
         set capacity = greatest(a.capacity, least(x.n, 50)),
             minutes = case when a.id = any(v_new) then greatest(a.minutes, v_minutes) else a.minutes end,
             updated_at = now()
        from (select count(*)::int as n from public.appointment_clients
               where appointment_id = v_appt and status <> 'CANCELLED') x
       where a.id = v_appt and (a.capacity < least(x.n, 50) or (a.id = any(v_new) and a.minutes < v_minutes));
    end loop;
    if p_commit is not true then
      raise exception 'dry run' using errcode = 'LPDRY';
    end if;
  exception when sqlstate 'LPDRY' then
    null;  -- dry run: writes undone, counts kept
  end;

  return jsonb_build_object('total', jsonb_array_length(p_rows), 'importable', v_ok, 'duplicates', v_dup,
                            'failed', v_failed, 'appointments_new', cardinality(v_new), 'errors', v_errors);
end;
$$;

revoke all on function
  app.studio_time(text), public.schedule_instructors(), public.schedule_search_clients(text), public.save_appointment(jsonb),
  public.move_appointment(uuid, text, text, boolean), public.cancel_appointment(uuid, text),
  public.set_calendar_color(uuid, text), public.save_schedule_service(jsonb), public.set_change_text_minutes(int),
  public.import_schedule(jsonb, boolean)
from public, anon, authenticated;
grant execute on function
  public.schedule_instructors(), public.schedule_search_clients(text), public.save_appointment(jsonb),
  public.move_appointment(uuid, text, text, boolean), public.cancel_appointment(uuid, text),
  public.set_calendar_color(uuid, text), public.save_schedule_service(jsonb), public.set_change_text_minutes(int),
  public.import_schedule(jsonb, boolean)
to authenticated;

select app.check_api_exposure();
