-- Payments (Calvin, 2026-10-12):
-- 1. Mindbody is a payment method (shown before Other).
-- 2. Owners and admins can pick the payment date when recording (an open
--    month, not in the future). The old check compared role = 'OWNER', which
--    left admins out; it now uses app.is_owner() (Owner or Admin). Staff and
--    instructors still record today only.

insert into public.payment_methods (code, label_en, label_ko, sort_order)
values ('MINDBODY', 'Mindbody', 'Mindbody', 7)
on conflict (code) do nothing;
update public.payment_methods set sort_order = 8 where code = 'OTHER';

create or replace function public.record_payment(
  p_client_request_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_student_id uuid default null,
  p_payer_name text default null,
  p_notes text default '',
  p_confirm_duplicate boolean default false,
  p_business_date date default null,
  p_collected_by uuid default null,
  p_method_other text default ''
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  v_collector public.staff_profiles;
  v_payer text;
  v_other text;
  v public.payment_transactions;
begin
  select * into v from public.payment_transactions where client_request_id = p_client_request_id;
  if v.id is not null then
    if v.recorded_by <> v_me.user_id then
      raise exception 'Request id already used.' using errcode = '23505';
    end if;
    return v;
  end if;

  if p_business_date is not null and not app.is_owner() then
    raise exception 'Only an owner or admin can choose the date.' using errcode = '42501';
  end if;
  if p_business_date > app.la_today() then
    raise exception 'The date cannot be in the future.' using errcode = '22023';
  end if;
  perform app.require_method(p_method);
  v_other := app.method_other(p_method, p_method_other);
  v_collector := app.collector(p_collected_by);

  if p_student_id is not null then
    select full_name into v_payer from public.students where id = p_student_id and status = 'ACTIVE';
    if v_payer is null then
      raise exception 'Student not found.' using errcode = 'P0002';
    end if;
  else
    v_payer := coalesce(nullif(btrim(p_payer_name), ''), 'Walk-in');
  end if;

  if not p_confirm_duplicate and exists (
    select 1 from public.payment_transactions
     where kind = 'PAYMENT' and status = 'VALID' and amount_cents = p_amount_cents
       and recorded_at > now() - interval '10 minutes'
       and (student_id = p_student_id or (p_student_id is null and student_id is null and payer_name = v_payer))
  ) then
    raise exception 'A payment like this was saved in the last 10 minutes.' using errcode = 'LPDUP';
  end if;

  insert into public.payment_transactions (
    amount_cents, method, method_other, student_id, payer_name, recorded_by, recorded_by_name,
    collected_by, collected_by_name, business_date, notes, client_request_id)
  values (
    p_amount_cents, p_method, v_other, p_student_id, v_payer, v_me.user_id, v_me.full_name,
    v_collector.user_id, v_collector.full_name,
    coalesce(p_business_date, app.la_today()), btrim(coalesce(p_notes, '')), p_client_request_id)
  on conflict (client_request_id) do nothing
  returning * into v;

  if v.id is null then  -- the same request won a race a moment ago
    select * into v from public.payment_transactions where client_request_id = p_client_request_id;
  end if;
  return v;
end;
$$;
