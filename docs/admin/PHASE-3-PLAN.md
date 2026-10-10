# Phase 3 — 포털 셸 · 역할별 대시보드 · 등록 화면 연결

> 상위 문서: `ADMIN-PORTAL-MASTER-PLAN.md` (D 경로표, E.0 디자인 규칙, E.2~E.4 와이어프레임, L 로드맵 3단계).
> 2026-10-10 작성. Calvin 승인 받은 Phase 3를 `Staging`에서 진행한다.

## 1. 출발점 (Phase 2에서 이미 있는 것)

| 요소 | 상태 |
|---|---|
| `/admin/*` 진입점, History API 라우터, 경로별 `index.html` 복사(새로고침·딥링크) | 있음 |
| 데스크톱 사이드바(240px, 접기 72px), 태블릿 아이콘 레일, 폰 드로어(native dialog) | 있음 |
| 헤더: 페이지 제목 · 언어 토글 · 이니셜(계정 링크) | 있음 |
| 대시보드: 오너 = 직원 수 카드, 강사·스태프 = 안내 문구 | 있음 |
| Staff, Account, Login, Set password | 있음 |
| 기존 관리자(등록자·코스 편집) → `/admin/legacy/` (내용 그대로) | 옮김, 포털과 연결 안 됨 |

그래서 Phase 3는 새로 짓는 것이 아니라 **빈 곳을 채우는 작업**이다.

## 2. 이번 단계에서 하는 것

1. **`/admin/enrollments` (오너 전용)** — 기존 등록 기능을 포털 안으로.
   - 사이드바·헤더는 그대로 두고, 본문에 기존 화면(`/admin/legacy/`)을 같은 출처 iframe으로 넣는다.
   - 기존 동작(Apps Script, `ADMIN_KEY` 로그인, 코스 저장, 등록자 목록) **한 줄도 바꾸지 않는다.** 4A에서 Supabase 화면으로 교체.
   - iframe 높이 = 화면 남은 높이 → 기존 화면의 하단 "저장" 바가 그대로 보인다.
   - 레거시 파일 변경은 한 줄: "등록 폼 열어보기" 링크를 새 탭으로 (iframe 안에서 홈페이지가 열리지 않도록).
   - "새 창에서 열기" 링크 제공 (iPhone에서 넓게 보고 싶을 때).
2. **사이드바 메뉴를 실제 화면 기준으로**: Dashboard · Enrollments(오너) · Staff(오너). 아직 없는 모듈(Daily Income 등)은
   메뉴에 넣지 않는다 (가짜 화면 금지). 각 단계에서 화면이 생길 때 한 줄씩 추가.
3. **헤더 계정 메뉴**: 이니셜을 누르면 이름·이메일·역할 + 내 계정 + 로그아웃 (native popover, 바깥 클릭·Esc로 닫힘).
4. **태블릿 메뉴 버튼**: 1024px 미만에서 ≡ 버튼 → 이름이 보이는 드로어 (아이콘 레일만으로는 메뉴 이름을 알 수 없음).
5. **역할별 대시보드 (실제 데이터만)**
   - 오너: 팀 카드(실제 직원 수) + 등록 카드(바로가기, 숫자 없음: 등록 데이터는 아직 시트에 있고 4A에서 연결).
   - 강사·스태프: 내 정보 카드(역할, 등급, 이메일 = 실제 프로필) + 내 계정 바로가기.
6. **옛 링크 대응**: 예전 북마크 `/admin/`은 포털 로그인 → 대시보드의 등록 카드·메뉴로 이어진다.
   로그인 전 `/admin/enrollments/`로 들어오면 로그인 후 그 화면으로 복귀(`?next=`). `/admin/legacy/`는 직접 주소로도 계속 열린다.

## 3. 하지 않는 것

- 공개 홈페이지 변경 없음 (변경 전후 픽셀 비교로 확인).
- 이메일 초대 (보류), `ADMIN_KEY` 변경 (라이브 사이트가 사용 중), 강사 하단 탭(메뉴가 2개뿐이라 의미 없음 → Phase 5에서 결제 입력이 생길 때).
- 브레드크럼 (경로가 한 단계뿐), 새 의존성, DB 변경.

## 4. 검증

| 항목 | 방법 |
|---|---|
| 빌드·린트 | `npm run build`, `npm run lint` |
| DB 권한 테스트 | `bash supabase/tests/run-local.sh` (변경 없음, 재실행) |
| 포털 화면 | `pilates-landing/tests/admin-shell.mjs` (Playwright, Supabase 응답 모의, 80개 확인) — 393/820/1280px, 오너·강사·스태프, 딥링크·새로고침, 권한 리다이렉트, 계정 메뉴, 드로어, 등록 iframe, 가로 넘침 0 |
| 랜딩 회귀 | 변경 전후 빌드 1280·393px 전체 페이지 캡처 픽셀 비교 = 0 |

## 5. 스킬

요청한 superpowers · ui-ux-pro-max-skill · impeccable은 이 환경에 없다 (SearchSkills 결과 없음).
계획 = 이 문서(직접 작성), 디자인 = `design-taste-frontend` + `redesign-existing-projects`(기존 E.0 규칙 안에서), 코딩·리뷰 = `ponytail` + `ponytail-review` + `code-review`.

## 6. 결과 (2026-10-10)

- 빌드·린트 통과, DB 권한 테스트 통과, 포털 화면 확인 80개 통과, 홈페이지 1280·393px 픽셀 동일.
- Phase 2 세션의 화면 테스트 57개는 저장소에 없던 임시 스크립트라 재실행할 수 없었다 → 이번에 `tests/admin-shell.mjs`로 저장소에 남김.

## 7. 변경 (2026-10-10, Calvin 피드백)

iframe 방식은 화면 안의 화면 + 두 번째 비밀번호 + 별도 로그아웃이 생겨 폐기했다.
- **등록 관리를 포털 화면으로 다시 만듦**: 코스 관리 / 등록자 탭. 규칙(일정 순 ID, 얼리버드, 신청 집계·코스 매칭)은 예전 화면 코드를 그대로 옮김 (`src/admin/enrollments.ts`).
- **두 번째 비밀번호 없음**: 새 함수 `supabase/functions/enrollments-admin`이 호출자가 활성 오너인지 DB로 확인한 뒤,
  Supabase 비밀 값 `APPS_SCRIPT_ADMIN_KEY`를 서버에서 붙여 Apps Script를 부른다. 키는 브라우저에 내려가지 않는다.
  Apps Script와 라이브 사이트의 `ADMIN_KEY`는 그대로.
- 예전 화면은 한국어 설명(`desc_kr`)을 저장 때 지웠는데, 새 화면은 유지한다.
- 사장님 할 일: SETUP-KO.md 9단계 (비밀 값 1개 저장).

## 8. 변경 (2026-10-10, Calvin: "구글 시트로 운영 안 함", "메일 없이")

7번의 시트 연결 함수(`enrollments-admin`, 비밀 값)는 삭제했다. 지도자 과정 데이터는 Supabase로 옮겼다.
- 테이블 `training_courses`, `training_registrations` (마이그레이션 `20261010155554_training_enrollments.sql`).
  오너만 읽기(RLS). 쓰기는 오너 전용 함수 `save_training_courses`(목록 통째 저장), `import_training_registrations`(시트 CSV 1회 가져오기).
- 공개 함수 2개만 로그인 없이 실행 가능: `public_training_courses`(열린 코스 + 신청 수), `submit_training_registration`(신청 1건, 열린 코스만).
  `app.check_api_exposure()`가 이 둘 외의 노출을 계속 막는다. 테스트: `supabase/tests/training.test.sql`.
- 포털 등록 관리: 테이블을 바로 읽고 함수로 저장. 신청은 코스 id(uuid)로 연결되어 글자(A, B…)가 바뀌어도 따라간다.
  매칭 안 된 신청은 신청 당시 문구(`courses_text`)를 보여 준다. 시트 CSV 가져오기 버튼 (코스 → 편집기에 추가 후 저장, 신청 → 바로 저장, 중복 건너뜀).
- 홈페이지 신청 폼: Supabase 프로젝트가 있는 빌드(스테이징)는 Supabase로, 프로덕션은 운영 프로젝트가 생길 때까지 구글 시트 그대로.
  화면 변경 없음. 메일 발송 없음 (스테이징 신청은 포털에서만 확인).
- 공통 설정 `src/supabaseProject.ts` (URL·publishable 키, 라이브러리 없이 fetch) → 홈페이지 번들에 supabase-js가 들어가지 않는다.
