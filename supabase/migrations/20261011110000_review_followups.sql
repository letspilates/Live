-- ============================================================================
-- Let's Pilates Admin Portal · review follow-ups (Calvin, 2026-10-11)
--   1. Owners and admins can delete a training applicant (personal-data
--      requests). Applicants are not financial records; the audit log keeps
--      the deleted row.
--   2. Public training form spam limits: one email at most 3 sign-ups per day,
--      and at most 60 form sign-ups per hour in total.
--   3. set_staff_status returns true when the status is already what was asked
--      (so a retry after a failed sign-in ban still works) and false only when
--      there is no active/deactivated user; the staff-admin function then
--      refuses to ban or unban an unknown login.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

-- 1. Delete an applicant (Owner/Admin) ----------------------------------------
create trigger training_registrations_audit
  after delete on public.training_registrations
  for each row execute function app.audit_row_change('id');

create function public.delete_training_registration(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  delete from public.training_registrations where id = p_id;
  if not found then raise exception 'Applicant not found.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.delete_training_registration(uuid) from public, anon, authenticated;
grant execute on function public.delete_training_registration(uuid) to authenticated;

-- 2. Public form spam limits --------------------------------------------------
create index if not exists training_registrations_email_time_idx
  on public.training_registrations (email, submitted_at);

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
                and (select count(*) from public.training_registrations r where c.id = any (r.course_ids)) >= c.capacity) then
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
revoke all on function public.submit_training_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_training_registration(jsonb) to anon, authenticated;

-- 3. set_staff_status: idempotent, false only for unknown/invited users ---------
create or replace function public.set_staff_status(p_user_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  perform app.guard_owner_change(p_user_id);
  if p_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'Status must be ACTIVE or INACTIVE.' using errcode = '22023';
  end if;
  if p_status = 'INACTIVE' then
    perform app.assert_keeps_an_owner(p_user_id);
  end if;
  update public.staff_profiles
     set status = p_status
   where user_id = p_user_id and status not in ('INVITED', p_status);
  if found then return true; end if;
  return exists (select 1 from public.staff_profiles where user_id = p_user_id and status = p_status);
end;
$$;
revoke all on function public.set_staff_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_staff_status(uuid, text) to authenticated;

select app.check_api_exposure();
