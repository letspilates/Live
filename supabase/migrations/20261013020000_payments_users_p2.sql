-- ============================================================================
-- Staging audit P2 fixes (Calvin approved 2026-10-13). Plan:
-- docs/staging-audit/P2-FIX-PLAN.md. AUDIT-006 (Dashboard month range) is a
-- screen change only.
--
-- AUDIT-008: Add user links an existing sign-in as ACTIVE only when its email
--   was confirmed. An unconfirmed one (anyone can sign up with someone else's
--   address while sign-ups are open) stays INVITED; the staff-admin function
--   then sends the invitation, so only the mailbox owner can set a password.
-- AUDIT-009: payment and expense dates before 2020-01-01 are refused (a year
--   typed as "26" becomes 0026 and the money left every report). Clear error
--   LPOLD in the functions and a trigger; table CHECKs as a backstop.
-- AUDIT-010: Staff and Instructors (not Owner/Admin) see only the payments
--   they recorded or received today (LA date), enforced here, not only in the
--   screen. Client history and client search follow the same rule. The front
--   desk shares one STAFF login, so "own" means that login's payments.
-- Additive: functions replaced, constraints/triggers added, policy narrowed.
-- No data is changed or deleted. Applied by the GitHub integration on push to
-- the Staging branch.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- AUDIT-008: unconfirmed sign-ins wait as INVITED
-- ---------------------------------------------------------------------------

-- p: full_name, roles[], phone, address, certifications, notes, pricing_tier.
-- p_user_id null = find the sign-in account by email (it already existed).
create or replace function public.add_staff_user(p_user_id uuid, p_email text, p_invited boolean, p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := p_user_id;
  v_confirmed boolean;
  v_roles text[] := app.roles_of(p);
begin
  perform app.require_owner();
  perform app.guard_owner_change(null, v_roles);
  if cardinality(v_roles) = 0 then
    raise exception 'Choose at least one role.' using errcode = '22023';
  end if;
  select id, email_confirmed_at is not null into v_user, v_confirmed from auth.users
   where lower(email) = lower(btrim(p_email)) and (v_user is null or id = v_user);
  if v_user is null then
    raise exception 'No sign-in account with this email.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.staff_profiles where user_id = v_user) then
    raise exception 'This person is already a user.' using errcode = '23505';
  end if;
  -- Nobody has proved they own this address yet: wait for the invitation.
  p_invited := p_invited or not v_confirmed;
  insert into public.staff_profiles (
    user_id, email, full_name, roles, status, invited_at, pricing_tier, phone, address, certifications, notes)
  values (
    v_user, lower(btrim(p_email)), btrim(coalesce(p ->> 'full_name', '')), v_roles,
    case when p_invited then 'INVITED' else 'ACTIVE' end, case when p_invited then now() end,
    nullif(p ->> 'pricing_tier', ''), btrim(coalesce(p ->> 'phone', '')), btrim(coalesce(p ->> 'address', '')),
    btrim(coalesce(p ->> 'certifications', '')), btrim(coalesce(p ->> 'notes', '')));
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- AUDIT-009: no dates before 2020-01-01 in the books
-- ---------------------------------------------------------------------------

create or replace function app.require_book_date(p_date date) returns void
language plpgsql stable set search_path = ''
as $$
begin
  if p_date < date '2020-01-01' then
    raise exception 'Dates before 2020-01-01 cannot be saved. Check the year.' using errcode = 'LPOLD';
  end if;
end;
$$;

create or replace function public.record_payment(
  p_client_request_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_student_id uuid default null,
  p_payer_name text default null,
  p_notes text default '',
  p_confirm_duplicate boolean default false,
  p_business_date date default null,
  p_collected_by uuid default null,
  p_method_other text default ''
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  v_collector public.staff_profiles;
  v_payer text;
  v_other text;
  v public.payment_transactions;
begin
  select * into v from public.payment_transactions where client_request_id = p_client_request_id;
  if v.id is not null then
    if v.recorded_by <> v_me.user_id then
      raise exception 'Request id already used.' using errcode = '23505';
    end if;
    return v;
  end if;

  if p_business_date is not null and not app.is_owner() then
    raise exception 'Only an owner or admin can choose the date.' using errcode = '42501';
  end if;
  if p_business_date > app.la_today() then
    raise exception 'The date cannot be in the future.' using errcode = '22023';
  end if;
  perform app.require_book_date(p_business_date);
  perform app.require_method(p_method);
  v_other := app.method_other(p_method, p_method_other);
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
    amount_cents, method, method_other, student_id, payer_name, recorded_by, recorded_by_name,
    collected_by, collected_by_name, business_date, notes, client_request_id)
  values (
    p_amount_cents, p_method, v_other, p_student_id, v_payer, v_me.user_id, v_me.full_name,
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

create or replace function public.correct_payment(
  p_id uuid, p_amount_cents bigint, p_method text, p_notes text default '', p_reason text default '',
  p_collected_by uuid default null, p_method_other text default '',
  p_business_date date default null
) returns public.payment_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v public.payment_transactions := app.editable_payment(p_id);
  v_collector public.staff_profiles;
begin
  if p_collected_by is null or p_collected_by = v.collected_by then
    v_collector.user_id := v.collected_by;
    v_collector.full_name := v.collected_by_name;
  else
    v_collector := app.collector(p_collected_by);
  end if;
  perform app.require_method(p_method);
  if p_business_date is not null and p_business_date <> v.business_date then
    if not app.is_owner() then
      raise exception 'Only an owner or admin can change the date.' using errcode = '42501';
    end if;
    if p_business_date > app.la_today() then
      raise exception 'The date cannot be in the future.' using errcode = '22023';
    end if;
    perform app.require_book_date(p_business_date);
  end if;
  if v.kind = 'REFUND' then
    perform 1 from public.payment_transactions where id = v.related_transaction_id for update;
  end if;
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
     set amount_cents = p_amount_cents, method = p_method, method_other = app.method_other(p_method, p_method_other), notes = btrim(coalesce(p_notes, '')),
         collected_by = v_collector.user_id, collected_by_name = v_collector.full_name,
         business_date = coalesce(p_business_date, v.business_date)
   where id = v.id
  returning * into v;
  return v;
end;
$$;

-- Expenses and recurring rules are written directly by owners/admins (RLS), so
-- the same check runs as a trigger before the closed-month one.
create or replace function app.enforce_expense_dates() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_book_date(new.expense_date);
  perform app.require_book_date(new.due_date);
  perform app.require_book_date(new.paid_on);
  return new;
end;
$$;

create or replace function app.enforce_rule_dates() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_book_date(new.start_month);
  perform app.require_book_date(new.end_month);
  return new;
end;
$$;

create trigger expenses_book_dates
  before insert or update on public.expenses
  for each row execute function app.enforce_expense_dates();
create trigger recurring_expense_rules_book_dates
  before insert or update on public.recurring_expense_rules
  for each row execute function app.enforce_rule_dates();

-- Backstop for any other writer. Every row so far is from 2026.
alter table public.payment_transactions
  add constraint payment_transactions_business_date_floor check (business_date >= date '2020-01-01');
alter table public.expenses
  add constraint expenses_dates_floor check (expense_date >= date '2020-01-01'
    and due_date >= date '2020-01-01' and paid_on >= date '2020-01-01');
alter table public.recurring_expense_rules
  add constraint recurring_expense_rules_start_floor check (start_month >= date '2020-01-01');

-- ---------------------------------------------------------------------------
-- AUDIT-010: Staff/Instructor see only today's own payments
-- ---------------------------------------------------------------------------

-- RLS calls it for staff rows now (it only reads the clock).
grant execute on function app.la_today() to authenticated;

-- Own = recorded or received by the caller. Owners/admins see everything.
alter policy payment_transactions_select on public.payment_transactions
  using (((select auth.uid()) in (recorded_by, collected_by) and business_date = (select app.la_today())
          and (select app.can('payments')))
         or (select app.is_owner()));

-- The client's last 10 payments and refunds, newest first. Staff and
-- instructors: only today's rows they recorded or received.
create or replace function public.client_payments(p_student_id uuid)
returns table (business_date date, kind text, status text, amount_cents bigint, method text, method_other text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles := app.me();
  v_all boolean := app.is_owner();
begin
  return query
    select t.business_date, t.kind, t.status, t.amount_cents, t.method, t.method_other
      from public.payment_transactions t
     where t.student_id = p_student_id
       and (v_all or (v_me.user_id in (t.recorded_by, t.collected_by) and t.business_date = app.la_today()))
     order by t.recorded_at desc
     limit 10;
end;
$$;

-- Client picker for the payment screen. Fewer than 2 characters → the
-- clients paid most recently. Returns only what is needed to tell people
-- apart (no email, no full phone number). Staff and instructors get the last
-- amount and method only when that payment is one they may see (theirs, today).
create or replace function public.search_students(p_query text default '')
returns table (
  id uuid, full_name text, phone_last4 text,
  last_paid_on date, last_amount_cents bigint, last_method text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_me public.staff_profiles := app.me();
  v_all boolean := app.is_owner();
  v_today date := app.la_today();
begin
  return query
    select s.id, s.full_name, right(regexp_replace(s.phone, '\D', '', 'g'), 4),
           p.business_date,
           case when p.visible then p.amount_cents end,
           case when p.visible then p.method end
      from public.students s
      left join lateral (
        select t.business_date, t.amount_cents, t.method, t.recorded_at,
               v_all or (v_me.user_id in (t.recorded_by, t.collected_by) and t.business_date = v_today) as visible
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

-- ---------------------------------------------------------------------------
-- Function privileges (replaced functions keep theirs)
-- ---------------------------------------------------------------------------

revoke all on function
  app.require_book_date(date), app.enforce_expense_dates(), app.enforce_rule_dates()
from public, anon, authenticated;

select app.check_api_exposure();
