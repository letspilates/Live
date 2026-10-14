-- Settings › Schedule like Schedulista: services grouped in categories, each with a price, cleanup time,
-- description and the instructors who teach it (staff accounts from Users). Additive only.

create table public.schedule_categories (
  id   uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort int not null default 0
);
create unique index schedule_categories_name on public.schedule_categories (lower(name));

alter table public.schedule_services
  add column id              uuid not null default gen_random_uuid() unique,
  add column category_id     uuid references public.schedule_categories on delete restrict,
  add column price_cents     int check (price_cents between 0 and 10000000),
  add column cleanup_minutes int not null default 0 check (cleanup_minutes between 0 and 120),
  add column description     text not null default '' check (char_length(description) <= 1000),
  -- Instructors who teach it; null = every instructor.
  add column staff_ids       uuid[];

-- Schedulista's three categories, with the services Let's Pilates already has.
insert into public.schedule_categories (name, sort) values
  ('Individual Classes', 1), ('Pilates Classes', 2), ('Gyrotonic Classes', 3);
update public.schedule_services s set category_id = c.id
  from public.schedule_categories c
 where (c.name, s.name) in (('Individual Classes', 'Private'), ('Individual Classes', 'Gyrotonic'),
                            ('Pilates Classes', 'Pilates Group'), ('Gyrotonic Classes', 'Gyrotonic Group'));

alter table public.schedule_categories enable row level security;
revoke all on public.schedule_categories from public, anon, authenticated;
grant select on public.schedule_categories to authenticated;
create policy schedule_categories_select on public.schedule_categories
  for select to authenticated using ((select app.can('schedule')));

-- p: {id?, name, sort?}. Returns the id.
create function public.save_schedule_category(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
begin
  perform app.require_owner();
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Category name is required (up to 60 characters).' using errcode = '22023';
  end if;
  if exists (select 1 from public.schedule_categories where lower(name) = lower(v_name) and id is distinct from v_id) then
    raise exception 'A category with this name already exists.' using errcode = '23505';
  end if;
  if v_id is null then
    insert into public.schedule_categories (name, sort)
    values (v_name, coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.schedule_categories)))
    returning id into v_id;
  else
    update public.schedule_categories set name = v_name, sort = coalesce((p ->> 'sort')::int, sort) where id = v_id;
    if not found then
      raise exception 'Category not found.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Only an empty category can go (move or hide its services first).
create function public.delete_schedule_category(p_id uuid) returns void
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

-- p: {id?, name, minutes, capacity, active?, sort?, category_id?, price_cents?, cleanup_minutes?, description?, staff_ids?}.
-- With id: edit that service (a new name also renames it on its appointments). Without id: same name = edit, else add last.
-- A key left out keeps the saved value.
drop function public.save_schedule_service(jsonb);
create function public.save_schedule_service(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_staff uuid[];
  v public.schedule_services;
begin
  perform app.require_owner();
  if p ? 'staff_ids' and jsonb_typeof(p -> 'staff_ids') = 'array' then
    v_staff := array(select jsonb_array_elements_text(p -> 'staff_ids')::uuid);
    if cardinality(v_staff) = 0 then
      raise exception 'Pick at least one instructor.' using errcode = '22023';
    end if;
  end if;
  if v_id is null then
    select * into v from public.schedule_services where lower(name) = lower(v_name);
  else
    select * into v from public.schedule_services where id = v_id for update;
    if not found then
      raise exception 'Service not found.' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.schedule_services where lower(name) = lower(v_name) and id <> v_id) then
      raise exception 'A service with this name already exists.' using errcode = '23505';
    end if;
  end if;

  if v.id is null then
    insert into public.schedule_services (name, minutes, capacity, active, sort, category_id, price_cents, cleanup_minutes, description, staff_ids)
    values (v_name, (p ->> 'minutes')::int, (p ->> 'capacity')::int, coalesce((p ->> 'active')::boolean, true),
            coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.schedule_services)),
            (p ->> 'category_id')::uuid, (p ->> 'price_cents')::int, coalesce((p ->> 'cleanup_minutes')::int, 0),
            btrim(coalesce(p ->> 'description', '')), v_staff)
    returning id into v_id;
    return v_id;
  end if;

  update public.schedule_services set
    name            = v_name,
    minutes         = (p ->> 'minutes')::int,
    capacity        = (p ->> 'capacity')::int,
    active          = coalesce((p ->> 'active')::boolean, active),
    sort            = coalesce((p ->> 'sort')::int, sort),
    category_id     = case when p ? 'category_id' then (p ->> 'category_id')::uuid else category_id end,
    price_cents     = case when p ? 'price_cents' then (p ->> 'price_cents')::int else price_cents end,
    cleanup_minutes = coalesce((p ->> 'cleanup_minutes')::int, cleanup_minutes),
    description     = coalesce(btrim(p ->> 'description'), description),
    staff_ids       = case when p ? 'staff_ids' then v_staff else staff_ids end
  where id = v.id;
  if v.name <> v_name then
    update public.appointments set service = v_name, updated_at = now() where service = v.name;
  end if;
  return v.id;
end;
$$;

-- Drag to reorder: each list in its new order (either may be null).
create function public.set_schedule_order(p_categories uuid[], p_services uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  update public.schedule_categories c set sort = o.n from unnest(p_categories) with ordinality o(id, n) where c.id = o.id;
  update public.schedule_services s set sort = o.n from unnest(p_services) with ordinality o(id, n) where s.id = o.id;
end;
$$;

revoke all on function public.save_schedule_category(jsonb), public.delete_schedule_category(uuid),
  public.save_schedule_service(jsonb), public.set_schedule_order(uuid[], uuid[])
from public, anon, authenticated;
grant execute on function public.save_schedule_category(jsonb), public.delete_schedule_category(uuid),
  public.save_schedule_service(jsonb), public.set_schedule_order(uuid[], uuid[])
to authenticated;

select app.check_api_exposure();
