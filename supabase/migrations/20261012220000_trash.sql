-- Settings › Trash: a deleted schedule service or category is kept here (a copy of its row) until it is
-- restored or deleted forever. Other kinds can join later with their own restore. Additive only.

create table public.trash (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('schedule_service', 'schedule_category')),
  label      text not null,
  data       jsonb not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid default auth.uid() references public.staff_profiles (user_id) on delete set null
);
create index trash_deleted_at on public.trash (deleted_at desc);

alter table public.trash enable row level security;
revoke all on public.trash from public, anon, authenticated;
grant select on public.trash to authenticated;
create policy trash_owner on public.trash
  for select to authenticated using ((select app.is_owner()));

-- Delete = move to Trash. Appointments keep the service name they were booked with.
create or replace function public.delete_schedule_service(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  with d as (delete from public.schedule_services where id = p_id returning *)
  insert into public.trash (kind, label, data) select 'schedule_service', d.name, to_jsonb(d) from d;
end;
$$;

-- Only an empty category can go (move or delete its services first).
create or replace function public.delete_schedule_category(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  if exists (select 1 from public.schedule_services where category_id = p_id) then
    raise exception 'Move its services to another category first.' using errcode = '23503';
  end if;
  with d as (delete from public.schedule_categories where id = p_id returning *)
  insert into public.trash (kind, label, data) select 'schedule_category', d.name, to_jsonb(d) from d;
end;
$$;

-- Put it back as it was. A name now taken by another service or category has to change first;
-- a service whose category is gone comes back without one.
create function public.restore_trash(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.trash;
begin
  perform app.require_owner();
  delete from public.trash where id = p_id returning * into v;
  if not found then
    raise exception 'Not in Trash.' using errcode = 'P0002';
  end if;
  if v.kind = 'schedule_service' then
    if exists (select 1 from public.schedule_services where lower(name) = lower(v.data ->> 'name')) then
      raise exception 'A service named "%" already exists. Rename it first.', v.data ->> 'name' using errcode = '23505';
    end if;
    insert into public.schedule_services
    select * from jsonb_populate_record(null::public.schedule_services, v.data
      || jsonb_build_object('category_id', (select id from public.schedule_categories where id = (v.data ->> 'category_id')::uuid)));
  else
    if exists (select 1 from public.schedule_categories where lower(name) = lower(v.data ->> 'name')) then
      raise exception 'A category named "%" already exists. Rename it first.', v.data ->> 'name' using errcode = '23505';
    end if;
    insert into public.schedule_categories select * from jsonb_populate_record(null::public.schedule_categories, v.data);
  end if;
end;
$$;

create function public.purge_trash(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  delete from public.trash where id = p_id;
end;
$$;

revoke all on function public.restore_trash(uuid), public.purge_trash(uuid) from public, anon, authenticated;
grant execute on function public.restore_trash(uuid), public.purge_trash(uuid) to authenticated;

select app.check_api_exposure();
