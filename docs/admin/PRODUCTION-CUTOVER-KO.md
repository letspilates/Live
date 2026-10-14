# 관리자 포털 운영(main) 반영 체크리스트

> Phase 8 최종 점검 결과(2026-10-10). 최신 점검은 `docs/staging-audit/`(2026-10-13). **main 반영은 Calvin이 명시적으로 승인한 뒤에만 한다.**
> 지금 main을 병합해도 운영 사이트는 안전하다: 운영용 Supabase 값이 비어 있어서 홈페이지 트레이닝 신청 폼은
> 계속 구글 시트에 저장되고, `/admin`은 "프로젝트 미설정" 상태로만 보인다.

## 1. Phase 8 점검 결과 요약

| 항목 | 결과 | 근거 |
|---|---|---|
| 모든 권한 함수가 호출자를 확인하는지 | 통과 | `supabase/tests/phase8.test.sql` 1번 |
| 역할별 데이터 접근 (Owner, Admin, Staff, Instructor, 비활성 유저, 외부 로그인, 비로그인) | 통과 | 같은 파일 2번 |
| Settings › Admin access 메뉴 끄기가 DB에서도 막히는지 | **버그 발견 → 수정** (2c3e410) | 결제 메뉴를 꺼도 결제 기록·클라이언트 추가·검색이 DB에서 됐음 |
| 결제 화면 합계 = 리포트 합계 | **버그 발견 → 수정** (2c3e410) | 결제 화면이 최대 1000건만 읽어서 긴 기간 합계가 모자랄 수 있었음 |
| 결제, 지출, 리포트, 대시보드 차트, 월 마감 스냅샷 금액 일치 | 통과 | `phase8.test.sql` 3번, `finance.test.sql` (24.4: $20,000 − $8,000 = $12,000) |
| 재무 기록 hard delete 불가 | 통과 | API에 DELETE 권한 없음 (테스트로 확인) |
| 비밀값이 브라우저 코드에 없는지 | 통과 | 공개(publishable) 키만 있음, ADMIN_KEY 없음 |
| 역할별 화면 (폰 393 / 태블릿 820 / 데스크톱 1280) | 통과 382개 | `pilates-landing/tests/admin-shell.mjs` (새 디자인 반영본) |

전체 DB 테스트: `bash supabase/tests/run-local.sh` (8개 파일 모두 통과).

## 2. 반영 전에 정할 것 (Calvin)

**A. 운영 데이터베이스** → **결정됨 (Calvin, 2026-10-10): ① 새 운영 프로젝트**
- ① 운영용 Supabase 프로젝트를 새로 만든다. 장부가 깨끗하게 시작하고, 스테이징에서 테스트해도 실제 장부에 섞이지 않는다. 설정이 몇 단계 필요하다(아래 3번).
- ② 지금 `studio` 프로젝트를 그대로 운영으로 쓴다. 설정이 거의 없다. 대신 지금까지 스테이징에서 넣은 테스트 결제는 지울 수 없어서(무효 처리만 가능) 장부에 남고, 앞으로 스테이징 테스트도 실제 장부에 들어간다.

**B. 홈페이지 트레이닝 신청 폼**: 운영 Supabase 값을 넣는 순간 운영 폼이 구글 시트 대신 Supabase에 저장한다(신청 알림 메일 없음, 2026-10-10 결정대로). 괜찮은지 확인.

## 3. 반영 순서 (2026-10-13 개정, AUDIT-007)

> 예전 순서(2026-10-10)는 그대로 따라 할 수 없었다. `main`에는 병합 전까지 `supabase/` 폴더가 없어서, 병합 전에는 운영 DB에 마이그레이션도 `grant_owner`도 없다.
> 또 스케줄, Knowledge, Backup, 지출, Admin access, 가입 끄기가 빠져 있었다. 아래 순서대로 한다.
> 데이터 복사 방법 (결정 2026-10-14): 라이브 포털 **Settings › Backup › Restore**. Staging에서 받은 Everything (JSON) 파일을 빈 운영 포털에 한 번에 넣는다 (Owner/Admin만, 운영 DB가 비어 있을 때만 보임, 두 번째 실행은 DB가 거절). 일정은 빼고, 새 Schedulista CSV를 Settings › Schedule settings 가져오기로 넣는다. 화면이 파일과 표별 개수·월별 금액을 바로 대조해 보여준다.

### 준비 (병합 전, 운영 사이트에 영향 없음)

1. **스테이징 최종 확인 (Calvin)**: https://letspilatesla.com/staging/admin/ 에서 모든 메뉴(Dashboard, Clients, Trainings, Knowledge, Schedule, Payments, Expenses, Reports·월 마감, Users, Notifications, Admin access, Schedule settings, Backup, My account)를 Owner 계정과 공용 Staff 계정으로 열어 본다. 아이폰, 아이패드에서도.
2. **운영 Supabase 프로젝트 생성 (Calvin)**: 플랜은 Calvin 결정(2026-10-13): Pro 없이 시작하고, 운영 반영 후 매일 로컬 백업 경로를 만든다.
3. **GitHub 연동 (Calvin)**: 운영 프로젝트 → Integrations → GitHub: 저장소 `letspilates/Live`, Working directory `.`, Production branch **`main`**, Deploy to production ON, Automatic branching OFF. 이 시점에는 `main`에 `supabase/`가 없어서 아무것도 적용되지 않는 게 정상이다. SQL을 손으로 붙여넣지 않는다(SETUP-KO.md 3단계 경고).
4. **인증 설정 (Calvin)**: Authentication → Sign In / Providers → **Allow new users to sign up 끄기**, Confirm email 켜 둠, 비밀번호 최소 8자. URL Configuration → Site URL `https://letspilatesla.com/admin/`, Redirect URL `https://letspilatesla.com/admin/set-password/`. Custom SMTP(초대·비밀번호 재설정 메일).
5. **공개 키 전달 (Calvin → Claude)**: 운영 프로젝트 URL과 publishable key. Claude가 `pilates-landing/src/supabaseProject.ts`의 `production`에 넣고 Staging에 올린다(운영에는 아직 영향 없음).
6. **데이터 복사 리허설 (Claude + Calvin)** — 2026-10-14 완료: 실제 백업 파일로 빈 DB에 Restore, 14개 표 개수와 1~10월 월별 금액 전부 일치, 연결 끊긴 id 0. 기준: 정한 방법으로 빈 테스트 프로젝트에 한 번 복사해 보고 대조한다: 표별 행 수, 1~10월 월별 `finance_report` 합계, 결제의 받은 사람 이름, 강사별 월별 일정 수가 Staging과 같아야 한다.

### 반영 (손님이 적은 시간에, 짧게 연달아)

> **2026-10-14 실행 기록:** 8~10단계 완료 (PR #39, main `aec9c6b`). 12단계는 Restore로 완료 (PR #40 수정 후, 14개 표·1~10월 금액 일치). 일정 가져오기는 SMS(Twilio) 승인 후로 보류 (Calvin). 13단계 홈페이지 신청 확인 완료. 14단계(Apps Script Archive, 즐겨찾기)는 Calvin 진행 중.
> 주의: 실제 Supabase는 WHERE 없는 UPDATE/DELETE를 DB 함수 안에서도 거절한다. 로컬 테스트 DB는 이걸 잡지 못한다.

7. **입력 멈춤 + 최종 백업 (Calvin)**: 이 시점부터 Staging에 결제·일정·클라이언트를 넣지 않는다(그 사이 결제는 메모해 두었다가 운영에 넣는다). Settings › Backup › Everything (JSON)을 받는다.
8. **main 병합 (Calvin 승인 후 Claude)**: `Staging` → `main` PR 병합. 홈페이지 배포와 운영 DB 마이그레이션이 동시에 돈다. 마이그레이션이 끝나기 전 몇 분 동안은 홈페이지 신청 폼이 코스를 못 불러올 수 있다.
9. **적용 확인**: 운영 SQL Editor에서 `select count(*) from supabase_migrations.schema_migrations;` 결과가 저장소 `supabase/migrations/` 파일 수와 같은지, Edge Functions에 `staff-admin`이 있는지.
10. **첫 Owner (Calvin)**: Authentication › Users › Add user(Auto Confirm User 체크) → SQL Editor에서 `select app.grant_owner('이메일', '이름');`.
11. **직원 계정**: 복사 방법에 따라 Staging 직원과 같은 ID로 만들거나(방법 A), 포털 Users에서 추가한다. 강사 이름·색이 일정과 맞아야 한다.
12. **데이터 복사 + 대조 (Claude + Calvin)**: 리허설한 방법 그대로. 빠짐없이 들어가야 하는 것: 클라이언트, 결제(1~10월), 지출과 반복 지출, 월 마감, 일정과 일정별 클라이언트, 스케줄 서비스·카테고리·설정(문자 지연, Other 색)·강사 색, Trainings 코스와 신청자, Knowledge 목록과 Storage 파일, Admin access 설정. Staging 테스트 결제를 뺄지 정한다. 6단계와 같은 대조를 다시 한다.
13. **반영 후 확인**: 홈페이지가 전과 같은지(폰·태블릿·데스크톱, EN/KR 전환, 스케줄 위젯), 신청 폼에 코스가 보이는지, `/admin` 로그인과 역할별 메뉴, Reports 1~10월 합계가 Staging과 같은지. 운영에는 테스트 결제를 넣지 않는다(지울 수 없음).
14. **정리 (Calvin)**:
    - Google Apps Script 웹앱 끄기: Apps Script → Deploy → Manage deployments → Archive (AUDIT-020, 반드시).
    - 직원 폰의 홈 화면 즐겨찾기를 `/staging/admin/`에서 `/admin/`으로 바꾼다. 이후 Staging에는 실제 데이터를 넣지 않는다.
    - 매일 로컬 백업 경로 설정.
    - `/admin/legacy/`와 ADMIN_KEY 폐기 여부 결정.

**되돌리기**: main에서 그 PR을 되돌리는 PR 하나면 홈페이지 폼은 구글 시트로 돌아가고 `/admin`은 "연결 안 됨" 화면이 된다. 운영 DB 데이터는 그대로 남는다. 되돌린 동안 결제를 어디에 적을지 미리 정한다(Staging에는 넣지 않는다). Staging 프로젝트와 최종 백업은 운영에서 한 달을 마감할 때까지 지우지 않는다.

## 4. 고치지 않고 남겨 둔 것 (2026-10-13 갱신)

- 결제 화면의 "지난 결제 10건"과 직원의 결제 보기 범위: 2026-10-13 Calvin 결정에 따라 바뀜(AUDIT-010).
- 화면에는 Walk-in이 없지만 DB 함수는 클라이언트 없는 결제를 아직 받는다(AUDIT-038, P3). 화면이 항상 클라이언트를 보내서 실제로 생기지는 않는다.
- 홈페이지 트레이닝 신청: 길이 제한·횟수 제한은 있고, 봇 방지는 AUDIT-018에서 추가 중.
- 이 작업 환경에서는 실제 Supabase DB에 직접 접속할 수 없어서, DB 점검은 같은 마이그레이션을 적용한 로컬 DB에서 한다.
