-- ============================================================================
-- Let's Pilates Admin Portal · Daily Income: who received the money
--
-- Several staff take payments, and the person typing it in is not always the
-- one who was handed the money. collected_by = the staff member who received
-- it (defaults to the recorder). Staff see payments they recorded or received.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

alter table public.payment_transactions
  add column collected_by uuid references public.staff_profiles (user_id) on delete restrict,
  add column collected_by_name text;
update public.payment_transactions set collected_by = recorded_by, collected_by_name = recorded_by_name;
alter table public.payment_transactions
  alter column collected_by set not null,
  alter column collected_by_name set not null;
create index payment_transactions_collector_idx on public.payment_transactions (collected_by, business_date desc);

drop policy payment_transactions_select on public.payment_transactions;
create policy payment_transactions_select on public.payment_transactions
  for select to authenticated
  using (((select auth.uid()) in (recorded_by, collected_by) and (select app.is_active_staff()))
         or (select app.is_owner()));

-- Active staff, for the "Received by" picker. Names only.
create function public.list_collectors() returns table (user_id uuid, full_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app.me();
  return query
    select s.user_id, s.full_name from public.staff_profiles s
     where s.status = 'ACTIVE' order by s.full_name;
end;
$$;

-- The active staff row for p_user_id (null = the caller), or an error.
create function app.collector(p_user_id uuid) returns public.staff_profiles
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.staff_profiles;
begin
  select * into v from public.staff_profiles
   where user_id = coalesce(p_user_id, auth.uid()) and status = 'ACTIVE';
  if v.user_id is null then
    raise exception 'Choose who received the payment.' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- record_payment and correct_payment gain p_collected_by (same rules otherwise).
drop function public.record_payment(uuid, bigint, text, uuid, text, text, boolean, date);
drop function public.correct_payment(uuid, bigint, text, text, text);

create function public.record_payment(
  p_client_request_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_student_id uuid default null,
  p_payer_name text default null,
  p_notes text default '',
  p_confirm_duplicate boolean default false,
  p_business_date date default null,
  p_collected_by uuid default null
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  v_collector public.staff_profiles;
  v_payer text;
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
    amount_cents, method, student_id, payer_name, recorded_by, recorded_by_name,
    collected_by, collected_by_name, business_date, notes, client_request_id)
  values (
    p_amount_cents, p_method, p_student_id, v_payer, v_me.user_id, v_me.full_name,
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

-- p_collected_by null = keep who received it.
create function public.correct_payment(
  p_id uuid, p_amount_cents bigint, p_method text, p_notes text default '', p_reason text default '',
  p_collected_by uuid default null
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
     set amount_cents = p_amount_cents, method = p_method, notes = btrim(coalesce(p_notes, '')),
         collected_by = v_collector.user_id, collected_by_name = v_collector.full_name
   where id = v.id
  returning * into v;
  return v;
end;
$$;

-- Refunds: the owner who records it is the one who gave the money back.
create or replace function public.record_refund(
  p_client_request_id uuid, p_original_id uuid, p_amount_cents bigint, p_method text, p_reason text
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
    kind, amount_cents, method, student_id, payer_name, related_transaction_id,
    recorded_by, recorded_by_name, collected_by, collected_by_name, business_date, reason, client_request_id)
  values (
    'REFUND', p_amount_cents, p_method, v_orig.student_id, v_orig.payer_name, v_orig.id,
    v_me.user_id, v_me.full_name, v_me.user_id, v_me.full_name, app.la_today(), btrim(p_reason), p_client_request_id)
  returning * into v;
  return v;
end;
$$;

revoke all on function
  public.list_collectors(), app.collector(uuid),
  public.record_payment(uuid, bigint, text, uuid, text, text, boolean, date, uuid),
  public.correct_payment(uuid, bigint, text, text, text, uuid)
from public, anon, authenticated;
grant execute on function
  public.list_collectors(),
  public.record_payment(uuid, bigint, text, uuid, text, text, boolean, date, uuid),
  public.correct_payment(uuid, bigint, text, text, text, uuid)
to authenticated;

select app.check_api_exposure();
