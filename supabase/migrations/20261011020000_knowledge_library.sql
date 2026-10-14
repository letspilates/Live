-- Knowledge: a library of Pilates and Gyrotonic training videos and documents.
-- Every active portal user reads it; owners and admins (app.is_owner) add,
-- edit and remove items. An item is either a link (YouTube, Vimeo, Google
-- Drive …) or a file in the private "knowledge" Storage bucket.
-- Not a financial record, so removing an item really deletes it.

create table public.knowledge_items (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('PILATES', 'GYROTONIC')),
  kind         text not null check (kind in ('VIDEO', 'DOCUMENT')),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  description  text not null default '' check (char_length(description) <= 4000),
  link_url     text check (link_url ~* '^https?://\S+$'),
  file_path    text unique,
  file_name    text,
  file_size    bigint,
  created_by   uuid default auth.uid() references public.staff_profiles (user_id) on delete set null,
  created_at   timestamptz not null default now(),
  -- exactly one source
  check ((link_url is null) <> (file_path is null))
);
create index knowledge_items_created_at on public.knowledge_items (created_at desc);

create trigger knowledge_items_audit
  after insert or update or delete on public.knowledge_items
  for each row execute function app.audit_row_change('id');

alter table public.knowledge_items enable row level security;
revoke all on public.knowledge_items from public, anon, authenticated;
grant select on public.knowledge_items to authenticated;

create policy knowledge_items_select on public.knowledge_items
  for select to authenticated using ((select app.is_active_staff()));

-- Owner/admin writes go through functions, like every other portal table.
-- p: {id?, category, kind, title, description, link_url | file_path + file_name + file_size}.
-- Editing changes only the text and category; the source stays.
create function public.save_knowledge_item(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform app.require_owner();
  if v_id is null then
    insert into public.knowledge_items (category, kind, title, description, link_url, file_path, file_name, file_size)
    values (p ->> 'category', p ->> 'kind', btrim(p ->> 'title'), coalesce(btrim(p ->> 'description'), ''),
            nullif(btrim(p ->> 'link_url'), ''), nullif(p ->> 'file_path', ''), nullif(p ->> 'file_name', ''),
            (p ->> 'file_size')::bigint)
    returning id into v_id;
  else
    update public.knowledge_items
       set category = p ->> 'category', kind = p ->> 'kind', title = btrim(p ->> 'title'),
           description = coalesce(btrim(p ->> 'description'), '')
     where id = v_id;
    if not found then raise exception 'Item not found.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

-- Returns the removed item's file path (null for a link) so the page can delete the file.
create function public.delete_knowledge_item(p_id uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_path text;
begin
  perform app.require_owner();
  delete from public.knowledge_items where id = p_id returning file_path into v_path;
  if not found then raise exception 'Item not found.' using errcode = 'P0002'; end if;
  return v_path;
end;
$$;

revoke all on function public.save_knowledge_item(jsonb), public.delete_knowledge_item(uuid) from public, anon, authenticated;
grant execute on function public.save_knowledge_item(jsonb), public.delete_knowledge_item(uuid) to authenticated;

-- Private bucket for uploaded files. 50 MB per file = the Supabase Free plan's
-- upload limit; longer videos go in as links.
insert into storage.buckets (id, name, public, file_size_limit)
values ('knowledge', 'knowledge', false, 52428800)
on conflict (id) do nothing;

create policy knowledge_files_select on storage.objects
  for select to authenticated using (bucket_id = 'knowledge' and (select app.is_active_staff()));
create policy knowledge_files_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'knowledge' and (select app.is_owner()));
create policy knowledge_files_delete on storage.objects
  for delete to authenticated using (bucket_id = 'knowledge' and (select app.is_owner()));

select app.check_api_exposure();
