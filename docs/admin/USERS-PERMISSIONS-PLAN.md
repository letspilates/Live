# 유저 관리 · 권한(Settings → Admin) · 다크 모드 — 계획

> 2026-10-10 Calvin 요청. `Staging`에서 진행. 상위 문서: `ADMIN-PORTAL-MASTER-PLAN.md`.

## 1. 역할 (복수 선택)

| 역할 | 의미 |
|---|---|
| Owner | 모든 메뉴·수정·삭제·유저 초대. Owner 역할을 주고 빼는 것은 Owner만 가능. 마지막 Owner는 지울 수 없음 |
| Admin (새로 추가) | Owner와 같은 권한 (메뉴·수정·삭제·초대). 단, Owner 계정은 건드릴 수 없음 |
| Staff | Settings → Admin에서 켠 메뉴만 (기본: 스케줄(추후), Clients, Payments) |
| Instructor | Settings → Admin에서 켠 메뉴만 (기본: Clients, Payments) |

- 한 사람이 여러 역할을 가질 수 있다 (`staff_profiles.roles`). 권한은 가진 역할들의 합.
- 기존 `role` 칸은 "대표 역할"(가장 높은 것)로 자동 유지 → 이미 만든 화면·함수가 깨지지 않는다.
- DB 판단은 한 곳에서: `app.is_owner()` = Owner 또는 Admin (전체 권한), `app.can('메뉴')` = 그 메뉴 접근 가능.
  기존 결제 함수의 `role <> 'OWNER'` 비교도 `app.is_owner()`로 바꾼다.

## 2. Settings → Admin (메뉴 권한표)

- 행 = 메뉴, 열 = 역할. Owner·Admin 열은 항상 전체 (잠금).
- Staff·Instructor는 **Schedule, Clients, Payments**를 켜고 끌 수 있다.
  나머지(Trainings, Expenses, 재무, Users, Notifications, Settings)는 Owner·Admin 전용으로 고정 표시.
  이유: 그 메뉴들은 아직 "보기만" 하는 화면이 없어 켜도 빈 화면이 된다. 필요해지면 그 메뉴를 켤 수 있게 한 줄 추가.
- 메뉴 안에서 Staff·Instructor가 할 수 있는 일은 지금처럼: Payments = 본인 기록·당일 수정, Clients = 목록·결제 내역 보기 (수정·가져오기는 Owner·Admin).
- 사이드바·주소 접근·DB가 모두 이 표를 따른다.

## 3. Users

- **Add User** (기존 Add Staff). 한 창에서 인적 사항 입력: 이름, 이메일, 전화, 주소, 자격증, 메모, 역할(복수), 강사 등급.
- 들어오는 방법 선택 (한 창 안에서):
  1. **초대 메일 보내기 (기본)** → 받은 사람이 링크로 비밀번호를 만들고, 첫 화면에서 전화·주소·자격증을 확인·보완.
  2. **지금 비밀번호 정하기** → 메일 없이 바로 계정 생성 (지금 방식).
- 각 유저 **수정**(인적 사항·역할·등급), **비활성화/재활성화**, **초대 다시 보내기**, **삭제**.
  - 삭제: 결제·지출 등 기록이 있는 사람은 기록 보존을 위해 삭제 대신 비활성화를 안내 (재무 기록은 지우지 않는다는 원칙).
- 본인은 **My account**에서 자기 전화·주소·자격증을 고칠 수 있다.

## 4. 다크 모드

- 포털 상단 바에 해/달 아이콘. 처음엔 기기 설정을 따르고, 누르면 기억.
- 홈페이지는 그대로 (색 값을 변수로만 바꾸고 값은 동일 → 픽셀 비교로 확인).

## 5. 사장님 쪽 설정 (초대 메일)

- Supabase 기본 메일은 Supabase 팀 멤버 주소로만 보내진다. 실제 직원에게 보내려면 **Custom SMTP**(예: Resend, Gmail SMTP) 1회 설정 필요.
- Auth → URL Configuration의 Redirect URLs에 `https://letspilatesla.com/staging/admin/set-password/` 포함.
- 설정 전에도 "지금 비밀번호 정하기"는 그대로 동작.

## 6. 검증

DB 권한 테스트(역할 조합·Admin이 Owner 못 건드림·메뉴 끄면 DB도 거부), 빌드·린트, 포털 화면 확인(Playwright), 홈페이지 픽셀 비교.
