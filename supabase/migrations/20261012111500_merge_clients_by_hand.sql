-- ============================================================================
-- Clients · merge two clients by hand (Owner/Admin), 2026-10-12
--
-- For pairs the automatic rule can't see, e.g. a Korean and an English
-- spelling of the same person. Moves p_drop into p_keep exactly like the
-- automatic merge (payments move, the other row is hidden, never deleted) and
-- optionally sets the kept client's name. Names never live in migrations.
-- ============================================================================

create function public.merge_clients(p_keep uuid, p_drop uuid, p_full_name text default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  perform app.merge_client(p_keep, p_drop);
  if nullif(btrim(p_full_name), '') is not null then
    update public.students set full_name = btrim(p_full_name) where id = p_keep;
  end if;
end;
$$;

revoke all on function public.merge_clients(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.merge_clients(uuid, uuid, text) to authenticated;

select app.check_api_exposure();
