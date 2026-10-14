-- Restore (Settings › Backup, AUDIT-001): a backup made from one portal loads into an empty
-- one with new staff ids, and every count and monthly total comes back the same.
-- Run with supabase/tests/run-local.sh. Rolled back at the end.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated;
create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
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
grant execute on all functions in schema t to anon, authenticated;
create table t.kv (k text primary key, v jsonb);
grant all on t.kv to authenticated;

-- 1. "Staging": three people, real-looking records ------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'ana@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'gone@example.com');
insert into public.staff_profiles (user_id, full_name, email, role, roles, status, pricing_tier, phone, calendar_color) values
  ('00000000-0000-0000-0000-0000000000a1', 'Calvin', 'owner@example.com', 'OWNER', '{OWNER}', 'ACTIVE', null, '', null),
  ('00000000-0000-0000-0000-0000000000b1', 'Ana Park', 'ana@example.com', 'INSTRUCTOR', '{INSTRUCTOR}', 'ACTIVE', 'MASTER', '213-555-0100', '#7A8F6A'),
  ('00000000-0000-0000-0000-0000000000c1', 'Former Staff', 'gone@example.com', 'STAFF', '{STAFF}', 'INACTIVE', null, '', null);

insert into public.students (id, full_name, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'Kim Client', '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-000000000002', 'Kim  Client', null);
update public.students set merged_into = '10000000-0000-0000-0000-000000000001', status = 'INACTIVE'
 where id = '10000000-0000-0000-0000-000000000002';

insert into public.payment_transactions (id, kind, status, amount_cents, method, student_id, payer_name, related_transaction_id,
    recorded_by, recorded_by_name, business_date, client_request_id, voided_at, voided_by, collected_by, collected_by_name) values
  ('20000000-0000-0000-0000-000000000001', 'PAYMENT', 'VALID', 30000, 'CASH', '10000000-0000-0000-0000-000000000001', 'Kim Client', null,
   '00000000-0000-0000-0000-0000000000b1', 'Ana Park', '2026-01-10', gen_random_uuid(), null, null, '00000000-0000-0000-0000-0000000000b1', 'Ana Park'),
  ('20000000-0000-0000-0000-000000000002', 'PAYMENT', 'VALID', 15000, 'ZELLE', '10000000-0000-0000-0000-000000000001', 'Kim Client', null,
   '00000000-0000-0000-0000-0000000000c1', 'Former Staff', '2026-02-03', gen_random_uuid(), null, null, '00000000-0000-0000-0000-0000000000c1', 'Former Staff'),
  ('20000000-0000-0000-0000-000000000003', 'PAYMENT', 'VOID', 9900, 'CASH', '10000000-0000-0000-0000-000000000001', 'Kim Client', null,
   '00000000-0000-0000-0000-0000000000a1', 'Calvin', '2026-02-04', gen_random_uuid(), now(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Calvin');
insert into public.payment_transactions (id, kind, amount_cents, method, student_id, payer_name, related_transaction_id,
    recorded_by, recorded_by_name, business_date, client_request_id, collected_by, collected_by_name) values
  ('20000000-0000-0000-0000-000000000004', 'REFUND', 5000, 'ZELLE', '10000000-0000-0000-0000-000000000001', 'Kim Client',
   '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Calvin', '2026-02-05', gen_random_uuid(),
   '00000000-0000-0000-0000-0000000000a1', 'Calvin');

insert into public.recurring_expense_rules (id, category, description, amount_cents, due_day, start_month, created_by)
  select '30000000-0000-0000-0000-000000000001', code, 'Rent', 400000, 1, '2026-01-01', '00000000-0000-0000-0000-0000000000a1'
    from public.expense_categories order by sort_order limit 1;
insert into public.expenses (id, category, description, amount_cents, expense_date, payment_status, paid_on, recurring_rule_id,
    payee_staff_id, created_by)
  select '30000000-0000-0000-0000-000000000002', category, 'Rent', 400000, '2026-01-01', 'PAID', '2026-01-02', id,
         '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1'
    from public.recurring_expense_rules;
insert into public.accounting_periods (month, status, closed_by, closed_at, version)
  values ('2026-01-01', 'CLOSED', '00000000-0000-0000-0000-0000000000a1', now(), 1);

insert into public.training_registrations (id, course_ids, full_name, email)
  select '40000000-0000-0000-0000-000000000001', array[id], 'Applicant', 'applicant@example.com'
    from public.training_courses order by code limit 1;
insert into public.knowledge_items (id, category, kind, title, link_url, created_by, audience)
  values ('50000000-0000-0000-0000-000000000001', 'PILATES', 'VIDEO', 'Footwork', 'https://example.com/v',
          '00000000-0000-0000-0000-0000000000a1', 'SELECTED');
insert into public.knowledge_item_viewers values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1');
insert into public.role_menu_access values ('INSTRUCTOR', 'schedule');
update public.schedule_services set staff_ids = array['00000000-0000-0000-0000-0000000000b1'::uuid];
update public.schedule_settings set change_text_minutes = 30, other_color = '#123456';

-- 2. The Everything (JSON) file, built like Backup.tsx builds it -----------------------------
insert into t.kv
select 'file', jsonb_build_object('exported_at', now(),
  'staff', (select jsonb_agg(jsonb_build_object('user_id', user_id, 'full_name', full_name, 'email', email, 'role', role,
             'roles', roles, 'status', status, 'pricing_tier', pricing_tier, 'phone', phone, 'address', address,
             'certifications', certifications, 'notes', notes)) from public.staff_profiles),
  'schedule_instructors', (select jsonb_agg(jsonb_build_object('user_id', user_id, 'full_name', full_name,
             'calendar_color', calendar_color)) from public.staff_profiles where 'INSTRUCTOR' = any(roles)));
do $$
declare tbl text; rows jsonb;
begin
  foreach tbl in array array['students', 'payment_transactions', 'payment_methods', 'accounting_periods', 'expenses',
      'expense_categories', 'recurring_expense_rules', 'training_courses', 'training_registrations', 'knowledge_items',
      'knowledge_item_viewers', 'role_menu_access', 'schedule_services', 'schedule_categories', 'schedule_settings'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x', tbl) into rows;
    update t.kv set v = jsonb_set(v, array[tbl], rows) where k = 'file';
  end loop;
end $$;

-- 3. A fresh live portal: same migrations, no data, new login ids -------------------------
alter table public.payment_transactions disable trigger user;
alter table public.expenses disable trigger user;
delete from public.knowledge_item_viewers; delete from public.knowledge_items;
delete from public.accounting_periods; delete from public.expenses; delete from public.recurring_expense_rules;
delete from public.payment_transactions where kind = 'REFUND'; delete from public.payment_transactions;
update public.students set merged_into = null; delete from public.students;
delete from public.training_registrations;
alter table public.payment_transactions enable trigger user;
alter table public.expenses enable trigger user;
delete from public.staff_profiles; delete from auth.users;
-- What a new project seeds: back to the migration defaults.
update public.schedule_services set staff_ids = null;
update public.schedule_settings set change_text_minutes = 15, other_color = null;
delete from public.role_menu_access where role = 'INSTRUCTOR' and menu = 'schedule';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'OWNER@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'ana@example.com');
insert into public.staff_profiles (user_id, full_name, email, role, status) values
  ('00000000-0000-0000-0000-0000000000a2', 'Calvin', 'OWNER@example.com', 'OWNER', 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000000b2', 'Ana Park', 'ana@example.com', 'INSTRUCTOR', 'ACTIVE');

-- 4. Who may restore, and what it refuses ----------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.expect_error('instructor cannot restore', '42501',
  $$select public.restore_backup((select v from t.kv where k = 'file'))$$);
select t.login('00000000-0000-0000-0000-0000000000a2');
select t.expect_error('a person in the file has no login here', 'LPSTF',
  $$select public.restore_backup((select v from t.kv where k = 'file'))$$);
select t.expect_error('not a backup file', '22023', $$select public.restore_backup('{"students": []}')$$);
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c2', 'gone@example.com');
insert into public.staff_profiles (user_id, full_name, email, role, status)
  values ('00000000-0000-0000-0000-0000000000c2', 'Former Staff', 'gone@example.com', 'STAFF', 'ACTIVE');

-- 5. Restore and compare -----------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a2');
insert into t.kv select 'result', public.restore_backup((select v from t.kv where k = 'file'));
reset role;

select t.check('every count matches the file', (
  select bool_and((r.v -> 'counts' ->> key)::int = jsonb_array_length(f.v -> key))
    from t.kv r, t.kv f,
         unnest(array['students', 'payment_transactions', 'payment_methods', 'accounting_periods', 'expenses',
                      'recurring_expense_rules', 'expense_categories', 'training_courses', 'training_registrations',
                      'knowledge_items', 'role_menu_access', 'schedule_services', 'schedule_categories', 'staff']) key
   where r.k = 'result' and f.k = 'file'));
select t.check('monthly net: January $300, February $150 - $50 refund (void left out)',
  (select v -> 'months' from t.kv where k = 'result') = '{"2026-01": 30000, "2026-02": 10000}');
select t.check('monthly net equals Reports', (
  select (r ->> 'net')::bigint = 10000 from jsonb_array_elements(public.finance_report('2026-02-01', '2026-02-28') -> 'months') r
   limit 1) is not false);
select t.check('payments point at the new staff ids', (
  select bool_and(recorded_by = case recorded_by_name when 'Ana Park' then '00000000-0000-0000-0000-0000000000b2'::uuid
                                                       when 'Former Staff' then '00000000-0000-0000-0000-0000000000c2'::uuid
                                                       else '00000000-0000-0000-0000-0000000000a2'::uuid end
                  and recorded_by = collected_by)
    from public.payment_transactions));
select t.check('void keeps who voided it', (
  select voided_by = '00000000-0000-0000-0000-0000000000a2' from public.payment_transactions
   where id = '20000000-0000-0000-0000-000000000003'));
select t.check('refund still points at its payment', exists (
  select 1 from public.payment_transactions where kind = 'REFUND' and related_transaction_id = '20000000-0000-0000-0000-000000000002'));
select t.check('merged client still hidden behind the kept one', (
  select merged_into = '10000000-0000-0000-0000-000000000001' from public.students where id = '10000000-0000-0000-0000-000000000002'));
select t.check('January stays closed', (select status = 'CLOSED' and closed_by = '00000000-0000-0000-0000-0000000000a2'
  from public.accounting_periods where month = '2026-01-01'));
select t.check('expense payee and rule follow', (select payee_staff_id = '00000000-0000-0000-0000-0000000000b2'
  and recurring_rule_id = '30000000-0000-0000-0000-000000000001' from public.expenses));
select t.check('sign-up keeps its course', (select course_ids[1] in (select id from public.training_courses)
  from public.training_registrations));
select t.check('Knowledge viewer follows the instructor', exists (select 1 from public.knowledge_item_viewers
  where user_id = '00000000-0000-0000-0000-0000000000b2'));
select t.check('Admin access switches come over', exists (select 1 from public.role_menu_access
  where role = 'INSTRUCTOR' and menu = 'schedule'));
select t.check('services keep their instructor', not exists (select 1 from public.schedule_services
  where staff_ids is distinct from array['00000000-0000-0000-0000-0000000000b2'::uuid]));
select t.check('schedule settings come over', (select change_text_minutes = 30 and other_color = '#123456' from public.schedule_settings));
select t.check('staff details, status and color come over', (
  select bool_and(case email when 'ana@example.com' then pricing_tier = 'MASTER' and phone = '213-555-0100' and calendar_color = '#7A8F6A'
                             when 'gone@example.com' then status = 'INACTIVE'
                             else status = 'ACTIVE' and 'OWNER' = any(roles) end)
    from public.staff_profiles));

-- 6. Never twice ---------------------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a2');
select t.expect_error('a second restore is refused', 'LPFUL',
  $$select public.restore_backup((select v from t.kv where k = 'file'))$$);

rollback;
\echo restore: all checks passed
