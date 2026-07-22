/**
 * Google Apps Script — Let's Pilates LA 등록 폼 백엔드
 *
 * 기능 2가지:
 *  1. doPost — 사이트 등록 폼 제출을 스프레드시트에 기록 (기존과 동일)
 *  2. doGet  — "Courses" 탭의 코스 목록을 JSON으로 반환 (사이트가 읽어감)
 *
 * 설치 방법은 같은 폴더의 SETUP-KO.md 참조.
 * 이 파일 전체를 Apps Script 편집기에 붙여넣어 기존 코드를 교체하면 된다.
 */

/** 등록 폼 제출 → 첫 번째 시트에 한 줄 추가 (레거시 폼과 동일한 컬럼) */
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var data;

    if (e.postData && e.postData.type === 'application/json') {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter && Object.keys(e.parameter).length > 0) {
      data = e.parameter;
    } else {
      data = JSON.parse(e.postData.contents);
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

    return ContentService.createTextOutput(
      JSON.stringify({ result: 'success' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ result: 'error', message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 코스 목록 조회 → "Courses" 탭을 읽어 JSON 반환.
 * Courses 탭 헤더(1행): id | name_en | name_kr | dates | tag_en | tag_kr | active
 * active 열이 FALSE/no/빈칸이면 그 코스는 사이트에 표시되지 않는다.
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Courses');
    var courses = [];

    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var r = rows[i];
        if (!r[0]) continue; // id 없는 행은 무시

        var active = String(r[6]).trim().toLowerCase();
        if (active === 'false' || active === 'no' || active === '') continue;

        courses.push({
          id: cellToString_(r[0]),
          name_en: cellToString_(r[1]),
          name_kr: cellToString_(r[2]),
          dates: cellToString_(r[3]),
          tag_en: cellToString_(r[4]),
          tag_kr: cellToString_(r[5]),
        });
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({ result: 'success', courses: courses })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ result: 'error', message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
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
 * ▶ 실행 버튼을 누르면 된다. 이미 Courses 탭이 있으면 아무것도 덮어쓰지 않는다.
 */
function setupCoursesTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('Courses')) {
    SpreadsheetApp.getUi
      ? Logger.log('Courses 탭이 이미 있습니다. 아무것도 변경하지 않았습니다.')
      : null;
    return;
  }

  var sheet = ss.insertSheet('Courses');
  var rows = [
    ['id', 'name_en', 'name_kr', 'dates', 'tag_en', 'tag_kr', 'active'],
    ['A', 'GYROTONIC® Level 1 Foundation Course', 'GYROTONIC® Level 1 기초 과정 (Foundation Course)', '', '12 days', '12일', 'TRUE'],
    ['B', 'GYROTONIC® Level 2 Program 1 — Pre-Training', 'GYROTONIC® Level 2 Program 1 — 사전 교육 (Pre-Training)', '', '3 days', '3일', 'TRUE'],
    ['C', 'Jumping Stretching Board Course', '점핑 스트레칭 보드 과정 (Jumping Stretching Board)', '', '7 days', '7일', 'TRUE'],
    ['D', 'GYROTONIC® Level 1 Apprentice Review Course', 'GYROTONIC® Level 1 견습 리뷰 과정 (Apprentice Review)', '', '6 days', '6일', 'TRUE'],
    ['E', 'GYROTONIC® Level 2 Program 1 — Foundation Course', 'GYROTONIC® Level 2 Program 1 — 기초 과정 (Foundation Course)', '', '4 days', '4일', 'TRUE'],
  ];
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  // dates 열(D)은 "4/10" 입력이 날짜로 자동 변환되지 않도록 일반 텍스트로 고정
  sheet.getRange('D:D').setNumberFormat('@');
  // 헤더 행 굵게 + 열 너비 자동
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sheet.autoResizeColumns(1, rows[0].length);
  sheet.setFrozenRows(1);

  Logger.log('Courses 탭 생성 완료!');
}
