-- Restore failed on the live project with "UPDATE requires a WHERE clause": Supabase loads
-- safeupdate for API calls, which refuses UPDATE or DELETE without WHERE, even inside a
-- function. Same function; those five statements now say which rows they change. Additive only.

create or replace function public.restore_backup(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_missing text;
  v_me uuid := auth.uid();
  v_counts jsonb;
  v_months jsonb;
begin
  perform app.require_owner();
  if exists (select 1 from public.students) or exists (select 1 from public.payment_transactions)
     or exists (select 1 from public.expenses) then
    raise exception 'This portal already has clients, payments or expenses. Restore only works on an empty portal.'
      using errcode = 'LPFUL';
  end if;
  if jsonb_typeof(p -> 'students') is distinct from 'array' or jsonb_typeof(p -> 'payment_transactions') is distinct from 'array'
     or jsonb_typeof(p -> 'staff') is distinct from 'array' then
    raise exception 'This is not an Everything (JSON) backup file.' using errcode = '22023';
  end if;

  -- Staff: old id -> id of the login with the same email here.
  drop table if exists pg_temp.restore_staff;
  create temp table restore_staff on commit drop as
    select f.user_id as old_id, s.user_id as new_id, f.*
      from jsonb_populate_recordset(null::public.staff_profiles, p -> 'staff') f
      left join public.staff_profiles s on lower(s.email) = lower(f.email);
  select string_agg(email, ', ') into v_missing from restore_staff where new_id is null;
  if v_missing is not null then
    raise exception 'No login here yet for: %', v_missing using errcode = 'LPSTF';
  end if;
  -- Same people, same names, roles and status as on Staging (never locks out whoever restores).
  update public.staff_profiles s
     set full_name = r.full_name, roles = r.roles, pricing_tier = r.pricing_tier,
         phone = coalesce(r.phone, ''), address = coalesce(r.address, ''),
         certifications = coalesce(r.certifications, ''), notes = coalesce(r.notes, ''),
         status = case when s.user_id = v_me then s.status else r.status end
    from restore_staff r
   where s.user_id = r.new_id;
  update public.staff_profiles s set roles = array_append(s.roles, 'OWNER')
   where s.user_id = v_me and not ('OWNER' = any(s.roles) or 'ADMIN' = any(s.roles));
  update public.staff_profiles s set calendar_color = c.calendar_color
    from jsonb_to_recordset(coalesce(p -> 'schedule_instructors', '[]')) c(user_id uuid, calendar_color text),
         restore_staff r
   where r.old_id = c.user_id and s.user_id = r.new_id;

  create or replace function pg_temp.sid(old uuid) returns uuid language sql as
    'select coalesce((select new_id from pg_temp.restore_staff where old_id = old), old)';

  -- Lookup lists: the file's rows win.
  insert into public.payment_methods
    select * from jsonb_populate_recordset(null::public.payment_methods, p -> 'payment_methods')
  on conflict (code) do update set label_en = excluded.label_en, label_ko = excluded.label_ko,
    active = excluded.active, sort_order = excluded.sort_order;
  insert into public.expense_categories
    select * from jsonb_populate_recordset(null::public.expense_categories, p -> 'expense_categories')
  on conflict (code) do update set name_en = excluded.name_en, name_ko = excluded.name_ko,
    active = excluded.active, sort_order = excluded.sort_order;

  -- Clients (merged ones point at the kept row, so that link goes in second).
  insert into public.students
    select id, full_name, phone, email, status, pg_temp.sid(created_by), created_at, notes, address, mindbody_id,
           mindbody_imported_at, schedulista_key, schedulista_imported_at, schedulista_last_visit,
           schedulista_next_visit, schedulista_visits, schedulista_services, schedulista_notes, null,
           extra_source_keys
      from jsonb_populate_recordset(null::public.students, p -> 'students');
  update public.students s set merged_into = f.merged_into
    from jsonb_populate_recordset(null::public.students, p -> 'students') f
   where s.id = f.id and f.merged_into is not null;

  -- Payments before refunds (a refund points at its payment). Months close at the end.
  insert into public.payment_transactions
    select id, kind, status, amount_cents, method, student_id, payer_name, related_transaction_id,
           pg_temp.sid(recorded_by), recorded_by_name, recorded_at, business_date, notes, reason,
           client_request_id, voided_at, pg_temp.sid(voided_by), pg_temp.sid(collected_by),
           collected_by_name, method_other
      from jsonb_populate_recordset(null::public.payment_transactions, p -> 'payment_transactions')
     order by kind = 'REFUND';

  insert into public.recurring_expense_rules
    select id, category, description, vendor, amount_cents, due_day, start_month, end_month, is_estimate,
           pg_temp.sid(payee_staff_id), active, pg_temp.sid(created_by), created_at
      from jsonb_populate_recordset(null::public.recurring_expense_rules, p -> 'recurring_expense_rules');
  insert into public.expenses (id, category, description, vendor, amount_cents, expense_date, due_date,
      payment_status, paid_on, payment_method, status, void_reason, recurring_rule_id, is_estimate,
      payee_staff_id, notes, created_by, created_at)
    select id, category, description, vendor, amount_cents, expense_date, due_date, payment_status, paid_on,
           payment_method, status, void_reason, recurring_rule_id, is_estimate, pg_temp.sid(payee_staff_id),
           notes, pg_temp.sid(created_by), created_at
      from jsonb_populate_recordset(null::public.expenses, p -> 'expenses');
  insert into public.accounting_periods
    select month, status, pg_temp.sid(closed_by), closed_at, version, pg_temp.sid(reopened_by), reopened_at,
           reopen_reason, snapshot
      from jsonb_populate_recordset(null::public.accounting_periods, p -> 'accounting_periods');

  -- Trainings: the file's courses replace the seeded ones (sign-ups point at course ids).
  -- A sign-up made here before the restore follows its course by code.
  update public.training_registrations g
     set course_ids = array(
       select coalesce((select f.id from jsonb_populate_recordset(null::public.training_courses, p -> 'training_courses') f
                         join public.training_courses c on c.code = f.code and c.code <> '' where c.id = x), x)
         from unnest(g.course_ids) x)
   where cardinality(g.course_ids) > 0;
  delete from public.training_courses c
   where not exists (select 1 from jsonb_populate_recordset(null::public.training_courses, p -> 'training_courses') f
                      where f.id = c.id);
  insert into public.training_courses
    select * from jsonb_populate_recordset(null::public.training_courses, p -> 'training_courses')
  on conflict (id) do nothing;
  insert into public.training_registrations
    select * from jsonb_populate_recordset(null::public.training_registrations, p -> 'training_registrations')
  on conflict (id) do nothing;

  insert into public.knowledge_items
    select id, category, kind, title, description, link_url, file_path, file_name, file_size,
           pg_temp.sid(created_by), created_at, audience
      from jsonb_populate_recordset(null::public.knowledge_items, p -> 'knowledge_items');
  insert into public.knowledge_item_viewers
    select item_id, pg_temp.sid(user_id)
      from jsonb_populate_recordset(null::public.knowledge_item_viewers, p -> 'knowledge_item_viewers');

  delete from public.role_menu_access where role in ('STAFF', 'INSTRUCTOR');
  insert into public.role_menu_access
    select * from jsonb_populate_recordset(null::public.role_menu_access, p -> 'role_menu_access');

  -- Schedule set-up: the file's categories and services replace the seeded ones.
  delete from public.schedule_services s
   where s.id not in (select f.id from jsonb_populate_recordset(null::public.schedule_services, p -> 'schedule_services') f);
  delete from public.schedule_categories c
   where c.id not in (select f.id from jsonb_populate_recordset(null::public.schedule_categories, p -> 'schedule_categories') f);
  insert into public.schedule_categories
    select * from jsonb_populate_recordset(null::public.schedule_categories, p -> 'schedule_categories')
  on conflict (id) do update set name = excluded.name, sort = excluded.sort, guest = excluded.guest;
  insert into public.schedule_services (name, minutes, capacity, active, sort, id, category_id, price_cents,
      cleanup_minutes, description, staff_ids, source_name, guest_instructor)
    select name, minutes, capacity, active, sort, id, category_id, price_cents, cleanup_minutes, description,
           (select array_agg(pg_temp.sid(x)) from unnest(staff_ids) x), source_name, guest_instructor
      from jsonb_populate_recordset(null::public.schedule_services, p -> 'schedule_services')
  on conflict (id) do update set name = excluded.name, minutes = excluded.minutes, capacity = excluded.capacity,
    active = excluded.active, sort = excluded.sort, category_id = excluded.category_id,
    price_cents = excluded.price_cents, cleanup_minutes = excluded.cleanup_minutes,
    description = excluded.description, staff_ids = excluded.staff_ids, source_name = excluded.source_name,
    guest_instructor = excluded.guest_instructor;
  update public.schedule_settings s set change_text_minutes = f.change_text_minutes, other_color = f.other_color
    from jsonb_populate_recordset(null::public.schedule_settings, p -> 'schedule_settings') f
   where s.id = f.id;

  -- What landed, for the page to compare with the file.
  select jsonb_build_object(
    'students', (select count(*) from public.students),
    'payment_transactions', (select count(*) from public.payment_transactions),
    'payment_methods', (select count(*) from public.payment_methods),
    'accounting_periods', (select count(*) from public.accounting_periods),
    'expenses', (select count(*) from public.expenses),
    'recurring_expense_rules', (select count(*) from public.recurring_expense_rules),
    'expense_categories', (select count(*) from public.expense_categories),
    'training_courses', (select count(*) from public.training_courses),
    'training_registrations', (select count(*) from public.training_registrations g
                                where g.id in (select f.id from jsonb_populate_recordset(null::public.training_registrations, p -> 'training_registrations') f)),
    'knowledge_items', (select count(*) from public.knowledge_items),
    'role_menu_access', (select count(*) from public.role_menu_access),
    'schedule_services', (select count(*) from public.schedule_services),
    'schedule_categories', (select count(*) from public.schedule_categories),
    'staff', (select count(*) from public.staff_profiles s where s.user_id in (select new_id from restore_staff))
  ) into v_counts;
  select coalesce(jsonb_object_agg(m, net), '{}') into v_months from (
    select to_char(business_date, 'YYYY-MM') as m,
           sum(case kind when 'PAYMENT' then amount_cents else -amount_cents end) as net
      from public.payment_transactions where status = 'VALID' group by 1) x;
  return jsonb_build_object('counts', v_counts, 'months', v_months);
end;
$$;

revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
