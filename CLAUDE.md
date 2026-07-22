# CLAUDE.md — Let's Pilates LA

> 이 파일은 매 세션 시작 시 Claude에게 자동 로드된다. 아래 규칙은 **강제(binding)**이며,
> Claude는 작업 전 반드시 이 규칙을 준수한다.

- **Repository:** https://github.com/letspilates/Live
- **Production (라이브):** https://letspilatesla.com/
- **Staging (개발/미리보기):** https://letspilatesla.com/staging/
- **사이트 소스:** `pilates-landing/` (React + Vite + Tailwind)

---

## ⛔ 절대 규칙 (ABSOLUTE RULES — 위반 절대 금지)

### 1. 디자인 / UI / UX 동결 — 허락 없이 변경 절대 금지
이 사이트의 **디자인·UI·UX는 완성되어 동결(LOCKED)** 상태다.
**사용자의 명시적 허락 없이는 어떤 디자인 변경도 절대 하지 않는다.**

동결 대상 (사용자 승인 없이 손대지 않음):
- 레이아웃, 간격(spacing), 그리드, 섹션 구조와 순서
- 타이포그래피 — 폰트, 크기, 굵기, 자간, 줄간격
- **색상 스키마(color scheme) — 그 어떤 색도 바꾸지 않는다** (cream/sand/ink/sage/clay 등 팔레트 전부)
- 컴포넌트 구조, 카드·버튼·칩 스타일, 라운드/그림자/보더
- 애니메이션, 트랜지션, 스크롤 리빌, 패럴럭스, 호버 효과

**허용:** 컨텐츠(텍스트·카피·번역·이미지·데이터·링크·연락처·강사/프로그램 정보)는 언제든 변경 가능.
단, 컨텐츠 변경이 레이아웃·디자인을 바꾸지 않도록 주의한다.

**디자인 변경이 필요해 보이면 → 먼저 사용자에게 묻고 승인받는다. 임의 변경 절대 금지.**
색상 하나, 여백 하나라도 마찬가지다.

### 2. 스테이징 우선 (STAGING-FIRST) — 예외 없음
**모든 변경은 반드시 `/staging`에서 먼저 확인한 뒤에만 프로덕션에 배포한다.**
- 스테이징 미확인 상태로 프로덕션(main) 배포 **절대 금지**.
- 프로세스는 아래 "개발 → 배포 프로세스" 참조.

### 3. 데일리 로그 (DAILY LOG) — 매 세션 필수
**작업 세션이 끝날 때마다** `daily-logs/YYYY-MM-DD.md` 파일을 만들어(또는 그날 파일에 추가) **그날 한 일을 기록한다.**
- 사용자가 세션을 마무리하려 하거나 "오늘 끝" 신호를 주면 로그를 작성한다.
- **새 세션 시작 시 `daily-logs/`의 가장 최근 파일을 먼저 읽어** 지난 작업 맥락을 파악한다.
- 기록 항목: 무엇을·왜 변경했는지, 배포 여부(staging/prod), 관련 PR/커밋, 남은 할 일.

### 4. 버전 관리 (VERSION CONTROL)
- 모든 변경은 git으로 버전화한다. 커밋 메시지는 명확하게.
- 이 저장소는 향후 확장될 여러 웹앱의 기반이므로, **버전 관리와 로그를 최우선**으로 다룬다.

---

## 🌿 브랜치 모델

| 브랜치 | 역할 | URL | 배포 |
|---|---|---|---|
| `main` | 프로덕션 (라이브) | https://letspilatesla.com/ | push 시 자동 |
| `Staging` | 개발 / 미리보기 | https://letspilatesla.com/staging/ | push 시 자동 |

- GitHub Actions(`.github/workflows/deploy-pages.yml`)가 **두 브랜치를 하나의 Pages 아티팩트로 합쳐** 배포한다.
  - `main`의 빌드 → 사이트 루트 `/`
  - `Staging`의 빌드 → `/staging/` (base=/staging/)
- 둘 중 아무 브랜치에 push해도 워크플로우가 돌아 **두 환경을 함께 재배포**한다.
  (staging에 push → `/staging`만 새 내용, 프로덕션은 그대로. main에 병합 → 프로덕션 갱신.)

---

## 🔁 개발 → 스테이징 → 프로덕션 프로세스 (표준)

1. **작업**: `Staging` 브랜치에서 컨텐츠를 수정한다. (디자인은 승인 없이 건드리지 않는다)
2. **푸시**: `Staging`에 commit + push → Actions 자동 빌드.
3. **스테이징 확인**: **https://letspilatesla.com/staging/** 에서 사용자가 검토한다.
4. **승인**: 사용자가 스테이징에서 확인·승인한다. (승인 전에는 절대 프로덕션 배포 금지)
5. **프로모션**: 승인 후 `Staging` → `main` PR을 만들어 병합한다. → 프로덕션 자동 배포.
6. **검증**: https://letspilatesla.com/ 반영 확인.
7. **로그**: 세션 종료 시 `daily-logs/YYYY-MM-DD.md` 작성.

> main은 보호 브랜치라 직접 push가 막혀 있다. 프로덕션 반영은 항상 PR 병합으로 한다.

---

## 🗂 프로젝트 구조

```
Live/                          ← 저장소 루트
├── CLAUDE.md                  ← 이 파일 (거버넌스 규칙)
├── daily-logs/                ← 세션별 작업 로그 (YYYY-MM-DD.md)
├── .github/workflows/         ← 배포 워크플로우
├── Archive/                   ← 구 정적 사이트 (서빙 안 함, 보관용)
├── CNAME                      ← 커스텀 도메인
└── pilates-landing/           ← ★ 사이트 소스 (Vite 앱)
    ├── src/
    │   ├── components/        ← 섹션 컴포넌트
    │   ├── i18n/              ← 번역(translations.ts) — 컨텐츠는 대부분 여기
    │   └── media.ts           ← 이미지 경로 (BASE_URL 기준)
    ├── public/media/          ← 이미지 (webp)
    └── index.html             ← 메타/SEO/구조화 데이터(JSON-LD)
```

---

## 🛠 기술 스택 / 명령어

- **스택**: React 19, Vite, TailwindCSS, TypeScript. 다국어 EN/KR 토글(`src/i18n`).
- **로컬 개발**: `cd pilates-landing && npm run dev`
- **로컬 프로덕션 미리보기**: `cd pilates-landing && npm run build && npm run preview`
- **빌드/린트 검증** (커밋 전 항상): `npm run build` + `npm run lint`

---

## 📌 현재 상태 메모 (수시 갱신)

- 사이트: Let's Pilates LA — 필라테스·자이로토닉 스튜디오 (로스앤젤레스), EN/KR.
- 섹션: Hero → About(수업 방식) → Programs → Training(지도자 과정) → Instructors → Schedule(Mindbody 위젯) → FAQ → CTA → Footer.
- Testimonials(회원 후기) 섹션은 컴포넌트만 존재, 현재 **숨김**.
- 스케줄: Mindbody(Healcode) 신버전 위젯 사용.
