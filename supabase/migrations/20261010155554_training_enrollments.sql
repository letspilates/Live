-- ============================================================================
-- Let's Pilates Admin Portal · Training courses and registrations
--
-- Replaces the Google Sheet (Apps Script) for teacher-training enrollment:
-- owners edit courses and read registrations in the portal; the public sign-up
-- form reads open courses and submits through two narrow public functions.
-- No emails are sent (Calvin, 2026-10-10).
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

create table public.training_courses (
  id uuid primary key default gen_random_uuid(),
  code text not null default '' check (length(code) <= 4),      -- A, B, C… in schedule order (set by the portal)
  name_en text not null default '' check (length(name_en) <= 200),
  name_kr text not null default '' check (length(name_kr) <= 200),
  dates text not null default '' check (length(dates) <= 200),  -- free text, e.g. "7/24 - 7/26"
  length_days int check (length_days between 1 and 365),
  capacity int check (capacity >= 0),                            -- null = no limit, 0 = closed
  class_time text not null default '' check (length(class_time) <= 100),
  price text not null default '' check (length(price) <= 50),
  fee text not null default '' check (length(fee) <= 50),
  fee_early text not null default '' check (length(fee_early) <= 50),
  early_until date,                                              -- first day of the regular fee
  conducted_by text not null default '' check (length(conducted_by) <= 100),
  desc_en text not null default '' check (length(desc_en) <= 2000),
  desc_kr text not null default '' check (length(desc_kr) <= 2000),
  active boolean not null default true,                          -- shown on the public form
  updated_at timestamptz not null default now()
);

create table public.training_registrations (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  course_ids uuid[] not null default '{}',
  -- What the applicant picked, as shown at the time ("A - Gyrotonic® …"). Kept
  -- even if a course is later deleted.
  courses_text text not null default '' check (length(courses_text) <= 2000),
  full_name text not null check (length(full_name) between 1 and 200),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(email) <= 254),
  phone text not null default '' check (length(phone) <= 50),
  certification text not null default '' check (length(certification) <= 500),
  studio text not null default '' check (length(studio) <= 500),
  city_state text not null default '' check (length(city_state) <= 200),
  questions text not null default '' check (length(questions) <= 4000),
  stage text not null default '' check (length(stage) <= 500),
  prereq text not null default '' check (length(prereq) <= 500),
  availability text not null default '' check (length(availability) <= 500),
  anything_else text not null default '' check (length(anything_else) <= 4000),
  source text not null default 'form' check (source in ('form', 'import')),
  unique (email, submitted_at)   -- makes re-running a sheet import harmless
);

create index training_registrations_courses_idx on public.training_registrations using gin (course_ids);

create trigger training_courses_audit
  after insert or update or delete on public.training_courses
  for each row execute function app.audit_row_change('id');

-- ---------------------------------------------------------------------------
-- Row Level Security: owners read both tables; every write goes through the
-- functions below. The public never reads the tables directly.
-- ---------------------------------------------------------------------------

alter table public.training_courses enable row level security;
alter table public.training_registrations enable row level security;

revoke all on public.training_courses, public.training_registrations from public, anon, authenticated;
grant select on public.training_courses, public.training_registrations to authenticated;

create policy training_courses_select on public.training_courses
  for select to authenticated using ((select app.is_owner()));
create policy training_registrations_select on public.training_registrations
  for select to authenticated using ((select app.is_owner()));

-- ---------------------------------------------------------------------------
-- Owner functions
-- ---------------------------------------------------------------------------

-- Replaces the course list in one transaction, like saving the old Courses tab:
-- rows missing from p_courses are deleted, the rest inserted or updated.
create function public.save_training_courses(p_courses jsonb) returns integer
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
    fee_early, early_until, conducted_by, desc_en, desc_kr, active, updated_at)
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
         coalesce((e ->> 'active')::boolean, true), now()
    from jsonb_array_elements(p_courses) e
  on conflict (id) do update set
    code = excluded.code, name_en = excluded.name_en, name_kr = excluded.name_kr,
    dates = excluded.dates, length_days = excluded.length_days, capacity = excluded.capacity,
    class_time = excluded.class_time, price = excluded.price, fee = excluded.fee,
    fee_early = excluded.fee_early, early_until = excluded.early_until,
    conducted_by = excluded.conducted_by, desc_en = excluded.desc_en, desc_kr = excluded.desc_kr,
    active = excluded.active, updated_at = now()
  where (t.code, t.name_en, t.name_kr, t.dates, t.length_days, t.capacity, t.class_time, t.price,
         t.fee, t.fee_early, t.early_until, t.conducted_by, t.desc_en, t.desc_kr, t.active)
        is distinct from
        (excluded.code, excluded.name_en, excluded.name_kr, excluded.dates, excluded.length_days,
         excluded.capacity, excluded.class_time, excluded.price, excluded.fee, excluded.fee_early,
         excluded.early_until, excluded.conducted_by, excluded.desc_en, excluded.desc_kr, excluded.active);

  select count(*) into v_count from public.training_courses;
  return v_count;
end;
$$;

-- One-time copy of the old Google Sheet sign-ups (the portal parses the CSV).
-- Rows already imported (same email and time) are skipped.
create function public.import_training_registrations(p_rows jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  perform app.require_owner();
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.' using errcode = '22023';
  end if;
  insert into public.training_registrations (
    submitted_at, course_ids, courses_text, full_name, email, phone, certification, studio,
    city_state, questions, stage, prereq, availability, anything_else, source)
  select (e ->> 'submitted_at')::timestamptz,
         coalesce(array(select jsonb_array_elements_text(e -> 'course_ids'))::uuid[], '{}'),
         coalesce(e ->> 'courses_text', ''), btrim(coalesce(e ->> 'full_name', '')),
         lower(btrim(coalesce(e ->> 'email', ''))), coalesce(e ->> 'phone', ''),
         coalesce(e ->> 'certification', ''), coalesce(e ->> 'studio', ''),
         coalesce(e ->> 'city_state', ''), coalesce(e ->> 'questions', ''),
         coalesce(e ->> 'stage', ''), coalesce(e ->> 'prereq', ''),
         coalesce(e ->> 'availability', ''), coalesce(e ->> 'anything_else', ''), 'import'
    from jsonb_array_elements(p_rows) e
  on conflict (email, submitted_at) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public functions (the sign-up form on the website, no login)
-- ---------------------------------------------------------------------------

-- Open courses with seat counts. Same shape the form read from Apps Script.
create function public.public_training_courses() returns jsonb
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
   where c.active;
$$;

-- One sign-up. Accepts only open courses; the table checks lengths and email.
-- ponytail: no rate limit; add one (or a captcha) if spam shows up.
create function public.submit_training_registration(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
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

  insert into public.training_registrations (
    course_ids, courses_text, full_name, email, phone, certification, studio, city_state,
    questions, stage, prereq, availability, anything_else, source)
  values (
    v_ids, coalesce(p ->> 'courses_text', ''), btrim(coalesce(p ->> 'full_name', '')),
    lower(btrim(coalesce(p ->> 'email', ''))), btrim(p ->> 'phone'), btrim(p ->> 'certification'),
    btrim(coalesce(p ->> 'studio', '')), btrim(coalesce(p ->> 'city_state', '')),
    btrim(coalesce(p ->> 'questions', '')), coalesce(p ->> 'stage', ''), coalesce(p ->> 'prereq', ''),
    coalesce(p ->> 'availability', ''), btrim(coalesce(p ->> 'anything_else', '')), 'form')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function
  public.save_training_courses(jsonb), public.import_training_registrations(jsonb),
  public.public_training_courses(), public.submit_training_registration(jsonb)
from public, anon, authenticated;
grant execute on function
  public.save_training_courses(jsonb), public.import_training_registrations(jsonb)
to authenticated;
grant execute on function
  public.public_training_courses(), public.submit_training_registration(jsonb)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Exposure check: the two public functions above are the only privileged
-- functions anon may run. Anything else still fails the migration.
-- ---------------------------------------------------------------------------

create or replace function app.check_api_exposure() returns void
language plpgsql set search_path = ''
as $$
declare
  v_bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app')
     and p.prosecdef
     and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
     and p.oid not in ('public.public_training_courses()'::regprocedure,
                       'public.submit_training_registration(jsonb)'::regprocedure);
  if v_bad is not null then
    raise exception 'anon can execute privileged functions: %', v_bad;
  end if;

  select string_agg(c.oid::regclass::text, ', ') into v_bad
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (not c.relrowsecurity
          or pg_catalog.has_table_privilege('anon', c.oid, 'select'));
  if v_bad is not null then
    raise exception 'tables without RLS or readable by anon: %', v_bad;
  end if;
end;
$$;
revoke all on function app.check_api_exposure() from public, anon, authenticated;

select app.check_api_exposure();
