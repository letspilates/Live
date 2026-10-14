-- A service renamed in Settings keeps taking the rows Schedulista exports under its old name:
-- services remember that name (source_name, never changed by a rename) and the import looks it up.

alter table public.schedule_services add column source_name text;
update public.schedule_services set source_name = name;

-- p_rows: [{row, start, minutes, service, instructor, source_service, client_name, client_phone,
--           client_email, notes, price_cents, created}]
-- Rows already imported are skipped (never overwritten), so the same file can be imported again.
-- Instructor: the staff whose name, letters only, starts with the CSV name ('Sukyung' = 'Su kyung YI').
-- Client: same Schedulista key as the Clients import, or same phone and a matching name; else name/phone only.
-- p_commit false = dry run: same work, then undone, so the counts are exact. Returns
-- {total, importable, duplicates, failed, appointments_new, errors: [{row, reason}] (first 200)}.
create or replace function public.import_schedule(p_rows jsonb, p_commit boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  v_start text; v_at timestamptz; v_minutes int; v_service text; v_instructor text; v_ikey text;
  v_name text; v_phone text; v_digits text; v_akey text; v_bkey text; v_reason text;
  v_n int; v_staff uuid; v_student uuid; v_appt uuid;
  v_svc text; v_cap int;
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
        -- The service by its name, or by its Schedulista name if it was renamed in Settings.
        select s.name, s.capacity into v_svc, v_cap from public.schedule_services s
         where lower(s.name) = lower(v_service) or lower(s.source_name) = lower(v_service)
         order by lower(s.name) = lower(v_service) desc limit 1;
        insert into public.appointments (starts_at, minutes, staff_id, service, capacity, source_key)
        values (v_at, v_minutes, v_staff, coalesce(v_svc, v_service), coalesce(v_cap, 1), v_akey)
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

select app.check_api_exposure();
