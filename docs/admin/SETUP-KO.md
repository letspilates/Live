# 관리자 포털 Supabase 설정 가이드 (스테이징)

> 대상 프로젝트: **`studio`** (`https://prklzkcrhfnnlefvmxhb.supabase.co`) = **스테이징 전용**.
> 실제 운영용 프로젝트는 실제 결제를 기록하기 전에 따로 만든다 (마스터 플랜 Phase 5).
> 소요 시간 약 20분. 긴 SQL을 복사해야 하므로 **PC를 권장**한다.

### 🔐 공유해도 되는 값 / 절대 안 되는 값

| 공유 가능 (공개용) | 절대 공유 금지 |
|---|---|
| Project URL | Secret key (`sb_secret_…`) |
| Publishable key (`sb_publishable_…`) | service_role key |
| | 데이터베이스 비밀번호 |

공유 금지 값은 채팅·저장소·이메일 어디에도 넣지 않는다. 데이터는 이 값들이 아니라 **DB 권한 규칙(RLS)**으로 보호된다.

---

## 1단계 — Publishable key 전달

1. Supabase 대시보드 → 프로젝트 화면의 **Copy** (또는 Connect) → **Publishable key** 복사.
2. 채팅에 붙여넣기 → Claude가 `pilates-landing/src/admin/supabase.ts`에 넣고 Staging에 푸시한다.

## 2단계 — 인증(Authentication) 설정

1. **(나중에) 가입 막기:** Authentication → Sign In / Providers → **Allow new users to sign up → 끄기**.
   지금은 켜 둬도 된다: 가입해도 직원 프로필이 없으면 데이터에 접근할 수 없다. 실제 운영 전에는 끈다.
2. **주소 설정:** Authentication → URL Configuration
   - **Site URL:** `https://letspilatesla.com/staging/admin/`
   - **Redirect URLs** (Add URL로 하나씩):
     - `https://letspilatesla.com/staging/admin/set-password/`
     - `http://localhost:5173/admin/set-password/`
3. **비밀번호 최소 길이:** Email 설정의 Minimum password length → **8**.

## 3단계 — 데이터베이스 구조 (자동: GitHub 연동)

Supabase ↔ GitHub 연동이 **Production branch = `Staging`, Deploy to production = ON** 으로 되어 있으면,
Claude가 `Staging`에 push할 때 `supabase/migrations/`의 새 SQL이 **자동으로 적용**된다. 직접 붙여넣지 않는다.

연동 화면(Project Settings → Integrations → GitHub)의 올바른 값:

| 항목 | 값 |
|---|---|
| GitHub repository | `letspilates/Live` |
| Working directory | `.` |
| Deploy to production | ON |
| Production branch name | **`Staging`** ⚠️ 기본값이 `main`이니 반드시 바꾼다 (`studio`는 스테이징 DB) |

- `main`으로 두면 연동이 `main`만 보므로 아무것도 적용되지 않는다 (지금 `main`에는 `supabase/`가 없다).
- 설정을 바꾼 **뒤의 push부터** 반응한다. 설정 전에 올라간 커밋은 다시 보지 않는다.
- 운영용 프로젝트를 만들면 **그 프로젝트**를 `main`에 연결한다.

- 확인: Supabase → **Database → Migrations**에 첫 마이그레이션이 보이면 완료. 첫 파일은 번호가 `0001`이라 화면에 안 보일 수 있으니, SQL Editor에서 `select version from supabase_migrations.schema_migrations;` 로 `0001`을 확인해도 된다.
  SQL Editor에서 `select * from staff_profiles;` 가 오류 없이 빈 결과를 내도 완료.
- ⚠️ **같은 SQL을 SQL Editor에 다시 붙여넣지 않는다.** 연동은 자기가 적용한 기록만 알기 때문에, 손으로 먼저 실행하면 다음 자동 적용이 "already exists"로 실패한다.
- **Automatic branching(미리보기 브랜치)은 꺼 둔다.** PR마다 DB를 새로 만드는 유료 기능이라 지금은 필요 없다.
- 연동을 끄고 수동으로 할 때만: 파일 Raw 내용을 SQL Editor에 붙여넣고 Run (한 번만).

## 4단계 — 첫 오너 계정 (1회)

1. Authentication → **Users** → **Add user** → **Create new user**
   - 이메일, 비밀번호(8자 이상), **Auto Confirm User 체크** → Create.
2. **SQL Editor**에서 실제 이메일·이름으로 실행 (따옴표 안을 실제 값으로 바꾼다):
   ```sql
   select app.grant_owner('calvin@example.com', 'Calvin');
   ```
   결과 칸이 비어 있으면 **성공**이다 (이 함수는 값을 돌려주지 않는다).
3. 포털에서 로그인 (이미 로그인 중이면 새로고침).

> `app.grant_owner`는 **SQL Editor(프로젝트 관리자)에서만** 실행된다. 사이트·API로는 호출할 수 없다.
> ⚠️ `auth.users` 전체를 한꺼번에 오너로 지정하는 쿼리는 **계정이 본인 것뿐일 때 한 번만** 쓴다.
> 신규 가입이 열려 있으면 모르는 계정이 섞일 수 있으므로, 이후 직원은 아래 "직원 추가"로만 넣는다.

## 직원 추가 (강사·두 번째 오너) — 메일 없이

1. Supabase → Authentication → Users → **Add user** → 이메일·비밀번호 입력, **Auto Confirm User 체크** → Create.
2. 포털 → **Staff → 직원 추가(Add staff)** → 같은 이메일, 이름, 역할(강사/오너), 가격 등급 → 추가.
3. 그 사람에게 이메일과 비밀번호를 직접 알려준다. 첫 로그인 후 **My account → 비밀번호 변경**을 권한다.

- 비활성화·재활성화·역할 변경도 Staff 화면에서 한다. 비활성화하면 즉시 데이터 접근이 막히고 로그인도 차단된다 (기록은 남는다).
- 계정을 Supabase에서 **삭제하지 않는다** (지난 기록과 연결되어 있어 DB가 막는다). 그만둔 직원은 비활성화한다.

## 5단계 — Edge Function `staff-admin` (자동: GitHub 연동)

3단계와 같은 push로 `supabase/functions/staff-admin`이 **자동 배포**된다.
`supabase/config.toml`이 **Verify JWT = OFF**를 지정하므로 대시보드에서 따로 끌 필요가 없다.

- 확인: Supabase → **Edge Functions** 목록에 `staff-admin`이 보이고, 상세 화면의 Verify JWT가 꺼져 있으면 완료.
- 이유: 새 키 형식(`sb_…`)은 JWT가 아니라서 함수가 호출자를 직접 확인한다. 오너가 아니면 DB 함수가 거부한다.
- 별도 비밀값 설정은 필요 없다 (Supabase가 자동으로 넣어준다).

## 6단계 (선택) — 메일 발송 설정

지금은 메일을 쓰지 않는다 (직원 계정은 위의 "직원 추가"로 직접 만든다).
메일이 필요한 곳은 **"비밀번호를 잊으셨나요?" 재설정 메일**뿐이다. Supabase 기본 메일은 조직 멤버에게만, 시간당 2통 보낸다.
강사가 재설정 메일을 받게 하려면 Authentication → Emails → SMTP Settings에서 Gmail SMTP를 켠다:

| 항목 | 값 |
|---|---|
| Sender email / Username | `letspilatesla@gmail.com` |
| Host / Port | `smtp.gmail.com` / `465` |
| Password | Google **앱 비밀번호** (2단계 인증 → 앱 비밀번호) |

설정 전에는 강사가 비밀번호를 잊으면 Claude에게 요청 → 오너가 SQL로 새 비밀번호를 지정하는 방법을 안내받는다.

## 7단계 — 동작 확인

1. https://letspilatesla.com/staging/admin/ → 오너 계정 로그인 → 대시보드.
2. Supabase에서 테스트용 강사 계정 생성 → 포털 **Staff → 직원 추가**(역할: 강사).
3. 다른 브라우저(또는 시크릿 창)에서 그 강사로 로그인 → 강사 화면 (직원 메뉴 없음).
4. 강사 계정으로 주소창에 `/staging/admin/staff/` 직접 입력 → 대시보드로 돌아간다 (정상: 오너 전용).
5. 오너로 그 강사를 **비활성화** → 강사 화면 새로고침 → "비활성 계정" (즉시 차단 확인).

## 8단계 (선택) — Claude가 직접 보안 테스트를 돌리게 하려면

Claude Code 클라우드 환경 설정 → Network access → **Allowed domains**에 `*.supabase.co` 추가.
그러면 실제 로그인 토큰으로 "강사가 남의 기록·합계를 못 보는지"를 API에 직접 시험할 수 있다.

---

## 기존 관리자 페이지

- 스테이징: https://letspilatesla.com/staging/admin/legacy/ (기존 비밀번호 그대로).
- 프로덕션 https://letspilatesla.com/admin/ 은 main에 반영하기 전까지 **기존 그대로**다.
- ⚠️ **운영용 Supabase 프로젝트를 만들기 전에는 Staging → main 반영 금지.**
  반영하면 `/admin/`이 "연결되지 않음" 화면이 되고 기존 페이지는 `/admin/legacy/`로 옮겨진다.

## 개발자 참고

- DB 변경은 `supabase/migrations/`에 `<타임스탬프>_이름.sql` 형식으로 추가한다 (`date -u +%Y%m%d%H%M%S`).
  첫 파일 `0001_foundation.sql`은 이미 적용되어 DB에 버전 `0001`로 기록돼 있으므로 이름을 그대로 둔다. `Staging` push → 연동이 스테이징 DB에 적용한다.
  이미 적용된 마이그레이션 파일의 **이름을 바꾸지 않는다** (새 마이그레이션으로 인식되어 다시 실행되다 실패한다).
- 로컬 검증: `bash supabase/tests/run-local.sh` (임시 Postgres에 마이그레이션 + 권한 테스트, 실제 프로젝트는 건드리지 않음).
