-- ============================================================================
-- Let's Pilates Admin Portal · STAFF role
--
-- Non-teaching staff (front desk, assistants). Same access as INSTRUCTOR for
-- now: no finances, no staff management. Owner-only checks are unchanged
-- because they test role = 'OWNER'.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

alter table public.staff_profiles
  drop constraint staff_profiles_role_check,
  add constraint staff_profiles_role_check check (role in ('OWNER', 'INSTRUCTOR', 'STAFF'));

create or replace function public.set_staff_role(p_user_id uuid, p_role text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  if p_role not in ('OWNER', 'INSTRUCTOR', 'STAFF') then
    raise exception 'Role must be OWNER, INSTRUCTOR or STAFF.' using errcode = '22023';
  end if;
  if p_role <> 'OWNER' then
    perform app.assert_keeps_an_owner(p_user_id);
  end if;
  update public.staff_profiles
     set role = p_role
   where user_id = p_user_id and role <> p_role;
  return found;
end;
$$;

-- create or replace keeps existing grants; restate them so this file stands alone.
revoke all on function public.set_staff_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_staff_role(uuid, text) to authenticated;

select app.check_api_exposure();
