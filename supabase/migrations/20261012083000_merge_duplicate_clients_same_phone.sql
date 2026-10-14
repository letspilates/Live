-- ============================================================================
-- Clients · merge duplicates, follow-up (2026-10-12)
--
-- After the first merge some people still showed twice with the same name and
-- the same phone number: two records in the same system (e.g. two Mindbody
-- accounts) or two different emails kept them apart. Same name + same phone
-- is now always one client; the second system ID is kept in
-- extra_source_keys so a re-import still finds that client.
-- Name matching also ignores hyphens, dots and apostrophes inside a name
-- ("Hye-soo" = "Hyesoo"); commas still separate words ("Lee, Jean").
-- ============================================================================

alter table public.students add column extra_source_keys text[] not null default '{}';

create or replace function app.client_name_key(p text) returns text
language sql immutable set search_path = ''
as $$
  select array_to_string(array(
    select t from regexp_split_to_table(
             regexp_replace(regexp_replace(lower(coalesce(p, '')), '[,/&]', ' ', 'g'), '[[:punct:][:digit:]]', '', 'g'),
             '[[:space:]]+') t
     where t <> '' order by t), ' ');
$$;

reindex index public.students_name_key_idx;

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


create or replace function app.merge_duplicate_clients() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  v_drop uuid;
  v_merged int := 0;
  v_apart int := 0;
begin
  -- Same name and same phone number: the same person, even with two emails or
  -- two records in one system (the extra source IDs are kept on the client).
  for g in
    select array_agg(s.id order by exists (select 1 from public.payment_transactions t where t.student_id = s.id) desc,
                                   s.status = 'ACTIVE' desc, s.created_at, s.id) ids
      from public.students s
     where s.merged_into is null and app.client_name_key(s.full_name) <> ''
       and length(regexp_replace(s.phone, '\D', '', 'g')) >= 7
     group by app.client_name_key(s.full_name), right(regexp_replace(s.phone, '\D', '', 'g'), 10)
    having count(*) > 1
  loop
    begin
      foreach v_drop in array g.ids[2:] loop
        perform app.merge_client(g.ids[1], v_drop);
      end loop;
      v_merged := v_merged + cardinality(g.ids) - 1;
    exception when others then
      v_apart := v_apart + 1;
    end;
  end loop;

  for g in
    select array_agg(s.id order by exists (select 1 from public.payment_transactions t where t.student_id = s.id) desc,
                                   s.status = 'ACTIVE' desc, s.created_at, s.id) ids,
           count(distinct right(regexp_replace(s.phone, '\D', '', 'g'), 10))
             filter (where length(regexp_replace(s.phone, '\D', '', 'g')) >= 7) phones,
           count(distinct lower(s.email)) filter (where s.email <> '') emails,
           count(s.mindbody_id) mb, count(s.schedulista_key) sc
      from public.students s
     where s.merged_into is null and app.client_name_key(s.full_name) <> ''
     group by app.client_name_key(s.full_name)
    having count(*) > 1
  loop
    if g.phones > 1 or g.emails > 1 or g.mb > 1 or g.sc > 1 then
      v_apart := v_apart + 1;
      continue;
    end if;
    begin
      foreach v_drop in array g.ids[2:] loop
        perform app.merge_client(g.ids[1], v_drop);
      end loop;
      v_merged := v_merged + cardinality(g.ids) - 1;
    exception when others then
      v_apart := v_apart + 1;
    end;
  end loop;
  return jsonb_build_object('merged', v_merged, 'left_apart', v_apart);
end;
$$;


create or replace function public.import_members(p_source text, p_rows jsonb) returns jsonb
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
     where (p_source = 'MINDBODY' and mindbody_id = v_key) or (p_source = 'SCHEDULISTA' and schedulista_key = v_key)
        or (p_source || ':' || v_key) = any(extra_source_keys)
     limit 1;
    v_same_source := v_id is not null;
    if v_id is null and v_email <> '' then
      select id into v_id from public.students
       where lower(email) = v_email and merged_into is null
         and (case when p_source = 'MINDBODY' then mindbody_id else schedulista_key end) is null
       order by created_at limit 1;
    end if;
    if v_id is null and length(v_digits) >= 7 then
      select id into v_id from public.students
       where right(regexp_replace(phone, '\D', '', 'g'), 10) = v_digits and app.same_name(full_name, v_name)
         and merged_into is null
         and (case when p_source = 'MINDBODY' then mindbody_id else schedulista_key end) is null
       order by created_at limit 1;
    end if;

    -- Same name, nothing conflicting, only if exactly one such client (see app.merge_duplicate_clients).
    if v_id is null then
      select (array_agg(id))[1] into v_id from public.students
       where merged_into is null and app.client_name_key(full_name) = app.client_name_key(v_name)
         and (case when p_source = 'MINDBODY' then mindbody_id else schedulista_key end) is null
         and (length(v_digits) < 7 or length(regexp_replace(phone, '\D', '', 'g')) < 7
              or right(regexp_replace(phone, '\D', '', 'g'), 10) = v_digits)
         and (v_email = '' or email = '' or lower(email) = v_email)
      having count(*) = 1;
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


-- Merge what the first pass left apart.
select app.merge_duplicate_clients();

select app.check_api_exposure();
