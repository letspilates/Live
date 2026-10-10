-- Tests for Expenses and recurring expenses (spec 24.3, S4) (run with supabase/tests/run-local.sh).
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

-- Months relative to today at the studio: m0 = this month, m1 = last month, m2 = two months ago.
select set_config('t.today', app.la_today()::text, true),
       set_config('t.m0', date_trunc('month', app.la_today())::date::text, true),
       set_config('t.m1', (date_trunc('month', app.la_today()) - interval '1 month')::date::text, true),
       set_config('t.m2', (date_trunc('month', app.la_today()) - interval '2 months')::date::text, true);

-- 24.3: $3,000 rent rule from two months ago → 3 unpaid expenses, regenerate adds nothing ------------
select t.login('00000000-0000-0000-0000-0000000000a1');
insert into public.recurring_expense_rules (category, description, amount_cents, due_day, start_month)
values ('RENT', 'Monthly studio rent', 300000, 1, current_setting('t.m2')::date);
select t.check('generate: 3 months created', public.generate_recurring_expenses() = 3);
select t.check('generate: again creates none', public.generate_recurring_expenses() = 0);
select t.check('generate: unpaid $3,000 on the 1st', (select count(*) = 3 and bool_and(payment_status = 'UNPAID')
  and bool_and(amount_cents = 300000) and bool_and(extract(day from expense_date) = 1) and min(created_by::text) is not null
  from public.expenses where description = 'Monthly studio rent'));
select t.check('generate: never a future month', (select max(period_month) = current_setting('t.m0')::date from public.expenses));

-- Mark paid
update public.expenses set payment_status = 'PAID', paid_on = current_setting('t.today')::date, payment_method = 'BANK'
 where description = 'Monthly studio rent' and period_month = current_setting('t.m2')::date;
select t.expect_error('paid needs a date', '23514',
  $$update public.expenses set payment_status = 'PAID' where period_month = current_setting('t.m1')::date$$);

-- Amount change applies to new months; months already created keep $3,000
update public.recurring_expense_rules set amount_cents = 320000 where description = 'Monthly studio rent';
select t.check('rule change: past months keep $3,000', (select bool_and(amount_cents = 300000)
  from public.expenses where description = 'Monthly studio rent'));
select t.check('rule change: nothing new to create', public.generate_recurring_expenses() = 0);

-- Due day 31 → last day of a shorter month; end month and inactive rules stop generation
insert into public.recurring_expense_rules (category, description, amount_cents, due_day, start_month, end_month, is_estimate)
values ('UTILITIES', 'Electricity', 18000, 31, '2026-02-01', '2026-03-01', true),
       ('SOFTWARE', 'Old app', 2900, 5, current_setting('t.m1')::date, null, false);
update public.recurring_expense_rules set active = false where description = 'Old app';
select t.check('generate: 2 months of electricity only', public.generate_recurring_expenses() = 2);
select t.check('due day 31 in February = Feb 28', exists (select 1 from public.expenses
  where description = 'Electricity' and expense_date = '2026-02-28' and is_estimate));
select t.check('due day 31 in March = Mar 31', exists (select 1 from public.expenses
  where description = 'Electricity' and expense_date = '2026-03-31'));
select t.check('inactive rule creates nothing', not exists (select 1 from public.expenses where description = 'Old app'));

-- A voided generated expense is not created again
update public.expenses set status = 'VOID', void_reason = 'Paid by card, entered twice'
 where description = 'Electricity' and expense_date = '2026-03-31';
select t.check('voided month stays voided', public.generate_recurring_expenses() = 0);

-- Manual expenses: credit needs a note, void needs a reason, no deletes, cap
insert into public.expenses (category, description, amount_cents, expense_date, payee_staff_id)
values ('INSTRUCTOR_PAY', 'Ana, September', 130000, current_setting('t.today')::date, '00000000-0000-0000-0000-0000000000b1');
select t.expect_error('credit without a note', '23514',
  $$insert into public.expenses (category, description, amount_cents, expense_date) values ('OTHER', 'Credit', -5000, current_setting('t.today')::date)$$);
insert into public.expenses (category, description, amount_cents, expense_date, notes)
values ('OTHER', 'Credit', -5000, current_setting('t.today')::date, 'Vendor refund for broken spring');
select t.expect_error('void without a reason', '23514',
  $$update public.expenses set status = 'VOID' where description = 'Credit'$$);
select t.expect_error('over $100,000', '23514',
  $$insert into public.expenses (category, description, amount_cents, expense_date) values ('OTHER', 'Typo', 10000001, current_setting('t.today')::date)$$);
select t.expect_error('zero amount', '23514',
  $$insert into public.expenses (category, description, amount_cents, expense_date) values ('OTHER', 'Zero', 0, current_setting('t.today')::date)$$);
select t.expect_error('owner cannot delete', '42501', $$delete from public.expenses$$);
select t.expect_error('owner cannot delete a rule', '42501', $$delete from public.recurring_expense_rules$$);
select t.expect_error('unknown payment method', '23514',
  $$update public.expenses set payment_status = 'PAID', paid_on = current_setting('t.today')::date, payment_method = 'BITCOIN' where description = 'Credit'$$);
reset role;
select t.check('audit: changes are logged', (select count(*) >= 10 from public.audit_logs
  where entity_type in ('expenses', 'recurring_expense_rules')));

-- Closed month: no new or changed expenses, generation skips it ---------------------------------------
insert into public.accounting_periods (month, status, closed_at) values (current_setting('t.m1')::date, 'CLOSED', now());
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.expect_error('closed: no change', 'LPCLS',
  $$update public.expenses set amount_cents = 1 where period_month = current_setting('t.m1')::date$$);
select t.expect_error('closed: no new expense', 'LPCLS',
  $$insert into public.expenses (category, description, amount_cents, expense_date) values ('OTHER', 'Late', 100, current_setting('t.m1')::date + 3)$$);
select t.expect_error('closed: cannot move an expense out', 'LPCLS',
  $$update public.expenses set expense_date = current_setting('t.today')::date where period_month = current_setting('t.m1')::date$$);
insert into public.recurring_expense_rules (category, description, amount_cents, due_day, start_month)
values ('INSURANCE', 'Liability insurance', 9000, 10, current_setting('t.m1')::date);
select t.check('closed: generation skips the closed month', public.generate_recurring_expenses() = 1);
select t.check('closed: only this month created', (select count(*) = 1 and min(period_month) = current_setting('t.m0')::date
  from public.expenses where description = 'Liability insurance'));
reset role;

-- S4: instructors and staff read nothing and write nothing; anon gets nothing ---------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('instructor: expenses 0 rows', (select count(*) = 0 from public.expenses));
select t.check('instructor: rules 0 rows', (select count(*) = 0 from public.recurring_expense_rules));
select t.check('instructor: categories 0 rows', (select count(*) = 0 from public.expense_categories));
select t.expect_error('instructor: no insert', '42501',
  $$insert into public.expenses (category, description, amount_cents, expense_date) values ('OTHER', 'X', 100, current_setting('t.today')::date)$$);
update public.expenses set amount_cents = 1;
reset role;
select t.check('instructor: update changed nothing', not exists (select 1 from public.expenses where amount_cents = 1));
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('instructor: no generate', '42501', $$select public.generate_recurring_expenses()$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000c1');
select t.check('staff: expenses 0 rows', (select count(*) = 0 from public.expenses));
select t.expect_error('staff: no rule insert', '42501',
  $$insert into public.recurring_expense_rules (category, description, amount_cents, due_day, start_month) values ('OTHER', 'X', 100, 1, current_setting('t.m0')::date)$$);
reset role;
select t.as_anon();
select t.expect_error('anon: expenses', '42501', $$select count(*) from public.expenses$$);
select t.expect_error('anon: rules', '42501', $$select count(*) from public.recurring_expense_rules$$);
select t.expect_error('anon: generate', '42501', $$select public.generate_recurring_expenses()$$);
reset role;

select app.check_api_exposure();

rollback;
\echo expenses: all checks passed
