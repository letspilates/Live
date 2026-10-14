-- Others (guest instructors): a category can be for guest-led events (trainings, workshops) instead of our
-- instructors. Its services carry the guest's name instead of a list of staff, and an appointment with no staff
-- can name the guest who leads it (shown as Other on the calendar). Additive only.

alter table public.schedule_categories add column guest boolean not null default false;
alter table public.schedule_services
  add column guest_instructor text not null default '' check (char_length(guest_instructor) <= 80);
alter table public.appointments
  add column guest_instructor text not null default '' check (char_length(guest_instructor) <= 80),
  add constraint appointments_guest_without_staff check (guest_instructor = '' or staff_id is null);

-- Rows in Trash come back through jsonb_populate_record: give them the new not-null columns.
update public.trash set data = data || '{"guest_instructor": ""}' where kind = 'schedule_service' and not data ? 'guest_instructor';
update public.trash set data = data || '{"guest": false}' where kind = 'schedule_category' and not data ? 'guest';

-- p: {id?, name, sort?, guest?}. guest = the services are led by guest instructors (Others). Returns the id.
create or replace function public.save_schedule_category(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
begin
  perform app.require_owner();
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Category name is required (up to 60 characters).' using errcode = '22023';
  end if;
  if exists (select 1 from public.schedule_categories where lower(name) = lower(v_name) and id is distinct from v_id) then
    raise exception 'A category with this name already exists.' using errcode = '23505';
  end if;
  if v_id is null then
    insert into public.schedule_categories (name, sort, guest)
    values (v_name, coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.schedule_categories)),
            coalesce((p ->> 'guest')::boolean, false))
    returning id into v_id;
  else
    update public.schedule_categories
       set name = v_name, sort = coalesce((p ->> 'sort')::int, sort), guest = coalesce((p ->> 'guest')::boolean, guest)
     where id = v_id;
    if not found then
      raise exception 'Category not found.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- p: {id?, name, minutes, capacity, active?, sort?, category_id?, price_cents?, cleanup_minutes?, description?, staff_ids?,
--     guest_instructor?} (guest_instructor: who leads it, for a service in an Others category).
-- With id: edit that service (a new name also renames it on the appointments of instructors who teach it). Without id: same name = edit, else add last.
-- A key left out keeps the saved value.
create or replace function public.save_schedule_service(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_staff uuid[];
  v public.schedule_services;
begin
  perform app.require_owner();
  if p ? 'staff_ids' and jsonb_typeof(p -> 'staff_ids') = 'array' then
    v_staff := array(select jsonb_array_elements_text(p -> 'staff_ids')::uuid);
    if cardinality(v_staff) = 0 then
      raise exception 'Pick at least one instructor.' using errcode = '22023';
    end if;
  end if;
  if v_id is null then
    select * into v from public.schedule_services where lower(name) = lower(v_name);
  else
    select * into v from public.schedule_services where id = v_id for update;
    if not found then
      raise exception 'Service not found.' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.schedule_services where lower(name) = lower(v_name) and id <> v_id) then
      raise exception 'A service with this name already exists.' using errcode = '23505';
    end if;
  end if;

  if v.id is null then
    insert into public.schedule_services (name, minutes, capacity, active, sort, category_id, price_cents, cleanup_minutes, description, staff_ids,
                                          guest_instructor)
    values (v_name, (p ->> 'minutes')::int, (p ->> 'capacity')::int, coalesce((p ->> 'active')::boolean, true),
            coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.schedule_services)),
            (p ->> 'category_id')::uuid, (p ->> 'price_cents')::int, coalesce((p ->> 'cleanup_minutes')::int, 0),
            btrim(coalesce(p ->> 'description', '')), v_staff, btrim(coalesce(p ->> 'guest_instructor', '')))
    returning id into v_id;
    return v_id;
  end if;

  if not p ? 'staff_ids' then
    v_staff := v.staff_ids;
  end if;
  update public.schedule_services set
    name            = v_name,
    minutes         = (p ->> 'minutes')::int,
    capacity        = (p ->> 'capacity')::int,
    active          = coalesce((p ->> 'active')::boolean, active),
    sort            = coalesce((p ->> 'sort')::int, sort),
    category_id     = case when p ? 'category_id' then (p ->> 'category_id')::uuid else category_id end,
    price_cents     = case when p ? 'price_cents' then (p ->> 'price_cents')::int else price_cents end,
    cleanup_minutes = coalesce((p ->> 'cleanup_minutes')::int, cleanup_minutes),
    description     = coalesce(btrim(p ->> 'description'), description),
    staff_ids       = case when p ? 'staff_ids' then v_staff else staff_ids end,
    guest_instructor = coalesce(btrim(p ->> 'guest_instructor'), guest_instructor)
  where id = v.id;
  if v.name <> v_name then
    -- Another instructor's appointments keep the old name ('Gyrotonic' renamed 'Gyrotonic with Sunnie' is Sunnie's only).
    update public.appointments a set service = v_name, updated_at = now()
     where a.service = v.name and (a.staff_id is null or v_staff is null or a.staff_id = any(v_staff));
  end if;
  return v.id;
end;
$$;

-- p: {id?, start, minutes, staff_id, guest_instructor?, service, capacity, scope?, repeat?, clients: [{id?, student_id, status, notes}]}
-- guest_instructor: a guest who leads it (Other); only without staff_id.
-- New: one row, or with repeat one row per chosen weekday every N weeks
--   (ends never = 52 weeks ahead, after count dates, or on the until date); every date gets the same clients.
-- Edit 'one': this row; a repeating date changed on its own is marked series_changed.
-- Edit 'following': this row and the later booked dates of its series (moved by the same
--   wall-clock shift). Clients change on this row only; ones left out of the list are cancelled.
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
    v_shift := v_local - (v.starts_at at time zone 'America/Los_Angeles');
    with u as (
      update public.appointments a set
        starts_at = ((a.starts_at at time zone 'America/Los_Angeles') + v_shift) at time zone 'America/Los_Angeles',
        minutes = v_minutes, staff_id = v_staff, guest_instructor = v_guest, service = v_service, capacity = v_capacity,
        updated_at = now(),
        series_changed = a.series_changed or (v_scope = 'one' and a.series_id is not null
          and (v_shift <> interval '0' or (a.staff_id, a.guest_instructor, a.service, a.minutes)
                                            is distinct from (v_staff, v_guest, v_service, v_minutes)))
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

select app.check_api_exposure();
