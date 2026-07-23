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
 * 신청 알림을 받을 이메일 주소. 여러 명이면 쉼표로 구분: 예) 'a@x.com,b@y.com'
 * 여기 적힌 주소들은 BCC(숨은 참조)로 받아서 서로의 주소가 보이지 않는다.
 * (받는사람(To)은 시트 소유 계정으로 표시된다)
 * 빈 문자열('')이면 시트 소유자에게만 발송된다.
 */
var NOTIFY_EMAIL = 'sunnie0210@gmail.com,calvin3919@gmail.com';

/**
 * 웰컴 이메일의 발신 주소 (선택사항).
 * ⚠️ 이 계정(Gmail)의 설정 → 계정 → "다른 주소에서 메일 보내기"에 별칭으로
 * 등록·인증된 주소만 사용할 수 있다. 예: 'letspilatesla@gmail.com'
 * 비워두면 시트 소유 계정 주소로 발신된다.
 */
var SENDER_ALIAS = '';

/**
 * 신청자가 "답장"을 눌렀을 때 답장이 가는 주소 (선택사항).
 * 별칭 등록 없이 바로 쓸 수 있다. 예: 'letspilatesla@gmail.com'
 * 비워두면 발신 주소로 답장이 간다.
 */
var REPLY_TO = '';

/**
 * 관리자 페이지(letspilatesla.com/admin/) 비밀번호 (선택사항).
 * 비워두면('') 비밀번호 없이 저장할 수 있다.
 * 따옴표 안에 값을 넣으면 그 비밀번호를 아는 사람만 저장할 수 있다.
 */
var ADMIN_KEY = '';

/**
 * 접수(등록)가 기록되는 탭 이름. 이 이름의 탭이 없으면 첫 번째 탭을 사용한다.
 * 탭 이름을 바꾸면 이 값도 같이 바꿔야 한다.
 */
var SUBMISSIONS_SHEET_NAME = 'Sheet3';

/**
 * ★★★ 웰컴 이메일에 들어가는 스튜디오 정보 — 반드시 실제 내용으로 수정하세요! ★★★
 * 이메일은 영어로만 발송됩니다. 아래 payment / parking / cancel 문구를 실제 정책으로 바꾸세요.
 * (여기를 수정한 뒤에는 저장 + "배포 관리 → 연필 → 새 버전" 재배포를 해야 적용됩니다)
 */
var STUDIO = {
  name: "Let's Pilates LA",
  address: '672 S La Fayette Park Pl, STE 674, Los Angeles, CA 90057',
  mapUrl: 'https://maps.google.com/?q=672+S+La+Fayette+Park+Pl+STE+674+Los+Angeles+CA+90057',
  phone: '310-995-0046',
  kakao: 'sunnie0210',
  instagram: '@Letspilates_la',
  site: 'https://letspilatesla.com',

  // 결제 안내
  payment:
    'Enrollment is confirmed in order of completed payment. Our team will contact you individually with payment methods and details. Questions: 310-995-0046 / KakaoTalk sunnie0210',

  // 주차 안내
  parking:
    'Parking details (building and nearby options) will be provided upon enrollment confirmation. Please arrive with time to spare on training days.',

  // 취소/변경 정책
  cancel:
    'Cancellation policy: full refund for cancellations made at least 14 days before the course start date; fees may apply afterward. Please contact us as early as possible for any changes.',
};

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

    // 신청자 웰컴 이메일 — 실패해도 시트 저장에는 영향 없음
    try {
      if (data.email && String(data.email).indexOf('@') > -1) {
        sendWelcomeEmail_(data);
      }
    } catch (welcomeErr) {
      Logger.log('웰컴 이메일 발송 실패: ' + welcomeErr);
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

/** 새 신청 내용을 이메일로 발송 (NOTIFY_EMAIL 주소들은 BCC로 수신) */
function sendNotificationEmail_(data) {
  var owner = Session.getEffectiveUser().getEmail();
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

  var mail = {
    to: owner,
    subject: subject,
    body: lines.join('\n'),
    name: STUDIO.name,
  };
  if (NOTIFY_EMAIL) mail.bcc = NOTIFY_EMAIL;
  MailApp.sendEmail(mail);
}

/** Courses 탭에서 코스 id → 상세정보 맵을 만든다 (웰컴 이메일용) */
function getCourseMap_() {
  var map = {};
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Courses');
  if (!sheet) return map;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    map[cellToString_(r[0])] = {
      name_en: cellToString_(r[1]),
      name_kr: cellToString_(r[2]),
      dates: cellToString_(r[3]),
      tag_en: cellToString_(r[4]),
      tag_kr: cellToString_(r[5]),
      time: r.length > 8 ? cellToString_(r[8]) : '',
      price: r.length > 9 ? cellToString_(r[9]) : '',
      desc_en: r.length > 10 ? cellToString_(r[10]) : '',
      desc_kr: r.length > 11 ? cellToString_(r[11]) : '',
      fee: r.length > 12 ? cellToString_(r[12]) : '',
      conducted_by: r.length > 13 ? cellToString_(r[13]) : '',
    };
  }
  return map;
}

/** "1225" / "$1,050" 등 어떤 입력도 "$1,225" 형식으로 통일. 숫자가 아니면 그대로. */
function money_(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  var n = Number(s.replace(/[$,\s]/g, ''));
  if (isNaN(n)) return s;
  return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** HTML 이스케이프 */
function escHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 신청자에게 사이트 테마의 HTML 웰컴 이메일을 발송한다 (영어) */
function sendWelcomeEmail_(data) {
  var courseMap = getCourseMap_();

  // "A - ..., C - ..." → 선택한 코스 id 목록
  var ids = [];
  String(data.courses || '')
    .split(', ')
    .forEach(function (part) {
      var m = part.match(/^(\S+) - /);
      if (m) ids.push(m[1]);
    });

  var name = escHtml_(data.fullName || '');
  var t = {
    subject: "[Let's Pilates LA] Your registration has been received",
    hello: 'Hello ' + name + ',',
    intro:
      "Thank you for your interest in our teacher training courses at Let's Pilates LA. We have received your registration below, and our team will review it and contact you shortly.",
    yourCourses: 'Your selected program(s)',
    dates: 'Dates',
    time: 'Time',
    duration: 'Duration',
    price: 'Course Cost',
    fee: 'Studio Fee',
    conductedBy: 'Conducted by',
    tba: 'To be announced',
    payment: 'Payment',
    location: 'Location & Parking',
    cancel: 'Cancellation Policy',
    questions: 'If you have any questions, feel free to reach out anytime.',
    map: 'View map',
  };

  // 코스 카드 블록
  var courseBlocks = ids
    .map(function (id) {
      var c = courseMap[id];
      if (!c) return '';
      var cname = escHtml_(c.name_en || c.name_kr);
      var rows = '';
      function row(label, value) {
        if (!value) return '';
        return (
          '<tr><td style="padding:3px 12px 3px 0;color:#6E6A60;font-size:13px;white-space:nowrap;vertical-align:top;">' +
          label +
          '</td><td style="padding:3px 0;color:#1C1A16;font-size:13px;">' +
          escHtml_(value) +
          '</td></tr>'
        );
      }
      rows += row(t.dates, c.dates || t.tba);
      rows += row(t.time, c.time);
      rows += row(t.duration, c.tag_en || c.tag_kr);
      rows += row(t.conductedBy, c.conducted_by);
      rows += row(t.price, money_(c.price));
      rows += row(t.fee, money_(c.fee));
      var desc = c.desc_en;
      var descHtml = desc
        ? '<p style="margin:10px 0 0;color:#6E6A60;font-size:13px;line-height:1.7;">' +
          escHtml_(desc) +
          '</p>'
        : '';
      return (
        '<div style="background:#FBF8F2;border-radius:14px;padding:18px 20px;margin-top:12px;">' +
        '<p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1C1A16;">' +
        cname +
        '</p><table cellpadding="0" cellspacing="0" border="0">' +
        rows +
        '</table>' +
        descHtml +
        '</div>'
      );
    })
    .join('');

  function section(title, body) {
    return (
      '<h3 style="margin:28px 0 8px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#5E6B4F;">' +
      title +
      '</h3><p style="margin:0;color:#1C1A16;font-size:14px;line-height:1.8;">' +
      body +
      '</p>'
    );
  }

  var html =
    '<div style="background:#FBF8F2;padding:32px 16px;font-family:-apple-system,\'Apple SD Gothic Neo\',\'Malgun Gothic\',Helvetica,Arial,sans-serif;">' +
    '<div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:20px;padding:36px 32px;border:1px solid rgba(28,26,22,0.08);">' +
    // 헤더
    '<p style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#1C1A16;">Let&#39;s Pilates LA</p>' +
    '<p style="margin:4px 0 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5E6B4F;">Pilates Studio &nbsp;|&nbsp; GYROTONIC&reg;</p>' +
    '<hr style="border:none;border-top:1px solid rgba(28,26,22,0.1);margin:24px 0;" />' +
    // 인사
    '<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1C1A16;">' + t.hello + '</p>' +
    '<p style="margin:0;color:#6E6A60;font-size:14px;line-height:1.8;">' + t.intro + '</p>' +
    // 코스
    '<h3 style="margin:28px 0 4px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#5E6B4F;">' +
    t.yourCourses +
    '</h3>' +
    courseBlocks +
    // 결제
    section(t.payment, escHtml_(STUDIO.payment)) +
    // 위치 & 주차
    section(
      t.location,
      escHtml_(STUDIO.address) +
        ' &nbsp;·&nbsp; <a href="' + STUDIO.mapUrl + '" style="color:#5E6B4F;">' + t.map + '</a>' +
        '<br />' +
        escHtml_(STUDIO.parking)
    ) +
    // 취소 정책
    section(t.cancel, escHtml_(STUDIO.cancel)) +
    // 푸터
    '<hr style="border:none;border-top:1px solid rgba(28,26,22,0.1);margin:28px 0 20px;" />' +
    '<p style="margin:0;color:#6E6A60;font-size:13px;line-height:1.9;">' +
    t.questions +
    '<br />&#9742; ' + escHtml_(STUDIO.phone) +
    ' &nbsp;·&nbsp; KakaoTalk ' + escHtml_(STUDIO.kakao) +
    ' &nbsp;·&nbsp; Instagram ' + escHtml_(STUDIO.instagram) +
    '<br /><a href="' + STUDIO.site + '" style="color:#5E6B4F;">letspilatesla.com</a></p>' +
    '</div></div>';

  var options = {
    htmlBody: html,
    name: STUDIO.name,
  };
  if (REPLY_TO) options.replyTo = REPLY_TO;

  var plainBody = t.hello + '\n\n' + t.intro + '\n\n' + STUDIO.site; // HTML 미지원 클라이언트용

  if (SENDER_ALIAS) {
    // 별칭 발신은 GmailApp만 지원 (별칭 미등록 주소면 오류 → 기본 발신으로 재시도)
    try {
      options.from = SENDER_ALIAS;
      GmailApp.sendEmail(String(data.email).trim(), t.subject, plainBody, options);
      return;
    } catch (aliasErr) {
      Logger.log('별칭 발신 실패, 기본 주소로 재시도: ' + aliasErr);
      delete options.from;
    }
  }
  options.to = String(data.email).trim();
  options.subject = t.subject;
  options.body = plainBody;
  MailApp.sendEmail(options);
}

/**
 * ★ 웰컴 이메일 미리보기 테스트 — NOTIFY_EMAIL(또는 시트 소유자)에게 샘플 발송.
 * 함수 드롭다운에서 선택 후 ▶ 실행. Courses 탭의 실제 첫 코스 데이터로 만들어진다.
 */
function sendTestWelcomeEmail() {
  var map = getCourseMap_();
  var firstId = Object.keys(map)[0] || 'A';
  sendWelcomeEmail_({
    email: Session.getEffectiveUser().getEmail(),
    fullName: '테스트 신청자',
    courses: firstId + ' - ' + (map[firstId] ? map[firstId].name_en : 'Test Course'),
  });
  Logger.log('테스트 웰컴 이메일을 발송했습니다. 받은편지함을 확인하세요.');
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

    // ?registrations=1 → 접수(등록자) 목록 반환 — 관리자 페이지 등록자 탭용
    if (e && e.parameter && e.parameter.registrations === '1') {
      if (ADMIN_KEY && String(e.parameter.key || '') !== ADMIN_KEY) {
        return jsonOut_({ result: 'error', message: 'unauthorized' });
      }
      return jsonOut_({ result: 'success', registrations: getRegistrations_(ss) });
    }

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
          time: r.length > 8 ? cellToString_(r[8]) : '',
          price: r.length > 9 ? cellToString_(r[9]) : '',
          desc_en: r.length > 10 ? cellToString_(r[10]) : '',
          desc_kr: r.length > 11 ? cellToString_(r[11]) : '',
          fee: r.length > 12 ? cellToString_(r[12]) : '',
          conducted_by: r.length > 13 ? cellToString_(r[13]) : '',
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
    if (ADMIN_KEY && String(data.key || '') !== ADMIN_KEY) {
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
    if (last > 1) sheet.getRange(2, 1, last - 1, 14).clearContent();

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
        String(c.time || ''),
        String(c.price || ''),
        String(c.desc_en || ''),
        String(c.desc_kr || ''),
        String(c.fee || ''),
        String(c.conducted_by || ''),
      ]);
    }
    if (rows.length) sheet.getRange(2, 1, rows.length, 14).setValues(rows);

    return jsonOut_({ result: 'success', saved: rows.length });
  } catch (error) {
    return jsonOut_({ result: 'error', message: error.toString() });
  }
}

/** 접수 탭(Sheet3)의 모든 등록자 행을 최신순 배열로 반환 (이메일 있는 실제 신청만) */
function getRegistrations_(ss) {
  var sub = getSubmissionsSheet_(ss);
  var out = [];
  if (!sub) return out;
  var values = sub.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var email = String(r[3] || '');
    if (email.indexOf('@') === -1) continue; // 헤더/불완전 행 제외
    out.push({
      timestamp: tsToString_(r[0]),
      courses: String(r[1] || ''),
      fullName: String(r[2] || ''),
      email: email,
      phone: String(r[4] || ''),
      certification: String(r[5] || ''),
      studio: String(r[6] || ''),
      cityState: String(r[7] || ''),
      questions: String(r[8] || ''),
      stage: String(r[9] || ''),
      prereq: String(r[10] || ''),
      availability: String(r[11] || ''),
      anythingElse: String(r[12] || ''),
    });
  }
  return out.reverse(); // 최신 신청이 위로
}

/** 타임스탬프 셀 → 읽기 좋은 문자열 (Date 셀/ISO 문자열 모두 처리) */
function tsToString_(v) {
  var d = null;
  if (Object.prototype.toString.call(v) === '[object Date]') d = v;
  else if (v && !isNaN(new Date(v).getTime())) d = new Date(v);
  if (!d) return String(v || '');
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'M/d/yyyy h:mm a');
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
    ['id', 'name_en', 'name_kr', 'dates', 'tag_en', 'tag_kr', 'active', 'capacity', 'time', 'price', 'desc_en', 'desc_kr', 'fee', 'conducted_by'],
    ['A', 'GYROTONIC® Level 1 Foundation Course', 'GYROTONIC® Level 1 기초 과정 (Foundation Course)', '', '12 days', '12일', 'TRUE', '', '', '', '', '', '', ''],
    ['B', 'GYROTONIC® Level 2 Program 1 — Pre-Training', 'GYROTONIC® Level 2 Program 1 — 사전 교육 (Pre-Training)', '', '3 days', '3일', 'TRUE', '', '', '', '', '', '', ''],
    ['C', 'GYROTONIC® Jumping Stretching Board Course', 'GYROTONIC® 점핑 스트레칭 보드 과정 (Jumping Stretching Board)', '', '7 days', '7일', 'TRUE', '', '', '', '', '', '', ''],
    ['D', 'GYROTONIC® Level 1 Apprentice Review Course', 'GYROTONIC® Level 1 견습 리뷰 과정 (Apprentice Review)', '', '6 days', '6일', 'TRUE', '', '', '', '', '', '', ''],
    ['E', 'GYROTONIC® Level 2 Program 1 — Foundation Course', 'GYROTONIC® Level 2 Program 1 — 기초 과정 (Foundation Course)', '', '4 days', '4일', 'TRUE', '', '', '', '', '', '', ''],
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
  // 누락된 열 헤더 보충 (H: capacity, I: time, J: price, K: desc_en, L: desc_kr)
  var wanted = { H1: 'capacity', I1: 'time', J1: 'price', K1: 'desc_en', L1: 'desc_kr', M1: 'fee', N1: 'conducted_by' };
  for (var cell in wanted) {
    if (String(sheet.getRange(cell).getValue()).trim() !== wanted[cell]) {
      sheet.getRange(cell).setValue(wanted[cell]).setFontWeight('bold');
    }
  }
  Logger.log('Courses 탭 열 확인/보충 완료 (capacity, time, price, desc, fee, conducted_by).');
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
