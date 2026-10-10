-- Tests for Daily Income: payments, students, closed-month lock (run with supabase/tests/run-local.sh).
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

-- Owner, instructors A and B, a staff member, and an instructor who is later deactivated.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'ana@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'sam@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'gone@test.local');
select app.grant_owner('owner@test.local', 'Owner');
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.add_staff_account('ana@test.local', 'Ana', 'INSTRUCTOR', 'MASTER');
select public.add_staff_account('ben@test.local', 'Ben', 'INSTRUCTOR', null);
select public.add_staff_account('sam@test.local', 'Sam', 'STAFF', null);
select public.add_staff_account('gone@test.local', 'Gone', 'INSTRUCTOR', null);
reset role;

-- Students ---------------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select set_config('t.mina', public.add_student(' Mina Cho ', '(213) 555-0142')::text, true);
select t.check('add_student: same name + phone returns the same student',
  public.add_student('mina cho', '213-555-0142')::text = current_setting('t.mina'));
select set_config('t.leo', public.add_student('Leo Park')::text, true);
select t.expect_error('add_student: blank name', '23514', $$select public.add_student('  ')$$);
select t.check('search: by name', (select count(*) = 1 and min(full_name) = 'Mina Cho' and min(phone_last4) = '0142'
  from public.search_students('min')));
select t.check('search: by phone digits', (select count(*) = 1 from public.search_students('555-01')));
select t.check('search: short query lists recently paid (none yet)', (select count(*) = 0 from public.search_students('')));
-- S9: staff cannot read the students table itself
select t.check('S9 instructor: students table reads 0 rows', (select count(*) = 0 from public.students));
select t.expect_error('instructor: no direct insert', '42501', $$insert into public.students (full_name) values ('x')$$);
reset role;

-- 24.2: A records $100 cash, B records $150 Zelle -------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('A: records $100 cash', (select amount_cents = 10000 and method = 'CASH' and payer_name = 'Mina Cho'
  and recorded_by_name = 'Ana' and kind = 'PAYMENT' and status = 'VALID'
  and business_date = (now() at time zone 'America/Los_Angeles')::date
  from public.record_payment('11111111-0000-0000-0000-000000000001', 10000, 'CASH', current_setting('t.mina')::uuid)));
select t.check('A: same request again saves once', (select amount_cents = 10000
  from public.record_payment('11111111-0000-0000-0000-000000000001', 10000, 'CASH', current_setting('t.mina')::uuid)));
select t.check('A: one row', (select count(*) = 1 from public.payment_transactions));
select t.expect_error('A: same student + amount within 10 minutes', 'LPDUP',
  $$select public.record_payment('11111111-0000-0000-0000-000000000002', 10000, 'ZELLE', current_setting('t.mina')::uuid)$$);
select t.check('A: confirmed duplicate saves', (select status = 'VALID'
  from public.record_payment('11111111-0000-0000-0000-000000000002', 10000, 'ZELLE', current_setting('t.mina')::uuid,
                             p_confirm_duplicate => true)));
select t.check('A: walk-in', (select payer_name = 'Walk-in' and student_id is null
  from public.record_payment('11111111-0000-0000-0000-000000000003', 4000, 'VENMO')));
select t.expect_error('A: zero amount', '23514',
  $$select public.record_payment(gen_random_uuid(), 0, 'CASH', p_payer_name => 'X')$$);
select t.expect_error('A: over $20,000', '23514',
  $$select public.record_payment(gen_random_uuid(), 2000001, 'CASH', p_payer_name => 'X')$$);
select t.expect_error('A: unknown method', '22023',
  $$select public.record_payment(gen_random_uuid(), 100, 'BITCOIN', p_payer_name => 'X')$$);
select t.expect_error('A: card number in note', '23514',
  $$select public.record_payment(gen_random_uuid(), 100, 'CREDIT', p_payer_name => 'X', p_notes => 'card 4111 1111 1111 1111')$$);
select t.expect_error('A: unknown student', 'P0002',
  $$select public.record_payment(gen_random_uuid(), 100, 'CASH', '00000000-0000-0000-0000-00000000ffff')$$);
select t.expect_error('A: cannot back-date', '42501',
  $$select public.record_payment(gen_random_uuid(), 100, 'CASH', p_payer_name => 'X', p_business_date => current_date - 1)$$);
select t.expect_error('A: no direct insert', '42501',
  $$insert into public.payment_transactions (amount_cents, method, payer_name, recorded_by, recorded_by_name, business_date, client_request_id)
    values (1, 'CASH', 'x', auth.uid(), 'x', current_date, gen_random_uuid())$$);
select t.expect_error('A: no direct update', '42501', $$update public.payment_transactions set amount_cents = 1$$);
select t.expect_error('A: no delete', '42501', $$delete from public.payment_transactions$$);
reset role;

select t.login('00000000-0000-0000-0000-0000000000b2');
-- S7: recorded_by cannot be chosen by the caller (no such parameter; it is always the caller)
select t.check('B: records $150 Zelle as himself', (select recorded_by = '00000000-0000-0000-0000-0000000000b2'
  from public.record_payment('22222222-0000-0000-0000-000000000001', 15000, 'ZELLE', current_setting('t.leo')::uuid)));
select t.check('S2 B: sees only his own payment', (select count(*) = 1 and sum(amount_cents) = 15000 from public.payment_transactions));
select t.check('S1 B: cannot read A''s payment by id', (select count(*) = 0 from public.payment_transactions
  where client_request_id = '11111111-0000-0000-0000-000000000001'));
select t.expect_error('B: cannot reuse A''s request id', '23505',
  $$select public.record_payment('11111111-0000-0000-0000-000000000001', 10000, 'CASH', current_setting('t.mina')::uuid)$$);
select t.check('B: periods hidden', (select count(*) = 0 from public.accounting_periods));
select t.check('B: payment methods visible', (select count(*) = 7 from public.payment_methods));
select t.check('search: recently paid list', (select count(*) = 2 from public.search_students('')));
select t.check('search: last payment shown', (select last_amount_cents = 15000 and last_method = 'ZELLE'
  from public.search_students('leo')));
reset role;

-- STAFF role records like an instructor
select t.login('00000000-0000-0000-0000-0000000000c1');
select t.check('staff: records a payment', (select recorded_by_name = 'Sam'
  from public.record_payment('33333333-0000-0000-0000-000000000001', 5500, 'CASH', p_payer_name => 'Drop-in Jo')));
select t.check('staff: sees only own', (select count(*) = 1 from public.payment_transactions));
select t.expect_error('staff: no refunds', '42501', format(
  $$select public.record_refund(gen_random_uuid(), '%s', 100, 'CASH', 'x')$$,
  (select id from public.payment_transactions limit 1)));
reset role;

-- Owner sees everything: A's two + walk-in, B's $150, staff's $55 ----------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: sees all 5', (select count(*) = 5 from public.payment_transactions));
select t.check('owner: A $100 + B $150 = $250', (select sum(amount_cents) = 25000 from public.payment_transactions
  where client_request_id in ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001')));
select t.check('owner: reads students', (select count(*) = 2 from public.students));
select t.check('owner: back-dates', (select business_date = current_date - 1
  from public.record_payment('44444444-0000-0000-0000-000000000001', 9000, 'CHECK', p_payer_name => 'Old',
                             p_business_date => current_date - 1)));
select t.expect_error('owner: no future date', '22023',
  $$select public.record_payment(gen_random_uuid(), 100, 'CASH', p_payer_name => 'X', p_business_date => current_date + 5)$$);
reset role;

-- Corrections and voids ----------------------------------------------------------------
select set_config('t.a1', (select id::text from public.payment_transactions where client_request_id = '11111111-0000-0000-0000-000000000001'), true);
select set_config('t.a2', (select id::text from public.payment_transactions where client_request_id = '11111111-0000-0000-0000-000000000002'), true);
select set_config('t.a3', (select id::text from public.payment_transactions where client_request_id = '11111111-0000-0000-0000-000000000003'), true);
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.expect_error('B: cannot correct A''s payment', 'P0002',
  format($$select public.correct_payment('%s', 1, 'CASH')$$, current_setting('t.a1')));
select t.expect_error('B: cannot void A''s payment', 'P0002',
  format($$select public.void_payment('%s', 'x')$$, current_setting('t.a1')));
reset role;
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('A: corrects own payment today', (select amount_cents = 12000 and method = 'DEBIT'
  from public.correct_payment(current_setting('t.a1')::uuid, 12000, 'DEBIT', 'fixed', 'typo')));
select t.check('A: audit log hidden from staff', (select count(*) = 0 from public.audit_logs));
reset role;
select t.check('A: correction audited with reason', (select count(*) = 1 from public.audit_logs
  where entity_type = 'payment_transactions' and action = 'update' and reason = 'typo'
    and (before ->> 'amount_cents')::bigint = 10000 and (after ->> 'amount_cents')::bigint = 12000));
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('A: void needs a reason', '22023', format($$select public.void_payment('%s', ' ')$$, current_setting('t.a2')));
select t.check('A: voids the duplicate', (select status = 'VOID' and voided_at is not null and reason = 'double entry'
  from public.void_payment(current_setting('t.a2')::uuid, 'double entry')));
select t.expect_error('A: void twice', '22023', format($$select public.void_payment('%s', 'again')$$, current_setting('t.a2')));
select t.check('A: void row still visible', (select count(*) = 3 from public.payment_transactions));
reset role;
-- A's walk-in moves to yesterday: staff can no longer change it, the owner can.
update public.payment_transactions set business_date = current_date - 1 where id = current_setting('t.a3')::uuid;
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('A: cannot change yesterday''s payment', 'LPDAY',
  format($$select public.correct_payment('%s', 5000, 'VENMO')$$, current_setting('t.a3')));
select t.expect_error('A: cannot void yesterday''s payment', 'LPDAY',
  format($$select public.void_payment('%s', 'x')$$, current_setting('t.a3')));
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: corrects any open-month payment', (select amount_cents = 5000
  from public.correct_payment(current_setting('t.a3')::uuid, 5000, 'VENMO')));
reset role;

-- Refunds (owner only) -------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('instructor: no refunds', '42501',
  format($$select public.record_refund(gen_random_uuid(), '%s', 100, 'CASH', 'x')$$, current_setting('t.a1')));
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: partial refund', (select kind = 'REFUND' and amount_cents = 2000 and payer_name = 'Mina Cho'
  and related_transaction_id = current_setting('t.a1')::uuid and business_date = (now() at time zone 'America/Los_Angeles')::date
  from public.record_refund('55555555-0000-0000-0000-000000000001', current_setting('t.a1')::uuid, 2000, 'CASH', 'missed class')));
select t.check('owner: refund resend saves once', (select count(*) = 1 from public.payment_transactions where kind = 'REFUND'
  and (select id from public.record_refund('55555555-0000-0000-0000-000000000001', current_setting('t.a1')::uuid, 2000, 'CASH', 'missed class')) is not null));
select t.expect_error('owner: refunds cannot exceed the payment', '22023',
  format($$select public.record_refund(gen_random_uuid(), '%s', 10001, 'CASH', 'too much')$$, current_setting('t.a1')));
select t.expect_error('owner: corrected refund cannot exceed the payment', '22023',
  format($$select public.correct_payment('%s', 12001, 'CASH')$$,
         (select id from public.payment_transactions where client_request_id = '55555555-0000-0000-0000-000000000001')));
select t.expect_error('owner: refund needs a reason', '22023',
  format($$select public.record_refund(gen_random_uuid(), '%s', 100, 'CASH', '')$$, current_setting('t.a1')));
select t.expect_error('owner: cannot refund a void payment', '22023',
  format($$select public.record_refund(gen_random_uuid(), '%s', 100, 'CASH', 'x')$$, current_setting('t.a2')));
select t.expect_error('owner: amount below refunded total', '22023',
  format($$select public.correct_payment('%s', 1000, 'DEBIT')$$, current_setting('t.a1')));
select t.expect_error('owner: void with live refund', '22023',
  format($$select public.void_payment('%s', 'x')$$, current_setting('t.a1')));
reset role;

-- S5: a closed month refuses new and changed payments, owner included ----------------------
insert into public.accounting_periods (month, status)
values (date_trunc('month', (now() at time zone 'America/Los_Angeles'))::date, 'CLOSED');
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.expect_error('S5 instructor: closed month refuses a payment', 'LPCLS',
  $$select public.record_payment(gen_random_uuid(), 100, 'CASH', p_payer_name => 'Late')$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.expect_error('S5 owner: closed month refuses a correction', 'LPCLS',
  format($$select public.correct_payment('%s', 13000, 'DEBIT')$$, current_setting('t.a1')));
reset role;
update public.accounting_periods set status = 'OPEN';

-- S11: a deactivated instructor's token sees nothing and records nothing ----------------------
select t.login('00000000-0000-0000-0000-0000000000d1');
select public.record_payment('66666666-0000-0000-0000-000000000001', 700, 'CASH', p_payer_name => 'Before');
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.set_staff_status('00000000-0000-0000-0000-0000000000d1', 'INACTIVE');
reset role;
select t.login('00000000-0000-0000-0000-0000000000d1');
select t.check('S11 inactive: sees 0 payments', (select count(*) = 0 from public.payment_transactions));
select t.expect_error('S11 inactive: cannot record', '42501',
  $$select public.record_payment(gen_random_uuid(), 100, 'CASH', p_payer_name => 'X')$$);
select t.expect_error('S11 inactive: cannot search', '42501', $$select * from public.search_students('mi')$$);
reset role;

-- Received by: A types in a payment Ben was handed ------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b1');
select t.check('collectors: active staff names', (select count(*) = 4 and bool_and(full_name <> 'Gone') from public.list_collectors()));
select t.check('A: records for Ben', (select recorded_by = '00000000-0000-0000-0000-0000000000b1'
  and collected_by = '00000000-0000-0000-0000-0000000000b2' and collected_by_name = 'Ben'
  from public.record_payment('77777777-0000-0000-0000-000000000001', 3300, 'CASH', p_payer_name => 'Handed to Ben',
                             p_collected_by => '00000000-0000-0000-0000-0000000000b2')));
select t.check('A: own payments default to A as receiver', (select bool_and(collected_by = recorded_by)
  from public.payment_transactions where client_request_id::text like '11111111%'));
select t.expect_error('A: inactive staff cannot be the receiver', '22023',
  $$select public.record_payment(gen_random_uuid(), 100, 'CASH', p_payer_name => 'X',
                                 p_collected_by => '00000000-0000-0000-0000-0000000000d1')$$);
reset role;
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('Ben: sees the payment he received', (select count(*) = 1 from public.payment_transactions
  where client_request_id = '77777777-0000-0000-0000-000000000001'));
select t.expect_error('Ben: cannot change what A recorded', 'P0002', format($$select public.void_payment('%s', 'x')$$,
  (select id from public.payment_transactions where client_request_id = '77777777-0000-0000-0000-000000000001')));
reset role;
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('owner: changes the receiver', (select collected_by = '00000000-0000-0000-0000-0000000000c1' and collected_by_name = 'Sam'
  from public.correct_payment((select id from public.payment_transactions where client_request_id = '77777777-0000-0000-0000-000000000001'),
                              3300, 'CASH', p_collected_by => '00000000-0000-0000-0000-0000000000c1')));
reset role;

-- S10: anon gets nothing ---------------------------------------------------------------------
select t.as_anon();
select t.expect_error('S10 anon: payments', '42501', $$select * from public.payment_transactions$$);
select t.expect_error('S10 anon: students', '42501', $$select * from public.students$$);
select t.expect_error('S10 anon: methods', '42501', $$select * from public.payment_methods$$);
select t.expect_error('S10 anon: record', '42501',
  $$select public.record_payment(gen_random_uuid(), 100, 'CASH', p_payer_name => 'X')$$);
select t.expect_error('S10 anon: search', '42501', $$select * from public.search_students('mi')$$);
select t.expect_error('S10 anon: collectors', '42501', $$select * from public.list_collectors()$$);
reset role;

select app.check_api_exposure();

rollback;
\echo payments: all checks passed
