# Release Readiness

## Decision: **NO-GO**

> **한국어.** 지금 main 병합은 하지 않는 것이 맞습니다. 실제 데이터를 운영 DB로 옮기는 방법이 검증되지 않았고(P0), P1 5건이 남아 있으며, 운영 Supabase 프로젝트도 아직 없습니다. 아래 조건을 채우면 CONDITIONAL GO로 바뀝니다.

Audited revision: `Staging` @ `af8a957` (2026-10-13). Production today serves only the homepage; its `/admin/` shows "not connected" and the training form still writes to Google Sheets, so holding the release has no customer impact.

## Remaining release blockers

| ID | Sev | Why it blocks |
|---|---|---|
| AUDIT-001 | P0 | Production would start without the Jan–Oct payment history, cleaned clients and imported schedule, or with an improvised copy that breaks staff links and closed months. |
| AUDIT-002 | P1 | The only copy of that data is in a project with no automated backup, and fix pushes run migrations against it. |
| AUDIT-003 | P1 | One Delete click in Users can permanently strip an instructor from their appointment history. |
| AUDIT-004 | P1 | Silent cancellation of real client bookings when two people use the calendar. |
| AUDIT-005 | P1 | Payments land on the wrong day/month from a screen left open overnight. |
| AUDIT-006 | P1 | Owner's home screen overstates monthly profit. |

## Required remediation before GO

1. AUDIT-002 now: Backup JSON (and a DB dump if possible) before any migration push.
2. AUDIT-003, 004, 005, 006 fixed on Staging and verified there by Calvin.
3. AUDIT-007 checklist rewritten; AUDIT-008 sign-ups turned off in the production plan; AUDIT-018 bot protection before the public form points at production Supabase.
4. AUDIT-001: copy method chosen and rehearsed into a scratch project with matching reconciliation.
5. Calvin's decisions recorded for AUDIT-010 (staff payment visibility) and AUDIT-016 (instructor schedule scope) if Instructor Schedule will be on at launch.

P2 items not listed above can ship after launch if Calvin accepts them; P3 items are optional.

## Unverified critical functions

- Signed-in behaviour against the real Staging data (blocked; verified on local copies only).
- Data copy / restore into a real project (no project yet).
- Real iPhone/iPad use of Record payment and the calendar.
- Invite emails (Custom SMTP not confirmed).
- Production Auth settings (project not created). Staging today: sign-ups ON, email confirmation ON.

## Deployment dependencies

- Calvin: create the production Supabase project (Pro recommended for backups), GitHub integration on `main`, Auth redirect URLs, sign-ups off, Custom SMTP, then send the prod URL and publishable key.
- Claude: put the URL/key in `pilates-landing/src/supabaseProject.ts` on Staging.
- Order at merge: migrations must be applied on prod before the main build goes live (the Pages deploy and the Supabase migration run race each other; see AUDIT-042 and AUDIT-007).
- After merge: `grant_owner`, create staff (same UUIDs if copy option A), data copy, Knowledge files, re-enter Admin access settings, smoke test, retire the Apps Script endpoint (AUDIT-020).

## Required post-fix regression testing

- `supabase/tests/run-local.sh`, `pilates-landing/tests/admin-shell.mjs`, `npm run build`, `npm run lint`.
- New tests listed under "Required regression tests" in [REMEDIATION_BACKLOG.md](REMEDIATION_BACKLOG.md).
- Homepage before/after comparison against main at 375/768/1440.
- Restore rehearsal reconciliation: per-table row counts, monthly `finance_report` totals Jan–Oct, appointments per instructor per month.
- Post-cutover smoke test on production: sign in as Owner, open every menu, record and void one test payment in a test client, check the public training form, check `/staging/` is clearly marked.

## Rollback requirements

- Frontend: revert the merge commit on `main`; Pages redeploys the previous homepage, the form falls back to Google Sheets, `/admin/` shows "not connected". Verified by inspecting the current main build.
- Database: migrations stay in the prod project after a frontend rollback (harmless, additive). Decide in advance where payments go during a rollback (Staging must not be used for real entries once prod is live; see AUDIT-022).
- Keep the Staging project and the pre-cutover Backup JSON/dump untouched until production has been reconciled and used for at least one full closed month.
