-- Phase 8 final verification (run with supabase/tests/run-local.sh). Rolled back at the end.
-- 1. Every privileged database function checks who is calling.
-- 2. Role matrix: what Owner, Admin, Staff, Instructor, a deactivated user, a signed-in
--    stranger and anon can read and change, including the Settings › Admin menu switches.
-- 3. Money: the Payments screen, Expenses screen, Reports, dashboard and closing snapshot
--    all add up to the same numbers.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated;

create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

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

create function t.rows(p_table text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', p_table) into n;
  return n;
end $$;

grant execute on all functions in schema t to anon, authenticated;

-- 1. Privileged functions check the caller ----------------------------------------------
-- Every SECURITY DEFINER function in public must run a caller check, except the public
-- training form pair and the caller's own profile functions (they only touch auth.uid()'s row).
select t.check('every privileged function checks the caller', not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.proname not in ('public_training_courses', 'submit_training_registration',
                           'current_staff', 'update_my_name', 'update_my_profile')
     and p.prosrc !~ 'app\.(me|require_owner|editable_payment)\(|public\.add_staff_user\('));
select app.check_api_exposure();
select t.check('no table grants DELETE to the API', not exists (
  select 1 from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('DELETE', 'TRUNCATE')));
select t.check('only expenses and recurring rules are writable directly', (
  select array_agg(distinct table_name::text order by table_name::text) = '{expenses,recurring_expense_rules}'
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE')));

-- People -------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'staff@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'inst@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'gone@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'stranger@test.local');
select app.grant_owner('owner@test.local', 'Owner');
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.add_staff_user('00000000-0000-0000-0000-0000000000a2', 'admin@test.local', false, '{"full_name":"Ada","roles":["ADMIN"]}');
select public.add_staff_user('00000000-0000-0000-0000-0000000000b1', 'staff@test.local', false, '{"full_name":"Sam","roles":["STAFF"]}');
select public.add_staff_user('00000000-0000-0000-0000-0000000000b2', 'inst@test.local', false, '{"full_name":"Ian","roles":["INSTRUCTOR"]}');
select public.add_staff_user('00000000-0000-0000-0000-0000000000b3', 'gone@test.local', false, '{"full_name":"Gil","roles":["INSTRUCTOR"]}');
select set_config('t.client', public.add_student('Mina Cho', '213-555-0142')::text, true);
select public.save_training_courses('[{"code":"T1","name_en":"Mat 1","active":true}]');
reset role;

-- Payments and expenses this month and last month (owner back-dates last month's).
select set_config('t.today', app.la_today()::text, true);
select set_config('t.m0', date_trunc('month', app.la_today())::date::text, true);
select set_config('t.m1', (date_trunc('month', app.la_today()) - interval '1 month')::date::text, true);
select set_config('t.m1end', (date_trunc('month', app.la_today()) - interval '1 day')::date::text, true);

select t.login('00000000-0000-0000-0000-0000000000b1');
select set_config('t.p_staff', (select id from public.record_payment(gen_random_uuid(), 12000, 'CASH', current_setting('t.client')::uuid))::text, true);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select set_config('t.p_inst', (select id from public.record_payment(gen_random_uuid(), 8000, 'ZELLE', current_setting('t.client')::uuid,
  p_confirm_duplicate => true))::text, true);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b3');
select public.record_payment(gen_random_uuid(), 5000, 'CASH', current_setting('t.client')::uuid, p_confirm_duplicate => true);
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.set_staff_status('00000000-0000-0000-0000-0000000000b3', 'INACTIVE');
select public.record_payment(gen_random_uuid(), 30000, 'CASH', current_setting('t.client')::uuid,
  p_business_date => current_setting('t.m1')::date, p_confirm_duplicate => true);
select public.record_refund(gen_random_uuid(), current_setting('t.p_staff')::uuid, 2000, 'CASH', 'Class cancelled');
select set_config('t.p_void', (select id from public.record_payment(gen_random_uuid(), 99900, 'CASH', current_setting('t.client')::uuid,
  p_confirm_duplicate => true))::text, true);
select public.void_payment(current_setting('t.p_void')::uuid, 'Typo');
insert into public.expenses (category, description, amount_cents, expense_date)
  select code, 'Rent', 300000, current_setting('t.today')::date from public.expense_categories order by sort_order limit 1;
insert into public.expenses (category, description, amount_cents, expense_date, payment_status, paid_on)
  select code, 'Supplies', 4500, current_setting('t.today')::date, 'PAID', current_setting('t.today')::date
    from public.expense_categories order by sort_order limit 1;
insert into public.expenses (category, description, amount_cents, expense_date, notes)
  select code, 'Vendor credit', -1500, current_setting('t.today')::date, 'returned mats' from public.expense_categories order by sort_order limit 1;
insert into public.expenses (category, description, amount_cents, expense_date, status, void_reason)
  select code, 'Duplicate', 7700, current_setting('t.today')::date, 'VOID', 'entered twice' from public.expense_categories order by sort_order limit 1;
insert into public.expenses (category, description, amount_cents, expense_date)
  select code, 'Last month rent', 300000, current_setting('t.m1')::date from public.expense_categories order by sort_order limit 1;
reset role;

-- 2. Role matrix -----------------------------------------------------------------------
-- Owner and Admin: everything.
select t.login('00000000-0000-0000-0000-0000000000a2');
select t.check('admin: sees all payments', t.rows('payment_transactions') = 6);
select t.check('admin: sees expenses, rules, periods, courses, applicants, audit, users', t.rows('expenses') = 5
  and t.rows('training_courses') = 1 and t.rows('audit_logs') > 0 and t.rows('staff_profiles') = 5);
select t.check('admin: reports', (public.finance_report(current_setting('t.m0')::date, current_setting('t.today')::date) ->> 'gross') is not null);
select t.check('admin: lists users', (select count(*) = 5 from public.list_staff()));
reset role;

-- Staff and Instructor with the default switches (Staff: schedule, clients, payments;
-- Instructor: clients, payments): own payments only, clients read-only, nothing owner-only.
do $$
declare
  u uuid;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2']::uuid[] loop
    perform t.login(u);
    perform t.check(u || ': sees only own payments', (select count(*) = 1 and bool_and(recorded_by = u) from public.payment_transactions));
    perform t.check(u || ': reads clients', t.rows('students') = 1);
    perform t.check(u || ': owner-only tables look empty', t.rows('expenses') + t.rows('recurring_expense_rules')
      + t.rows('accounting_periods') + t.rows('audit_logs') + t.rows('training_courses') + t.rows('training_registrations') = 0);
    perform t.check(u || ': sees only own user row', (select count(*) = 1 and bool_and(user_id = u) from public.staff_profiles));
    perform t.check(u || ': may search clients and name who received it', (select count(*) = 1 from public.search_students('mina'))
      and (select count(*) = 4 from public.list_collectors()));
    perform t.expect_error(u || ': report', '42501', format('select public.finance_report(%L, %L)', current_setting('t.m0'), current_setting('t.today')));
    perform t.expect_error(u || ': close month', '42501', format('select public.close_period(%L)', current_setting('t.m1')));
    perform t.expect_error(u || ': refund', '42501', format('select public.record_refund(gen_random_uuid(), %L, 100, %L, %L)', current_setting('t.p_inst'), 'CASH', 'x'));
    perform t.expect_error(u || ': back-date', '42501', format('select public.record_payment(gen_random_uuid(), 100, %L, %L, p_business_date => %L)',
      'CASH', current_setting('t.client'), current_setting('t.m1')));
    perform t.expect_error(u || ': list users', '42501', 'select public.list_staff()');
    perform t.expect_error(u || ': add user', '42501', $q$select public.add_staff_user(null, 'stranger@test.local', false, '{"full_name":"X","roles":["OWNER"]}')$q$);
    perform t.expect_error(u || ': change own roles', '42501', format($q$select public.update_staff_user(%L, '{"roles":["ADMIN"]}')$q$, u));
    perform t.expect_error(u || ': menu switches', '42501', $q$select public.set_role_menu_access('INSTRUCTOR', 'payments', false)$q$);
    perform t.expect_error(u || ': edit client', '42501', format($q$select public.update_member(%L, 'X', '', '', '', '', 'ACTIVE')$q$, current_setting('t.client')));
    perform t.expect_error(u || ': import clients', '42501', $q$select public.import_members('MINDBODY', '[]')$q$);
    perform t.expect_error(u || ': edit courses', '42501', $q$select public.save_training_courses('[]')$q$);
    perform t.expect_error(u || ': recurring expenses', '42501', 'select public.generate_recurring_expenses()');
    perform t.expect_error(u || ': insert expense', '42501',
      $q$insert into public.expenses (category, description, amount_cents, expense_date) values ('RENT', 'x', 1, current_date)$q$);
    perform t.expect_error(u || ': write payments directly', '42501', 'update public.payment_transactions set amount_cents = 1');
    perform t.expect_error(u || ': delete payments directly', '42501', 'delete from public.payment_transactions');
    perform t.expect_error(u || ': edit someone else''s payment', 'P0002', format('select public.void_payment(%L, %L)',
      case when u = '00000000-0000-0000-0000-0000000000b1' then current_setting('t.p_inst') else current_setting('t.p_staff') end, 'x'));
    perform t.check(u || ': own profile edit cannot change roles', (select roles from public.staff_profiles where user_id = u) =
      (select roles from (select public.update_my_profile('{"roles":["OWNER"],"phone":"1"}')) x, public.staff_profiles where user_id = u));
    reset role;
  end loop;
end $$;

-- Settings › Admin switches are enforced by the database, not only by the menu.
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.set_role_menu_access('INSTRUCTOR', 'payments', false);
select public.set_role_menu_access('STAFF', 'clients', false);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('payments off: instructor sees no payments', t.rows('payment_transactions') = 0);
select t.expect_error('payments off: record', '42501', format('select public.record_payment(gen_random_uuid(), 100, %L, %L)', 'CASH', current_setting('t.client')));
select t.expect_error('payments off: correct own', '42501', format('select public.correct_payment(%L, 9000, %L)', current_setting('t.p_inst'), 'CASH'));
select t.expect_error('payments off: void own', '42501', format('select public.void_payment(%L, %L)', current_setting('t.p_inst'), 'x'));
select t.expect_error('payments off: add client', '42501', $$select public.add_student('New Person', '310-555-0000')$$);
select t.expect_error('payments off: search clients', '42501', $$select public.search_students('mina')$$);
select t.expect_error('payments off: client history', '42501', format('select public.client_payments(%L)', current_setting('t.client')));
select t.expect_error('payments off: staff names', '42501', 'select public.list_collectors()');
select t.check('payments off: clients still readable', t.rows('students') = 1);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('clients off: staff reads no clients', t.rows('students') = 0);
select t.check('clients off: staff still records payments', (select amount_cents = 100
  from public.record_payment(gen_random_uuid(), 100, 'CREDIT', current_setting('t.client')::uuid)));
select public.void_payment(id, 'test') from public.payment_transactions where amount_cents = 100;
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.set_role_menu_access('INSTRUCTOR', 'payments', true);
select public.set_role_menu_access('STAFF', 'clients', true);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('payments back on: instructor sees own payment again', t.rows('payment_transactions') = 1);
reset role;

-- A deactivated user and a signed-in stranger: nothing.
do $$
declare
  u uuid;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c1']::uuid[] loop
    perform t.login(u);
    perform t.check(u || ': reads nothing', t.rows('payment_transactions') + t.rows('students') + t.rows('expenses')
      + t.rows('payment_methods') + t.rows('role_menu_access') + t.rows('training_registrations') = 0);
    perform t.expect_error(u || ': record payment', '42501', format('select public.record_payment(gen_random_uuid(), 100, %L, %L)', 'CASH', current_setting('t.client')));
    perform t.expect_error(u || ': add client', '42501', $q$select public.add_student('X', '1')$q$);
    perform t.expect_error(u || ': search clients', '42501', $q$select public.search_students('mina')$q$);
    perform t.expect_error(u || ': report', '42501', format('select public.finance_report(%L, %L)', current_setting('t.m0'), current_setting('t.today')));
    reset role;
  end loop;
end $$;
select t.login('00000000-0000-0000-0000-0000000000b3');
select t.check('deactivated: current_staff does not reactivate', (select status = 'INACTIVE' from public.current_staff()));
reset role;

-- Anon (the public homepage): only the training form functions.
select t.anon();
select t.check('anon: open courses', jsonb_array_length(public.public_training_courses()) = 1);
select t.expect_error('anon: payments table', '42501', 'select count(*) from public.payment_transactions');
select t.expect_error('anon: clients table', '42501', 'select count(*) from public.students');
select t.expect_error('anon: applicants table', '42501', 'select count(*) from public.training_registrations');
select t.expect_error('anon: record payment', '42501', format('select public.record_payment(gen_random_uuid(), 100, %L, %L)', 'CASH', current_setting('t.client')));
select t.expect_error('anon: report', '42501', format('select public.finance_report(%L, %L)', current_setting('t.m0'), current_setting('t.today')));
reset role;

-- 3. Money adds up the same everywhere --------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select set_config('t.r0', public.finance_report(current_setting('t.m0')::date, current_setting('t.today')::date)::text, true);
-- Payments screen (payments.ts totals): valid payments minus valid refunds over the rows it loads.
select t.check('payments screen = report: gross, refunds, net, count', (
  select sum(amount_cents) filter (where kind = 'PAYMENT') = (current_setting('t.r0')::jsonb ->> 'gross')::bigint
     and sum(amount_cents) filter (where kind = 'REFUND') = (current_setting('t.r0')::jsonb ->> 'refunds')::bigint
     and sum(case kind when 'PAYMENT' then amount_cents else -amount_cents end) = (current_setting('t.r0')::jsonb ->> 'net')::bigint
     and count(*) filter (where kind = 'PAYMENT') = (current_setting('t.r0')::jsonb ->> 'payment_count')::bigint
    from public.payment_transactions
   where status = 'VALID' and business_date between current_setting('t.m0')::date and current_setting('t.today')::date));
select t.check('this month: gross $250 (staff 120 + inst 80 + deactivated 50), refunds $20, net $230, 1 void',
  (current_setting('t.r0')::jsonb ->> 'gross')::bigint = 25000 and (current_setting('t.r0')::jsonb ->> 'refunds')::bigint = 2000
  and (current_setting('t.r0')::jsonb ->> 'net')::bigint = 23000 and (current_setting('t.r0')::jsonb ->> 'void_count')::int = 2);
-- Expenses screen (expenses.ts expenseTotals): active expenses of the month, vendor credits negative.
select t.check('expenses screen = report: total and paid', (
  select sum(amount_cents) = (current_setting('t.r0')::jsonb ->> 'expenses')::bigint
     and sum(amount_cents) filter (where payment_status = 'PAID') = (current_setting('t.r0')::jsonb ->> 'expenses_paid')::bigint
    from public.expenses where status = 'ACTIVE' and period_month = current_setting('t.m0')::date));
select t.check('this month: expenses $3,030 (rent 3,000 + supplies 45 − credit 15), profit −$2,800',
  (current_setting('t.r0')::jsonb ->> 'expenses')::bigint = 303000 and (current_setting('t.r0')::jsonb ->> 'profit')::bigint = -280000);
select t.check('report month row = report totals', current_setting('t.r0')::jsonb -> 'months' -> 0 ->> 'net' = current_setting('t.r0')::jsonb ->> 'net'
  and current_setting('t.r0')::jsonb -> 'months' -> 0 ->> 'expenses' = current_setting('t.r0')::jsonb ->> 'expenses');
select t.check('by method and by who received it add up to the totals', (
  select sum((m ->> 'net')::bigint) = (current_setting('t.r0')::jsonb ->> 'net')::bigint
    from jsonb_array_elements(current_setting('t.r0')::jsonb -> 'by_method') m) and (
  select sum((c ->> 'gross')::bigint) = (current_setting('t.r0')::jsonb ->> 'gross')::bigint
    from jsonb_array_elements(current_setting('t.r0')::jsonb -> 'by_collector') c) and (
  select sum((c ->> 'amount')::bigint) = (current_setting('t.r0')::jsonb ->> 'expenses')::bigint
    from jsonb_array_elements(current_setting('t.r0')::jsonb -> 'by_category') c));
-- Dashboard 12-month chart: each month equals that month's own report.
select set_config('t.r12', public.finance_report(current_setting('t.m1')::date, current_setting('t.today')::date)::text, true);
select t.check('two-month report = sum of the monthly reports', (current_setting('t.r12')::jsonb ->> 'net')::bigint
  = (current_setting('t.r0')::jsonb ->> 'net')::bigint
  + (public.finance_report(current_setting('t.m1')::date, current_setting('t.m1end')::date) ->> 'net')::bigint);
select t.check('chart: last month row = last month report', current_setting('t.r12')::jsonb -> 'months' -> 0 @> jsonb_build_object(
  'net', 30000, 'expenses', 300000, 'profit', -270000));
-- Monthly closing snapshot equals the live report for that month, and stays put.
select public.close_period(current_setting('t.m1')::date);
select t.check('closing snapshot = report', (select (snapshot - 'months') = (public.finance_report(current_setting('t.m1')::date,
  current_setting('t.m1end')::date) - 'months') from public.accounting_periods where month = current_setting('t.m1')::date));
select t.expect_error('closed month: payment cannot be back-dated in', 'LPCLS', format('select public.record_payment(gen_random_uuid(), 100, %L, %L, p_business_date => %L)',
  'CASH', current_setting('t.client'), current_setting('t.m1end')));
reset role;

\echo phase8: all checks passed
rollback;
