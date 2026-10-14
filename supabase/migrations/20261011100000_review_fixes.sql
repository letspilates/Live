-- ============================================================================
-- Let's Pilates Admin Portal · database review fixes (2026-10-11)
--
-- Each fix below was reproduced on a local copy of the migrations first;
-- supabase/tests/review.test.sql keeps them fixed.
--   1. Staff "Notes" (labelled "only owners and admins see these") were readable
--      by the person themselves: select on their own staff_profiles row and
--      current_staff() both returned them.
--   2. A deactivated user could still change their own name, phone, address
--      and certifications (update_my_profile / update_my_name).
--   3. record_staff_invite (older function, still callable) let an ADMIN
--      rename an invited OWNER: it skipped the owner-account guard.
--   4. Refunds could add up to more than the payment: correcting a refund did
--      not lock the payment, so a refund recorded at the same moment passed
--      its own check against the old amount.
--   5. Correcting a payment whose "received by" person was later deactivated
--      failed unless the owner moved the money to someone else.
--   6. The public training form accepted sign-ups for full courses (and for
--      capacity 0 = closed); only the page hid them.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

-- 1. Staff notes: owners and admins only --------------------------------------
revoke select on public.staff_profiles from authenticated;
grant select (user_id, full_name, email, role, roles, status, pricing_tier, invited_at, created_at,
              phone, address, certifications)
  on public.staff_profiles to authenticated;

create or replace function public.current_staff() returns public.staff_profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v public.staff_profiles;
begin
  update public.staff_profiles
     set status = 'ACTIVE'
   where user_id = auth.uid() and status = 'INVITED'
  returning * into v;
  if v.user_id is null then
    select * into v from public.staff_profiles where user_id = auth.uid();
  end if;
  if v.user_id is not null and not app.is_owner() then
    v.notes := '';
  end if;
  return v;
end;
$$;

-- 2. Own-profile edits: active accounts only ---------------------------------
create or replace function public.update_my_name(p_full_name text) returns void
language sql security definer set search_path = ''
as $$
  update public.staff_profiles set full_name = btrim(p_full_name)
   where user_id = auth.uid() and status = 'ACTIVE';
$$;

create or replace function public.update_my_profile(p jsonb) returns void
language sql security definer set search_path = ''
as $$
  update public.staff_profiles
     set full_name = coalesce(nullif(btrim(p ->> 'full_name'), ''), full_name),
         phone = btrim(coalesce(p ->> 'phone', phone)), address = btrim(coalesce(p ->> 'address', address)),
         certifications = btrim(coalesce(p ->> 'certifications', certifications))
   where user_id = auth.uid() and status = 'ACTIVE';
$$;

-- 3. record_staff_invite: same owner-account rule as every other user function --
create or replace function public.record_staff_invite(
  p_user_id uuid, p_full_name text, p_email text, p_pricing_tier text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  perform app.guard_owner_change(p_user_id);
  if not exists (select 1 from auth.users
                  where id = p_user_id and lower(email) = lower(btrim(p_email))) then
    raise exception 'Invited user not found.' using errcode = 'P0002';
  end if;
  insert into public.staff_profiles (user_id, full_name, email, role, status, pricing_tier, invited_at)
  values (p_user_id, btrim(p_full_name), lower(btrim(p_email)), 'INSTRUCTOR', 'INVITED',
          p_pricing_tier, now())
  on conflict (user_id) do update
     set full_name = excluded.full_name,
         pricing_tier = excluded.pricing_tier,
         invited_at = now()
   where public.staff_profiles.status = 'INVITED';
end;
$$;

-- 4 + 5. correct_payment ---------------------------------------------------------
-- A refund's payment is locked before the refund total is checked (record_refund
-- locks it too, so the two take turns). "Received by" is only checked when it
-- changes, so a payment received by someone since deactivated can be corrected.
create or replace function public.correct_payment(
  p_id uuid, p_amount_cents bigint, p_method text, p_notes text default '', p_reason text default '',
  p_collected_by uuid default null, p_method_other text default ''
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v public.payment_transactions := app.editable_payment(p_id);
  v_collector public.staff_profiles;
begin
  if p_collected_by is null or p_collected_by = v.collected_by then
    v_collector.user_id := v.collected_by;
    v_collector.full_name := v.collected_by_name;
  else
    v_collector := app.collector(p_collected_by);
  end if;
  perform app.require_method(p_method);
  if v.kind = 'REFUND' then
    perform 1 from public.payment_transactions where id = v.related_transaction_id for update;
  end if;
  if p_amount_cents < (select coalesce(sum(amount_cents), 0) from public.payment_transactions
                        where related_transaction_id = p_id and status = 'VALID') then
    raise exception 'The amount cannot be less than what was already refunded.' using errcode = '22023';
  end if;
  if v.kind = 'REFUND' and p_amount_cents + (
       select coalesce(sum(amount_cents), 0) from public.payment_transactions
        where related_transaction_id = v.related_transaction_id and status = 'VALID' and id <> v.id)
     > (select amount_cents from public.payment_transactions where id = v.related_transaction_id) then
    raise exception 'Refunds cannot add up to more than the payment.' using errcode = '22023';
  end if;
  perform set_config('app.reason', btrim(coalesce(p_reason, '')), true);
  update public.payment_transactions
     set amount_cents = p_amount_cents, method = p_method, method_other = app.method_other(p_method, p_method_other), notes = btrim(coalesce(p_notes, '')),
         collected_by = v_collector.user_id, collected_by_name = v_collector.full_name
   where id = v.id
  returning * into v;
  return v;
end;
$$;

-- 6. Training sign-up: full courses are refused by the database too ------------
-- The chosen courses are locked so two sign-ups for the last seat take turns.
create or replace function public.submit_training_registration(p jsonb) returns uuid
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
  perform 1 from public.training_courses where id = any (v_ids) order by id for update;
  if exists (select 1 from public.training_courses c
              where c.id = any (v_ids) and c.capacity is not null
                and (select count(*) from public.training_registrations r where c.id = any (r.course_ids)) >= c.capacity) then
    raise exception 'That course is full.' using errcode = '22023';
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

-- create or replace keeps existing grants; restate them so this file stands alone.
revoke all on function
  public.current_staff(), public.update_my_name(text), public.update_my_profile(jsonb),
  public.record_staff_invite(uuid, text, text, text),
  public.correct_payment(uuid, bigint, text, text, text, uuid, text),
  public.submit_training_registration(jsonb)
from public, anon, authenticated;
grant execute on function
  public.current_staff(), public.update_my_name(text), public.update_my_profile(jsonb),
  public.record_staff_invite(uuid, text, text, text),
  public.correct_payment(uuid, bigint, text, text, text, uuid, text),
  public.submit_training_registration(jsonb)
to authenticated;
grant execute on function public.submit_training_registration(jsonb) to anon;

select app.check_api_exposure();
