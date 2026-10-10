# 관리자 포털 운영(main) 반영 체크리스트

> Phase 8 최종 점검 결과(2026-10-10). **main 반영은 Calvin이 명시적으로 승인한 뒤에만 한다.**
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

**A. 운영 데이터베이스** (추천: ① 새 운영 프로젝트)
- ① 운영용 Supabase 프로젝트를 새로 만든다. 장부가 깨끗하게 시작하고, 스테이징에서 테스트해도 실제 장부에 섞이지 않는다. 설정이 몇 단계 필요하다(아래 3번).
- ② 지금 `studio` 프로젝트를 그대로 운영으로 쓴다. 설정이 거의 없다. 대신 지금까지 스테이징에서 넣은 테스트 결제는 지울 수 없어서(무효 처리만 가능) 장부에 남고, 앞으로 스테이징 테스트도 실제 장부에 들어간다.

**B. 홈페이지 트레이닝 신청 폼**: 운영 Supabase 값을 넣는 순간 운영 폼이 구글 시트 대신 Supabase에 저장한다(신청 알림 메일 없음, 2026-10-10 결정대로). 괜찮은지 확인.

## 3. 반영 순서 (A-①을 고른 경우)

1. **스테이징 최종 확인 (Calvin)**: https://letspilatesla.com/staging/admin/ 에서 Owner 계정과 테스트 Staff 계정으로 Dashboard, Clients, Trainings, Payments, Expenses, Reports(월 마감 포함), Users, Admin access, My account를 한 번씩 열어 본다. 아이폰, 아이패드에서도.
2. **운영 Supabase 프로젝트 생성 (Calvin)**: Pro 플랜 추천(매일 백업, 일시정지 없음). GitHub 연동을 `main` 브랜치에 연결하면 마이그레이션과 `staff-admin` 함수가 자동 적용된다.
3. **인증 설정 (Calvin)**: Site URL `https://letspilatesla.com/admin/`, Redirect URL `https://letspilatesla.com/admin/set-password/`, Custom SMTP(초대·비밀번호 재설정 메일용). 절차는 `docs/admin/SETUP-KO.md`와 같고 주소만 `/staging`이 빠진다.
4. **공개 키 전달 (Calvin → Claude)**: 운영 프로젝트 URL과 publishable key. Claude가 `src/supabaseProject.ts`의 `production`에 넣어 Staging에 올린다(운영에는 아직 영향 없음).
5. **첫 Owner (Calvin)**: Authentication › Users › Add user로 본인 계정을 만들고 SQL Editor에서 `select app.grant_owner('이메일', '이름');` 한 줄 실행. 이후 유저는 포털 Users에서 추가.
6. **데이터 가져오기 (Calvin, main 병합 직후 바로)**: 포털 Trainings › CSV 가져오기로 구글 시트의 Courses와 신청자 탭, Clients › 가져오기로 Mindbody·Schedulista CSV. 가져온 CSV 파일은 삭제(개인정보). 코스가 비어 있으면 홈페이지 폼에 코스가 안 보이므로 **병합과 코스 가져오기 사이 간격을 짧게** 한다.
7. **main 반영 (Calvin 승인 후 Claude)**: `Staging` → `main` PR 생성, 병합. 배포 자동.
8. **반영 후 확인**: 홈페이지가 전과 같은지(폰·태블릿·데스크톱, EN/KR 전환, 스케줄 위젯), 트레이닝 폼에 코스가 보이고 신청이 들어가는지, `/admin` 로그인과 역할별 메뉴. 운영에서는 테스트 결제를 넣지 않는다(지울 수 없음).
9. **정리**: 폼이 Supabase로 옮겨진 걸 확인한 뒤 Apps Script와 ADMIN_KEY 폐기 여부 결정.

**되돌리기**: main에서 그 PR을 되돌리는 PR 하나면 홈페이지 폼은 구글 시트로 돌아간다. 운영 DB 데이터는 그대로 남는다.

## 4. 고치지 않고 남겨 둔 것 (필요하면 말해 주세요)

- Staff와 Instructor도 결제 화면에서 고른 클라이언트의 최근 결제 10건을 본다(다른 직원이 받은 것 포함). Calvin이 요청한 기능이라 그대로 둠.
- 화면에는 Walk-in이 없지만 DB 함수는 클라이언트 없는 결제를 아직 받는다. 화면이 항상 클라이언트를 보내서 실제로 생기지는 않는다.
- 홈페이지 트레이닝 신청은 로그인 없이 누구나 보낼 수 있고 스팸 방지가 없다. 운영 전환 전에 길이 제한과 간단한 스팸 방지를 넣는 걸 추천.
- 이 작업 환경에서는 실제 Supabase(스테이징) DB에 직접 접속할 수 없어서, 보안 점검은 같은 마이그레이션을 적용한 로컬 DB에서 했다.
