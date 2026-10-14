-- ============================================================================
-- Let's Pilates Admin Portal · add staff without email invitations
--
-- The studio creates sign-in accounts itself (Supabase Dashboard →
-- Authentication → Users → Add user, Auto Confirm). An owner then gives that
-- account a role from the portal's Staff page. No email is sent.
-- Applied by the GitHub integration on push to the Staging branch.
-- ============================================================================

create function public.add_staff_account(
  p_email text, p_full_name text, p_role text default 'INSTRUCTOR', p_pricing_tier text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform app.require_owner();
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No sign-in account with this email. Create it first: Authentication > Users > Add user.'
      using errcode = 'P0002';
  end if;
  if exists (select 1 from public.staff_profiles where user_id = v_user) then
    raise exception 'This person already has a staff profile.' using errcode = '23505';
  end if;
  -- Role and tier values are checked by the table's constraints.
  insert into public.staff_profiles (user_id, full_name, email, role, status, pricing_tier)
  values (v_user, btrim(p_full_name), lower(btrim(p_email)), p_role, 'ACTIVE', p_pricing_tier);
end;
$$;

revoke all on function public.add_staff_account(text, text, text, text) from public, anon, authenticated;
grant execute on function public.add_staff_account(text, text, text, text) to authenticated;

select app.check_api_exposure();
