# Remediation Backlog

Ordered by dependency and risk. Nothing here has been changed yet: every task waits for Calvin's approval. Details, evidence and line references are in [FINDINGS_BY_SECTION.md](FINDINGS_BY_SECTION.md).

Ground rules for every fix: work on `Staging`, additive migrations with unique version numbers, take a Backup JSON (and ideally a DB dump) before pushing any migration (see AUDIT-002), run `run-local.sh` + `admin-shell.mjs` + build + lint before push. Items marked **design-locked** change layout or style and need Calvin's OK first. Items marked **decision** need Calvin to pick the rule before coding.

Complexity: S = under half a day, M = about a day, L = several days or needs Calvin's dashboard work.

---

## Wave 1: Release blockers (P0)

### 1. AUDIT-001: a tested way to move the real data into production
- **Required change:** Pick one copy method and rehearse it.
  - Option A (recommended, no new app code): `pg_dump --data-only` of the `public` schema from Staging, plus creating prod `auth.users` with the same UUIDs as the Staging staff. Load with triggers disabled (or reopen/close months around it), skip the rows the seed migrations already create, and copy the Knowledge Storage files.
  - Option B: an owner-only `import_backup(jsonb)` RPC that remaps staff ids by email, skips seed rows and generated columns, inserts in FK order and closes periods last.
  - Decide whether Staging test payments are excluded.
- **Target files/modules:** `docs/admin/PRODUCTION-CUTOVER-KO.md` (procedure); for option B also a new migration and `pilates-landing/src/admin/pages/Backup.tsx`.
- **Dependencies:** Calvin creates the prod Supabase project (rollout steps 1–6). AUDIT-007 checklist rewrite. Option A needs someone with direct DB access (Calvin's machine via Supabase CLI), because the cloud session cannot connect to the database.
- **Complexity:** L
- **Acceptance criteria:** A rehearsal into a scratch project gives identical per-table row counts, identical `finance_report` totals for Jan–Oct 2026, the same `recorded_by`/`collected_by` names on payments, and the same appointments per instructor per month as Staging.
- **Regression tests:** Restore rehearsal with a reconciliation query set (row counts, monthly totals, instructor counts). If option B: a SQL test that restores a backup produced by the local suites.

## Wave 2: High priority (P1)

### 2. AUDIT-002: protect the real data while it lives in Staging (do first, before any other push with a migration)
- **Required change:** Process, not code: download Settings › Backup › Everything (JSON) now and before every migration push; ideally `supabase db dump` from Calvin's machine; or upgrade the `studio` project to Pro until cutover for daily backups.
- **Target:** Supabase dashboard; `docs/admin/PRODUCTION-CUTOVER-KO.md` note.
- **Dependencies:** none. Blocks every migration below.
- **Complexity:** S
- **Acceptance criteria:** A dated backup exists before each migration push; the dashboard shows the plan tier and backup list.
- **Regression tests:** none (process).

### 3. AUDIT-003: user delete must not strip instructors from appointments
- **Required change:** New migration: `appointments.staff_id` and `appointments.created_by` FKs to `on delete restrict`, so `delete_staff_user` answers "deactivate instead". Remove the id from `schedule_services.staff_ids` on delete or refuse the delete.
- **Target files:** new migration under `supabase/migrations/`; `supabase/tests/users.test.sql` or `schedule.test.sql`.
- **Dependencies:** AUDIT-002 backup.
- **Complexity:** S
- **Acceptance criteria:** Deleting a user with any appointment raises LPREF; appointments keep `staff_id`.
- **Regression tests:** SQL test for delete with appointments; existing users/staff suites.

### 4. AUDIT-004: a stale calendar must not cancel other people's bookings
- **Required change:** Resize/move saves leave bookings untouched (`keep_clients` flag or a dedicated length RPC). Dialog saves send the loaded `updated_at` and get "changed by someone else, reload" when it differs, or send explicit cancel ids instead of cancel-by-omission.
- **Target files:** latest `save_appointment` (new migration), `pilates-landing/src/admin/pages/Schedule.tsx` (`saveLength`, dialog save), `src/admin/schedule.ts`.
- **Dependencies:** AUDIT-002. Do together with AUDIT-012/013 (same function).
- **Complexity:** M
- **Acceptance criteria:** The two-user scenario (B adds a client, A resizes without reload) keeps B's client BOOKED; a stale dialog save is refused with a clear message.
- **Regression tests:** SQL test for stale resize and stale dialog save; admin-shell checks for the refusal message.

### 5. AUDIT-005: payment date must follow the LA day
- **Required change:** In Record payment, send `p_business_date` only when the user actually changed the date (or roll the field forward on the existing 60 s LA-day tick). Give the Dashboard "Today" effect the same tick.
- **Target files:** `pilates-landing/src/admin/pages/DailyIncome.tsx`, `pilates-landing/src/admin/pages/Dashboard.tsx`.
- **Dependencies:** none (no migration, no design change).
- **Complexity:** S
- **Acceptance criteria:** With a fake clock crossing LA midnight, the save sends no back-date and the Dashboard refetches.
- **Regression tests:** admin-shell check with a mocked clock (23:50 → 00:05 LA).

### 6. AUDIT-006: Dashboard month figures must match Reports
- **Required change:** Dashboard uses `monthEnd(thisMonth())` as the end of the KPI range and the chart's last month.
- **Target files:** `pilates-landing/src/admin/pages/Dashboard.tsx`.
- **Dependencies:** none.
- **Complexity:** S
- **Acceptance criteria:** With an expense dated later this month, Dashboard expenses/profit equal Reports for the same month.
- **Regression tests:** admin-shell check comparing the two screens on the same mock data.

## Wave 3: Remaining functional defects (P2)

| Order | ID | Required change | Target files/modules | Dependencies | Size | Acceptance criteria | Regression tests |
|---|---|---|---|---|---|---|---|
| 1 | AUDIT-007 | Rewrite the cutover checklist: create prod → wire URL/key on Staging → merge → wait for migrations → `grant_owner` → staff → data copy → sign-ups off → smoke test. Add schedule, Knowledge files, Admin access, expenses; refresh stale lines | `docs/admin/PRODUCTION-CUTOVER-KO.md`, `docs/admin/SETUP-KO.md` | AUDIT-001 method chosen | S | Every step runnable in order on a scratch project | Dry run on a scratch project |
| 2 | AUDIT-008 | Turn sign-ups off before prod (checklist). In `add_staff_user`/staff-admin, link an existing login only if it is confirmed and never signed in, otherwise keep it INVITED and send a reset | staff-admin `index.ts`, new migration, checklist | AUDIT-007 | S | Unconfirmed existing login is refused or stays INVITED | SQL test with `email_confirmed_at null`; mock edge test |
| 3 | AUDIT-009 | Refuse payment/expense dates before a floor (e.g. 2020-01-01) in RPCs + CHECK; add `min` to date inputs | new migration; `DailyIncome.tsx`, `Expenses.tsx` | AUDIT-002 | S | `0026-10-12` is refused | payments/expenses SQL tests; admin-shell 2-digit-year check |
| 4 | AUDIT-010 | **Decision**: should the database enforce "own same-day only" for Staff/Instructor? If yes: RLS date filter, trim `client_payments` and `search_students` for non-admins | new migration; `phase8.test.sql` | Calvin's rule | M | Staff gets 0 past rows and no other recorder's amounts | phase8 role matrix additions |
| 5 | AUDIT-011 | Per-course save/delete RPCs; refuse deleting a course with registrants (archive instead) | new migration; `TrainingCourses.tsx`, `enrollments.ts` | AUDIT-002 | M | Stale tab cannot delete a course; registrants never dangle | training SQL test; admin-shell two-session check |
| 6 | AUDIT-012 | "This and following" applies only the changed fields and skips dates marked changed | latest `save_appointment` | with AUDIT-004 | M | Substitute on a later date survives a following-length change | schedule SQL test (p2 scenario) |
| 7 | AUDIT-013 | Either apply client adds/removes to later series dates, or show "Client changes apply to this date only" under the scope choice (content-only) | `save_appointment` or `i18n.ts` | with AUDIT-004 | S–M | Behaviour and wording agree | schedule SQL test or admin-shell text check |
| 8 | AUDIT-014 | Warn when a chosen client is already booked at an overlapping time ("Book anyway"); refuse exact duplicates | new RPC; `Schedule.tsx` dialog | with AUDIT-004 | M | Warning shown; exact duplicate refused | SQL test (p3 scenario); admin-shell dialog check |
| 9 | AUDIT-015 | Hide full phone/email/price/notes on bookings from users without Clients access (column grants + view/RPC; calendar uses last 4 digits) | new migration; `schedule.ts` | AUDIT-002 | M | Staff with Clients off cannot read those columns | schedule SQL test (p6 scenario) |
| 10 | AUDIT-016 | **Decision** before turning Instructor Schedule on: own appointments only, or accept | `save_appointment`/`move`/`cancel` | Calvin's rule | S | Rule enforced server-side | per-role × own/other test |
| 11 | AUDIT-017 | State in Schedule settings and the dry-run summary that import is one-time; or flag same client/date at a different time | `ScheduleSettings.tsx`, `i18n.ts`, optionally `import_schedule` | none | S | Re-import of a rescheduled export is flagged or clearly explained | schedule SQL test (p7 scenario) |
| 12 | AUDIT-018 | Bot protection on the public training form (Turnstile/captcha via an edge function, per-IP limit) or don't count unconfirmed sign-ups toward seats | `TrainingForm.tsx` (no design change), new edge function or migration | before prod Supabase is wired | M | 5 anonymous submits from one client are throttled; course stays open | local probe repeat; training SQL test |
| 13 | AUDIT-019 | Move the portal to its own origin (e.g. `admin.letspilatesla.com`) or put the site behind a proxy that sends CSP / `frame-ancestors`; minimum: homepage CSP meta + anti-framing guard on /admin | hosting, `vite.config.ts` | Calvin's hosting choice | M–L | Admin token not readable from the homepage origin; framing refused | header check after deploy |
| 14 | AUDIT-020 | Retire the Apps Script endpoint right after cutover; until then add limits, length caps and a leading quote for `= + - @` | `apps-script/google-apps-script.js` (deployed by Calvin) | cutover | S | `/exec` disabled after cutover | POST with `=1+1` stored as text |
| 15 | AUDIT-021 | **Design-locked**: switch the 4-column KPI grid and Payments two-column layout from `lg:` to `xl:` (layout above 1280 unchanged) | `Dashboard.tsx`, `DailyIncome.tsx` | Calvin's OK | S | No cut money at 1024–1180; no sideways scroll | admin-shell width checks at 1024/1180 |
| 16 | AUDIT-022 | Staging marker on phones and sign-in: prefix the page title with "STAGING ·" on staging builds (content); showing the badge at all widths is **design-locked** | `Layout.tsx`, `Login.tsx`, `admin/index.html` | none | S | Marker visible at 375 and on sign-in | admin-shell screenshot check |

## Wave 4: Optional improvements (P3)

| ID | Required change | Target | Deps | Size | Acceptance / regression test |
|---|---|---|---|---|---|
| AUDIT-023 | Show "—" and a retry instead of $0.00 / "No payments yet" on load errors | `DailyIncome.tsx`, `Members.tsx` | — | S | Error mock shows no $0.00 (admin-shell) |
| AUDIT-024 | **Design-locked**: keep the Schedule header from clipping the gear at 768 | `Schedule.tsx` | Calvin's OK | S | Gear inside the card at 768 |
| AUDIT-025 | Emit a `404.html` that sends unknown `/admin/*` paths to the portal root | `vite.config.ts` | — | S | Live curl of a bad admin path opens the portal |
| AUDIT-026 | **Design-locked**: invisible 44px hit areas for Access checkboxes and small schedule controls | `Access.tsx`, `Schedule.tsx`, `ScheduleSettings.tsx`, `Dashboard.tsx` | Calvin's OK | S | No key control under 32px at 375 |
| AUDIT-027 | Compute source-chip counts after the Active filter | `Members.tsx` | — | S | Chip count = list count |
| AUDIT-028 | Staff dashboard card text "My payments today", link without `tab=history` | `Dashboard.tsx` | — | S | Text/link check |
| AUDIT-029 | Map database error texts to i18n keys | `Schedule.tsx`, `ScheduleSettings.tsx`, `Enrollments.tsx`, `Members.tsx` | — | S | KR error mock shows Korean |
| AUDIT-030 | **Design-locked, homepage**: clip the 8px overflow at 375 (exists on production today) | homepage section | Calvin's OK | S | scrollWidth = 375 |
| AUDIT-031 | Refuse edits to cancelled appointments; add un-cancel or an Undo after cancel | `save_appointment`, `Schedule.tsx` | AUDIT-004 | S–M | SQL test: saving a cancelled appointment errors |
| AUDIT-032 | Merge: cancel the colliding duplicate booking; allow student_id-only updates through the closed-month trigger; refuse payments/updates to merged rows | merge functions, `enforce_open_period`, `update_member`, `record_payment` | AUDIT-002 | M | members/schedule SQL tests per case |
| AUDIT-033 | **Decision**: should late cancel / no-show free a seat? | `save_appointment` | Calvin's rule | S | SQL test full class + late cancel |
| AUDIT-034 | Update cancel prompt text to mention the date circle (content) | `i18n.ts` | — | S | Text check |
| AUDIT-035 | Audit triggers on schedule services and categories | new migration | AUDIT-002 | S | audit_logs row on delete |
| AUDIT-036 | Refund date must be on or after its payment's date | `correct_payment` | AUDIT-002 | S | payments SQL test |
| AUDIT-037 | Group "Received by" by person id, show current name | `finance_report` | AUDIT-002 | S | finance SQL rename test |
| AUDIT-038 | Require a client on `record_payment` (at least for non-admins) | `record_payment` | AUDIT-002 | S | expect_error with null client |
| AUDIT-039 | Page Transactions ascending with a unique key, or take totals from `finance_report` | `payments.ts` | — | S | mocked insert between pages |
| AUDIT-040 | Pin `created_by`/`created_at` on expenses; refuse VOID → ACTIVE | expenses grants/trigger | AUDIT-002 | S | expenses SQL test |
| AUDIT-041 | Knowledge "Selected people" must keep at least one valid viewer | `save_knowledge_item` | AUDIT-002 | S | knowledge SQL test |
| AUDIT-042 | CI: lint + SQL tests as a gate, split staging/prod jobs, Node 22 | `.github/workflows/deploy-pages.yml` | — | S | broken Staging build does not block prod deploy |
| AUDIT-043 | staff-admin: authorize in the DB before sending the invite; map non-auth errors to 500 | `supabase/functions/staff-admin/index.ts` | — | S | Admin inviting an Owner sends no email |
| AUDIT-044 | Don't obfuscate chunks the admin imports; lazy-load heavy pages | `vite.config.ts` | — | S | smaller admin gz size |
| AUDIT-045 | Page the Schedule month query past 1,000 rows | `schedule.ts` | — | S | mock month with 1,001 appointments |
| AUDIT-046 | Lightweight error reporting (client errors RPC or Sentry) | `src/admin` | Calvin's choice | M | test error appears in the sink |
| AUDIT-047 | `noindex` and `Disallow: /staging/` on the staging build | `vite.config.ts`, `public/robots.txt` | — | S | staging HTML has noindex |

## Required regression tests (only what the fixes need)

1. Restore rehearsal with reconciliation (AUDIT-001).
2. SQL: delete user with appointments → LPREF (AUDIT-003).
3. SQL: stale resize and stale dialog save keep other bookings (AUDIT-004); following-edit keeps per-date changes (AUDIT-012); client changes on series (AUDIT-013); client double-booking warning (AUDIT-014); booking PII column access (AUDIT-015).
4. Screen: fake clock across LA midnight on Record payment and Dashboard (AUDIT-005); Dashboard month = Reports month (AUDIT-006).
5. SQL: date floor (AUDIT-009); staff visibility, if decided (AUDIT-010); course list save cannot delete registered courses (AUDIT-011); unconfirmed existing login (AUDIT-008).
6. After each wave: `run-local.sh`, `admin-shell.mjs`, build, lint, and the homepage before/after comparison.
