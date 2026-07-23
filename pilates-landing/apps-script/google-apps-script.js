/**
 * Google Apps Script — Let's Pilates LA 등록 폼 백엔드
 *
 * 기능:
 *  1. doPost — 사이트 등록 폼 제출을 스프레드시트에 기록 + 이메일 알림 발송
 *  2. doGet  — "Courses" 탭의 코스 목록 + 정원/신청 수를 JSON으로 반환 (사이트가 읽어감)
 *
 * 설치 방법은 같은 폴더의 SETUP-KO.md 참조.
 * 이 파일 전체를 Apps Script 편집기에 붙여넣어 기존 코드를 교체하면 된다.
 */

/**
 * 알림 받을 이메일 주소. 빈 문자열('')이면 시트 소유자(스크립트 계정)로 발송된다.
 * 다른 주소로 받고 싶으면 따옴표 안에 입력: 예) 'studio@example.com'
 * 여러 명이면 쉼표로 구분: 예) 'a@x.com,b@y.com'
 */
var NOTIFY_EMAIL = '';

/**
 * ★ 관리자 페이지(letspilatesla.com/admin/) 비밀번호.
 * 따옴표 안에 원하는 비밀번호를 입력해야 관리자 저장 기능이 켜진다.
 * 예: var ADMIN_KEY = 'lets2026!';
 * 비워두면('') 관리자 페이지에서 저장이 거부된다 (안전 기본값).
 */
var ADMIN_KEY = '';

/**
 * 접수(등록)가 기록되는 탭 이름. 이 이름의 탭이 없으면 첫 번째 탭을 사용한다.
 * 탭 이름을 바꾸면 이 값도 같이 바꿔야 한다.
 */
var SUBMISSIONS_SHEET_NAME = 'Sheet3';

/** JSON 응답 헬퍼 */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** 접수 탭을 이름으로 찾고, 없으면 첫 번째 탭으로 대체 */
function getSubmissionsSheet_(ss) {
  return ss.getSheetByName(SUBMISSIONS_SHEET_NAME) || ss.getSheets()[0];
}

/** 등록 폼 제출 → 접수 탭(Sheet3)에 한 줄 추가 */
function doPost(e) {
  try {
    var sheet = getSubmissionsSheet_(SpreadsheetApp.getActiveSpreadsheet());
    var data;

    if (e.postData && e.postData.type === 'application/json') {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter && Object.keys(e.parameter).length > 0) {
      data = e.parameter;
    } else {
      data = JSON.parse(e.postData.contents);
    }

    // 관리자 페이지의 코스 저장 요청은 별도 처리 (접수 기록/이메일 알림 없음)
    if (data.action === 'updateCourses') {
      return handleUpdateCourses_(data);
    }

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.courses || '',
      data.fullName || '',
      data.email || '',
      data.phone || '',
      data.certification || '',
      data.studio || '',
      data.cityState || '',
      data.questions || '',
      data.stage || '',
      data.prereq || '',
      data.availability || '',
      data.anythingElse || '',
    ]);

    // 이메일 알림 — 실패해도 시트 저장에는 영향 없음
    try {
      sendNotificationEmail_(data);
    } catch (mailErr) {
      Logger.log('알림 이메일 발송 실패: ' + mailErr);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ result: 'success' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ result: 'error', message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/** 새 신청 내용을 이메일로 발송 */
function sendNotificationEmail_(data) {
  var recipient = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  var subject = "[Let's Pilates LA] 새 지도자 과정 등록 신청 — " + (data.fullName || '이름 없음');

  var lines = [
    '새 등록 신청이 접수되었습니다.',
    '',
    '■ 신청 과정: ' + (data.courses || '-'),
    '■ 이름: ' + (data.fullName || '-'),
    '■ 이메일: ' + (data.email || '-'),
    '■ 전화번호: ' + (data.phone || '-'),
    '■ 자격 상태: ' + (data.certification || '-'),
    '■ 소속 스튜디오: ' + (data.studio || '-'),
    '■ 지역: ' + (data.cityState || '-'),
    '■ 교육 단계: ' + (data.stage || '-'),
    '■ 선수요건 충족: ' + (data.prereq || '-'),
    '■ 일정 참석 가능: ' + (data.availability || '-'),
    '■ 질문/요청: ' + (data.questions || '-'),
    '■ 기타: ' + (data.anythingElse || '-'),
    '',
    '전체 접수 내역: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  ];

  MailApp.sendEmail(recipient, subject, lines.join('\n'));
}

/**
 * 코스 목록 조회 → "Courses" 탭 + 접수 시트의 신청 수를 집계해 JSON 반환.
 * Courses 탭 헤더(1행): id | name_en | name_kr | dates | tag_en | tag_kr | active | capacity
 * - active 열이 FALSE/no/빈칸이면 그 코스는 사이트에 표시되지 않는다.
 * - capacity(정원)를 숫자로 입력하면 사이트에 남은 자리가 표시되고, 다 차면 "마감" 처리된다.
 *   capacity를 비워두면 자리 표시 없이 항상 신청 가능.
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Courses');
    var courses = [];

    // ?all=1 이면 비활성(active=FALSE) 코스도 포함 — 관리자 페이지용
    var showAll = e && e.parameter && e.parameter.all === '1';

    // 접수 탭(Sheet3)에서 코스 id별 신청 수 집계
    var counts = countRegistrations_(ss);

    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var r = rows[i];
        if (!r[0]) continue; // id 없는 행은 무시

        var active = String(r[6]).trim().toLowerCase();
        var isActive = !(active === 'false' || active === 'no' || active === '');
        if (!isActive && !showAll) continue;

        var id = cellToString_(r[0]);
        var capRaw = r.length > 7 ? r[7] : '';
        var capacity =
          capRaw === '' || capRaw === null || isNaN(Number(capRaw)) ? null : Number(capRaw);

        courses.push({
          id: id,
          name_en: cellToString_(r[1]),
          name_kr: cellToString_(r[2]),
          dates: cellToString_(r[3]),
          tag_en: cellToString_(r[4]),
          tag_kr: cellToString_(r[5]),
          capacity: capacity,
          taken: counts[id] || 0,
          active: isActive,
        });
      }
    }

    return jsonOut_({ result: 'success', courses: courses });
  } catch (error) {
    return jsonOut_({ result: 'error', message: error.toString() });
  }
}

/**
 * 관리자 페이지에서 보낸 코스 목록으로 Courses 탭 전체를 교체한다.
 * ADMIN_KEY가 설정되어 있고 요청의 key와 일치할 때만 동작한다.
 */
function handleUpdateCourses_(data) {
  try {
    if (!ADMIN_KEY || String(data.key || '') !== ADMIN_KEY) {
      return jsonOut_({ result: 'error', message: 'unauthorized' });
    }

    var courses = JSON.parse(data.courses || '[]');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Courses');
    if (!sheet) {
      setupCoursesTab();
      sheet = ss.getSheetByName('Courses');
    }

    var last = sheet.getLastRow();
    if (last > 1) sheet.getRange(2, 1, last - 1, 8).clearContent();

    var rows = [];
    for (var i = 0; i < courses.length; i++) {
      var c = courses[i];
      if (!String(c.id || '').trim()) continue;
      rows.push([
        String(c.id).trim(),
        String(c.name_en || ''),
        String(c.name_kr || ''),
        String(c.dates || ''),
        String(c.tag_en || ''),
        String(c.tag_kr || ''),
        c.active ? 'TRUE' : 'FALSE',
        c.capacity === '' || c.capacity === null || c.capacity === undefined || isNaN(Number(c.capacity))
          ? ''
          : Number(c.capacity),
      ]);
    }
    if (rows.length) sheet.getRange(2, 1, rows.length, 8).setValues(rows);

    return jsonOut_({ result: 'success', saved: rows.length });
  } catch (error) {
    return jsonOut_({ result: 'error', message: error.toString() });
  }
}

/**
 * 접수 탭(Sheet3)의 신청 과정 열에서 "A - ..." 형태의 코스 id별 신청 수를 센다.
 * 이메일 열(D)에 @가 있는 행만 실제 신청으로 인정 — 헤더/메모/불완전 행은 집계에서 제외.
 * 한 사람이 여러 과정을 선택한 행("A - ..., C - ...")은 각 과정에 1명씩 집계된다.
 */
function countRegistrations_(ss) {
  var counts = {};
  var sub = getSubmissionsSheet_(ss);
  if (!sub) return counts;
  var values = sub.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var email = String(values[i][3] || ''); // D열 = 이메일
    if (email.indexOf('@') === -1) continue; // 실제 신청 행만 집계
    var cell = String(values[i][1] || ''); // B열 = 신청 과정
    if (!cell) continue;
    var parts = cell.split(', ');
    for (var j = 0; j < parts.length; j++) {
      var m = parts[j].match(/^(\S+) - /);
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
  }
  return counts;
}

/** 셀 값을 문자열로 변환. 날짜 셀이 자동 변환된 경우 M/D 형식으로 정리한다. */
function cellToString_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'M/d');
  }
  return String(v).trim();
}

/**
 * ★ 최초 1회 실행용 — "Courses" 탭을 자동으로 만들어 기본 코스 5개를 채운다.
 * Apps Script 편집기 상단의 함수 드롭다운에서 `setupCoursesTab`을 선택하고
 * ▶ 실행 버튼을 누르면 된다. 이미 Courses 탭이 있으면 아무것도 덮어쓰지 않고
 * 빠진 capacity 열만 추가한다.
 */
function setupCoursesTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName('Courses');
  if (existing) {
    upgradeCoursesTab();
    Logger.log('Courses 탭이 이미 있어 capacity 열만 확인/추가했습니다.');
    return;
  }

  var sheet = ss.insertSheet('Courses');
  var rows = [
    ['id', 'name_en', 'name_kr', 'dates', 'tag_en', 'tag_kr', 'active', 'capacity'],
    ['A', 'GYROTONIC® Level 1 Foundation Course', 'GYROTONIC® Level 1 기초 과정 (Foundation Course)', '', '12 days', '12일', 'TRUE', ''],
    ['B', 'GYROTONIC® Level 2 Program 1 — Pre-Training', 'GYROTONIC® Level 2 Program 1 — 사전 교육 (Pre-Training)', '', '3 days', '3일', 'TRUE', ''],
    ['C', 'GYROTONIC® Jumping Stretching Board Course', 'GYROTONIC® 점핑 스트레칭 보드 과정 (Jumping Stretching Board)', '', '7 days', '7일', 'TRUE', ''],
    ['D', 'GYROTONIC® Level 1 Apprentice Review Course', 'GYROTONIC® Level 1 견습 리뷰 과정 (Apprentice Review)', '', '6 days', '6일', 'TRUE', ''],
    ['E', 'GYROTONIC® Level 2 Program 1 — Foundation Course', 'GYROTONIC® Level 2 Program 1 — 기초 과정 (Foundation Course)', '', '4 days', '4일', 'TRUE', ''],
  ];
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  // dates 열(D)은 "4/10" 입력이 날짜로 자동 변환되지 않도록 일반 텍스트로 고정
  sheet.getRange('D:D').setNumberFormat('@');
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sheet.autoResizeColumns(1, rows[0].length);
  sheet.setFrozenRows(1);

  Logger.log('Courses 탭 생성 완료!');
}

/**
 * ★ 기존 Courses 탭에 capacity(정원) 열이 없으면 추가한다.
 * 이미 setupCoursesTab을 실행했던 경우, 새 코드로 교체한 뒤 이 함수를 한 번 실행하면 된다.
 */
function upgradeCoursesTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Courses');
  if (!sheet) {
    setupCoursesTab();
    return;
  }
  var h1 = String(sheet.getRange('H1').getValue()).trim();
  if (h1 !== 'capacity') {
    sheet.getRange('H1').setValue('capacity').setFontWeight('bold');
    Logger.log('capacity 열을 추가했습니다. 각 코스의 H열에 정원 숫자를 입력하세요.');
  } else {
    Logger.log('capacity 열이 이미 있습니다.');
  }
}

/**
 * ★ 접수 탭(Sheet3)에 컬럼 헤더를 만든다 — 함수 드롭다운에서 선택 후 ▶ 실행.
 * 1행이 헤더가 아니면(기존 신청 데이터가 있으면) 위에 새 행을 넣어 헤더를 추가하므로
 * 이미 접수된 신청은 그대로 보존된다. 실행해도 여러 번 중복 생성되지 않는다.
 */
function setupSubmissionHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSubmissionsSheet_(ss);
  var headers = [
    '제출시각',
    '신청 과정',
    '이름',
    '이메일',
    '전화번호',
    '자격 상태',
    '소속 스튜디오',
    '지역',
    '질문/요청',
    '교육 단계',
    '선수요건 충족',
    '일정 참석',
    '기타',
  ];

  var a1 = String(sheet.getRange('A1').getValue()).trim().toLowerCase();
  var isHeader = a1 === '제출시각' || a1 === 'timestamp';
  if (!isHeader) {
    sheet.insertRowBefore(1);
  }
  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#F2EBDD');
  sheet.setFrozenRows(1);

  Logger.log('접수 시트 헤더 설정 완료!');
}

/**
 * ★ 이메일 알림 테스트 — 함수 드롭다운에서 선택 후 ▶ 실행하면 테스트 메일이 발송된다.
 * (처음 실행할 때 이메일 발송 권한 승인 창이 뜬다 — 반드시 한 번 실행해서 승인해야
 *  실제 신청이 들어왔을 때 알림이 발송된다)
 */
function sendTestEmail() {
  sendNotificationEmail_({
    courses: 'A - Gyrotonic® Level 1 Foundation Course',
    fullName: '테스트 신청자',
    email: 'test@example.com',
    phone: '010-0000-0000',
    certification: '테스트',
    stage: 'New Student',
  });
  Logger.log('테스트 이메일을 발송했습니다. 받은편지함을 확인하세요.');
}
