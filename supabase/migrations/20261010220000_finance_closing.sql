-- ============================================================================
-- Let's Pilates Admin Portal · Financial reports and monthly closing (Phase 7)
--
-- finance_report() is the one place money is added up (master plan J.1/J.2):
-- the dashboard, reports, closing snapshot and CSV all use its numbers.
-- close_period() locks a finished month; reopen_period() unlocks it with a
-- reason. Owner only. Existing tables only gain columns.
-- Plan: docs/admin/PHASE-7-PLAN.md. Applied by the GitHub integration on push
-- to the Staging branch.
-- ============================================================================

alter table public.accounting_periods
  add column version        int not null default 0,                   -- +1 at every closing
  add column reopened_by    uuid references public.staff_profiles (user_id) on delete restrict,
  add column reopened_at    timestamptz,
  add column reopen_reason  text not null default '' check (length(reopen_reason) <= 500),
  add column snapshot       jsonb;                                    -- finance_report() at the last closing

-- Closed months stay locked, except marking an expense paid (status, paid date,
-- method): amounts and dates do not change, so the month's numbers do not either.
-- (period_month is generated, so a BEFORE trigger sees it as null in NEW.)
create or replace function app.enforce_open_expense_month() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - '{payment_status,paid_on,payment_method,period_month}'::text[]
       = to_jsonb(old) - '{payment_status,paid_on,payment_method,period_month}'::text[] then
    return new;
  end if;
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

-- ---------------------------------------------------------------------------
-- Owner: every number for p_from..p_to (Los Angeles dates, both included).
--   Revenue  = valid payments on the day they were received, minus valid
--              refunds on the day they were given back. Voids count nowhere.
--   Expenses = active expenses dated in the period, paid or not.
--   Profit   = net revenue − expenses (a management estimate).
-- ---------------------------------------------------------------------------

create function public.finance_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  perform app.require_owner();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3700 then
    raise exception 'Choose a date range.' using errcode = '22023';
  end if;

  with pay as (
    select * from public.payment_transactions
     where status = 'VALID' and business_date between p_from and p_to
  ), exp as (
    select * from public.expenses
     where status = 'ACTIVE' and expense_date between p_from and p_to
  ), months as (
    select m::date as month
      from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') m
  ), month_rows as (
    select mo.month,
           coalesce((select sum(case kind when 'PAYMENT' then amount_cents else -amount_cents end)
                       from pay where date_trunc('month', business_date::timestamp)::date = mo.month), 0) as net,
           coalesce((select sum(amount_cents) from exp where period_month = mo.month), 0) as expenses,
           (select count(*) from pay where kind = 'PAYMENT' and date_trunc('month', business_date::timestamp)::date = mo.month) as payment_count,
           coalesce(p.status, 'OPEN') as status, p.closed_at, p.version
      from months mo
      left join public.accounting_periods p on p.month = mo.month
  ), totals as (
    select coalesce(sum(amount_cents) filter (where kind = 'PAYMENT'), 0) as gross,
           coalesce(sum(amount_cents) filter (where kind = 'REFUND'), 0) as refunds,
           count(*) filter (where kind = 'PAYMENT') as payment_count,
           count(*) filter (where kind = 'REFUND') as refund_count
      from pay
  ), spend as (
    select coalesce(sum(amount_cents), 0) as total,
           coalesce(sum(amount_cents) filter (where payment_status = 'PAID'), 0) as paid,
           count(*) as expense_count,
           count(*) filter (where payment_status = 'UNPAID') as unpaid_count,
           count(*) filter (where is_estimate) as estimate_count
      from exp
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'gross', t.gross,
    'refunds', t.refunds,
    'net', t.gross - t.refunds,
    'payment_count', t.payment_count,
    'refund_count', t.refund_count,
    'void_count', (select count(*) from public.payment_transactions
                    where status = 'VOID' and business_date between p_from and p_to),
    'expenses', s.total,
    'expenses_paid', s.paid,
    'expenses_outstanding', s.total - s.paid,
    'expense_count', s.expense_count,
    'unpaid_count', s.unpaid_count,
    'estimate_count', s.estimate_count,
    'expense_void_count', (select count(*) from public.expenses
                            where status = 'VOID' and expense_date between p_from and p_to),
    'profit', t.gross - t.refunds - s.total,
    'by_method', coalesce((
      select jsonb_agg(jsonb_build_object('method', method, 'gross', gross, 'refunds', refunds,
                                          'net', gross - refunds, 'count', n) order by gross - refunds desc)
        from (select method,
                     coalesce(sum(amount_cents) filter (where kind = 'PAYMENT'), 0) as gross,
                     coalesce(sum(amount_cents) filter (where kind = 'REFUND'), 0) as refunds,
                     count(*) filter (where kind = 'PAYMENT') as n
                from pay group by method) x), '[]'),
    'by_collector', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'gross', gross, 'count', n) order by gross desc)
        from (select collected_by_name as name, sum(amount_cents) as gross, count(*) as n
                from pay where kind = 'PAYMENT' group by collected_by, collected_by_name) x), '[]'),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'amount', amount, 'count', n) order by amount desc)
        from (select category, sum(amount_cents) as amount, count(*) as n from exp group by category) x), '[]'),
    'months', (
      select jsonb_agg(jsonb_build_object('month', month, 'net', net, 'expenses', expenses, 'profit', net - expenses,
                                          'payment_count', payment_count, 'status', status,
                                          'closed_at', closed_at, 'version', version) order by month)
        from month_rows)
  ) into v
  from totals t, spend s;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner: close a month that has ended. One transaction: wait for payments and
-- expenses being saved right now, hold new ones until the closing commits
-- (they then see CLOSED and are refused), save the month's report as the
-- snapshot, bump the version. The audit trigger records the change.
-- ---------------------------------------------------------------------------

create function public.close_period(p_month date) returns public.accounting_periods
language plpgsql security definer set search_path = ''
as $$
declare
  v public.accounting_periods;
begin
  perform app.require_owner();
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Choose a month.' using errcode = '22023';
  end if;
  if p_month >= date_trunc('month', app.la_today()::timestamp)::date then
    raise exception 'Only a month that has ended can be closed.' using errcode = 'LPOPN';
  end if;

  lock table public.payment_transactions, public.expenses in share mode;
  insert into public.accounting_periods (month) values (p_month) on conflict (month) do nothing;
  select * into v from public.accounting_periods where month = p_month for update;
  if v.status = 'CLOSED' then
    raise exception 'That month is already closed.' using errcode = 'LPCLS';
  end if;

  update public.accounting_periods
     set status = 'CLOSED', version = version + 1, closed_by = auth.uid(), closed_at = now(),
         snapshot = public.finance_report(p_month, (p_month + interval '1 month - 1 day')::date)
   where month = p_month
  returning * into v;
  return v;
end;
$$;

-- Owner: unlock a closed month to fix it. The reason and the previous
-- snapshot stay in the audit log; closing again makes the next version.
create function public.reopen_period(p_month date, p_reason text) returns public.accounting_periods
language plpgsql security definer set search_path = ''
as $$
declare
  v public.accounting_periods;
begin
  perform app.require_owner();
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Give a reason.' using errcode = '22023';
  end if;
  select * into v from public.accounting_periods where month = p_month for update;
  if v.status is distinct from 'CLOSED' then
    raise exception 'That month is not closed.' using errcode = '22023';
  end if;
  perform set_config('app.reason', btrim(p_reason), true);
  update public.accounting_periods
     set status = 'OPEN', reopened_by = auth.uid(), reopened_at = now(), reopen_reason = btrim(p_reason)
   where month = p_month
  returning * into v;
  return v;
end;
$$;

revoke all on function
  public.finance_report(date, date), public.close_period(date), public.reopen_period(date, text)
from public, anon, authenticated;
grant execute on function
  public.finance_report(date, date), public.close_period(date), public.reopen_period(date, text)
to authenticated;

select app.check_api_exposure();
