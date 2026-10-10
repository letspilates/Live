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

/** A page signed in as `who` (or signed out when null) at the given width. */
// Google Sheet data behind the enrollments-admin function. Sheet letters are out of
// schedule order on purpose (the page must re-letter them).
const COURSES = [
  { id: 'A', name_en: 'Gyrotoner® Part 1', name_kr: '자이로토너 1', dates: '11/14 - 11/16', tag_en: '3 days', tag_kr: '3일', capacity: 6, taken: 6, active: true, time: '9:00 AM - 5:00 PM', price: '$1,050', fee: '$350', fee_early: '$250', early_until: '2099-01-01', conducted_by: "Master Trainer Rich O'Connor", desc_en: 'Part one', desc_kr: '한글 설명' },
  { id: 'B', name_en: 'Jumping Stretching Board', name_kr: '점핑 보드', dates: '10/24 - 10/25', tag_en: '2 days', tag_kr: '2일', capacity: null, taken: 1, active: true, time: '', price: '', fee: '$200', fee_early: '', early_until: '', conducted_by: '', desc_en: '', desc_kr: '' },
  { id: 'C', name_en: 'Old Course', name_kr: '', dates: '1/5 - 1/7', tag_en: '', tag_kr: '', capacity: 4, taken: 0, active: false, time: '', price: '', fee: '', fee_early: '', early_until: '', conducted_by: '', desc_en: '', desc_kr: '' },
];
const REGS = [
  { timestamp: '10/8/2026 2:10 PM', courses: 'A - Gyrotoner® Part 1', fullName: 'Mina Cho', email: 'mina@example.com', phone: '(213) 555-0142', certification: 'Certified', studio: 'Studio Nine', cityState: 'LA, CA', questions: 'Parking?', stage: '', prereq: '', availability: 'Yes', anythingElse: '' },
  { timestamp: '10/6/2026 9:41 AM', courses: 'B - Jumping Stretching Board, Z - Retired course', fullName: 'Leo Park', email: 'leo@example.com', phone: '', certification: '', studio: '', cityState: '', questions: '', stage: '', prereq: '', availability: '', anythingElse: '' },
];
let saved = null;
let browserCalledSheet = false;
let sheetMode = 'ok'; // 'ok' | 'not_configured'

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
  await context.route(`${SUPABASE}/functions/v1/enrollments-admin`, (r) => {
    if (sheetMode === 'not_configured') {
      return r.fulfill({ status: 503, json: { error: 'APPS_SCRIPT_ADMIN_KEY is not set.', code: 'not_configured' } });
    }
    const body = r.request().postDataJSON();
    if (body.action === 'courses') return r.fulfill({ json: { courses: COURSES, version: '2026-09-14b' } });
    if (body.action === 'registrations') return r.fulfill({ json: { registrations: REGS } });
    if (body.action === 'saveCourses') {
      saved = body.courses;
      return r.fulfill({ json: { saved: body.courses.length } });
    }
    return r.fulfill({ status: 400, json: { error: 'Unknown action.' } });
  });
  // The browser must never talk to Apps Script directly any more.
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
  check(await page.getByText('Sign-ups 6/6').isVisible() && await page.getByText('Full', { exact: true }).isVisible(), `${device}: seat chips`);
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

// 5. Saving courses: what goes to the sheet
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
  check(saved?.map((c) => c.id).join() === 'A,B,C', 'saved IDs follow schedule order');
  check(byName['Jumping Stretching Board']?.tag_en === '1 day' && byName['Jumping Stretching Board']?.tag_kr === '1일', 'day count becomes the EN/KR length tags');
  check(byName['Gyrotoner® Part 1']?.fee_early === '' && byName['Gyrotoner® Part 1']?.early_until === '', 'early bird switched off is saved empty');
  check(byName['Gyrotoner® Part 1']?.desc_kr === '한글 설명', 'Korean description is kept');
  check(byName['Old Course']?.active === false, 'hidden course stays hidden');
  check(!('taken' in (saved?.[0] ?? {})) && !('key' in (saved?.[0] ?? {})), 'no screen-only fields sent');

  // Delete asks first
  await gyro.getByRole('button', { name: 'Delete course' }).click();
  check(await page.locator('dialog[open]').getByText('Gyrotoner® Part 1').isVisible(), 'delete asks for confirmation');
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click();
  check((await page.getByLabel('Course name (English)').count()) === 2, 'course removed from the list');
  await context.close();
}

// 6. Function not set up yet: a clear setup message, not a broken page
{
  sheetMode = 'not_configured';
  const { page, context } = await open('OWNER', 393, 'enrollments/');
  check(await page.getByText('APPS_SCRIPT_ADMIN_KEY').isVisible(), 'missing secret shows the setup step');
  check(await noOverflow(page), 'setup message fits the phone');
  sheetMode = 'ok';
  await context.close();
}

check(!browserCalledSheet, 'browser never calls Apps Script directly');

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
