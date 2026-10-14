-- Tests for financial reports and monthly closing (spec 24.4, 24.5, S3, S5, S8) (run with supabase/tests/run-local.sh).
-- Everything happens inside one transaction that is rolled back at the end.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated;

-- Act as a signed-in user (Supabase puts the JWT claims in request.jwt.claims).
create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

-- Runs p_sql and fails unless it raises SQLSTATE p_code.
create function t.expect_error(p_label text, p_code text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_code then return; end if;
    raise exception '[%] expected SQLSTATE %, got %: %', p_label, p_code, sqlstate, sqlerrm;
  end;
  raise exception '[%] expected SQLSTATE %, but it succeeded', p_label, p_code;
end $$;

create function t.check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception '[%] failed', p_label; end if;
end $$;

grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'ana@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'sam@test.local');
select app.grant_owner('owner@test.local', 'Owner');
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.add_staff_account('ana@test.local', 'Ana', 'INSTRUCTOR', null);
select public.add_staff_account('sam@test.local', 'Sam', 'STAFF', null);
reset role;

-- m0 = this month, m1 = last month (the one we close), d1 = the 5th of last month.
select set_config('t.today', app.la_today()::text, true),
       set_config('t.m0', date_trunc('month', app.la_today())::date::text, true),
       set_config('t.m1', (date_trunc('month', app.la_today()) - interval '1 month')::date::text, true),
       set_config('t.d1', (date_trunc('month', app.la_today()) - interval '1 month' + interval '4 days')::date::text, true),
       set_config('t.m1end', (date_trunc('month', app.la_today()) - interval '1 day')::date::text, true);

-- 24.4: gross $20,000, no refunds, expenses $8,000 (rent 3,000 / pay 3,500 / utilities 500 / other 1,000) → $12,000
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.record_payment('22222222-0000-0000-0000-000000000001', 1000000, 'ZELLE', p_payer_name => 'Client A',
  p_business_date => current_setting('t.d1')::date);
select public.record_payment('22222222-0000-0000-0000-000000000002', 1000000, 'CASH', p_payer_name => 'Client B',
  p_business_date => current_setting('t.d1')::date, p_collected_by => '00000000-0000-0000-0000-0000000000b1');
-- A mistaken payment, voided: counts nowhere.
select public.record_payment('22222222-0000-0000-0000-000000000003', 5000, 'CASH', p_payer_name => 'Typo',
  p_business_date => current_setting('t.d1')::date);
select public.void_payment((select id from public.payment_transactions where payer_name = 'Typo'), 'entered twice');
insert into public.expenses (category, description, amount_cents, expense_date) values
  ('RENT', 'Rent', 300000, current_setting('t.d1')::date),
  ('INSTRUCTOR_PAY', 'Instructor pay', 350000, current_setting('t.d1')::date),
  ('UTILITIES', 'Electricity', 50000, current_setting('t.d1')::date),
  ('OTHER', 'Misc', 100000, current_setting('t.d1')::date);
update public.expenses set payment_status = 'PAID', paid_on = current_setting('t.d1')::date, payment_method = 'BANK'
 where description in ('Rent', 'Instructor pay');
insert into public.expenses (category, description, amount_cents, expense_date, status, void_reason)
values ('OTHER', 'Voided expense', 99900, current_setting('t.d1')::date, 'VOID', 'mistake');

select set_config('t.r', public.finance_report(current_setting('t.m1')::date, current_setting('t.m1end')::date)::text, true);
select t.check('24.4: gross $20,000', (current_setting('t.r')::jsonb ->> 'gross')::bigint = 2000000);
select t.check('24.4: net $20,000', (current_setting('t.r')::jsonb ->> 'net')::bigint = 2000000);
select t.check('24.4: expenses $8,000', (current_setting('t.r')::jsonb ->> 'expenses')::bigint = 800000);
select t.check('24.4: profit $12,000', (current_setting('t.r')::jsonb ->> 'profit')::bigint = 1200000);
select t.check('report: paid $6,500 / outstanding $1,500', (current_setting('t.r')::jsonb ->> 'expenses_paid')::bigint = 650000
  and (current_setting('t.r')::jsonb ->> 'expenses_outstanding')::bigint = 150000
  and (current_setting('t.r')::jsonb ->> 'unpaid_count')::int = 2);
select t.check('report: 2 payments, 1 void', (current_setting('t.r')::jsonb ->> 'payment_count')::int = 2
  and (current_setting('t.r')::jsonb ->> 'void_count')::int = 1
  and (current_setting('t.r')::jsonb ->> 'expense_void_count')::int = 1);
select t.check('report: by method', current_setting('t.r')::jsonb -> 'by_method' @> '[{"method":"ZELLE","net":1000000},{"method":"CASH","net":1000000,"count":1}]');
select t.check('report: by who received it', current_setting('t.r')::jsonb -> 'by_collector' @> '[{"name":"Ana","gross":1000000},{"name":"Owner","gross":1000000}]');
select t.check('report: by category', jsonb_array_length(current_setting('t.r')::jsonb -> 'by_category') = 4
  and current_setting('t.r')::jsonb -> 'by_category' -> 0 ->> 'category' = 'INSTRUCTOR_PAY');
select t.check('report: one open month', current_setting('t.r')::jsonb -> 'months' @> '[{"net":2000000,"expenses":800000,"profit":1200000,"status":"OPEN"}]'
  and jsonb_array_length(current_setting('t.r')::jsonb -> 'months') = 1);

-- A refund today belongs to this month; last month does not change (J.2-3).
select public.record_refund('22222222-0000-0000-0000-000000000004',
  (select id from public.payment_transactions where payer_name = 'Client A'), 20000, 'ZELLE', 'class cancelled');
select t.check('refund: this month −$200', (public.finance_report(current_setting('t.m0')::date, current_setting('t.today')::date) ->> 'net')::bigint = -20000);
select t.check('refund: last month unchanged', (public.finance_report(current_setting('t.m1')::date, current_setting('t.m1end')::date) ->> 'net')::bigint = 2000000);
select t.check('report: two months', jsonb_array_length(public.finance_report(current_setting('t.m1')::date, current_setting('t.today')::date) -> 'months') = 2);
select t.expect_error('report: bad range', '22023', $$select public.finance_report(current_setting('t.today')::date, current_setting('t.today')::date - 1)$$);

-- Closing: this month cannot be closed; last month can, once.
select t.expect_error('close: month not over', 'LPOPN', $$select public.close_period(current_setting('t.m0')::date)$$);
select t.expect_error('close: not a month', '22023', $$select public.close_period(current_setting('t.d1')::date)$$);
select t.check('close: closed, version 1, snapshot = report', (
  select status = 'CLOSED' and version = 1 and closed_by = '00000000-0000-0000-0000-0000000000a1' and closed_at is not null
         and (snapshot ->> 'profit')::bigint = 1200000
    from public.close_period(current_setting('t.m1')::date)));
select t.expect_error('close: twice', 'LPCLS', $$select public.close_period(current_setting('t.m1')::date)$$);
select t.check('close: report shows closed', public.finance_report(current_setting('t.m1')::date, current_setting('t.m1end')::date)
  -> 'months' -> 0 ->> 'status' = 'CLOSED');

-- 24.5 / S5: a closed month refuses changes, even from the owner.
select t.expect_error('closed: correct payment', 'LPCLS',
  $$select public.correct_payment((select id from public.payment_transactions where payer_name = 'Client B'), 900000, 'CASH')$$);
select t.expect_error('closed: void payment', 'LPCLS',
  $$select public.void_payment((select id from public.payment_transactions where payer_name = 'Client B'), 'x')$$);
select t.expect_error('closed: back-dated payment', 'LPCLS',
  $$select public.record_payment(gen_random_uuid(), 100, 'CASH', p_payer_name => 'Late', p_business_date => current_setting('t.d1')::date)$$);
select t.expect_error('closed: add expense', 'LPCLS',
  $$insert into public.expenses (category, description, amount_cents, expense_date) values ('OTHER', 'Late', 100, current_setting('t.d1')::date)$$);
select t.expect_error('closed: change expense amount', 'LPCLS',
  $$update public.expenses set amount_cents = 1 where description = 'Misc'$$);
select t.expect_error('closed: move expense out', 'LPCLS',
  $$update public.expenses set expense_date = current_setting('t.today')::date where description = 'Misc'$$);
update public.expenses set payment_status = 'PAID', paid_on = current_setting('t.today')::date, payment_method = 'CHECK' where description = 'Misc';
select t.check('closed: marking an expense paid still works', (select payment_status = 'PAID' from public.expenses where description = 'Misc'));
select t.expect_error('closed: paid plus amount change', 'LPCLS',
  $$update public.expenses set payment_status = 'PAID', paid_on = current_setting('t.today')::date, payment_method = 'CHECK', amount_cents = 1 where description = 'Electricity'$$);

-- S3 / S8 / S4: staff cannot read or run any of it; anon neither.
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('S3: instructor report', '42501', $$select public.finance_report(current_setting('t.today')::date, current_setting('t.today')::date)$$);
select t.expect_error('S8: instructor close', '42501', $$select public.close_period(current_setting('t.m1')::date)$$);
select t.expect_error('S8: instructor reopen', '42501', $$select public.reopen_period(current_setting('t.m1')::date, 'x')$$);
select t.check('S4: instructor sees no periods', (select count(*) = 0 from public.accounting_periods));
select t.login('00000000-0000-0000-0000-0000000000c1');
select t.expect_error('S3: staff report', '42501', $$select public.finance_report(current_setting('t.today')::date, current_setting('t.today')::date)$$);
select t.as_anon();
select t.expect_error('S10: anon report', '42501', $$select public.finance_report(current_setting('t.today')::date, current_setting('t.today')::date)$$);
select t.expect_error('S10: anon close', '42501', $$select public.close_period(current_setting('t.m1')::date)$$);

-- Reopen: reason required, audited with the old snapshot; fix; close again → version 2.
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.expect_error('reopen: reason required', '22023', $$select public.reopen_period(current_setting('t.m1')::date, '  ')$$);
select t.expect_error('reopen: open month', '22023', $$select public.reopen_period(current_setting('t.m0')::date, 'x')$$);
select t.check('reopen: open again', (select status = 'OPEN' and reopen_reason = 'Client B paid $9,000'
  from public.reopen_period(current_setting('t.m1')::date, 'Client B paid $9,000')));
reset role;
select t.check('reopen: audit keeps reason and old snapshot', exists (
  select 1 from public.audit_logs where entity_type = 'accounting_periods' and reason = 'Client B paid $9,000'
     and (before -> 'snapshot' ->> 'profit')::bigint = 1200000 and after ->> 'status' = 'OPEN'));
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.correct_payment((select id from public.payment_transactions where payer_name = 'Client B'), 900000, 'CASH', '', 'typo');
select t.check('re-close: version 2 with the fix', (select version = 2 and (snapshot ->> 'net')::bigint = 1900000
  from public.close_period(current_setting('t.m1')::date)));
reset role;
select t.check('closings audited', (select count(*) >= 3 from public.audit_logs where entity_type = 'accounting_periods'));

select app.check_api_exposure();

rollback;
\echo finance: all checks passed
