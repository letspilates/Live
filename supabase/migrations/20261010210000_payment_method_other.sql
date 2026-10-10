-- ============================================================================
-- Let's Pilates Admin Portal · Payments: "Other" method text, client history
--
-- 1. A payment made with "Other" says what it was (method_other, required for
--    new payments, refunds and corrections that use Other).
-- 2. client_payments(): the chosen client's recent payments on the payment
--    screen, for every active staff member (date, amount, method only).
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

alter table public.payment_transactions
  add column method_other text not null default '' check (length(method_other) <= 60),
  add constraint payment_transactions_method_other check (method = 'OTHER' or method_other = '');

-- The text to store for p_method: required for OTHER, empty for anything else.
create function app.method_other(p_method text, p_other text) returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if p_method <> 'OTHER' then
    return '';
  end if;
  if btrim(coalesce(p_other, '')) = '' then
    raise exception 'Write what the other payment method was.' using errcode = '22023';
  end if;
  return left(btrim(p_other), 60);
end;
$$;

drop function public.record_payment(uuid, bigint, text, uuid, text, text, boolean, date, uuid);
drop function public.correct_payment(uuid, bigint, text, text, text, uuid);
drop function public.record_refund(uuid, uuid, bigint, text, text);

create function public.record_payment(
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

  if p_business_date is not null and v_me.role <> 'OWNER' then
    raise exception 'Only the owner can choose the date.' using errcode = '42501';
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

create function public.correct_payment(
  p_id uuid, p_amount_cents bigint, p_method text, p_notes text default '', p_reason text default '',
  p_collected_by uuid default null, p_method_other text default ''
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v public.payment_transactions := app.editable_payment(p_id);
  v_collector public.staff_profiles := app.collector(coalesce(p_collected_by, v.collected_by));
begin
  perform app.require_method(p_method);
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

create function public.record_refund(
  p_client_request_id uuid, p_original_id uuid, p_amount_cents bigint, p_method text, p_reason text,
  p_method_other text default ''
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  v_orig public.payment_transactions;
  v public.payment_transactions;
begin
  perform app.require_owner();
  select * into v from public.payment_transactions where client_request_id = p_client_request_id;
  if v.id is not null then
    return v;
  end if;
  select * into v_orig from public.payment_transactions where id = p_original_id for update;
  if v_orig.id is null or v_orig.kind <> 'PAYMENT' or v_orig.status <> 'VALID' then
    raise exception 'Only a valid payment can be refunded.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Give a reason.' using errcode = '22023';
  end if;
  perform app.require_method(p_method);
  if p_amount_cents + (select coalesce(sum(amount_cents), 0) from public.payment_transactions
                        where related_transaction_id = p_original_id and status = 'VALID')
     > v_orig.amount_cents then
    raise exception 'Refunds cannot add up to more than the payment.' using errcode = '22023';
  end if;

  insert into public.payment_transactions (
    kind, amount_cents, method, method_other, student_id, payer_name, related_transaction_id,
    recorded_by, recorded_by_name, collected_by, collected_by_name, business_date, reason, client_request_id)
  values (
    'REFUND', p_amount_cents, p_method, app.method_other(p_method, p_method_other), v_orig.student_id, v_orig.payer_name, v_orig.id,
    v_me.user_id, v_me.full_name, v_me.user_id, v_me.full_name, app.la_today(), btrim(p_reason), p_client_request_id)
  returning * into v;
  return v;
end;
$$;

-- The client's last 10 payments and refunds, newest first.
create function public.client_payments(p_student_id uuid)
returns table (business_date date, kind text, status text, amount_cents bigint, method text, method_other text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app.me();
  return query
    select t.business_date, t.kind, t.status, t.amount_cents, t.method, t.method_other
      from public.payment_transactions t
     where t.student_id = p_student_id
     order by t.recorded_at desc
     limit 10;
end;
$$;

revoke all on function
  app.method_other(text, text),
  public.record_payment(uuid, bigint, text, uuid, text, text, boolean, date, uuid, text),
  public.correct_payment(uuid, bigint, text, text, text, uuid, text),
  public.record_refund(uuid, uuid, bigint, text, text, text),
  public.client_payments(uuid)
from public, anon, authenticated;
grant execute on function
  public.record_payment(uuid, bigint, text, uuid, text, text, boolean, date, uuid, text),
  public.correct_payment(uuid, bigint, text, text, text, uuid, text),
  public.record_refund(uuid, uuid, bigint, text, text, text),
  public.client_payments(uuid)
to authenticated;

select app.check_api_exposure();
