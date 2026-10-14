-- ============================================================================
-- Let's Pilates Admin Portal · Expenses (Phase 6)
--
-- Owners record what the studio spends, and set up recurring expenses (rent,
-- subscriptions) that create one unpaid expense per month. Money is integer
-- cents, an expense belongs to the month of its expense date, nothing is
-- deleted (a mistake is voided, with a reason), closed months are locked.
-- Owner only: staff cannot read any of it. Plan: docs/admin/PHASE-6-PLAN.md.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

create table public.expense_categories (
  code        text primary key,
  name_en     text not null,
  name_ko     text not null,
  active      boolean not null default true,
  sort_order  int not null default 0
);

insert into public.expense_categories (code, name_en, name_ko, sort_order) values
  ('RENT', 'Studio Rent', '스튜디오 임대료', 1),
  ('INSTRUCTOR_PAY', 'Instructor Compensation', '강사 보수', 2),
  ('UTILITIES', 'Utilities', '공과금', 3),
  ('INTERNET_PHONE', 'Internet / Phone', '인터넷 / 전화', 4),
  ('INSURANCE', 'Insurance', '보험', 5),
  ('SOFTWARE', 'Software Subscriptions', '소프트웨어 구독', 6),
  ('EQUIPMENT', 'Equipment', '장비', 7),
  ('SUPPLIES', 'Studio Supplies', '스튜디오 용품', 8),
  ('CLEANING', 'Cleaning / Maintenance', '청소 / 유지보수', 9),
  ('MARKETING', 'Marketing', '마케팅', 10),
  ('PROCESSING_FEES', 'Payment Processing Fees', '결제 수수료', 11),
  ('OTHER', 'Other Expenses', '기타 지출', 12);

create table public.recurring_expense_rules (
  id              uuid primary key default gen_random_uuid(),
  category        text not null references public.expense_categories (code) on delete restrict,
  description     text not null check (char_length(btrim(description)) between 1 and 200),
  vendor          text not null default '' check (length(vendor) <= 120),
  amount_cents    bigint not null check (amount_cents > 0 and amount_cents <= 10000000),
  due_day         int not null check (due_day between 1 and 31),     -- 31 in a shorter month = its last day
  start_month     date not null check (extract(day from start_month) = 1),
  end_month       date check (extract(day from end_month) = 1 and end_month >= start_month),
  is_estimate     boolean not null default false,
  payee_staff_id  uuid references public.staff_profiles (user_id) on delete restrict,
  active          boolean not null default true,
  created_by      uuid default auth.uid() references public.staff_profiles (user_id) on delete restrict,
  created_at      timestamptz not null default now()
);

create table public.expenses (
  id                 uuid primary key default gen_random_uuid(),
  category           text not null references public.expense_categories (code) on delete restrict,
  description        text not null check (char_length(btrim(description)) between 1 and 200),
  vendor             text not null default '' check (length(vendor) <= 120),
  amount_cents       bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 10000000),  -- negative = vendor refund / credit
  expense_date       date not null,
  period_month       date generated always as (date_trunc('month', expense_date::timestamp)::date) stored,
  due_date           date,
  payment_status     text not null default 'UNPAID' check (payment_status in ('UNPAID', 'PAID')),
  paid_on            date,
  payment_method     text check (payment_method in ('CASH', 'ZELLE', 'CHECK', 'CARD', 'BANK', 'AUTOPAY', 'OTHER')),
  status             text not null default 'ACTIVE' check (status in ('ACTIVE', 'VOID')),
  void_reason        text not null default '' check (length(void_reason) <= 500),
  recurring_rule_id  uuid references public.recurring_expense_rules (id) on delete restrict,
  is_estimate        boolean not null default false,
  payee_staff_id     uuid references public.staff_profiles (user_id) on delete restrict,
  notes              text not null default '' check (length(notes) <= 1000),
  created_by         uuid default auth.uid() references public.staff_profiles (user_id) on delete restrict,
  created_at         timestamptz not null default now(),
  check ((payment_status = 'PAID') = (paid_on is not null)),
  check (status = 'ACTIVE' or btrim(void_reason) <> ''),
  check (amount_cents > 0 or btrim(notes) <> '')              -- a credit says what it is for
);

create index expenses_month_idx on public.expenses (period_month, expense_date);
-- One expense per rule per month, however often generation runs.
create unique index expenses_rule_month_key on public.expenses (recurring_rule_id, period_month)
  where recurring_rule_id is not null;

create trigger expenses_audit
  after insert or update or delete on public.expenses
  for each row execute function app.audit_row_change('id');
create trigger recurring_expense_rules_audit
  after insert or update or delete on public.recurring_expense_rules
  for each row execute function app.audit_row_change('id');

-- Closed-month lock, as for payments: checks the month before and after the change.
create function app.enforce_open_expense_month() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.accounting_periods p
     where p.month in (date_trunc('month', new.expense_date)::date,
                       date_trunc('month', case when tg_op = 'UPDATE' then old.expense_date
                                                else new.expense_date end)::date)
       and p.status = 'CLOSED'
       for share
  ) then
    raise exception 'That month is closed.' using errcode = 'LPCLS';
  end if;
  return new;
end;
$$;

create trigger expenses_open_period
  before insert or update on public.expenses
  for each row execute function app.enforce_open_expense_month();

-- ---------------------------------------------------------------------------
-- Row Level Security: owners read and write directly (no deletes); staff and
-- anon get nothing. Every change lands in audit_logs.
-- ---------------------------------------------------------------------------

alter table public.expense_categories enable row level security;
alter table public.recurring_expense_rules enable row level security;
alter table public.expenses enable row level security;

revoke all on public.expense_categories, public.recurring_expense_rules, public.expenses
  from public, anon, authenticated;
grant select on public.expense_categories to authenticated;
grant select, insert, update on public.recurring_expense_rules, public.expenses to authenticated;

create policy expense_categories_select on public.expense_categories
  for select to authenticated using ((select app.is_owner()));
create policy recurring_expense_rules_owner on public.recurring_expense_rules
  for all to authenticated using ((select app.is_owner())) with check ((select app.is_owner()));
create policy expenses_owner on public.expenses
  for all to authenticated using ((select app.is_owner())) with check ((select app.is_owner()));

-- ---------------------------------------------------------------------------
-- Owner: create this month's (and any missed month's) recurring expenses.
-- Called when the Expenses screen opens. Months already closed are skipped,
-- future months are never created. Returns how many expenses were created.
-- ---------------------------------------------------------------------------

create function public.generate_recurring_expenses() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', app.la_today())::date;
  v_count int;
begin
  perform app.require_owner();
  insert into public.expenses (category, description, vendor, amount_cents, expense_date, recurring_rule_id,
                               is_estimate, payee_staff_id, created_by)
  select r.category, r.description, r.vendor, r.amount_cents,
         least(m::date + (r.due_day - 1), (m + interval '1 month - 1 day')::date),
         r.id, r.is_estimate, r.payee_staff_id, auth.uid()
    from public.recurring_expense_rules r
   cross join lateral generate_series(r.start_month, least(coalesce(r.end_month, v_month), v_month), interval '1 month') m
   where r.active
     and not exists (select 1 from public.accounting_periods p where p.month = m::date and p.status = 'CLOSED')
  on conflict (recurring_rule_id, period_month) where recurring_rule_id is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function app.enforce_open_expense_month(), public.generate_recurring_expenses()
  from public, anon, authenticated;
grant execute on function public.generate_recurring_expenses() to authenticated;

select app.check_api_exposure();
