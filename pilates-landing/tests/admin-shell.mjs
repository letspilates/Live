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
  // The legacy enrollment page asks Apps Script to check the admin password.
  await context.route('https://script.google.com/**', (r) => r.fulfill({ json: { result: 'error', message: 'mock' } }));
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
  const frame = page.frameLocator('iframe[title="Enrollment management"]');
  check(await frame.locator('#loginPw').isVisible(), `${device}: legacy enrollment screen loads inside the shell`);
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
    check(!(await page.locator('iframe').count()), `${who}: /${path} redirects to dashboard`);
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

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
