# Phase 6 — Expenses (지출 · 정기 지출)

> 상위 문서: `ADMIN-PORTAL-MASTER-PLAN.md` (E.8 와이어프레임, F.2 `expenses`·`recurring_expense_rules`, H 권한표, J.3 정기 지출 생성, 24.3 테스트, S4).
> 2026-10-10 작성. 마스터 플랜 승인 범위 안에서 `Staging`에 진행한다.

## 1. 출발점

| 필요한 것 | 지금 상태 | 이번 처리 |
|---|---|---|
| 월 잠금 (`accounting_periods`) | 있음 (Phase 5). 마감 버튼은 Phase 7 | 지출에도 같은 잠금 트리거를 건다 |
| 직원 목록 (강사 보수 연결) | 있음 (`staff_profiles`) | 지출에 "지급 대상 직원"을 선택적으로 연결 |
| 감사 로그 | 있음 | 지출·정기 규칙 변경 전/후 기록 |

## 2. 이번 단계에서 하는 것

### DB (마이그레이션 1개 `…_expenses.sql`, 전부 오너 전용)
- `expense_categories` — 12개 시드: Studio Rent, Instructor Compensation, Utilities, Internet / Phone, Insurance,
  Software Subscriptions, Equipment, Studio Supplies, Cleaning / Maintenance, Marketing, Payment Processing Fees, Other Expenses.
- `expenses` — 금액 정수 센트(음수 = 업체 환급, 메모 필수, ±$100,000 상한), 지출일이 속한 달에 귀속, 미지급/지급(지급일·지급 방법),
  삭제 없음(무효 = `VOID` + 사유), 정기 규칙에서 만든 건은 규칙과 연결, 추정 금액 표시, 지급 대상 직원(선택).
- `recurring_expense_rules` — 월간만. 금액, 납부일(31일 없는 달은 말일), 시작 달, 종료 달(선택), 추정 여부, 켜기/끄기. 삭제 없음.
- `generate_recurring_expenses()` — 켜진 규칙마다 시작 달 ~ 이번 달 중 **열린 달**에 지출이 없으면 1건 만든다 (미지급).
  `UNIQUE (규칙, 달)`로 몇 번을 실행해도 중복이 없다. 마감된 달은 건너뛴다. 미래 달은 만들지 않는다.
- 마감된 달의 지출은 추가·수정 불가 (Phase 5와 같은 잠금).
- 강사·스태프는 지출 관련 테이블을 한 줄도 읽지 못한다 (S4).

### 화면 (`/admin/expenses`, 오너만)
- **지출** 탭: ‹ 2026년 10월 › 달 이동, 합계(총액·지급·미지급 건수), 카테고리·상태 필터, 검색, 목록(↻ 정기, 추정 표시),
  미지급 행에 [지급 처리], 지출 추가·수정·무효, 그달 CSV 내보내기.
- **정기 지출** 탭: 규칙 목록, 추가·수정(금액 변경은 다음 생성부터 적용, "이번 달 미지급분에도 적용" 체크), 끄기/종료 달.
- 사이드바에 "Expenses / 지출" 메뉴 (오너만).

## 3. 하지 않는 것 (다음 단계)

- 월 마감·재오픈, 매출 대비 지출 리포트, 대시보드 KPI → Phase 7.
- 카테고리 설정 화면 (12개 고정, 필요해지면).
- 강사 보수 자동 계산 (규칙 미정).
- 공개 홈페이지 변경 없음.

## 4. 결정한 기본값 (바꾸고 싶으면 말씀 주세요)

1. **정기 지출 생성 시점 = 지출 화면을 열 때.** 마스터 플랜의 pg_cron(매일 자동)은 넣지 않는다.
   지출을 보는 사람은 오너뿐이고, 화면을 열 때 놓친 달까지 채워지므로 결과가 같다. 설정할 것이 하나 줄어든다.
   Phase 7 대시보드·리포트도 열릴 때 같은 함수를 부른다.
2. 카테고리는 12개 고정.
3. 지급 방법(지출 쪽)은 목록에서 선택: Cash, Zelle, Check, Card, Bank transfer / ACH, Autopay, Other.
4. 새 정기 규칙의 시작 달 기본값 = 이번 달.
5. 강사 보수는 카테고리가 "Instructor Compensation"일 때만 지급 대상 직원 선택 칸을 보여준다.

## 5. 검증

- `supabase/tests/expenses.test.sql` (로컬 Postgres): 명세 24.3 ($3,000 임대료 규칙 → 생성 → 재생성 중복 없음 → 미지급 → 지급 처리 →
  금액 변경 후 지난 달 보존 → 강사 조회 불가), S4 (강사·스태프·anon 0행, 쓰기 불가), 2월 31일 → 28일, 마감 달 건너뜀·수정 차단,
  종료 달·꺼진 규칙, 음수 메모 필수, 무효 사유 필수, 삭제 불가.
- `pilates-landing/tests/admin-shell.mjs`에 지출 화면 확인 추가 (393/820/1280px).
- `npm run build` + `npm run lint`.
