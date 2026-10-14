-- One-time seed of the training courses from the old Google Sheet "Courses" tab
-- (Calvin's export, 2026-10-12). Runs only when the table is still empty, so it
-- never duplicates or overwrites courses already edited in the portal.
insert into public.training_courses
  (code, name_en, name_kr, dates, length_days, capacity, price, fee, conducted_by, active)
select v.* from (values
  ('A', 'GYROTONIC® Level 2 Pre-Training Course', 'GYROTONIC® Level 2 프리 트레이닝 코스',
   '7/24 - 7/26', 3, 1, '525', '175', 'Master Trainer Rich O''Connor', true),
  ('B', 'GYROTONIC® Jumping Streching Board', 'GYROTONIC® 점핑 스트레칭 보드 과정 (Jumping Stretching Board)',
   '8/7 - 8/9, 8/13 - 8/16', 6, 1, '1225', '350', 'Master Trainer Rich O''Connor', true),
  ('C', 'Level 1 Hands-On Workshop - Part 2', '레벨 1 핸즈 온 워크샵 파트 2',
   '8/22', 1, 4, '250', '50', 'Master Trainer Rich O''Connor', true),
  ('D', 'Gyrotoner® Part 1', 'Gyrotoner® 파트 1',
   '9/18 - 9/20', 3, 0, '', '', '', true),
  ('E', 'GYROTONIC® Level 2 Program 1 — Foundation Course', 'GYROTONIC® Level 2 Program 1 — 기초 과정 (Foundation Course)',
   '10/29 - 11/1', 4, 4, '700', '250', 'Master Trainer Rich O''Connor', true)
) as v(code, name_en, name_kr, dates, length_days, capacity, price, fee, conducted_by, active)
where not exists (select 1 from public.training_courses);
