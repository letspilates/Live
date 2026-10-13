-- Calvin 2026-10-13: the Staging calendar was polluted by testing, so every appointment is
-- removed before the fresh Schedulista CSV is imported (a plain re-import skips rows it already
-- has, so test edits would stay). Bookings go with their appointment (on delete cascade).
-- Services, categories, colors, schedule settings, clients and payments are not touched.
-- Each deleted row keeps a full copy in audit_logs.before.
-- On a new database (production at cutover) the table is still empty, so this does nothing.
do $$
begin
  perform set_config('app.reason', 'Cleared test appointments before the fresh Schedulista import', true);
  delete from public.appointments;
end $$;
