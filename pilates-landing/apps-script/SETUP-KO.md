# 코스 목록 관리 설정 가이드 (한 번만 하면 됩니다)

이 설정을 마치면 **구글 시트에서 코스를 수정/추가/삭제하는 것만으로 사이트 등록 폼에 바로 반영**됩니다.
코드나 배포를 다시 만질 일은 없습니다.

소요 시간: 약 5분

---

## 1단계 — 스프레드시트에 "Courses" 탭 만들기

등록 신청이 쌓이는 **기존 스프레드시트**를 엽니다.
(폼 제출이 기록되던 그 시트입니다)

1. 하단의 **+ (시트 추가)** 를 눌러 새 탭을 만들고, 탭 이름을 정확히 **`Courses`** 로 바꿉니다. (대소문자 그대로)
2. 아래 표를 그대로 복사해서 A1 셀에 붙여넣습니다:

```
id	name_en	name_kr	dates	tag_en	tag_kr	active
A	GYROTONIC® Level 1 Foundation Course	GYROTONIC® Level 1 기초 과정 (Foundation Course)		12 days	12일	TRUE
B	GYROTONIC® Level 2 Program 1 — Pre-Training	GYROTONIC® Level 2 Program 1 — 사전 교육 (Pre-Training)		3 days	3일	TRUE
C	Jumping Stretching Board Course	점핑 스트레칭 보드 과정 (Jumping Stretching Board)		7 days	7일	TRUE
D	GYROTONIC® Level 1 Apprentice Review Course	GYROTONIC® Level 1 견습 리뷰 과정 (Apprentice Review)		6 days	6일	TRUE
E	GYROTONIC® Level 2 Program 1 — Foundation Course	GYROTONIC® Level 2 Program 1 — 기초 과정 (Foundation Course)		4 days	4일	TRUE
```

3. **dates 열(D열) 전체를 선택** → 메뉴 **서식 → 숫자 → 일반 텍스트** 로 설정합니다.
   (이걸 안 하면 "4/10" 같은 입력이 날짜로 자동 변환되어 이상하게 보일 수 있습니다)

### 각 열의 의미

| 열 | 의미 | 예시 |
|---|---|---|
| `id` | 코스 구분 문자 (원 안에 표시됨) | A, B, C... |
| `name_en` | 영문 코스명 | GYROTONIC® Level 1 Foundation Course |
| `name_kr` | 한글 코스명 | GYROTONIC® Level 1 기초 과정 |
| `dates` | 일정 (비워두면 "일정 추후 공지"로 표시) | 4/10–12, 4/17–19 |
| `tag_en` | 영문 기간 뱃지 | 12 days |
| `tag_kr` | 한글 기간 뱃지 | 12일 |
| `active` | TRUE = 사이트에 표시, FALSE = 숨김 | TRUE |

---

## 2단계 — Apps Script 코드 교체

1. 같은 스프레드시트에서 메뉴 **확장 프로그램 → Apps Script** 를 엽니다.
2. 편집기에 있는 기존 코드를 **전부 지우고**, 이 폴더의 `google-apps-script.js` 파일 내용을 **전체 복사해서 붙여넣습니다.**
3. 💾 저장 (Ctrl+S / Cmd+S)

## 3단계 — 재배포 (⚠️ 가장 중요 — "새 배포" 아님!)

주소가 바뀌면 사이트와 연결이 끊어지므로, 반드시 **기존 배포를 업데이트**해야 합니다:

1. 우측 상단 **배포 → 배포 관리** 클릭
2. 기존 배포(웹 앱) 옆의 **✏️ 연필(수정) 아이콘** 클릭
3. **버전** 드롭다운에서 **"새 버전"** 선택
4. **배포** 클릭

> ❌ "새 배포" 버튼을 누르면 새 주소가 생겨서 사이트와 연결이 끊깁니다.
> 반드시 "배포 관리 → 연필 → 새 버전" 순서로 해주세요.

## 4단계 — 확인

브라우저 새 탭에서 기존 웹 앱 주소(`https://script.google.com/macros/s/.../exec`)를 열었을 때
아래처럼 **코스 목록 JSON**이 보이면 성공입니다:

```json
{"result":"success","courses":[{"id":"A","name_en":"GYROTONIC® Level 1 Foundation Course",...}]}
```

이후 사이트(스테이징 또는 라이브)에서 폼을 열면 시트의 목록이 그대로 표시됩니다.

---

## 이후 일상 관리 (이것만 하면 됩니다)

- **날짜 변경**: Courses 탭에서 dates 칸 수정 → 저장. 끝.
- **코스 잠시 숨기기**: active를 `FALSE`로. 다시 열 땐 `TRUE`.
- **새 코스 추가**: 새 행 추가 (id는 겹치지 않게).
- 반영 시점: 저장 즉시. (방문자 브라우저에 이전 목록이 캐시되어 있으면 다음 방문 때 갱신)

## 만약 시트/스크립트에 문제가 생기면?

사이트 폼은 절대 죽지 않습니다. 시트를 읽지 못하면 코드에 내장된 기본 코스 목록을
자동으로 표시하고, 마지막으로 성공했던 목록이 방문자 브라우저에 저장되어 있으면 그걸 먼저 씁니다.
