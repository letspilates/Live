-- Payments (Calvin, 2026-10-12): editing a payment can change its date.
-- Only an owner or admin may move a payment to another day (an open month,
-- not in the future; the closed-month trigger checks the old and new month).
-- Also: app.editable_payment compared role = 'OWNER', which left admins out
-- of editing other people's or older payments; it now uses app.is_owner().

create or replace function app.editable_payment(p_id uuid) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  v public.payment_transactions;
begin
  select * into v from public.payment_transactions where id = p_id for update;
  if v.id is null or (not app.is_owner() and v.recorded_by <> v_me.user_id) then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if v.status <> 'VALID' then
    raise exception 'This payment is already void.' using errcode = '22023';
  end if;
  if not app.is_owner() and v.business_date <> app.la_today() then
    raise exception 'Only the owner can change a payment after the day it was recorded.' using errcode = 'LPDAY';
  end if;
  return v;
end;
$$;

drop function public.correct_payment(uuid, bigint, text, text, text, uuid, text);

create function public.correct_payment(
  p_id uuid, p_amount_cents bigint, p_method text, p_notes text default '', p_reason text default '',
  p_collected_by uuid default null, p_method_other text default '',
  p_business_date date default null
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
  if p_business_date is not null and p_business_date <> v.business_date then
    if not app.is_owner() then
      raise exception 'Only an owner or admin can change the date.' using errcode = '42501';
    end if;
    if p_business_date > app.la_today() then
      raise exception 'The date cannot be in the future.' using errcode = '22023';
    end if;
  end if;
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
         collected_by = v_collector.user_id, collected_by_name = v_collector.full_name,
         business_date = coalesce(p_business_date, v.business_date)
   where id = v.id
  returning * into v;
  return v;
end;
$$;


revoke all on function public.correct_payment(uuid, bigint, text, text, text, uuid, text, date) from public, anon, authenticated;
grant execute on function public.correct_payment(uuid, bigint, text, text, text, uuid, text, date) to authenticated;

select app.check_api_exposure();
