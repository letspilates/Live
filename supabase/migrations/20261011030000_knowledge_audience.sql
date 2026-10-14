-- Knowledge: who sees each item. 'ALL' = every active portal user (as before);
-- 'SELECTED' = only the people listed in knowledge_item_viewers. Owners and
-- admins always see everything. The same rule guards the uploaded files.

alter table public.knowledge_items
  add column audience text not null default 'ALL' check (audience in ('ALL', 'SELECTED'));

create table public.knowledge_item_viewers (
  item_id uuid not null references public.knowledge_items (id) on delete cascade,
  user_id uuid not null references public.staff_profiles (user_id) on delete cascade,
  primary key (item_id, user_id)
);

alter table public.knowledge_item_viewers enable row level security;
revoke all on public.knowledge_item_viewers from public, anon, authenticated;
grant select on public.knowledge_item_viewers to authenticated;
create policy knowledge_item_viewers_select on public.knowledge_item_viewers
  for select to authenticated using (user_id = (select auth.uid()) or (select app.is_owner()));

-- SECURITY DEFINER so the check can read the viewer list without RLS recursion.
create function app.can_view_knowledge(p_item uuid, p_audience text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_owner()
      or (app.is_active_staff()
          and (p_audience = 'ALL'
               or exists (select 1 from public.knowledge_item_viewers v
                           where v.item_id = p_item and v.user_id = auth.uid())));
$$;

create function app.can_view_knowledge_file(p_path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_owner()
      or exists (select 1 from public.knowledge_items i
                  where i.file_path = p_path and app.can_view_knowledge(i.id, i.audience));
$$;
revoke all on function app.can_view_knowledge(uuid, text), app.can_view_knowledge_file(text) from public, anon, authenticated;
grant execute on function app.can_view_knowledge(uuid, text), app.can_view_knowledge_file(text) to authenticated;

drop policy knowledge_items_select on public.knowledge_items;
create policy knowledge_items_select on public.knowledge_items
  for select to authenticated using (app.can_view_knowledge(id, audience));

drop policy knowledge_files_select on storage.objects;
create policy knowledge_files_select on storage.objects
  for select to authenticated using (bucket_id = 'knowledge' and app.can_view_knowledge_file(name));

-- p gains audience ('ALL' | 'SELECTED') and viewer_ids (staff user ids, used for SELECTED).
create or replace function public.save_knowledge_item(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_audience text := coalesce(nullif(p ->> 'audience', ''), 'ALL');
  v_viewers uuid[] := array(select jsonb_array_elements_text(coalesce(p -> 'viewer_ids', '[]'))::uuid);
begin
  perform app.require_owner();
  if v_audience = 'SELECTED' and cardinality(v_viewers) = 0 then
    raise exception 'Choose at least one person.' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.knowledge_items (category, kind, title, description, link_url, file_path, file_name, file_size, audience)
    values (p ->> 'category', p ->> 'kind', btrim(p ->> 'title'), coalesce(btrim(p ->> 'description'), ''),
            nullif(btrim(p ->> 'link_url'), ''), nullif(p ->> 'file_path', ''), nullif(p ->> 'file_name', ''),
            (p ->> 'file_size')::bigint, v_audience)
    returning id into v_id;
  else
    update public.knowledge_items
       set category = p ->> 'category', kind = p ->> 'kind', title = btrim(p ->> 'title'),
           description = coalesce(btrim(p ->> 'description'), ''), audience = v_audience
     where id = v_id;
    if not found then raise exception 'Item not found.' using errcode = 'P0002'; end if;
  end if;
  delete from public.knowledge_item_viewers where item_id = v_id;
  if v_audience = 'SELECTED' then
    insert into public.knowledge_item_viewers (item_id, user_id)
    select v_id, s.user_id from public.staff_profiles s where s.user_id = any (v_viewers);
  end if;
  return v_id;
end;
$$;

select app.check_api_exposure();
