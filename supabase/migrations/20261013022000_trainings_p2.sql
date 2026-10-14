-- P2 fixes from the 2026-10-13 Staging audit (docs/staging-audit/P2-FIX-PLAN.md): trainings.
-- Additive: no data is deleted.

-- ---------------------------------------------------------------------------
-- AUDIT-011: courses are saved one at a time.
-- The old save_training_courses replaced the whole list and deleted every course
-- missing from it, so a tab left open could delete a course someone else had just
-- added and leave its registrants pointing at nothing. Now:
--   save_training_course    inserts or updates ONE course. An update must send the
--                           updated_at the screen loaded; if someone saved the course
--                           since (or deleted it), it is refused (LPSTL).
--   delete_training_course  refuses a course that has registrants (LPREG): hide it
--                           instead (turn off "Show on the site").
--   set_training_course_codes  re-letters A, B, C… (the letter only; the version
--                           does not move, so it never makes someone else's save stale).
-- Owner/Admin only, like before.
-- ---------------------------------------------------------------------------

create function public.save_training_course(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v public.training_courses;
begin
  perform app.require_owner();
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'A course must be an object.' using errcode = '22023';
  end if;
  v_id := nullif(p ->> 'id', '')::uuid;

  if v_id is null then
    insert into public.training_courses (
      code, name_en, name_kr, dates, length_days, capacity, class_time, price, fee,
      fee_early, early_until, conducted_by, desc_en, desc_kr, active, ends_on, held_seats, updated_at)
    values (
      coalesce(p ->> 'code', ''),
      btrim(coalesce(p ->> 'name_en', '')), btrim(coalesce(p ->> 'name_kr', '')),
      btrim(coalesce(p ->> 'dates', '')),
      nullif(p ->> 'length_days', '')::int, nullif(p ->> 'capacity', '')::int,
      btrim(coalesce(p ->> 'class_time', '')), btrim(coalesce(p ->> 'price', '')),
      btrim(coalesce(p ->> 'fee', '')), btrim(coalesce(p ->> 'fee_early', '')),
      nullif(p ->> 'early_until', '')::date,
      coalesce(p ->> 'conducted_by', ''),
      btrim(coalesce(p ->> 'desc_en', '')), btrim(coalesce(p ->> 'desc_kr', '')),
      coalesce((p ->> 'active')::boolean, true), nullif(p ->> 'ends_on', '')::date,
      coalesce(nullif(p ->> 'held_seats', '')::int, 0), clock_timestamp())
    returning id into v_id;
    return v_id;
  end if;

  select * into v from public.training_courses where id = v_id for update;
  if not found then
    raise exception 'This course was deleted by someone else. Refresh the page.' using errcode = 'LPSTL';
  end if;
  -- Saving from an older copy would undo what someone else saved since, so refuse it.
  if (p ->> 'updated_at') is null or v.updated_at <> (p ->> 'updated_at')::timestamptz then
    raise exception 'Someone else changed this course. Refresh the page and make your change again.' using errcode = 'LPSTL';
  end if;

  -- The letter (code) is left alone here: set_training_course_codes owns it.
  update public.training_courses t set
    name_en = n.name_en, name_kr = n.name_kr, dates = n.dates, length_days = n.length_days,
    capacity = n.capacity, class_time = n.class_time, price = n.price, fee = n.fee,
    fee_early = n.fee_early, early_until = n.early_until, conducted_by = n.conducted_by,
    desc_en = n.desc_en, desc_kr = n.desc_kr, active = n.active, ends_on = n.ends_on,
    held_seats = n.held_seats, updated_at = clock_timestamp()
  from (select
      btrim(coalesce(p ->> 'name_en', '')) as name_en, btrim(coalesce(p ->> 'name_kr', '')) as name_kr,
      btrim(coalesce(p ->> 'dates', '')) as dates,
      nullif(p ->> 'length_days', '')::int as length_days, nullif(p ->> 'capacity', '')::int as capacity,
      btrim(coalesce(p ->> 'class_time', '')) as class_time, btrim(coalesce(p ->> 'price', '')) as price,
      btrim(coalesce(p ->> 'fee', '')) as fee, btrim(coalesce(p ->> 'fee_early', '')) as fee_early,
      nullif(p ->> 'early_until', '')::date as early_until,
      coalesce(p ->> 'conducted_by', '') as conducted_by,
      btrim(coalesce(p ->> 'desc_en', '')) as desc_en, btrim(coalesce(p ->> 'desc_kr', '')) as desc_kr,
      coalesce((p ->> 'active')::boolean, true) as active, nullif(p ->> 'ends_on', '')::date as ends_on,
      coalesce(nullif(p ->> 'held_seats', '')::int, 0) as held_seats) n
  where t.id = v_id
    and (t.name_en, t.name_kr, t.dates, t.length_days, t.capacity, t.class_time, t.price, t.fee,
         t.fee_early, t.early_until, t.conducted_by, t.desc_en, t.desc_kr, t.active, t.ends_on, t.held_seats)
        is distinct from
        (n.name_en, n.name_kr, n.dates, n.length_days, n.capacity, n.class_time, n.price, n.fee,
         n.fee_early, n.early_until, n.conducted_by, n.desc_en, n.desc_kr, n.active, n.ends_on, n.held_seats);
  return v_id;
end;
$$;

create function public.delete_training_course(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  -- Locked first, so a sign-up for this course waits and then finds it gone.
  perform 1 from public.training_courses where id = p_id for update;
  if not found then
    return;  -- already deleted
  end if;
  if exists (select 1 from public.training_registrations r where p_id = any (r.course_ids)) then
    raise exception 'This course has registrants, so it can''t be deleted. Turn off "Show on the site" to hide it instead.'
      using errcode = 'LPREG';
  end if;
  delete from public.training_courses where id = p_id;
end;
$$;

-- p: { "<course id>": "A", … }. Ids that no longer exist are skipped.
create function public.set_training_course_codes(p jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Codes must be an object.' using errcode = '22023';
  end if;
  update public.training_courses c set code = e.value
    from jsonb_each_text(p) e
   where c.id = e.key::uuid and c.code is distinct from e.value;
end;
$$;

-- A tab opened before this update still calls the whole-list save: refuse it (it
-- deletes nothing) and ask for a refresh, which loads the per-course screen.
create or replace function public.save_training_courses(p_courses jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  raise exception 'This page is out of date. Refresh the page and try again.' using errcode = 'LPSTL';
end;
$$;

revoke all on function
  public.save_training_course(jsonb), public.delete_training_course(uuid), public.set_training_course_codes(jsonb)
from public, anon, authenticated;
grant execute on function
  public.save_training_course(jsonb), public.delete_training_course(uuid), public.set_training_course_codes(jsonb)
to authenticated;

-- ---------------------------------------------------------------------------
-- AUDIT-018: at most 3 sign-ups an hour from one connection (client IP), on top of
-- the per-email and overall limits. Supabase passes the client address as the first
-- x-forwarded-for entry in request.headers; without it nothing is blocked.
-- Only a SHA-256 of the address is kept, for a day, in a table the API can't reach
-- (schema app; no grants, RLS on with no policies).
-- ---------------------------------------------------------------------------

create table app.training_signup_ips (
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index training_signup_ips_hash_idx on app.training_signup_ips (ip_hash, created_at);
alter table app.training_signup_ips enable row level security;
revoke all on app.training_signup_ips from public, anon, authenticated;

create or replace function public.submit_training_registration(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_ip text;
  v_ip_hash text;
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
  begin
    v_ip := btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1));
  exception when others then
    v_ip := null;  -- no or unreadable headers: never block on that
  end;
  if v_ip <> '' then
    v_ip_hash := encode(sha256(convert_to(v_ip, 'UTF8')), 'hex');
    perform pg_advisory_xact_lock(hashtextextended('training_signup_ip:' || v_ip_hash, 0));
    if (select count(*) from app.training_signup_ips
         where ip_hash = v_ip_hash and created_at > now() - interval '1 hour') >= 3 then
      raise exception 'Too many sign-ups from this connection. Please try again later or contact the studio.' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from public.training_registrations
       where source = 'form' and submitted_at > now() - interval '1 hour') >= 60 then
    raise exception 'Sign-ups are busy right now. Please try again later.' using errcode = '22023';
  end if;
  perform 1 from public.training_courses where id = any (v_ids) order by id for update;
  -- A course deleted or hidden while this sign-up waited for its lock is not open any more.
  if (select count(*) from public.training_courses where id = any (v_ids) and active) < cardinality(v_ids) then
    raise exception 'Choose at least one open course.' using errcode = '22023';
  end if;
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

  if v_ip_hash is not null then
    delete from app.training_signup_ips where created_at < now() - interval '1 day';
    insert into app.training_signup_ips (ip_hash) values (v_ip_hash);
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_training_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_training_registration(jsonb) to anon, authenticated;

select app.check_api_exposure();
