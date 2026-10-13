# Executive Summary: Staging Audit

> **한국어 요약.** 결론: 지금은 운영(main) 반영 **NO-GO**. 보안 구멍이나 돈 계산 오류 같은 큰 문제는 없었습니다(익명 접근 차단을 실제 Staging에서 확인, 결제·환불·월마감 규칙 통과). 다만 ① Staging의 실제 데이터(1~10월 결제, 클라이언트, 스케줄)를 운영 DB로 옮기는 검증된 방법이 아직 없고(P0), ② 그 데이터가 자동 백업 없는 Staging에만 있으며, ③ 강사 삭제 시 일정에서 강사가 지워짐, 오래 열어둔 캘린더가 다른 사람의 예약을 취소함, 자정 넘어 열어둔 결제 화면이 전날로 기록함, 대시보드 이번 달 지출·이익이 Reports와 다름(P1 5건)이 있습니다. 총 47건: P0 1, P1 5, P2 16, P3 25.

## Audit facts

| | |
|---|---|
| Audit date | 2026-10-13 |
| Environment | Staging: https://letspilatesla.com/staging/admin/ on Supabase project `studio` (`prklzkcrhfnnlefvmxhb`). Production Supabase does not exist yet; production site is the homepage only. |
| Repository revision | `Staging` @ `af8a9571d07fccad33284125dc9f199b09df7c5e` ("Daily log: draft cutover PR #39"), the commit deployed to Staging at 01:06Z (Actions run 38330444104, Supabase Preview check green). Draft PR #39 (Staging → main) left untouched. |
| Scope | Admin portal (React 19 + Vite + TS, `pilates-landing/src/admin`), 38 Supabase migrations, `staff-admin` edge function, public training form, homepage regression vs main, deploy workflow, cutover docs. Not in scope because not implemented: payment provider/webhooks, SMS, cron jobs, Mindbody sync. |
| Sections audited | A–O, all 15 (K has nothing implemented to test beyond confirming that). |
| Method | Static inspection first; then execution on a throwaway local Postgres with every migration, Playwright against a local Staging build with mocked Supabase at 375/768/1440 (+1024/1180), and read-only requests to the real Staging site and project. **No record on real Staging was created, changed or deleted.** |

## Test execution summary

- Existing suites: build and lint pass; 12 SQL suites pass on all 38 migrations; `admin-shell.mjs` 641 passed / 0 failed; `npm audit` 0 vulnerabilities.
- New audit scenarios: 129 executed (91 passed, 38 failed), 51 checked by code inspection only, 4 blocked, 10 not testable from here. Detail in [TEST_COVERAGE.md](TEST_COVERAGE.md).
- Homepage: computed styles of 466 elements at three widths are identical to production main. No design change.

## Confirmed defects by severity

| Severity | Total | Confirmed | Suspected |
|---|---:|---:|---:|
| P0 | 1 | 1 | 0 |
| P1 | 5 | 5 | 0 |
| P2 | 16 | 14 | 2 |
| P3 | 25 | 23 | 2 |
| **All** | **47** | **43** | **4** |

## Blocked and unverified areas

- **Signed-in checks on real Staging data** (report totals vs real rows, real row counts, orphan scan): the session's safety policy refused reads of the real client tables, and the test Owner login lives in another thread. The same checks passed on local data.
- **Restore** of a backup into a new project: no target project exists; done locally instead (it failed: AUDIT-001).
- **Supabase plan tier and backups** for `studio`: dashboard only.
- **Real iPhone/iPad** behaviour: emulated widths only.
- **Deployed Apps Script version** and **invite email delivery** (Custom SMTP).
- **Schedulista cancelled-row import handling**: no sample CSV.

## Top production risks

1. **AUDIT-001 (P0)**: no tested way to move the real Jan–Oct ledger, clients and schedule into the new production project; the Backup JSON cannot be restored (11 of 17 tables fail).
2. **AUDIT-002 (P1)**: that real data sits only in the Staging project, which auto-applies every pushed migration and (per the plan) has no automated backups.
3. **AUDIT-005 (P1)**: an Owner/Admin Record-payment screen left open past LA midnight books the next payment to the previous day, or previous month on the 1st.
4. **AUDIT-004 (P1)**: a calendar that was not reloaded cancels bookings another user added when someone resizes or saves.
5. **AUDIT-003 (P1)**: deleting a user who has appointments wipes the instructor from all of them (incl. the imported 2026 history).
6. **AUDIT-006 (P1)**: the Dashboard's "this month" expenses and profit leave out expenses dated later in the month, so they disagree with Reports.
7. **AUDIT-007 / AUDIT-008 (P2)**: the cutover checklist can't run in its written order, and public sign-up is still on (checked live) while Add user adopts any existing login.

## Overall release recommendation

**NO-GO** for merging `Staging` into `main` today. A confirmed P0 remains, five P1s remain, and production Supabase has not been created. It can become **CONDITIONAL GO** once Waves 1–2 of [REMEDIATION_BACKLOG.md](REMEDIATION_BACKLOG.md) are done and a data-copy rehearsal reconciles with Staging. See [RELEASE_READINESS.md](RELEASE_READINESS.md).

Reports: [FINDINGS_BY_SECTION.md](FINDINGS_BY_SECTION.md) · [REMEDIATION_BACKLOG.md](REMEDIATION_BACKLOG.md) · [TEST_COVERAGE.md](TEST_COVERAGE.md) · [RELEASE_READINESS.md](RELEASE_READINESS.md)
