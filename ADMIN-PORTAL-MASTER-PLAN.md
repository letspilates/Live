# Let's Pilates — Admin Management Portal · Master Development Plan

> **상태:** 계획서 (승인 대기) · 작성 2026-10-10 · **코드 변경 없음**
> **범위:** 기존 사이트를 유지한 채 `/admin`을 Supabase 기반 스튜디오 관리 포털로 전환
> **대체 문서:** `DAILY-INCOME-PLAN.md`(같은 날 작성)는 이 문서에 흡수되었다.
> **승인 전에는 구현하지 않는다.** 모든 변경은 `Staging` → https://letspilatesla.com/staging/ 확인 → 승인 → `main` 순서 (CLAUDE.md 규칙 2).

### 이 계획에 사용한 스킬

| 요청하신 스킬 | 이 환경 설치 여부 | 대신 사용한 것 |
|---|---|---|
| superpowers (계획) | ❌ 미설치 (스킬 목록·검색 결과 없음) | 조사 → 분석 → 설계 → 검토 순서의 수동 계획 절차 |
| ui-ux-pro-max-skill, impeccable (디자인) | ❌ 미설치 | `design-taste-frontend` (AI 티 나는 패턴 금지, 상태·대비·형태 일관성 규칙), `dataviz` (차트 형태 선택, **팔레트 실측 검증**) |
| ponytail (코딩·리뷰) | ✅ 설치됨 | 아키텍처 단계부터 적용 (lite): 의존성 1개만 추가, 네이티브 기능 우선, 미래 모듈 YAGNI. 구현 단계에서는 `ponytail` + `ponytail-review` |

> `design-taste-frontend`는 스스로 "대시보드·관리자 화면은 범위 밖"이라고 명시한다. 그래서 랜딩용 규칙은 버리고
> 적용 가능한 규칙(로딩·빈 화면·오류 상태, 대비 검사, 형태·색 일관성 잠금, AI 상투 패턴 금지)만 썼다.
> 이 스킬이 권하는 Fluent/Carbon 같은 외부 디자인 시스템은 **브랜드 동결 규칙과 충돌하므로 채택하지 않는다.**

---

## ⚠️ P0 — 계획과 별개로 지금 필요한 보안 조치

**현재 `/admin` 비밀번호가 공개 저장소에 노출되어 있다.**
`daily-logs/2026-09-06.md`(main·Staging 모두)에 `ADMIN_KEY` 실제 값이 적혀 있고, 저장소는 public이다.
이 비밀번호로 등록자 이름·이메일·전화번호 전체를 조회할 수 있다.

- **조치 (사장님, 2분):** Apps Script → ⚙️ 프로젝트 설정 → 스크립트 속성 → `ADMIN_KEY`를 **긴 새 비밀번호**로 변경. 재배포 불필요(실행 시점에 읽음).
- 로그 파일에서 값을 지워도 git 이력에는 남는다 → **값 교체가 유일한 실효 조치.** 원하시면 로그의 해당 값 마스킹도 하겠다.
- 앞으로 데일리 로그에는 비밀값을 절대 쓰지 않는다.

---

## A. Executive Summary

**목표.** 강사는 "학생 선택 → 금액 확인 → 결제수단 → 저장"만 하고, 사장님은 대시보드를 열자마자 오늘·이번 달 수입, 지출, 예상 영업이익을 본다.
월말에는 검토 후 마감하면 그 달 장부가 잠긴다.

**권장 전략 (요약).**

1. **공개 사이트는 그대로.** `/admin`을 같은 Vite 프로젝트의 **두 번째 진입점(React SPA)**으로 만든다. 별도 앱·별도 배포 없음.
2. **Supabase**: 이메일+비밀번호 Auth, Postgres, Row Level Security, DB 함수(RPC), Edge Function 3개, pg_cron. **staging / prod 프로젝트 분리.**
3. **보안 모델:** ① 모든 테이블 RLS ② 금전 쓰기는 소유자 검사가 들어간 DB 함수로만 ③ 기본 실행 권한 회수 ④ 역할은 사장님만 바꿀 수 있는 테이블에 저장(사용자 메타데이터 사용 금지) ⑤ 비활성화 즉시 차단.
4. **등록(Enrollment) 이전은 2단계:** **E1** 구글 시트 → Supabase 읽기 전용 미러(위험 낮음, 재무 기능 전에) → **E2** 공개 폼 저장처 전환(위험 높음, 재무 기능 이후·별도 승인). Apps Script는 **이메일 발송 담당으로 유지.**
5. **돈 계산 모델:** 정수 센트, LA 영업일, `VALID/VOID` 상태, `PAYMENT/REFUND/ADJUSTMENT` 종류, 마감 잠금 트리거, 감사 트리거.
   매출은 "실제로 받은 날" 기준, 지출은 "지출일이 속한 달" 기준(미지급 포함).
6. **의존성 추가는 `@supabase/supabase-js` 하나.** 라우터·차트·날짜선택·엑셀 라이브러리 없이 History API, 인라인 SVG, `<input type="date">`, CSV(UTF-8 BOM)로 해결한다.
7. **단계 순서 조정:** 1 → 2 → 3 → **4A** → 5 → 6 → 7 → **4B** → 8.
   위험한 공개 폼 전환(4B)이 돈 관리 기능(5~7)을 막지 않도록 뒤로 뺐다.

---

## B. Existing Architecture Assessment

### B.1 현재 아키텍처

| 영역 | 현재 | 위치 |
|---|---|---|
| 프론트엔드 | React 19, Vite 8, Tailwind 3, TypeScript. **라우터 없음**(해시 앵커 단일 페이지) | `pilates-landing/src/` |
| 백엔드 | **Google Apps Script 웹앱 1개** (`doGet`/`doPost`) | `pilates-landing/apps-script/google-apps-script.js` (974줄, 소유자가 편집기에 붙여넣어 배포) |
| 데이터 | **Google Sheets** "Registration" — 접수 탭(Sheet3) + `Courses` 탭 | 구글 드라이브 |
| 호스팅 | **GitHub Pages**. `main`→`/`, `Staging`→`/staging/`을 한 아티팩트로 배포. 서버 코드·헤더 설정·SPA 리라이트 불가 | `.github/workflows/deploy-pages.yml` |
| 정적 부속 페이지 | `public/admin/index.html`(관리자, 814줄 바닐라 JS), `public/pricing/` | Vite 빌드 밖, 그대로 복사 |
| 빌드 후처리 | 전 JS 번들 난독화, 우클릭·개발자도구 단축키 차단 | `vite.config.ts`, `src/protect.ts` |
| 다국어 | EN/KR 토글 (`localStorage` 키 `reforme-lang`) | `src/i18n/` |
| 환경 설정 | `.env` 없음. Apps Script URL이 **코드에 하드코딩** (TrainingForm, admin 두 곳) | |
| 테스트 | **테스트 프레임워크 없음.** 지금까지는 `build`+`lint` + 세션 중 Playwright 렌더 확인 | `package.json` |
| 저장소 | **public**. 무료 플랜이라 private 전환 시 Pages가 꺼짐 (07-23 사고 기록) | `daily-logs/2026-07-23.md` |

과거 문서 참고: `claude/ecstatic-gauss-lDHw0` 브랜치의 `Phase2.md`(2026-06, Supabase+Stripe 자체 예약 시스템)는
`FUTURE-PLANS.md`(2026-07-22)에서 **"만들지 않기로 한 것"**으로 정리되었다(Mindbody가 예약·회원·결제를 처리).
따라서 **Supabase 학생 DB는 아직 존재하지 않는다.** 이 계획이 처음 만든다.

### B.2 현재 `/admin` 구현
- `https://letspilatesla.com/admin/` = `public/admin/index.html` 한 파일. 탭 2개: **코스 관리**(Courses 탭 편집·저장), **등록자**(접수 목록 카드).
- 공용 비밀번호 1개(`ADMIN_KEY`)를 `sessionStorage`에 저장해 `?key=` 쿼리스트링으로 보낸다.
- `<meta name="robots" content="noindex, nofollow">`, 사이트 디자인 토큰을 손으로 복제한 CSS.

### B.3 인증·인가
- 개인 계정·역할·세션 없음. 서버(Apps Script)는 `key === ADMIN_KEY`만 확인한다 (fail-closed 처리는 되어 있음).
- **문제:** 비밀번호가 공개 로그에 노출됨(P0), 4자리 숫자, 쿼리스트링 전송(브라우저 기록·로그에 남음), 사용자 구분 불가.

### B.4 현재 등록(Enrollment) 데이터 흐름

```
[방문자] Training 섹션 → TrainingForm (3단계, 로그인 없음)
   │ GET  SHEETS_URL?t=...          → 코스 목록 + 정원/신청 수 (Courses 탭 + 접수 탭 집계)
   │ POST SHEETS_URL (JSON)         → doPost
   ▼
Apps Script doPost
   ├─ 접수 탭(Sheet3)에 행 추가 (A:제출시각 … M:기타)
   ├─ 관리자 알림 메일 (NOTIFY_EMAIL, BCC)
   └─ 신청자 웰컴 메일 (SENDER_ALIAS, 코스별 Fee·얼리버드 계산)

[관리자] /admin/ → ?auth=1&key / ?all=1&key / ?registrations=1&key / POST action=updateCourses
```

- **수집 항목:** 제출시각, 신청 과정(복수 선택 가능, 한 셀에 여러 코스), 이름, 이메일, 전화번호, 자격 상태, 소속 스튜디오, 지역, 질문/요청, 교육 단계, 선수요건, 일정 참석, 기타.
- **식별자 없음.** 행 번호뿐이다. 코스 `id`(A, B, C…)는 일정 순서로 **매번 다시 매겨지므로 키로 쓸 수 없다**(09-14 로그). 코스 매칭은 정규화된 코스명 기준.
- 공개 사용자는 **로그인 없이** 신청한다 → 이 경험은 반드시 유지한다.

### B.5 Google Apps Script 의존성 목록

| # | 기능 | 호출자 | 인증 | 이전 대상? |
|---|---|---|---|---|
| G1 | `GET` 공개 코스 목록 + 남은 자리 | TrainingForm | 없음 | E3(나중) |
| G2 | `POST` 등록 접수 → 시트 기록 | TrainingForm | 없음 | **E2에서 Supabase가 기록 주체** |
| G3 | 관리자 알림 메일 | G2 내부 | — | 유지 (Apps Script가 계속 발송) |
| G4 | 신청자 웰컴 메일 (얼리버드 Fee 계산 포함) | G2 내부 | — | 유지 |
| G5 | `?auth=1` 관리자 로그인 확인 | /admin | ADMIN_KEY | 4B 이후 폐기 (Supabase Auth로 대체) |
| G6 | `?registrations=1` 등록자 목록 | /admin | ADMIN_KEY | **E1 동기화 소스로 재사용** → 4B 이후 폐기 |
| G7 | `?all=1` 숨김 코스 포함 목록 | /admin | ADMIN_KEY | E1에서 코스 미러 소스 |
| G8 | `POST action=updateCourses` 코스 저장 | /admin | ADMIN_KEY | E3(나중). 그전까지 레거시 화면 유지 |
| G9 | 편집기 수동 실행 함수 (`setupCoursesTab`, `sendTestEmail` 등) | 사장님 | 구글 로그인 | 유지 |

Script Properties: `ADMIN_KEY`, `NOTIFY_EMAIL`, `SENDER_ALIAS`, `REPLY_TO`.
⚠️ Apps Script는 **"배포 관리 → 연필 → 새 버전"**으로만 갱신해야 URL이 유지된다(`SETUP-KO.md`). "새 배포"를 누르면 사이트 연결이 끊긴다.

### B.6 데이터베이스·저장소 목록

| 저장소 | 내용 | 비고 |
|---|---|---|
| Google Sheet 접수 탭 | 지도자 과정 신청 이력 전체 | 유일한 원본. 백업 없음 |
| Google Sheet `Courses` 탭 | 코스·일정·정원·Fee·얼리버드 | 관리자 화면에서 편집 |
| 브라우저 `localStorage` | 언어 설정, 코스 목록 캐시 | |
| Mindbody | **일반 회원(수업 고객)·패키지·예약·결제** | 저장소 밖. 이 프로젝트와 연동 없음 |
| `public/pricing/*.png` | 가격표 **이미지** (데이터 아님) | 아래 F.6에서 시드 데이터로 사용 |

**학생 DB의 현실:** 지도자 과정 신청자는 시트에 있지만, **일상 결제를 하는 일반 수업 회원은 Mindbody에만 있다.**
→ Daily Income의 학생 검색이 쓸모 있으려면 Mindbody 고객 목록을 가져와야 한다 (O-2 결정).

### B.7 재사용 가능한 자산

| 자산 | 재사용 방식 |
|---|---|
| `tailwind.config.js` 토큰 (cream/sand/paper/ink/mute/sage/clay, Pretendard/Outfit, `ease-smooth`) | 그대로. 관리자 포털도 같은 설정으로 빌드 |
| 폰트 로딩 (`index.html`의 Pretendard CDN + Outfit) | 관리자 HTML에 같은 `<link>` |
| `TrainingForm`의 입력칸 클래스, `Chip`, 오류 스타일 | 클래스 문자열을 관리자 UI 모듈로 복제 (원본 수정 없음) |
| `LogoIcon` | 사이드바 브랜드 영역 |
| `studioToday()`의 LA 날짜 원칙 | 서버(DB)에서 같은 원칙 적용 |
| `lucide-react` | 이미 의존성 → 아이콘 한 가족으로 통일 |
| Apps Script 웰컴/알림 메일 템플릿 | **그대로 계속 사용** (E2에서도 발송 담당) |
| 레거시 `/admin` 코스 편집 화면 | E3 전까지 `/admin/legacy/`로 옮겨 유지 |

### B.8 기술적 제약

1. **GitHub Pages:** 서버 없음, 응답 헤더 설정 불가(CSP는 `<meta>`로), SPA 폴백 없음(`404.html`은 사이트 전체 1개라 `/staging`과 충돌).
2. **공개 저장소:** 마이그레이션 SQL·클라이언트 키가 공개된다. 공개 키(publishable)는 원래 공개용이라 괜찮지만, 보안은 **오직 서버(RLS·함수)**에 달려 있다.
3. **Supabase 기본 메일 서버:** 조직 멤버 주소로만 발송되고 시간당 2통 제한. 강사 초대·비밀번호 재설정에는 **커스텀 SMTP가 필수**다.
4. **Apps Script:** 요청당 1~3초, 동시 실행 제한. 배포 실수로 URL이 바뀔 위험이 있다.
5. **Mindbody:** API는 별도 개발자 계약과 호출당 과금이 있어 v1 범위 밖이다 → CSV 내보내기·가져오기로 대체.

### B.9 이전(Migration) 위험 요약
등록 유실, 중복 행, 시간대(시트 타임스탬프 형식), 코스 ID 불안정, Apps Script URL 변경, 공개 폼 장애, 스테이징 테스트 데이터가 실제 시트에 섞이는 문제. 상세는 K·N.

### B.10 권장 현대화 접근
**"감싸고, 미러링하고, 검증 후 전환."** 이미 잘 돌아가는 것(공개 폼·메일·코스 편집)은 처음에 건드리지 않는다.
새 가치(인증, 결제 기록, 지출, 마감)를 Supabase에 먼저 세우고, 등록 데이터는 읽기 전용 미러로 시작한다.

---

## C. Target System Architecture

```
                         letspilatesla.com  (GitHub Pages, 정적)
 ┌──────────────────────────────┐        ┌───────────────────────────────────────────┐
 │ 공개 사이트 /  (변경 없음)     │        │ 관리자 포털 /admin/*  (새 Vite 진입점)       │
 │ - 랜딩 섹션                   │        │ - React SPA, History API 라우팅             │
 │ - TrainingForm (공개 신청)     │        │ - 사이드바 + 헤더 + 콘텐츠                  │
 └─────────┬────────────────────┘        │ - supabase-js (공개 키 + 사용자 JWT)        │
           │                              └───────┬───────────────────────────────────┘
           │ E1: 기존대로 Apps Script                │ HTTPS (JWT)
           │ E2: Edge Function 경유                 ▼
           │                     ┌────────────────────────────────────────────────────┐
           │                     │ Supabase (staging / prod 별도 프로젝트)               │
           │                     │                                                    │
           │                     │  Auth ─ 이메일+비밀번호, 초대, 재설정 (커스텀 SMTP)    │
           │                     │    │                                               │
           │                     │  권한 계층 ─ RLS 정책 + is_owner()/is_active_staff() │
           │                     │    │                                               │
           │                     │  응용 서비스                                         │
           │                     │   ├ DB 함수(RPC): record_payment, finance_report,   │
           │                     │   │   close_period … (SECURITY DEFINER, 검사 내장)   │
           │                     │   ├ 트리거: 감사로그, 마감 잠금, 영업일 계산          │
           │                     │   ├ pg_cron: 정기 지출 생성, 등록 동기화             │
           │                     │   └ Edge Functions (service role 비밀키 보관):       │
           │                     │       staff-admin · sync-registrations ·            │
           │                     │       submit-enrollment(E2)                         │
           │                     │    │                                               │
           │                     │  PostgreSQL ─ staff, students, enrollments,        │
           │                     │    payments, expenses, periods, audit …            │
           │                     └───────────┬─────────────────────┬──────────────────┘
           │                                 │ E1: 주기적 pull      │ E2: 메일·시트 미러 요청
           ▼                                 ▼                     ▼
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │ Legacy: Google Apps Script + Google Sheets                                         │
 │  - 메일 발송(알림·웰컴)은 계속 담당     - 코스 목록 GET, 코스 편집은 E3까지 유지         │
 │  - 등록 기록: E1까지 원본 → E2부터 Supabase가 원본, 시트는 미러                         │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

**환경 분리:** 관리자 번들은 `import.meta.env.BASE_URL`이 `/staging/`이면 staging Supabase, 아니면 prod Supabase에 붙는다.
→ 배포 워크플로우를 수정하지 않는다 (워크플로우를 고치면 `main` 쪽 실행에서 옛 파일로 스테이징을 빌드하는 혼선이 생긴다).

---

## D. Admin Route Map

| 경로 | 목적 | 접근 | 비고 |
|---|---|---|---|
| `/admin/login` | 로그인 | 공개 | 로그인 상태면 `/admin`으로 |
| `/admin/set-password` | **초대 수락·비밀번호 재설정** | 공개 (메일 링크 토큰) | **추가된 경로.** 초대와 재설정이 같은 화면을 쓴다 |
| `/admin` | 역할별 대시보드 | 로그인 | OWNER → 재무 대시보드 / INSTRUCTOR → 간단 대시보드 |
| `/admin/enrollments` | 등록 관리 | OWNER | E1: 미러 + 상태·메모. 코스 편집은 레거시 링크 |
| `/admin/daily-income` | 결제 입력 (+ 오너: 전체 거래) | OWNER · INSTRUCTOR | 강사는 입력 폼, 오너는 입력 + 전체 거래 탭 |
| `/admin/daily-income/my-history` | 내 입력 이력 | OWNER · INSTRUCTOR | 항상 본인 것만 |
| `/admin/expenses` | 지출 | OWNER | 정기 지출 규칙은 `?tab=recurring` (별도 경로 없음) |
| `/admin/students` | 학생 | OWNER | 검색·상세(`?id=`)·병합·CSV 가져오기 |
| `/admin/staff` | 강사 계정·초대 | OWNER | |
| `/admin/reports` | 재무 리포트 | OWNER | 월 마감은 `?tab=closing&month=2026-09` |
| `/admin/settings` | 결제수단·가격표·지출 카테고리 | OWNER | |
| `/admin/account` | 내 계정 | 로그인 | 이름, 언어, 비밀번호 변경, 로그아웃 |
| `/admin/legacy/` | 기존 관리자 페이지 (이동) | 기존 ADMIN_KEY | E3까지 유지 후 삭제 |

**경로 결정의 근거 (ponytail):**
- 상세 화면은 `?id=`, 탭은 `?tab=`로 처리한다 → 동적 경로 파라미터가 필요 없어 라우터 라이브러리 없이 된다.
- **새로고침·딥링크 대응:** 빌드할 때 각 경로 폴더에 같은 `index.html` 복사본을 만든다(Vite 설정 15줄 내외).
  GitHub Pages가 `/admin/expenses` → `/admin/expenses/`로 자동 리다이렉트하고 그 파일을 서빙한다. 해시 라우팅(`#/`)·`404.html` 꼼수는 쓰지 않는다.
- 클라이언트 이동은 History API(`pushState`/`popstate`)로 한다 → 전체 새로고침 없음.
- **권한 없는 경로에 접근하면:** 비로그인 → `/admin/login?next=…`, 강사가 오너 경로 → `/admin`으로 보내고 안내 문구. (화면 보호는 편의일 뿐, 보안은 서버가 담당.)

**기존 링크·북마크:**
- `/admin/` 북마크 → 새 포털 로그인 화면이 열린다 (두 분께 안내).
- 기존 화면은 `/admin/legacy/`로 옮기고, Enrollments 화면에 "코스 편집 (기존 화면)" 링크를 둔다.
- 공개 Navbar에는 관리자 링크를 추가하지 않는다 (디자인 동결, 방문자 노출 불필요).

---

## E. UI/UX — 디자인 방향과 와이어프레임

### E.0 디자인 방향

**Design Read:** 오너 1~2명 + 강사 약 5명을 위한 **내부 운영 포털**. 기존 Let's Pilates의 Warm Editorial 언어를 그대로 쓰고,
외부 디자인 시스템 없이 **사이트 자체 Tailwind 토큰**만 사용하며, 움직임은 절제한다.

| 다이얼 | 값 | 이유 |
|---|---|---|
| DESIGN_VARIANCE | 3 | 운영 도구는 예측 가능해야 한다. 대칭 그리드, 왼쪽 정렬 |
| MOTION_INTENSITY | 2 | 상태 변화 피드백만 (저장됨, 드로어 열림). 장식 애니메이션 없음 |
| VISUAL_DENSITY | 강사 3 / 오너 5 | 강사 화면은 큰 터치 영역, 오너 리포트는 표·차트가 한 화면에 |

**디자인 규칙 (구현 시 체크리스트):**

| 항목 | 규칙 |
|---|---|
| 색 | 기존 팔레트만. 배경 cream, 카드 paper, 보조면 sand, 본문 ink, 보조 텍스트 mute, 강조(주요 버튼·활성 메뉴 아이콘) **sage 하나**. clay는 지출 차트 막대·배지에만 |
| 대비 (실측) | mute/cream 5.09 ✅, mute/paper 5.39 ✅, mute/sand 4.55 ✅(경계), sage/cream 5.37 ✅, cream/sage 버튼 5.37 ✅. **clay 글자/paper 3.23 ❌** → clay는 글자색으로 쓰지 않는다 (ink/clay 배지 5.37 ✅) |
| 형태 잠금 | 버튼·칩 = 완전 원형(pill), 입력칸 = 12px, 카드 = 16px, 모달 = 20px. 예외 없음 |
| 그림자 | ink 색조 6% (`rgba(28,26,22,0.06)`), 순수 검정 그림자 금지 |
| 타이포 | 페이지 제목·KPI 숫자 = Outfit, 본문·한글 = Pretendard. 숫자는 `tabular-nums` (자릿수 정렬) |
| 아이콘 | `lucide-react` 한 가족, stroke 1.75 고정. 직접 그린 SVG 아이콘 금지 |
| 상태 표시 | 색만으로 표시하지 않는다. 항상 아이콘 + 글자 (Paid ✓, Unpaid ◷, Void ⦸, Closed 🔒 → 실제로는 lucide 아이콘) |
| 상태 화면 | 모든 목록·카드에 로딩(모양 맞춘 스켈레톤), 빈 화면(다음 행동 버튼 포함), 오류(입력칸 아래 인라인 / 일시 알림은 토스트) |
| 폼 | 라벨은 입력칸 위, 오류는 아래. 플레이스홀더를 라벨 대신 쓰지 않는다. 숫자 입력은 `inputmode="decimal"` |
| 문구 | UI 문구에 em-dash(—) 금지, 꾸밈 문구 금지, 기능 동사 사용 ("Save payment", "Mark paid") |
| 가짜 데이터 금지 | 대시보드 카드는 **실제 데이터가 있을 때만** 숫자를 보여준다. 데이터가 없으면 빈 상태 + 시작 안내 |
| 접근성 | 키보드 이동, 포커스 링(sage 20%), `prefers-reduced-motion` 존중, 차트마다 "표로 보기" |
| 언어 | EN/KR 토글 (공개 사이트와 같은 저장 키 공유 → 고른 언어 유지) — O-8 |

**차트 계획 (`dataviz` 스킬 절차 적용, 라이브러리 없이 인라인 SVG):**

| 데이터 | 형태 | 색 |
|---|---|---|
| 오늘 / 이번 달 / 지출 / 예상이익 | **KPI 숫자 타일** (차트 아님) + 전월 대비 | 글자는 ink, 증감은 아이콘+부호 |
| 이번 달 일별 매출 | 세로 막대 (단일 계열) + 호버 툴팁 | sage 한 색 |
| 최근 6~12개월 매출 vs 지출 | 짝지은 세로 막대, **축 1개($)** | sage(매출) / clay(지출) + 범례 + 마지막 달 값 직접 표기 |
| 결제수단별 매출 | 가로 막대, 큰 순 정렬, 값 라벨 (파이 차트 금지) | sage 한 색 |
| 지출 카테고리별 | 가로 막대, 큰 순 정렬 (12개 → 표 병행) | clay 한 색 |
| 예상 영업이익 | 차트 대신 월별 표 + 타일 | — |

**팔레트 검증 결과** (`validate_palette.js`, 흰 배경):
sage `#5E6B4F` ↔ clay `#B08763` → 색각이상 구분 ΔE 11.9 ✅, 정상 시각 ΔE 16.0 ✅, 배경 대비 ✅, **채도 하한 ❌**(브랜드 색이 차분해서 회색처럼 읽힐 수 있음).
→ 대응: 두 계열 차트에는 **범례 + 직접 라벨 + 표 보기**를 항상 함께 둔다. 차트 전용 고채도 변형 색을 쓰려면 디자인 승인 필요 (O-11).

### E.1 Admin Login (모바일 우선, 데스크톱 동일 카드)

```
┌──────────────────────────────────────────┐
│                                          │
│   [logo] Let's Pilates LA                │
│          Studio Admin                    │
│                                          │
│   Email                                  │
│   ┌────────────────────────────────────┐ │
│   │                                    │ │
│   └────────────────────────────────────┘ │
│   Password                        [Show] │
│   ┌────────────────────────────────────┐ │
│   │                                    │ │
│   └────────────────────────────────────┘ │
│   (오류) Email or password is incorrect.  │  ← 계정 존재 여부를 드러내지 않는 문구
│                                          │
│   ┌────────────────────────────────────┐ │
│   │             Sign in                │ │  sage pill
│   └────────────────────────────────────┘ │
│   Forgot password?                       │
│                                 EN | KR  │
└──────────────────────────────────────────┘
 · 비활성 계정: "This account is inactive. Contact the studio owner."
 · 세션 만료로 돌아온 경우: "Your session ended. Please sign in again." 후 원래 페이지로 복귀
```

### E.2 Owner Dashboard (데스크톱 1280px) — 숫자는 형태 설명용 예시

```
┌────────────┬──────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR    │ Dashboard                          ‹ October 2026 ›     [+ Add payment]   │
│ (E.4)      ├──────────────────────────────────────────────────────────────────────────┤
│            │ ┌ Today ─────────┐┌ October revenue ┐┌ October expenses ┐┌ Est. profit ───┐ │
│            │ │ $1,240         ││ $18,430 net     ││ $7,820           ││ $10,610        │ │
│            │ │ 9 payments     ││ +6% vs Sep      ││ $3,000 unpaid    ││ estimate, not  │ │
│            │ │                ││                 ││                  ││ bank balance(i)│ │
│            │ └────────────────┘└─────────────────┘└──────────────────┘└────────────────┘ │
│            │ ┌ Daily revenue · October ─────────────────────┐┌ Needs attention ─────────┐ │
│            │ │ ▂ ▅ ▃ █ ▆ ▂ ▄ ▇ ▃ ▅ ...   (sage, hover 툴팁)   ││ (!) Rent due Nov 1       │ │
│            │ │                                 [Table view] ││ (i) 2 walk-in payments   │ │
│            │ └──────────────────────────────────────────────┘│     to link to students  │ │
│            │ ┌ Revenue vs expenses · 6 months ──────────────┐│ (i) September not closed │ │
│            │ │ ■ Revenue ■ Expenses   (짝 막대, 축 1개)       ││ (i) 3 new enrollments    │ │
│            │ └──────────────────────────────────────────────┘└──────────────────────────┘ │
│            │ ┌ By payment method ──────────┐┌ Expenses by category ──────────────────┐     │
│            │ │ Zelle  ████████████  $7,210  ││ Studio Rent        ██████████  $3,000  │     │
│            │ │ Cash   ███████       $4,120  ││ Instructor Comp.   ████████    $2,600  │     │
│            │ │ ...                          ││ ...                                    │     │
│            │ └──────────────────────────────┘└────────────────────────────────────────┘     │
│            │ ┌ Recent activity ──────────────────────────────────────────────────────────┐ │
│            │ │ 2:14 PM  Payment     $100.00  Cash   Student A      by Instructor A       │ │
│            │ │ 1:02 PM  Enrollment  GYROTONIC® Level 1 Foundation   Applicant B          │ │
│            │ │ 9:30 AM  Expense     $480.00  Utilities (estimate)                         │ │
│            │ └──────────────────────────────────────────────────────────────────────────┘ │
│            │ [Add payment] [Add expense] [Enrollments] [Reports] [Staff]                   │
└────────────┴──────────────────────────────────────────────────────────────────────────┘
 모바일: KPI 2×2 → 차트 세로 스택 → 활동 목록. "Est. profit" (i)를 누르면 계산식 설명 (J.1).
 이번 달 진행 중에는 "월 고정비 전체 vs 지금까지 매출"이라 이익이 낮게 보인다 → 타일 아래 한 줄 설명.
```

### E.3 Instructor Dashboard (iPhone 393px)

```
┌───────────────────────────────┐
│ Let's Pilates LA        (IA)  │  ← 이니셜 = 계정 메뉴
├───────────────────────────────┤
│ Hello, Instructor A           │
│                               │
│ ┌───────────────────────────┐ │
│ │  +  Record a payment      │ │  큰 sage 버튼 (높이 56px)
│ └───────────────────────────┘ │
│                               │
│ Today · my entries            │
│ ┌───────────────────────────┐ │
│ │ 2:14 PM  Student A        │ │
│ │ $100.00 · Cash      Valid │ │
│ ├───────────────────────────┤ │
│ │ 11:05 AM Walk-in          │ │
│ │ $40.00 · Venmo      Valid │ │
│ └───────────────────────────┘ │
│ My total today: $140.00       │  ← 본인 것만 (O-7). 스튜디오 합계 없음
│ See my history  →             │
├───────────────────────────────┤
│  Home   Payment  History  Me  │  하단 탭 4개 (강사 전용)
└───────────────────────────────┘
 강사 화면에는 차트·스튜디오 합계·지출·이익이 존재하지 않는다 (렌더 자체를 하지 않고, 서버도 거부).
```

### E.4 Sidebar & Admin Layout

```
데스크톱 (≥1024px)                          태블릿 (768~1023px)        모바일 (<768px)
┌────────────────┬────────────────────┐      ┌────┬──────────────┐      ┌──────────────────┐
│ [logo] Let's   │ Page title     (CL)│      │ ≡  │ Page title   │      │ ≡  Page title (CL)│
│ Pilates LA     ├────────────────────┤      │ ◉  ├──────────────┤      ├──────────────────┤
│                │ Breadcrumb (선택)   │      │ ○  │              │      │                  │
│ ◉ Dashboard    │                    │      │ ○  │  content     │      │  content         │
│ ○ Enrollments  │  content           │      │ ○  │              │      │  (1열)           │
│ ○ Daily Income │                    │      │ ○  │              │      │                  │
│ ○ Expenses     │                    │      │ ○  │              │      │                  │
│ ○ Students     │                    │      │    │              │      │                  │
│ ○ Staff        │                    │      │ ↧  │              │      │                  │
│ ○ Reports      │                    │      └────┴──────────────┘      └──────────────────┘
│ ○ Settings     │                    │      아이콘 레일(72px), ≡로       ≡ → 왼쪽 드로어
│ ─────────────  │                    │      펼치면 오버레이              (포커스 가둠, ESC 닫힘)
│ (CL) Name      │                    │                                 강사는 하단 탭(E.3)
│ Owner          │                    │
│ Log out        │                    │
│ « Collapse     │                    │
└────────────────┴────────────────────┘
 사이드바 240px 고정, 접으면 72px 아이콘 레일. 활성 항목 = sand 배경 + ink 글자 + sage 아이콘 (굵은 강조 보더 없음).
 헤더: 페이지 제목(Outfit) · 페이지별 주요 버튼 · 언어 토글 · 계정 메뉴(Account, Log out).
 강사 메뉴: Dashboard · Daily Income · My History · My Account (오너 메뉴는 데이터로도 내려오지 않음).
```

### E.5 Enrollment Management (OWNER)

```
Enrollments                          Synced 10:42 AM  [Sync now]   [Edit courses (legacy) ↗]
[Course ▾] [Status ▾] [Month ▾] [Search name or email        ]
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Submitted    Applicant      Course                               Fee     Paid  Status │
│ Oct 8, 2:10  Applicant B    GYROTONIC® Level 1 Foundation        $350    $0    New  ▾ │
│ Oct 6, 9:41  Applicant C    GYROTONIC® Jumping Stretching Board  $250    $250  Confirmed│
│ ...                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
행 클릭 → 오른쪽 상세 드로어:
 ┌ Applicant B ─────────────────────────────┐
 │ email (탭하면 메일) · phone (탭하면 전화)   │
 │ Form answers: 자격 상태, 소속, 지역, ...    │  ← 원본 응답 그대로 (form_data)
 │ Student record: linked ✓  [Open]          │
 │ Agreed fee: $350 (early bird, edit)       │
 │ Payments: none yet   [Record payment]     │  ← 결제는 자동 가정하지 않는다
 │ Status: New ▾   Note: [            ]      │
 └───────────────────────────────────────────┘
 E1 기간에는 신청 원본 필드는 읽기 전용(시트가 원본), 상태·메모·연결만 편집 가능.
 모바일: 표 → 카드 목록.
```

### E.6 Daily Income — Payment Entry (iPhone, 가장 중요한 화면)

```
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ ←  Record payment             │   │ ←  Record payment             │
├───────────────────────────────┤   ├───────────────────────────────┤
│ Student                       │   │ Student                       │
│ ┌───────────────────────────┐ │   │ ┌ Student A · ···4821 ─[x]─┐  │
│ │ Search name…              │ │   │ └──────────────────────────┘  │
│ └───────────────────────────┘ │   │ Amount                        │
│ Recent                        │   │ ( Balance $250 · L1 course )  │ ← 근거 표시
│ ┌───────────────────────────┐ │   │ ( Private 10 · $900 )         │ ← 칩, 하나 선택 시 금액 채움
│ │ Student A   ···4821       │ │   │ ( Private 1 · $100 )          │
│ │ last paid Sep 30          │ │   │ ┌───────────────────────────┐ │
│ ├───────────────────────────┤ │   │ │ $ 250.00                  │ │ inputmode=decimal
│ │ Student A   ···0193       │ │   │ └───────────────────────────┘ │
│ │ new · registered Oct 2    │ │   │ Method                        │
│ ├───────────────────────────┤ │   │ [Cash] [Zelle✓] [Venmo]       │ ← 이 기기에서 마지막 사용값 선택
│ │ + Walk-in / not registered│ │   │ [Credit] [Debit] [Check] [Other]│
│ └───────────────────────────┘ │   │ + Add note                    │
│                               │   ├───────────────────────────────┤
│                               │   │ ┌───────────────────────────┐ │
│                               │   │ │ Received $250 by Zelle ·  │ │ sticky 하단 버튼 =
│                               │   │ │ Save                      │ │ "받았음" 확인 + 저장
│                               │   │ └───────────────────────────┘ │
└───────────────────────────────┘   └───────────────────────────────┘
 같은 이름: 전화 끝 4자리 + 최근 결제일/등록일로 구분 (이메일·전체 번호는 강사에게 보내지 않음).
 Walk-in: 이름(선택) + "Walk-in" 표시. 학생 레코드는 만들지 않음 → 오너가 나중에 연결.
 저장 후: 시트 "Saved · $250.00 Zelle · Student A · 2:14 PM"  [Record another] [Done]
 중복 의심(같은 학생·같은 금액·10분 이내): "A $250 Zelle payment for Student A was saved 3 min ago.
   [Cancel] [Save anyway]"   ← 서버가 판단, 같은 요청 재전송은 조용히 1건으로 처리
 보통 흐름: 검색 → 선택 → (금액·수단 자동) → 저장 = 3~4번 탭.
```

### E.7 Owner Daily Income Overview (데스크톱)

```
Daily Income            [Transactions] [Record payment]                         [Export CSV]
[Oct 1 → Oct 31 ▾] [Instructor ▾] [Student      ] [Method ▾] [Status ▾]  Clear
 Gross $18,630 · Refunds $200 · Net $18,430 · 142 payments          ← 필터 결과 합계
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Date / time    Student       Recorded by    Method  Kind     Amount     Status    ⋯  │
│ Oct 9 2:14 PM  Student A     Instructor A   Cash    Payment  $100.00    Valid     ⋯  │
│ Oct 9 1:40 PM  Walk-in       Instructor B   Venmo   Payment  $40.00     Valid  (link)│
│ Oct 8 6:02 PM  Student C     Owner          Zelle   Refund   −$200.00   Valid     ⋯  │
│ Oct 8 5:10 PM  Student D     Instructor A   Cash    Payment  $̶1̶0̶0̶.̶0̶0̶    Void      ⋯  │
└──────────────────────────────────────────────────────────────────────────────────────┘
 ⋯ 메뉴: Correct (열린 달만) · Void (사유 필수) · Refund (원거래 연결) · Adjust (마감 후 보정) · History(감사 이력)
 마감된 달의 행: 🔒 표시, Correct/Void 비활성 + "Month closed. Reopen or post an adjustment."
```

### E.8 Expense Management (OWNER)

```
Expenses          [Expenses] [Recurring rules]         ‹ October 2026 ›      [Export CSV]
 Total $7,820 · Paid $4,820 · Unpaid $3,000 (2)                       [+ Add expense]
[Category ▾] [Status ▾] [Search description       ]
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Date    Category              Description            Amount     Status       ⋯       │
│ Oct 1   Studio Rent  ↻        Monthly studio rent    $3,000.00  Unpaid ◷ [Mark paid] │
│ Oct 1   Software      ↻       Mindbody subscription  $279.00    Paid ✓ Oct 1          │
│ Oct 5   Instructor Comp.      Instructor A, Sep      $1,300.00  Paid ✓ Oct 5          │
│ Oct 9   Utilities     ↻ est.  Electricity            $180.00    Unpaid ◷ (estimate)   │
└──────────────────────────────────────────────────────────────────────────────────────┘
 ↻ = 정기 규칙에서 생성, est. = 추정 금액 (마감 전에 실제 금액 확인 요청)
 [Mark paid] → 시트: 지급일(기본 오늘), 지급 방법, 메모 → Paid

Add expense (모달 / 모바일은 전체 화면)
 Category* [Studio Rent ▾]   Description* [            ]   Amount* [$      ]
 Expense date* [2026-10-01]  Due date [      ]   Vendor / Payee [      ]
 Status (•) Unpaid ( ) Paid → Paid date, Method
 Note [                    ]                                 [Cancel] [Save expense]

Recurring rules 탭
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Category      Description          Amount     Due day  From      Until   Active  ⋯  │
│ Studio Rent   Monthly studio rent  $3,000.00  1        2026-11   none    On         │
│ Utilities     Electricity (est.)   $180.00    15       2026-11   none    On         │
└──────────────────────────────────────────────────────────────────────────────────────┘
 금액 변경 시: "Apply from [Nov 2026 ▾]. Already created months keep their amounts." (+ 이번 달 미지급분에도 적용? 체크)
```

### E.9 Financial Reports (OWNER)

```
Reports         [Overview] [Monthly closing]
Period: (•) Month ‹ October 2026 ›  ( ) Year to date  ( ) Custom [from] [to]
Filters: [Method ▾] [Instructor ▾] [Expense category ▾]                       [Export CSV]
┌ October 2026 · OPEN ──────────────────────────────────────────────────────────────────┐
│ Gross revenue                 $18,630.00   (includes adjustments $0.00)                │
│ − Refunds                        $200.00                                               │
│ = Net revenue                 $18,430.00                                               │
│ − Operating expenses           $7,820.00   (paid $4,820.00 · outstanding $3,000.00)    │
│ = Estimated operating profit  $10,610.00                                               │
│   Management estimate. Not bank balance, not taxable income.  [How is this calculated?]│
└───────────────────────────────────────────────────────────────────────────────────────┘
[Revenue vs expenses · 12 months]  [Daily revenue]  [By method]  [By instructor]  [By category]
┌ Months · 2026 ─────────────────────────────────────────────────────────────────────────┐
│ Month   Net revenue   Expenses    Est. profit   Payments  Status                       │
│ Sep     $19,680.00    $8,020.00   $11,660.00    142       Closed 🔒 Oct 3              │
│ Oct     $18,430.00    $7,820.00   $10,610.00    131       Open                         │
│ YTD     ...                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### E.10 Monthly Closing (OWNER)

```
Reports › Monthly closing      ‹ September 2026 ›                         Status: OPEN
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ✓ Review payments          142 valid · gross $19,880.00 · by method / by instructor  │
│                            (!) 2 walk-in payments not linked        [Review]  [Confirm]│
│ ☐ Review refunds & voids   1 refund −$200.00 · 3 voids               [Review]  [Confirm]│
│ ☐ Review expenses          14 entries $8,020.00                                        │
│                            (!) Utilities is an estimate: enter actual or keep          │
│                            (i) 1 unpaid $500.00 (allowed, stays visible)  [Review] [Confirm]│
│ ☐ Review results           Net revenue $19,680.00 · Expenses $8,020.00                 │
│                            Est. operating profit $11,660.00 · vs Aug +4%     [Confirm] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                       [ Close September 2026 ]   (위 4개 확인 전에는 비활성)             │
└──────────────────────────────────────────────────────────────────────────────────────┘
 확인 대화상자: 요약 숫자 + "Payments and expenses dated in September will be locked." [Cancel] [Close month]
 마감 후: "Closed by (Owner) · Oct 3, 9:12 AM · version 1"
          [Export report (CSV)] [Print summary] [Reopen…] ← 사유 입력 필수, 감사로그 기록
 재마감 시 version 2, 이전 스냅샷은 감사로그에 보존.
```

### E.11 Staff Account Management (OWNER)

```
Staff                                                                  [+ Invite instructor]
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Name           Email                 Role        Tier       Status     Last sign-in  ⋯ │
│ Owner name     owner@…               Owner       n/a        Active     Today          │
│ Instructor A   a@…                   Instructor  Certified  Active     Oct 9          ⋯ │
│ Instructor C   c@…                   Instructor  Master     Invited    never [Resend]⋯ │
│ Instructor D   d@…                   Instructor  Certified  Inactive   Aug 2          ⋯ │
└──────────────────────────────────────────────────────────────────────────────────────┘
 ⋯ : Deactivate / Reactivate · Change pricing tier · Make owner (확인 대화상자) · Cancel invitation
 비활성화해도 과거 결제 기록의 "Recorded by"는 그대로 남는다.

Invite instructor (모달)
 Full name* [            ]   Email* [            ]   Pricing tier [Certified ▾]
 "They will get an email to set a password. The link expires in 24 hours."   [Cancel] [Send invite]
```

---

## F. Database Architecture

### F.1 ERD

```
 auth.users ──1:1── staff_profiles ───────────────┐ (recorded_by / collected_by / payee)
                      │ role OWNER|INSTRUCTOR|STAFF│
                      │                            │
 students ──1:N── enrollments ──N:1── courses      │
    │  (merged_into → students)   │                │
    │                             │                │
    │ 0..1                        │ 0..1           │
    └──────────────┐   ┌──────────┘                │
                   ▼   ▼                           │
 payment_methods ─1:N─ payment_transactions ◄──────┘
 price_items ─────1:N─┘   │ related_transaction_id → payment_transactions (refund/adjust)
                          │ business_date → accounting_periods.month (lock)
 expense_categories ─1:N─ expenses ─N:1─ recurring_expense_rules
                          │ expense_date → accounting_periods.month (lock)
 accounting_periods (월별 OPEN/CLOSED, 스냅샷)
 audit_logs (모든 금전·권한 변경의 전/후 기록, 추가만 가능)
```

### F.2 테이블 정의 (요약 DDL — 실제 SQL은 Phase별 마이그레이션에서 작성)

```sql
-- 공통: 모든 PK uuid default gen_random_uuid() (staff는 auth.users id),
--       모든 타임스탬프 timestamptz, 모든 금액 bigint(센트), 모든 FK ON DELETE RESTRICT,
--       모든 테이블 RLS enable, 물리 삭제 대신 status/active.

staff_profiles (                       -- 명세의 profiles + user_roles 통합 (1인 1역할)
  user_id        uuid PK  → auth.users(id) RESTRICT,
  full_name      text NOT NULL CHECK (length between 1 and 80),
  email          text NOT NULL,
  role           text NOT NULL CHECK (role IN ('OWNER','INSTRUCTOR','STAFF')),   -- 역할 추가 = CHECK 수정 (STAFF: 2026-10-10)
  status         text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','INACTIVE')),
  pricing_tier   text CHECK (pricing_tier IN ('CERTIFIED','MASTER')),
  invited_at, activated_at, deactivated_at, created_at, updated_at
)

students (
  id, full_name text NOT NULL,
  email text, email_norm text GENERATED (lower(trim(email))),
  phone text,            -- 숫자만 정규화
  status text DEFAULT 'ACTIVE' CHECK IN ('ACTIVE','INACTIVE'),
  source text CHECK IN ('REGISTRATION','MINDBODY_IMPORT','MANUAL'),
  external_ref text,     -- 예: Mindbody Client ID
  merged_into uuid → students(id),   -- 병합된 중복 레코드 (삭제 안 함)
  notes text, created_at, updated_at,
  UNIQUE (email_norm) WHERE email_norm IS NOT NULL AND merged_into IS NULL,
  UNIQUE (source, external_ref) WHERE external_ref IS NOT NULL
)

courses (                              -- E1: 시트 Courses 탭 미러 (E3 전까지 읽기 전용)
  id, course_key text UNIQUE NOT NULL, -- 정규화된 name_en (시트의 A/B/C id는 불안정해서 키로 안 씀)
  name_en, name_kr, dates text,
  fee_cents, fee_early_cents bigint, early_until date,
  capacity int, active bool, synced_at
)

enrollments (
  id, student_id → students NOT NULL, course_id → courses (NULL = 코스명 매칭 실패, 검토 필요),
  course_label text NOT NULL,          -- 시트 원문 ("D - Gyrotonic® Level 1 ...")
  submitted_at timestamptz NOT NULL,
  status text DEFAULT 'NEW' CHECK IN ('NEW','IN_DISCUSSION','CONFIRMED','CANCELLED'),
  agreed_fee_cents bigint,             -- 신청 시점 유효 Fee 스냅샷 (얼리버드 규칙), 오너 수정 가능
  form_data jsonb NOT NULL,            -- 나머지 응답 원본 그대로 (새 필수 필드 만들지 않음)
  source text CHECK IN ('SHEET_IMPORT','WEB_FORM'),
  source_key text UNIQUE NOT NULL,     -- 재실행 중복 방지 키: 시트 수입분은 합성 키(K.2), 4B 이후는 submission_id+순번(K.4)
  relay_status text,                   -- 4B: Apps Script 메일·미러 요청 결과 (OK / FAILED)
  notes text, created_at, updated_at
)

price_items (                          -- 가격표 (설정에서 관리)
  id, name_en, name_ko, category text CHECK IN ('PRIVATE','DUET','GYROTONIC_GROUP','PILATES_GROUP','OTHER'),
  tier text CHECK IN ('CERTIFIED','MASTER'), sessions int CHECK > 0,
  price_cents bigint CHECK > 0, active bool, sort_order int
)

payment_methods (id, code text UNIQUE, label_en, label_ko, active bool, sort_order int)

payment_transactions (                 -- 명세 이름 그대로
  id,
  kind   text NOT NULL CHECK IN ('PAYMENT','REFUND','ADJUSTMENT'),
  status text NOT NULL DEFAULT 'VALID' CHECK IN ('VALID','VOID'),
  amount_cents bigint NOT NULL,
    CHECK ((kind = 'ADJUSTMENT' AND amount_cents <> 0) OR (kind <> 'ADJUSTMENT' AND amount_cents > 0)),
    CHECK (abs(amount_cents) <= 2000000),          -- $20,000 상한 (오타 방지)
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  payment_method_id → payment_methods,           -- PAYMENT/REFUND 필수 (CHECK)
  student_id → students,                         -- NULL = walk-in
  payer_name text NOT NULL,                      -- 학생 이름 스냅샷 또는 walk-in 표기
  enrollment_id → enrollments, price_item_id → price_items,
  suggested_amount_cents bigint,                 -- 시스템 제안값 (수정 여부 추적)
  related_transaction_id → payment_transactions, -- REFUND·ADJUSTMENT의 원거래
  recorded_by → staff_profiles NOT NULL,         -- 서버가 auth.uid()로 강제
  recorded_by_name text NOT NULL,                -- 이름 스냅샷 (퇴사·개명에도 이력 유지)
  collected_by → staff_profiles NOT NULL,        -- 실제 돈을 받은 사람 (기본 = 입력자)
  recorded_at timestamptz NOT NULL DEFAULT now(),
  business_date date NOT NULL,                   -- LA 기준, 트리거가 계산
  notes text CHECK (length <= 500 AND regexp_replace(notes, '[\s-]', '', 'g') !~ '\d{13,19}'),  -- 카드번호 차단(공백·대시 무시)
  reason text,                                   -- void/refund/adjust 사유
  client_request_id uuid UNIQUE NOT NULL,        -- 중복 제출 방지 (멱등 키)
  voided_at, voided_by → staff_profiles, created_at, updated_at, updated_by
)
  INDEX (business_date) WHERE status = 'VALID'
  INDEX (recorded_by, business_date DESC)
  INDEX (student_id, business_date DESC)

expense_categories (id, code UNIQUE, name_en, name_ko, is_operating bool DEFAULT true, active, sort_order)

expenses (
  id, category_id → expense_categories NOT NULL,
  description text NOT NULL, vendor text,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),   -- 음수 = 업체 환급/크레딧 (사유 필수)
  expense_date date NOT NULL,                 -- 이 날짜의 달에 귀속
  period_month date GENERATED (date_trunc('month', expense_date)),
  due_date date,
  payment_status text NOT NULL DEFAULT 'UNPAID' CHECK IN ('UNPAID','PAID'),
  paid_at date, payment_method text,          CHECK ((payment_status = 'PAID') = (paid_at IS NOT NULL)),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK IN ('ACTIVE','VOID'),
  recurring_rule_id → recurring_expense_rules,
  is_estimate bool DEFAULT false,
  payee_staff_id → staff_profiles,            -- 강사 보수 (향후 자동 계산 대비 연결고리)
  notes, created_by, created_at, updated_at, updated_by,
  UNIQUE (recurring_rule_id, period_month) WHERE recurring_rule_id IS NOT NULL   -- 정기 지출 중복 방지
)
  INDEX (expense_date), INDEX (category_id, expense_date), INDEX (expense_date) WHERE payment_status = 'UNPAID'

recurring_expense_rules (
  id, category_id, description, vendor, amount_cents CHECK > 0,
  frequency text DEFAULT 'MONTHLY' CHECK (frequency = 'MONTHLY'),   -- 지금은 월간만
  due_day int CHECK BETWEEN 1 AND 31,         -- 31일 없는 달은 말일
  start_month date NOT NULL, end_month date,  -- 둘 다 그달 1일
  is_estimate bool, payee_staff_id, active bool, created_by, created_at, updated_at
)

accounting_periods (                   -- 명세의 monthly_closings
  month date PK CHECK (extract(day from month) = 1),
  status text NOT NULL DEFAULT 'OPEN' CHECK IN ('OPEN','CLOSED'),
  version int NOT NULL DEFAULT 0,      -- 마감할 때마다 +1
  closed_by, closed_at, reopened_by, reopened_at, reopen_reason,
  snapshot jsonb                       -- 마감 시점 요약 (J.1 수치 전체)
)

audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PK, at timestamptz DEFAULT now(),
  actor_user_id uuid, action text, entity_type text, entity_id text,
  before jsonb, after jsonb, reason text
)  INDEX (entity_type, entity_id), INDEX (at DESC)
```

### F.3 설계 결정과 ponytail 판단

| 결정 | 이유 |
|---|---|
| `profiles` + `user_roles` → **`staff_profiles` 하나** | 한 사람은 역할 하나. 역할 추가는 CHECK 한 줄 수정. 조인과 테이블 하나를 줄임 |
| `studio_id` 컬럼 **넣지 않음** | 지점 1개. 나중에 필요하면 `ADD COLUMN ... DEFAULT` + 백필로 몇 분이면 끝남 (지금 넣으면 모든 쿼리·정책에 조건이 붙음) |
| 일반 수업 패키지용 "구매/잔여 회차" 테이블 **없음** | 회차 관리는 Mindbody가 한다. 결제에 `price_item_id`만 남겨 두면 나중에 집계 가능 |
| 강사 보수 규칙 테이블 **없음** | 규칙·원천 데이터가 정해지지 않음. `expenses.payee_staff_id`가 나중 자동화의 연결고리 |
| 학생 이름 검색 인덱스(pg_trgm) **보류** | 학생 수백~수천 명이면 `ILIKE`로 충분. 느려지면 추가 |
| 결제수단 = 테이블, 지출 지급방법 = 텍스트 | 명세상 결제수단은 오너가 관리. 지출 쪽(자동이체·ACH 등)은 집계 대상이 아니라 텍스트로 충분 |

### F.4 인덱스·제약 요약
- 금액: `bigint` 센트, 0·음수·상한을 DB가 검사. 부동소수 금지.
- 멱등: `payment_transactions.client_request_id UNIQUE`, `enrollments.source_key UNIQUE`, `expenses (recurring_rule_id, period_month) UNIQUE`.
- 이력 보존: **모든 FK `ON DELETE RESTRICT`**. 사용자·학생·카테고리·결제수단은 비활성화만 가능.
- 날짜: 저장은 `timestamptz`(UTC), 영업일은 `(recorded_at AT TIME ZONE 'America/Los_Angeles')::date`를 트리거가 계산.

### F.5 기존 → 신규 필드 매핑 (접수 탭 Sheet3)

| 시트 열 | 대상 | 변환 |
|---|---|---|
| A 제출시각 | `enrollments.submitted_at` | Apps Script 시간대로 해석 → UTC 저장. 시간대 설정 확인 필요 (K.2) |
| B 신청 과정 | `enrollments.course_label` (+ `course_id`) | **쉼표로 나뉜 복수 코스 → 코스마다 enrollment 1건.** 코스명 정규화 매칭, 실패하면 `course_id NULL` + 검토 표시 |
| C 이름 | `students.full_name` | trim |
| D 이메일 | `students.email` | 소문자·trim. `@` 없는 행은 Apps Script와 같은 규칙으로 **제외 + 무효 목록 보고** |
| E 전화번호 | `students.phone` | 숫자만. 전체 번호는 오너만 열람 |
| F~M (자격, 소속, 지역, 질문, 단계, 선수요건, 일정, 기타) | `enrollments.form_data` jsonb | 원문 그대로 (새 컬럼 만들지 않음) |
| (없음) | `enrollments.source_key` | `sha256(submitted_at_iso | email_norm | course_label 정규화)` |
| (없음) | `enrollments.agreed_fee_cents` | 신청 LA 날짜 < `early_until` 이면 얼리버드, 아니면 정가 (`effectiveFee_`와 같은 규칙) |

**Courses 탭** → `courses`: `name_en`→`course_key`(정규화), `fee`/`fee_early` 문자열("$1,225")→센트, 숫자로 해석되지 않는 값("TBD")→NULL + 경고, `early_until`→date.

**Mindbody 고객 CSV**(O-2) → `students`: Client ID→`external_ref`, 이름·이메일·전화. 이메일이 같은 등록 학생이 있으면 **같은 레코드에 연결**(중복 생성 안 함).

### F.6 초기 시드 데이터 (확인 필요)
- **결제수단 7개:** Cash, Zelle, Venmo, Credit Card, Debit Card, Check, Other.
- **지출 카테고리 12개:** Studio Rent, Instructor Compensation, Utilities, Internet / Phone, Insurance, Software Subscriptions, Equipment, Studio Supplies, Cleaning / Maintenance, Marketing, Payment Processing Fees, Other Expenses.
- **가격표** (`public/pricing/*.png`에서 읽음, 사장님 확인 필요):

| 항목 | Certified | Master-Level |
|---|---|---|
| Private 1회 / 10회 | $100 / $900 | $140 / $1,200 |
| Duet 1회 / 10회 | $140 / $1,200 | $160 / $1,400 |
| GYROTONIC® Group 1회 / 10회 | $55 / $450 | — / $600 |
| Pilates Group 1회 / 10회 | $40 / $350 | — |

  ⚠️ Duet의 "per person" 표기가 두 이미지에서 다르다(회당 1인 vs 패키지 1인). 2인이 나눠 내는 경우를 확인해야 한다 (O-9).

---

## G. Authentication Design

| 항목 | 설계 |
|---|---|
| **방식** | Supabase Auth 이메일+비밀번호. **공개 가입 끔** (Allow new users to sign up = OFF) |
| **첫 오너 (bootstrap)** | ① 사장님이 Supabase 대시보드 → Authentication → Add user(본인 이메일, 본인이 정한 비밀번호) ② SQL Editor에서 `select app.bootstrap_owner('본인 이메일');` 한 번 실행. 이 함수는 **OWNER가 아직 없을 때만** 동작하고, anon/authenticated 실행 권한이 없다 (대시보드 SQL Editor = 프로젝트 관리자만). 코드·저장소에 비밀번호 없음 |
| **두 번째 오너** | 기존 오너가 Staff 화면에서 "Make owner" (DB 함수, 확인 대화상자, 감사로그). 마지막 오너는 강등·비활성화 불가 |
| **강사 초대** (→ 2026-10-10 변경: 아래 결정 참고) | Staff → Invite → Edge Function `staff-admin`(action=invite): ① 호출자 JWT 검증 ② DB에서 호출자가 활성 OWNER인지 확인 ③ service role로 `inviteUserByEmail(email, redirectTo=/admin/set-password/)` ④ `staff_profiles` INSERT (INSTRUCTOR, INVITED) ⑤ 감사로그 |
| **초대 수락** | 메일 링크 → `/admin/set-password` → 비밀번호 설정 → 첫 로그인 시 `activate_my_account()`가 INVITED→ACTIVE. 링크 만료 시 오너가 [Resend] |
| **로그인** | `signInWithPassword` → `me()` 호출로 역할·상태 확인 → INACTIVE면 즉시 로그아웃 + 안내 |
| **로그아웃** | `signOut()` (이 기기 세션 종료). 계정 메뉴와 사이드바 하단 |
| **비밀번호 재설정** | 로그인 화면 "Forgot password?" → `resetPasswordForEmail(redirectTo=/admin/set-password/)` → 새 비밀번호. 응답 문구는 계정 존재 여부와 관계없이 동일 |
| **세션** | supabase-js가 `localStorage`에 저장, 액세스 토큰 자동 갱신(기본 1시간 만료, 갱신 토큰 회전). 갱신 실패·401 → `/admin/login?next=원래경로`. 스튜디오 공용 iPad를 쓰면 일정 시간 무활동 시 자동 로그아웃(O-12) |
| **비활성화** | `staff_profiles.status = INACTIVE` → **모든 RLS·함수가 즉시 거부**(매 요청 DB 조회, JWT에 역할을 넣지 않음 → 토큰이 남아 있어도 데이터 0). 추가로 Edge Function이 Auth 사용자를 ban 처리해 로그인·토큰 갱신도 차단. 결제 기록은 그대로 |
| **역할 위조 방지** | 역할은 `staff_profiles`에만 있고 사용자에게 UPDATE 권한이 없다. `user_metadata`(사용자가 수정 가능)는 권한 판단에 쓰지 않는다 |
| **메일 발송** | **커스텀 SMTP 필수** (기본 메일은 팀 멤버에게만, 시간당 2통). 기본안: letspilatesla@gmail.com 앱 비밀번호로 Gmail SMTP (O-5) |
| **리다이렉트 허용 목록** | `https://letspilatesla.com/admin/set-password/`, `https://letspilatesla.com/staging/admin/set-password/` (+ 로컬 개발 주소) |
| **XSS 방어** (토큰이 localStorage에 있으므로) | `dangerouslySetInnerHTML` 금지, 관리자 HTML에 `<meta http-equiv="Content-Security-Policy">`로 스크립트·연결 출처 제한(Supabase 도메인만) |
| **오너 계정 잠김 대비** | 비밀번호 분실 → 재설정 메일. 메일 접근까지 잃으면 Supabase 대시보드(사장님 Supabase 계정)에서 복구. 오너 2명 운영 권장 |

> **결정 (2026-10-10):** 메일 초대는 쓰지 않는다. 오너가 포털 **Staff → 직원 추가**에서 이메일·이름·처음 비밀번호·역할을 넣으면
> `staff-admin`(action=create)이 로그인 계정을 만들고 `add_staff_account`(오너 전용)로 프로필을 붙인다 (한 번에, 실패 시 계정 정리). SMTP는 비밀번호 재설정 메일이 필요할 때만 선택 설정.
> 신규 가입 끄기도 당장은 보류 (프로필 없는 가입자는 데이터 접근 불가). 실제 운영 전 끈다.

---

## H. Authorization Matrix

| 기능 | OWNER | INSTRUCTOR | 강제 위치 |
|---|---|---|---|
| 로그인 | ✅ | ✅ | Auth + `status=ACTIVE` |
| 개인 대시보드 | ✅ | ✅ | 화면 |
| 오너 대시보드·재무 집계 | ✅ | ❌ | `finance_report()` 함수 첫 줄 `is_owner()` 검사 |
| 등록 관리 | ✅ | ❌ (기본) | RLS (owner SELECT/UPDATE) |
| 학생 검색 | ✅ 전체 정보 | ✅ **제한 필드만** | 강사: `search_students()` 함수만 (테이블 SELECT 권한 없음) |
| 결제 기록 | ✅ | ✅ | `record_payment()` — 작성자는 서버가 결정 |
| 본인 결제 조회 | ✅ | ✅ | RLS `recorded_by = auth.uid()` |
| 전체 결제 조회 | ✅ | ❌ | RLS `is_owner()` |
| 본인 결제 정정·무효 | ✅ (열린 달) | 같은 LA 영업일 + 열린 달 + VALID만 | `correct_payment()` / `void_payment()` + 잠금 트리거 |
| 환불·조정 | ✅ | ❌ | `record_refund()` / `record_adjustment()` |
| 지출 조회·관리 | ✅ | ❌ | RLS owner 전용 (SELECT·INSERT·UPDATE), DELETE 권한 없음 |
| 예상 이익 | ✅ | ❌ | `finance_report()` |
| 월 마감·재오픈 | ✅ | ❌ | `close_period()` / `reopen_period()` |
| 재무 내보내기 | ✅ | ❌ | 오너 함수 결과로만 CSV 생성 |
| 계정 관리 | ✅ | ❌ | Edge Function `staff-admin` (오너 확인 후 service role) |
| 역할 변경 | ✅ (신뢰된 함수) | ❌ | `set_staff_role()` — 마지막 오너 보호 |
| 설정 | ✅ | 본인 계정만 | RLS / `update_my_name()` |

> **STAFF 역할 (2026-10-10 추가):** 수업하지 않는 직원(프런트 데스크·보조)용. 현재 권한은 **INSTRUCTOR와 같다**
> (오너 전용 기능은 모두 ❌, `is_active_staff()`로 열리는 기능은 ✅). 이후 모듈(결제 입력·학생 검색 등)에서 STAFF를 다르게 할지는
> 그 Phase 계획 때 사용자에게 확인한다. DB는 `role = 'INSTRUCTOR'`가 아니라 `is_owner()` / `is_active_staff()`로만 판단하므로 역할을 늘려도 기존 검사는 그대로다.

**4개 층 (명세 6장):** ① 메뉴 표시 ② 경로 가드 ③ DB 함수·Edge Function의 서버 검사 ④ RLS. **①②는 편의일 뿐이고 보안은 ③④에서만 보장한다.**

---

## I. Supabase RLS Design

### I.1 기본 원칙
1. **모든 테이블 `ENABLE ROW LEVEL SECURITY`** — 정책이 없으면 기본 거부.
2. `anon` 역할에는 어떤 테이블도 권한 없음 (E2의 공개 신청은 Edge Function이 처리).
3. **함수 기본 실행 권한 회수:** Postgres는 기본으로 모든 함수를 PUBLIC 실행 가능하게 만들고, Supabase는 이를 `/rpc`로 노출한다.
   → `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` 후 함수별로 `GRANT EXECUTE ... TO authenticated` 명시.
4. **SECURITY DEFINER 함수**는 `SET search_path = ''`(스키마 고정) + 첫 줄에서 `is_active_staff()`/`is_owner()` 검사.
5. **뷰(View) 사용 금지** (뷰는 기본적으로 만든 사람 권한으로 실행되어 RLS를 우회할 수 있음). 집계는 오너 검사 함수로만.
6. 권한 헬퍼 (`SECURITY DEFINER STABLE`, 정책 안에서 `(select app.is_owner())`로 호출해 쿼리당 1회만 평가):
   - `app.is_active_staff()` = 내 `staff_profiles` 행이 있고 `status = 'ACTIVE'`
   - `app.is_owner()` = 위 + `role = 'OWNER'`
7. 헬퍼·내부 함수는 API에 노출되지 않는 `app` 스키마에 둔다.

### I.2 테이블별 정책

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `staff_profiles` | 본인 행, 또는 owner 전체 | ❌ (Edge Function/service role) | ❌ 직접 불가 → `update_my_name()`, `set_staff_role()`, `set_staff_status()` | ❌ |
| `students` | owner | owner | owner | ❌ (병합·비활성화) |
| `courses` | owner | ❌ (동기화 함수) | ❌ | ❌ |
| `enrollments` | owner | ❌ (동기화/E2 함수) | owner: `status`, `notes`, `agreed_fee_cents`, `student_id`만 (컬럼 권한) | ❌ |
| `price_items` | 활성 staff (제안 칩) | owner | owner | ❌ |
| `payment_methods` | 활성 staff | owner | owner | ❌ |
| `payment_transactions` | `recorded_by = auth.uid()` AND 활성 staff, 또는 owner | ❌ → `record_payment()` 등 함수만 | ❌ → 함수만 | ❌ (권한 자체 없음) |
| `expense_categories` | owner | owner | owner | ❌ |
| `expenses` | owner | owner (+ 잠금 트리거) | owner (+ 잠금 트리거) | ❌ |
| `recurring_expense_rules` | owner | owner | owner | ❌ |
| `accounting_periods` | owner | ❌ (함수) | ❌ → `close_period()`/`reopen_period()` | ❌ |
| `audit_logs` | owner | ❌ (트리거만) | ❌ | ❌ |

강사가 자기 결제 행을 SELECT할 때 학생 테이블을 조인할 필요가 없도록 `payer_name`, `recorded_by_name`을 스냅샷으로 저장한다.

### I.3 신뢰된 서버 측 연산 (API 표면 전체)

| 함수 | 호출자 | 하는 일 |
|---|---|---|
| `me()` | staff | 내 이름·역할·상태·등급 |
| `search_students(q)` | staff | 2글자 이상, 최대 10건. **id, 이름, 전화 끝 4자리, 마지막 결제일, 등록일만** 반환 (이메일·전체 번호·메모 없음). 활성 학생만 |
| `payment_suggestions(student_id)` | staff | ① 미납 등록 잔액(agreed − 결제 합계) ② 그 학생의 마지막 가격 항목 ③ 호출자 등급의 가격표 |
| `record_payment(client_request_id, student_id, payer_name, amount_cents, method_id, price_item_id, enrollment_id, notes, confirm_duplicate)` | staff | 작성자=`auth.uid()`, 시각=`now()`, 영업일=LA. 같은 `client_request_id` → 기존 건 반환(재전송 안전). 10분 내 같은 학생·같은 금액 → `confirm_duplicate` 없으면 경고 반환 |
| `correct_payment(id, amount, method, notes, reason)` | staff/owner | 강사: 본인 + 같은 영업일 + 열린 달 + VALID. 오너: 열린 달 전체. 전/후 감사 기록 |
| `void_payment(id, reason)` | staff/owner | 위와 같은 자격 규칙. 사유 필수 |
| `record_refund(original_id, amount, method, reason, client_request_id)` | owner | 원거래 연결, 환불 합계 ≤ 원금 검사, 오늘 날짜(열린 달)에 기록 |
| `record_adjustment(original_id?, amount_signed, reason, client_request_id)` | owner | 마감된 달 보정용. 현재 열린 달에 기록 |
| `link_payment_student(tx_id, student_id)` | owner | walk-in 결제를 학생에 연결 (잠금 규칙 적용 안 함: 금액 불변, 감사 기록) |
| `finance_report(from, to, filters)` | owner | J.1의 모든 수치 + 일별/월별/결제수단별/강사별/카테고리별을 jsonb 하나로 반환 |
| `generate_recurring_expenses()` | owner, pg_cron | 멱등 생성 (J.3) |
| `period_review(month)` / `close_period(month)` / `reopen_period(month, reason)` | owner | J.4 |
| `set_staff_role()` / `set_staff_status()` / `update_my_name()` | owner / 본인 | 마지막 오너 보호 |
| `merge_students(keep_id, merge_id)` | owner | 결제·등록을 keep으로 옮기고 merge 쪽은 `merged_into` 표시 (삭제 없음) |
| `app.bootstrap_owner(email)` | **SQL Editor 전용** | 첫 오너 1회 |
| Edge `staff-admin` | owner JWT | 초대·재발송·초대 취소·ban/unban (service role 필요) |
| Edge `sync-registrations` | pg_cron / owner | E1 동기화 (ADMIN_KEY는 Edge 비밀값) |
| Edge `submit-enrollment` | 공개 (E2) | 검증 → Supabase 기록 → Apps Script로 메일·시트 미러 요청 |

### I.4 트리거
- `set_business_date` — 결제 INSERT 시 LA 영업일 계산 (오너가 지정한 날짜가 있으면 유지).
- `enforce_open_period` — 결제·지출의 INSERT/UPDATE에서 **이전 달(OLD)과 새 달(NEW) 모두** 열려 있는지 확인. 기간 행을 `FOR SHARE`로 잠가 마감과 동시 실행 시 직렬화한다.
  예외 (금액·날짜가 바뀌지 않아 이익 계산에 영향 없음, 모두 감사 기록):
  ① 지출의 지급 상태 필드(`payment_status`, `paid_at`, `payment_method`)만 바꾸는 경우
  ② 오너가 walk-in 결제를 학생에 연결하는 경우(`student_id`, `payer_name`만 변경)
- `audit_row_change` — 금전·권한·설정 테이블의 모든 INSERT/UPDATE를 전/후 jsonb로 기록. 사유는 함수가 `set_config('app.reason', …)`로 전달.
- `touch_updated` — `updated_at`, `updated_by`.

### I.5 보안 테스트 (Phase 2·5·6·7에서 실행, 실제 로그인 토큰으로 API 직접 호출)

| # | 시도 (강사 A 토큰) | 기대 결과 |
|---|---|---|
| S1 | `payment_transactions?id=eq.<강사B 거래>` | 0행 |
| S2 | `payment_transactions?select=*` (필터 없이) | 본인 행만 |
| S3 | `rpc/finance_report` | 권한 오류 |
| S4 | `expenses?select=*`, `recurring_expense_rules`, `accounting_periods`, `audit_logs` | 0행 |
| S5 | 마감된 달 본인 거래 `correct_payment` / `void_payment` | 오류 (period closed) |
| S6 | `staff_profiles` 본인 행 `role=OWNER`로 PATCH | 권한 오류 |
| S7 | `record_payment`에 `recorded_by`=강사B 끼워 보내기 | 무시되고 본인으로 기록 |
| S8 | `rpc/close_period`, `rpc/set_staff_role`, `rpc/merge_students`, `app.bootstrap_owner` | 권한 오류 / 함수 없음 |
| S9 | `students?select=*` | 0행 (검색 함수만 가능) |
| S10 | anon 키만으로 모든 테이블·함수 | 전부 거부 |
| S11 | 비활성화된 강사의 아직 유효한 토큰으로 S2 | 0행 |
| S12 | Edge `staff-admin` invite를 강사 토큰으로 호출 | 403 |

---

## J. Financial Calculation Specification

### J.1 정의 (기간 P = 하루·주·월·연도·사용자 지정, 모두 LA 영업일 기준)

| 지표 | 정의 |
|---|---|
| **Gross Revenue** | Σ `amount` — `kind ∈ {PAYMENT, ADJUSTMENT}`, `status = VALID`, `business_date ∈ P` (조정은 부호 포함, 별도 줄로도 표시) |
| **Refunds** | Σ `amount` — `kind = REFUND`, `VALID`, 환불한 날짜 ∈ P |
| **Net Revenue** | Gross Revenue − Refunds |
| **Operating Expenses** | Σ `amount` — `status = ACTIVE`, 카테고리 `is_operating`, `expense_date ∈ P` (**지급·미지급 모두 포함**) |
| **Paid Expenses** | 위 중 `payment_status = PAID` |
| **Outstanding Expenses** | 위 중 `payment_status = UNPAID` |
| **Estimated Net Operating Profit** | Net Revenue − Operating Expenses |
| **Transaction Count** | `kind = PAYMENT` AND `VALID` 건수 (환불·조정·무효 제외) |
| **Today** | 현재 LA 날짜 |
| **This week** | 월~일 (O-6) |
| **YTD** | 1월 1일 ~ 오늘 (LA) |
| **대시보드 매출 KPI** | Today·This month 모두 **Net Revenue** 기준 (당일 환불 반영), 아래 줄에 건수 |

**보고 기준 (화면에 항상 표시):** "매출 = 실제로 받은 돈을 받은 날 기준. 지출 = 지출일이 속한 달 기준, 미지급 포함.
**은행 잔고·세금상 이익·회계사 결산 이익이 아닌 경영 참고용 추정치입니다.**"
(은행 잔고와 다른 이유: 입금 시차, 오너 인출, 대출, 미지급 지출. 세금상 이익과 다른 이유: 감가상각·세무 조정 미반영.)

### J.2 일관성 규칙
1. **수수료는 한 번만:** 매출은 고객이 낸 **총액**으로 기록한다. 카드·Venmo 수수료는 결제에서 빼지 않고, 월 정산서 금액을 **"Payment Processing Fees" 지출로만** 기록한다.
2. **무효(VOID)** = 잘못 입력된 건(실제로 받지 않음·중복). 모든 합계에서 제외, 행은 남는다.
3. **환불** = 실제로 돌려준 돈. 돌려준 날의 달에서 차감. 원래 결제의 달(마감됐을 수 있음)은 바뀌지 않는다.
4. **정정(Correct)** = 열린 달 안에서 금액·수단 수정. 새 행 없이 감사 이력만 남는다.
5. **조정(Adjustment)** = 마감된 달의 오류를 **재오픈 없이** 바로잡는 방법. 현재 열린 달에 ± 금액으로 기록하고 원거래·사유를 연결한다. 큰 오류는 재오픈을 쓴다.
6. **금액 계산은 전부 정수 센트로 DB에서 합산.** 퍼센트 등 비율만 표시용으로 반올림한다.
7. **모든 집계는 `finance_report()` 하나에서** 계산한다 (대시보드·리포트·마감·CSV가 같은 숫자를 쓴다).

### J.3 정기 지출 자동 생성
- `generate_recurring_expenses()`: 활성 규칙마다 `start_month` ~ 이번 달(미래 생성 없음) 중 **열린 달**에 대해, 없으면 지출 1건 INSERT
  (`payment_status=UNPAID`, `expense_date` = 그달의 due_day(말일 보정), `amount` = **생성 시점의 규칙 금액**, `is_estimate` 복사).
- `UNIQUE (recurring_rule_id, period_month)` + `INSERT … ON CONFLICT DO NOTHING` → 몇 번을 실행해도 중복 없음, 동시 실행도 안전.
- **실행 시점은 두 겹:** ① pg_cron 매일 08:15 UTC(LA 새벽, 놓친 달 자동 보충) ② 오너가 대시보드·지출 화면을 열 때 한 번 호출(스케줄러가 멈춰도 동작).
- 규칙 금액 변경 → 앞으로 생성될 달부터 적용. 이미 생성된 달의 금액은 그대로(이력 보존). 이번 달 미지급분까지 바꿀지는 체크박스로 선택.
- 규칙 비활성화·종료월 → 이후 생성 중단, 기존 건 유지. 규칙 삭제 없음.
- 생성 대상 달이 이미 마감되었으면 건너뛰고 "Needs attention"에 표시.

### J.4 월 마감 (원자성·동시성)
- `close_period(month)` = **함수 하나 = 트랜잭션 하나**:
  `INSERT … ON CONFLICT DO NOTHING`(기간 행 보장) → `SELECT … FOR UPDATE`(행 잠금) → 이미 CLOSED면 오류(이중 마감 방지) →
  `finance_report(month)` 계산 → `snapshot` 저장 → `status=CLOSED`, `version+1`, `closed_by/at` → 감사로그.
- 결제·지출 트리거가 같은 기간 행을 `FOR SHARE`로 잠그므로, 마감 중에 들어온 입력은 마감 완료 후 CLOSED를 보고 거부된다.
- `reopen_period(month, reason)`: 사유 필수, `status=OPEN`, 이전 스냅샷을 감사로그에 보존. 다시 마감하면 version 2.
- 마감 전 권장 확인(E.10): 결제 검토, 환불·무효 검토, 지출 검토(추정치 확인, 미지급 확인), 결과 검토. 미지급 지출이 있어도 마감은 가능하다(미지급으로 계속 표시).

---

## K. Google Apps Script → Supabase Migration Strategy

### K.1 단계 정의

| 단계 | 기록의 원본 | 공개 폼 | 메일 | 코스 편집 | 시기 |
|---|---|---|---|---|---|
| **E0 (현재)** | 시트 | Apps Script | Apps Script | 레거시 /admin | — |
| **E1 미러** | 시트 | Apps Script (변경 없음) | Apps Script | 레거시 `/admin/legacy/` | Phase 4A |
| **E2 전환** | **Supabase** | Edge Function → Supabase 기록 → Apps Script로 메일·시트 미러 요청 | Apps Script | 레거시 | Phase 4B (별도 승인) |
| **E3 은퇴 (선택)** | Supabase | Supabase | Resend 등 | 포털 | 범위 밖, 나중에 결정 |

**쓰기 주체는 각 단계에서 하나뿐이다.**
- E1: 시트만 기록하고 Supabase는 읽어 온다. 상태·메모처럼 Supabase에만 있는 필드는 시트에 없으므로 충돌이 없다.
- E2: Supabase가 기록하고, 시트에는 미러 복사가 순서대로 따라간다.
→ 명세가 금지한 "통제되지 않은 동시 쓰기"가 생기지 않는다.

### K.2 데이터 매핑 상세와 주의점 (F.5 보완)
- **시간대:** `?registrations=1`은 스크립트 시간대 기준 `M/d/yyyy h:mm a`(분 단위)로 준다.
  → Phase 4A 첫 작업은 Apps Script 프로젝트 시간대 확인이다. LA가 아니면 그 시간대로 해석한다.
  분 단위라서 같은 이메일·같은 코스로 같은 분에 두 번 제출한 경우는 1건으로 합쳐진다 (실제 중복 제출이므로 허용 가능, 보고서에 표시).
- **복수 코스:** 한 행의 `B` 셀을 기존 `splitCourses_`와 같은 규칙으로 나눈다.
- **코스 매칭:** `normalizeKey_`와 같은 정규화(대소문자, ®™, 대시 종류, 공백). 실패하면 `course_id NULL` + 검토 목록.
- **중복 학생:** 이메일 정규화 일치 → 같은 학생. 이메일 없음 → 새 학생 + "중복 의심(같은 이름·전화)" 목록.
- **무효 행:** `@` 없음·이름 없음 → 가져오지 않고 보고서에 행 번호와 함께 표시.

### K.3 백업
1. 시트: 파일 → **사본 만들기** ("Registration backup 2026-MM-DD") + **.xlsx 다운로드** (사장님 드라이브와 로컬).
2. 탭별 행 수를 기록한다 (데일리 로그 + 가져오기 실행의 감사로그).
3. Supabase prod: Pro 일일 백업(O-4) + 전환 직전 수동 백업.
4. Apps Script 코드: 저장소 `apps-script/`가 원본이다. 배포 버전 번호를 기록한다.

### K.4 이전 절차 (명세 18.4 대응)

| # | 절차 | 단계 |
|---|---|---|
| 1~3 | 스키마 생성 · Auth 설정 · RLS 설정 | Phase 2 |
| 4 | 가져오기 준비: `sync-registrations` Edge Function (Apps Script `?registrations=1` + `?all=1`, `ADMIN_KEY`는 Edge 비밀값) | 4A |
| 5 | 과거 데이터 가져오기: **staging DB에 먼저** → 검증 → prod | 4A |
| 6 | 건수 대조: (시트 유효 행의 코스 수 합계) = (inserted + 기존) + skipped. 코스별 신청 수가 Apps Script `taken`과 일치 | 4A |
| 7 | 필드 대조: 무작위 10건 원문 비교, 얼리버드 Fee 스냅샷 5건 확인 | 4A |
| 8 | 등록 기능 확인: E1 동안 공개 폼은 그대로 → 새 신청이 1시간 내 포털에 나타나는지 | 4A |
| 9 | 백엔드 전환 준비: `submit-enrollment` Edge Function + 공통 `submission_id` + Apps Script N열 수정(아래) | 4B |
| 10 | 종단 테스트: 스테이징 폼 → staging Supabase → **테스트용 Apps Script 사본**(실제 신청자에게 메일이 가지 않게) | 4B |
| 11 | 프로덕션 전환: **명시적 승인 후** TrainingForm 엔드포인트 상수 1줄 변경 (Staging → main PR) | 4B |
| 12 | 모니터링: 첫 5건 시트·Supabase·메일 대조, 이후 매일 동기화 작업이 차이 0건인지 확인 (2주) | 4B |
| 13 | 정리: 2주 무사고 후 `?registrations`·`?auth` 엔드포인트와 레거시 등록자 탭 제거. 코스 편집·메일은 E3 전까지 유지 | 4B 이후 |

**4B의 공통 제출 ID:** TrainingForm이 제출마다 `submission_id`(uuid)를 만들어 **두 경로 모두에** 보낸다.
- Edge Function은 이것으로 `source_key`(= `submission_id` + 코스 순번)를 만든다 → 같은 제출을 다시 받아도 1건.
- Apps Script는 받은 `submission_id`를 접수 탭 **N열**에 기록한다 (몇 줄 수정).
- 동기화 작업은 N열의 `submission_id`가 이미 Supabase에 있으면 건너뛴다.
→ "Supabase 기록은 됐는데 응답이 늦어 레거시 경로로 재시도"한 경우에도 중복이 생기지 않는다.
(⚠️ 재배포는 "배포 관리 → 연필 → 새 버전"으로만. "새 배포"는 URL이 바뀐다.)

### K.5 전환 중 장애·롤백

| 상황 | 동작 |
|---|---|
| Edge Function/Supabase 장애로 신청 실패 | TrainingForm이 **같은 `submission_id`로 기존 Apps Script 경로에 자동 재시도** → 시트에 기록 → 동기화 작업이 Supabase에 없을 때만 가져옴. **신청 유실 0, 중복 0** |
| Supabase 기록 성공, Apps Script 미러/메일 실패 | `enrollments.relay_status = FAILED` → 대시보드 "Needs attention"에 표시 + [Resend] (자동 재시도는 메일 중복 위험으로 하지 않음) |
| 가져오기 중간 실패 | 행 단위 멱등 키(`source_key`) → 같은 작업을 다시 실행하면 이어서 처리, 중복 없음 |
| 전환 후 문제 발견 (롤백) | TrainingForm 엔드포인트 상수를 되돌리는 PR 1개 → 즉시 E1 상태. 그 사이 Supabase에 들어온 행은 시트에도 미러되어 있으므로 손실 없음 |
| 스테이징 테스트가 실제 시트를 오염 | staging은 **별도 테스트용 Apps Script·시트 사본**을 쓴다 (환경 선택은 `BASE_URL`) |

---

## L. Implementation Roadmap

> 모든 단계: Staging 브랜치 커밋 → `/staging/admin/`에서 확인 → **사장님 승인** → main PR.
> DB 마이그레이션도 staging 프로젝트에서 먼저 검증한 SQL만 prod에 적용한다. 단계마다 데일리 로그.

| 단계 | 목표 | 선행 조건 | 산출물 | 인수 기준 | 위험 | 규모 |
|---|---|---|---|---|---|---|
| **1. 평가·아키텍처** | 이 문서 승인 | — | 승인된 계획, O 결정, **P0 키 교체** | 사장님 승인 + O 항목 답변 | 낮음 | 이 세션 |
| **2. Supabase 기반·인증** | 안전한 계정 체계 | 1, Supabase 2개 프로젝트, 커스텀 SMTP | 마이그레이션 001(staff, audit, 헬퍼, 권한 회수), bootstrap, `staff-admin` 함수, 로그인·로그아웃·재설정·초대 화면 최소형 | 24.1 전 항목, 보안 테스트 S6·S8·S10·S11·S12 | 중 (보안 기반) | M |
| **3. 포털 셸·대시보드** | 사이드바 포털 | 2, **UI 목업 디자인 승인** | 관리자 진입점·라우팅·경로 스텁, 레이아웃(사이드바·헤더·드로어·하단탭), 역할별 대시보드(빈 상태), Account, Staff 화면, 레거시를 `/admin/legacy/`로 이동 | 3개 기기 폭에서 레이아웃, 직접 URL·새로고침, 권한 없는 경로 리다이렉트, **랜딩 회귀 0** | 중 (빌드 구조 변경) | M |
| **4A. 등록·학생 데이터** | 등록 미러 + 학생 원장 | 3, P0 키 교체, 시트 백업 | students·courses·enrollments, `sync-registrations` + pg_cron, Mindbody CSV 가져오기, Enrollments·Students 화면 | 24.6의 1·3·4·6, 건수·필드 대조표 | 중 | M |
| **5. Daily Income** | 강사 결제 입력 | 4A (학생 검색) | payment_methods, price_items, payment_transactions, accounting_periods(잠금 트리거, 모두 OPEN), 기록·정정·무효·환불 함수, 입력·내 이력·오너 거래 화면 | 24.2 전 항목, S1~S5·S7·S9 | **높음 (돈)** | L |
| **6. 지출** | 지출·정기 지출 | 5 (기간 잠금 공유) | 카테고리, 지출, 정기 규칙, 생성 함수 + pg_cron, 지출 화면 | 24.3 전 항목, S4 | 중 | M |
| **7. 재무 대시보드·월 마감** | 숫자 자동화 + 마감 | 5, 6 | `finance_report()`, KPI·차트(인라인 SVG), Reports, 마감·재오픈·조정, CSV 내보내기 | 24.4 예시($12,000), 24.5 전 항목, 동시 마감 테스트 | **높음 (돈)** | L |
| **4B. 등록 공개 폼 전환** | Supabase가 등록 원본 | 7 완료, 4A 2주 안정, **별도 명시적 승인** | `submit-enrollment`, Apps Script N열 수정, TrainingForm 엔드포인트, 모니터링 | 24.6의 2·5, 신청 유실 0, 메일 정상 | **높음 (공개 기능)** | M |
| **8. 검증·다듬기** | 운영 준비 완료 | 전부 | 전체 보안 테스트, 계산 검증, iPhone/iPad 실기기, 접근성, 성능, 문서·운영 가이드 | 24장 전체 재실행 통과, 랜딩 회귀 0 | 낮음 | M |

**순서 조정 근거:** 명세는 4(등록 이전) → 5(Daily Income) 순서다. 그런데 결제 입력에 필요한 것은 학생 데이터(4A)뿐이고,
가장 위험한 공개 폼 전환(4B)은 돈 관리 기능과 무관하다. 그래서 4B를 7 뒤로 옮겼다.

---

## M. File-Level Change Plan

### M.1 조사 완료한 기존 파일
`src/App.tsx`, `main.tsx`, `protect.ts`, `components/Navbar.tsx`, `TrainingForm.tsx`, `Eyebrow.tsx`, `Heading.tsx`,
`i18n/LanguageContext.tsx`, `index.css`, `index.html`, `vite.config.ts`, `tailwind.config.js`, `package.json`,
`public/admin/index.html`, `public/pricing/*`, `apps-script/google-apps-script.js`, `apps-script/SETUP-KO.md`,
`.github/workflows/deploy-pages.yml`, `CLAUDE.md`, `FUTURE-PLANS.md`, `daily-logs/*`, 과거 `Phase2.md`(다른 브랜치).

### M.2 재사용 (수정 없음)
`tailwind.config.js`, 폰트 링크, `LogoIcon.tsx`, `protect.ts`(관리자에서도 호출), `lucide-react`, Apps Script 메일 로직.

### M.3 수정 예정

| 파일 | 변경 | 단계 |
|---|---|---|
| `pilates-landing/vite.config.ts` | 두 번째 진입점(`admin/index.html`) + 경로 폴더별 `index.html` 복사 (약 15줄) | 3 |
| `pilates-landing/package.json` (+lock) | `@supabase/supabase-js` 추가 **(유일한 새 의존성)** | 2 |
| `public/admin/index.html` → `public/admin/legacy/index.html` | 파일 이동만 (내용 변경 없음) | 3 (프로덕션 반영 시점) |
| `src/components/TrainingForm.tsx` | 제출 엔드포인트 상수 + `submission_id` 생성 + 실패 시 레거시 경로 재시도 | **4B만** |
| `apps-script/google-apps-script.js` | `submission_id` → N열 기록 (몇 줄) | **4B만** |
| `apps-script/SETUP-KO.md` | 4B 재배포 안내 | 4B |
| `CLAUDE.md` | 구조·브랜치·현재 상태 갱신 (관리자 포털, Supabase) | 각 단계 |
| `FUTURE-PLANS.md`, `DAILY-INCOME-PLAN.md` | 이 문서로 연결 | 1 |

### M.4 새 파일 (상한선 — ponytail: 작은 컴포넌트는 합친다)

```
pilates-landing/
├── admin/index.html                      진입 HTML (noindex, CSP meta, 폰트 링크)
└── src/admin/
    ├── main.tsx · App.tsx                세션·역할 판별, 경로 → 페이지
    ├── router.ts                         History API 라우터 (~40줄) + 경로 목록(빌드 스텁과 공유)
    ├── supabase.ts                       클라이언트 + BASE_URL로 staging/prod 선택 (공개 URL·공개 키만)
    ├── i18n.ts                           EN/KR 문구
    ├── lib/money.ts · lib/time.ts        센트 파싱·표시, LA 날짜 (+ assert 기반 셀프체크 1개)
    ├── lib/csv.ts                        UTF-8 BOM CSV
    ├── ui/                               Layout, Sidebar, Header, Card, SummaryCard, DataTable,
    │                                     FilterBar, Modal/ConfirmDialog, Toast, Empty/Loading/Error,
    │                                     StudentSearch, PaymentForm, ExpenseForm
    ├── ui/charts/                        ColumnChart, PairedColumnChart, BarList (인라인 SVG)
    └── pages/                            Login, SetPassword, Dashboard(Owner/Instructor), Enrollments,
                                          DailyIncome, MyHistory, Expenses, Students, Staff,
                                          Reports(+Closing), Settings, Account
supabase/
├── migrations/0001_foundation.sql        staff, audit, 헬퍼, 기본 권한 회수, bootstrap
├── migrations/0002_students_enrollments.sql
├── migrations/0003_payments.sql          + accounting_periods, 잠금 트리거
├── migrations/0004_expenses.sql
├── migrations/0005_reports_closing.sql   finance_report, close/reopen
├── seed/seed.sql                         결제수단, 지출 카테고리, 가격표
├── functions/staff-admin/index.ts
├── functions/sync-registrations/index.ts
├── functions/submit-enrollment/index.ts  (4B)
└── tests/
    ├── security.mjs                      I.5 S1~S12 (실제 토큰으로 API 호출, supabase-js만 사용)
    └── finance.sql                       J.1 계산 검증 (롤백되는 트랜잭션 안의 고정 데이터)
docs/admin/SETUP-KO.md                    사장님용: Supabase 생성, SMTP, bootstrap, 백업
```

### M.5 변경하지 않는 것
공개 사이트 섹션 전체, `translations.ts`, `Navbar.tsx`, `index.html`(공개), `public/pricing`, **배포 워크플로우**,
`CNAME`, `Archive/`, 공개 사이트 디자인.

---

## N. Risk Assessment

| # | 분류 | 위험 | 가능성 | 영향 | 대응 |
|---|---|---|---|---|---|
| R1 | 보안 | **ADMIN_KEY 공개 노출 (현재 진행형)** | 확정 | 높음 | P0 즉시 교체 |
| R2 | 보안 | RLS 누락·함수 기본 실행 권한으로 데이터 노출 | 중 | 높음 | 기본 권한 회수, 뷰 금지, S1~S12 자동 테스트를 단계마다 실행, Supabase Security Advisor 확인 |
| R3 | 보안 | XSS로 localStorage 토큰 탈취 | 낮음 | 높음 | innerHTML 금지, CSP meta, 외부 스크립트 없음 |
| R4 | 보안 | service role 키 유출 | 낮음 | 치명 | Edge Function 비밀값에만. 저장소·브라우저 금지. 검색으로 커밋 전 확인 |
| R5 | 보안 | 사용자 수정 가능 메타데이터로 권한 상승 | 낮음 | 높음 | 역할은 `staff_profiles`만, 컬럼 권한 차단 |
| R6 | 재무 | Mindbody 결제와 이중 집계 | 중 | 높음 | O-3 결정 + 결제수단·메모 규칙 |
| R7 | 재무 | 수수료 이중 차감 | 중 | 중 | J.2-1 규칙 + 리포트에 기준 문구 |
| R8 | 재무 | 마감과 입력의 경쟁 상태 | 낮음 | 높음 | 기간 행 잠금(J.4), 동시 실행 테스트 |
| R9 | 재무 | 제안 금액을 확인 없이 저장 | 중 | 중 | 버튼에 금액·수단 표시, `suggested_amount_cents` 기록, 오너 검토 |
| R10 | 이전 | 시트 타임스탬프 시간대·분 단위 | 중 | 중 | K.2 확인 절차, 대조표 |
| R11 | 이전 | 4B 중 신청 유실 | 낮음 | 높음 | 레거시 경로 자동 재시도 + 동기화 안전망 |
| R12 | 이전 | Apps Script 재배포 시 URL 변경 | 중 | 높음 | "새 버전" 절차 문서화, 배포 직후 GET 확인 |
| R13 | 호환 | 멀티 페이지 빌드로 랜딩 번들 구성 변경 | 중 | 중 | 전후 빌드 비교, 랜딩이 supabase 코드를 받지 않는지 확인, Playwright 회귀 |
| R14 | 호환 | 난독화가 supabase-js 번들을 키우거나 깨뜨림 | 중 | 중 | 실기기 측정, 필요하면 admin 청크만 난독화 제외 (보안은 서버 담당) |
| R15 | 호환 | staging/prod 환경 혼선 | 중 | 높음 | BASE_URL 기반 선택 + 헤더에 "STAGING" 표시 |
| R16 | 운영 | 기본 메일 제한으로 초대 실패 | 확정(미설정 시) | 중 | Phase 2 선행 조건으로 커스텀 SMTP |
| R17 | 운영 | Free 플랜 일시정지·백업 없음 | 중 | 높음 | prod Pro (O-4), 아니면 마감마다 CSV 보관 |
| R18 | 운영 | 오너 1명 계정 잠김 | 낮음 | 높음 | 오너 2명, 복구 절차 문서 |
| R19 | 디자인 | 동결 규칙 위반 | 낮음 | 중 | 공개 사이트 무변경, 관리자 UI는 목업 승인 후 |
| R20 | 범위 | 미래 모듈로 범위 확장 | 중 | 중 | M.4 상한, YAGNI 목록(F.3) |

---

## O. Open Decisions (구현에 실질적 영향이 있는 것만)

| # | 결정 | 권장 기본값 | 트레이드오프 |
|---|---|---|---|
| O-1 | **오너 계정은 누구?** (사장님 + Sunnie?) | 2명 OWNER | 1명이면 단순하지만 잠김 위험. 2명이면 둘 다 재무 전체를 봄 |
| O-2 | **학생 명단 출처** | Mindbody 고객 CSV 가져오기 + 지도자 과정 신청자 | 없으면 일반 수업 학생 검색이 비어 walk-in만 쓰게 됨. 수동 입력은 느림 |
| O-3 | **어떤 결제를 기록하나** (Mindbody 카드 결제 포함?) | 스튜디오가 받은 **모든** 돈을 여기 기록. Mindbody 매출은 별도로 합산하지 않음 | Mindbody 결제를 빼면 "오늘 수입"이 불완전. 넣으면 Mindbody 리포트와 이중으로 보지 않도록 주의 |
| O-4 | **Supabase prod 플랜** | Pro $25/월 (일일 백업 7일, 일시정지 없음) / staging Free | Free는 7일 무사용 시 정지, 백업 없음 → 마감마다 CSV 보관 필수 |
| O-5 | **로그인·초대 메일 발송** | Gmail SMTP (letspilatesla@gmail.com 앱 비밀번호, 무료) | Resend 등은 도메인 인증이 필요하지만 전달률·한도가 좋음 |
| O-6 | **주 시작 요일** | 월요일 | 미국 달력 관례는 일요일 |
| O-7 | **강사 본인 오늘 합계 표시** | 표시 (본인 것만) | 현금 정산에 유용. 숨기면 더 단순 |
| O-8 | **관리자 UI 언어** | EN/KR 토글 | 문구를 두 벌 관리. 한국어 단일이면 작업량 감소 |
| O-9 | **가격표 확정** | F.6 표 + 각 강사의 등급(Certified/Master) 지정 | Duet 2인 분할 결제 방식 확인 필요 |
| O-10 | **강사 정정 가능 기간** | 같은 LA 영업일까지 | 길게 주면 편하지만 정산 후 변경 위험 |
| O-11 | **차트 색** | 브랜드 sage/clay + 범례·라벨·표 | 차트 전용 고채도 변형은 구분이 쉽지만 **색상 변경 = 디자인 승인** 필요 |
| O-12 | **스튜디오 공용 iPad 사용 여부** | 사용하면 12시간 무활동 자동 로그아웃 | 개인 폰만 쓰면 불필요 |
| O-13 | **4B(공개 폼 전환) 진행 여부** | 7단계 후 진행 | 안 해도 재무 기능은 완전히 동작. 하면 등록 원본이 Supabase로 통일됨 |

---

## 부록 1. Edge Case 동작 정의 (명세 21장)

**인증**

| 상황 | 동작 |
|---|---|
| 잘못된 비밀번호 | 일반 오류 문구 (계정 존재 여부 비노출). Supabase 기본 시도 제한 |
| 세션 만료 | 다음 요청에서 감지 → 로그인 화면 → 원래 경로로 복귀. 작성 중 결제 폼은 `sessionStorage`에 임시 보존 |
| 비밀번호 재설정 | 메일 링크 → `/admin/set-password`. 링크 만료 시 재요청 안내 |
| 비활성 사용자 | 로그인 직후 거부, 기존 토큰도 데이터 0 (RLS), Auth ban |
| 초대 미완료 | Staff 목록 "Invited", [Resend]/[Cancel]. 결제 기록이 없는 초대만 취소 가능 |
| 오너 권한 무단 부여 | 역할 변경은 오너 함수만. 직접 PATCH는 권한 오류 (S6) |

**학생**

| 상황 | 동작 |
|---|---|
| 같은 이름 | 전화 끝 4자리 + 최근 결제일/등록일 표시 |
| 학생 레코드 없음 | Walk-in으로 기록 → 오너가 연결하거나 새 학생 생성 |
| 비활성 학생 | 강사 검색에서 제외, 오너는 필터로 보기 |
| 가격 정보 없음 | 제안 칩 없이 금액 직접 입력 |
| Walk-in | `student_id NULL`, 목록에 "Walk-in" 배지, 오너 "Needs attention"에 연결 대기 표시 |

**결제**

| 상황 | 동작 |
|---|---|
| 중복 제출 (더블 탭·재전송) | 같은 `client_request_id` → 1건만, 기존 건 반환 |
| 진짜 중복 의심 | 10분 내 같은 학생·금액 → 경고 후 "Save anyway" 시에만 저장 |
| 부분 결제·여러 번 결제 | 모두 별도 행. 등록 잔액 = agreed − 결제 합계 (환불 반영) |
| 결제수단·금액 오입력 | 강사: 같은 날 정정. 이후·마감 전: 오너 정정. 마감 후: 조정 |
| 무효 | 사유 필수, 합계에서 제외, 행·감사 이력 유지 |
| 환불 | 원거래 연결, 환불 누계 ≤ 원금, 환불한 날의 달에 차감 |
| 강사 실수 | 위 정정 규칙 + 오너 검토 화면 |
| 소급 입력 | 강사는 날짜 지정 불가 (항상 지금). 오너는 열린 달로만 소급 가능 |
| 월말 경계 | LA 기준 10/31 23:59 → 10월, 11/1 00:01 → 11월. DST 자동 처리 |

**지출**

| 상황 | 동작 |
|---|---|
| 정기 지출 중복 | 유니크 제약 + `ON CONFLICT DO NOTHING` |
| 임대료 변경 | 지정 월부터 적용, 과거 금액 보존 |
| 미지급 | 운영비에 포함, "Outstanding"으로 별도 표시, 마감 후에도 지급 처리 가능 |
| 카테고리 없음 | 카테고리 필수(DB). 오너가 설정에서 추가. 비활성 카테고리는 새 입력에서만 숨김 |
| 지출 정정 | 열린 달: 수정(감사). 마감 달: 재오픈 또는 이번 달에 보정 지출(음수 허용, 사유 필수) |
| 수수료 이중 집계 | J.2-1 |

**월 마감**

| 상황 | 동작 |
|---|---|
| 마감 후 수정 시도 | 트리거가 거부 (오너 포함) → 재오픈 또는 조정 안내 |
| 동시 마감 요청 | 행 잠금으로 하나만 성공, 다른 쪽은 "already closed" |
| 마감된 달을 가리키는 새 거래 | 환불·조정은 **현재 열린 달**에 기록하고 원거래만 참조 → 허용 |
| 재오픈 | 사유 필수, 감사로그 + 이전 스냅샷 보존 |
| 재오픈 후 정정 | 일반 정정 규칙 → 재마감 시 version 2 |
| 조정 후 보고 일관성 | 모든 화면이 `finance_report()` 하나를 쓰므로 숫자가 같다. 마감 스냅샷은 그 시점 기록으로 보존 |

**이전**

| 상황 | 동작 |
|---|---|
| 중복 가져오기 | `source_key` UNIQUE → 재실행 안전 |
| 무효 과거 행 | 건너뛰고 보고서에 행 번호와 이유 |
| 식별자 없음 | 합성 키 (K.2) |
| 부분 실패 | 행 단위 멱등 → 재실행으로 이어서 처리 |
| 전환 실패 | K.5 롤백 (PR 1개) |
| 이전 중 신청 | E1: 시트로 계속 들어오고 다음 동기화가 가져옴. E2: 레거시 재시도 경로 |

---

## 부록 2. 테스트 시나리오 → 검증 방법 (명세 24장)

| 시나리오 | 검증 방법 | 단계 |
|---|---|---|
| 24.1 인증 1~7 | 테스트 계정(오너, 강사 A·B)으로 수동 + `security.mjs` S6·S10·S11 | 2 |
| 24.2 강사 A $100 Cash, B $150 Zelle, 각자 본인만, 오너 2건·합계 $250, 강사는 합계 조회 불가, 재전송 1건 | `security.mjs` 시나리오 (실제 토큰, 같은 `client_request_id` 2회 전송) | 5 |
| 24.3 $3,000 임대료 규칙 → 생성 → 재생성 중복 없음 → 미지급 → 지급 처리 → 금액 변경 후 과거 보존 → 강사 조회 불가 | `finance.sql` + S4 | 6 |
| 24.4 Gross $20,000, Refund 0, 지출 $8,000(임대 3,000 / 보수 3,500 / 유틸 500 / 기타 1,000) → **$12,000** | `finance.sql` 고정 데이터로 `finance_report()` 결과 비교 | 7 |
| 24.5 마감 → 강사 수정 거부 → 소급 거부 → 재오픈 감사 → 조정 후 일관성 | `security.mjs` S5 + `finance.sql` + 동시 마감 2세션 테스트 | 7 |
| 24.6 이전 1~6 | 대조표(K.4 6·7), 재실행 테스트, 공개 폼 실제 제출, 랜딩 회귀 | 4A·4B |
| 반응형 | Playwright 393 / 820 / 1280px 스크린샷 + iPhone·iPad 실기기 | 3·5·8 |
| 기존 사이트 | 랜딩 렌더·등록 폼·스케줄 위젯·언어 토글 회귀 | 매 단계 |

## 부록 3. 참고 자료
- Supabase Row Level Security — https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase 사용자 데이터 관리 (`user_metadata`는 사용자가 수정 가능) — https://supabase.com/docs/guides/auth/managing-user-data
- Supabase 커스텀 SMTP (기본 메일 서버 제한) — https://supabase.com/docs/guides/auth/auth-smtp
- Supabase Cron (pg_cron) — https://supabase.com/docs/guides/cron
- Supabase 요금 — https://supabase.com/pricing
- Vite 멀티 페이지 빌드 — https://vite.dev/guide/build
- Mindbody API (호출당 과금) — https://developers.mindbodyonline.com/ui/documentation/consumer-api
