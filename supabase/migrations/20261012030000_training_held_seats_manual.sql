-- Seats taken outside the sign-up form (Calvin, 2026-10-12, "both"):
--   1. held_seats: a plain number of seats held for people who said yes verbally.
--   2. Owner/Admin can add a registrant by hand (source 'manual'): name required,
--      phone and email optional.
-- Both count toward a course's taken seats on the site and in the full check.

alter table public.training_courses
  add column if not exists held_seats int not null default 0 check (held_seats between 0 and 1000);

alter table public.training_registrations drop constraint if exists training_registrations_source_check;
alter table public.training_registrations add constraint training_registrations_source_check
  check (source in ('form', 'import', 'manual'));
alter table public.training_registrations drop constraint if exists training_registrations_email_check;
alter table public.training_registrations add constraint training_registrations_email_check
  check ((email = '' and source = 'manual')
         or (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(email) <= 254));

create or replace function public.save_training_courses(p_courses jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  perform app.require_owner();
  if jsonb_typeof(p_courses) is distinct from 'array' then
    raise exception 'Courses must be a list.' using errcode = '22023';
  end if;

  delete from public.training_courses
   where id not in (select (e ->> 'id')::uuid
                      from jsonb_array_elements(p_courses) e
                     where nullif(e ->> 'id', '') is not null);

  insert into public.training_courses as t (
    id, code, name_en, name_kr, dates, length_days, capacity, class_time, price, fee,
    fee_early, early_until, conducted_by, desc_en, desc_kr, active, ends_on, held_seats, updated_at)
  select coalesce(nullif(e ->> 'id', '')::uuid, gen_random_uuid()),
         coalesce(e ->> 'code', ''),
         btrim(coalesce(e ->> 'name_en', '')), btrim(coalesce(e ->> 'name_kr', '')),
         btrim(coalesce(e ->> 'dates', '')),
         nullif(e ->> 'length_days', '')::int, nullif(e ->> 'capacity', '')::int,
         btrim(coalesce(e ->> 'class_time', '')), btrim(coalesce(e ->> 'price', '')),
         btrim(coalesce(e ->> 'fee', '')), btrim(coalesce(e ->> 'fee_early', '')),
         nullif(e ->> 'early_until', '')::date,
         coalesce(e ->> 'conducted_by', ''),
         btrim(coalesce(e ->> 'desc_en', '')), btrim(coalesce(e ->> 'desc_kr', '')),
         coalesce((e ->> 'active')::boolean, true), nullif(e ->> 'ends_on', '')::date,
         coalesce(nullif(e ->> 'held_seats', '')::int, 0), now()
    from jsonb_array_elements(p_courses) e
  on conflict (id) do update set
    code = excluded.code, name_en = excluded.name_en, name_kr = excluded.name_kr,
    dates = excluded.dates, length_days = excluded.length_days, capacity = excluded.capacity,
    class_time = excluded.class_time, price = excluded.price, fee = excluded.fee,
    fee_early = excluded.fee_early, early_until = excluded.early_until,
    conducted_by = excluded.conducted_by, desc_en = excluded.desc_en, desc_kr = excluded.desc_kr,
    active = excluded.active, ends_on = excluded.ends_on, held_seats = excluded.held_seats, updated_at = now()
  where (t.code, t.name_en, t.name_kr, t.dates, t.length_days, t.capacity, t.class_time, t.price,
         t.fee, t.fee_early, t.early_until, t.conducted_by, t.desc_en, t.desc_kr, t.active, t.ends_on, t.held_seats)
        is distinct from
        (excluded.code, excluded.name_en, excluded.name_kr, excluded.dates, excluded.length_days,
         excluded.capacity, excluded.class_time, excluded.price, excluded.fee, excluded.fee_early,
         excluded.early_until, excluded.conducted_by, excluded.desc_en, excluded.desc_kr, excluded.active, excluded.ends_on, excluded.held_seats);

  select count(*) into v_count from public.training_courses;
  return v_count;
end;
$$;

create or replace function public.public_training_courses() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'uid', c.id, 'id', c.code, 'name_en', c.name_en, 'name_kr', c.name_kr,
           'dates', c.dates,
           'tag_en', case when c.length_days is null then ''
                          else c.length_days || case when c.length_days = 1 then ' day' else ' days' end end,
           'tag_kr', case when c.length_days is null then '' else c.length_days || '일' end,
           'capacity', c.capacity,
           'taken', c.held_seats + (select count(*) from public.training_registrations r where c.id = any (r.course_ids)),
           'time', c.class_time, 'price', c.price, 'fee', c.fee, 'fee_early', c.fee_early,
           'early_until', coalesce(c.early_until::text, ''), 'conducted_by', c.conducted_by)
         order by length(c.code), c.code), '[]'::jsonb)
    from public.training_courses c
   where c.active
     and (c.ends_on is null or c.ends_on >= (now() at time zone 'America/Los_Angeles')::date);
$$;

create or replace function public.submit_training_registration(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
begin
  select coalesce(array_agg(distinct x::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p -> 'course_ids', '[]'::jsonb)) x;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 20
     or exists (select 1 from unnest(v_ids) u
                 where not exists (select 1 from public.training_courses c where c.id = u and c.active)) then
    raise exception 'Choose at least one open course.' using errcode = '22023';
  end if;
  if btrim(coalesce(p ->> 'phone', '')) = '' or btrim(coalesce(p ->> 'certification', '')) = '' then
    raise exception 'Phone and certification are required.' using errcode = '22023';
  end if;
  -- Spam limits (checked before the course locks so a flood does no work).
  if (select count(*) from public.training_registrations
       where email = v_email and submitted_at > now() - interval '1 day') >= 3 then
    raise exception 'This email already signed up today. Please contact the studio.' using errcode = '22023';
  end if;
  if (select count(*) from public.training_registrations
       where source = 'form' and submitted_at > now() - interval '1 hour') >= 60 then
    raise exception 'Sign-ups are busy right now. Please try again later.' using errcode = '22023';
  end if;
  perform 1 from public.training_courses where id = any (v_ids) order by id for update;
  if exists (select 1 from public.training_courses c
              where c.id = any (v_ids) and c.capacity is not null
                and c.held_seats + (select count(*) from public.training_registrations r where c.id = any (r.course_ids)) >= c.capacity) then
    raise exception 'That course is full.' using errcode = '22023';
  end if;

  insert into public.training_registrations (
    course_ids, courses_text, full_name, email, phone, certification, studio, city_state,
    questions, stage, prereq, availability, anything_else, source)
  values (
    v_ids, coalesce(p ->> 'courses_text', ''), btrim(coalesce(p ->> 'full_name', '')),
    v_email, btrim(p ->> 'phone'), btrim(p ->> 'certification'),
    btrim(coalesce(p ->> 'studio', '')), btrim(coalesce(p ->> 'city_state', '')),
    btrim(coalesce(p ->> 'questions', '')), coalesce(p ->> 'stage', ''), coalesce(p ->> 'prereq', ''),
    coalesce(p ->> 'availability', ''), btrim(coalesce(p ->> 'anything_else', '')), 'form')
  returning id into v_id;
  return v_id;
end;
$$;

-- Owner/Admin adds a registrant by hand (phone or in person). No capacity check:
-- the owner decides. Course text is built from the chosen courses.
create function public.add_training_registration(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
begin
  perform app.require_owner();
  select coalesce(array_agg(distinct x::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p -> 'course_ids', '[]'::jsonb)) x;
  if cardinality(v_ids) = 0
     or exists (select 1 from unnest(v_ids) u
                 where not exists (select 1 from public.training_courses c where c.id = u)) then
    raise exception 'Choose at least one course.' using errcode = '22023';
  end if;
  insert into public.training_registrations (
    submitted_at, course_ids, courses_text, full_name, email, phone, questions, source)
  values (
    clock_timestamp(), v_ids,
    (select string_agg(c.code || ' - ' || c.name_en, ', ' order by length(c.code), c.code)
       from public.training_courses c where c.id = any (v_ids)),
    btrim(coalesce(p ->> 'full_name', '')), v_email, btrim(coalesce(p ->> 'phone', '')),
    btrim(coalesce(p ->> 'note', '')), 'manual')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_training_registration(jsonb) from public, anon, authenticated;
grant execute on function public.add_training_registration(jsonb) to authenticated;
