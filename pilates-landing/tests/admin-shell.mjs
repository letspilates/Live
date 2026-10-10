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

// Daily Income
const LA_TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
const LA_YESTERDAY = new Date(Date.parse(`${LA_TODAY}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
const METHODS = [
  { code: 'CASH', label_en: 'Cash', label_ko: '현금' },
  { code: 'ZELLE', label_en: 'Zelle', label_ko: 'Zelle' },
  { code: 'VENMO', label_en: 'Venmo', label_ko: 'Venmo' },
  { code: 'CREDIT', label_en: 'Credit card', label_ko: '신용카드' },
  { code: 'OTHER', label_en: 'Other', label_ko: '기타' },
];
const HITS = [
  { id: 's-mina', full_name: 'Mina Cho', phone_last4: '0142', last_paid_on: LA_YESTERDAY, last_amount_cents: 10000, last_method: 'ZELLE' },
  { id: 's-leo', full_name: 'Leo Park', phone_last4: '', last_paid_on: null, last_amount_cents: null, last_method: null },
];
const pay = (r) => ({ method_other: '', collected_by: r.recorded_by, collected_by_name: r.recorded_by_name, kind: 'PAYMENT', status: 'VALID', student_id: null, related_transaction_id: null, notes: '', reason: '', business_date: LA_TODAY, ...r });
const PAYMENTS = [
  pay({ id: 'p-1', amount_cents: 10000, method: 'CASH', payer_name: 'Mina Cho', student_id: 's-mina', recorded_by: 'u-ins', recorded_by_name: 'Ana Park', recorded_at: new Date().toISOString() }),
  pay({ id: 'p-2', amount_cents: 15000, method: 'ZELLE', payer_name: 'Leo Park', recorded_by: 'u-ben', recorded_by_name: 'Ben Yoo', recorded_at: new Date().toISOString() }),
  pay({ id: 'p-3', amount_cents: 2000, method: 'CASH', payer_name: 'Mina Cho', kind: 'REFUND', related_transaction_id: 'p-0', recorded_by: 'u-owner', recorded_by_name: 'Calvin Kim', recorded_at: new Date().toISOString() }),
  pay({ id: 'p-4', amount_cents: 9900, method: 'VENMO', payer_name: 'Walk-in', status: 'VOID', reason: 'typo', recorded_by: 'u-ben', recorded_by_name: 'Ben Yoo', recorded_at: new Date().toISOString() }),
  pay({ id: 'p-5', amount_cents: 4000, method: 'VENMO', payer_name: 'Old Friend', business_date: LA_YESTERDAY, recorded_by: 'u-ins', recorded_by_name: 'Ana Park', recorded_at: new Date(Date.now() - 864e5).toISOString() }),
];
const calls = []; // [rpc name, body]

// Members (fake people)
const member = (m) => ({ phone: '', email: '', address: '', notes: '', status: 'ACTIVE', created_at: '2026-10-10T00:00:00Z', mindbody_id: null,
  mindbody_imported_at: null, schedulista_key: null, schedulista_imported_at: null, schedulista_last_visit: null, schedulista_next_visit: null,
  schedulista_visits: null, schedulista_services: [], schedulista_notes: '', ...m });
const MEMBERS = [
  member({ id: 's-mina', full_name: 'Mina Cho', phone: '(213) 555-0142', email: 'mina@example.com', mindbody_id: '165', mindbody_imported_at: '2026-10-10T19:00:00Z',
    schedulista_key: 'mina cho|2135550142', schedulista_imported_at: '2026-10-10T19:00:00Z', schedulista_last_visit: '2026-09-18 18:30:00',
    schedulista_next_visit: '2026-10-13 18:30:00', schedulista_visits: 44, schedulista_services: ['Private with Sunnie'], schedulista_notes: 'Knee' }),
  member({ id: 's-leo', full_name: 'Leo Park', phone: '3105550199', mindbody_id: '46', mindbody_imported_at: '2026-10-10T19:00:00Z' }),
  member({ id: 's-sara', full_name: 'Sara Kim', phone: '3105550100', schedulista_key: 'sara kim|3105550100', schedulista_visits: 3 }),
  member({ id: 's-zed', full_name: 'Zed Quinn', status: 'INACTIVE' }),
  member({ id: 's-new', full_name: 'Walk Newman' }),
];
let duplicateOnce = false;

// Expenses (this month at the studio)
const MONTH = `${LA_TODAY.slice(0, 8)}01`;
const CATEGORIES = [['RENT', 'Studio Rent'], ['INSTRUCTOR_PAY', 'Instructor Compensation'], ['UTILITIES', 'Utilities'], ['SOFTWARE', 'Software Subscriptions'], ['OTHER', 'Other Expenses']]
  .map(([code, name_en]) => ({ code, name_en, name_ko: name_en }));
const exp = (e) => ({ vendor: '', due_date: null, payment_status: 'UNPAID', paid_on: null, payment_method: null, status: 'ACTIVE', void_reason: '',
  recurring_rule_id: null, is_estimate: false, payee_staff_id: null, notes: '', period_month: MONTH, ...e });
const EXPENSES = [
  exp({ id: 'e-rent', category: 'RENT', description: 'Monthly studio rent', amount_cents: 300000, expense_date: MONTH, recurring_rule_id: 'r-rent' }),
  exp({ id: 'e-app', category: 'SOFTWARE', description: 'Mindbody subscription', vendor: 'Mindbody', amount_cents: 27900, expense_date: MONTH,
    payment_status: 'PAID', paid_on: MONTH, payment_method: 'CARD' }),
  exp({ id: 'e-elec', category: 'UTILITIES', description: 'Electricity', amount_cents: 18000, expense_date: `${MONTH.slice(0, 8)}09`, is_estimate: true }),
  exp({ id: 'e-void', category: 'OTHER', description: 'Typo entry', amount_cents: 5000, expense_date: `${MONTH.slice(0, 8)}05`, status: 'VOID', void_reason: 'Entered twice' }),
];
const RULES = [{ id: 'r-rent', category: 'RENT', description: 'Monthly studio rent', vendor: 'Landlord', amount_cents: 300000, due_day: 1,
  start_month: MONTH, end_month: null, is_estimate: false, payee_staff_id: null, active: true }];
const writes = []; // [table, method, body, url]

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
  await context.route(`${SUPABASE}/rest/v1/payment_methods?**`, (r) => r.fulfill({ json: METHODS }));
  await context.route(`${SUPABASE}/rest/v1/payment_transactions?**`, (r) => {
    const q = new URL(r.request().url()).searchParams;
    if (q.get('related_transaction_id')) return r.fulfill({ json: [] });
    if (q.get('student_id')) return r.fulfill({ json: PAYMENTS.filter((p) => `eq.${p.student_id}` === q.get('student_id')) });
    const [from, to] = q.getAll('business_date').map((v) => v.slice(4));
    // RLS stand-in: staff see only what they recorded.
    const rows = PAYMENTS.filter((p) => (who === 'OWNER' || p.recorded_by === staff?.user_id)
      && (!from || p.business_date >= from) && (!to || p.business_date <= to));
    return r.fulfill({ json: rows });
  });
  await context.route(`${SUPABASE}/rest/v1/rpc/list_collectors`, (r) =>
    r.fulfill({ json: [...Object.values(PEOPLE), { user_id: 'u-ben', full_name: 'Ben Yoo' }].map(({ user_id, full_name }) => ({ user_id, full_name })) }),
  );
  await context.route(`${SUPABASE}/rest/v1/rpc/search_students`, (r) => {
    const q = (r.request().postDataJSON().p_query ?? '').toLowerCase();
    return r.fulfill({ json: q.length < 2 ? HITS.filter((h) => h.last_paid_on) : HITS.filter((h) => h.full_name.toLowerCase().includes(q)) });
  });
  await context.route(`${SUPABASE}/rest/v1/rpc/client_payments`, (r) => {
    const id = r.request().postDataJSON().p_student_id;
    return r.fulfill({ json: PAYMENTS.filter((p) => p.student_id === id) });
  });
  await context.route(`${SUPABASE}/rest/v1/students?**`, (r) => r.fulfill({ json: MEMBERS }));
  for (const name of ['import_members', 'update_member']) {
    await context.route(`${SUPABASE}/rest/v1/rpc/${name}`, (r) => {
      calls.push([name, r.request().postDataJSON()]);
      return r.fulfill({ json: name === 'import_members' ? { added: 2, linked: 1, updated: 0, skipped: 0 } : null });
    });
  }
  for (const name of ['add_student', 'record_payment', 'correct_payment', 'void_payment', 'record_refund']) {
    await context.route(`${SUPABASE}/rest/v1/rpc/${name}`, (r) => {
      const body = r.request().postDataJSON();
      calls.push([name, body]);
      if (name === 'add_student') return r.fulfill({ json: 's-new' });
      if (name === 'record_payment' && duplicateOnce && !body.p_confirm_duplicate) {
        duplicateOnce = false;
        return r.fulfill({ status: 400, json: { code: 'LPDUP', message: 'A payment like this was saved in the last 10 minutes.' } });
      }
      return r.fulfill({ json: pay({ id: 'p-new', amount_cents: body.p_amount_cents, method: body.p_method, payer_name: body.p_payer_name ?? 'Mina Cho', recorded_by: staff.user_id, recorded_by_name: staff.full_name, collected_by: body.p_collected_by, collected_by_name: Object.values(PEOPLE).find((x) => x.user_id === body.p_collected_by)?.full_name ?? 'Ben Yoo', recorded_at: new Date().toISOString() }) });
    });
  }
  await context.route(`${SUPABASE}/rest/v1/expense_categories?**`, (r) => r.fulfill({ json: CATEGORIES }));
  await context.route(`${SUPABASE}/rest/v1/staff_profiles?**`, (r) => r.fulfill({ json: Object.values(PEOPLE) }));
  await context.route(`${SUPABASE}/rest/v1/rpc/generate_recurring_expenses`, (r) => r.fulfill({ json: 1 }));
  for (const [table, rows] of [['expenses', EXPENSES], ['recurring_expense_rules', RULES]]) {
    await context.route(`${SUPABASE}/rest/v1/${table}**`, (r) => {
      const req = r.request();
      if (req.method() !== 'GET') {
        writes.push([table, req.method(), req.postDataJSON(), decodeURIComponent(req.url())]);
        return r.fulfill({ status: 201, body: '' });
      }
      const month = new URL(req.url()).searchParams.get('period_month');
      return r.fulfill({ json: month ? rows.filter((x) => `eq.${x.period_month}` === month) : rows });
    });
  }
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

// SHOTS=<dir> saves screenshots of the Daily Income screens for a visual check.
const shot = async (page, name) => process.env.SHOTS && (await page.waitForTimeout(400), page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const navLabels = (page) =>
  page.locator('aside nav a').evaluateAll((links) => links.map((a) => a.getAttribute('title')));

// 1. Owner: every width, dashboard + enrollments + menu
for (const [device, width] of Object.entries(WIDTHS)) {
  const { page, context, errors } = await open('OWNER', width);
  check((await page.locator('h1').innerText()) === 'Dashboard', `${device}: owner lands on dashboard`);
  check(await page.getByText('Team', { exact: true }).isVisible(), `${device}: team card`);
  check(await page.getByRole('button', { name: 'Open trainings' }).isVisible(), `${device}: enrollments card`);
  check(await noOverflow(page), `${device}: no sideways scroll on dashboard`);

  if (device === 'phone') {
    check(!(await page.locator('aside').isVisible()), 'phone: sidebar hidden');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const drawer = page.locator('dialog[open]');
    check(await drawer.getByRole('link', { name: 'Trainings' }).isVisible(), 'phone: drawer lists Trainings');
    check(await drawer.getByText('Studio', { exact: true }).isVisible() && await drawer.getByText('Settings', { exact: true }).isVisible(), 'phone: drawer shows menu groups');
    await drawer.getByRole('link', { name: 'Trainings' }).click();
    check(!(await page.locator('dialog[open]').count()), 'phone: drawer closes after navigating');
  } else {
    check((await navLabels(page)).join() === 'Dashboard,Clients,Trainings,Payments,Expenses,Users,Notifications', `${device}: owner menu`);
    if (device === 'desktop') check(await page.locator('aside').getByText('Admin', { exact: true }).isVisible(), 'desktop: menu groups labelled');
    if (device === 'tablet') {
      check(await page.getByRole('button', { name: 'Menu', exact: true }).isVisible(), 'tablet: menu button opens labelled drawer');
    } else {
      check(!(await page.getByRole('button', { name: 'Menu', exact: true }).isVisible()), 'desktop: no menu button');
    }
    await page.locator('aside').getByRole('link', { name: 'Trainings' }).click();
  }
  await page.waitForURL(/\/admin\/trainings\/$/);
  check((await page.locator('h1').innerText()) === 'Trainings', `${device}: trainings page title`);
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
  if (device !== 'phone') check((await active.getAttribute('title')) === 'Trainings', `${device}: active menu item`);
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
  const { page, context } = await open('OWNER', 1280, 'trainings/');
  check((await page.locator('h1').innerText()) === 'Trainings', 'deep link to trainings');
  await page.reload();
  await page.waitForLoadState('networkidle');
  check((await page.locator('h1').innerText()) === 'Trainings', 'refresh keeps trainings');
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
    if (device === 'desktop') check((await navLabels(page)).join() === 'Dashboard,Payments', `${who}: menu is Dashboard + Payments`);
    check(await page.getByText('My payments today').isVisible(), `${who} ${device}: my-today card`);
    check(await noOverflow(page), `${who} ${device}: no sideways scroll`);
    check(errors.length === 0, `${who} ${device}: no page errors`);
    await context.close();
  }
  for (const path of ['trainings/', 'users/', 'clients/', 'expenses/', 'notifications/']) {
    const { page, context } = await open(who, 1280, path);
    await page.waitForURL(/\/admin\/$/);
    check(!(await page.getByRole('tab').count()), `${who}: /${path} redirects to dashboard`);
    await context.close();
  }
}

// 4. Signed out: deep link goes to login and remembers where to return
{
  const { page, context } = await open(null, 393, 'trainings/');
  await page.waitForURL(/\/admin\/login\/\?next=trainings$/);
  check(true, 'signed-out deep link goes to login with next=trainings');
  await context.close();
}

// 5. Saving courses: what goes to save_training_courses
{
  saved = null;
  const { page, context } = await open('OWNER', 1280, 'trainings/');
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
  const { page, context } = await open('OWNER', 393, 'trainings/');
  check(await page.getByText('Could not load trainings').isVisible(), 'load error shows a message');
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
  const { page, context, errors } = await open('OWNER', 1280, 'trainings/');
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

// 9. Payments: instructor on a phone records payments
{
  calls.length = 0;
  const { page, context, errors } = await open('INSTRUCTOR', 393, 'payments/');
  check((await page.locator('h1').innerText()) === 'Payments', 'payments: title');
  await page.getByText('Type at least 2 letters').waitFor();
  check(!(await page.getByRole('button', { name: /New client|New student|Walk-in/ }).count()) && !(await page.getByText('Recently paid').count()),
    'payments: no new-client, walk-in or recently-paid list');
  await page.getByRole('button', { name: 'Save payment' }).click();
  check(await page.getByText('Choose a client.').isVisible() && !calls.length, 'payments: nothing saved without a client');
  await page.getByPlaceholder('Search name or phone').fill('mina');
  await page.getByRole('button', { name: /Mina Cho/ }).click();
  check((await page.getByLabel('Amount ($)').inputValue()) === '100.00', 'payments: last amount filled in');
  check((await page.getByLabel('Payment method').inputValue()) === 'ZELLE', 'payments: last method picked in the dropdown');
  await page.getByText('Payment history').waitFor();
  check(await page.locator('section[aria-label="Payment history"] li').count() >= 1, "payments: the client's own payment history shows");
  await shot(page, 'phone-record');
  const save = page.getByRole('button', { name: 'Received $100.00 · Zelle · Save' });
  check(await noOverflow(page), 'payments: no sideways scroll on the form');
  await save.click();
  await page.getByText('Payment saved').waitFor();
  await shot(page, 'phone-saved');
  const first = calls.find(([n]) => n === 'record_payment')?.[1];
  check(first?.p_amount_cents === 10000 && first.p_method === 'ZELLE' && first.p_student_id === 's-mina' && first.p_method_other === '' && /^[0-9a-f-]{36}$/.test(first.p_client_request_id),
    'payments: sends cents, method, client and a request id');
  check(!('p_recorded_by' in first) && !('p_business_date' in first) && !('p_payer_name' in first), 'payments: browser never sends who recorded, which day or a walk-in name');
  check(first.p_collected_by === 'u-ins' && await page.getByText('Received by Ana Park').isVisible(), 'payments: received by me by default');
  await page.getByRole('button', { name: 'Record another' }).click();

  // Duplicate warning: same request id is resent with the confirmation
  duplicateOnce = true;
  calls.length = 0;
  await page.getByPlaceholder('Search name or phone').fill('leo');
  await page.getByRole('button', { name: /Leo Park/ }).click();
  await page.getByText('No payments yet').waitFor({ timeout: 3000 }).catch(() => {});
  check(await page.getByText('No payments yet').isVisible(), 'payments: client without payments says so');
  await page.getByLabel('Amount ($)').fill('$1,250.5');
  await page.getByLabel('Payment method').selectOption('CASH');
  await page.getByRole('button', { name: 'Received $1,250.50 · Cash · Save' }).click();
  await page.getByText('Possible duplicate').waitFor();
  await page.getByRole('button', { name: 'Save anyway' }).click();
  await page.getByText('Payment saved').waitFor();
  const [a, b] = calls.filter(([n]) => n === 'record_payment').map(([, body]) => body);
  check(a?.p_amount_cents === 125050 && b?.p_confirm_duplicate === true && a.p_client_request_id === b.p_client_request_id,
    'payments: duplicate warning, then saved once with the same request id');
  check(first.p_client_request_id !== a.p_client_request_id, 'payments: a new payment gets a new request id');
  await page.getByRole('button', { name: 'Record another' }).click();

  // "Other" asks what it was
  calls.length = 0;
  await page.getByPlaceholder('Search name or phone').fill('leo');
  await page.getByRole('button', { name: /Leo Park/ }).click();
  await page.getByLabel('Amount ($)').fill('abc');
  await page.getByLabel('Payment method').selectOption('OTHER');
  await page.getByRole('button', { name: 'Save payment' }).click();
  check(await page.getByText('Enter an amount').isVisible() && await page.getByText('Write what the other payment method was.').isVisible() && !calls.length,
    'payments: bad amount and missing Other text are caught on the screen');
  await page.getByLabel('Amount ($)').fill('25');
  await page.getByLabel('What was it?').fill('ClassPass');
  await page.getByLabel('Received by').selectOption({ label: 'Ben Yoo' });
  await shot(page, 'phone-other-method');
  await page.getByRole('button', { name: 'Received $25.00 · Other (ClassPass) · Save' }).click();
  await page.getByText('Payment saved').waitFor();
  const other = calls.find(([n]) => n === 'record_payment')?.[1];
  check(other?.p_method === 'OTHER' && other.p_method_other === 'ClassPass' && other.p_student_id === 's-leo', 'payments: Other with its description');
  check(other?.p_collected_by === 'u-ben', 'payments: another staff member as the receiver');
  await page.getByRole('button', { name: 'Record another' }).click();
  await page.getByPlaceholder('Search name or phone').fill('Zed Quinn');
  await page.getByText('No client found. Add them in Clients first').waitFor();
  check(true, 'payments: unknown name points to Clients');

  // My history: own rows only; today's can be fixed, yesterday's cannot
    await page.getByRole('tab', { name: 'My history' }).click();
  await page.getByText('My total').waitFor();
  check(await page.getByRole('button', { name: /Mina Cho/ }).isVisible() && !(await page.getByText('Leo Park').count()), 'history: instructor sees only own payments');
  check(await page.locator('dd').first().innerText() === '$100.00', 'history: my total for today');
  await shot(page, 'phone-history');
  await page.getByRole('button', { name: /Mina Cho/ }).click();
  const dialog = page.locator('dialog[open]');
  await shot(page, 'phone-dialog');
  check(await dialog.getByRole('button', { name: 'Correct' }).isVisible() && !(await dialog.getByRole('button', { name: 'Refund' }).count()), 'history: correct today, no refund for staff');
  calls.length = 0;
  await dialog.getByRole('button', { name: 'Void' }).click();
  await dialog.getByRole('button', { name: 'Void' }).click();
  check(await dialog.getByText('Enter a reason.').isVisible() && !calls.length, 'history: void needs a reason');
  await dialog.getByLabel('Reason').fill('entered twice');
  await dialog.getByRole('button', { name: 'Void' }).click();
  await page.getByText('Payment voided.').waitFor();
  check(calls[0]?.[0] === 'void_payment' && calls[0][1].p_id === 'p-1' && calls[0][1].p_reason === 'entered twice', 'history: void sent with reason');
  await page.getByLabel('Period').selectOption('week');
  const old = page.getByRole('button', { name: /Old Friend/ });
  if (await old.count()) {
    await old.click();
    check(await dialog.getByText('Only the owner can change').isVisible() && !(await dialog.getByRole('button', { name: 'Correct' }).count()), 'history: yesterday is owner-only');
    await dialog.getByRole('button', { name: 'Close' }).click();
  } else check(true, 'history: (today is Monday, yesterday is outside this week)');
  check(await noOverflow(page), 'history: no sideways scroll on the phone');
  check(errors.length === 0, `payments: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 10. Daily Income: owner transactions, filters, totals, refund
for (const [device, width] of Object.entries(WIDTHS)) {
  calls.length = 0;
  const { page, context, errors } = await open('OWNER', width, 'payments/?tab=history');
  await page.getByText('Net revenue').waitFor();
  await page.getByText('Leo Park').waitFor();
  const stats = await page.locator('dl dd').allInnerTexts();
  // valid payments $100 + $150, refund $20, void $99 left out
  check(stats.join('|') === '$230.00|$250.00|−$20.00|2', `${device} owner: totals ${stats.join('|')}`);
  await shot(page, `${device}-owner-history`);
  check(await page.locator('main li').getByText(/Ben Yoo/).first().isVisible(), `${device} owner: sees who recorded`);
  await page.getByLabel('Received by').selectOption({ label: 'Ben Yoo' });
  check(!(await page.getByText('Mina Cho').count()) && (await page.locator('dl dd').first().innerText()) === '$150.00', `${device} owner: filter by recorder`);
  await page.getByLabel('Received by').selectOption({ label: 'Everyone' });
  check(await noOverflow(page), `${device} owner: no sideways scroll on transactions`);
  if (device === 'desktop') {
    // Any dates: moving From back a day shows yesterday too
    await page.getByLabel('From').fill(LA_YESTERDAY);
    await page.getByText('Old Friend').waitFor();
    check((await page.getByLabel('Period').inputValue()) === 'custom', 'owner: picking dates switches the period to Custom');
    await page.getByLabel('Period').selectOption('today');
    await page.getByText('Old Friend').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    check(!(await page.getByText('Old Friend').count()), 'owner: period menu sets the dates back to today');
    await shot(page, 'desktop-owner-refund-buttons');
    await page.locator('main li').filter({ hasText: /Mina Cho.*\$100\.00/ }).getByRole('button', { name: 'Refund', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByText('Up to $100.00 can be refunded').waitFor();
    await dialog.getByLabel('Amount ($)').fill('150');
    await dialog.getByLabel('Reason').fill('class cancelled');
    await dialog.getByRole('button', { name: 'Save refund' }).click();
    check(await dialog.getByText('More than what is left to refund.').isVisible() && !calls.some(([n]) => n === 'record_refund'), 'owner: refund above the payment is stopped');
    await dialog.getByLabel('Amount ($)').fill('40');
    await dialog.getByRole('button', { name: 'Save refund' }).click();
    await page.getByText('Refund saved.').waitFor();
    const refund = calls.find(([n]) => n === 'record_refund')?.[1];
    check(refund?.p_original_id === 'p-1' && refund.p_amount_cents === 4000 && refund.p_reason === 'class cancelled' && refund.p_method === 'CASH', 'owner: refund sent');

    await page.goto(ROOT);
    await page.getByText('$230.00').waitFor({ timeout: 5000 }).catch(() => {});
    await shot(page, 'desktop-owner-dashboard');
    check(await page.getByText('Today', { exact: true }).isVisible() && await page.getByText('$230.00').isVisible() && await page.getByText('2 payments · Refunds −$20.00').isVisible(), 'owner dashboard: today card');
  }
  check(errors.length === 0, `${device} owner daily income: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 11. Members: one list from Mindbody + Schedulista, source shown, CSV import
for (const [device, width] of Object.entries(WIDTHS)) {
  calls.length = 0;
  const { page, context, errors } = await open('OWNER', width, 'clients/');
  await page.getByText('Mina Cho').waitFor();
  check((await page.locator('h1').innerText()) === 'Clients', `${device} members: title`);
  const mina = page.getByRole('button', { name: /Mina Cho/ });
  check(await mina.getByText('Mindbody').isVisible() && await mina.getByText('Schedulista').isVisible(), `${device} members: both sources shown on a member`);
  check(!(await page.getByText('Zed Quinn').count()), `${device} members: inactive hidden by default`);
  check(await page.getByRole('button', { name: /^Mindbody/ }).innerText() === 'Mindbody2', `${device} members: Mindbody count`);
  await page.getByRole('button', { name: /^Schedulista/ }).click();
  check(!(await page.getByText('Leo Park').count()) && await page.getByText('Sara Kim').isVisible(), `${device} members: Schedulista filter`);
  await page.getByRole('button', { name: /^Added here/ }).click();
  check(await page.getByText('Walk Newman').isVisible() && !(await page.getByText('Mina Cho').count()), `${device} members: added-here filter`);
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByPlaceholder('Search name, phone or email').fill('555-0199');
  check(await page.getByText('Leo Park').isVisible() && !(await page.getByText('Mina Cho').count()), `${device} members: search by phone`);
  await page.getByPlaceholder('Search name, phone or email').fill('');
  check(await noOverflow(page), `${device} members: no sideways scroll`);
  await shot(page, `${device}-members`);

  if (device === 'phone') {
    await page.getByRole('button', { name: /Mina Cho/ }).click();
    const dialog = page.locator('dialog[open]');
    check(await dialog.getByText('From Mindbody').isVisible() && await dialog.getByText('165').isVisible(), 'member: Mindbody section with ID');
    check(await dialog.getByText('From Schedulista').isVisible() && await dialog.getByText('Private with Sunnie').isVisible() && await dialog.getByText('44').isVisible(), 'member: Schedulista visits and services');
    await shot(page, 'phone-member');
    await dialog.getByLabel('Notes').fill('Prefers mornings');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Client saved.').waitFor();
    const upd = calls.find(([n]) => n === 'update_member')?.[1];
    check(upd?.p_id === 's-mina' && upd.p_notes === 'Prefers mornings' && upd.p_status === 'ACTIVE', 'member: edit saved');

    calls.length = 0;
    await page.getByRole('button', { name: 'Add client' }).click();
    const add = page.locator('dialog[open]');
    await add.getByLabel('Full name').fill('Nora Lim');
    await add.getByLabel('Phone').fill('213-555-0177');
    await add.getByLabel('Email').fill('nora@example.com');
    await add.getByRole('button', { name: 'Add client' }).click();
    for (let i = 0; i < 50 && !calls.some(([n]) => n === 'update_member'); i++) await page.waitForTimeout(100);
    const made = calls.find(([n]) => n === 'add_student')?.[1];
    const filled = calls.find(([n]) => n === 'update_member')?.[1];
    check(made?.p_full_name === 'Nora Lim' && made.p_phone === '213-555-0177' && filled?.p_id === 's-new' && filled.p_email === 'nora@example.com',
      'clients: add client saves name, phone and email');
  }

  if (device === 'desktop') {
    const file = page.locator('input[type="file"]');
    // Mindbody: column numbers above the header, footer at the end
    const mb = '﻿0,1,2,3,4,5,6,7,8,9,10,11,12\nLast name,First name,Nickname,ID,Address,City,State,Postal code,Country,Mobile phone,Home phone,Work phone,Email\n' +
      'Cho,Mina,,165,1 Main St,Los Angeles,CA,90010,US,2135550142,,,mina@example.com\n,Ana Woo,,46,,,,,US,,3105550000,,\n' +
      'Total records: 2,Total records: 2,Total records: 2,Total records: 2,,,,,,,,,\n';
    await file.setInputFiles({ name: 'mindbody_clients.csv', mimeType: 'text/csv', buffer: Buffer.from(mb) });
    await page.getByText('This is a Mindbody client export with 2 people').waitFor();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByText('Mindbody import done: 2 new, 1 joined').waitFor();
    const mbCall = calls.find(([n]) => n === 'import_members')?.[1];
    check(mbCall?.p_source === 'MINDBODY' && mbCall.p_rows.length === 2, 'import: Mindbody detected, footer left out');
    check(mbCall?.p_rows[0].mindbody_id === '165' && mbCall.p_rows[0].full_name === 'Mina Cho' && mbCall.p_rows[0].address === '1 Main St, Los Angeles, CA, 90010', 'import: Mindbody fields');
    check(mbCall?.p_rows[1].full_name === 'Ana Woo' && mbCall.p_rows[1].phone === '3105550000', 'import: name in first-name column, home phone fallback');
    calls.length = 0;
    const sc = 'First Name,Last Name,Email,Phone,Last Appointment,Next Appointment,Appointment Count,Services,Client Notes\n' +
      'Mina,Cho,,2135550142,2026-09-18 18:30:00,,44,"[""All"", ""Private with Sunnie ""]",Knee\n';
    await file.setInputFiles({ name: 'schedulista_clients.csv', mimeType: 'text/csv', buffer: Buffer.from(sc) });
    await page.getByText('This is a Schedulista client export with 1 people').waitFor();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByText('Schedulista import done').waitFor();
    const scRow = calls.find(([n]) => n === 'import_members')?.[1];
    check(scRow?.p_source === 'SCHEDULISTA' && scRow.p_rows[0].visits === '44' && scRow.p_rows[0].last_visit === '2026-09-18 18:30:00'
      && scRow.p_rows[0].services.join() === 'Private with Sunnie' && scRow.p_rows[0].notes === 'Knee', 'import: Schedulista fields, "All" dropped');
    await file.setInputFiles({ name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
    await page.getByText('not a Mindbody or Schedulista client export').waitFor({ timeout: 3000 }).catch(() => {});
    check(await page.getByText('not a Mindbody or Schedulista client export').isVisible(), 'import: other files refused');
  }
  check(errors.length === 0, `${device} members: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 12. Expenses (owner): month list, totals, add / mark paid / void, CSV, recurring rules
for (const [device, width] of Object.entries(WIDTHS)) {
  writes.length = 0;
  const { page, context, errors } = await open('OWNER', width, 'expenses/');
  await page.getByText('Monthly studio rent').waitFor();
  const main = page.locator('main');
  check((await page.locator('h1').innerText()) === 'Expenses', `${device} expenses: title`);
  check(await page.getByText('Recurring expenses added: 1.').isVisible(), `${device} expenses: recurring expenses created on open`);
  const totals = await main.locator('dl').innerText();
  check(totals.includes('$3,459.00') && totals.includes('$279.00') && totals.includes('Unpaid (2)') && totals.includes('$3,180.00'),
    `${device} expenses: totals leave the void out`);
  check(await main.getByText('Estimate', { exact: true }).isVisible(), `${device} expenses: estimate tag`);
  check(await main.locator('li', { hasText: 'Monthly studio rent' }).getByTitle('From a recurring expense').isVisible(), `${device} expenses: recurring mark`);
  check(await main.locator('li', { hasText: 'Typo entry' }).getByText('Void').isVisible(), `${device} expenses: void row labelled`);
  check(await noOverflow(page), `${device} expenses: no sideways scroll`);
  await shot(page, `${device}-expenses`);
  await page.getByLabel('Status').selectOption('UNPAID');
  check(!(await main.getByText('Mindbody subscription').count()) && await main.getByText('Electricity').isVisible(), `${device} expenses: unpaid filter`);
  await page.getByLabel('Status').selectOption('');

  if (device === 'desktop') {
    await main.locator('li', { hasText: 'Monthly studio rent' }).getByRole('button', { name: 'Mark paid' }).click();
    let dialog = page.locator('dialog[open]');
    check(await dialog.getByRole('radio', { name: 'Paid', exact: true }).getAttribute('aria-checked') === 'true', 'mark paid: Paid preselected');
    await dialog.getByRole('button', { name: 'Save expense' }).click();
    check(await dialog.getByText('Choose how it was paid.').isVisible(), 'mark paid: asks how it was paid');
    await dialog.getByLabel('Paid with').selectOption('BANK');
    await dialog.getByRole('button', { name: 'Save expense' }).click();
    await page.getByText('Expense saved.').waitFor();
    const paid = writes.find(([t, m]) => t === 'expenses' && m === 'PATCH');
    check(paid?.[3].includes('id=eq.e-rent') && paid[2].payment_status === 'PAID' && paid[2].paid_on === LA_TODAY && paid[2].payment_method === 'BANK'
      && paid[2].amount_cents === 300000, 'mark paid: saved as paid today by bank transfer');

    writes.length = 0;
    await page.getByRole('button', { name: 'Add expense' }).click();
    dialog = page.locator('dialog[open]');
    await dialog.getByLabel('Category').selectOption('INSTRUCTOR_PAY');
    await dialog.getByLabel('Description').fill('Ana, September');
    await dialog.getByLabel('Amount ($)').fill('1,300');
    await dialog.getByLabel('Paid to (staff)').selectOption('u-ins');
    await shot(page, 'desktop-add-expense');
    await dialog.getByRole('button', { name: 'Save expense' }).click();
    await page.getByText('Expense saved.').waitFor();
    const added = writes.find(([t, m]) => t === 'expenses' && m === 'POST')?.[2];
    check(added?.amount_cents === 130000 && added.payee_staff_id === 'u-ins' && added.payment_status === 'UNPAID' && added.expense_date === LA_TODAY,
      'add expense: instructor pay linked to the staff member');

    writes.length = 0;
    await main.getByRole('button', { name: /Electricity/ }).click();
    dialog = page.locator('dialog[open]');
    await dialog.getByRole('button', { name: 'Void expense' }).click();
    await dialog.getByLabel('Reason').fill('Paid by the landlord');
    await dialog.getByRole('button', { name: 'Void expense' }).click();
    await page.getByText('Expense voided.').waitFor();
    const voided = writes.find(([t]) => t === 'expenses')?.[2];
    check(voided?.status === 'VOID' && voided.void_reason === 'Paid by the landlord', 'void: status and reason saved');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    const csv = (await import('node:fs')).readFileSync(await download.path(), 'utf8');
    check(download.suggestedFilename() === `expenses-${MONTH.slice(0, 7)}.csv` && csv.includes('Date,Category,Description') && csv.includes('Monthly studio rent')
      && csv.includes('3000'), 'export: CSV of the month');

    await page.getByRole('button', { name: 'Next month' }).click();
    await page.getByText(/^No expenses in .* yet\.$/).waitFor();
    check(true, 'next month: empty month message');
  }

  if (device === 'phone') {
    writes.length = 0;
    await page.getByRole('button', { name: 'Add expense' }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('Category').selectOption('OTHER');
    await dialog.getByLabel('Description').fill('Spring credit');
    await dialog.getByLabel('Amount ($)').fill('-50');
    await dialog.getByRole('button', { name: 'Save expense' }).click();
    check(await dialog.getByText('Add a note saying what the credit is for.').isVisible(), 'credit: needs a note');
    check(!(await dialog.getByLabel('Paid to (staff)').count()), 'add expense: staff field only for instructor pay');
    await dialog.getByLabel('Note').fill('Refund for a broken spring');
    await shot(page, 'phone-add-expense');
    await dialog.getByRole('button', { name: 'Save expense' }).click();
    await page.getByText('Expense saved.').waitFor();
    check(writes.find(([t, m]) => t === 'expenses' && m === 'POST')?.[2].amount_cents === -5000, 'credit: saved as -$50.00');

    writes.length = 0;
    await page.getByRole('tab', { name: 'Recurring' }).click();
    await page.getByRole('button', { name: 'Add recurring expense' }).click();
    const rule = page.locator('dialog[open]');
    await rule.getByLabel('Category').selectOption('UTILITIES');
    await rule.getByLabel('Description').fill('Water');
    await rule.getByLabel('Amount ($)').fill('60');
    await rule.getByLabel('Due day').fill('31');
    await shot(page, 'phone-add-rule');
    await rule.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Recurring expense saved.').waitFor();
    const r = writes.find(([t, m]) => t === 'recurring_expense_rules' && m === 'POST')?.[2];
    check(r?.amount_cents === 6000 && r.due_day === 31 && r.start_month === MONTH && r.end_month === null, 'rule: added from this month, day 31');
  }

  if (device === 'tablet') {
    writes.length = 0;
    await page.getByRole('tab', { name: 'Recurring' }).click();
    await page.getByText('$3,000.00 / mo').waitFor();
    check(await noOverflow(page), 'tablet recurring: no sideways scroll');
    await shot(page, 'tablet-recurring');
    await main.getByRole('button', { name: /Monthly studio rent/ }).click();
    const rule = page.locator('dialog[open]');
    check(!(await rule.getByText('Also change this month').count()), 'rule: no apply-now box before the amount changes');
    await rule.getByLabel('Amount ($)').fill('3,200');
    await rule.getByText('Also change this month’s unpaid expense').click();
    await rule.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Recurring expense saved.').waitFor();
    const ruleWrite = writes.find(([t, m]) => t === 'recurring_expense_rules' && m === 'PATCH');
    const thisMonth = writes.find(([t, m]) => t === 'expenses' && m === 'PATCH');
    check(ruleWrite?.[2].amount_cents === 320000 && ruleWrite[3].includes('id=eq.r-rent'), 'rule: new amount saved');
    check(thisMonth?.[2].amount_cents === 320000 && thisMonth[3].includes('recurring_rule_id=eq.r-rent') && thisMonth[3].includes(`period_month=eq.${MONTH}`)
      && thisMonth[3].includes('payment_status=eq.UNPAID'), 'rule: this month\'s unpaid expense follows, past months untouched');
  }
  check(errors.length === 0, `${device} expenses: no page errors ${errors.join(' | ')}`);
  await context.close();
}

check(!browserCalledSheet, 'staging never calls the Google Sheet');

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
