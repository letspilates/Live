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

1. **가입 막기:** Authentication → Sign In / Providers → **Allow new users to sign up → 끄기**.
   (Email 로그인 자체는 켜둔다. 초대받은 사람만 계정이 생긴다.)
2. **주소 설정:** Authentication → URL Configuration
   - **Site URL:** `https://letspilatesla.com/staging/admin/`
   - **Redirect URLs** (Add URL로 하나씩):
     - `https://letspilatesla.com/staging/admin/set-password/`
     - `http://localhost:5173/admin/set-password/`
3. **비밀번호 최소 길이:** Email 설정의 Minimum password length → **8**.

## 3단계 — 데이터베이스 구조 만들기 (SQL 1회 실행)

1. 이 파일을 연다: https://github.com/letspilates/Live/blob/Staging/supabase/migrations/0001_foundation.sql
   → **Raw** 버튼 → 전체 선택 → 복사.
2. Supabase → **SQL Editor** → New query → 붙여넣기 → **Run**.
3. `Success. No rows returned`가 보이면 완료.
   - 오류가 나면 **아무것도 만들어지지 않는다**(한 덩어리로 실행됨). 오류 문구를 그대로 알려주면 된다.
   - 두 번 실행하면 "already exists" 오류가 난다. 무해하다 (이미 만들어졌다는 뜻).

## 4단계 — 오너 계정 2개 (Calvin, Sunnie)

1. Authentication → **Users** → **Add user** → **Create new user**
   - 이메일, 비밀번호(각자 정함, 8자 이상), **Auto Confirm User 체크** → Create.
   - 두 분 각각 만든다.
2. **SQL Editor**에서 실제 이메일·이름으로 바꿔 실행:
   ```sql
   select app.grant_owner('calvin의-이메일@example.com', 'Calvin 이름');
   select app.grant_owner('sunnie의-이메일@example.com', 'Sunnie Lee');
   ```
3. 확인:
   ```sql
   select full_name, role, status from staff_profiles;
   ```
   → `OWNER / ACTIVE` 두 줄.

> `app.grant_owner`는 **SQL Editor(프로젝트 관리자)에서만** 실행된다. 사이트·API로는 호출할 수 없다.
> 앞으로 오너 추가는 포털의 직원 화면 → "오너로 지정"으로 한다.

## 5단계 — Edge Function `staff-admin` 배포 (강사 초대·비활성화)

1. **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. 함수 이름: **`staff-admin`** (정확히 이 이름).
3. 기본 코드를 지우고 이 파일 전체를 붙여넣기:
   https://github.com/letspilates/Live/blob/Staging/supabase/functions/staff-admin/index.ts (Raw → 복사)
4. **Deploy**.
5. 배포 후 함수 설정(Details)에서 **Verify JWT (Enforce JWT verification) → OFF** → 저장.
   - 이유: 새 키 형식(`sb_…`)은 JWT가 아니라서 함수가 호출자를 직접 확인한다. 오너가 아니면 DB 함수가 거부한다.
   - 별도 비밀값 설정은 필요 없다 (Supabase가 자동으로 넣어준다).

## 6단계 — 메일 발송 설정 (강사 초대 전에 필수)

Supabase 기본 메일 서버는 **조직 멤버에게만, 시간당 2통**까지만 보낸다 → 강사 초대가 실패한다.

Authentication → **Emails** → **SMTP Settings** → Enable custom SMTP:

| 항목 | 값 |
|---|---|
| Sender email | `letspilatesla@gmail.com` |
| Sender name | `Let's Pilates LA` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `letspilatesla@gmail.com` |
| Password | Google **앱 비밀번호** (16자리) |

- 앱 비밀번호 만들기: Google 계정 → 보안 → **2단계 인증 켜기** → **앱 비밀번호** 생성.
  일반 Gmail 비밀번호는 동작하지 않는다.
- (선택) Emails → Templates → **Invite user** 제목을 `Let's Pilates LA 관리자 포털 초대`로 바꾸면 알아보기 쉽다.

## 7단계 — 동작 확인 (1단계 반영 후)

1. https://letspilatesla.com/staging/admin/ → 로그인 화면이 나온다.
2. 오너 계정으로 로그인 → 대시보드에 "팀: 활성 2".
3. **직원 → 강사 초대** → 본인의 다른 이메일로 테스트 → 메일의 링크 → 비밀번호 설정 → 강사 화면.
4. 그 강사 계정으로 주소창에 `/staging/admin/staff/` 직접 입력 → 대시보드로 돌아간다 (정상: 오너 전용).
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

- DB 변경은 `supabase/migrations/`에 번호순 SQL로 추가하고, 스테이징 프로젝트에서 먼저 실행한다.
- 로컬 검증: `bash supabase/tests/run-local.sh` (임시 Postgres에 마이그레이션 + 권한 테스트, 실제 프로젝트는 건드리지 않음).
