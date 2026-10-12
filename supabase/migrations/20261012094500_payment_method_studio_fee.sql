-- Calvin, 2026-10-12: "Studio Fee" in the Payments method dropdown (e.g. the
-- studio's share when an outside trainer runs PT here). Other stays last.
insert into public.payment_methods (code, label_en, label_ko, sort_order)
values ('STUDIO_FEE', 'Studio Fee', 'Studio Fee', 8)
on conflict (code) do nothing;
update public.payment_methods set sort_order = 9 where code = 'OTHER';
