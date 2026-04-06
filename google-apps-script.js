/**
 * Google Apps Script — paste this into your Google Sheet's Apps Script editor.
 *
 * Setup:
 * 1. Open Google Sheets → create a new spreadsheet
 * 2. In Row 1, add these headers:
 *    Timestamp | Courses | Full Name | Email | Phone | Certification |
 *    Studio | City/State | Questions | Stage | Prerequisites | Availability | Other Notes
 * 3. Go to Extensions → Apps Script
 * 4. Delete the default code and paste this entire file
 * 5. Click Deploy → New deployment
 * 6. Select type: Web app
 * 7. Set "Execute as": Me
 * 8. Set "Who has access": Anyone
 * 9. Click Deploy and authorize
 * 10. Copy the Web app URL → paste into index.html (GOOGLE_SHEETS_URL)
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

    sheet.appendRow([
      data.timestamp,
      data.courses,
      data.fullName,
      data.email,
      data.phone,
      data.certification,
      data.studio,
      data.cityState,
      data.questions,
      data.stage,
      data.prereq,
      data.availability,
      data.anythingElse,
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Required for CORS preflight (though no-cors mode is used)
function doGet(e) {
  return ContentService
    .createTextOutput('Registration endpoint is active.')
    .setMimeType(ContentService.MimeType.TEXT);
}
