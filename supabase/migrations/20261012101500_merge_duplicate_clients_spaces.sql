-- ============================================================================
-- Clients · merge duplicates, follow-up 2 (2026-10-12)
--
-- A client could still show twice with the same phone when the names differed
-- only by a space ("Yuhee Kim" / "Yu Hee Kim"). For same-phone matches the name
-- now compares letters only, spaces and word order ignored. Same name with a
-- different phone still needs the normal name rule.
-- ============================================================================

-- "Yu Hee Kim", "Kim Yuhee" → the same sorted letters.
create function app.client_letters_key(p text) returns text
language sql immutable set search_path = ''
as $$
  select string_agg(c, '' order by c) from regexp_split_to_table(replace(app.client_name_key(p), ' ', ''), '') c;
$$;

revoke all on function app.client_letters_key(text) from public, anon, authenticated;

create or replace function app.merge_duplicate_clients() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  v_drop uuid;
  v_merged int := 0;
  v_apart int := 0;
begin
  -- Same name (spaces ignored) and same phone number: the same person, even with two emails or
  -- two records in one system (the extra source IDs are kept on the client).
  for g in
    select array_agg(s.id order by exists (select 1 from public.payment_transactions t where t.student_id = s.id) desc,
                                   s.status = 'ACTIVE' desc, s.created_at, s.id) ids
      from public.students s
     where s.merged_into is null and app.client_name_key(s.full_name) <> ''
       and length(regexp_replace(s.phone, '\D', '', 'g')) >= 7
     group by app.client_letters_key(s.full_name), right(regexp_replace(s.phone, '\D', '', 'g'), 10)
    having count(*) > 1
  loop
    begin
      foreach v_drop in array g.ids[2:] loop
        perform app.merge_client(g.ids[1], v_drop);
      end loop;
      v_merged := v_merged + cardinality(g.ids) - 1;
    exception when others then
      v_apart := v_apart + 1;
    end;
  end loop;

  for g in
    select array_agg(s.id order by exists (select 1 from public.payment_transactions t where t.student_id = s.id) desc,
                                   s.status = 'ACTIVE' desc, s.created_at, s.id) ids,
           count(distinct right(regexp_replace(s.phone, '\D', '', 'g'), 10))
             filter (where length(regexp_replace(s.phone, '\D', '', 'g')) >= 7) phones,
           count(distinct lower(s.email)) filter (where s.email <> '') emails,
           count(s.mindbody_id) mb, count(s.schedulista_key) sc
      from public.students s
     where s.merged_into is null and app.client_name_key(s.full_name) <> ''
     group by app.client_name_key(s.full_name)
    having count(*) > 1
  loop
    if g.phones > 1 or g.emails > 1 or g.mb > 1 or g.sc > 1 then
      v_apart := v_apart + 1;
      continue;
    end if;
    begin
      foreach v_drop in array g.ids[2:] loop
        perform app.merge_client(g.ids[1], v_drop);
      end loop;
      v_merged := v_merged + cardinality(g.ids) - 1;
    exception when others then
      v_apart := v_apart + 1;
    end;
  end loop;
  return jsonb_build_object('merged', v_merged, 'left_apart', v_apart);
end;
$$;


select app.merge_duplicate_clients();

select app.check_api_exposure();
