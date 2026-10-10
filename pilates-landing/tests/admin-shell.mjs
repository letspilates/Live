// Admin portal shell check with Supabase answers mocked (no real project touched).
//   npx vite build --base /staging/ && npx vite preview --base /staging/ --port 4173 &
//   PLAYWRIGHT=$(npm root -g)/playwright/index.mjs node tests/admin-shell.mjs
// Exit code 1 if any check fails.
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const ROOT = process.env.ADMIN_ROOT ?? 'http://localhost:4173/staging/admin/';
const SUPABASE = 'https://prklzkcrhfnnlefvmxhb.supabase.co';
const STORAGE_KEY = 'sb-prklzkcrhfnnlefvmxhb-auth-token';
const WIDTHS = { phone: 393, tablet: 820, desktop: 1280 };

const PEOPLE = {
  OWNER: { user_id: 'u-owner', full_name: 'Calvin Kim', email: 'owner@example.com', role: 'OWNER', status: 'ACTIVE', pricing_tier: null },
  INSTRUCTOR: { user_id: 'u-ins', full_name: 'Ana Park', email: 'ana@example.com', role: 'INSTRUCTOR', status: 'ACTIVE', pricing_tier: 'MASTER' },
  STAFF: { user_id: 'u-staff', full_name: 'Sam Lee', email: 'sam@example.com', role: 'STAFF', status: 'ACTIVE', pricing_tier: null },
};

let failures = 0;
const check = (ok, name) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });

// training_courses rows. Letters are out of schedule order on purpose (the page must re-letter them).
const COURSES = [
  { id: 'c-a', code: 'A', name_en: 'Gyrotoner® Part 1', name_kr: '자이로토너 1', dates: '11/14 - 11/16', length_days: 3, capacity: 1, class_time: '9:00 AM - 5:00 PM', price: '$1,050', fee: '$350', fee_early: '$250', early_until: '2099-01-01', conducted_by: "Master Trainer Rich O'Connor", desc_en: 'Part one', desc_kr: '한글 설명', active: true },
  { id: 'c-b', code: 'B', name_en: 'Jumping Stretching Board', name_kr: '점핑 보드', dates: '10/24 - 10/25', length_days: 2, capacity: null, class_time: '', price: '', fee: '$200', fee_early: '', early_until: null, conducted_by: '', desc_en: '', desc_kr: '', active: true },
  { id: 'c-c', code: 'C', name_en: 'Old Course', name_kr: '', dates: '1/5 - 1/7', length_days: null, capacity: 4, class_time: '', price: '', fee: '', fee_early: '', early_until: null, conducted_by: '', desc_en: '', desc_kr: '', active: false },
];
const reg = (r) => ({ certification: '', studio: '', city_state: '', questions: '', stage: '', prereq: '', availability: '', anything_else: '', phone: '', source: 'form', ...r });
const REGS = [
  reg({ id: 'r-1', submitted_at: '2026-10-08T21:10:00Z', course_ids: ['c-a'], courses_text: 'A - Gyrotoner® Part 1', full_name: 'Mina Cho', email: 'mina@example.com', phone: '(213) 555-0142', certification: 'Certified', studio: 'Studio Nine', city_state: 'LA, CA', questions: 'Parking?', availability: 'Yes' }),
  // One of Leo's courses was deleted since.
  reg({ id: 'r-2', submitted_at: '2026-10-06T16:41:00Z', course_ids: ['c-b', 'c-gone'], courses_text: 'B - Jumping Stretching Board, Z - Retired course', full_name: 'Leo Park', email: 'leo@example.com' }),
];
let saved = null;
let imported = null;
let submitted = null;
let browserCalledSheet = false;
let loadMode = 'ok'; // 'ok' | 'fail'

/** A page signed in as `who` (or signed out when null) at the given width. */
async function open(who, width, path = '') {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 852 : 900 } });
  const staff = who && PEOPLE[who];
  if (staff) {
    const user = { id: staff.user_id, email: staff.email, aud: 'authenticated', role: 'authenticated' };
    const session = {
      access_token: 'mock',
      refresh_token: 'mock',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user,
    };
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify(session)],
    );
    await context.route(`${SUPABASE}/auth/v1/user`, (r) => r.fulfill({ json: user }));
  }
  await context.route(`${SUPABASE}/auth/v1/logout**`, (r) => r.fulfill({ status: 204 }));
  await context.route(`${SUPABASE}/rest/v1/rpc/current_staff`, (r) => r.fulfill({ json: staff ?? null }));
  await context.route(`${SUPABASE}/rest/v1/rpc/list_staff`, (r) =>
    r.fulfill({ json: Object.values(PEOPLE).map((p) => ({ ...p, last_sign_in_at: null })) }),
  );
  for (const [table, rows] of [['training_courses', COURSES], ['training_registrations', REGS]]) {
    await context.route(`${SUPABASE}/rest/v1/${table}?**`, (r) =>
      loadMode === 'fail' ? r.fulfill({ status: 500, json: { message: 'boom' } }) : r.fulfill({ json: rows }),
    );
  }
  await context.route(`${SUPABASE}/rest/v1/rpc/save_training_courses`, (r) => {
    saved = r.request().postDataJSON().p_courses;
    return r.fulfill({ json: saved.length });
  });
  await context.route(`${SUPABASE}/rest/v1/rpc/import_training_registrations`, (r) => {
    imported = r.request().postDataJSON().p_rows;
    return r.fulfill({ json: imported.length });
  });
  await context.route(`${SUPABASE}/rest/v1/rpc/public_training_courses`, (r) =>
    r.fulfill({ json: [{ uid: 'c-b', id: 'B', name_en: 'Jumping Stretching Board', name_kr: '점핑 보드', dates: '10/24 - 10/25', tag_en: '2 days', tag_kr: '2일', capacity: null, taken: 1, time: '', price: '', fee: '$200', fee_early: '', early_until: '', conducted_by: '' }] }),
  );
  await context.route(`${SUPABASE}/rest/v1/rpc/submit_training_registration`, (r) => {
    submitted = r.request().postDataJSON().p;
    return r.fulfill({ json: 'r-new' });
  });
  // Staging no longer uses the Google Sheet at all.
  await context.route('https://script.google.com/**', (r) => {
    browserCalledSheet = true;
    return r.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ROOT + path);
  await page.waitForLoadState('networkidle');
  return { page, context, errors };
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const navLabels = (page) =>
  page.locator('aside nav a').evaluateAll((links) => links.map((a) => a.getAttribute('title')));

// 1. Owner: every width, dashboard + enrollments + menu
for (const [device, width] of Object.entries(WIDTHS)) {
  const { page, context, errors } = await open('OWNER', width);
  check((await page.locator('h1').innerText()) === 'Dashboard', `${device}: owner lands on dashboard`);
  check(await page.getByText('Team', { exact: true }).isVisible(), `${device}: team card`);
  check(await page.getByRole('button', { name: 'Open enrollments' }).isVisible(), `${device}: enrollments card`);
  check(await noOverflow(page), `${device}: no sideways scroll on dashboard`);

  if (device === 'phone') {
    check(!(await page.locator('aside').isVisible()), 'phone: sidebar hidden');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const drawer = page.locator('dialog[open]');
    check(await drawer.getByRole('link', { name: 'Enrollments' }).isVisible(), 'phone: drawer lists Enrollments');
    await drawer.getByRole('link', { name: 'Enrollments' }).click();
    check(!(await page.locator('dialog[open]').count()), 'phone: drawer closes after navigating');
  } else {
    check((await navLabels(page)).join() === 'Dashboard,Enrollments,Staff', `${device}: owner menu`);
    if (device === 'tablet') {
      check(await page.getByRole('button', { name: 'Menu', exact: true }).isVisible(), 'tablet: menu button opens labelled drawer');
    } else {
      check(!(await page.getByRole('button', { name: 'Menu', exact: true }).isVisible()), 'desktop: no menu button');
    }
    await page.locator('aside').getByRole('link', { name: 'Enrollments' }).click();
  }
  await page.waitForURL(/\/admin\/enrollments\/$/);
  check((await page.locator('h1').innerText()) === 'Enrollments', `${device}: enrollments page title`);
  await page.getByLabel('Course name (English)').first().waitFor();
  check(!(await page.locator('iframe, input[type="password"]').count()), `${device}: no page-in-page, no second password`);
  const names = await page.getByLabel('Course name (English)').evaluateAll((els) => els.map((e) => e.value));
  check(names.join('|') === 'Jumping Stretching Board|Gyrotoner® Part 1|Old Course', `${device}: courses in schedule order, hidden last`);
  check(await page.getByText('IDs were re-lettered').isVisible(), `${device}: tells the owner the letters changed`);
  check(await page.getByText('Sign-ups 1/1').isVisible() && await page.getByText('Full', { exact: true }).isVisible(), `${device}: seat chips`);
  check(await page.getByText('Early bird on').isVisible(), `${device}: early-bird status`);
  await page.getByRole('tab', { name: /Registrants/ }).click();
  await page.getByText('Mina Cho').waitFor();
  check(await page.getByRole('link', { name: 'mina@example.com' }).isVisible(), `${device}: registrant contact links`);
  check(await page.getByText(/Not matched to a current course.*Z - Retired course/).isVisible(), `${device}: unmatched course warning`);
  await page.getByLabel('All courses').selectOption({ label: 'B · Jumping Stretching Board (1)' });
  check((await page.getByText('Leo Park').isVisible()) && !(await page.getByText('Mina Cho').isVisible()), `${device}: course filter`);
  await page.getByRole('tab', { name: 'Courses' }).click();
  const active = page.locator('aside a[aria-current="page"]');
  if (device !== 'phone') check((await active.getAttribute('title')) === 'Enrollments', `${device}: active menu item`);
  check(await noOverflow(page), `${device}: no sideways scroll on enrollments`);

  // Account menu
  await page.getByRole('button', { name: 'Account menu' }).click();
  const menu = page.locator('#account-menu');
  check(await menu.isVisible(), `${device}: account menu opens`);
  check(await menu.getByText('owner@example.com').isVisible(), `${device}: account menu shows email`);
  const box = await menu.boundingBox();
  check(box && box.x >= 0 && box.x + box.width <= width, `${device}: account menu inside the screen`);
  await page.keyboard.press('Escape');
  check(!(await menu.isVisible()), `${device}: Escape closes account menu`);
  check(errors.length === 0, `${device}: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 2. Deep link + refresh
{
  const { page, context } = await open('OWNER', 1280, 'enrollments/');
  check((await page.locator('h1').innerText()) === 'Enrollments', 'deep link to enrollments');
  await page.reload();
  await page.waitForLoadState('networkidle');
  check((await page.locator('h1').innerText()) === 'Enrollments', 'refresh keeps enrollments');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.locator('#account-menu').getByRole('link', { name: 'My account' }).click();
  await page.waitForURL(/\/admin\/account\/$/);
  check(!(await page.locator('#account-menu').isVisible()), 'account menu closes after choosing My account');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.locator('#account-menu').getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/admin\/login\//);
  check(true, 'sign out from account menu goes to login');
  await context.close();
}

// 3. Instructor and staff: no owner menu, owner paths redirect, profile card
for (const who of ['INSTRUCTOR', 'STAFF']) {
  for (const [device, width] of [['phone', 393], ['desktop', 1280]]) {
    const { page, context, errors } = await open(who, width);
    check(await page.getByText('My profile').isVisible(), `${who} ${device}: profile card`);
    check(await page.locator('main').getByText(PEOPLE[who].email).isVisible(), `${who} ${device}: shows own email`);
    check(!(await page.getByText('Team', { exact: true }).count()), `${who} ${device}: no team card`);
    check((await page.getByText('Master').count()) === (who === 'INSTRUCTOR' ? 1 : 0), `${who} ${device}: tier only for instructors`);
    if (device === 'desktop') check((await navLabels(page)).join() === 'Dashboard', `${who}: menu is Dashboard only`);
    check(await noOverflow(page), `${who} ${device}: no sideways scroll`);
    check(errors.length === 0, `${who} ${device}: no page errors`);
    await context.close();
  }
  for (const path of ['enrollments/', 'staff/']) {
    const { page, context } = await open(who, 1280, path);
    await page.waitForURL(/\/admin\/$/);
    check(!(await page.getByRole('tab').count()), `${who}: /${path} redirects to dashboard`);
    await context.close();
  }
}

// 4. Signed out: deep link goes to login and remembers where to return
{
  const { page, context } = await open(null, 393, 'enrollments/');
  await page.waitForURL(/\/admin\/login\/\?next=enrollments$/);
  check(true, 'signed-out deep link goes to login with next=enrollments');
  await context.close();
}

// 5. Saving courses: what goes to save_training_courses
{
  saved = null;
  const { page, context } = await open('OWNER', 1280, 'enrollments/');
  await page.getByLabel('Course name (English)').first().waitFor();
  const jump = page.locator('section').filter({ has: page.locator('input[value="Jumping Stretching Board"]') });
  await jump.getByLabel('Length (days)').fill('1');
  check(await page.getByText('Unsaved changes').isVisible() || await page.getByText('IDs were re-lettered').isVisible(), 'edit marks the page as changed');
  const gyro = page.locator('section').filter({ has: page.locator('input[value="Gyrotoner® Part 1"]') });
  await gyro.getByLabel('Use an early-bird fee').uncheck();
  await page.getByRole('button', { name: 'Add course' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Saved. The site shows the change now.').waitFor();
  const byName = Object.fromEntries((saved ?? []).map((c) => [c.name_en, c]));
  check(saved?.length === 3, 'empty new course is not saved');
  check(saved?.map((c) => c.code).join() === 'A,B,C', 'saved IDs follow schedule order');
  check(byName['Jumping Stretching Board']?.id === 'c-b' && byName['Old Course']?.id === 'c-c', 'existing courses keep their database id');
  check(byName['Jumping Stretching Board']?.length_days === '1', 'day count saved as length');
  check(byName['Gyrotoner® Part 1']?.fee_early === '' && byName['Gyrotoner® Part 1']?.early_until === '', 'early bird switched off is saved empty');
  check(byName['Gyrotoner® Part 1']?.desc_kr === '한글 설명', 'Korean description is kept');
  check(byName['Old Course']?.active === false, 'hidden course stays hidden');
  check(!('taken' in (saved?.[0] ?? {})) && !('key' in (saved?.[0] ?? {})) && !('tag_en' in (saved?.[0] ?? {})), 'no screen-only fields sent');

  // Delete asks first
  await gyro.getByRole('button', { name: 'Delete course' }).click();
  check(await page.locator('dialog[open]').getByText('Gyrotoner® Part 1').isVisible(), 'delete asks for confirmation');
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click();
  check((await page.getByLabel('Course name (English)').count()) === 2, 'course removed from the list');
  await context.close();
}

// 6. Load error: a clear message and a way to retry, not a broken page
{
  loadMode = 'fail';
  const { page, context } = await open('OWNER', 393, 'enrollments/');
  check(await page.getByText('Could not load enrollments').isVisible(), 'load error shows a message');
  check(await noOverflow(page), 'error message fits the phone');
  loadMode = 'ok';
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByLabel('Course name (English)').first().waitFor();
  check(true, 'try again loads the courses');
  await context.close();
}

// 7. One-time import of the old Google Sheet (CSV downloads)
{
  saved = null;
  imported = null;
  const { page, context, errors } = await open('OWNER', 1280, 'enrollments/');
  await page.getByLabel('Course name (English)').first().waitFor();
  const coursesCsv =
    'id,name_en,name_kr,dates,tag_en,tag_kr,active,capacity,time,price,desc_en,desc_kr,fee,conducted_by,fee_early,early_until\n' +
    'A,"Level 1, Foundation",기초,12/1 - 12/12,12 days,12일,TRUE,8,,,,,$400,,,\n' +
    'B,Jumping Stretching Board,점핑 보드,,2 days,2일,TRUE,,,,,,,,,\n';
  await page.locator('input[type="file"]').setInputFiles({ name: 'Courses.csv', mimeType: 'text/csv', buffer: Buffer.from(coursesCsv) });
  await page.getByText('Courses added from the file: 1.').waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByText('Courses added from the file: 1.').isVisible(), 'course CSV adds only the new course');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Saved. The site shows the change now.').waitFor();
  const lvl = (saved ?? []).find((c) => c.name_en === 'Level 1, Foundation');
  check(lvl && lvl.id === '' && lvl.length_days === '12' && lvl.capacity === '8' && lvl.fee === '$400', 'imported course saved as a new row');

  await page.getByRole('tab', { name: /Registrants/ }).click();
  await page.getByText('Mina Cho').waitFor();
  const regsCsv =
    '제출시각,신청 과정,이름,이메일,전화,자격,스튜디오,지역,질문,단계,선수요건,참석,기타\n' +
    '10/3/2026 14:05:09,B - Jumping Stretching Board,Yuna Han,YUNA@example.com,555,L1,,,"Line one\nline two",,,,\n' +
    ',B - Jumping Stretching Board,No Time,x@example.com,,,,,,,,,\n';
  await page.locator('input[type="file"]').setInputFiles({ name: 'Sheet3.csv', mimeType: 'text/csv', buffer: Buffer.from(regsCsv) });
  await page.getByText('New sign-ups imported: 1.').waitFor();
  check(await page.getByText('Rows skipped (no valid email or time): 1.').isVisible(), 'row without a time is reported as skipped');
  const row = imported?.[0];
  check(imported?.length === 1 && row.email === 'yuna@example.com' && row.submitted_at === '2026-10-03T21:05:09.000Z', 'sign-up imported with email and studio time');
  check(row?.course_ids?.join() === 'c-b' && row.questions === 'Line one\nline two', 'sign-up matched to its course, multi-line answer kept');
  check(errors.length === 0, `import: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 8. Public sign-up form on staging: Supabase only, no Google Sheet
{
  submitted = null;
  const { page, context, errors } = await open(null, 393, '../#register');
  await page.getByRole('button', { name: 'Jumping Stretching Board' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByPlaceholder('Your full name').fill('Test Person');
  await page.getByPlaceholder('you@example.com').fill('test@example.com');
  await page.getByPlaceholder('(555) 123-4567').fill('2135550100');
  await page.getByPlaceholder('e.g., Level 1 Pre-Training completed').fill('None yet');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Submit registration' }).click();
  await page.getByText('Thank you', { exact: true }).waitFor();
  check(submitted?.course_ids?.join() === 'c-b' && submitted.email === 'test@example.com', 'form submits to Supabase with the course id');
  check(submitted?.courses_text === 'B - Jumping Stretching Board', 'form keeps the course text as picked');
  check(errors.length === 0, `form: no page errors ${errors.join(' | ')}`);
  await context.close();
}

check(!browserCalledSheet, 'staging never calls the Google Sheet');

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
