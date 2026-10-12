-- Courses whose last day has passed disappear from the public sign-up form on
-- their own. The portal saves the last day (ends_on) from the schedule text;
-- null = no end date known, so the course stays until hidden by hand.
alter table public.training_courses add column if not exists ends_on date;

-- Last days of the courses seeded from the Sheets export (2026).
update public.training_courses c set ends_on = v.d::date
  from (values ('A', '2026-07-26'), ('B', '2026-08-16'), ('C', '2026-08-22'),
               ('D', '2026-09-20'), ('E', '2026-11-01')) v(code, d)
 where c.code = v.code and c.ends_on is null
   and c.dates in ('7/24 - 7/26', '8/7 - 8/9, 8/13 - 8/16', '8/22', '9/18 - 9/20', '10/29 - 11/1');

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
    fee_early, early_until, conducted_by, desc_en, desc_kr, active, ends_on, updated_at)
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
         coalesce((e ->> 'active')::boolean, true), nullif(e ->> 'ends_on', '')::date, now()
    from jsonb_array_elements(p_courses) e
  on conflict (id) do update set
    code = excluded.code, name_en = excluded.name_en, name_kr = excluded.name_kr,
    dates = excluded.dates, length_days = excluded.length_days, capacity = excluded.capacity,
    class_time = excluded.class_time, price = excluded.price, fee = excluded.fee,
    fee_early = excluded.fee_early, early_until = excluded.early_until,
    conducted_by = excluded.conducted_by, desc_en = excluded.desc_en, desc_kr = excluded.desc_kr,
    active = excluded.active, ends_on = excluded.ends_on, updated_at = now()
  where (t.code, t.name_en, t.name_kr, t.dates, t.length_days, t.capacity, t.class_time, t.price,
         t.fee, t.fee_early, t.early_until, t.conducted_by, t.desc_en, t.desc_kr, t.active, t.ends_on)
        is distinct from
        (excluded.code, excluded.name_en, excluded.name_kr, excluded.dates, excluded.length_days,
         excluded.capacity, excluded.class_time, excluded.price, excluded.fee, excluded.fee_early,
         excluded.early_until, excluded.conducted_by, excluded.desc_en, excluded.desc_kr, excluded.active, excluded.ends_on);

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
           'taken', (select count(*) from public.training_registrations r where c.id = any (r.course_ids)),
           'time', c.class_time, 'price', c.price, 'fee', c.fee, 'fee_early', c.fee_early,
           'early_until', coalesce(c.early_until::text, ''), 'conducted_by', c.conducted_by)
         order by length(c.code), c.code), '[]'::jsonb)
    from public.training_courses c
   where c.active
     and (c.ends_on is null or c.ends_on >= (now() at time zone 'America/Los_Angeles')::date);
$$;
