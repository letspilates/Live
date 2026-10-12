-- Calvin, 2026-10-12: the "Instructor Compensation" expense category is now
-- called "Salary". Only the label changes; the code (INSTRUCTOR_PAY) and every
-- saved expense stay the same.
update public.expense_categories set name_en = 'Salary', name_ko = '급여' where code = 'INSTRUCTOR_PAY';
