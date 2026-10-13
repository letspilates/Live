-- ============================================================================
-- Schedule P2 fixes from the 2026-10-13 Staging audit (docs/staging-audit/P2-FIX-PLAN.md).
--   AUDIT-012  "This and following" applies only the fields that changed, and on a later date
--              only where it still has this date's old value (a substitute set on one date stays).
--   AUDIT-013  "This and following" also books added clients and cancels removed ones on the
--              later dates (capacity checked on every date; one full date refuses the whole save).
--   AUDIT-014  schedule_client_clashes() for the dialog's "already booked" warning; an exact
--              duplicate (same instructor, start and client) is refused for a new booking.
--   AUDIT-015  Booked clients' full phone, email, price and import key need Clients access: the
--              calendar reads phone_last4, Backup reads appointment_clients_full().
--   AUDIT-016  Someone with no OWNER, ADMIN or STAFF role (an instructor on their own phone) may
--              only book, change, move or cancel their own appointments.
-- Additive: functions replaced, one generated column, column grants narrowed. No data changed.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

-- AUDIT-015 -----------------------------------------------------------------------------------
-- The calendar shows only the last 4 digits; the full phone, email, price and the import key
-- (it holds the phone) are read through appointment_clients_full(), which checks Clients access.
-- A column added to this table later is not readable until it is granted here.
alter table public.appointment_clients
  add column phone_last4 text generated always as (right(regexp_replace(client_phone, '\D', '', 'g'), 4)) stored;
revoke select on public.appointment_clients from authenticated;
grant select (id, appointment_id, student_id, client_name, phone_last4, status, notes, source_created_at, created_at)
  on public.appointment_clients to authenticated;

-- Every column of every booking: Backup (Owner/Admin), and anyone with Schedule and Clients access.
-- The API can order and page it like a table.
create function public.appointment_clients_full() returns setof public.appointment_clients
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (app.can('schedule') and app.can('clients')) then
    raise exception 'Booked clients'' contact details need Clients access.' using errcode = '42501';
  end if;
  return query select * from public.appointment_clients;
end;
$$;

-- AUDIT-016 -----------------------------------------------------------------------------------
-- True when the caller has none of OWNER, ADMIN, STAFF (the shared studio computer is STAFF).
create function app.schedule_own_only() returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.staff_profiles
                      where user_id = auth.uid() and status = 'ACTIVE' and roles && array['OWNER', 'ADMIN', 'STAFF']);
$$;

-- AUDIT-014 -----------------------------------------------------------------------------------
-- p: {id?, start, minutes, student_ids: [...]}. These clients' bookings in other booked
-- appointments that overlap the time (any instructor), for the dialog's warning.
create function public.schedule_client_clashes(p jsonb)
returns table (student_id uuid, client_name text, starts_at text, minutes int, service text, instructor text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_at timestamptz := app.studio_time(p ->> 'start');
  v_minutes int := (p ->> 'minutes')::int;
begin
  if not app.can('schedule') then
    raise exception 'Schedule is turned off for your role.' using errcode = '42501';
  end if;
  if v_at is null or v_minutes is null or v_minutes not between 5 and 720
     or jsonb_typeof(p -> 'student_ids') is distinct from 'array' then
    raise exception 'Check the start, length and clients.' using errcode = '22023';
  end if;
  return query
    select b.student_id, coalesce(s.full_name, b.client_name),
           to_char(a.starts_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI'), a.minutes, a.service,
           coalesce(sp.full_name, nullif(a.guest_instructor, ''), '')
      from public.appointment_clients b
      join public.appointments a on a.id = b.appointment_id
      left join public.students s on s.id = b.student_id
      left join public.staff_profiles sp on sp.user_id = a.staff_id
     where b.student_id in (select (x #>> '{}')::uuid from jsonb_array_elements(p -> 'student_ids') x)
       and b.status in ('BOOKED', 'CONFIRMED', 'ATTENDED')
       and a.status = 'BOOKED'
       and a.id is distinct from (p ->> 'id')::uuid
       and a.starts_at < v_at + make_interval(mins => v_minutes)
       and v_at < a.starts_at + make_interval(mins => a.minutes)
     order by a.starts_at, 2;
end;
$$;

-- save_appointment ------------------------------------------------------------------------------
-- p: {id?, updated_at (edits), start, minutes, staff_id, guest_instructor, service, capacity, scope?,
--     repeat?, clients: [{id?, student_id, status, notes}]}
-- 'following' (AUDIT-012/013): this date takes everything as sent. A later booked date of the series
-- takes each changed field (start, length, instructor, service, capacity) only if it still has this
-- date's old value; clients added here are booked there (where not booked yet) and clients left out
-- here are cancelled there. Statuses and notes of kept bookings change on this date only.
-- A new booking may not repeat one the client has with the same instructor at the same start (AUDIT-014).
-- Instructors without OWNER/ADMIN/STAFF: their own appointments only (AUDIT-016).
create or replace function public.save_appointment(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_minutes int := (p ->> 'minutes')::int;
  v_staff uuid := (p ->> 'staff_id')::uuid;
  v_service text := btrim(coalesce(p ->> 'service', ''));
  v_guest text := case when v_staff is null then btrim(coalesce(p ->> 'guest_instructor', '')) else '' end;
  v_capacity int := coalesce((p ->> 'capacity')::int, 1);
  v_scope text := coalesce(p ->> 'scope', 'one');
  v_clients jsonb := coalesce(p -> 'clients', '[]');
  v_rep jsonb := p -> 'repeat';
  v_own boolean := app.schedule_own_only();
  v_local timestamp;
  v_shift interval;
  v_every int; v_days int[]; v_ends text; v_count int; v_last date; v_date date;
  v_series uuid;
  v_ids uuid[] := '{}';
  v_later uuid[] := '{}';    -- later booked dates of the series ('following')
  v_touched uuid[] := '{}';  -- later dates whose bookings changed
  v_removed uuid[] := '{}';  -- clients left out of the list on this date
  v_new uuid[] := '{}';      -- bookings added by this save
  v_book uuid[];
  v_full_id uuid; v_full_day text;
  v_dup_name text; v_dup_at text;
  v public.appointments;
begin
  if not app.can('schedule') then
    raise exception 'Schedule is turned off for your role.' using errcode = '42501';
  end if;
  if app.studio_time(p ->> 'start') is null or v_minutes is null or v_minutes not between 5 and 720
     or char_length(v_service) not between 1 and 120 or v_capacity not between 1 and 50 or char_length(v_guest) > 80
     or v_scope not in ('one', 'following') or jsonb_typeof(v_clients) <> 'array' then
    raise exception 'Check the start, length, service, capacity and clients.' using errcode = '22023';
  end if;
  v_local := (p ->> 'start')::timestamp;
  if exists (select 1 from jsonb_array_elements(v_clients) c
              where c ->> 'id' is null
                and not exists (select 1 from public.students s where s.id = (c ->> 'student_id')::uuid)) then
    raise exception 'Client not found.' using errcode = 'P0002';
  end if;
  if v_own and v_staff is distinct from auth.uid() then
    raise exception 'Instructors can only book, change or cancel their own appointments.' using errcode = 'LPOWN';
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
      insert into public.appointments (starts_at, minutes, staff_id, guest_instructor, service, capacity, series_id)
      values ((v_date + v_local::time) at time zone 'America/Los_Angeles', v_minutes, v_staff, v_guest, v_service, v_capacity, v_series)
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
    if v_own and v.staff_id is distinct from auth.uid() then
      raise exception 'Instructors can only book, change or cancel their own appointments.' using errcode = 'LPOWN';
    end if;
    -- The screen sends the updated_at it loaded. Saving from an older copy would
    -- cancel bookings (and undo changes) someone else made since, so refuse it.
    if (p ->> 'updated_at') is null or v.updated_at <> (p ->> 'updated_at')::timestamptz then
      raise exception 'Someone else changed this appointment. Close it and open it again.' using errcode = 'LPSTL';
    end if;
    v_shift := v_local - (v.starts_at at time zone 'America/Los_Angeles');
    update public.appointments a set
      starts_at = ((a.starts_at at time zone 'America/Los_Angeles') + v_shift) at time zone 'America/Los_Angeles',
      minutes = v_minutes, staff_id = v_staff, guest_instructor = v_guest, service = v_service, capacity = v_capacity,
      updated_at = clock_timestamp(),
      series_changed = a.series_changed or (v_scope = 'one' and a.series_id is not null
        and (v_shift <> interval '0' or (a.staff_id, a.guest_instructor, a.service, a.minutes)
                                          is distinct from (v_staff, v_guest, v_service, v_minutes)))
     where a.id = v_id;
    v_ids := array[v_id];
    if v_scope = 'following' then
      -- An instructor's "following" leaves another instructor's dates (a substitute) alone.
      select coalesce(array_agg(id), '{}') into v_later
        from (select a.id from public.appointments a
               where a.series_id = v.series_id and a.status = 'BOOKED' and a.starts_at > v.starts_at
                 and (not v_own or a.staff_id = auth.uid())
               order by a.starts_at
                 for update) x;
    end if;

    -- Bookings left out of the list are cancelled, never deleted.
    select coalesce(array_agg(student_id) filter (where student_id is not null), '{}') into v_removed
      from public.appointment_clients
     where appointment_id = v_id and status <> 'CANCELLED'
       and id not in (select (c ->> 'id')::uuid from jsonb_array_elements(v_clients) c where c ->> 'id' is not null);
    update public.appointment_clients set status = 'CANCELLED'
     where appointment_id = v_id and status <> 'CANCELLED'
       and id not in (select (c ->> 'id')::uuid from jsonb_array_elements(v_clients) c where c ->> 'id' is not null);
    update public.appointment_clients b
       set status = coalesce(c ->> 'status', b.status), notes = coalesce(btrim(c ->> 'notes'), b.notes)
      from jsonb_array_elements(v_clients) c
     where b.appointment_id = v_id and b.id = (c ->> 'id')::uuid
       and (b.status, b.notes) is distinct from (coalesce(c ->> 'status', b.status), coalesce(btrim(c ->> 'notes'), b.notes));
    v_book := array[v_id];

    if cardinality(v_later) > 0 then
      -- AUDIT-013: clients left out here are cancelled on the later dates too (if still booked there) ...
      with x as (
        update public.appointment_clients b set status = 'CANCELLED'
         where b.appointment_id = any(v_later) and b.student_id = any(v_removed) and b.status in ('BOOKED', 'CONFIRMED')
        returning b.appointment_id)
      select v_touched || coalesce(array_agg(appointment_id), '{}') into v_touched from x;
      -- ... and clients added here are booked there, unless they already are.
      with x as (
        insert into public.appointment_clients (appointment_id, student_id, client_name, client_phone, client_email, status, notes)
        select a.id, s.id, s.full_name, s.phone, s.email, 'BOOKED', coalesce(btrim(c ->> 'notes'), '')
          from unnest(v_later) a(id)
         cross join jsonb_array_elements(v_clients) c
          join public.students s on s.id = (c ->> 'student_id')::uuid
         where c ->> 'id' is null
           and not exists (select 1 from public.appointment_clients k
                            where k.appointment_id = a.id and k.student_id = s.id and k.status <> 'CANCELLED')
        returning id, appointment_id)
      select v_new || coalesce(array_agg(id), '{}'), v_touched || coalesce(array_agg(appointment_id), '{}')
        into v_new, v_touched from x;

      -- AUDIT-012: each field changes on a later date only where it still has this date's old value
      -- (a field that didn't change stays as it is everywhere).
      with n as (
        select a.id,
               case when (a.starts_at at time zone 'America/Los_Angeles')::time = (v.starts_at at time zone 'America/Los_Angeles')::time
                    then ((a.starts_at at time zone 'America/Los_Angeles') + v_shift) at time zone 'America/Los_Angeles'
                    else a.starts_at end as starts_at,
               case when a.minutes = v.minutes then v_minutes else a.minutes end as minutes,
               case when (a.staff_id, a.guest_instructor) is not distinct from (v.staff_id, v.guest_instructor)
                    then v_staff else a.staff_id end as staff_id,
               case when (a.staff_id, a.guest_instructor) is not distinct from (v.staff_id, v.guest_instructor)
                    then v_guest else a.guest_instructor end as guest_instructor,
               case when a.service = v.service then v_service else a.service end as service,
               case when a.capacity = v.capacity then v_capacity else a.capacity end as capacity
          from public.appointments a
         where a.id = any(v_later)),
      u as (
        update public.appointments a set
          starts_at = n.starts_at, minutes = n.minutes, staff_id = n.staff_id, guest_instructor = n.guest_instructor,
          service = n.service, capacity = n.capacity, updated_at = clock_timestamp()
          from n
         where a.id = n.id
           and ((a.starts_at, a.minutes, a.staff_id, a.guest_instructor, a.service, a.capacity)
                  is distinct from (n.starts_at, n.minutes, n.staff_id, n.guest_instructor, n.service, n.capacity)
                or a.id = any(v_touched))
        returning a.id)
      select v_ids || coalesce(array_agg(id), '{}') into v_ids from u;
    end if;
  end if;

  with x as (
    insert into public.appointment_clients (appointment_id, student_id, client_name, client_phone, client_email, status, notes)
    select a.id, s.id, s.full_name, s.phone, s.email, coalesce(c ->> 'status', 'BOOKED'), coalesce(btrim(c ->> 'notes'), '')
      from unnest(v_book) a(id)
     cross join jsonb_array_elements(v_clients) c
      join public.students s on s.id = (c ->> 'student_id')::uuid
     where c ->> 'id' is null
    returning id)
  select v_new || coalesce(array_agg(id), '{}') into v_new from x;

  -- AUDIT-014: the same client with the same instructor at the same start, booked twice.
  -- Only new bookings are checked, so duplicates already in the data can still be edited.
  select b.client_name, to_char(a.starts_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI')
    into v_dup_name, v_dup_at
    from public.appointment_clients b
    join public.appointments a on a.id = b.appointment_id
   where b.id = any(v_new) and b.student_id is not null
     and exists (select 1 from public.appointments o
                   join public.appointment_clients k on k.appointment_id = o.id
                  where o.id <> a.id and o.status = 'BOOKED' and o.starts_at = a.starts_at
                    and (o.staff_id, o.guest_instructor) is not distinct from (a.staff_id, a.guest_instructor)
                    and k.student_id = b.student_id and k.status in ('BOOKED', 'CONFIRMED', 'ATTENDED'))
   order by a.starts_at
   limit 1;
  if v_dup_name is not null then
    raise exception '% is already booked with this instructor at %.', v_dup_name, v_dup_at
      using errcode = 'LPDBL', detail = v_dup_name, hint = v_dup_at;
  end if;

  -- Room for everyone on every date this save touched; a later date that would overfill
  -- refuses the whole save and says which date.
  select a.id, to_char(a.starts_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD') into v_full_id, v_full_day
    from public.appointments a
   where a.id = any(v_ids)
     and a.capacity < (select count(*) from public.appointment_clients b
                        where b.appointment_id = a.id and b.status <> 'CANCELLED')
   order by a.id = v_id desc, a.starts_at
   limit 1;
  if v_full_id = v_id then
    raise exception 'Class is full.' using errcode = '23514';
  elsif v_full_id is not null then
    raise exception 'Class is full on %. Nothing was saved.', v_full_day using errcode = '23514', detail = v_full_day;
  end if;
  return v_id;
end;
$$;

-- Drag and drop. 'one': this date (marked changed when it repeats; Undo passes the old flag back).
-- 'following': this and the later booked dates of its series that are still at this date's old
-- time (AUDIT-012), by the same wall-clock shift. Instructors: their own only (AUDIT-016).
create or replace function public.move_appointment(p_id uuid, p_start text, p_scope text default 'one',
                                                   p_series_changed boolean default true) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.appointments;
  v_own boolean := app.schedule_own_only();
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
  if v_own and v.staff_id is distinct from auth.uid() then
    raise exception 'Instructors can only book, change or cancel their own appointments.' using errcode = 'LPOWN';
  end if;
  update public.appointments a set
    starts_at = ((a.starts_at at time zone 'America/Los_Angeles')
                 + (p_start::timestamp - (v.starts_at at time zone 'America/Los_Angeles'))) at time zone 'America/Los_Angeles',
    series_changed = case when p_scope = 'one' and a.series_id is not null then coalesce(p_series_changed, true)
                          else a.series_changed end,
    updated_at = now()
   where a.id = p_id
      or (p_scope = 'following' and a.series_id = v.series_id and a.status = 'BOOKED' and a.starts_at > v.starts_at
          and (a.starts_at at time zone 'America/Los_Angeles')::time = (v.starts_at at time zone 'America/Los_Angeles')::time
          and (not v_own or a.staff_id = auth.uid()));
end;
$$;

-- Cancels this date, or this and the later dates of its series. Bookings stay as they are.
-- Instructors: their own only (AUDIT-016).
create or replace function public.cancel_appointment(p_id uuid, p_scope text default 'one') returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.appointments;
  v_own boolean := app.schedule_own_only();
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
  if v_own and v.staff_id is distinct from auth.uid() then
    raise exception 'Instructors can only book, change or cancel their own appointments.' using errcode = 'LPOWN';
  end if;
  update public.appointments a set status = 'CANCELLED', updated_at = now()
   where a.id = p_id
      or (p_scope = 'following' and a.series_id = v.series_id and a.status = 'BOOKED' and a.starts_at > v.starts_at
          and (not v_own or a.staff_id = auth.uid()));
end;
$$;

revoke all on function app.schedule_own_only(), public.schedule_client_clashes(jsonb), public.appointment_clients_full()
  from public, anon, authenticated;
grant execute on function public.schedule_client_clashes(jsonb), public.appointment_clients_full() to authenticated;

select app.check_api_exposure();
