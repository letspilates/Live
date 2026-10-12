-- Settings › Schedule: delete a service. Appointments keep the service name they were booked with
-- (they hold the name as text), so the calendar and its history don't change. Additive only.
create function public.delete_schedule_service(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  delete from public.schedule_services where id = p_id;
end;
$$;

revoke all on function public.delete_schedule_service(uuid) from public, anon, authenticated;
grant execute on function public.delete_schedule_service(uuid) to authenticated;

select app.check_api_exposure();
