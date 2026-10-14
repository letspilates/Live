-- Calvin doesn't want a Trash (2026-10-12): deleting a schedule service or category deletes it again,
-- and the trash table and its functions go.
create or replace function public.delete_schedule_service(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  delete from public.schedule_services where id = p_id;
end;
$$;

create or replace function public.delete_schedule_category(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  if exists (select 1 from public.schedule_services where category_id = p_id) then
    raise exception 'Move its services to another category first.' using errcode = '23503';
  end if;
  delete from public.schedule_categories where id = p_id;
end;
$$;

drop function public.restore_trash(uuid);
drop function public.purge_trash(uuid);
drop table public.trash;

select app.check_api_exposure();
