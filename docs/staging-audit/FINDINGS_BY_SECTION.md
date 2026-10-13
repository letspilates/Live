# Findings by Section

Audit of Staging `af8a957` on 2026-10-13. IDs are ranked by risk (AUDIT-001 is the highest). Status: Confirmed = reproduced by execution or certain from code; Suspected = mechanism clear, impact depends on settings or policy; Blocked = could not be checked safely.

Evidence types: `local-exec` = run on a throwaway local Postgres 16 with all 38 migrations, or Playwright against a local build with mocked Supabase; `staging-live` = read-only request to the real Staging site or project, including a signed-in Owner session from Calvin's test login (every write request was blocked in the browser); `code-inspection` = read from source. No record on real Staging was created, changed or deleted. Probe scripts stayed in the audit session's scratch area and are not committed. All names in evidence are invented test data.

## A. UI / Visual Consistency

Homepage is unchanged versus production main (computed styles of 466 elements at 375/768/1440). Portal is consistent; issues are a missing Staging marker on phones and small copy/i18n gaps.

Findings here: AUDIT-022 (P2), AUDIT-027 (P3), AUDIT-029 (P3).

### AUDIT-022 Staging portal cannot be told apart from production on phones and on the sign-in screen
- Section: A UI / Visual Consistency
- Severity: P2
- Status: Confirmed (UI). The impact is Suspected.
- Evidence type: local-exec + code-inspection
- Module / file:line: `src/admin/Layout.tsx:190-194` (the Staging badge is `hidden … sm:inline`, so it is not shown below 640px). `src/admin/pages/Login.tsx` and `ui.tsx CenteredCard` have no staging indicator. `admin/index.html:8` uses the same `<title>` on both builds.
- Repro steps: open https://letspilatesla.com/staging/admin/ on an iPhone (375–430px). iOS Safari shows only the domain in the address bar.
- Expected / Actual:
  - Expected: a visible "Staging" marker anywhere the user can enter data.
  - Actual: at 375 there is no marker on any page (see the `shots/*-375-*.png` headers). The sign-in screen has no marker at any width.
  - The marker shows at 768+ only.
- Evidence: the shots at 375 have no badge, and `OWNER-768-schedule.png` shows the "Staging" badge.
- Business impact: staff and Calvin used Staging on phones for real data before cutover (the Jan–Sep payments were imported into Staging). After go-live, a home-screen bookmark to `/staging/admin/` keeps working and looks identical. Payments recorded there go to the staging DB and are missing from production, so production money is wrong.
- Root cause: the badge is hidden on small screens, and the title and icon are identical.
- Recommended fix:
  - Content-only, no layout change: on staging builds prefix `document.title` with "STAGING ·". Also add the existing badge text to the sign-in card (or show the existing badge at all widths, which needs Calvin's OK).
  - After cutover, consider disabling Staging writes for non-test accounts.
- Verification approach: screenshot at 375 and the Login page on the staging build, then check that the marker is visible and the title is prefixed.
- Live check (real Staging, signed in as Owner, read-only, 2026-10-13): confirmed on the real portal: no Staging marker on any page at 375px, and none on the sign-in page at any width (page title is the same as production's).

### AUDIT-027 Clients source-chip counts ignore the Active/Inactive filter
- Section: A UI / Visual Consistency
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec + code-inspection
- Module / file:line: `pages/Members.tsx:106-110`. `counts` is computed over all members, while the list applies the status and search filters (`:95-97`).
- Repro steps: open Clients (the default filter is Active) with 1 inactive client.
- Expected / Actual: "All 4", matching "4 clients". Actually it shows "All 5" and "Added here 2", while the list shows 4 clients with 1 "Added here".
- Evidence: `shots/OWNER-375-clients.png`.
- Business impact: confusing counts.
- Root cause: counts are not derived from the status-filtered set.
- Recommended fix: compute counts after the status filter. This is text only.
- Verification approach: mock with 1 inactive client and check that the chip count equals the list count.

### AUDIT-029 Schedule save and drag errors show raw English database text (also in KR)
- Section: A UI / Visual Consistency
- Severity: P3
- Status: Confirmed
- Evidence type: code-inspection
- Module / file:line:
  - `pages/Schedule.tsx:1284` (`if (e) setError(e.message)`), `:395` and `:419` (move/length return `error.message`).
  - `ScheduleSettings.tsx:71,82`, `Enrollments.tsx:185,204,224` and `Members.tsx:132` interpolate `error.message`.
- Repro steps: in KR, save an appointment that the DB rejects (e.g. "Class is full.").
- Expected / Actual: a Korean message is expected. Actually the English `raise exception` text from `schedule_calendar.sql` is shown (e.g. "Class is full.", "Schedule is turned off for your role.").
- Evidence: `grep "raise exception" supabase/migrations/*schedule*.sql` gives English-only strings.
- Business impact: KR staff see English errors. Low impact.
- Recommended fix: map known messages and codes to i18n keys (as DailyIncome `errorText` does) and fall back to `somethingWrong`.
- Verification approach: mock save_appointment with a 400 `{message:'Class is full.'}` in KR and check that the Korean text is shown.
- Root cause: not recorded separately (P3; the title and evidence cover it)

## B. UX / User Workflows

Double-submit guards hold on every money and create action. Main defect: the Owner/Admin payment date goes stale across LA midnight (filed under H as AUDIT-005). Error states sometimes show $0.00.

Findings here: AUDIT-023 (P3), AUDIT-028 (P3).

### AUDIT-023 Load errors show "$0.00" totals and "No payments yet" instead of an error
- Section: B UX / User Workflows
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line:
  - `DailyIncome.tsx:626-628` (DayPayments Stat cards render `totals(rows ?? [])` even when `failed`) and `:847-851` (Transactions, same).
  - `DailyIncome.tsx:451` (ClientHistory ignores `error` and renders `noPaymentsYet`).
  - `Members.tsx:383-389` (the client dialog's payment list ignores `error`).
  - The DayPayments error has no Try-again button (`:634-637`).
- Repro steps: make `payment_transactions` GET return 500, then open Payments as Staff and as Owner on the Transactions tab. Make `client_payments` return 500 and pick a client. Make `payment_transactions` return 500 and open a client in Clients.
- Expected / Actual:
  - Expected: an error message with no numbers, or a retry.
  - Actual: "My total $0.00 / Number of payments 0" appears next to "Could not load payments. Try again." (with no button). Transactions shows "Net revenue $0.00 / Refunds $0.00 / 0" above the error.
  - The Record-payment client history and the Clients dialog show "No payments yet" for a client who has paid.
- Evidence: `shots-states/payments_day_list_error.png`, `payments_history_error.png`, `payments_client_history_error.png`, `clients_member_payments_error.png`. Log: `STATE payments client history error: … Payment history No payments yet`.
- Business impact: on a flaky connection, staff can believe a client never paid or that today's total is $0. That is misleading, but transient.
- Root cause: totals are computed from an empty array on failure, and the error flag is not checked in 2 places.
- Recommended fix: hide or replace the Stat values with "—" when `failed`. Check `error` in ClientHistory and Members and show the existing `incomeLoadFailed` Notice. No design change.
- Verification approach: rerun `ONLY_D='error' partD.mjs`.

### AUDIT-028 Staff Dashboard card is titled "Transactions" but "View all" lands on Record payment
- Section: B UX / User Workflows
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec + code-inspection
- Module / file:line: `pages/Dashboard.tsx:272-276`. For non-owners the title is `t('tabTransactions')` and the button goes to `payments?tab=history`. `DailyIncome.tsx:54-56` ignores `tab=history` for non-owners.
- Repro steps: sign in as Staff, then tap Dashboard › Transactions › View all.
- Expected / Actual: a list of my transactions. Actually it opens the Record tab with the day panel (correct by policy, but the card promises a "Transactions" view that staff do not have).
- Evidence: matrix `STAFF … /payments/?tab=history -> h1="Payments"` with no tablist (`shots/STAFF-375-payments__tab_history.png`).
- Business impact: minor confusion.
- Recommended fix: for staff, use the existing `myDayPayments`/"My payments today" text and link to `payments` without the tab. This is a copy-only change.
- Verification approach: a screen check of the staff dashboard title and the link target.
- Root cause: not recorded separately (P3; the title and evidence cover it)

## C. Mobile / Tablet / Desktop

No sideways scroll at 375/768/1440 on any admin route; all 17 dialogs fit at 375. Money figures are cut off at 1024–1180px (iPad landscape).

Findings here: AUDIT-021 (P2), AUDIT-024 (P3), AUDIT-026 (P3), AUDIT-030 (P3).

### AUDIT-021 Money figures cut off and sideways scroll at 1024–1180px (iPad landscape / small laptop)
- Section: C Mobile / Tablet / Desktop
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: `src/admin/pages/Dashboard.tsx:203` (`lg:grid-cols-4`) and `:228`/`:151`/`:176` (`truncate` on amounts and notes); `src/admin/pages/DailyIncome.tsx:116` (`lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]`), `:627-628` (Stat)
- Repro steps: sign in as Owner (or Staff for Payments) at a 1024×900 viewport with the sidebar expanded (the default). Open the Dashboard, then open Payments.
- Expected / Actual:
  - Expected: the full amounts are readable and there is no sideways scroll.
  - Actual on the Owner Dashboard, the KPI amounts read "$19,80…", "$8,000.…" and "$11,80…". The notes "2 payments · Refund…" and "Expenses ($3,000.0…" are cut too. This persists up to about 1100px.
  - Actual on Payments (Record tab, Owner and Staff), the right-hand "My payments / Payments · day" card is squeezed to about 150px. "My total" reads "$…" and the card runs 4px off-screen (`scrollWidth 1028 > 1024`). This also happens on Staff `payments/?tab=history`.
- Evidence: `matrix-1024.json`: `dl>div>dd>span "$19,800.00" 153>131`, `section>dl>div>dd "$230.00" 96>45`, offenders `main#main>div>aside>section right=1028`. Screenshots: `shots-1024/OWNER-1024-dashboard.png`, `shots-1024/STAFF-1024-payments.png`, `shots-states/midnight-owner-record.png`. At 1280/1366 and below 1024 it is fine.
- Business impact: on the front-desk iPad in landscape, the owner cannot read this month's revenue, expenses or profit, and staff cannot read their day total next to the payment form.
- Root cause: the `lg` breakpoint (1024) switches to a 4-column KPI strip and a 2-column Payments layout while the 240px sidebar is also showing. That leaves about 130–150px per cell, and the amounts use `truncate`.
- Recommended fix (design-locked, so get Calvin's OK first): the smallest change is to apply the 4-column KPI grid and the Payments 2-column layout from `xl:` instead of `lg:`. The layout above 1280 stays exactly as now. An alternative is to drop `truncate` on the amount spans only.
- Verification approach: rerun `partA1024.mjs` (widths 1024 and 1180). Expect `truncMoney=0` and `overflow=no`.
- Live check (real Staging, signed in as Owner, read-only, 2026-10-13): reproduced on the real portal at 1024px: the Dashboard has a cut-off money figure and Payments scrolls sideways (1025 > 1024). Fine at 375, 768 and 1440.

### AUDIT-024 Schedule settings button half cut off at 768px (iPad mini portrait)
- Section: C Mobile / Tablet / Desktop
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: `src/admin/pages/Schedule.tsx:505` (week title `md:whitespace-nowrap md:text-2xl`), `:514-521` (gear button). The card is `overflow-hidden`.
- Repro steps: Owner at 768px, open Schedule in Week view.
- Expected / Actual: the gear is fully visible. Actually the header grid is 671px wide inside a 648px card, so the gear spans 723–767 but is clipped at 744 and about half of it is hidden. It fits at 800 and wider.
- Evidence: `partS` output `gear {left:723,right:767} gearClip ["SECTION.hidden sw=671 cw=648 r=744"]`; `shots/OWNER-768-schedule.png`.
- Business impact: a cosmetic glitch with a half-size tap target. Settings is also in the menu.
- Root cause: the non-wrapping 24px week title ("October 11–17, 2026") plus the prev/next buttons and gear exceed the card width at exactly md.
- Recommended fix (needs Calvin's OK): use `lg:whitespace-nowrap` instead of `md:`, or the short title up to `lg`.
- Verification approach: rerun `partS.mjs`. Expect gear right ≤ card right.

### AUDIT-026 Small touch targets on phones
- Section: C Mobile / Tablet / Desktop
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec (measured at 375)
- Module / file:line:
  - `pages/Access.tsx:63`: the permission checkboxes are `h-5 w-5` (20×20) with no wrapping label. The setting saves immediately on tap.
  - `pages/Schedule.tsx:1087`: "Show N cancelled" is 28×28.
  - `ScheduleSettings` color swatches are 26×26.
  - `Dashboard.tsx:274-280`: "View all" and "Reports" links are 20px tall.
- Repro steps: measure at 375 (`matrix.json` `small[]`).
- Expected / Actual: about 44px (or at least 32px) for primary controls. Actual sizes are 20–28px.
- Evidence: `/access/ | input[checkbox] "Staff: Clients" 20x20 @ O375,O768,O1440`; `"Show 2 cancelled" 28x28`; `color swatch 26x26`.
- Business impact: a mis-tap on Access silently grants or revokes a menu for a whole role. That is reversible, and a "Saved" notice is shown.
- Root cause: control size.
- Recommended fix (needs Calvin's OK): add padding or a hit-area wrapper with no visual change (e.g. a 44px transparent `label` around each checkbox).
- Verification approach: rerun `partA` at 375 and confirm none of these appear in `small[]`.

### AUDIT-030 (pre-existing on production, not a Staging regression) Homepage scrolls sideways by 8px at 375px
- Section: C Mobile / Tablet / Desktop
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: the decorative `div.float-slow.pointer-events-none.absolute.-right-6.-top-6.h-28` (right edge 383px). It is identical on main and Staging.
- Repro steps: open the homepage at 375px and check `document.documentElement.scrollWidth`. It is 383.
- Expected / Actual: 375 expected, 383 actual, so the page wiggles sideways on iPhone.
- Evidence: `homeov.mjs`: main `{"sw":383,…"DIV.float-slow … right=383"}`, Staging the same.
- Business impact: minor and cosmetic, and it already exists on production.
- Recommended fix: only with Calvin's approval (design lock). For example, `overflow-x: clip` on that section's wrapper. Do not change it as part of the cutover.
- Verification approach: scrollWidth equals 375 on both branches.
- Root cause: not recorded separately (P3; the title and evidence cover it)

## D. Pages / Routes / Navigation

All routes, role gates, deep links, login redirects and expired sessions behave correctly (180 route loads). Mistyped admin URLs hit GitHub's 404.

Findings here: AUDIT-025 (P3).

### AUDIT-025 Mistyped or unknown admin URL shows GitHub's generic 404, not the portal
- Section: D Pages / Routes / Navigation
- Severity: P3
- Status: Confirmed (live: https://letspilatesla.com/staging/admin/nonexistent returns GitHub 404, checked 2026-10-13)
- Evidence type: code-inspection + local-exec
- Module / file:line: `vite.config.ts:57-63` writes an index.html only for `ADMIN_ROUTES` keys. There is no `404.html` in `public/` or `dist/` on either branch.
- Repro steps: open `/staging/admin/payment/` (typo) or `/staging/admin/clients/123/`.
- Expected / Actual: the portal should open and redirect to the Dashboard, which `App.tsx:62` does (verified by serving the admin page at unknown paths: `OWNER unknown /bogus/ -> /`, `signed-out unknown -> /login/`). On GitHub Pages, though, the request never reaches the app and GitHub's default 404 page is shown. Locally, vite preview falls back to the homepage.
- Evidence: `ls dist-stg` shows no 404.html. `runE.log` lines 1–4 PASS.
- Business impact: a dead end for staff following an old or typo'd link. Low impact.
- Root cause: GitHub Pages has no SPA fallback and the build has no 404.html.
- Recommended fix: emit a `404.html` that redirects any `/admin/*` or `/staging/admin/*` path to the matching admin root (or copy admin/index.html as 404.html for the admin subtree). Make sure the homepage 404 stays as is.
- Verification approach: after deploy, curl `/staging/admin/xyz/` and check that the portal loads and redirects.

## E. Calendar / Booking / Scheduling

Time zone and DST handling, Undo, capacity and the permission matrix pass. Lost-update and recurring-series edits are the weak spots.

Findings here: AUDIT-004 (P1), AUDIT-012 (P2), AUDIT-013 (P2), AUDIT-014 (P2), AUDIT-017 (P2), AUDIT-031 (P3), AUDIT-033 (P3), AUDIT-034 (P3).

### AUDIT-004 A stale screen cancels bookings other users added (lost update on clients)
- Section: E Calendar / Booking / Scheduling
- Severity: P1
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: pages/Schedule.tsx:376-389 (`saveLength` sends `a.clients` from the last calendar load), :1237 and :1311 (dialog sends `f.clients` taken from the loaded appointment); 20261012221000_guest_instructors.sql:216-219 (any non-cancelled booking whose id is not in the list is set CANCELLED)
- Repro steps: user A has the week open (group class with Client One). User B adds Client Two and saves. User A, without reloading, drags the bottom edge to change the length (or opens the dialog that was loaded before and saves any change).
- Expected / Actual: Expected: Client Two stays booked (A only changed the length). Actual: Client Two's booking becomes CANCELLED with no message. The same thing reverts statuses B set (e.g., ATTENDED back to BOOKED) and notes.
- Evidence (p1.sql): `after B adds | Client One BOOKED | Client Two BOOKED` → `after A resizes (stale) | Client One BOOKED | Client Two CANCELLED`.
- Business impact: a client is silently taken out of a class or private. They show up and aren't on the list, and the instructor is never told. This is likely with a front desk plus instructors, because the calendar never refreshes by itself (it reloads only after the user's own actions).
- Root cause: the write API treats the client list as a full replacement ("left out = cancelled"), and the client sends whatever list it loaded last. There is no version check (updated_at) and no add/remove delta.
- Recommended fix: (a) for resize/move-only saves, add a flag like `keep_clients: true` (or a separate `set_appointment_length` RPC) that leaves bookings alone; (b) for dialog saves, send the `updated_at` that was loaded and refuse with "Changed by someone else, reload" when it differs; or send explicit `cancel_ids` instead of cancel-by-omission.
- Verification approach: rerun p1.sql: the stale resize must keep Client Two BOOKED (or be refused); add a schedule.test.sql case.

### AUDIT-012 "This and following" edits overwrite per-date changes (substitute instructor, service, capacity) on later dates
- Section: E Calendar / Booking / Scheduling
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: 20261012221000_guest_instructors.sql:203-213 (following update sets minutes, staff_id, guest_instructor, service and capacity on every later BOOKED date); Schedule.tsx:376-389 (a length drag with "This and following" sends this date's staff/service/capacity)
- Repro steps: weekly Tue 09:00 Private with Ivy, 6 dates. Date 4: substitute Jo, "This appointment only" (marked changed). Then on date 2, drag the bottom edge to 60 min and pick "This and following".
- Expected / Actual: Expected: only the length changes on dates 2-6, and date 4 keeps Jo. Actual: date 4 is back to Ivy (still shows the "changed" icon), and every later date also takes date 2's service and capacity.
- Evidence (p2.sql): before `4 | 2026-11-10 09:00 | Jo Lee | 50 | t`; after `4 | 2026-11-10 09:00 | Ivy Kim | 60 | t`.
- Business impact: a substitution or a one-off service change that was already arranged is quietly undone, so the wrong instructor is shown or expected. Any field edit with "following" resets all fields on the later dates.
- Root cause: the 'following' branch copies the whole payload instead of only the fields that changed.
- Recommended fix: for 'following', apply only the fields that differ from this date's old values (compare with `v`), and leave fields alone on dates where `series_changed` is true; or ask first ("N later dates have their own changes: overwrite?").
- Verification approach: rerun p2.sql; expect date 4 to stay Jo Lee with minutes 60.

### AUDIT-013 "This and following" does not apply client adds/removes to later dates (UI doesn't say so)
- Section: E Calendar / Booking / Scheduling
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec (existing suite: schedule.test.sql:186-199 asserts this behavior) + code-inspection
- Module / file:line: 20261012221000_guest_instructors.sql:216-225 (`v_book := array[v_id]`; cancels only on this row); Schedule.tsx:1704-1708 (Scope radio "This and following" sits right under the client list, with no hint)
- Repro steps: open a weekly private, remove the client (or add a second one), choose "This and following", Save.
- Expected / Actual: Expected (from the wording): the client is removed from (or added to) this and all later dates. Actual: only this date changes; every later date keeps the old client BOOKED.
- Evidence: test `save following: clients only on this date` passes, so date 4 still has c1 BOOKED after c1 was removed with 'following' on date 3.
- Business impact: a client who quits a standing weekly slot stays booked on every future date, and a client added "to the series" is booked once. This is easy to miss because the save succeeds.
- Root cause: deliberate server design ("Clients change on this row only") that the UI doesn't communicate.
- Recommended fix: either apply client adds/cancels to the later BOOKED dates of the series when scope = following (same capacity check), or show a line under the scope radio: "Client changes apply to this date only."
- Verification approach: SQL test with 'following' + removed client → later dates CANCELLED (if implemented), or a screen test for the hint.

### AUDIT-014 Same client can be double-booked at the same time, silently (also exact duplicate appointments)
- Section: E Calendar / Booking / Scheduling
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: save_appointment (20261012221000:228-240) only blocks the same client twice in the *same* appointment (`appointment_clients_once`, 20261012160000:73); Schedule.tsx:444-457 `clash()` warns only about the *instructor*, and only in the drag/resize dialog, never in the New/Edit dialog.
- Repro steps: as Staff, save Private 10:00 Ivy + Client One; save Private 10:00 Jo + Client One; save Private 10:00 Ivy + Client One again.
- Expected / Actual: Expected: at least a warning that the client is already booked at that time (Calvin allows side-by-side overlaps for instructors/rooms, not one person in two places). Actual: all three saves succeed with no warning, so the client has 3 BOOKED rows at 10:00, two of them identical.
- Evidence (p3.sql): `first_ok t`, `second_same_time_same_client_ok t`, `exact_duplicate_ok t`, `bookings_for_client_at_10 = 3`.
- Business impact: duplicate holds use up instructor slots and seats. Two front-desk users booking the same request (or a repeat series made over existing bookings) produce duplicates nobody sees. No money is involved, since appointments aren't charged.
- Root cause: no check for a client clash on the server or in the UI.
- Recommended fix: before saving, have the server return the clashing bookings for the chosen clients (or add a `schedule_client_clashes` RPC) and show a warning with "Book anyway", the same pattern as `calClash`. Optionally refuse an exact duplicate (same staff, start and client).
- Verification approach: rerun p3.sql; expect a warning path (or an error for the exact duplicate) and check in a screen test that the dialog shows it.
- Live check (real Staging, signed in as Owner, read-only, 2026-10-13): the real schedule already has 35 pairs of overlapping bookings for the same client (mostly from the Schedulista import). Some may be legitimate; nothing warned about them.

### AUDIT-017 Re-importing a newer Schedulista export duplicates rescheduled bookings (old time stays BOOKED)
- Section: E Calendar / Booking / Scheduling
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: 20261012213000_service_rename_by_instructor.sql:126-161 (`import_schedule` key = 'SCHEDULISTA|<start>|<service>|<name>|<phone>'; rows are never updated or cancelled)
- Repro steps: import one booking at 10:00; import a fresh export where Schedulista moved it to 10:30.
- Expected / Actual: Expected (if Schedulista stays in use until cutover and is re-imported): the booking moves, or the dry run flags it. Actual: a second appointment at 10:30 is created and the 10:00 one stays BOOKED. Cancellations made in Schedulista are never reflected either. Re-importing the *same* file is safe: 0 new, all duplicates; a booking moved in the portal is also still treated as a duplicate (pass).
- Evidence (p7.sql): `same_csv_again {"duplicates":1,"importable":0}`; `rescheduled_export {"importable":1,"appointments_new":1}`; client has BOOKED at 10:30 and 11:00 (portal-moved copy).
- Business impact: if the studio re-imports to catch up before cutover, rescheduled or cancelled Schedulista bookings become double bookings on the new calendar.
- Root cause: append-only import keyed on start time.
- Recommended fix: treat the import as a one-time cutover (say so in the Settings hint and the dry-run summary: "already-imported rows are never updated; changes made in Schedulista after the first import are not picked up"), or have the dry run report CSV bookings for the same client and date at a different time than an existing imported booking.
- Verification approach: rerun p7.sql against the change.

### AUDIT-031 Cancelled appointments can still be edited and get new BOOKED clients; there is no way to un-cancel
- Section: E Calendar / Booking / Scheduling
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: Schedule.tsx:1740-1752 (the footer for a cancelled appointment shows "Cancelled" but Save stays enabled, and the scope radio is shown); save_appointment does not check `v.status` (20261012221000:198-214)
- Repro steps: cancel an appointment, open it from the date circle, change the time and add a client, Save.
- Expected / Actual: Expected: read-only, or a "Restore" action. Actual: it saves; the client is BOOKED inside a CANCELLED appointment. With "This and following" chosen, the later *booked* dates also shift. A mistaken cancel (one date or a whole series) can't be undone, and Cancel has no toast Undo.
- Evidence (p4.sql): `cancelled appt edited | CANCELLED | 2026-10-22 12:00 | Client Two | BOOKED`.
- Business impact: confusing state, and a mis-click on "Cancel this and following" means re-creating the series by hand.
- Recommended fix: disable edits for cancelled appointments (server: refuse when `v.status = 'CANCELLED'`), and add a restore (un-cancel) RPC or an Undo toast after cancel.
- Verification approach: SQL test that saving a cancelled appointment raises an error; screen test for the disabled Save.
- Root cause: not recorded separately (P3; the title and evidence cover it)

### AUDIT-033 Late cancel / no-show still occupy a seat
- Section: E Calendar / Booking / Scheduling
- Severity: P3
- Status: Suspected (depends on studio policy)
- Evidence type: code-inspection
- Module / file:line: 20261012221000_guest_instructors.sql:235-240 (capacity counts every booking with `status <> 'CANCELLED'`)
- Repro steps: in a full 5/5 group, mark one client Late cancel and try to add a replacement.
- Expected / Actual: in Schedulista, a late cancel usually frees the spot (a fee may apply). Here the save is refused with "Class is full" unless capacity is raised.
- Recommended fix: confirm the policy with Calvin; if spots should free up, exclude LATE_CANCEL from the count.
- Verification approach: SQL test with a full class + late cancel + add.
- Business impact: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)

### AUDIT-034 Cancel prompt text is out of date (cancelled appointments now fold away)
- Section: E Calendar / Booking / Scheduling
- Severity: P3
- Status: Confirmed
- Evidence type: code-inspection
- Module / file:line: src/admin/i18n.ts:599 `calCancelAsk` "It stays on the calendar, striped…", :601 `calLateHint` "…keep it on the calendar, striped" (KR :1426, :1428); since 6a7d665, every striped appointment is hidden behind the date circle (Schedule.tsx:181-184)
- Recommended fix: content-only change: "It moves into the circle next to the date…".
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- Business impact: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)
- Verification approach: not recorded separately (P3; the title and evidence cover it)

## F. Database / Data Integrity

All 38 migrations apply from zero and every SQL suite passes. Two referential gaps: user delete nulls appointments, and the course list save hard-deletes courses.

Findings here: AUDIT-003 (P1), AUDIT-011 (P2), AUDIT-032 (P3), AUDIT-035 (P3), AUDIT-040 (P3).

### AUDIT-003 Deleting a user who has appointments silently removes the instructor from all of them
- Section: F Database / Data Integrity
- Severity: P1
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: supabase/migrations/20261012160000_schedule_calendar.sql:41 (`staff_id … on delete set null`), :48 (`created_by … on delete set null`); delete guard in 20261010230000_user_roles_permissions.sql:229-249 (`delete_staff_user` relies on a foreign_key_violation to refuse "anyone with records")
- Repro steps: as Owner, have instructor Jo own 2 appointments (1 imported from Schedulista, 1 made in the portal) and no payment/expense rows → `select public.delete_staff_user('<Jo>')` (what Settings › Users › Delete calls through the staff-admin edge function before deleting the sign-in).
- Expected / Actual: Expected: refused with "This person has records in the studio books. Deactivate them instead." (that is the point of the guard). Actual: the delete succeeds and every appointment of that instructor gets `staff_id = NULL` (and `created_by = NULL`).
- Evidence (p8.sql): `before | jo_appts 2 | no_staff 0` → `after deleting Jo | jo_appts 0 | no_staff 2 | jo_profile 0`. FK list: `appointments_staff_id_fkey confdeltype n`, `appointments_created_by_fkey n`, every other FK to staff_profiles is `r`.
- Business impact: an instructor's whole teaching history (the 2026 Schedulista import, ~3,600 bookings) turns into "Other" studio events with no instructor; instructor pay/attendance history is lost. The sign-in is deleted too, so it can't be undone from the UI (only by hand from audit_logs).
- Root cause: the schedule FKs were made `on delete set null`, which bypasses the "has records → deactivate instead" guard that depends on FK violations.
- Recommended fix: change both FKs to `on delete restrict` (no action) in a new migration, so delete_staff_user refuses and points to Deactivate. Do not use cascade.
- Verification approach: rerun p8.sql: expect SQLSTATE LPREF and appointments unchanged; add a case to schedule.test.sql.
- Also affected: `schedule_services.staff_ids` (uuid[] with no FK) keeps the deleted id. Found independently by the DB and Schedule passes.
- Live check (real Staging, signed in as Owner, read-only, 2026-10-13): one instructor with 159 appointments has no payment, client, expense or other record pointing at them, so Users › Delete would succeed today and strip all 159 appointments. A second instructor (76 appointments) is protected only because other records reference them.

### AUDIT-011 Training courses are saved as a whole list: a stale tab hard-deletes courses and leaves registrants with dangling course ids
- Section: F Database / Data Integrity
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec + code-inspection
- Module / file:line: save_training_courses (20261012030000:29 `delete from public.training_courses where id not in (<ids sent>)`). TrainingCourses.tsx:208 sends the whole in-memory list on every toggle or save. training_registrations.course_ids is a uuid[] with no FK (20261010155554:34).
- Repro steps: Admin A opens Trainings › Courses. Owner B adds course X in another browser (or a sign-up arrives for X). A flips any "show on site" switch, which sends A's stale list. Locally: add a manual registrant to course 1, then call save_training_courses with all courses except course 1.
- Expected / Actual: Expected only A's change to be saved, and a course with registrants never hard-deleted. Actual: course X or course 1 is deleted. The registrant keeps a course id that no longer exists, so it drops out of the course's seat counts and filters.
- Evidence: `T1 add manual registrant OK`, `T2 save courses without first course | OK: 4`, `T3 registrant course_ids dangling | OK: 1`
- Business impact: a lost course and a broken applicant-to-course link from a routine switch flip. Recovery is from the audit log only.
- Root cause: last-writer-wins full replace with deletes, and an array column with no referential integrity.
- Recommended fix: per-course save/delete RPCs (or send the ids the client knew plus updated_at and refuse a stale write). Refuse deleting a course that has registrants, or archive it instead (active=false).
- Verification approach: SQL test: saving a list without a course that has registrants raises an error. Screen test with two sessions.

### AUDIT-032 Client merge: duplicate person left in a shared class, blocked by closed months, no undo, merged row can be revived and paid
- Section: F Database / Data Integrity
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: app.merge_client (latest: 20261012160000:117), public.merge_clients (20261012111500), app.enforce_open_period (20261010181500), update_member (20261010193000), record_payment checks only `status = 'ACTIVE'`.
- Repro steps / Actual:
  1. Close last month. Merge client c1 (has a last-month payment) into c2: `ERR LPCLS That month is closed.` Merging the other way works. If both clients have closed-month payments, they cannot be merged without reopening months (Jan–Sep 2026 imports make this common after closing). This is documented in the migration comment.
  2. Both clients booked in the same class: after the merge the drop row keeps its booking, so the roster lists the person twice and uses 2 seats (`M7 2/1`, `M8 Client One … | Client Two … BOOKED`).
  3. No unmerge RPC (`M10 0`). Reversal means hand-reading audit_logs.
  4. `update_member(merged_row, …, 'ACTIVE')` succeeds and `record_payment` to that row then succeeds (`M14-M16 OK`). The payment goes to a client that the Clients screen hides (Members.tsx:29 filters merged_into is null). This path is API-only today.
- Payments moved correctly (`M6 2/0`). Nothing is deleted. A repeat merge or keeping a merged row is refused (`M12/M13 P0002`).
- Business impact: owner friction after closing, a confusing roster, and payments that could be orphaned on a hidden client (API path only).
- Root cause: the closed-month trigger blocks every UPDATE, including a student_id-only one. Bookings that collide are skipped instead of cancelled. There is no merged_into guard.
- Recommended fix: let enforce_open_period allow updates that change only student_id or payer fields. Cancel the colliding duplicate booking during the merge. Make update_member and record_payment refuse rows with merged_into set. Optionally add an unmerge RPC or document the manual steps.
- Verification approach: members.test.sql cases for each item above.
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- The shared-class duplicate was reproduced independently in the Schedule pass (p5.sql: both rows BOOKED, class shows the person twice).

### AUDIT-035 Schedule services/categories have no audit trail; delete is a hard delete
- Section: F Database / Data Integrity
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: 20261012230000_remove_trash.sql:248-267; no trigger on schedule_services/schedule_categories (p5.sql: `audit on schedule_services? 0`)
- Business impact: a deleted service's price, description and instructor list are gone with no record of who deleted it. Appointments are not affected: they keep the service name as text (no FK), and a category with services can't be deleted (23503). Both verified.
- Recommended fix: add `app.audit_row_change` triggers to both tables.
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)
- Verification approach: not recorded separately (P3; the title and evidence cover it)

### AUDIT-040 Owners/Admins write expenses directly (RLS FOR ALL): bookkeeping fields can be set freely and a VOID can be reverted
- Section: F Database / Data Integrity
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: 20261010200000 `grant select, insert, update on expenses, recurring_expense_rules` with policy `for all using (is_owner())`.
- Evidence: `E16 expense created_by spoof insert | OK: <staff id>`. Direct UPDATE of status VOID→ACTIVE is allowed in open months, and created_at can be rewritten. Closed months stay locked (`E10-E12 LPCLS`) and DELETE is denied (`E13`).
- Business impact: weaker integrity than payments (which are RPC-only). The audit log still records the real actor.
- Recommended fix: column grants (exclude created_by, created_at, recurring_rule_id), or a trigger that pins them and refuses VOID→ACTIVE.
- Verification approach: expenses.test.sql.
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)

## G. Authentication / Users / Permissions

Anon is locked out (verified live on real Staging), Owner sign-in works on the real portal, owners are protected from admins, no self-escalation, deactivated users blocked. Gaps are data visibility beyond the stated rules and the open sign-up setting.

Findings here: AUDIT-008 (P2), AUDIT-010 (P2), AUDIT-015 (P2), AUDIT-016 (P2), AUDIT-041 (P3).

### AUDIT-008 Public sign-up is still on, and Add user links any existing login with that email as ACTIVE
- Section: G Authentication / Users / Permissions
- Severity: P2
- Status: Suspected (Staging Auth settings checked live 2026-10-13: sign-ups ON, email confirmation ON; prod project not created yet)
- Evidence type: code-inspection
- Module / file:line: `supabase/functions/staff-admin/index.ts:94-107`; `supabase/migrations/20261010230000_user_roles_permissions.sql` (`add_staff_user`: `select id from auth.users where lower(email)=…`, with no `email_confirmed_at` check, and status set to `'ACTIVE'` when the login already existed); `docs/admin/SETUP-KO.md:26`; `PRODUCTION-CUTOVER-KO.md` step 3 (no sign-up item)
- Repro steps: With sign-ups on in prod, an outsider signs up as `newhire@…` with their own password. Later the owner adds that person in Settings › Users with "set password now". `createUser` returns `email_exists`, `add_staff_user` links the outsider's login as ACTIVE with the roles chosen, and the password the owner typed is dropped. The UI says "Their existing password is unchanged".
- Expected / Actual: Expected only logins the owner created or invited to become staff. Actually any pre-registered login is adopted. If "Confirm email" is off, the outsider then signs in with full staff or owner access.
- Evidence: `const existed = createError?.code === 'email_exists'` → `p_invited: action === 'invite' && !existed` → profile status ACTIVE.
- Business impact: Takeover of a staff or admin account in prod, with access to client PII and payments, if both dashboard settings are left in the unsafe state.
- Root cause: The "link existing login" convenience together with an open-sign-up default that the prod checklist never closes.
- Recommended fix: Add "turn off sign-ups" and "keep Confirm email on" to the cutover checklist. In `add_staff_user`, link an existing login only when `email_confirmed_at is not null` (or never auto-link with status ACTIVE: set INVITED and force a password reset).
- Verification approach: In the local DB, insert an `auth.users` row with `email_confirmed_at = null` and expect `add_staff_user` to refuse it. Check the prod Auth settings after cutover.
- Live evidence (real Staging, read-only `GET /auth/v1/settings`): `disable_signup=false`, `mailer_autoconfirm=false`. With confirmation ON, the outsider cannot sign in until a confirmation email to the real address is clicked; if the new hire clicks that "confirm your signup" mail, the outsider's password becomes valid. Severity becomes P1 if prod is created with confirmation OFF.

### AUDIT-010 Staff/Instructor payment visibility is enforced only by the UI: own payments of any date, plus any client's recent payments recorded by anyone
- Section: G Authentication / Users / Permissions
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: RLS payment_transactions_select (20261010230000, `auth.uid() in (recorded_by, collected_by) and app.can('payments')`, no date filter). public.client_payments(p_student_id) (20261010210000) returns any client's last 10 rows (date, kind, status, amount, method) whoever recorded them. public.search_students('') returns the 8 most recent payers studio-wide with last amount and method.
- Repro steps: as STAFF, (a) `select count(*) from payment_transactions` returns every own payment of every date. (b) Owner records $99 CREDIT for client X. Staff calls `client_payments(X)` and `search_students('client')`.
- Expected / Actual: Expected (per the stated rule) staff to see only their own same-day payments. Actual: (a) own history of any date. (b) `2100/ZELLE,9900/CREDIT`: the owner's payment amount and method are visible. Client ids for every client come from the students table (Clients menu) or search, so a staff member can script a read of the last 10 payments of every client.
- Evidence: `P5 staff reads own count | OK: 3`, `P9 staff sees owner payment of c2 via client_payments | OK: 2100/ZELLE,9900/CREDIT`, `P10 ... search_students | Client Two:2100:ZELLE`, `P11 staff direct table sees owner payment? | OK: 0`
- Business impact: front-desk staff can rebuild most of the studio's client-level revenue history, which is broader than the "own same-day" rule. No payer notes are exposed through the RPCs.
- Root cause: the history panel and recent-payer list were designed for the payment screen, with no per-role limit. The same-day limit lives only in the React UI (the History tab is hidden).
- Recommended fix (owner decision): RLS for non-admins `and business_date = app.la_today()`. client_payments for non-admins returns only date and method, or only rows they recorded, or the last 1-3 rows. search_students for non-admins drops last_amount_cents from the short-query list.
- Verification approach: extend phase8.test.sql: staff sees 0 rows for a past own payment; client_payments by staff hides other recorders' amounts.

### AUDIT-015 Users with Schedule access get full client phone, email, notes and price (beyond the Clients permission)
- Section: G Authentication / Users / Permissions
- Severity: P2
- Status: Confirmed (known open item in daily-logs/2026-10-12.md: "anyone with Schedule access can see booked clients' phone numbers")
- Evidence type: local-exec
- Module / file:line: 20261012160000_schedule_calendar.sql:100-101 (appointment_clients select = `app.can('schedule')`, all columns); schedule.ts:106 loads `client_phone` for every booking (the UI shows only the last 4 digits)
- Repro steps: turn Clients off for STAFF (or Schedule on for INSTRUCTOR), sign in as that user, `select client_phone, client_email, notes, price_cents from appointment_clients`.
- Expected / Actual: Expected: someone without Clients access sees names and the last 4 digits at most, like `schedule_search_clients`. Actual: full phone, email, booking notes (injury notes) and price for every booking since 2026-01, ~3,600 rows.
- Evidence (p6.sql): `staff sched-on clients-off | students_rows 0 | booking_rows_with_phone 1`; `instr ON | sees_phone_notes (310) 555-0101 / injury note`.
- Business impact: client PII and health-related notes reachable through the API by every Schedule user, including Instructors if Calvin turns Schedule on.
- Root cause: table-level SELECT policy with no column restriction.
- Recommended fix: revoke column SELECT on client_phone/client_email/price_cents (and notes if wanted) from authenticated and expose them through a view or RPC gated by `app.can('clients')`. Load a `phone_last4` computed column for the calendar.
- Verification approach: rerun p6.sql: a Staff user with Clients off gets permission denied (or nulls) for those columns.

### AUDIT-016 With Schedule on, an Instructor can edit, reassign or cancel any colleague's appointment
- Section: G Authentication / Users / Permissions
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: save_appointment / move_appointment / cancel_appointment check only `app.can('schedule')` (20261012221000:144, 20261012160000:340, :368)
- Repro steps: `set_role_menu_access('INSTRUCTOR','schedule',true)`; as instructor Ivy, move/cancel Jo's private, or reassign it to herself while dropping its client.
- Expected / Actual: Calvin hasn't decided yet whether Instructors get Schedule (daily log, open item). If he turns it on, nothing limits instructors to their own sessions. Actual: all three calls return OK.
- Evidence (p6.sql): `instr ON | move_other OK | reassign_to_self_and_drop_client OK | cancel_other OK`; with Schedule off everything is 42501, and Settings/import are 42501 in both cases.
- Business impact: any instructor can quietly change a colleague's bookings; the only trace is audit_logs.
- Root cause: one menu switch, with no per-role write scope.
- Recommended fix: before turning Instructor Schedule on, decide: either instructors get read-only plus their own appointments (server check `staff_id = auth.uid()` when the caller lacks OWNER/ADMIN/STAFF), or this is accepted on purpose.
- Verification approach: a permission test row per role × (own, other's) appointment.

### AUDIT-041 Knowledge item set to "Selected people" with only unknown ids saves with zero viewers
- Section: G Authentication / Users / Permissions
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: save_knowledge_item (20261011030000) checks `cardinality(v_viewers) = 0` before filtering ids to existing staff.
- Evidence: `K2b SELECTED with unknown viewer id only | OK` creates an item no staff member can see.
- Recommended fix: count after the join and raise 22023 if no valid viewer remains.
- Verification approach: knowledge.test.sql expect_error.
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- Business impact: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)

## H. Payments / Financial Transactions

Amount, refund, void, idempotency and closed-month rules all hold. Date handling is the weak spot (midnight rollover, no lower bound, refund dated before its payment).

Findings here: AUDIT-005 (P1), AUDIT-009 (P2), AUDIT-036 (P3), AUDIT-038 (P3).

### AUDIT-005 Owner/Admin payment saved to the previous day (or month) when Payments stays open past LA midnight; Dashboard "Today" never rolls over
- Section: H Payments / Financial Transactions
- Severity: P1
- Status: Confirmed
- Evidence type: local-exec (Playwright fake clock)
- Module / file:line: `src/admin/pages/DailyIncome.tsx:158` (`const [day, setDay] = useState(laToday)`, set only on mount and on "Record another") and `:200` (`...(canPickDate && day !== laToday() ? { p_business_date: day } : {})`). Also `src/admin/pages/Dashboard.tsx:46-52`, an effect with deps `[owner, paymentsMenu]` only.
- Repro steps: as Owner, open Payments at 23:50 LA. Leave the page open past 00:00. Search for a client and save.
- Expected / Actual:
  - Expected: the payment is recorded today, as the date field and the day panel suggest.
  - Actual: the date field still shows yesterday and `record_payment` is sent with `p_business_date=<yesterday>`. The day panel has already moved to the new day, so the new payment does not appear there.
  - Actual on the Dashboard: it keeps yesterday's "Today" totals and date header until a reload, and no new request is made.
- Evidence: `MIDNIGHT: opened at LA 2026-10-12 23:50, date field=2026-10-12; LA now=2026-10-13; date field after midnight=2026-10-12; record_payment p_business_date=2026-10-12`. `MIDNIGHT2 /: header="Monday, October 12" new requests=0`. The Payments day panel did refetch for 2026-10-13.
- Business impact:
  - A front-desk tablet signed in as Owner/Admin and left on Record payment overnight books the morning's first payment to the wrong day. That gives wrong daily totals, and the payment can land in the previous month on the 1st (blocked only if that month is already closed).
  - The payment is also invisible in "today's" panel, which invites a re-entry and so a duplicate.
  - Staff/Instructor accounts are not affected, because the server sets the date for them.
- Root cause: the date state is initialised once. The DayPayments interval (60s) updates only its own `day`.
- Recommended fix:
  - Keep a "user changed the date" flag. If it is unset, compute `laToday()` at save time and do not send `p_business_date`. If you keep the field, refresh it on the same 60s tick when it still equals the old today.
  - On the Dashboard, use the same 60s LA-day tick as a dependency of the today effect.
  - Neither change touches the design.
- Verification approach: rerun `partM.mjs` and `partM2.mjs`. Expect `p_business_date` not sent (or today), and the Dashboard to refetch after midnight.
- Also found by code inspection in the DB pass (`DailyIncome.tsx:158,200,228`): the side panel rolls over every 60 s, the form date does not.

### AUDIT-009 No lower bound on payment/expense dates: a two-digit-year typo (0026-10-12) is accepted and the money drops out of every report
- Section: H Payments / Financial Transactions
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: record_payment and correct_payment (20261012040000:45, 20261012050000:52) only check `> app.la_today()`. payment_transactions.business_date and expenses.expense_date have no CHECK. DailyIncome.tsx:296/:1182 and Expenses.tsx:842 set `max` but no `min`. finance_report refuses ranges over 3700 days.
- Repro steps: as Owner, `record_payment(..., p_business_date => '0026-10-12')`. Typing "26" in the year segment of a Chrome date field produces year 0026.
- Expected / Actual: Expected the date to be refused. Actual: it is saved, and no Dashboard, Reports (year/month) or default Transactions range ever shows it. A report covering it fails with "Choose a date range."
- Evidence: `R6d backdate payment to year 0026 | OK: 0026-10-12` and `R6e finance_report('2016-01-01', today) -> ERR 22023 Choose a date range.`
- Business impact: received money is missing from totals and reconciliation with no visible trace except the raw backup.
- Root cause: dates are validated only against the future.
- Recommended fix: in the DB, refuse business_date or expense_date before a studio floor (e.g. 2020-01-01, or more than ~400 days back without a flag) in record_payment, correct_payment and expenses. Add a table CHECK as a backstop and `min` on the date inputs.
- Verification approach: SQL test that expects an error for '0026-10-12'. Screen test that types a 2-digit year.

### AUDIT-036 A refund's date can be edited to before its payment, or into an earlier open month
- Section: H Payments / Financial Transactions
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: correct_payment (20261012050000) validates only "not future". There is no check against the original payment's business_date.
- Repro steps: Owner records a $100 payment today and refunds $40. correct_payment(refund, p_business_date => today-40).
- Expected / Actual: Expected refused, because a refund cannot precede its payment. Actual: `R6c OK: 2026-09-02`. Last month's net drops by $40 while the payment stays this month.
- Business impact: an open prior month's revenue can be changed by a mis-dated refund edit.
- Recommended fix: for kind=REFUND require `business_date >= original.business_date`.
- Verification approach: payments.test.sql expect_error.
- Root cause: not recorded separately (P3; the title and evidence cover it)

### AUDIT-038 Client-less payments are still accepted by the server (re-check of the accepted choice)
- Section: H Payments / Financial Transactions
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: record_payment: `p_student_id null` falls back to free-text `p_payer_name` (default 'Walk-in'). The UI always sends a client (DailyIncome.tsx:189).
- Evidence: `P1 staff client-less payment | OK: =HYPERLINK("http://x")|null`. Any staff member with Payments access can do this through the API, with any payer text. CSV exports neutralise the formula (see Coverage).
- Business impact: rows that are not tied to a client are left out of client history and merges. Totals are still correct. Low risk.
- Recommended fix: if walk-ins are not a product feature, require p_student_id (at least for non-admins).
- Verification approach: expect_error when p_student_id is null.
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)

## I. Reports / Analytics

Report totals match payment rows with LA day boundaries, including 23:30 LA on the last day. On real Staging, Reports for each month Jan–Oct 2026 equal the sum of the real payment rows and Calvin's sheet totals (Jan $31,465 … Sep $38,675). The Dashboard's month expenses/profit disagree with Reports.

Findings here: AUDIT-006 (P2), AUDIT-037 (P3), AUDIT-039 (P3).

### AUDIT-006 Dashboard "this month" expenses and profit leave out expenses dated later in the month, so they disagree with Reports
- Section: I Reports / Analytics
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec + code-inspection
- Module / file:line: pilates-landing/src/admin/pages/Dashboard.tsx:109 (`loadReport(thisMonth(), day)` and `loadReport(addMonths(thisMonth(), -11), day)`). Compare Reports.tsx:211 (`[month, monthEnd(month)]`), the comment at Dashboard.tsx:100-101 ("so this month's rent is already counted") and finance.ts:1-3 ("dashboard, reports, closing and CSV always agree").
- Repro steps: as Owner, add a recurring rule (Rent $3,000, due_day 28, starting this month). Open the Dashboard on the 12th; it calls generate_recurring_expenses, then finance_report(1st, today).
- Expected / Actual: Expected the Dashboard "Operating expenses / Est. profit, this month" to match Reports for the same month ($3,000). Actual: Dashboard shows $0 expenses and profit overstated by $3,000. The current-month bar in the 12-month chart is also $0. Reports and Expenses show $3,000.
- Evidence: `E3 expense date 2026-10-28 | E4 finance_report(m0..today).expenses = 0 | E5 finance_report(m0..monthEnd).expenses = 300000 | E6 12-month chart current month row expenses = 0`
- Business impact: the owner's home screen overstates profit for most of every month whenever rent or salary is due after today. It contradicts the Reports page under the same "this month" label.
- Root cause: the Dashboard report range ends at today. Payments can't be future-dated, but expenses (including the recurring ones the Dashboard just generated) can.
- Recommended fix: request `loadReport(thisMonth(), monthEnd(thisMonth()))` for the KPI strip and use `monthEnd(thisMonth())` as the chart's `to`. Revenue is unchanged because no payment has a future date.
- Verification approach: add a DB/screen test with a recurring rule due after today, then check Dashboard expenses = Reports expenses for the current month.
- Live check (real Staging, signed in as Owner, read-only, 2026-10-13): the real data has no recurring rules and no expense dated after today, so the Dashboard matches Reports for October right now (expenses $7,970 both ways). The defect appears as soon as a rule or a later-dated expense exists, so severity was lowered from P1 to P2.

### AUDIT-037 Report "Received by" splits one person into two rows after a name change
- Section: I Reports / Analytics
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: finance_report by_collector `group by collected_by, collected_by_name` (20261010220000). The names are snapshots.
- Evidence: `R7c [{"name":"Owner One","gross":10000},{"name":"Owner Renamed","gross":500}]`
- Business impact: per-person totals in Reports and the CSV look split or wrong after a rename. Grand totals are unaffected.
- Recommended fix: group by collected_by only and take the current name from staff_profiles (falling back to the latest snapshot).
- Verification approach: finance.test.sql rename case.
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)

### AUDIT-039 Transactions history pages by offset, newest first: a payment saved during a >1000-row load is counted twice
- Section: I Reports / Analytics
- Severity: P3
- Status: Suspected (code-certain mechanism; needs >1000 rows in range)
- Evidence type: code-inspection
- Module / file:line: pilates-landing/src/admin/payments.ts:136-145 (`order('recorded_at', desc)`, `range(start, start+999)`).
- Repro steps: Owner loads a custom range with >1000 rows (e.g. a year) while staff save a payment between page 1 and page 2.
- Expected / Actual: Expected each row once. Actual: the new row goes in at offset 0 and shifts everything down, so the last row of page 1 is read again on page 2 and the History totals are inflated by that amount.
- Recommended fix: order ascending by (business_date, recorded_at, id) as Backup.tsx does, or use keyset paging. Better, take the totals from finance_report.
- Verification approach: unit test with a mocked insert between pages.
- Business impact: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)

## J. Backup / Recovery

The Backup page exports every table with paging, but nothing can restore it, and the only copy of the real ledger sits in the Staging project.

Findings here: AUDIT-001 (P0), AUDIT-002 (P1).

### AUDIT-001 Real data cannot yet be moved to production: Backup JSON has no restore path and the Staging→prod data copy has no tested method
- Section: J Backup / Recovery
- Severity: P0
- Status: Confirmed
- Evidence type: local-exec + code-inspection
- Module / file:line: `pilates-landing/src/admin/pages/Backup.tsx:19-37,78-95`; `docs/admin/PRODUCTION-CUTOVER-KO.md:37`; `daily-logs/2026-10-12.md:127` ("merges only after … the Staging data copy")
- Repro steps: (1) Fill the source DB through the real RPCs: 2 staff, client, payment, refund, payment in October, `close_period('2026-09-01')`, appointment and booking, expense. (2) As owner, export every `TABLES` entry with `select *`, which is what Backup does. (3) Apply all migrations to an empty DB, which is what the new prod project looks like. (4) Insert each table's JSON in Backup's `TABLES` order with `json_populate_recordset`.
- Expected / Actual: Expected a documented, tested way to load the backup (or the Staging data) into the prod project. Actually there is no importer anywhere (`grep restore|import.*json` finds nothing), and a hand restore fails on 11 of 17 tables:
  ```
  students: violates FK students_created_by_fkey            (staff_profiles/auth.users ids don't exist in prod)
  payment_transactions: violates FK ..._student_id_fkey
  payment_methods / schedule_settings / expense_categories / role_menu_access: duplicate key (migration-seeded rows)
  schedule_services / schedule_categories: duplicate key
  accounting_periods / appointments: FK to staff_profiles
  expenses: cannot insert a non-DEFAULT value into column "period_month"   (generated column)
  training_courses: ok  -> 10 rows, 5 distinct codes (seed migration ran in both DBs: public form shows duplicate courses)
  ```
  After creating matching auth users and staff ids by hand and inserting in `TABLES` order (accounting_periods before payment_transactions): `ERROR: That month is closed.` (trigger `app.enforce_open_period`).
- Evidence: the output above. FKs to `staff_profiles(user_id)` are on students, payment_transactions (recorded_by, voided_by, collected_by), accounting_periods, expenses, recurring rules, appointments, and knowledge. `staff_profiles.user_id` references `auth.users` ON DELETE RESTRICT. Backup leaves out `audit_logs` (the only edit/void history) and the files in the `knowledge` Storage bucket.
- Business impact: The real ledger exists only in the Staging project: Jan-Sep payments that were typed in by hand, about 800 clients including manual merges, about 2,960 appointments with 3,623 bookings, services, colors and expenses. Cutover step 6 only re-imports the Sheet, Mindbody and Schedulista CSVs. No payments CSV import exists, so the hand-entered Jan-Sep history (about $274K) and the manual merges cannot be rebuilt that way. Production would launch with an empty or partial ledger, or with an improvised SQL copy that breaks FKs and staff attribution. Staging test payments would come along too, and they can only be voided, never deleted.
- Root cause: Backup was built as an export only. Prod staff get new `auth.users` ids. Seed migrations collide with the copied rows. The `TABLES` order ignores the FK order and the closed-period trigger.
- Recommended fix: Choose and document one copy method before the cutover PR merges. Option A: `pg_dump --data-only` of the public schema plus auth users with the same UUIDs (the Supabase admin createUser accepts `id`), done with triggers disabled in a maintenance window, or with closed months reopened and closed again. Option B: an owner-only `import_backup(jsonb)` RPC that remaps staff ids by email, skips or merges seed rows, leaves out generated columns, inserts in FK order and closes periods last. Copy Knowledge files separately. Decide whether staging test payments are excluded. Rehearse once on a scratch project and reconcile monthly totals against the Staging Reports.
- Verification approach: Restore the latest Backup JSON (or dump) into a scratch project. Compare per-table row counts and `finance_report` per month with Staging, and check that payments still show the correct recorded_by and collected_by.

### AUDIT-002 The only copy of real studio data sits in the Staging project, which gets every Staging push's migrations automatically and has no automated backups
- Section: J Backup / Recovery
- Severity: P1
- Status: Confirmed for the pipeline and data location. The Free plan tier comes from the master plan and was not checked in the dashboard.
- Evidence type: code-inspection (docs)
- Module / file:line: `docs/admin/SETUP-KO.md:37-47` (integration Production branch = `Staging`, auto-apply); `ADMIN-PORTAL-MASTER-PLAN.md:1140,1154` (R17 / O-4: "staging Free: no backups, pauses after 7 idle days"); `daily-logs/2026-10-12.md:15-22,38` (real payments, clients and appointments imported into the Staging DB); data-changing migrations `20261012060000/083000/101500_merge_duplicate_clients*.sql` and `20261012213000_service_rename_by_instructor.sql` already rewrote real rows on Staging.
- Repro steps: Read the docs listed above. Any `git push` to `Staging` that adds a migration runs it against that DB before anyone reviews the result on staging.
- Expected / Actual: Expected business data in a backed-up environment, with experimental migrations kept apart from it. Actually the "studio" staging project holds the real ledger, has no PITR or daily backup on Free, and serves as the CI target for unreviewed migrations. The only backup is a manual browser download (Backup page, AUDIT-001), with no schedule and no restore.
- Evidence: The 2026-10-12 log already records a migration (`service_rename_by_instructor`) written to repair 357 real appointments that an earlier change had relabelled.
- Business impact: One faulty migration or bad merge rule pushed to Staging can corrupt or merge real client, payment and appointment rows with nothing to restore from. The Google Sheets are only a partial source, because the uploaded CSVs were deleted.
- Root cause: The prod project does not exist yet, so the staging project became the de facto production DB.
- Recommended fix: Immediately, take a Backup JSON download (and ideally a `supabase db dump`) before every migration push, or upgrade the staging project to Pro for daily backups until cutover. Then finish the cutover (AUDIT-001/03) so real data moves to a Pro prod project and Staging goes back to test data.
- Verification approach: Confirm the plan tier and backup list in the Supabase dashboard (Database › Backups), and confirm that a dump exists from before the next migration push.
- Live check (real Staging, signed in as Owner, read-only, 2026-10-13): the Staging project holds 795 clients, 590 payments (Jan–Oct), 3,498 appointments, 4,185 bookings and 16,100 audit-log rows. The Backup page's Everything (JSON) export works on this data (4.4 MB, every table's row count equals the live count), but it is the only backup and it is manual.

## K. Background Jobs / Scheduled Logic

Nothing is scheduled: no pg_cron, scheduled functions or queues exist. Recurring expenses are generated when an owner opens a page. The SMS "text delay" setting is only stored and the screen says so. No findings.

Findings here: none.

## L. API / External Integrations

staff-admin checks the caller, protects owners, validates input and limits CORS (CORS verified live). The public training form can be filled by bots; the legacy Apps Script endpoint has no abuse limits.

Findings here: AUDIT-018 (P2), AUDIT-020 (P2), AUDIT-043 (P3).

### AUDIT-018 Anyone can fill every training course anonymously, so real applicants see "full"; the global limit also allows a sign-up DoS
- Section: L API / External Integrations
- Severity: P2
- Status: Confirmed
- Evidence type: local-exec
- Module / file:line: `supabase/migrations/20261012030000_training_held_seats_manual.sql` (`submit_training_registration`: 3 per email per day, 60 per hour globally, capacity counts every registration); `pilates-landing/src/components/TrainingForm.tsx:323-339`
- Repro steps: As role `anon` (publishable key, no login), call `submit_training_registration` 4 times for the open course E (capacity 4) with 4 throwaway emails, then once more with a "real" applicant.
- Expected / Actual: Expected some bot resistance (captcha or turnstile, a per-IP limit, or a pending status that doesn't hold a seat). Actually:
  ```
  after bots|E|4|4
  ERROR:  That course is full.
  ```
  In addition, 60 junk sign-ups in an hour block every real sign-up for that hour ("Sign-ups are busy right now").
- Evidence: the output above. Length limits are present and enforced by CHECK constraints (pass).
- Business impact: Once prod Supabase is wired, a competitor or bot can make every course ($700-$1,225 each) show as full on the homepage, or block sign-ups, until the owner notices and deletes the junk rows. Course capacities are 1-4 seats, so very few requests are needed.
- Root cause: Seats are taken at submit time by unauthenticated, unverified requests, and the only rate limits are per email and global.
- Recommended fix: Add a captcha (Supabase Auth captcha / Turnstile verified in an edge function) or route submits through an edge function with per-IP limits. Optionally don't count unconfirmed registrations toward capacity, or alert the owner when a course fills.
- Verification approach: Repeat the local probe after the fix: 5 anonymous submits from one client should be throttled, and the course should stay open.

### AUDIT-020 The live Apps Script form endpoint (current production path) relays branded emails to any address and writes unescaped values into the Sheet
- Section: L API / External Integrations
- Severity: P2
- Status: Suspected (code-inspection of the repo copy; the deployed script version may differ)
- Evidence type: code-inspection
- Module / file:line: `pilates-landing/apps-script/google-apps-script.js:124-180` (`doPost`: `sheet.appendRow([data.fullName, …])` with no length or format checks; `sendWelcomeEmail_(data)` to `data.email`); the endpoint URL is public in `TrainingForm.tsx:5-6` and `public/admin/legacy/index.html:253`
- Repro steps: POST `fullName=…&email=victim@x` to the `/exec` URL in a loop.
- Expected / Actual: Expected rate and length limits and no outbound mail to unverified addresses. Actually each POST appends a row and sends a "registration received" email from the studio Gmail to any address, with the attacker's text in the greeting (HTML-escaped). Values beginning with `=` are passed to `appendRow`, which Sheets evaluates as formulas.
- Evidence: `if (data.email && String(data.email).indexOf('@') > -1) { sendWelcomeEmail_(data); }`
- Business impact: Spam relay under the studio's name, Gmail quota exhaustion (real applicants then get no mail), and formula injection into the registration sheet the owner opens. This is the production path today and stays reachable after cutover until step 9 retires it.
- Root cause: The legacy endpoint was built without abuse controls.
- Recommended fix: Retire or undeploy the Apps Script web app right after cutover (make step 9 mandatory). Until then, add `LockService` and a CacheService counter, length caps, a leading-quote prefix on cells beginning with `=+-@`, and send the welcome email only for a known course id.
- Verification approach: After retiring it, the `/exec` URL returns an error. Until then, a POST with `fullName="=1+1"` should be stored as text.

### AUDIT-043 staff-admin sends the invitation email before the database authorizes the invite; error mapping is lossy
- Section: L API / External Integrations
- Severity: P3
- Status: Confirmed
- Evidence type: code-inspection
- Module / file:line: `supabase/functions/staff-admin/index.ts:94-112,64-65`
- Repro steps: Sign in as ADMIN and invite a new email with role OWNER.
- Expected / Actual: Expected the request to be refused with no email sent. Actually `inviteUserByEmail` sends first. Then `add_staff_user` → `guard_owner_change` refuses, the login is deleted, and the recipient holds a dead invite link. Separately, any error from `current_staff` (including a DB outage) is reported as 401 "session ended".
- Evidence: the order of lines 96-97 and 102. The rest passed (see Coverage): caller auth, owner protection (in the DB), input validation, redirect allowlist, CORS.
- Business impact: Minor confusion only. There is no privilege escalation.
- Recommended fix: Add a dry-run DB check (role guard) before creating or inviting, or create first and send the invite after the profile insert. Map errors other than 401/PGRST301 to 500.
- Verification approach: Mock the test: an ADMIN inviting an OWNER should produce no `inviteUserByEmail` call.
- Root cause: not recorded separately (P3; the title and evidence cover it)

## M. Security / Production Configuration

No secrets in the repo, history or build output; npm audit is clean. The admin session shares an origin with a third-party script and cannot send security headers on GitHub Pages.

Findings here: AUDIT-019 (P2), AUDIT-047 (P3).

### AUDIT-019 The admin session token shares an origin with an uncontrolled third-party script and with every /staging/ build; no anti-framing protection
- Section: M Security / Production Configuration
- Severity: P2
- Status: Confirmed (design). Exploitation would need the Mindbody CDN to be compromised or an XSS on the homepage.
- Evidence type: code-inspection + local-exec (headless run: the homepage has no CSP meta, the admin page does)
- Module / file:line: `pilates-landing/src/components/ScheduleSection.tsx:6,29-40` (injects `https://widgets.mindbodyonline.com/javascripts/healcode.js` on `/`); `src/admin/supabase.ts:48` (supabase-js default storage = `localStorage['sb-<ref>-auth-token']`); `vite.config.ts:8-21,47-52` (CSP only as a `<meta>` on `/admin/`); `.github/workflows/deploy-pages.yml:48-63` (staging served at `/staging/` on the same origin)
- Repro steps: Sign in at `/admin/`, then open `/`. Any script on the homepage, including healcode.js and whatever it loads, can read `localStorage` for `https://letspilatesla.com`, which includes the owner's refresh token.
- Expected / Actual: Expected the admin session to be isolated from third-party code. Actually the `/admin` CSP (`script-src 'self'`) protects only the admin document. The token is per-origin and readable from the uncontrolled homepage, from `/staging/` (built automatically from every push) and from `/admin/legacy/`. GitHub Pages cannot send headers, and `frame-ancestors` doesn't work in a meta tag, so `/admin` can be framed (clickjacking).
- Evidence: headless check gave `home {"csp":false}` and `admin {"csp":"meta-csp"}`.
- Business impact: A supply-chain or XSS problem on the marketing page escalates to an owner account takeover (all client PII, ability to void and edit payments).
- Root cause: The admin portal is hosted on the same origin as the marketing site, which uses a third-party widget.
- Recommended fix: Serve the portal from its own origin (e.g. `admin.letspilatesla.com` as a separate Pages or Cloudflare site), or put the site behind a proxy (e.g. Cloudflare) that sends CSP, `frame-ancestors 'none'` and HSTS headers. At minimum, add a homepage CSP meta limiting scripts to self plus `widgets.mindbodyonline.com`, and an anti-framing JS guard on `/admin`.
- Verification approach: Check that `document.domain` / origin differ between the portal and `/`, and that the response headers include `frame-ancestors`.

### AUDIT-047 /staging/ is public and indexable, and its working training form writes to the Staging DB
- Section: M Security / Production Configuration
- Severity: P3
- Status: Confirmed
- Evidence type: code-inspection
- Module / file:line: `public/robots.txt` (`Allow: /`), `index.html:17` (`index, follow`; the canonical points to `/`, which mitigates); `TrainingForm.tsx:323` (staging build → Supabase staging)
- Business impact: A real applicant who lands on `/staging/` registers into Staging, and no email is sent. The staging admin is currently the system that holds real data.
- Recommended fix: Have the staging build inject `noindex` (in the `transformIndexHtml` when base is /staging/) and add `Disallow: /staging/`.
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)
- Verification approach: not recorded separately (P3; the title and evidence cover it)

## N. Performance / Reliability

Lists that can exceed 1,000 rows page correctly except the Schedule month view (latent). Admin JS is about 325 KB gzipped.

Findings here: AUDIT-044 (P3), AUDIT-045 (P3).

### AUDIT-044 Admin bundle: the shared React chunk is obfuscated and loaded by the portal; no per-page code splitting
- Section: N Performance / Reliability
- Severity: P3
- Status: Confirmed
- Evidence type: local-exec (build output)
- Module / file:line: `vite.config.ts:69-101` (only the chunk named `admin` is excluded from obfuscation); `dist/assets`
- Repro steps: `ls dist/assets`, run gzip, and check the first bytes for `_0x`.
- Expected / Actual: The comment says the admin is excluded from obfuscation to keep iPhone loads fast. Actually React and the shared code live in `LogoIcon-*.js`, which is obfuscated (580 KB raw / 170 KB gz) and imported by `/admin`. Admin first load is about 1.14 MB raw / about 325 KB gz of JS (admin chunk 560 KB / 154 KB gz, includes supabase-js). Homepage: main 196 KB / 66 KB gz plus the shared chunk.
- Business impact: Slower first open of the portal on phones. Not blocking.
- Recommended fix: Also skip obfuscation for chunks imported by `admin` (check `output.moduleIds` or use `manualChunks` for a `vendor` chunk), and lazy-load heavy pages (Schedule, Reports).
- Verification approach: Rebuild and compare the gz sizes.
- Root cause: not recorded separately (P3; the title and evidence cover it)

### AUDIT-045 Schedule month view reads appointments without paging
- Section: N Performance / Reliability
- Severity: P3
- Status: Confirmed (latent)
- Evidence type: code-inspection
- Module / file:line: `pilates-landing/src/admin/schedule.ts:102-112`, called with a month range from `pages/Schedule.tsx:129-136`
- Expected / Actual: Expected paging past PostgREST's 1,000-row cap, as the Clients, Payments and Backup reads have. Actually there is a single request. Today's volume is about 310 appointments a month, including cancelled ones, so nothing is lost yet. A month over 1,000 would silently drop late-month appointments.
- Recommended fix: Page with `.range()` the same way `loadPayments` does, or warn when `data.length === 1000`.
- Verification approach: A mock test with 1,001 appointments in one month.
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Business impact: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)

## O. Deployment / Production Readiness

Build, lint and deploy of af8a957 succeeded (GitHub Actions and Supabase Preview green). The cutover checklist needs reordering and has gaps; CI has no test gate; no error monitoring.

Findings here: AUDIT-007 (P2), AUDIT-042 (P3), AUDIT-046 (P3).

### AUDIT-007 The cutover checklist cannot be followed in its current order and leaves out required steps
- Section: O Deployment / Production Readiness
- Severity: P2
- Status: Confirmed
- Evidence type: code-inspection
- Module / file:line: `docs/admin/PRODUCTION-CUTOVER-KO.md:30-42`; `git ls-tree origin/main` (no `supabase/` directory on main); `docs/admin/SETUP-KO.md:55`
- Repro steps: Follow steps 2→5 as written. In step 2 the prod project's GitHub integration is linked to `main`. Step 5 runs `select app.grant_owner(...)`.
- Expected / Actual: Expected a runnable sequence. Actually main has no `supabase/` directory until the cutover PR merges in step 7, so before step 7 the integration applies nothing and `app.grant_owner` does not exist. Step 6 says "right after the merge" but comes before step 7. The obvious workaround, pasting the migrations into the SQL Editor, is the thing SETUP-KO.md:55 warns breaks the integration. Also missing from the list: copying Staging data (AUDIT-001), Schedulista appointment import with instructors created first so names match, re-creating services, categories and colors, expenses and recurring rules, Knowledge items and Storage files, re-entering Admin access settings, **turning off "Allow new users to sign up"** (SETUP-KO.md:26 says to do it before production, but the cutover list omits it; see AUDIT-008), minimum password length 8, and a note that the Pages deploy and the Supabase migration run race each other at merge. Stale parts: "8 test files" (there are now 11 `*.test.sql`), "no spam protection" (limits now exist, see AUDIT-018), the Phase 8 results predate Schedule, Knowledge and Backup, and SETUP-KO.md:22 still points to `src/admin/supabase.ts` instead of `src/supabaseProject.ts`.
- Evidence: `git ls-tree --name-only origin/main` → `.github Archive CLAUDE.md CNAME FUTURE-PLANS.md daily-logs pilates-landing`.
- Business impact: The cutover stalls or gets improvised in the middle, and production starts without schedule, payments or Knowledge data, or with public sign-up still open.
- Root cause: The checklist was written on 2026-10-10, before Schedule, Knowledge and Backup existed and before most real data went into Staging.
- Recommended fix: Reorder: create the prod project → fill the prod URL and key on Staging → merge the PR in a short window → wait for the migrations to apply (check `schema_migrations`) → grant_owner → create staff → data copy (AUDIT-001) → turn off sign-ups → smoke test. Add the missing items above and refresh the stale lines.
- Verification approach: Dry run the checklist on a scratch Supabase project linked to a scratch branch.

### AUDIT-042 Deploy pipeline: no lint or test gate, staging and prod builds coupled in one job, Node 20 past EOL, migrations race the Pages deploy
- Section: O Deployment / Production Readiness
- Severity: P3
- Status: Confirmed
- Evidence type: code-inspection
- Module / file:line: `.github/workflows/deploy-pages.yml:25-78`
- Repro steps: Read the workflow. A push to either branch rebuilds main and Staging in one job.
- Expected / Actual: Expected lint, `run-local.sh` and the screen tests before a deploy, and independent environments. Actually only `npm run build` (tsc and vite) runs. A failing Staging build fails the whole run, which blocks a production hotfix (this happened once: `a5bb192 type-check fix after the first Staging build failed`). `node-version: 20` is past its April 2026 EOL. At cutover the Supabase integration applies migrations on its own schedule while Pages deploys the main build, so the homepage form can briefly call RPCs that don't exist yet. In that case the course list falls back to the bundled courses and submits fail.
- Business impact: Unvetted code reaches production, and deploys get blocked.
- Recommended fix: Split staging and prod into separate jobs, or use `continue-on-error` and keep the last good artifact for the other branch. Add lint and SQL tests as a gate. Use Node 22. Apply the prod migrations before merging the frontend.
- Verification approach: Break a build on a test branch and confirm the other environment still deploys.
- Root cause: not recorded separately (P3; the title and evidence cover it)

### AUDIT-046 No error monitoring or alerting (not implemented)
- Section: O Deployment / Production Readiness
- Severity: P3
- Status: Confirmed
- Evidence type: code-inspection
- Module / file:line: `pilates-landing/src` (no Sentry, `window.onerror` or `unhandledrejection` reporting); edge function logs only in the Supabase dashboard
- Business impact: Front-desk failures (for example a failed `record_payment`) are only seen by the user. Nobody learns about outages or a failing nightly behaviour.
- Recommended fix: Add a lightweight error reporter (Sentry free tier, or an `app.client_errors` insert RPC) and a Supabase log alert for 5xx responses from `staff-admin`.
- Verification approach: Throw a test error and see it in the sink.
- Repro steps: not recorded separately (P3; the title and evidence cover it)
- Expected / Actual: not recorded separately (P3; the title and evidence cover it)
- Root cause: not recorded separately (P3; the title and evidence cover it)
