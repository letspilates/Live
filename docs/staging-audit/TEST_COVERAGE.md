# Test Coverage

Audit of Staging `af8a957` on 2026-10-13. Counts are scenarios, not findings: one finding can fail several scenarios, and several scenarios can share one finding.

**How to read the columns**
- **Tested (executed)** = actually run: on a throwaway local Postgres 16 with all 38 migrations, in Playwright against a local Staging build with mocked Supabase, or as a read-only request to the real Staging site/project. Tested = Passed + Failed.
- **Inspected only** = established by reading code or docs. These are not counted as passed tests.
- **Blocked** = could not be run safely. **Not tested** = out of reach (listed per section below).

## Coverage matrix

| Section | Tested (executed) | Passed | Failed | Blocked | Inspected only | Not tested |
|---|---:|---:|---:|---:|---:|---:|
| A. UI / Visual | 4 | 2 | 2 | 0 | 1 | 0 |
| B. UX / Workflows | 6 | 4 | 2 | 0 | 0 | 1 |
| C. Mobile / Tablet / Desktop | 7 | 3 | 4 | 0 | 0 | 1 |
| D. Routes / Navigation | 10 | 9 | 1 | 0 | 2 | 0 |
| E. Calendar / Scheduling | 21 | 15 | 6 | 1 | 6 | 0 |
| F. Database / Integrity | 13 | 7 | 6 | 1 | 3 | 0 |
| G. Auth / Permissions | 29 | 25 | 4 | 1 | 3 | 0 |
| H. Payments | 11 | 7 | 4 | 0 | 2 | 1 |
| I. Reports | 7 | 5 | 2 | 1 | 4 | 0 |
| J. Backup / Recovery | 5 | 3 | 2 | 0 | 4 | 2 |
| K. Background jobs | 1 | 1 | 0 | 0 | 4 | 0 |
| L. API / Integrations | 4 | 3 | 1 | 0 | 9 | 2 |
| M. Security / Config | 6 | 4 | 2 | 0 | 3 | 0 |
| N. Performance | 1 | 0 | 1 | 0 | 4 | 1 |
| O. Deployment / Readiness | 4 | 3 | 1 | 0 | 6 | 2 |
| **Total** | **129** | **91** | **38** | **4** | **51** | **10** |

## Critical end-to-end scenarios

The real Staging database holds production data (Jan–Oct payments, clients, the 2026 schedule), so no write was made there. Each chain below was executed on local copies: the screen half in Playwright against the built portal (mocked Supabase), the data half on local Postgres through the same RPCs the screens call.

| # | Chain | Where executed | Result |
|---|---|---|---|
| 1 | Sign in → role-gated pages → pick existing client → Record payment → day panel → Transactions → Reports month total → close month → refund lands in the open month | Playwright (mock) + local DB | Pass, except the payment date across LA midnight (AUDIT-005) and Dashboard month expenses (AUDIT-006) |
| 2 | Staff sign in → own same-day payments only → edit/void same day → blocked on past day and others' payments → no Transactions tab | Playwright (mock) + local DB | Pass in the UI; the database itself allows more than the UI shows (AUDIT-010) |
| 3 | Calendar → new appointment with client → drag (15-min snap) → Undo → resize → "this and following" → cancel → date circle | Playwright (mock) + local DB | Pass, except stale-save cancels (AUDIT-004) and series overwrites (AUDIT-012, AUDIT-013) |
| 4 | Recurring weekly series across DST (2026-03-08, 2026-11-01), device time zones LA / Seoul / New York / Kiritimati / UTC | local DB + node | Pass |
| 5 | Owner adds user → role + Admin access switches → staff sees menus → deactivate → blocked everywhere → delete | local DB + code (staff-admin) | Pass, except delete with appointments (AUDIT-003) and sign-up linking (AUDIT-008) |
| 6 | Clients merge → payments and bookings move → re-import matches kept row | local DB | Pass, edge cases in AUDIT-032 |
| 7 | Backup Everything (JSON) → restore into an empty project built from the migrations | local DB | Fail (AUDIT-001) |
| 8 | Public training form → course list → submit → admin sees applicant | local DB | Pass functionally; bot seat exhaustion (AUDIT-018) |
| 9 | Push to Staging → Pages deploy + Supabase migrations | staging-live (read-only) | Pass for af8a957 |

No payment provider, webhook, SMS or scheduled job exists, so none was tested.

## Existing suites re-used

| Suite | Result |
|---|---|
| `npm run build`, `npm run lint` | Pass |
| `supabase/tests/run-local.sh` (38 migrations, 12 SQL suites) | Pass |
| `pilates-landing/tests/admin-shell.mjs` (separate build) | 641 passed, 0 failed |
| `npm audit --omit=dev` | 0 vulnerabilities |

## Scenario detail by section

Method values: `local-exec`, `staging-live` and `node` are executed; `code-inspection` is not.

### A. UI / Visual

| Scenario | Method | Result |
|---|---|---|
| admin-shell.mjs full run on separate build (:4291) | local-exec | pass (641 ok / 0 FAIL) |
| Homepage main vs Staging: computed styles of 466 elements × 3 widths, pixel diff, page heights | local-exec | pass (unchanged; only ring/gradient alpha string 0.102→0.1, marquee phase) |
| Homepage content diffs (New Student→New Client, noCourses) / index.html / public | code-inspection | pass (content only; public/admin moved to /admin/legacy/, root index.html unchanged) |
| Clipped text / table cell spill / overlapping text on all routes | local-exec | pass, except the known Access-table label overlap (accepted 2026-10-11; at 375 "Notifications" overlaps the Owner ✓ by 17px) and calendar blocks (clipped by design) |
| Staging indicator on phones / login | local-exec | fail (AUDIT-022) |

### B. UX / Workflows

| Scenario | Method | Result |
|---|---|---|
| Double-submit with real double-click (slow server 1.5s): record_payment, staff-admin invite, save_appointment(new), add_student, expenses POST, record_refund | local-exec | pass (1 call each; buttons switch to "Saving…" and disable) |
| Two clicks within one JS task (non-human) | local-exec | 2 calls each, because the guards are state-based. record_payment and record_refund reuse one `p_client_request_id`, so the server dedupes. Appointment and expense would duplicate. Not reachable by a human tap; noted only |
| Error states: students, appointments, schedule_instructors, payment_methods, day payments, search, transactions, finance_report, list_staff, expenses, knowledge, role_menu_access, current_staff, schedule_services, training_courses | local-exec | pass (alert shown) except the $0.00 / "No payments yet" cases (AUDIT-023) |
| Empty states: clients, appointments, day payments, expenses, knowledge | local-exec | pass (clear empty text) |
| Loading state (students delayed 4s) | local-exec | pass (no false "No clients" shown while loading; no skeleton either) |
| Owner payment date after LA midnight / Dashboard rollover | local-exec | fail (AUDIT-005) |
| Workflows on a real iPhone/iPad (Calvin to do; on his open list) | — | not tested |

### C. Mobile / Tablet / Desktop

| Scenario | Method | Result |
|---|---|---|
| Horizontal page overflow on all admin routes 375/768/1440 (EN) and 375/768 (KR) | local-exec | pass |
| Horizontal overflow / truncation at 900/1024/1100/1180/1280/1366 (Dashboard, Payments + all routes at 1024/1180) | local-exec | fail at 1024–1180 (AUDIT-021) |
| Truncated money values | local-exec | fail (AUDIT-021; 375 dashboard notes cut too) |
| 17 dialogs at 375 (Clients add/edit, Staff add, Schedule new/edit, Staff schedule new, Trainings course, Knowledge add, Expense add, Payment detail/refund/edit (instructor), Users add/edit, Close month, Service edit, Add category): fits width, X top-right in view (44×44), Escape closes, no inner overflow, bottom reachable | local-exec | pass |
| Touch targets < 32px on key controls (375) | local-exec | fail, minor (AUDIT-026) |
| Schedule header at 768/800/820/1024 | local-exec | fail at 768 only (AUDIT-024) |
| KR language at 375/768 (overflow, clipping) | local-exec | pass |
| Real iOS Safari rendering (emulated widths only) | — | not tested |

### D. Routes / Navigation

| Scenario | Method | Result |
|---|---|---|
| Every route × Owner/Staff/Instructor × 375/768/1440: correct page or redirect, no page errors | local-exec | pass (180 loads, 0 page errors) |
| Invalid route inside the app (/bogus/, /clients/extra/, /Users/), signed in and signed out | local-exec | pass (→ dashboard / login) |
| Invalid route on GitHub Pages | code-inspection | fail, minor (AUDIT-025) |
| Direct URL to owner-only routes (9 incl. reports?tab=closing) as Staff and Instructor; Instructor → schedule (not granted) | local-exec | pass (redirect to dashboard; no owner-data requests fired) |
| Back button after forbidden redirect | local-exec | pass (returns to previous page, no loop) |
| Signed-out deep links → login?next= | local-exec | pass (the `?tab=` query is not kept, cosmetic) |
| Already signed in → /login/ | local-exec | pass (→ dashboard) |
| Refresh on deep link with query (payments?tab=history) | local-exec | pass |
| Staff payments?tab=history (Transactions owner-only) | local-exec | pass (no tab; record view) |
| Production /admin/ before prod Supabase is wired shows "not connected" (legacy moved to /admin/legacy/) | code-inspection | known cutover step (docs/admin/PRODUCTION-CUTOVER-KO.md), not filed |
| Real Staging deep links: /staging/admin/payments → 301 → /payments/; /schedule/, /backup/ 200 | staging-live | pass |
| Real Staging unknown admin path /staging/admin/nonexistent | staging-live | fail: GitHub 404 (AUDIT-025) |

### E. Calendar / Scheduling

| Scenario | Method | Result |
|---|---|---|
| DST start 2026-03-08 / end 2026-11-01: single appointments (17:00Z / 18:00Z) | local-exec (suite) | pass |
| Weekly series crossing Nov 1 keeps 09:00 wall clock | local-exec (suite + p2) | pass |
| Series crossing Mar 8 with session TimeZone=Asia/Seoul; save 'following' time change keeps wall clock | local-exec (p9) | pass |
| move 'following' +1h across Nov 1 (10:00 stays 10:00) | local-exec (p2) | pass |
| Nonexistent wall time 02:30 on 2026-03-08 → stored 03:30 PDT; UI laInstant maps it to 01:30 instead (studio closed, grid starts 6am) | local-exec | pass (note only) |
| UI laWall/laInstant round trip every 15 min of 2026 under device TZ LA/Seoul/NY/Kiritimati/UTC | local-exec (node) | pass (only the 4 nonexistent DST-gap slots differ) |
| weekStart (Sunday), next/prev month, monthCells 2025-2028, month boundaries | local-exec (node) | pass |
| laToday / now line use LA, not device date | code-inspection + node | pass |
| Month view loads only in-month days (leading/trailing cells are greyed and empty by design) | code-inspection | pass |
| Repeat count / until (≤366d) / never (52w), every N weeks, no-weekday rejection | local-exec (suite) | pass |
| Edit 'following': only this and later dates, no duplicates/losses, earlier untouched | local-exec (suite + p2) | pass (but AUDIT-012 overwrite) |
| 'following' overwrites per-date exceptions | local-exec (p2) | fail AUDIT-012 |
| 'following' client add/remove | local-exec (suite) | fail AUDIT-013 |
| Move 'one' marks series_changed; Undo restores time + old flag (incl. already-changed date, across DST) | local-exec (suite + p4) | pass |
| Undo offered only for scope one / non-series resize | code-inspection | pass |
| Resize/dialog with stale client list | local-exec (p1) | fail AUDIT-004 |
| Cancel one / following; bookings kept; never deleted | local-exec (suite) | pass |
| Cancelled appointment editable, no un-cancel | local-exec (p4) | fail AUDIT-031 |
| Capacity: over-capacity insert, lowering capacity below bookings, same client twice in one appointment | local-exec (suite) | pass |
| Capacity under concurrent adds (edit path locks row FOR UPDATE) | code-inspection | pass |
| Same client double-booked at same time / exact duplicate appointment | local-exec (p3) | fail AUDIT-014 |
| Instructor overlap allowed side by side, warning on drag | code-inspection | pass (per Calvin) |
| Import: same CSV twice (0 new), dry run = commit counts, chunks keep same-start rows together | local-exec (suite + p7) + code-inspection | pass |
| Import after portal move of an imported booking | local-exec (p7) | pass (duplicate) |
| Import of re-exported CSV with rescheduled booking | local-exec (p7) | fail AUDIT-017 |
| Import: Schedulista status column (cancelled rows) handling | blocked (no sample CSV) | blocked |
| Late cancel / No-show statuses and fold into date circle | code-inspection | pass (copy AUDIT-034, capacity AUDIT-033) |
| MinutesInput clamps 5-720, step 5 | code-inspection | pass |

### F. Database / Integrity

| Scenario | Method | Result |
|---|---|---|
| Delete service used by appointments (name kept as text, no FK) | local-exec (p5 + suite) | pass |
| Delete category with services blocked (23503) | local-exec (p5) | pass |
| Service rename relabels only its instructors' appointments (regression of 357-row bug) | local-exec (suite) | pass |
| Delete instructor with appointments | local-exec (p8) | fail AUDIT-003 |
| Clients merge moves bookings | local-exec (suite + p5) | pass (edge AUDIT-032) |
| Closed month: expense insert / void / description / created_at edits | local-exec | pass (LPCLS); mark-paid allowed by design (snapshot expenses_paid then differs from live; snapshot never shown in UI) |
| Closed month: client merge path | local-exec | blocked by LPCLS (AUDIT-032) |
| Client merge: payments moved, nothing deleted, bookings moved, repeat merge refused | local-exec | pass |
| Client merge: duplicate booking left on hidden row; no unmerge; revive merged row then pay | local-exec | fail (AUDIT-032, P3) |
| FK orphan: user delete with appointments | local-exec | fail (AUDIT-003) |
| FK orphan: training course delete with registrants; whole-list save | local-exec | fail (AUDIT-011) |
| FK: payments/expenses/students.created_by → staff (RESTRICT, delete refused with LPREF) | code-inspection + existing test | pass |
| Unique/check: payment amount, method_other, card-number notes, refund link, void consistency, period month day=1, expense rule+month unique | code-inspection | pass |
| Multi-step RPC atomicity (record/correct/void/refund/close/merge/merge_duplicate subtransactions) | code-inspection | pass (single transaction each; merge groups in subtransactions) |
| Expenses direct writes (created_by spoof, un-void) | local-exec | weak (AUDIT-040, P3) |
| supabase/tests/run-local.sh: 38 migrations + all 12 SQL suites | local-exec | pass |
| Row counts and orphan scan on real Staging | staging-live | blocked: same reason |

### G. Auth / Permissions

| Scenario | Method | Result |
|---|---|---|
| Login with next=clients/payments, next=users as Staff, next=https://evil, //evil, login, set-password | local-exec | pass (open redirects blocked) |
| Sign out → Back | local-exec | pass (history replaced; no data reachable) |
| Expired session (refresh token rejected) | local-exec | pass (→ login?next=…, "session ended" notice) |
| Inactive staff / no staff profile deep link | local-exec | pass (account card + sign out) |
| /set-password/ signed out | local-exec | pass ("open the link from your email") |
| /set-password/ signed in without email link | local-exec | by design: password can be changed without the current one, same as My account (Supabase updateUser). Not filed |
| Times stored as timestamptz; LA conversion by explicit zone on server (studio_time, at time zone) | code-inspection + local-exec | pass |
| Permissions: Owner/Admin full; Staff (schedule on) calendar yes, settings/import no | local-exec (suite + p6) | pass |
| Staff with schedule off; Instructor off (default); inactive staff; signed-in user without profile; anon | local-exec (p6) | pass (all denied, 0 rows) |
| Instructor with schedule on can edit/cancel/reassign others' appointments | local-exec (p6) | design gap AUDIT-016 |
| Booking PII visible to schedule users without Clients access | local-exec (p6) | fail AUDIT-015 |
| No direct table writes (insert/update via REST) | local-exec (suite) | pass |
| app.studio_time not callable by authenticated | local-exec (p4 hit 42501) | pass |
| Anon: table privileges on every public table (all 7 privilege types) | local-exec | pass (none) |
| Anon: executable functions in public/app | local-exec | pass (only public_training_courses, submit_training_registration) |
| Anon: nextval on audit_logs_id_seq (USAGE granted by default privileges) | local-exec | allowed in SQL, not reachable through PostgREST; hygiene note only |
| Authenticated: every SECURITY DEFINER RPC checks the caller | local-exec (catalog scan) + existing phase8 test | pass |
| Owner/Admin form date across LA midnight | code-inspection | fail (AUDIT-005) |
| Admin → own OWNER role (update_staff_user, set_staff_role, add_staff_account) | local-exec | pass (42501) |
| Admin edits/deactivates/cancels/re-invites an Owner | local-exec | pass (42501) |
| Admin promotes staff to ADMIN; deletes non-owner | local-exec | allowed (by design) |
| Last-owner protection (self-demotion) | local-exec | pass (23514) |
| Self escalation: direct UPDATE staff_profiles, update_my_profile with roles/status keys, role_menu_access insert, audit_logs insert, app.grant_owner | local-exec | pass |
| Staff reads own notes / others' profiles | local-exec | pass (column denied / 1 row) |
| Deactivated user: app.me RPCs, add_student, schedule, students/knowledge/methods/access tables, profile edit, current_staff reactivation | local-exec | pass |
| staff-admin edge function: caller check, owner guards via DB, compensation on failed link, ban after DB status | code-inspection | pass, except pre-registration link (AUDIT-008, suspected) |
| Knowledge private files: SELECTED item file hidden from non-viewers; instructor delete/update/upload of objects | local-exec | pass |
| Knowledge SELECTED with unknown viewer ids | local-exec | fail (AUDIT-041, P3) |
| Knowledge upload/delete cleanup (orphan file on failure) | code-inspection | pass (removes file on failed save; orphan only if storage delete fails, admin-visible) |
| Anon (publishable key) request to all 19 public tables on real Staging | staging-live | pass (401 on every table) |
| PostgREST schema root with publishable key on real Staging | staging-live | pass (refused, secret key required) |
| Real Staging Auth settings (GET /auth/v1/settings) | staging-live | fail: sign-ups ON, confirmation ON (AUDIT-008) |
| Signed-in read-only role checks against real Staging data | staging-live | blocked: the session safety policy refused reads of real client tables; test Owner login lives in another thread |

### H. Payments

| Scenario | Method | Result |
|---|---|---|
| Anon: storage.objects, audit_logs, payment_methods, role_menu_access, training_courses | local-exec | pass (0 rows / denied) |
| Staff reads others' payments (table) | local-exec | pass (0) |
| Staff sees any-date own payments / other recorders' amounts via client_payments, search_students | local-exec | fail (AUDIT-010) |
| Staff edits others' or past-day payments; staff changes date; staff back-dates (even "today" explicitly) | local-exec + existing tests | pass |
| Back-dating into a closed month (record, edit date in, edit date out) | local-exec | pass (LPCLS) |
| Void with live refund; void twice; edit a voided payment or refund | local-exec | pass |
| Refund 0 / negative / > remaining / refund of a refund / OTHER without text / unknown method | local-exec | pass |
| Fractional cents via RPC ('10.5'), > $20,000 cap, zero amount | local-exec | pass (22P02 / 23514) |
| Refund dated before its payment | local-exec | fail (AUDIT-036) |
| Payment dated in year 0026 | local-exec | fail (AUDIT-009) |
| Concurrent refund vs correct (locks) | code-inspection (+ existing review test) | pass |
| record_payment idempotency (same request id) | code-inspection + existing test | pass |
| Client-less payment through the API | local-exec | still accepted (AUDIT-038, P3) |
| Payment provider, webhooks, card charges (not implemented: payments are recorded by hand) | — | not tested |

### I. Reports

| Scenario | Method | Result |
|---|---|---|
| Staff moves "received by" to the owner on own payment | local-exec | allowed (by design) |
| LA boundary: 23:30 LA on Sep 30 → business_date 2026-09-30 (UTC would be Oct 1) | local-exec | pass |
| Report net = Σ valid payments − Σ valid refunds per month (prev/this month incl. last-day and 1st-day payments) | local-exec | pass |
| Refund of a closed-month payment lands in the current month, closed month unchanged; snapshot = live report | local-exec | pass |
| Close current/future month refused; Admin can reopen | local-exec | pass |
| Dashboard month KPIs = Reports month | local-exec | fail (AUDIT-006) |
| Frontend date math uses LA time (laToday, thisMonth, rangeDates, Backup day) | code-inspection | pass |
| Report "Received by" grouping after rename | local-exec | fail (AUDIT-037, P3) |
| Payments history paging (>1000 rows) | code-inspection | risk (AUDIT-039, P3) |
| CSV formula injection: toCsv used by Reports, Expenses, Backup (clients + payments); prefixes = + - @ TAB CR; numbers left numeric | code-inspection | pass |
| Payment paging order unique (loadPayments, Backup readAll, Members) | code-inspection | pass (unique tiebreak), see AUDIT-039 |
| Report totals vs real Staging payment rows (Jan–Oct) | staging-live | blocked: same reason; verified on local data instead |

### J. Backup / Recovery

| Scenario | Method | Result |
|---|---|---|
| Backup TABLES vs every `create table` in migrations (17 = 20 created − audit_logs − staff_profiles − dropped trash) | code-inspection + local-exec | pass |
| Backup sort columns exist and end in a unique key | local-exec | pass |
| Backup pages past 1,000 rows (`range` loop) | code-inspection | pass |
| Owner can `select *` every Backup table under RLS; staff via list_staff + schedule_instructors (notes, calendar_color covered) | local-exec | pass |
| Backup includes audit_logs / Knowledge storage files | code-inspection | fail (AUDIT-001) |
| Restore or import path for the JSON into a new project | code-inspection + local-exec | fail (AUDIT-001) |
| Staff ids survive into prod (auth.users FK) | local-exec | fail (AUDIT-001) |
| Automated backups of the DB holding real data | code-inspection (docs) | fail (AUDIT-002) |
| Backup CSV formula-injection guard (`toCsv`) | code-inspection | pass |
| Restore into a scratch Supabase project (no project exists; destructive on Staging) | — | not tested |
| Supabase plan tier and backup list (dashboard only) | — | not tested |

### K. Background jobs

| Scenario | Method | Result |
|---|---|---|
| Text delay setting saved only; no SMS sent | code-inspection | pass (not implemented by design) |
| pg_cron / pg_net / scheduled workflows / scheduled edge functions | code-inspection | none implemented (as expected) |
| Triggers present: audit on 12 tables, enforce_open_period (payments), enforce_open_expense_month, staff role sync | local-exec | pass |
| Recurring expenses generated lazily by owner page loads (Dashboard/Expenses/Reports), not a job | code-inspection | pass (design) |
| "Text after a change" delay stored only; UI says nothing is sent until Twilio | code-inspection | pass |

### L. API / Integrations

| Scenario | Method | Result |
|---|---|---|
| staff-admin caller auth (anon → permission denied → 401; non-staff → null roles → 403; inactive → 403) | local-exec + code-inspection | pass |
| staff-admin owner protection (DB guard_owner_change / delete_staff_user) | code-inspection | pass |
| staff-admin input validation (email regex, name ≤80, pw ≥8, redirect allowlist) | code-inspection | pass |
| staff-admin order of side effects (invite before authz) | code-inspection | fail P3 (AUDIT-043) |
| staff-admin CORS (allowlist echo, Vary: Origin) | code-inspection | pass |
| staff-admin linking of a pre-existing login | code-inspection | fail P2 (AUDIT-008) |
| Training form length limits (CHECK constraints) | code-inspection | pass |
| Training form spam limits / seat exhaustion by anon | local-exec | fail P2 (AUDIT-018) |
| Knowledge embeds (YouTube id validated, Vimeo/Drive hosts fixed to https, DB `^https?://` check, CSP frame-src allowlist) | code-inspection | pass |
| Knowledge storage policies (anon 0, stranger 0, non-selected instructor 0, owner 1; private bucket, 50MB limit) | local-exec | pass |
| Mindbody Healcode widget (constant innerHTML, third-party script) | code-inspection | pass functionally; security see AUDIT-019 |
| Apps Script path (doPost abuse, ADMIN_KEY fail-closed, ADMIN_KEY not in repo or history) | code-inspection | fail P2 (AUDIT-020) / pass for secrets |
| staff-admin preflight from a foreign origin on real Staging | staging-live | pass (allow-origin is https://letspilatesla.com only) |
| Deployed Apps Script version (repo copy only) | — | not tested |
| Invite email delivery (Custom SMTP not confirmed) | — | not tested |

### M. Security / Config

| Scenario | Method | Result |
|---|---|---|
| Secrets in repo, git history, dist (sb_secret, service_role, JWTs, keys, ADMIN_KEY) | local-exec grep | pass (only the publishable key; example key strings in old doc comments) |
| main build target (production empty → HAS_SUPABASE false → "/admin not connected", form → Sheet) | local-exec (headless on dist) | pass |
| Staging vs prod separation (BASE_URL /staging/ → staging project; separate localStorage keys and course caches) | code-inspection | pass |
| Security headers / CSP (admin meta CSP only; no frame-ancestors; homepage none) | local-exec | fail P2 (AUDIT-019) |
| XSS sinks (no dangerouslySetInnerHTML; one constant innerHTML; legacy admin escapes applicant fields) | code-inspection | pass |
| Console disabled by obfuscator in the admin | local-exec | pass (console is native) |
| /staging/ indexability | code-inspection | fail P3 (AUDIT-047) |
| npm audit --omit=dev | local-exec | pass (0 vulnerabilities) |
| Response headers on https://letspilatesla.com/staging/admin/ | staging-live | fail: HSTS only, no CSP / frame headers (AUDIT-019) |

### N. Performance

| Scenario | Method | Result |
|---|---|---|
| Paging — clients (Members), payments (loadPayments), Backup | code-inspection | pass |
| Paging — appointments month view | code-inspection | latent P3 (AUDIT-045) |
| Paging — enrollments, knowledge, expenses (per month), RPCs (limit 10) | code-inspection | pass (small or limited) |
| N+1 request patterns | code-inspection | pass (none found; imports chunked 500) |
| Bundle size | local-exec | P3 (AUDIT-044) |
| Load testing (not justified at ~800 clients and ~300 appointments a month) | — | not tested |

### O. Deployment / Readiness

| Scenario | Method | Result |
|---|---|---|
| All 38 migrations apply from zero, in order, on a fresh DB with stubs | local-exec | pass |
| Seed migration on fresh prod (inserts 5 courses, E upcoming; duplicates if data copied) | local-exec | risk folded into AUDIT-001 |
| supabase/config.toml (verify_jwt=false for staff-admin; auth in dashboard) | code-inspection | pass |
| Edge function secrets (auto-provided SUPABASE_URL plus new or legacy keys) | code-inspection | pass |
| Cutover checklist completeness and order | code-inspection | fail P2 (AUDIT-007) |
| Rollback (revert PR → form back to Sheet; DB data stays) | code-inspection | pass, with caveat: no plan for where payments go after a rollback |
| CI gates / env coupling | code-inspection | fail P3 (AUDIT-042) |
| Monitoring / error logging | code-inspection | not implemented (AUDIT-046) |
| npm ci, npm run build, npm run lint on af8a957 | local-exec | pass |
| Staging deploy of af8a957 (Actions run 38330444104 build + deploy; Supabase Preview check) and site last-modified 01:06Z | staging-live | pass |
| Production Supabase project (not created yet) | — | not tested |
| Cutover dry run | — | not tested |
