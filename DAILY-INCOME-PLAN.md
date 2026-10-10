# Daily Income — 통합 구현 플랜

> 상태: **제안 (검토 대기)** · 작성 2026-10-10 · 코드 변경 없음
> 원 요구사항: "Let's Pilates Website — Daily Income Page Integration"
> 이 문서는 현재 사이트 조사 결과와 구현 계획이다. §8 "결정 필요" 항목에 답을 받은 뒤 착수한다.

---

## 0. 한눈에 보기

- 현재 사이트는 **서버·DB·개인 로그인이 없는 정적 사이트**(GitHub Pages)다.
  유일한 백엔드는 구글 Apps Script + 구글 시트, 유일한 로그인은 **공용 비밀번호 1개**(`ADMIN_KEY`)다.
- 그래서 "강사별 신원 + 역할(STAFF/OWNER) + DB 수준 접근 제한"은 **재사용할 기반이 없다.** 관리형 백엔드를 하나 추가해야 한다.
- **권장: Supabase (Postgres + Auth + Row Level Security).** `FUTURE-PLANS.md`에서 이미 인증/DB 방향으로 정해 둔 서비스다.
  대안: 기존 Apps Script + 구글 시트 확장 (비용 0, 대신 보안·무결성 보장이 약함).
- 페이지는 같은 Vite 프로젝트에 **두 번째 엔트리**로 추가한다 → `letspilatesla.com/daily-income/`
  (스테이징: `/staging/daily-income/`). 랜딩 페이지 코드·디자인은 건드리지 않는다.
- 스테이징과 프로덕션은 **서로 다른 DB**를 쓴다. 스테이징에서 테스트한 입력이 실제 장부에 섞이지 않게 하기 위해서다.

---

## 1. 현재 구조 조사 결과

### 1.1 아키텍처

| 항목 | 현재 상태 | 위치 |
|---|---|---|
| 프론트엔드 | React 19 + Vite 8 + Tailwind 3 + TS. 단일 페이지, 라우터 없음 (`#about` 같은 해시 앵커) | `src/App.tsx`, `package.json` |
| 호스팅 | GitHub Pages. `main`→`/`, `Staging`→`/staging/`을 한 아티팩트로 배포. 서버 코드 실행 불가 | `.github/workflows/deploy-pages.yml` |
| 백엔드 | Google Apps Script 웹앱 1개 (등록 폼 기록, 코스 목록 JSON, 관리자 API) | `apps-script/google-apps-script.js` |
| 데이터 저장 | Google Sheets ("Registration" 스프레드시트) | 같은 파일 |
| 관리자 화면 | `public/admin/index.html` — 바닐라 JS 정적 HTML, Vite 빌드 밖 | |
| 빌드 후처리 | 모든 JS 번들 난독화, 우클릭·개발자도구 단축키 차단 | `vite.config.ts`, `src/protect.ts` |
| 저장소 | **공개(public)** — 비밀값은 코드에 넣지 않는 규칙 | Apps Script 상단 주석 |

### 1.2 인증 / 역할
- 개인 계정이 없다. 관리자 페이지는 공용 비밀번호를 `sessionStorage`에 보관해 쿼리스트링(`?key=`)으로 보낸다.
- 사용자 ID·역할·권한 개념이 없어서, "누가 입력했는가(CreatedBy)"를 서버가 판정할 방법이 없다.
- **결론:** 재사용할 수 있는 인증 시스템이 없다. 요구사항의 "적합한 인증이 이미 있으면 재사용" 조건에 해당하지 않으므로 새로 도입한다.
  기존 `ADMIN_KEY` 방식은 등록 관리용으로 그대로 두고 섞지 않는다.

### 1.3 DB / 데이터 접근 패턴
- `fetch()` → Apps Script `doGet/doPost` → 시트 읽기/쓰기. 트랜잭션·제약조건·행 단위 권한이 없다.
- 금액은 문자열로 저장·표시한다 (`formatMoney`). 정수 센트 저장 패턴은 없다.
- LA 시간대 처리 원칙은 이미 있다 (`TrainingForm`의 `studioToday()` — `America/Los_Angeles`). 같은 원칙을 서버 쪽에도 적용한다.

### 1.4 라우팅 / 내비게이션
- 라우터가 없어 `/daily-income`은 현재 404다.
- GitHub Pages는 SPA 리라이트를 지원하지 않는다. 그래서 **빌드 결과에 실제 폴더(`daily-income/index.html`)를 만드는 방식**(Vite 멀티 페이지 빌드)이 가장 단순하다. 새 라이브러리가 필요 없다.
- `Navbar.tsx`는 **디자인 동결 대상**이다 → 메뉴 추가는 승인 사항 (§3.3).

### 1.5 재사용 가능한 UI 자산

| 자산 | 재사용 방법 |
|---|---|
| Tailwind 토큰 (cream/sand/paper/ink/mute/sage/clay), 폰트(Pretendard/Outfit), `ease-smooth`, `.grain` | 그대로 사용. 새 색·폰트를 추가하지 않는다 |
| `Eyebrow`, `Heading`, `LogoIcon` | 그대로 import |
| `TrainingForm`의 입력칸 스타일(`inputCls`), 선택 `Chip`, 에러 스타일, 제출 버튼 | 결제수단 칩·입력칸에 같은 클래스를 쓴다. 원본 파일은 수정하지 않고 클래스 문자열을 새 모듈에 복제한다 (등록 폼 회귀 위험 0) |
| `LanguageProvider` / `useLang` (EN/KR) | 그대로 사용 → 랜딩에서 고른 언어가 Daily Income에도 유지된다 |
| `Navbar` 안의 `LangToggle` | `export` 한 단어만 추가해 재사용 (동작·모양 변화 없음) |
| `installProtection()` | 새 엔트리에서도 호출 |
| `lucide-react` 아이콘 | 이미 의존성에 있음 |

---

## 2. 백엔드 선택 — 두 가지 안

### 안 A — 기존 Apps Script + 구글 시트 확장
- 시트에 `Staff`(이메일·이름·역할), `Payments`, `Periods`, `Audit` 탭을 추가한다.
- 로그인: "Sign in with Google" → 브라우저가 받은 ID 토큰을 Apps Script가 요청마다 검증(서명·`aud`·만료) → `Staff` 탭에서 역할을 조회한다.
- 권한 검사·집계·잠금은 모두 Apps Script 코드로 직접 구현하고, 동시 입력은 `LockService`로 막는다.

### 안 B — Supabase (권장)
- Postgres DB + Supabase Auth(관리형 로그인) + **Row Level Security(RLS)**.
- 권한은 DB 정책과 서버 함수(RPC)가 강제한다 → API를 직접 호출하거나 파라미터를 조작해도 데이터가 나오지 않는다.
- 프론트엔드 의존성 1개 추가: `@supabase/supabase-js`.

### 비교

| 기준 | A. Apps Script + 시트 | B. Supabase |
|---|---|---|
| DB 수준 접근 제한 | ❌ 없음. 시트 공유 권한뿐이고 스크립트 코드가 유일한 방어선 | ✅ RLS 정책 (요구사항 §8 그대로 충족) |
| 월 마감 잠금 | 코드로만. 시트를 직접 고치면 잠금·감사로그를 우회 | ✅ DB 트리거가 강제, 우회 경로 없음 |
| 감사 로그 | 코드로 기록 (시트 직접 편집은 누락) | ✅ 트리거가 모든 변경을 자동 기록 |
| 중복 제출 방지 | Lock + 수동 검사 | ✅ `UNIQUE(idempotency_key)` |
| 금액 정밀도 | 시트 숫자 (부동소수) | ✅ `bigint` 센트 + CHECK 제약 |
| iPhone 입력 속도 | 요청당 1~3초 (Apps Script 콜드스타트) | 보통 1초 미만 |
| 강사 로그인 | Google 계정 필수 + Google Cloud OAuth 클라이언트 설정 필요 | 이메일 6자리 코드 (구글 계정 불필요). Google 로그인도 선택 가능 |
| 비용 | $0 | 스테이징 Free, 프로덕션 Free 또는 Pro $25/월 (§6-6) |
| 데이터 보기 | 시트에서 바로 (익숙함) | 대시보드 + CSV 내보내기 |
| 향후 확장 | 수강생 포털 등에는 부적합 | `FUTURE-PLANS.md` 포털/VOD의 인증·DB 기반으로 재사용 |
| 새 스택 도입 | 없음 | 관리형 서비스 1개 (이미 로드맵에 있음) |

**B를 권장하는 이유:** 요구사항의 핵심(서버·DB 강제 권한, 마감 잠금, 감사 이력, 정확한 금액)은 장부의 신뢰성 문제다.
코드 규칙보다 DB 제약으로 보장하는 편이 안전하다. 안 A도 Google Cloud OAuth 설정이 필요해 "설정 0"이 아니고,
Supabase는 이미 로드맵에 있는 기술이라 "무관한 스택"이 아니다.

**A가 나은 경우:** 월 비용을 늘리고 싶지 않고 장부를 계속 구글 시트에서 직접 보고 싶을 때.
이 경우에도 아래 데이터 모델과 화면 계획은 그대로 두고 저장 계층만 바꾼다.

> 이하 계획은 **안 B 기준**이다.

---

## 3. 페이지 위치·구성

### 3.1 URL
- 프로덕션: `https://letspilatesla.com/daily-income/`
- 스테이징: `https://letspilatesla.com/staging/daily-income/`
- `<meta name="robots" content="noindex, nofollow">`, sitemap에는 넣지 않는다.
- 정적 호스팅이라 **페이지 껍데기(HTML/JS)는 누구나 받을 수 있다.** 로그인 전에는 로그인 화면만 보이고,
  데이터는 서버가 인증·권한을 확인한 요청에만 나간다. 보호 대상은 페이지가 아니라 데이터다.

### 3.2 화면 구성 (역할에 따라 자동 전환)

```
/daily-income/
 ├─ 로그인 (이메일 → 6자리 코드)
 ├─ STAFF : [결제 입력] [내 기록]
 └─ OWNER : [결제 입력] [대시보드] [거래 내역] [월 마감]   (+ Phase 2: [강사 관리])
```

- **결제 입력은 한 화면에서 끝난다:** 금액(숫자 키패드) → 결제수단 칩 7개 → (선택) 고객명·메모 → 저장.
  입력자와 일시는 서버가 자동으로 기록한다.
- 저장 후 "저장됨 ✓ $100.00 Cash"를 보여주고 폼을 비운다 → 연속 입력이 빠르다.
- 스태프 화면에는 스튜디오 전체 합계·차트·마감 메뉴가 **렌더되지 않는다.** 숨김 처리가 아니라 해당 화면 자체를 그리지 않고, 서버도 요청을 거부한다.

### 3.3 내비게이션 (⚠️ 디자인 동결 → 승인 필요)

| 선택지 | 내용 |
|---|---|
| **3.3-1 (권장, Phase 1)** | 공개 Navbar는 그대로 둔다. 강사는 북마크나 **iPhone 홈 화면 아이콘**으로 접속한다. Daily Income 페이지에는 자체 헤더(로고 + 언어 토글 + 로그아웃)를 둔다. |
| 3.3-2 (승인 시) | 로그인한 적이 있는 기기에서만 Navbar에 "Daily Income" 링크를 보여준다. 랜딩 페이지에는 Supabase 코드를 싣지 않고 `localStorage` 표시값만 읽는다 (표시용이라 보안과 무관). Navbar 디자인 변경이므로 승인 후 진행한다. |

### 3.4 디자인 원칙
- 기존 토큰·컴포넌트·클래스만 쓴다. 새 색상·폰트·관리자 템플릿은 없다.
- 새 페이지 UI도 **스테이징 목업으로 먼저 보여드리고 승인받은 뒤** 기능을 연결한다 (CLAUDE.md 규칙 1).
- Mobile-first: iPhone(393px) → iPad(820px) → 데스크톱. 터치 영역은 44px 이상, 표는 모바일에서 카드 목록으로 바꾼다.

---

## 4. 데이터 모델 (Postgres)

### 4.1 테이블

**`staff_members`** — 앱 역할 (사장님만 수정 가능)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| user_id | uuid PK → auth.users | |
| display_name | text | 대시보드 "강사" 표시명 |
| role | text CHECK (`STAFF`, `OWNER`) | ⚠️ 사용자가 직접 수정할 수 있는 `user_metadata`에는 두지 않는다 |
| active | boolean | 퇴사 시 false → 즉시 접근 차단 (기록은 보존) |

**`transactions`** — 요구 필드 매핑

| 요구 필드 | 컬럼 | 타입 / 규칙 |
|---|---|---|
| TransactionId | id | uuid PK |
| Amount | amount_cents | `bigint`. PAYMENT·REFUND는 `> 0`, 상한 설정 (예: $10,000) |
| Currency | currency | `'USD'` 고정 CHECK |
| PaymentMethod | payment_method | CHECK (`CASH`, `ZELLE`, `VENMO`, `CREDIT_CARD`, `DEBIT_CARD`, `CHECK`, `OTHER`) |
| PaymentDate | paid_at · business_date | 서버 시각(`timestamptz`) + 서버가 계산한 LA 기준 영업일(`date`) |
| CreatedAt | created_at | `timestamptz default now()` |
| CreatedBy | created_by | 서버가 `auth.uid()`로 강제. 클라이언트가 보낸 값은 무시 |
| ClientName | client_name | 선택, 길이 제한 |
| Notes | notes | 선택, 길이 제한 + 13~19자리 연속 숫자 거부 (카드번호 실수 입력 방지) |
| Status | status | CHECK (`ACTIVE`, `VOIDED`) |
| UpdatedAt | updated_at · updated_by | 트리거로 자동 |
| (추가) | kind | `PAYMENT` / `REFUND` / `ADJUSTMENT` — 컬럼은 Phase 1부터, 사용은 Phase 2 |
| (추가) | related_id | 환불·조정이 가리키는 원거래 |
| (추가) | void_reason · voided_by · voided_at | 무효 처리 기록 |
| (추가) | idempotency_key | uuid UNIQUE — 중복 제출 방지 |

**`accounting_periods`** (Phase 2) — `month`(그달 1일) PK, `status` OPEN/CLOSED, closed_at/by, reopened_at/by, 마감 시점 합계 스냅샷(jsonb).

**`audit_log`** — 언제·누가·무엇을·변경 전후 값·사유. INSERT만 가능하고 UPDATE/DELETE 권한은 없다.

### 4.2 규칙
- 카드 정보는 저장하지 않는다. 결제수단 이름만 저장한다.
- **삭제하지 않는다.** 정정은 무효(VOID)나 환불·조정 레코드로 한다.
- 영업일·주·월 계산은 모두 서버에서 `America/Los_Angeles` 기준으로 한다 (주 시작 요일은 §8에서 결정).
- 순매출 = 결제 − 환불 ± 조정. 무효 거래는 제외한다.

### 4.3 권한 (서버·DB에서 강제)

| 동작 | STAFF | OWNER | 강제 위치 |
|---|---|---|---|
| 거래 조회 | 본인 것만 | 전체 | RLS `SELECT` 정책 |
| 결제 입력 | ✅ (작성자 = 본인으로 강제) | ✅ | RPC `record_payment` |
| 본인 거래 수정·무효 | 같은 LA 영업일 + 그달 OPEN + ACTIVE일 때만 | 그달이 OPEN이면 전체 | RPC + 트리거 |
| 전체 합계·리포트 | ❌ (호출하면 에러) | ✅ | RPC 안의 `is_owner()` 검사 |
| 월 마감·재오픈 | ❌ | ✅ (재오픈은 사유 필수 + 감사로그) | RPC |
| 마감된 달 변경 | ❌ | ❌ (재오픈한 뒤에만) | 트리거 — 누구도 우회 불가 |
| 테이블 직접 INSERT/UPDATE/DELETE | ❌ | ❌ | 권한 회수(REVOKE). 모든 쓰기는 RPC 경유 |

- 신규 가입을 끈다 → 사장님이 초대한 이메일만 로그인할 수 있다.
- 공개 저장소에는 **publishable(anon) 키만** 들어간다. 원래 공개용 키이고 보호는 RLS가 맡는다.
  `service_role` 키는 저장소와 브라우저 어디에도 두지 않는다.

---

## 5. 변경 파일 목록 (안 B 기준)

### 새로 만드는 파일

```
pilates-landing/
├── daily-income/index.html                ← 두 번째 엔트리 (noindex)
└── src/daily-income/
    ├── main.tsx · App.tsx                 ← 세션·역할 판별 → 화면 분기
    ├── i18n.ts                            ← EN/KR 문구 (랜딩 번역 파일과 분리)
    ├── lib/supabase.ts                    ← 클라이언트 + 스테이징/프로덕션 자동 선택
    ├── lib/money.ts · lib/time.ts         ← 센트 파싱·표시, LA 날짜
    ├── ui.tsx                             ← 입력칸·칩·버튼 (TrainingForm과 같은 클래스)
    ├── auth/SignIn.tsx
    ├── staff/PaymentForm.tsx · MyHistory.tsx
    └── owner/Dashboard.tsx · TransactionTable.tsx · Breakdown.tsx
              · MonthClose.tsx (P2) · exportCsv.ts (P2)
supabase/
├── migrations/001_daily_income.sql        ← 테이블·RLS·RPC·감사 트리거
├── migrations/002_monthly_closing.sql     ← Phase 2
└── tests/acceptance.mjs                   ← §9 시나리오 자동 검증 (스테이징 DB 대상)
docs/daily-income/SETUP-KO.md              ← 사장님용 Supabase 설정 가이드 (apps-script/SETUP-KO.md 형식)
```

### 수정하는 파일 (최소)

| 파일 | 변경 | 영향 |
|---|---|---|
| `vite.config.ts` | 빌드 입력에 두 번째 HTML 추가 | 랜딩 빌드 결과가 동일한지 검증 |
| `package.json` | `@supabase/supabase-js` 1개 추가 | 랜딩 번들에 포함되지 않는지 검증 |
| `src/components/Navbar.tsx` | `LangToggle`에 `export` 추가 (3.3-2 승인 시 링크도) | 동작·모양 변화 없음 |
| `CLAUDE.md` | "현재 상태 메모"에 Daily Income 추가 | |

### 건드리지 않는 것
랜딩 섹션 전체, `TrainingForm`, `translations.ts`, `public/admin`, Apps Script, **배포 워크플로우** (§6-2 참고).

---

## 6. 통합 위험과 대응

| # | 위험 | 대응 |
|---|---|---|
| 1 | 스테이징에서 테스트한 결제가 실제 장부에 섞임 | Supabase 프로젝트 2개(staging/prod). 빌드 경로(`BASE_URL`이 `/staging/`인지)로 런타임에 자동 선택 |
| 2 | 워크플로우를 고치면 `main` 푸시 때는 옛 워크플로우가 스테이징을 빌드 → 환경 혼선 | 워크플로우는 수정하지 않는다. 1번의 런타임 선택으로 해결 |
| 3 | 멀티 페이지 빌드로 랜딩 번들 구성이 바뀔 수 있음 (React가 공통 청크로 분리) | 변경 전후 빌드 비교 + Playwright로 랜딩 렌더·등록 폼·스케줄 위젯·언어 토글 회귀 확인. 랜딩이 Supabase 코드를 받지 않는지 확인 |
| 4 | 난독화가 supabase-js에도 적용되어 번들이 커지고 느려짐 (드물게 오작동) | 실기기 속도 측정. 필요하면 Daily Income 청크만 난독화 제외 (보안은 서버가 맡으므로 손실 없음) |
| 5 | 공개 저장소 | anon 키만 커밋. RLS가 빠진 테이블이 없는지 테스트로 확인 |
| 6 | Supabase Free: 7일 동안 사용이 없으면 일시정지, 자동 백업 없음 | 프로덕션은 Pro($25/월, 일일 백업 7일 보관) 권장. Free를 유지하면 마감 때마다 CSV 보관을 필수 절차로 |
| 7 | 로그인 메일 발송 한도 (Supabase 기본 메일 서버) | 강사 몇 명이면 충분. 프로덕션은 별도 SMTP 연결 권장 |
| 8 | Mindbody와 중복 집계 (카드 결제가 이미 Mindbody에 잡히는 경우) | 범위 결정 필요 (§8-5) |
| 9 | iPhone 홈 화면 앱은 Safari와 저장공간이 분리됨 | 홈 화면 앱에서 1회 로그인 필요 — 가이드에 명시 |
| 10 | 디자인 동결 위반 | 새 화면은 목업 승인 후 진행, Navbar 링크는 별도 승인 |

---

## 7. 단계별 구현

> 모든 단계: `Staging` 푸시 → https://letspilatesla.com/staging/daily-income/ 에서 확인 → 승인 → `main` PR.
> 프로덕션 DB 변경도 스테이징 DB에서 먼저 검증한 마이그레이션만 적용한다.

### Phase 0 — 결정 & 준비
1. §8 결정 사항 답변.
2. 사장님 작업 (~30분, 가이드 제공): Supabase 프로젝트 2개(staging/prod) 생성, 신규 가입 끄기, 이메일 코드 로그인 켜기.
3. 스테이징에 테스트 계정 3개 (Owner, Instructor A, Instructor B).
4. **UI 목업** (가짜 데이터, 백엔드 없음)을 `/staging/daily-income/`에 올려 디자인 승인.

### Phase 1 — 핵심 기능
1. 멀티 페이지 엔트리 + 로그인 + 역할 판별 → 랜딩 회귀 테스트.
2. 마이그레이션 `001`: staff_members · transactions · audit_log(트리거) · RLS · `record_payment` RPC.
   - 감사 로그는 원안에서 Phase 2지만 **Phase 1부터 켠다.** 나중에 켜면 그 이전 변경 이력은 되살릴 수 없다.
3. 스태프: 결제 입력 + 내 기록. 중복 제출 방지 = 저장 중 버튼 잠금 + idempotency key.
4. 오너: 요약 카드(오늘/이번 주/이번 달/건수) · 결제수단별 · 강사별 · 일별 추이(CSS 막대, 라이브러리 없음) · 거래 표 · 기간 필터 · 수정/무효.
5. 보안 테스트(`acceptance.mjs`) + iPhone/iPad/데스크톱 뷰포트 확인 → 스테이징 승인 → 프로덕션 DB 마이그레이션 → `main` PR.

### Phase 2 — 재무 관리
1. 월 마감: 월 선택 → 결제수단별·강사별 합계, 총결제·환불·조정·순매출 → 검토 → "Close Month" → 잠금. 재오픈은 사유 입력 + 감사로그.
2. 환불·조정 레코드 (원거래 연결).
3. CSV 내보내기 — UTF-8 BOM을 넣어 Excel에서 한글이 깨지지 않게 연다 (추가 라이브러리 없음). 진짜 `.xlsx`가 꼭 필요하면 그때 결정.
4. 감사 로그 조회 화면, 강사 활성/비활성 관리.

### Phase 3 — 다듬기
1. 차트 고도화 (인라인 SVG, 라이브러리 없음).
2. 반응형·접근성 개선, iPhone 홈 화면 아이콘 (웹 앱 매니페스트).
3. 실제 강사 2명과 사용성 테스트 → 피드백 반영.

---

## 8. 결정 필요 (착수 전)

1. **백엔드:** B. Supabase (권장) / A. Apps Script + 시트
2. **강사 로그인:** 이메일 6자리 코드 (권장) / Google 로그인 / 둘 다
3. **내비게이션:** 3.3-1 공개 메뉴 변경 없음 (권장) / 3.3-2 로그인한 기기에만 링크 노출
4. **스태프 수정 가능 기간:** 같은 LA 영업일까지 (권장) / 월 마감 전까지
5. **기록 범위:** Mindbody로 결제된 카드 결제도 여기에 기록하나? 아니면 Mindbody 밖에서 받은 결제(현금·Zelle·Venmo 등)만?
6. **주 시작 요일:** 월요일 / 일요일
7. **스태프에게 본인 오늘 합계 표시:** 표시 (본인 것만, 권장) / 표시 안 함
8. **프로덕션 플랜:** Supabase Pro $25/월 (백업 포함, 권장) / Free + 마감 때 CSV 보관

---

## 9. 인수 기준 → 검증 방법

| 시나리오 | 검증 |
|---|---|
| A가 $100 Cash, B가 $150 Zelle 입력 | `acceptance.mjs` (스테이징 DB, 실제 로그인 토큰) |
| 각 강사는 본인 기록만 조회 | A 토큰으로 조회 → 1건. B 거래 id를 직접 조회 → 0건 |
| 오너는 2건 모두 보고, 오늘 합계 $250 | 오너 토큰 → `25000` 센트 |
| 스태프는 API로 전체 합계 조회 불가 | A 토큰으로 리포트 RPC 호출 → 권한 에러 |
| 오너가 월 검토·마감 | Phase 2 RPC + UI |
| 마감 후 스태프 수정 불가 | 마감 후 A가 수정 시도 → 에러 |
| 데스크톱·iPad·iPhone 동작 | Playwright 1440 / 820 / 393px 스크린샷 + 실기기 확인 |
| 기존 사이트 정상 | 랜딩 렌더·등록 폼·스케줄 위젯·EN/KR 토글 회귀 확인 |

---

## 참고 자료
- Supabase Row Level Security — https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase 사용자 데이터 관리 (`user_metadata`는 사용자가 수정 가능) — https://supabase.com/docs/guides/auth/managing-user-data
- Supabase 요금 (Free 일시정지, Pro 일일 백업) — https://supabase.com/pricing
- Google ID 토큰 서버 검증 (안 A) — https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Vite 멀티 페이지 빌드 — https://vite.dev/guide/build#multi-page-app
