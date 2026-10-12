-- Adding a client follows the Clients switch in Settings › Admin access
-- (Calvin, 2026-10-12): clients are added on the Clients screen only, not on
-- Payments. Before, add_student went through app.me(), which checked Payments
-- access. Owners and admins always pass app.can().

create or replace function public.add_student(p_full_name text, p_phone text default '') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.staff_profiles;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_id uuid;
begin
  select * into v_me from public.staff_profiles where user_id = auth.uid() and status = 'ACTIVE';
  if v_me.user_id is null or not app.can('clients') then
    raise exception 'Adding clients needs Clients access.' using errcode = '42501';
  end if;
  select id into v_id from public.students
   where status = 'ACTIVE' and lower(full_name) = lower(v_name)
     and regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
   limit 1;
  if v_id is null then
    insert into public.students (full_name, phone, created_by)
    values (v_name, v_phone, v_me.user_id)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
