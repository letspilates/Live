-- ============================================================================
-- Let's Pilates Admin Portal · Daily Income (Phase 5)
--
-- Staff record the payments they receive; owners see every payment.
-- Money is integer cents, dates are Los Angeles business days, nothing is
-- deleted (a mistake is voided, with a reason). Plan: docs/admin/PHASE-5-PLAN.md.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Students the studio takes payments from. Built up from the payment screen
-- ("add new student"); staff search them through search_students() only.
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone       text not null default '' check (length(phone) <= 30),
  email       text not null default '' check (length(email) <= 254),
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by  uuid references public.staff_profiles (user_id) on delete restrict,
  created_at  timestamptz not null default now()
);

create table public.payment_methods (
  code        text primary key,
  label_en    text not null,
  label_ko    text not null,
  active      boolean not null default true,
  sort_order  int not null default 0
);

insert into public.payment_methods (code, label_en, label_ko, sort_order) values
  ('CASH', 'Cash', '현금', 1),
  ('ZELLE', 'Zelle', 'Zelle', 2),
  ('VENMO', 'Venmo', 'Venmo', 3),
  ('CREDIT', 'Credit card', '신용카드', 4),
  ('DEBIT', 'Debit card', '체크카드', 5),
  ('CHECK', 'Check', '수표', 6),
  ('OTHER', 'Other', '기타', 7);

-- One row per month. Payments in a CLOSED month cannot be added or changed
-- (closing itself arrives with the monthly closing screen, Phase 7).
create table public.accounting_periods (
  month      date primary key check (extract(day from month) = 1),
  status     text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  closed_by  uuid references public.staff_profiles (user_id) on delete restrict,
  closed_at  timestamptz
);

create table public.payment_transactions (
  id                      uuid primary key default gen_random_uuid(),
  kind                    text not null default 'PAYMENT' check (kind in ('PAYMENT', 'REFUND')),
  status                  text not null default 'VALID' check (status in ('VALID', 'VOID')),
  amount_cents            bigint not null check (amount_cents > 0 and amount_cents <= 2000000),  -- $20,000 cap catches typos
  method                  text not null references public.payment_methods (code) on delete restrict,
  student_id              uuid references public.students (id) on delete restrict,             -- null = walk-in
  payer_name              text not null check (char_length(payer_name) between 1 and 120),      -- snapshot, so staff never need the students table
  related_transaction_id  uuid references public.payment_transactions (id) on delete restrict,  -- the payment a refund returns
  recorded_by             uuid not null references public.staff_profiles (user_id) on delete restrict,
  recorded_by_name        text not null,
  recorded_at             timestamptz not null default now(),
  business_date           date not null,                                                        -- Los Angeles date
  notes                   text not null default '' check (
                            length(notes) <= 500
                            and regexp_replace(notes, '[\s-]', '', 'g') !~ '\d{13,19}'),          -- no card numbers
  reason                  text not null default '' check (length(reason) <= 500),               -- refund / void reason
  client_request_id       uuid not null unique,                                                 -- a resent request saves once
  voided_at               timestamptz,
  voided_by               uuid references public.staff_profiles (user_id) on delete restrict,
  check ((kind = 'REFUND') = (related_transaction_id is not null)),
  check ((status = 'VOID') = (voided_at is not null))
);

create index payment_transactions_date_idx on public.payment_transactions (business_date) where status = 'VALID';
create index payment_transactions_recorder_idx on public.payment_transactions (recorded_by, business_date desc);
create index payment_transactions_student_idx on public.payment_transactions (student_id, recorded_at desc);
create index payment_transactions_related_idx on public.payment_transactions (related_transaction_id);

create trigger students_audit
  after insert or update or delete on public.students
  for each row execute function app.audit_row_change('id');
create trigger payment_transactions_audit
  after insert or update or delete on public.payment_transactions
  for each row execute function app.audit_row_change('id');
create trigger accounting_periods_audit
  after insert or update or delete on public.accounting_periods
  for each row execute function app.audit_row_change('month');

-- ---------------------------------------------------------------------------
-- Closed-month lock: checks the month a payment is in before and after the
-- change. FOR SHARE waits for a closing in progress on the same month.
-- ---------------------------------------------------------------------------

create function app.enforce_open_period() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.accounting_periods p
     where p.month in (date_trunc('month', new.business_date)::date,
                       date_trunc('month', case when tg_op = 'UPDATE' then old.business_date
                                                else new.business_date end)::date)
       and p.status = 'CLOSED'
       for share
  ) then
    raise exception 'That month is closed.' using errcode = 'LPCLS';
  end if;
  return new;
end;
$$;

create trigger payment_transactions_open_period
  before insert or update on public.payment_transactions
  for each row execute function app.enforce_open_period();

-- ---------------------------------------------------------------------------
-- Row Level Security. Staff read their own payments; owners read everything.
-- Every write goes through the functions below.
-- ---------------------------------------------------------------------------

alter table public.students enable row level security;
alter table public.payment_methods enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.payment_transactions enable row level security;

revoke all on public.students, public.payment_methods, public.accounting_periods, public.payment_transactions
  from public, anon, authenticated;
grant select on public.students, public.payment_methods, public.accounting_periods, public.payment_transactions
  to authenticated;

create policy students_select on public.students
  for select to authenticated using ((select app.is_owner()));
create policy payment_methods_select on public.payment_methods
  for select to authenticated using ((select app.is_active_staff()));
create policy accounting_periods_select on public.accounting_periods
  for select to authenticated using ((select app.is_owner()));
create policy payment_transactions_select on public.payment_transactions
  for select to authenticated
  using ((recorded_by = (select auth.uid()) and (select app.is_active_staff())) or (select app.is_owner()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function app.la_today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Los_Angeles')::date $$;

-- The caller's active staff row, or an error.
create function app.me() returns public.staff_profiles
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.staff_profiles;
begin
  select * into v from public.staff_profiles where user_id = auth.uid() and status = 'ACTIVE';
  if v.user_id is null then
    raise exception 'Only active staff can do this.' using errcode = '42501';
  end if;
  return v;
end;
$$;

create function app.require_method(p_method text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.payment_methods where code = p_method and active) then
    raise exception 'Choose a payment method.' using errcode = '22023';
  end if;
end;
$$;

-- A payment the caller may correct or void (locked for the change), or an error.
-- Staff: their own, recorded today (LA). Owners: any. Both: still valid.
create function app.editable_payment(p_id uuid) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  v public.payment_transactions;
begin
  select * into v from public.payment_transactions where id = p_id for update;
  if v.id is null or (v_me.role <> 'OWNER' and v.recorded_by <> v_me.user_id) then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if v.status <> 'VALID' then
    raise exception 'This payment is already void.' using errcode = '22023';
  end if;
  if v_me.role <> 'OWNER' and v.business_date <> app.la_today() then
    raise exception 'Only the owner can change a payment after the day it was recorded.' using errcode = 'LPDAY';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- API functions
-- ---------------------------------------------------------------------------

-- Student picker for the payment screen. Fewer than 2 characters → the
-- students paid most recently. Returns only what is needed to tell people
-- apart (no email, no full phone number).
create function public.search_students(p_query text default '')
returns table (
  id uuid, full_name text, phone_last4 text,
  last_paid_on date, last_amount_cents bigint, last_method text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  perform app.me();
  return query
    select s.id, s.full_name, right(regexp_replace(s.phone, '\D', '', 'g'), 4),
           p.business_date, p.amount_cents, p.method
      from public.students s
      left join lateral (
        select t.business_date, t.amount_cents, t.method, t.recorded_at
          from public.payment_transactions t
         where t.student_id = s.id and t.kind = 'PAYMENT' and t.status = 'VALID'
         order by t.recorded_at desc
         limit 1
      ) p on true
     where s.status = 'ACTIVE'
       and (case when char_length(v_q) < 2 then p.recorded_at is not null
                 else strpos(lower(s.full_name), v_q) > 0
                      or (char_length(v_digits) >= 3 and strpos(regexp_replace(s.phone, '\D', '', 'g'), v_digits) > 0)
            end)
     order by p.recorded_at desc nulls last, s.full_name
     limit case when char_length(v_q) < 2 then 8 else 10 end;
end;
$$;

-- Adds a student from the payment screen. The same name and phone twice
-- returns the existing student instead of a duplicate.
create function public.add_student(p_full_name text, p_phone text default '') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_id uuid;
begin
  select id into v_id from public.students
   where status = 'ACTIVE' and lower(full_name) = lower(v_name)
     and regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
   limit 1;
  if v_id is null then
    insert into public.students (full_name, phone, created_by)
    values (v_name, v_phone, v_me.user_id)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Records a received payment. The recorder is always the caller and the time
-- is now; only an owner may back-date (p_business_date, an open month).
-- The same p_client_request_id twice returns the first payment unchanged.
-- Same student and amount within 10 minutes → error LPDUP unless confirmed.
create function public.record_payment(
  p_client_request_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_student_id uuid default null,
  p_payer_name text default null,
  p_notes text default '',
  p_confirm_duplicate boolean default false,
  p_business_date date default null
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
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
    business_date, notes, client_request_id)
  values (
    p_amount_cents, p_method, p_student_id, v_payer, v_me.user_id, v_me.full_name,
    coalesce(p_business_date, app.la_today()), btrim(coalesce(p_notes, '')), p_client_request_id)
  on conflict (client_request_id) do nothing
  returning * into v;

  if v.id is null then  -- the same request won a race a moment ago
    select * into v from public.payment_transactions where client_request_id = p_client_request_id;
  end if;
  return v;
end;
$$;

-- Fixes the amount, method or note of a payment (see app.editable_payment).
create function public.correct_payment(
  p_id uuid, p_amount_cents bigint, p_method text, p_notes text default '', p_reason text default ''
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v public.payment_transactions := app.editable_payment(p_id);
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
     set amount_cents = p_amount_cents, method = p_method, notes = btrim(coalesce(p_notes, ''))
   where id = v.id
  returning * into v;
  return v;
end;
$$;

-- Marks a mistaken payment void. It stays in the history, out of every total.
create function public.void_payment(p_id uuid, p_reason text) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v public.payment_transactions := app.editable_payment(p_id);
begin
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Give a reason.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_transactions
              where related_transaction_id = p_id and status = 'VALID') then
    raise exception 'Void its refunds first.' using errcode = '22023';
  end if;
  perform set_config('app.reason', btrim(p_reason), true);
  update public.payment_transactions
     set status = 'VOID', voided_at = now(), voided_by = auth.uid(), reason = btrim(p_reason)
   where id = v.id
  returning * into v;
  return v;
end;
$$;

-- Owner: money given back. Linked to the payment, dated today, and all
-- refunds of one payment together never exceed it.
create function public.record_refund(
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
    recorded_by, recorded_by_name, business_date, reason, client_request_id)
  values (
    'REFUND', p_amount_cents, p_method, v_orig.student_id, v_orig.payer_name, v_orig.id,
    v_me.user_id, v_me.full_name, app.la_today(), btrim(p_reason), p_client_request_id)
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function
  app.enforce_open_period(), app.la_today(), app.me(), app.require_method(text),
  app.editable_payment(uuid),
  public.search_students(text), public.add_student(text, text),
  public.record_payment(uuid, bigint, text, uuid, text, text, boolean, date),
  public.correct_payment(uuid, bigint, text, text, text),
  public.void_payment(uuid, text),
  public.record_refund(uuid, uuid, bigint, text, text)
from public, anon, authenticated;

grant execute on function
  public.search_students(text), public.add_student(text, text),
  public.record_payment(uuid, bigint, text, uuid, text, text, boolean, date),
  public.correct_payment(uuid, bigint, text, text, text),
  public.void_payment(uuid, text),
  public.record_refund(uuid, uuid, bigint, text, text)
to authenticated;

select app.check_api_exposure();
