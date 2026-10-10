-- Tests for the Knowledge library (run with supabase/tests/run-local.sh). Rolled back at the end.

\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to anon, authenticated;

create function t.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception '[%] failed', p_label; end if;
end $$;

create function t.expect_error(p_label text, p_code text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_code then return; end if;
    raise exception '[%] expected SQLSTATE %, got %: %', p_label, p_code, sqlstate, sqlerrm;
  end;
  raise exception '[%] expected SQLSTATE %, but it succeeded', p_label, p_code;
end $$;

grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'inst@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'gone@test.local');
select app.grant_owner('owner@test.local', 'Owner');
insert into public.staff_profiles (user_id, full_name, email, role, roles, status) values
  ('00000000-0000-0000-0000-0000000000b2', 'Ian Inst', 'inst@test.local', 'INSTRUCTOR', '{INSTRUCTOR}', 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000000b3', 'Gus Gone', 'gone@test.local', 'INSTRUCTOR', '{INSTRUCTOR}', 'INACTIVE');

select t.check('bucket is private with a 50 MB limit',
  (select not public and file_size_limit = 52428800 from storage.buckets where id = 'knowledge'));

-- Owner adds a link and a file ---------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select public.save_knowledge_item('{"category":"PILATES","kind":"VIDEO","title":" Reformer basics ","link_url":"https://youtu.be/abc123"}');
insert into storage.objects (bucket_id, name) values ('knowledge', 'x/manual.pdf');
select public.save_knowledge_item('{"category":"GYROTONIC","kind":"DOCUMENT","title":"Manual","file_path":"x/manual.pdf","file_name":"manual.pdf","file_size":1000}');
select t.check('created_by is the owner', (select bool_and(created_by = '00000000-0000-0000-0000-0000000000a1') from public.knowledge_items));
select t.check('title trimmed', exists (select 1 from public.knowledge_items where title = 'Reformer basics'));
select t.expect_error('needs exactly one source', '23514',
  $$select public.save_knowledge_item('{"category":"PILATES","kind":"VIDEO","title":"Nothing"}')$$);
select t.expect_error('link must be http(s)', '23514',
  $$select public.save_knowledge_item('{"category":"PILATES","kind":"VIDEO","title":"Bad","link_url":"javascript:alert(1)"}')$$);
select t.expect_error('unknown category', '23514',
  $$select public.save_knowledge_item('{"category":"YOGA","kind":"VIDEO","title":"Bad","link_url":"https://x.y"}')$$);
select public.save_knowledge_item(jsonb_build_object('id', (select id from public.knowledge_items where kind = 'VIDEO'),
  'category', 'GYROTONIC', 'kind', 'VIDEO', 'title', 'Reformer basics 1', 'description', 'Week 1'));
select t.check('edit keeps the link', exists (select 1 from public.knowledge_items
  where title = 'Reformer basics 1' and category = 'GYROTONIC' and description = 'Week 1' and link_url = 'https://youtu.be/abc123'));
select t.expect_error('table not writable directly', '42501',
  $$insert into public.knowledge_items (category, kind, title, link_url) values ('PILATES', 'VIDEO', 'Direct', 'https://x.y')$$);
reset role;

-- Instructor reads, cannot write ---------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b2');
select t.check('instructor sees the library', (select count(*) = 2 from public.knowledge_items));
select t.check('instructor sees the file', (select count(*) = 1 from storage.objects where bucket_id = 'knowledge'));
select t.expect_error('instructor cannot add', '42501',
  $$select public.save_knowledge_item('{"category":"PILATES","kind":"VIDEO","title":"Mine","link_url":"https://x.y"}')$$);
select t.expect_error('instructor cannot remove', '42501',
  $$select public.delete_knowledge_item((select id from public.knowledge_items limit 1))$$);
select t.expect_error('instructor cannot upload', '42501',
  $$insert into storage.objects (bucket_id, name) values ('knowledge', 'y/mine.pdf')$$);
delete from storage.objects;
reset role;
select t.check('instructor changed nothing', (select count(*) = 2 from public.knowledge_items)
  and (select count(*) = 1 from storage.objects));

-- Inactive and signed-out users see nothing ----------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000b3');
select t.check('inactive user sees nothing', (select count(*) = 0 from public.knowledge_items)
  and (select count(*) = 0 from storage.objects));
reset role;
set local role anon;
select t.expect_error('anon cannot read', '42501', $$select * from public.knowledge_items$$);
reset role;

-- Owner removes ------------------------------------------------------------------------------
select t.login('00000000-0000-0000-0000-0000000000a1');
select t.check('remove returns the file path',
  public.delete_knowledge_item((select id from public.knowledge_items where kind = 'DOCUMENT')) = 'x/manual.pdf');
select t.check('remove a link returns null',
  public.delete_knowledge_item((select id from public.knowledge_items where kind = 'VIDEO')) is null);
delete from storage.objects where name = 'x/manual.pdf';
reset role;
select t.check('owner removed items and file', (select count(*) = 0 from public.knowledge_items)
  and (select count(*) = 0 from storage.objects));

select app.check_api_exposure();

rollback;
\echo knowledge: all checks passed
