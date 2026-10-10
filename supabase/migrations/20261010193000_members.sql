-- ============================================================================
-- Let's Pilates Admin Portal · Members (회원 관리)
--
-- One member list for the studio, fed by client exports from Mindbody and
-- Schedulista (CSV, imported in the portal by an owner) and by the payment
-- screen. Each member shows which system they came from. Re-importing a newer
-- export updates the same members instead of adding duplicates.
-- Members are the existing `students` rows (payments already point at them).
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

alter table public.students
  add column notes                   text not null default '' check (length(notes) <= 2000),
  add column address                 text not null default '' check (length(address) <= 300),
  -- Mindbody: client ID from the export
  add column mindbody_id             text unique check (length(mindbody_id) <= 40),
  add column mindbody_imported_at    timestamptz,
  -- Schedulista has no client ID: key = lower(name) | phone digits
  add column schedulista_key         text unique check (length(schedulista_key) <= 200),
  add column schedulista_imported_at timestamptz,
  add column schedulista_last_visit  timestamp,    -- studio local time, as exported
  add column schedulista_next_visit  timestamp,
  add column schedulista_visits      int check (schedulista_visits >= 0),
  add column schedulista_services    text[] not null default '{}',
  add column schedulista_notes       text not null default '' check (length(schedulista_notes) <= 2000);

create index students_phone_idx on public.students (right(regexp_replace(phone, '\D', '', 'g'), 10));
create index students_email_idx on public.students (lower(email)) where email <> '';

-- Same person? Name tokens (letters only) equal as a set, or the same first name.
-- Used only together with a matching phone number.
create function app.same_name(a text, b text) returns boolean
language sql immutable set search_path = ''
as $$
  with x as (select array(select t from regexp_split_to_table(lower(a), '[^[:alpha:]]+') t where t <> '' order by t) s,
                    (regexp_split_to_array(btrim(lower(a)), '[^[:alpha:]]+'))[1] f),
       y as (select array(select t from regexp_split_to_table(lower(b), '[^[:alpha:]]+') t where t <> '' order by t) s,
                    (regexp_split_to_array(btrim(lower(b)), '[^[:alpha:]]+'))[1] f)
  select x.s = y.s or (x.f <> '' and x.f = y.f) from x, y;
$$;

-- Owner: imports one export. p_source = 'MINDBODY' | 'SCHEDULISTA'.
-- p_rows: [{full_name, phone, email, address, mindbody_id | last_visit, next_visit, visits, services[], notes}]
-- Matching, in order: same source record → same email → same phone with a matching name.
-- A match only fills blank contact fields (owner edits are kept); the source's
-- own fields are refreshed. Returns {added, linked, updated, skipped}.
create function public.import_members(p_source text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  r jsonb;
  v_name text; v_phone text; v_digits text; v_email text; v_key text;
  v_id uuid; v_same_source boolean;
  v_added int := 0; v_linked int := 0; v_updated int := 0; v_skipped int := 0;
begin
  perform app.require_owner();
  if p_source not in ('MINDBODY', 'SCHEDULISTA') then
    raise exception 'Source must be MINDBODY or SCHEDULISTA.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list.' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := left(btrim(regexp_replace(coalesce(r ->> 'full_name', ''), '\s+', ' ', 'g')), 120);
    v_phone := left(btrim(coalesce(r ->> 'phone', '')), 30);
    v_digits := right(regexp_replace(v_phone, '\D', '', 'g'), 10);
    v_email := left(lower(btrim(coalesce(r ->> 'email', ''))), 254);
    v_key := case when p_source = 'MINDBODY' then nullif(btrim(coalesce(r ->> 'mindbody_id', '')), '')
                  else nullif(lower(v_name) || '|' || v_digits, '|') end;
    if v_name = '' or v_key is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_id := null;
    select id into v_id from public.students
     where (p_source = 'MINDBODY' and mindbody_id = v_key) or (p_source = 'SCHEDULISTA' and schedulista_key = v_key);
    v_same_source := v_id is not null;
    if v_id is null and v_email <> '' then
      select id into v_id from public.students
       where lower(email) = v_email
         and (case when p_source = 'MINDBODY' then mindbody_id else schedulista_key end) is null
       order by created_at limit 1;
    end if;
    if v_id is null and length(v_digits) >= 7 then
      select id into v_id from public.students
       where right(regexp_replace(phone, '\D', '', 'g'), 10) = v_digits and app.same_name(full_name, v_name)
         and (case when p_source = 'MINDBODY' then mindbody_id else schedulista_key end) is null
       order by created_at limit 1;
    end if;

    if v_id is null then
      insert into public.students (full_name, phone, email, created_by) values (v_name, v_phone, v_email, v_me.user_id)
      returning id into v_id;
      v_added := v_added + 1;
    elsif v_same_source then
      v_updated := v_updated + 1;
    else
      v_linked := v_linked + 1;
    end if;

    -- One update per row (one audit entry): blank contact fields filled, source fields refreshed.
    update public.students s set
      phone   = case when s.phone = '' then v_phone else s.phone end,
      email   = case when s.email = '' then v_email else s.email end,
      address = case when s.address = '' then left(btrim(coalesce(r ->> 'address', '')), 300) else s.address end,
      mindbody_id = case when p_source = 'MINDBODY' then v_key else s.mindbody_id end,
      mindbody_imported_at = case when p_source = 'MINDBODY' then now() else s.mindbody_imported_at end,
      schedulista_key = case when p_source = 'SCHEDULISTA' then v_key else s.schedulista_key end,
      schedulista_imported_at = case when p_source = 'SCHEDULISTA' then now() else s.schedulista_imported_at end,
      schedulista_last_visit = case when p_source = 'SCHEDULISTA' then nullif(r ->> 'last_visit', '')::timestamp else s.schedulista_last_visit end,
      schedulista_next_visit = case when p_source = 'SCHEDULISTA' then nullif(r ->> 'next_visit', '')::timestamp else s.schedulista_next_visit end,
      schedulista_visits = case when p_source = 'SCHEDULISTA' then nullif(r ->> 'visits', '')::int else s.schedulista_visits end,
      schedulista_services = case when p_source = 'SCHEDULISTA'
        then coalesce(array(select left(btrim(x), 100) from jsonb_array_elements_text(coalesce(r -> 'services', '[]')) x
                             where btrim(x) <> ''), '{}')
        else s.schedulista_services end,
      schedulista_notes = case when p_source = 'SCHEDULISTA' then left(btrim(coalesce(r ->> 'notes', '')), 2000)
                               else s.schedulista_notes end
     where s.id = v_id;
  end loop;

  return jsonb_build_object('added', v_added, 'linked', v_linked, 'updated', v_updated, 'skipped', v_skipped);
end;
$$;

-- Owner: edit a member's details (contact, notes, active/inactive).
create function public.update_member(
  p_id uuid, p_full_name text, p_phone text, p_email text, p_address text, p_notes text, p_status text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  if p_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'Status must be ACTIVE or INACTIVE.' using errcode = '22023';
  end if;
  update public.students set
    full_name = btrim(p_full_name), phone = btrim(coalesce(p_phone, '')), email = lower(btrim(coalesce(p_email, ''))),
    address = btrim(coalesce(p_address, '')), notes = btrim(coalesce(p_notes, '')), status = p_status
   where id = p_id;
  if not found then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function app.same_name(text, text), public.import_members(text, jsonb),
  public.update_member(uuid, text, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.import_members(text, jsonb),
  public.update_member(uuid, text, text, text, text, text, text)
to authenticated;

select app.check_api_exposure();
