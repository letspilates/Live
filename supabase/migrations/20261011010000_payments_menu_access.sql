-- Phase 8 fix found in final verification.
--
-- Settings › Admin access only hid the Payments menu: the database still let
-- any active staff member record payments, add clients from the payment
-- screen, search clients and read a client's payment history. app.me() is
-- the caller check every one of those functions uses (record_payment,
-- record_refund, correct_payment / void_payment via editable_payment,
-- add_student, search_students, client_payments, list_collectors,
-- import_members), so it now also requires Payments access. Owners and
-- admins always have it (app.can).

create or replace function app.me() returns public.staff_profiles
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.staff_profiles;
begin
  select * into v from public.staff_profiles where user_id = auth.uid() and status = 'ACTIVE';
  if v.user_id is null then
    raise exception 'Only active staff can do this.' using errcode = '42501';
  end if;
  if not app.can('payments') then
    raise exception 'Payments is turned off for your role.' using errcode = '42501';
  end if;
  return v;
end;
$$;
