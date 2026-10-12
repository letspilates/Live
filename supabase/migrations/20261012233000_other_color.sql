-- Calendar color for Other (guest instructors and events without an instructor), picked in Settings ›
-- Schedule settings like an instructor's color. null = the default (#EB5366). Additive only.
alter table public.schedule_settings add column other_color text check (other_color ~ '^#[0-9A-F]{6}$');

create function public.set_other_color(p_color text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.require_owner();
  update public.schedule_settings set other_color = upper(nullif(btrim(p_color), '')) where id;
end;
$$;

revoke all on function public.set_other_color(text) from public, anon, authenticated;
grant execute on function public.set_other_color(text) to authenticated;

select app.check_api_exposure();
