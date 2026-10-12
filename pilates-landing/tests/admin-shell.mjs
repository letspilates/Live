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
  OWNER: { user_id: 'u-owner', full_name: 'Calvin Kim', email: 'owner@example.com', role: 'OWNER', roles: ['OWNER'], status: 'ACTIVE', pricing_tier: null },
  INSTRUCTOR: { user_id: 'u-ins', full_name: 'Ana Park', email: 'ana@example.com', role: 'INSTRUCTOR', roles: ['INSTRUCTOR'], status: 'ACTIVE', pricing_tier: 'MASTER' },
  STAFF: { user_id: 'u-staff', full_name: 'Sam Lee', email: 'sam@example.com', role: 'STAFF', roles: ['STAFF'], status: 'ACTIVE', pricing_tier: null },
  ADMIN: { user_id: 'u-admin', full_name: 'Ada Admin', email: 'ada@example.com', role: 'ADMIN', roles: ['ADMIN', 'INSTRUCTOR'], status: 'ACTIVE', pricing_tier: 'CERTIFIED', phone: '213-555-0100', address: '', certifications: 'GYROTONIC® Level 1', notes: '' },
};
// Settings → Admin defaults (role_menu_access rows).
let ACCESS = [];
const resetAccess = () => {
  ACCESS = [{ role: 'STAFF', menu: 'schedule' }, { role: 'STAFF', menu: 'clients' }, { role: 'STAFF', menu: 'payments' },
    { role: 'INSTRUCTOR', menu: 'clients' }, { role: 'INSTRUCTOR', menu: 'payments' }];
};
resetAccess();
const adminCalls = []; // staff-admin function bodies

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
let deletedReg = null;
let addedReg = null;
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
const CATEGORIES = [['RENT', 'Studio Rent'], ['INSTRUCTOR_PAY', 'Salary'], ['UTILITIES', 'Utilities'], ['SOFTWARE', 'Software Subscriptions'], ['OTHER', 'Other Expenses']]
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

// Reports: finance_report() answers with fixed numbers; months follow the asked range.
const LAST_MONTH = (() => { const d = new Date(`${MONTH}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
let periodClosed = false;
const finance = []; // [rpc, body]
function report(from, to) {
  const months = [];
  for (const d = new Date(`${from.slice(0, 7)}-01T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const month = d.toISOString().slice(0, 10);
    months.push({ month, net: 1850000, expenses: 800000, profit: 1050000, payment_count: 120,
      status: month === LAST_MONTH && periodClosed ? 'CLOSED' : 'OPEN', closed_at: null, version: null });
  }
  return { from, to, gross: 2000000, refunds: 20000, net: 1980000, payment_count: 131, refund_count: 1, void_count: 2,
    expenses: 800000, expenses_paid: 500000, expenses_outstanding: 300000, expense_count: 9, unpaid_count: 2, estimate_count: 1,
    expense_void_count: 0, profit: 1180000,
    by_method: [{ method: 'ZELLE', gross: 1200000, refunds: 20000, net: 1180000, count: 80 }, { method: 'CASH', gross: 800000, refunds: 0, net: 800000, count: 51 }],
    by_collector: [{ name: 'Ana Park', gross: 1200000, count: 80 }, { name: 'Calvin Kim', gross: 800000, count: 51 }],
    by_category: [{ category: 'INSTRUCTOR_PAY', amount: 350000, count: 2 }, { category: 'RENT', amount: 300000, count: 1 }],
    months };
}

// Knowledge library: a YouTube link, an uploaded PDF, a Vimeo video.
const KNOWLEDGE = [
  { id: 'k-1', category: 'PILATES', kind: 'VIDEO', title: 'Reformer footwork', description: 'Week 1 basics', link_url: 'https://www.youtube.com/watch?v=abcDEF12345',
    file_path: null, file_name: null, file_size: null, audience: 'ALL', created_at: '2026-10-10T20:00:00Z' },
  { id: 'k-2', category: 'GYROTONIC', kind: 'DOCUMENT', title: 'Gyrotonic Level 1 manual', description: '', link_url: null,
    file_path: 'f1/manual.pdf', file_name: 'manual.pdf', file_size: 2400000, audience: 'SELECTED', created_at: '2026-10-09T20:00:00Z' },
  { id: 'k-3', category: 'GYROTONIC', kind: 'VIDEO', title: 'Arch and curl', description: '', link_url: 'https://vimeo.com/123456789/abcdef1234',
    file_path: null, file_name: null, file_size: null, audience: 'ALL', created_at: '2026-10-08T20:00:00Z' },
];
const knowledgeCalls = [];

// Schedule: three blocks today in studio time. The browser runs in Seoul in the
// schedule checks, so a time that followed the browser's zone would show wrong.
const laISO = (day, min) => {
  const wall = Date.parse(`${day}T00:00:00Z`) + min * 6e4;
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    t += wall - (Date.parse(`${p.year}-${p.month}-${p.day}T00:00:00Z`) + (Number(p.hour) * 60 + Number(p.minute)) * 6e4);
  }
  return new Date(t).toISOString();
};
const booking = (b) => ({ student_id: null, client_phone: '', status: 'BOOKED', notes: '', students: null, ...b });
const APPTS = [
  { id: 'a-1', starts_at: laISO(LA_TODAY, 540), minutes: 50, staff_id: 'i-sun', service: 'Private', capacity: 1, series_id: 'ser-1', series_changed: false,
    status: 'BOOKED', appointment_clients: [booking({ id: 'b-1', student_id: 's-mina', client_name: 'Mina C', students: { full_name: 'Mina Cho' } })] },
  { id: 'a-2', starts_at: laISO(LA_TODAY, 540), minutes: 50, staff_id: 'i-suk', service: 'Pilates Group', capacity: 5, series_id: 'ser-2', series_changed: true,
    status: 'BOOKED', appointment_clients: [booking({ id: 'b-2', client_name: 'Leo Park' }), booking({ id: 'b-3', client_name: 'Sara Kim', status: 'CANCELLED' }),
      booking({ id: 'b-4', client_name: 'Ana Lee', notes: 'Knee' })] },
  { id: 'a-3', starts_at: laISO(LA_TODAY, 720), minutes: 120, staff_id: null, service: 'Workshop', capacity: 8, series_id: null, series_changed: false,
    status: 'BOOKED', appointment_clients: [] },
  // The client cancelled the same day: stays on the calendar, striped.
  { id: 'a-4', starts_at: laISO(LA_TODAY, 900), minutes: 50, staff_id: 'i-sun', service: 'Private', capacity: 1, series_id: null, series_changed: false,
    status: 'BOOKED', appointment_clients: [booking({ id: 'b-5', client_name: 'Kai Moon', status: 'LATE_CANCEL' })] },
  // Starts while the 9:00 blocks are still running: drawn on top, pushed in by half.
  { id: 'a-5', starts_at: laISO(LA_TODAY, 570), minutes: 30, staff_id: 'i-sun', service: 'Gyrotonic', capacity: 1, series_id: null, series_changed: false,
    status: 'BOOKED', appointment_clients: [booking({ id: 'b-6', client_name: 'Noa Han' })] },
  // The client didn't come: striped like a late cancel.
  { id: 'a-6', starts_at: laISO(LA_TODAY, 1020), minutes: 50, staff_id: 'i-suk', service: 'Private', capacity: 1, series_id: null, series_changed: false,
    status: 'BOOKED', appointment_clients: [booking({ id: 'b-7', client_name: 'Rio Song', status: 'NO_SHOW' })] },
];
const INSTRUCTORS = [{ user_id: 'i-suk', full_name: 'Su kyung YI', calendar_color: '#EEBC43', active: true },
  { user_id: 'i-sun', full_name: 'Sunnie Lee', calendar_color: null, active: true }];
const SERVICE_CATEGORIES = [{ id: 'c-ind', name: 'Individual Classes', sort: 1 }, { id: 'c-pil', name: 'Pilates Classes', sort: 2 },
  { id: 'c-gyr', name: 'Gyrotonic Classes', sort: 3 }];
// Gyrotonic Group: only Su kyung teaches it (null = every instructor).
const SERVICES = [['Private', 1, 'c-ind', null], ['Gyrotonic', 1, 'c-ind', null], ['Pilates Group', 5, 'c-pil', null], ['Gyrotonic Group', 3, 'c-gyr', ['i-suk']]]
  .map(([name, capacity, category_id, staff_ids], i) => ({ id: `v-${i + 1}`, name, minutes: 50, capacity, active: true, sort: i + 1, category_id,
    price_cents: null, cleanup_minutes: 0, description: '', staff_ids }));
const sched = []; // [rpc, body]

/** A page signed in as `who` (or signed out when null) at the given width. */
async function open(who, width, path = '', options = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 852 : 900 }, ...options });
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
      // Also runs in embedded players, where storage is blocked.
      ([key, value]) => { try { window.localStorage.setItem(key, value); } catch { /* other origin */ } },
      [STORAGE_KEY, JSON.stringify(session)],
    );
    await context.route(`${SUPABASE}/auth/v1/user`, (r) => r.fulfill({ json: user }));
  }
  await context.route(`${SUPABASE}/auth/v1/logout**`, (r) => r.fulfill({ status: 204 }));
  await context.route(`${SUPABASE}/rest/v1/rpc/current_staff`, (r) => r.fulfill({ json: staff ?? null }));
  await context.route(`${SUPABASE}/rest/v1/rpc/list_staff`, (r) =>
    r.fulfill({ json: Object.values(PEOPLE).map((p) => ({ phone: '', address: '', certifications: '', notes: '', ...p, last_sign_in_at: null })) }),
  );
  await context.route(`${SUPABASE}/rest/v1/role_menu_access?**`, (r) => r.fulfill({ json: ACCESS }));
  await context.route(`${SUPABASE}/rest/v1/rpc/set_role_menu_access`, (r) => {
    const b = r.request().postDataJSON();
    calls.push(['set_role_menu_access', b]);
    ACCESS = b.p_on ? [...ACCESS, { role: b.p_role, menu: b.p_menu }] : ACCESS.filter((a) => a.role !== b.p_role || a.menu !== b.p_menu);
    return r.fulfill({ status: 204, body: '' });
  });
  await context.route(`${SUPABASE}/rest/v1/rpc/update_staff_user`, (r) => {
    calls.push(['update_staff_user', r.request().postDataJSON()]);
    return r.fulfill({ status: 204, body: '' });
  });
  await context.route(`${SUPABASE}/functions/v1/staff-admin`, (r) => {
    const b = r.request().postDataJSON();
    adminCalls.push(b);
    if (b.action === 'delete' && b.userId === 'u-ins') {
      return r.fulfill({ status: 400, json: { error: 'This person has records.', code: 'LPREF' } });
    }
    return r.fulfill({ json: {} });
  });
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
  await context.route(`${SUPABASE}/rest/v1/rpc/add_training_registration`, (r) => {
    addedReg = r.request().postDataJSON().p;
    return r.fulfill({ json: 'r-new' });
  });
  await context.route(`${SUPABASE}/rest/v1/rpc/delete_training_registration`, (r) => {
    deletedReg = r.request().postDataJSON().p_id;
    return r.fulfill({ status: 204, body: '' });
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
  await context.route(`${SUPABASE}/rest/v1/rpc/finance_report`, (r) => {
    const body = r.request().postDataJSON();
    finance.push(['finance_report', body]);
    return r.fulfill({ json: report(body.p_from, body.p_to) });
  });
  for (const [fn, closed] of [['close_period', true], ['reopen_period', false]]) {
    await context.route(`${SUPABASE}/rest/v1/rpc/${fn}`, (r) => {
      finance.push([fn, r.request().postDataJSON()]);
      periodClosed = closed;
      return r.fulfill({ json: {} });
    });
  }
  await context.route(`${SUPABASE}/rest/v1/accounting_periods?**`, (r) => {
    const month = new URL(r.request().url()).searchParams.get('month');
    const row = { month: LAST_MONTH, status: periodClosed ? 'CLOSED' : 'OPEN', version: 1, closed_by: 'u-owner',
      closed_at: '2026-10-03T16:12:00Z', reopened_at: periodClosed ? null : '2026-10-04T16:12:00Z', reopen_reason: periodClosed ? '' : 'Fix a typo' };
    return r.fulfill({ json: month === `eq.${LAST_MONTH}` && finance.some(([f]) => f !== 'finance_report') ? [row] : [] });
  });
  await context.route(`${SUPABASE}/rest/v1/knowledge_items?**`, (r) => r.fulfill({ json: KNOWLEDGE }));
  // RLS stand-in: owners/admins see every viewer row, others only their own.
  await context.route(`${SUPABASE}/rest/v1/knowledge_item_viewers?**`, (r) =>
    r.fulfill({ json: [{ item_id: 'k-2', user_id: 'u-ins' }, { item_id: 'k-2', user_id: 'u-staff' }].filter((v) => ['OWNER', 'ADMIN'].includes(who) || v.user_id === staff?.user_id) }),
  );
  await context.route(`${SUPABASE}/storage/v1/object/sign/knowledge`, (r) =>
    r.fulfill({ json: r.request().postDataJSON().paths.map((path) => ({ path, signedURL: `/object/sign/knowledge/${path}?token=t`, error: null })) }),
  );
  await context.route(`${SUPABASE}/storage/v1/object/knowledge**`, (r) => {
    knowledgeCalls.push(['storage', r.request().method(), decodeURIComponent(r.request().url())]);
    return r.fulfill({ json: { Key: 'knowledge/x', Id: 'x' } });
  });
  for (const name of ['save_knowledge_item', 'delete_knowledge_item']) {
    await context.route(`${SUPABASE}/rest/v1/rpc/${name}`, (r) => {
      knowledgeCalls.push([name, r.request().postDataJSON()]);
      return r.fulfill({ json: name === 'save_knowledge_item' ? 'k-new' : 'f1/manual.pdf' });
    });
  }
  await context.route(`${SUPABASE}/rest/v1/appointments?**`, (r) => {
    if (r.request().method() !== 'HEAD') return r.fulfill({ json: APPTS });
    // Settings › Schedule counts a service's booked appointments before deleting it.
    const q = new URL(r.request().url()).searchParams;
    sched.push(['count appointments', q.get('service'), q.get('status')]);
    return r.fulfill({ headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range',
      'content-range': `*/${{ 'eq.Private': 312, 'eq.Gyrotonic': 1 }[q.get('service')] ?? 0}` } });
  });
  await context.route(`${SUPABASE}/rest/v1/appointment_clients?**`, (r) => r.fulfill({ json: APPTS.flatMap((a) => a.appointment_clients) }));
  await context.route(`${SUPABASE}/rest/v1/schedule_services?**`, (r) => r.fulfill({ json: SERVICES }));
  await context.route(`${SUPABASE}/rest/v1/schedule_categories?**`, (r) => r.fulfill({ json: SERVICE_CATEGORIES }));
  await context.route(`${SUPABASE}/rest/v1/schedule_settings?**`, (r) => r.fulfill({ json: [{ change_text_minutes: 15 }] }));
  await context.route(`${SUPABASE}/rest/v1/rpc/schedule_instructors`, (r) => r.fulfill({ json: INSTRUCTORS }));
  await context.route(`${SUPABASE}/rest/v1/rpc/schedule_search_clients`, (r) => {
    sched.push(['schedule_search_clients', r.request().postDataJSON()]);
    return r.fulfill({ json: [{ id: 's-leo', full_name: 'Leo Park', phone_last4: '0199' }] });
  });
  for (const name of ['save_appointment', 'move_appointment', 'cancel_appointment', 'set_calendar_color', 'save_schedule_service', 'set_change_text_minutes', 'import_schedule',
    'save_schedule_category', 'delete_schedule_category', 'set_schedule_order', 'delete_schedule_service']) {
    await context.route(`${SUPABASE}/rest/v1/rpc/${name}`, (r) => {
      const body = r.request().postDataJSON();
      sched.push([name, body]);
      if (name === 'save_appointment') return r.fulfill({ json: 'a-new' });
      if (name === 'save_schedule_service' || name === 'save_schedule_category') return r.fulfill({ json: body.p.id ?? `${name}-new` });
      if (name !== 'import_schedule') return r.fulfill({ status: 204 });
      // Rows for instructor "Nobody" fail like an unknown instructor does in the database.
      const bad = body.p_rows.filter((x) => x.instructor === 'Nobody');
      return r.fulfill({ json: { total: body.p_rows.length, importable: body.p_rows.length - bad.length, duplicates: 0, failed: bad.length,
        appointments_new: body.p_rows.length - bad.length, errors: bad.map((x) => ({ row: x.row, reason: 'Instructor not found: Nobody' })) } });
    });
  }
  await context.route('https://i.ytimg.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await context.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>player</p>' }));
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
// Every modal closes with an X at its top right (or Escape / the backdrop); no bottom Cancel button.
const closesTopRight = async (dlg) => {
  const x = dlg.getByRole('button', { name: 'Close', exact: true });
  if ((await x.count()) !== 1 || (await dlg.getByRole('button', { name: 'Cancel', exact: true }).count())) return false;
  const [d, b] = [await dlg.boundingBox(), await x.boundingBox()];
  return d.x + d.width - (b.x + b.width) < 24 && b.y - d.y < 24;
};
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
    check((await navLabels(page)).join() === 'Dashboard,Clients,Schedule,Trainings,Knowledge,Payments,Expenses,Reports,Users,Notifications,Admin access,Schedule settings,Backup', `${device}: owner menu`);
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
  await page.getByRole('button', { name: /^Edit course:/ }).first().waitFor();
  check(!(await page.locator('iframe, input[type="password"]').count()), `${device}: no page-in-page, no second password`);
  const names = await page.getByRole('button', { name: /^Edit course:/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(names.join('|') === 'Edit course: Jumping Stretching Board|Edit course: Gyrotoner® Part 1|Edit course: Old Course', `${device}: courses in schedule order, hidden last`);
  check(await page.getByText('IDs were re-lettered').isVisible(), `${device}: tells the owner the letters changed`);
  check(await page.locator('text=1/1 · Full >> visible=true').first().isVisible(), `${device}: seats shown`);
  check(await page.getByRole('region', { name: 'Hidden' }).isVisible(), `${device}: hidden courses grouped`);
  await page.getByRole('button', { name: 'Edit course: Gyrotoner® Part 1' }).click();
  const panel = page.locator('dialog[open]');
  check(await panel.getByLabel('Early-bird fee', { exact: true }).isVisible(), `${device}: edit panel opens with the early bird`);
  const pbox = await panel.boundingBox();
  check(pbox && pbox.x >= 0 && pbox.x + pbox.width <= width + 1, `${device}: edit panel inside the screen`);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: /Registrants/ }).click();
  await page.getByText('Mina Cho').waitFor();
  check(await page.getByRole('link', { name: 'mina@example.com' }).isVisible(), `${device}: registrant contact links`);
  check(await page.getByText(/Not matched to a current course.*Z - Retired course/).isVisible(), `${device}: unmatched course warning`);
  await page.getByLabel('All courses').selectOption({ label: 'B · Jumping Stretching Board (1)' });
  check((await page.getByText('Leo Park').isVisible()) && !(await page.getByText('Mina Cho').isVisible()), `${device}: course filter`);
  await page.getByRole('button', { name: 'Delete applicant' }).first().click();
  check(await page.getByText('Delete the sign-up from Leo Park?').isVisible(), `${device}: delete applicant asks first`);
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Applicant deleted.').waitFor();
  check(deletedReg === 'r-2', `${device}: delete applicant calls the database function`);
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
    if (device === 'desktop') check((await navLabels(page)).join() === (who === 'STAFF' ? 'Dashboard,Clients,Schedule,Knowledge,Payments' : 'Dashboard,Clients,Knowledge,Payments'), `${who}: menu follows Settings → Admin access defaults (staff also Schedule)`);
    check(await page.getByText('My payments today').isVisible(), `${who} ${device}: my-today card`);
    check(await noOverflow(page), `${who} ${device}: no sideways scroll`);
    check(errors.length === 0, `${who} ${device}: no page errors`);
    await context.close();
  }
  for (const path of ['trainings/', 'users/', 'access/', 'expenses/', 'reports/', 'notifications/', 'backup/']) {
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
  const { page, context, errors } = await open('OWNER', 1280, 'trainings/');
  await page.getByRole('button', { name: /^Edit course:/ }).first().waitFor();
  // Switch saves right away.
  await page.getByRole('switch', { name: 'Show on the site: Old Course' }).check({ force: true });
  await page.getByText('Shown on the site.').waitFor();
  let byName = Object.fromEntries((saved ?? []).map((c) => [c.name_en, c]));
  check(saved?.length === 3 && byName['Old Course']?.active === true, 'switch shows a hidden course right away');
  check(saved?.map((c) => c.code).join() === 'A,B,C', 'saved IDs follow schedule order');
  check(byName['Jumping Stretching Board']?.id === 'c-b' && byName['Old Course']?.id === 'c-c', 'existing courses keep their database id');
  check(!('taken' in (saved?.[0] ?? {})) && !('key' in (saved?.[0] ?? {})) && !('tag_en' in (saved?.[0] ?? {})), 'no screen-only fields sent');

  // Edit panel: early bird off, new instructor, held seat.
  saved = null;
  await page.getByRole('button', { name: 'Edit course: Gyrotoner® Part 1' }).click();
  const panel = page.locator('dialog[open]');
  await panel.getByRole('switch', { name: 'Use an early-bird fee' }).uncheck({ force: true });
  await panel.getByLabel('Conducted by').selectOption({ label: '+ Add instructor' });
  await panel.getByLabel('New instructor name').fill('Pre-Trainer Test');
  await panel.getByRole('button', { name: 'One more' }).nth(1).click();
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Saved. The site shows the change now.').waitFor();
  byName = Object.fromEntries((saved ?? []).map((c) => [c.name_en, c]));
  const g = byName['Gyrotoner® Part 1'];
  check(g?.fee_early === '' && g?.early_until === '', 'early bird switched off is saved empty');
  check(g?.conducted_by === 'Pre-Trainer Test', 'new instructor saved with the course');
  check(g?.held_seats === 1, 'held seat saved');
  check(g?.desc_kr === '한글 설명' && g?.dates === '11/14 - 11/16' && g?.length_days === '3' && /^\d{4}-11-16$/.test(g?.ends_on), 'schedule, days, last day and Korean description kept');
  check(!(await page.locator('dialog[open]').count()), 'panel closes after saving');

  // New course from date pickers; a name is required.
  saved = null;
  await page.getByRole('button', { name: 'Add course' }).click();
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  check(await panel.getByText('Enter the English course name.').isVisible() && saved === null, 'new course needs a name');
  await panel.getByLabel('English', { exact: true }).fill('New Course');
  await panel.getByLabel('First day').fill('2099-03-01');
  await panel.getByLabel('Last day').fill('2099-03-03');
  check(await panel.getByText('3 days · shows as "3/1 - 3/3"').isVisible(), 'schedule summary from the dates');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Saved. The site shows the change now.').waitFor();
  const n = (saved ?? []).find((c) => c.name_en === 'New Course');
  check(n && n.id === '' && n.dates === '3/1 - 3/3' && n.length_days === '3' && n.ends_on === '2099-03-03' && n.capacity === '8', 'new course saved from the date pickers');

  // Delete asks first
  saved = null;
  await page.getByRole('button', { name: 'Edit course: Gyrotoner® Part 1' }).click();
  await panel.getByRole('button', { name: 'Delete course' }).click();
  const confirm = page.locator('dialog[open]').filter({ hasText: 'Delete the course' });
  check(await confirm.getByText('Gyrotoner® Part 1').isVisible(), 'delete asks for confirmation');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Course deleted.').waitFor();
  check(saved?.length === 2 && !saved.some((c) => c.id === 'c-a'), 'deleted course left out of the save');

  // Registrant added by hand
  addedReg = null;
  await page.getByRole('tab', { name: /Registrants/ }).click();
  await page.getByRole('button', { name: 'Add registrant' }).click();
  const add = page.locator('dialog[open]');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  check(await add.getByText('Enter a name and pick at least one course.').isVisible() && addedReg === null, 'hand add needs a name and a course');
  await add.getByLabel('Full name').fill('Jae Lee');
  await add.getByLabel('Phone (optional)').fill('213-555-0100');
  await add.getByRole('checkbox', { name: /Gyrotoner/ }).check();
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByText('Registrant added.').waitFor();
  check(addedReg?.full_name === 'Jae Lee' && addedReg.course_ids.join() === 'c-a' && addedReg.email === '', 'hand add sends name, phone and course');
  check(errors.length === 0, `courses: no page errors ${errors.join(' | ')}`);
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
  await page.getByRole('button', { name: /^Edit course:/ }).first().waitFor();
  check(true, 'try again loads the courses');
  await context.close();
}

// 7. One-time import of the old Google Sheet (CSV downloads)
{
  saved = null;
  imported = null;
  const { page, context, errors } = await open('OWNER', 1280, 'trainings/');
  await page.getByRole('button', { name: /^Edit course:/ }).first().waitFor();
  const coursesCsv =
    'id,name_en,name_kr,dates,tag_en,tag_kr,active,capacity,time,price,desc_en,desc_kr,fee,conducted_by,fee_early,early_until\n' +
    'A,"Level 1, Foundation",기초,12/1 - 12/12,12 days,12일,TRUE,8,,,,,$400,,,\n' +
    'B,Jumping Stretching Board,점핑 보드,,2 days,2일,TRUE,,,,,,,,,\n';
  await page.locator('input[type="file"]').setInputFiles({ name: 'Courses.csv', mimeType: 'text/csv', buffer: Buffer.from(coursesCsv) });
  await page.getByText('Courses added from the file and saved: 1.').waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByText('Courses added from the file and saved: 1.').isVisible(), 'course CSV adds only the new course, saved right away');
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
  check(!(await page.getByRole('button', { name: /Add client|New student|Walk-in/ }).count()) && !(await page.getByText('Recently paid').count()),
    'payments: search only; no add client, walk-in or recently-paid list');
  await page.getByRole('button', { name: 'Save payment' }).click();
  check(await page.getByText('Choose a client.').isVisible() && !calls.length, 'payments: nothing saved without a client');
  check(!(await page.getByRole('tab').count()), 'payments: no Transactions tab for instructors');
  check(!(await page.getByLabel('Payment date').count()), 'payments: instructors record today only (no date field)');
  const day = page.getByRole('region', { name: /^My payments · / });
  await day.getByText('Mina Cho').waitFor();
  check(!(await day.getByText('Leo Park').count()) && !(await day.getByText('Old Friend').count()), "day panel: instructor sees only own payments from today");
  check(await day.locator('dd').first().innerText() === '$100.00', 'day panel: my total for today');
  await page.getByPlaceholder('Search name or phone').fill('mina');
  await page.locator('form').getByRole('button', { name: /Mina Cho/ }).click();
  check((await page.getByLabel('Amount ($)').inputValue()) === '100.00', 'payments: last amount filled in');
  check((await page.getByLabel('Payment method').inputValue()) === 'ZELLE', 'payments: last method picked in the dropdown');
  await page.getByText('Payment history').waitFor();
  check(await page.locator('section[aria-label="Payment history"] li').count() >= 1, "payments: the client's own payment history shows");
  await shot(page, 'phone-record');
  const save = page.getByRole('button', { name: 'Received $100.00 · Zelle · Save' });
  check(await noOverflow(page), 'payments: no sideways scroll on the form');
  await save.click();
  await page.getByText('Payment saved').waitFor();
  check(!(await page.getByRole('button', { name: 'See history' }).count()), 'payments: no history link for instructors');
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
  await page.getByText('No client found. Check the spelling. New clients are added on the Clients screen first.').waitFor();
  check(!(await page.locator('form').getByRole('button', { name: 'Add client' }).count()), 'payments: no add client here; clients are added on the Clients screen');

  // Today's own payments beside the form can be fixed
  await shot(page, 'phone-day-panel');
  await day.getByRole('button', { name: /Mina Cho/ }).click();
  const dialog = page.locator('dialog[open]');
  await shot(page, 'phone-dialog');
  check(await dialog.getByRole('button', { name: 'Edit' }).isVisible() && !(await dialog.getByRole('button', { name: 'Refund' }).count()), 'history: correct today, no refund for staff');
  calls.length = 0;
  await dialog.getByRole('button', { name: 'Void' }).click();
  await dialog.getByRole('button', { name: 'Void' }).click();
  check(await dialog.getByText('Enter a reason.').isVisible() && !calls.length, 'history: void needs a reason');
  await dialog.getByLabel('Reason').fill('entered twice');
  await dialog.getByRole('button', { name: 'Void' }).click();
  await page.getByText('Payment voided.').waitFor();
  check(calls[0]?.[0] === 'void_payment' && calls[0][1].p_id === 'p-1' && calls[0][1].p_reason === 'entered twice', 'history: void sent with reason');
  check(await noOverflow(page), 'day panel: no sideways scroll on the phone');
  check(errors.length === 0, `payments: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 9b. Payments: the day's payments beside the form (owner sees everyone; staff can't open Transactions)
for (const [device, width] of Object.entries(WIDTHS)) {
  const { page, context, errors } = await open('OWNER', width, 'payments/');
  const day = page.getByRole('region', { name: / Payments$/ });
  await day.getByText('Leo Park').waitFor();
  check(await day.getByText('Mina Cho').first().isVisible() && await day.getByText('Ben Yoo').first().isVisible(), `${device} owner: day panel shows everyone's payments`);
  check(await day.locator('dd').first().innerText() === '$230.00', `${device} owner: day panel net total`);
  check(await page.getByText('How to record a payment').isVisible(), `${device} owner: guide card`);
  check(await noOverflow(page), `${device} owner: no sideways scroll on record + day panel`);
  if (device === 'desktop') {
    const [form, panel] = await Promise.all([page.locator('form').boundingBox(), day.boundingBox()]);
    check(panel.x > form.x + form.width && Math.abs(panel.y - form.y) < 4, 'desktop owner: day panel sits right of the form');
  } else {
    const [form, panel] = await Promise.all([page.locator('form').boundingBox(), day.boundingBox()]);
    check(panel.y > form.y + form.height - 1, `${device} owner: day panel stacks below the form`);
  }
  check(await page.getByLabel('Payment date').inputValue() === LA_TODAY, `${device} owner: payment date starts at today`);
  if (device === 'desktop') {
    // Owner records a past day: the date is sent; today is not
    calls.length = 0;
    await page.getByPlaceholder('Search name or phone').fill('mina');
    await page.locator('form').getByRole('button', { name: /Mina Cho/ }).click();
    await page.getByLabel('Payment date').fill(LA_YESTERDAY);
    await page.getByRole('button', { name: /Received \$100\.00/ }).click();
    await page.getByText('Payment saved').waitFor();
    check(calls.find(([n]) => n === 'record_payment')?.[1].p_business_date === LA_YESTERDAY, 'desktop owner: back-dated payment sends the date');
    await page.getByRole('button', { name: 'Record another' }).click();
    check(await page.getByLabel('Payment date').inputValue() === LA_TODAY, 'desktop owner: date resets to today');
    // Edit an existing payment: the owner can move it to another day
    calls.length = 0;
    await day.getByRole('button', { name: /Leo Park/ }).click();
    const dlg = page.locator('dialog[open]');
    await dlg.getByRole('button', { name: 'Edit' }).click();
    check(await dlg.getByText('Edit payment').isVisible() && await dlg.getByLabel('Payment date').inputValue() === LA_TODAY, 'desktop owner: edit shows the payment date');
    await dlg.getByLabel('Payment date').fill(LA_YESTERDAY);
    check(await closesTopRight(dlg), 'desktop owner: edit payment closes with the X top right, no Cancel');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Payment updated.').waitFor();
    check(calls.find(([n]) => n === 'correct_payment')?.[1].p_business_date === LA_YESTERDAY, 'desktop owner: edit sends the new date');
  }
  await shot(page, `${device}-owner-record`);
  await day.getByRole('button', { name: 'All transactions' }).click();
  check(await page.getByRole('tab', { name: 'Transactions' }).getAttribute('aria-selected') === 'true', `${device} owner: All transactions opens the tab`);
  check(errors.length === 0, `${device} owner record: no page errors ${errors.join(' | ')}`);
  await context.close();
}
{
  const { page, context } = await open('STAFF', 1280, 'payments/?tab=history');
  await page.getByPlaceholder('Search name or phone').waitFor();
  check(!(await page.getByRole('tab').count()) && !(await page.getByText('Net revenue').count()), 'staff: ?tab=history still shows only the form and own day panel');
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
    check(await closesTopRight(dialog), 'add expense: closes with the X top right, no Cancel');
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

// 13. Owner dashboard: this month's money and 12 months of revenue vs expenses
for (const [device, width] of Object.entries(WIDTHS)) {
  finance.length = 0;
  const { page, context, errors } = await open('OWNER', width);
  const month = page.locator('section', { hasText: 'This month' });
  await month.getByText('$19,800.00').waitFor();
  check(await month.getByText('Expenses ($3,000.00 unpaid)').isVisible() && await month.getByText('$11,800.00').isVisible(), `${device} dashboard: this month's expenses and profit`);
  check(finance.some(([, b]) => b.p_from === MONTH && b.p_to === LA_TODAY), `${device} dashboard: this month asked up to today`);
  check((await page.locator('main figure ul > li').count()) === 12, `${device} dashboard: 12 months in the chart`);
  check(await page.locator('main figcaption').getByText('Operating expenses').isVisible(), `${device} dashboard: chart legend`);
  check(await noOverflow(page), `${device} dashboard: no sideways scroll`);
  await shot(page, `${device}-dashboard`);
  check(errors.length === 0, `${device} dashboard: no page errors ${errors.join(' | ')}`);
  await context.close();
}
{
  finance.length = 0;
  const { page, context } = await open('INSTRUCTOR', 1280);
  check(!(await page.getByText('This month', { exact: true }).count()) && finance.length === 0, 'instructor dashboard: no studio finances asked or shown');
  await context.close();
}

// 14. Reports overview: statement, breakdowns, year view, CSV
for (const [device, width] of Object.entries(WIDTHS)) {
  finance.length = 0;
  const { page, context, errors } = await open('OWNER', width, 'reports/');
  const main = page.locator('main');
  await main.getByText('Gross revenue').waitFor();
  check((await page.locator('h1').innerText()) === 'Reports', `${device} reports: title`);
  const statement = await main.locator('dl').first().innerText();
  check(['$20,000.00', '$200.00', '$19,800.00', '$8,000.00', '$11,800.00', 'paid $5,000.00 · unpaid $3,000.00'].every((x) => statement.includes(x)), `${device} reports: statement`);
  check(await main.getByText(/management estimate, not your bank balance/).isVisible(), `${device} reports: basis explained`);
  check(await main.getByText('Zelle').isVisible() && await main.getByText('Salary').isVisible() && await main.getByText('Ana Park').isVisible(), `${device} reports: breakdowns named`);
  check(finance.some(([, b]) => b.p_from === MONTH), `${device} reports: opens on this month`);
  check(await noOverflow(page), `${device} reports: no sideways scroll`);
  await shot(page, `${device}-reports`);
  await page.getByRole('radio', { name: 'Year' }).click();
  await main.locator('table').waitFor();
  check((await main.locator('tbody tr').count()) === 13, `${device} reports: year table, 12 months + total`);
  check(finance.some(([, b]) => b.p_from === `${MONTH.slice(0, 4)}-01-01` && b.p_to === `${MONTH.slice(0, 4)}-12-31`), `${device} reports: year range`);
  check(await noOverflow(page), `${device} reports: year view no sideways scroll`);
  await shot(page, `${device}-reports-year`);
  if (device === 'desktop') {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    const csv = (await import('node:fs')).readFileSync(await download.path(), 'utf8');
    check(download.suggestedFilename() === `report-${MONTH.slice(0, 4)}.csv` && csv.includes('Gross revenue,20000') && csv.includes('Estimated operating profit,11800')
      && csv.includes('Salary,3500,2') && csv.includes('Month,Net revenue'), 'reports: CSV has summary, breakdowns and months');
  }
  check(errors.length === 0, `${device} reports: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 15. Monthly closing: last month by default, four checks, close, reopen with a reason
for (const [device, width] of [['phone', 393], ['desktop', 1280]]) {
  finance.length = 0;
  periodClosed = false;
  const { page, context, errors } = await open('OWNER', width, 'reports/?tab=closing');
  const main = page.locator('main');
  await main.getByText('Review payments').waitFor();
  check(finance.some(([, b]) => b.p_from === LAST_MONTH), `${device} closing: last month by default`);
  check(await main.getByText('131 payments · gross $20,000.00').isVisible(), `${device} closing: payments step`);
  check(await main.getByText(/^1 estimated amounts/).isVisible() && await main.getByText(/^2 unpaid \(\$3,000\.00\)/).isVisible(), `${device} closing: estimate and unpaid notes`);
  const closeBtn = main.getByRole('button', { name: /^Close / });
  check(await closeBtn.isDisabled(), `${device} closing: close needs all four checks`);
  for (const box of await main.getByRole('checkbox', { name: 'Checked' }).all()) await box.check();
  check(await closeBtn.isEnabled(), `${device} closing: enabled after four checks`);
  check(await noOverflow(page), `${device} closing: no sideways scroll`);
  await shot(page, `${device}-closing`);
  await closeBtn.click();
  const dialog = page.locator('dialog[open]');
  check(await dialog.getByText(/will be locked/).isVisible(), `${device} closing: confirm says what gets locked`);
  await dialog.getByRole('button', { name: /^Close / }).click();
  await main.getByText(/is closed\.$/).waitFor();
  check(finance.find(([f]) => f === 'close_period')?.[1].p_month === LAST_MONTH, `${device} closing: close_period for last month`);
  await main.getByText(/^Closed by/).waitFor({ timeout: 5000 }).catch(() => {});
  check(await main.getByText(/^Closed by Calvin Kim · .* · version 1$/).isVisible(), `${device} closing: who closed it`);
  await main.getByRole('button', { name: 'Reopen' }).click();
  const reopen = page.locator('dialog[open]');
  await reopen.getByRole('button', { name: 'Reopen' }).click();
  check(await reopen.getByText('Enter a reason.').isVisible(), `${device} closing: reopen needs a reason`);
  await reopen.getByLabel('Reason').fill('Fix a typo');
  await reopen.getByRole('button', { name: 'Reopen' }).click();
  await main.getByText(/is open again\.$/).waitFor();
  check(finance.find(([f]) => f === 'reopen_period')?.[1].p_reason === 'Fix a typo', `${device} closing: reopen reason sent`);
  await main.getByText(/^Reopened /).waitFor({ timeout: 5000 }).catch(() => {});
  check(await main.getByText(/^Reopened .*: Fix a typo$/).isVisible(), `${device} closing: last reopen shown`);
  await main.getByRole('button', { name: 'Next month' }).click();
  await main.getByText(/can be closed after it ends\.$/).waitFor();
  check(await main.getByRole('button', { name: /^Close / }).isDisabled(), `${device} closing: this month cannot be closed`);
  check(errors.length === 0, `${device} closing: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 16. Users: add with details + several roles (invite or password), edit, delete rules
{
  adminCalls.length = 0;
  calls.length = 0;
  const { page, context, errors } = await open('OWNER', 393, 'users/');
  await page.getByText('Ana Park').waitFor();
  check(await page.getByRole('button', { name: 'Add user' }).isVisible(), 'users: button says Add user');
  check(await page.locator('main ul').getByText('Admin', { exact: true }).isVisible(), 'users: role chips include Admin');
  await page.getByRole('button', { name: 'Add user' }).click();
  const dlg = page.locator('dialog[open]');
  for (const label of ['Email', 'Full name', 'Phone', 'Address', 'Certifications']) {
    check(await dlg.getByLabel(label, { exact: true }).isVisible(), `add user: ${label} field`);
  }
  await dlg.getByLabel('Email', { exact: true }).fill('new@example.com');
  await dlg.getByLabel('Full name', { exact: true }).fill('Nina New');
  await dlg.getByLabel('Phone', { exact: true }).fill('310-555-0111');
  await dlg.getByLabel('Certifications', { exact: true }).fill('Pilates Level 2');
  await dlg.getByLabel('Staff', { exact: true }).check();
  check(await dlg.getByLabel('Pricing tier').isVisible(), 'add user: tier shows while Instructor is ticked');
  check(await dlg.getByLabel('Send an invitation email').isChecked(), 'add user: invitation is the default');
  check(await closesTopRight(dlg), 'add user: closes with the X top right, no Cancel');
  check(await noOverflow(page), 'add user: dialog fits the phone');
  await dlg.getByRole('button', { name: 'Send invitation' }).click();
  await page.getByText('Invitation sent to Nina New.').waitFor();
  const inv = adminCalls.at(-1);
  check(inv?.action === 'invite' && inv.email === 'new@example.com' && inv.profile.roles.join() === 'STAFF,INSTRUCTOR'
    && inv.profile.phone === '310-555-0111' && /\/staging\/admin\/set-password\/$/.test(inv.redirectTo), 'add user: invite carries details, both roles, return link');

  await page.getByRole('button', { name: 'Add user' }).click();
  await dlg.getByLabel('Email', { exact: true }).fill('pw@example.com');
  await dlg.getByLabel('Full name', { exact: true }).fill('Pat Password');
  await dlg.getByLabel('Set a password now').check();
  await dlg.getByRole('button', { name: 'Add user' }).click();
  check(await dlg.getByText('Use a password of at least 8 characters').isVisible() || await dlg.getByText(/at least 8/).first().isVisible(), 'add user: password mode needs a password');
  await dlg.getByLabel('First password').fill('Temp-pass-123');
  await dlg.getByRole('button', { name: 'Add user' }).click();
  await page.getByText('Pat Password can now sign in to the portal.').waitFor();
  check(adminCalls.at(-1)?.action === 'create' && adminCalls.at(-1)?.password === 'Temp-pass-123', 'add user: password mode creates the login');

  await page.getByRole('button', { name: 'Edit user: Ana Park' }).click();
  check(await dlg.getByText('ana@example.com').isVisible(), 'edit user: email shown, not editable');
  await dlg.getByLabel('Address', { exact: true }).fill('1 Main St, Los Angeles');
  await dlg.getByLabel('Admin', { exact: true }).check();
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Saved.').waitFor();
  const upd = calls.find(([n]) => n === 'update_staff_user')?.[1];
  check(upd?.p_user_id === 'u-ins' && upd.p.roles.join() === 'ADMIN,INSTRUCTOR' && upd.p.address === '1 Main St, Los Angeles', 'edit user: saves details and roles');

  await page.getByRole('button', { name: 'Edit user: Ana Park' }).click();
  await dlg.getByRole('button', { name: 'Delete user' }).click();
  await page.locator('dialog[open]').last().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText(/has records in the studio books/).waitFor();
  check(true, 'delete: user with records is told to deactivate instead');
  await page.getByRole('button', { name: 'Delete user: Ana Park' }).click();
  check(await page.locator('dialog[open]').last().getByRole('button', { name: 'Delete', exact: true }).isVisible(), 'delete button on the user row asks first');
  check(await closesTopRight(page.locator('dialog[open]').last()), 'delete user: confirm has the X top right, no Cancel');
  await page.locator('dialog[open]').last().getByRole('button', { name: 'Close', exact: true }).click();
  check(await page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 2000 }).then(() => true, () => false), 'delete user: the X closes the confirm');
  check(!(await page.getByRole('button', { name: 'Delete user: Calvin Kim' }).count()), 'no delete button on my own row');
  check(await page.getByRole('button', { name: 'Edit user: Calvin Kim' }).isVisible(), 'owner can edit own row');
  check(errors.length === 0, `users: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 17. Admin: every menu, but owners are off limits
{
  const { page, context, errors } = await open('ADMIN', 1280, 'users/');
  await page.getByText('Ana Park').waitFor();
  check((await navLabels(page)).join() === 'Dashboard,Clients,Schedule,Trainings,Knowledge,Payments,Expenses,Reports,Users,Notifications,Admin access,Schedule settings,Backup', 'admin: full menu');
  check(!(await page.getByRole('button', { name: 'Edit user: Calvin Kim' }).count()), 'admin: cannot edit the owner');
  check(await page.getByRole('button', { name: 'Edit user: Ana Park' }).isVisible(), 'admin: can edit others');
  await page.getByRole('button', { name: 'Add user' }).click();
  check(await page.locator('dialog[open]').getByLabel('Owner', { exact: true }).isDisabled(), 'admin: cannot hand out the owner role');
  check(errors.length === 0, `admin: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 18. Settings → Admin: switching a menu off for instructors
{
  resetAccess();
  calls.length = 0;
  const { page, context, errors } = await open('OWNER', 393, 'access/');
  await page.getByRole('switch', { name: 'Instructor: Payments' }).waitFor();
  check(await page.getByRole('switch', { name: 'Staff: Schedule' }).isChecked(), 'access: staff schedule on by default');
  check(!(await page.getByRole('switch', { name: 'Instructor: Schedule' }).isChecked()), 'access: instructor schedule off by default');
  check(!(await page.getByRole('switch', { name: /Expenses/ }).count()), 'access: expenses is owners/admins only');
  check(await noOverflow(page), 'access: table fits the phone');
  await page.getByRole('switch', { name: 'Instructor: Payments' }).uncheck();
  await page.getByText(/applies the next time/).waitFor();
  const c = calls.find(([n]) => n === 'set_role_menu_access')?.[1];
  check(c?.p_role === 'INSTRUCTOR' && c.p_menu === 'payments' && c.p_on === false, 'access: switch saved');
  check(errors.length === 0, `access: no page errors ${errors.join(' | ')}`);
  await context.close();

  const ins = await open('INSTRUCTOR', 1280);
  check((await navLabels(ins.page)).join() === 'Dashboard,Clients,Knowledge', 'access: instructor loses Payments');
  check(!(await ins.page.getByText('My payments today').count()), 'access: no payments card without Payments');
  await ins.context.close();
  const pay = await open('INSTRUCTOR', 1280, 'payments/');
  await pay.page.waitForURL(/\/admin\/$/);
  check(true, 'access: payments page redirects when switched off');
  await pay.context.close();
  resetAccess();

  // Clients is view-only for instructors
  const cl = await open('INSTRUCTOR', 1280, 'clients/');
  await cl.page.getByText('Mina Cho').first().waitFor();
  check(!(await cl.page.getByRole('button', { name: /Import/ }).count()), 'clients: no import for instructors');
  // Clients access (Settings › Admin access) lets instructors add a client: name and phone only
  calls.length = 0;
  await cl.page.getByRole('button', { name: 'Add client' }).click();
  const addDlg = cl.page.locator('dialog[open]');
  check(await addDlg.getByLabel('Full name').isVisible() && !(await addDlg.getByLabel('Email').count()), 'clients: instructor adds with name and phone only');
  await addDlg.getByLabel('Full name').fill('Zoe Han');
  await addDlg.getByLabel('Phone').fill('310-555-0123');
  await addDlg.getByRole('button', { name: 'Add client' }).click();
  await addDlg.waitFor({ state: 'detached' });
  check(calls.some(([n, b]) => n === 'add_student' && b.p_full_name === 'Zoe Han') && !calls.some(([n]) => n === 'update_member'), 'clients: instructor add saves the client only');
  await cl.context.close();
}

// 20. Notifications settings (preview): grouped events, one switch per channel
for (const [device, width] of Object.entries(WIDTHS)) {
  const { page, context, errors } = await open('OWNER', width, 'notifications/');
  const sw = page.getByRole('switch', { name: 'New payment: Email' });
  await sw.waitFor();
  check((await page.getByRole('switch').count()) === 16, `${device} notifications: 8 events × email/text`);
  check(!(await sw.isChecked()), `${device} notifications: new payment email off by default`);
  await sw.click({ force: true });
  check(await sw.isChecked(), `${device} notifications: switch turns on`);
  check(await page.getByText(/Preview: the portal does not send notifications yet/).isVisible(), `${device} notifications: says nothing is sent or saved`);
  check(await noOverflow(page), `${device} notifications: no sideways scroll`);
  await shot(page, `${device}-notifications`);
  check(errors.length === 0, `${device} notifications: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 19. Dark mode: toggle in the top bar, remembered
{
  const { page, context, errors } = await open('OWNER', 393);
  await page.getByRole('button', { name: 'Dark mode' }).click();
  check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark: class on <html>');
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('main').parentElement.parentElement).backgroundColor);
  check(bg === 'rgb(18, 17, 15)', `dark: page background is dark (${bg})`);
  await page.reload();
  await page.waitForLoadState('networkidle');
  check(await page.getByRole('button', { name: 'Light mode' }).isVisible(), 'dark: remembered after reload');
  check(await noOverflow(page), 'dark: no sideways scroll');
  await page.getByRole('button', { name: 'Light mode' }).click();
  check(!(await page.evaluate(() => document.documentElement.classList.contains('dark'))), 'dark: back to light');
  check(errors.length === 0, `dark: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 21. Knowledge library: everyone reads, owners/admins add, edit, remove
for (const [device, width] of Object.entries(WIDTHS)) {
  const { page, context, errors } = await open('INSTRUCTOR', width, 'knowledge/');
  await page.getByText('Reformer footwork').waitFor();
  check((await page.locator('h1').innerText()) === 'Knowledge', `${device} knowledge: instructor opens the library`);
  check((await page.locator('main li').count()) === 3, `${device} knowledge: three items`);
  check(!(await page.getByRole('button', { name: /Add item|Edit item/ }).count()), `${device} knowledge: instructor cannot add or edit`);
  const pdf = page.getByRole('link', { name: 'Open', exact: true });
  check((await pdf.getAttribute('href'))?.includes('/storage/v1/object/sign/knowledge/f1/manual.pdf?token='), `${device} knowledge: file opens through a signed link`);
  await page.getByRole('button', { name: 'Gyrotonic' }).click();
  check((await page.locator('main li').count()) === 2 && !(await page.getByText('Reformer footwork').count()), `${device} knowledge: category filter`);
  await page.getByLabel('Type').selectOption('VIDEO');
  check((await page.locator('main li').count()) === 1, `${device} knowledge: type filter`);
  await page.getByRole('button', { name: 'Gyrotonic' }).click();
  await page.getByRole('button', { name: /^All\s*\d/ }).click();
  await page.getByLabel('Search title or description').fill('week 1');
  check((await page.locator('main li').count()) === 1, `${device} knowledge: search finds description`);
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  const player = page.locator('dialog[open] iframe');
  check((await player.getAttribute('src')) === 'https://www.youtube-nocookie.com/embed/abcDEF12345?rel=0', `${device} knowledge: YouTube plays inside the portal`);
  check(await noOverflow(page), `${device} knowledge: no sideways scroll`);
  await shot(page, `${device}-knowledge-player`);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Search title or description').fill('');
  await shot(page, `${device}-knowledge`);
  check(errors.length === 0, `${device} knowledge: no page errors ${errors.join(' | ')}`);
  await context.close();
}
{
  knowledgeCalls.length = 0;
  const { page, context, errors } = await open('ADMIN', 1280, 'knowledge/');
  await page.getByText('Arch and curl').waitFor();
  await page.getByRole('button', { name: 'Watch: Arch and curl' }).click();
  check((await page.locator('dialog[open] iframe').getAttribute('src')) === 'https://player.vimeo.com/video/123456789?h=abcdef1234', 'knowledge: unlisted Vimeo link plays');
  await page.keyboard.press('Escape');
  // Add a link
  await page.getByRole('button', { name: 'Add item' }).click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByRole('button', { name: 'Save' }).click();
  check(await dlg.getByText('Enter a title.').isVisible() && await dlg.getByText('Enter a link that starts with https://').isVisible(), 'knowledge: title and link required');
  await dlg.getByLabel('Title').fill('Spine stretch');
  await dlg.getByLabel('Link').fill('https://youtu.be/xyz987654');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Saved to the library.').waitFor();
  const add = knowledgeCalls.find(([n]) => n === 'save_knowledge_item')?.[1].p;
  check(add?.audience === 'ALL' && add.title === 'Spine stretch' && add.link_url === 'https://youtu.be/xyz987654' && add.category === 'PILATES' && add.kind === 'VIDEO' && add.id === null, 'knowledge: link saved');
  // Upload a file
  knowledgeCalls.length = 0;
  await page.getByRole('button', { name: 'Add item' }).click();
  await dlg.getByRole('button', { name: 'Upload a file' }).click();
  await dlg.getByLabel('Category').selectOption('GYROTONIC');
  await dlg.getByLabel('File').setInputFiles({ name: 'Level 2 handout.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  check((await dlg.getByLabel('Title').inputValue()) === 'Level 2 handout' && (await dlg.getByLabel('Type').inputValue()) === 'DOCUMENT', 'knowledge: file name fills title and type');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Saved to the library.').waitFor();
  const up = knowledgeCalls.find(([n]) => n === 'storage');
  const saved = knowledgeCalls.find(([n]) => n === 'save_knowledge_item')?.[1].p;
  check(up?.[1] === 'POST' && /\/object\/knowledge\/[\w-]{36}\/Level-2-handout\.pdf$/.test(up[2]), `knowledge: file uploaded to the private bucket (${up?.[2]})`);
  check(saved?.file_path && up[2].endsWith(saved.file_path) && saved.file_name === 'Level 2 handout.pdf' && saved.category === 'GYROTONIC', `knowledge: file item saved ${JSON.stringify(saved)}`);
  // Too big
  await page.getByRole('button', { name: 'Add item' }).click();
  await dlg.getByRole('button', { name: 'Upload a file' }).click();
  const big = `${(await import('node:os')).tmpdir()}/long.mp4`;
  (await import('node:fs')).writeFileSync(big, Buffer.alloc(50 * 1024 * 1024 + 1));
  await dlg.getByLabel('File').setInputFiles(big);
  await dlg.getByRole('button', { name: 'Save' }).click();
  check(await dlg.getByText(/over 50 MB/).isVisible(), 'knowledge: over 50 MB asks for a link');
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  // Only for chosen people
  check(await page.getByText('Selected · 2').isVisible(), 'knowledge: card shows it is for selected people');
  knowledgeCalls.length = 0;
  await page.getByRole('button', { name: 'Edit item: Reformer footwork' }).click();
  await dlg.getByRole('button', { name: 'Selected people' }).click();
  await dlg.getByRole('button', { name: 'Save' }).click();
  check(await dlg.getByText('Choose at least one person.').isVisible(), 'knowledge: selected needs someone');
  await dlg.getByLabel('Ana Park').check();
  await dlg.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Saved to the library.').waitFor();
  const priv = knowledgeCalls.find(([n]) => n === 'save_knowledge_item')?.[1].p;
  check(priv?.id === 'k-1' && priv.audience === 'SELECTED' && priv.viewer_ids.join() === 'u-ins', 'knowledge: saved for Ana only');
  // Edit and remove
  knowledgeCalls.length = 0;
  await page.getByRole('button', { name: 'Edit item: Gyrotonic Level 1 manual' }).click();
  check(await dlg.getByText(/stays the same/).isVisible(), 'knowledge: edit says the source stays');
  check(await dlg.getByRole('button', { name: 'Selected people' }).getAttribute('aria-pressed') === 'true'
    && await dlg.getByLabel('Ana Park').isChecked() && await dlg.getByLabel('Sam Lee').isChecked()
    && !(await dlg.getByLabel('Ada Admin').count()), 'knowledge: edit shows the chosen people (no owners/admins to pick)');
  await dlg.getByRole('button', { name: 'Remove', exact: true }).click();
  await dlg.getByRole('button', { name: 'Remove for good' }).click();
  await page.getByText('"Gyrotonic Level 1 manual" removed.').waitFor();
  check(knowledgeCalls[0]?.[0] === 'delete_knowledge_item' && knowledgeCalls[0][1].p_id === 'k-2', 'knowledge: remove calls the database');
  check(knowledgeCalls.some(([n, m]) => n === 'storage' && m === 'DELETE'), 'knowledge: removing deletes the file');
  check(errors.length === 0, `knowledge admin: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 20. Sidebar stands apart from the page (light and dark)
{
  const { page, context } = await open('OWNER', 1280);
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') await page.getByRole('button', { name: 'Dark mode' }).click();
    const [side, canvas] = await page.evaluate(() => [
      getComputedStyle(document.querySelector('aside')).backgroundColor,
      getComputedStyle(document.querySelector('main').parentElement.parentElement).backgroundColor,
    ]);
    check(side !== canvas, `sidebar ${mode}: own background (${side} vs ${canvas})`);
    await shot(page, `desktop-sidebar-${mode}`);
  }
  await page.getByRole('button', { name: 'Light mode' }).click();
  await context.close();
}

// 21. Settings → Backup: owner downloads clients, payments and everything as files
{
  const { page, context, errors } = await open('OWNER', 1280, 'backup/');
  check((await page.locator('h1').innerText()) === 'Backup', 'backup: page opens');
  await page.getByRole('button', { name: 'Prepare backup' }).click();
  await page.getByText(`Ready: ${MEMBERS.length} clients, ${PAYMENTS.length} payments, ${APPTS.length} appointments.`).waitFor();
  check(true, 'backup: counts what it read');
  const fs = await import('node:fs');
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const grab = async (name) => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
    return [download.suggestedFilename(), fs.readFileSync(await download.path(), 'utf8')];
  };
  const [clientsName, clients] = await grab('Clients (CSV)');
  check(clientsName === `clients-${day}.csv` && clients.startsWith('\ufeff') && clients.split('\n')[0].split(',').includes('full_name') && clients.includes('Mina Cho') && clients.includes('(213) 555-0142'),
    'backup: clients CSV with every column (Excel-ready)');
  check(clients.includes('"[""Private with Sunnie""]"'), 'backup: list columns kept as JSON');
  const [paymentsName, payments] = await grab('Payments (CSV)');
  check(paymentsName === `payments-${day}.csv` && payments.split('\n')[0].includes('amount_cents') && payments.includes('REFUND'),
    'backup: payments CSV includes refunds and every column');
  const [fullName, full] = await grab('Everything (JSON)');
  const json = JSON.parse(full);
  check(fullName === `backup-${day}.json` && json.students.length === MEMBERS.length && json.payment_transactions.length === PAYMENTS.length
    && json.payment_methods.length === METHODS.length && Array.isArray(json.accounting_periods) && json.exported_at,
    'backup: JSON holds clients and payments');
  check(json.appointments.length === APPTS.length && json.schedule_services.length === SERVICES.length
    && json.schedule_categories.length === SERVICE_CATEGORIES.length && json.schedule_settings.length === 1
    && json.schedule_instructors.length === INSTRUCTORS.length && json.staff.length === Object.keys(PEOPLE).length,
    'backup: JSON holds the schedule, services, categories, settings and staff');
  // Every table the migrations create is in the file (or deliberately left out).
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const made = [...new Set(fs.readdirSync(dir)
    .flatMap((f) => [...fs.readFileSync(new URL(f, dir), 'utf8').matchAll(/create table public\.(\w+)/g)].map((m) => m[1])))];
  const missing = made.filter((t) => !['audit_logs', 'staff_profiles'].includes(t) && !Array.isArray(json[t]));
  check(made.length > 15 && !missing.length, `backup: every table is in the JSON (missing: ${missing.join(', ') || 'none'})`);
  check(await page.getByText(/client names and phone numbers/).isVisible(), 'backup: warns the files are private');
  await shot(page, 'desktop-backup');
  await page.setViewportSize({ width: 393, height: 852 });
  check(await noOverflow(page), 'backup phone: no sideways scroll');
  await shot(page, 'phone-backup');
  check(errors.length === 0, `backup: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 22. Schedule: studio time whatever the browser's zone, edit, drag to move + Undo, cancel / no-show; who may open it
{
  sched.length = 0;
  const { page, context, errors } = await open('OWNER', 1280, 'schedule/', { timezoneId: 'Asia/Seoul' });
  check((await page.locator('h1').innerText()) === 'Schedule', 'schedule: page opens on the week');
  const mina = page.getByRole('button', { name: /Mina Cho - Private/ });
  await mina.waitFor();
  check((await mina.innerText()).includes('9:00 - 9:50'), 'schedule: 9:00 studio time shows as 9:00 in a Seoul browser');
  const group = page.getByRole('button', { name: /2\/5 - Pilates Group/ });
  check(await group.isVisible(), 'schedule: group shows booked/capacity, cancelled booking not counted');
  const workshop = page.getByRole('button', { name: /^12:00 - 2:00\s*Workshop/ });
  check(await workshop.isVisible(), 'schedule: studio event without instructor');
  const [m, g] = [await mina.boundingBox(), await group.boundingBox()];
  check(Math.abs(m.y - g.y) < 1 && Math.abs(m.x - g.x) > 10, 'schedule: same-time blocks sit side by side');

  // Edit: saving sends studio wall-clock text and keeps the booking.
  await mina.click();
  await page.getByRole('heading', { name: 'Edit Appointment' }).waitFor();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Edit Appointment' }).waitFor({ state: 'detached' });
  const p = sched.find(([n]) => n === 'save_appointment')?.[1]?.p;
  check(p?.id === 'a-1' && p.start === `${LA_TODAY} 09:00` && p.minutes === 50 && p.staff_id === 'i-sun' && p.scope === 'one'
    && p.clients.length === 1 && p.clients[0].id === 'b-1' && p.clients[0].student_id === 's-mina', 'schedule: edit saves 09:00 studio time, booking kept');

  // Close X instead of a Cancel button; Cancel Appointment stands out (danger). Duration steps by 5 with − / +.
  sched.length = 0;
  await mina.click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByRole('heading', { name: 'Edit Appointment' }).waitFor();
  check(await dlg.getByRole('button', { name: 'Close' }).isVisible() && !(await dlg.getByRole('button', { name: 'Cancel', exact: true }).count()),
    'schedule: edit dialog has a Close X and no Cancel button');
  check((await dlg.getByRole('button', { name: 'Cancel Appointment' }).getAttribute('class')).includes('bg-red-700'), 'schedule: Cancel Appointment is a danger button');
  await dlg.getByRole('button', { name: '5 minutes longer' }).click();
  check(await dlg.getByText('to 9:55 am').isVisible(), 'schedule: + makes it 55 minutes, the end time follows');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  check(sched.find(([n]) => n === 'save_appointment')?.[1]?.p?.minutes === 55, 'schedule: + then Save sends 55 minutes');
  sched.length = 0;
  await mina.click();
  await dlg.getByLabel('Duration').fill('80');
  check(await dlg.getByText('(1 hr 20 min)').isVisible() && await dlg.getByText('to 10:20 am').isVisible(), 'schedule: typing 80 shows (1 hr 20 min) and the end time');

  // Services grouped by category; only what the chosen instructor teaches.
  const offered = () => dlg.getByLabel('Service').evaluate((el) => [...el.options].map((o) => o.value));
  check((await offered()).includes('Private') && !(await offered()).includes('Gyrotonic Group'), 'schedule: Sunnie Lee is not offered Gyrotonic Group');
  await dlg.getByLabel('Instructor').selectOption({ label: 'Su kyung YI' });
  check((await offered()).includes('Gyrotonic Group'), 'schedule: Su kyung YI is offered Gyrotonic Group');
  const groups = await dlg.getByLabel('Service').evaluate((el) => [...el.querySelectorAll('optgroup')].map((g) => `${g.label}: ${[...g.children].map((o) => o.value).join(', ')}`));
  check(groups.join(' | ') === 'Individual Classes: Private, Gyrotonic | Pilates Classes: Pilates Group | Gyrotonic Classes: Gyrotonic Group',
    `schedule: services grouped by category in order ${groups.join(' | ')}`);
  await dlg.getByLabel('Service').selectOption('Gyrotonic Group');
  await dlg.getByLabel('Instructor').selectOption({ label: 'Sunnie Lee' });
  check(await dlg.getByLabel('Service').inputValue() === 'Private', 'schedule: switching to an instructor who does not teach the service picks one they do');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await dlg.waitFor({ state: 'detached' });
  check(!sched.some(([n]) => n === 'save_appointment'), 'schedule: the Close X closes without saving');

  // Drag the 2-hour workshop down one hour: the Close X puts it back; drag again, confirm, then Undo.
  const w = await workshop.boundingBox();
  const dragDown = async () => {
    await page.mouse.move(w.x + w.width / 2, w.y + 20);
    await page.mouse.down();
    await page.mouse.move(w.x + w.width / 2, w.y + 20 + w.height / 4, { steps: 6 });
    await page.mouse.move(w.x + w.width / 2, w.y + 20 + w.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('heading', { name: 'Move Event' }).waitFor();
  };
  await dragDown();
  check(!(await dlg.getByRole('button', { name: 'Cancel', exact: true }).count()), 'schedule: move dialog has no Cancel button');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await dlg.waitFor({ state: 'detached' });
  check(!(await page.locator('[data-grid] button[aria-hidden="true"]').count()) && (await workshop.evaluate((el) => getComputedStyle(el).opacity)) === '1'
    && !sched.some(([n]) => n === 'move_appointment'), 'schedule: Close X on the move dialog brings the block back, nothing sent');
  await dragDown();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).waitFor();
  const mv = sched.filter(([n]) => n === 'move_appointment').map(([, b]) => b);
  check(mv[0]?.p_id === 'a-3' && mv[0].p_start === `${LA_TODAY} 13:00` && mv[0].p_scope === 'one', 'schedule: drag one hour down moves to 13:00 studio time');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(300);
  const undo = sched.filter(([n]) => n === 'move_appointment').map(([, b]) => b)[1];
  check(undo?.p_id === 'a-3' && undo.p_start === `${LA_TODAY} 12:00` && undo.p_series_changed === false, 'schedule: Undo puts it back at 12:00');

  // Cancel asks first, then cancels (never deletes).
  await workshop.click();
  await page.getByRole('heading', { name: 'Edit Event' }).waitFor();
  await page.getByRole('button', { name: 'Cancel Event' }).click();
  await page.getByText('Take it off the calendar?').waitFor();
  check(!sched.some(([n]) => n === 'cancel_appointment'), 'schedule: cancel asks before doing anything');
  await page.getByRole('button', { name: 'Cancel Event' }).click();
  await page.getByRole('heading', { name: 'Edit Event' }).waitFor({ state: 'detached' });
  const c = sched.find(([n]) => n === 'cancel_appointment')?.[1];
  check(c?.p_id === 'a-3' && c.p_scope === 'one', 'schedule: cancel sends the appointment');

  // Late cancel: striped block, the hover details say so; the cancel step can mark it instead of removing it.
  const late = page.getByRole('button', { name: /Kai Moon - Private/ });
  const noShow = page.getByRole('button', { name: /Rio Song - Private/ });
  const stripes = (el) => getComputedStyle(el).backgroundImage.includes('repeating-linear-gradient');
  check(await late.evaluate(stripes) && await noShow.evaluate(stripes) && !(await mina.evaluate((el) => getComputedStyle(el).backgroundImage)).includes('gradient'),
    'schedule: late cancel and no-show are striped, others are not');
  await late.hover();
  await page.getByText('Late cancel', { exact: true }).waitFor();
  await shot(page, 'schedule-week-late-cancel');
  check(true, 'schedule: hover details say Late cancel');
  await noShow.hover();
  await page.getByText('No-show', { exact: true }).waitFor();
  check(!(await page.getByText('Late cancel', { exact: true }).count()), 'schedule: hover details say No-show for a no-show');
  await page.mouse.move(5, 5);

  // No-show from the cancel step: every booking marked, the class stays on the calendar.
  sched.length = 0;
  await group.click();
  await dlg.getByRole('button', { name: 'Cancel Class' }).click();
  await dlg.getByText(/Late cancel and No-show keep it on the calendar/).waitFor();
  const steps = await dlg.locator('div', { has: page.getByText('Take it off the calendar?') }).last().getByRole('button').allInnerTexts();
  check(steps.join(' · ') === 'Keep it · No-show · Late cancel · Cancel Class', `schedule: cancel step buttons in order (${steps.join(' · ')})`);
  await dlg.getByRole('button', { name: 'No-show', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  const ns = sched.find(([n]) => n === 'save_appointment')?.[1]?.p;
  check(ns?.id === 'a-2' && ns.clients.length === 2 && ns.clients.every((x) => x.status === 'NO_SHOW') && !sched.some(([n]) => n === 'cancel_appointment'),
    'schedule: No-show keeps the class and marks every booking');
  sched.length = 0;
  await mina.click();
  await page.getByRole('button', { name: 'Cancel Appointment' }).click();
  await page.getByText(/Late cancel and No-show keep it on the calendar/).waitFor();
  await page.getByRole('button', { name: 'Late cancel', exact: true }).click();
  await page.getByRole('heading', { name: 'Edit Appointment' }).waitFor({ state: 'detached' });
  const lc = sched.find(([n]) => n === 'save_appointment')?.[1]?.p;
  check(lc?.id === 'a-1' && lc.clients[0].id === 'b-1' && lc.clients[0].status === 'LATE_CANCEL' && !sched.some(([n]) => n === 'cancel_appointment'),
    'schedule: Late cancel keeps the appointment and marks the booking');

  // Half-overlapping: the 9:30 block sits on top of the 9:00 ones, pushed in by half.
  const noa = page.getByRole('button', { name: /Noa Han - Gyrotonic/ });
  const [n, col] = [await noa.boundingBox(), await page.locator(`[data-day="${LA_TODAY}"]`).boundingBox()];
  check(Math.abs(n.x - (col.x + (col.width - 16) / 2)) < 3 && n.y > m.y + 5
    && (await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent ?? '', [n.x + n.width / 2, n.y + n.height / 2])).includes('Noa Han'),
    'schedule: a block starting half way through another is indented and drawn on top');

  // Free strip on the right: hover shows +, a click there books at that time even beside full blocks.
  await page.mouse.move(col.x + col.width - 6, m.y + 6);
  await page.locator('[data-grid] .lucide-plus').waitFor();
  check(true, 'schedule: hover on free space shows the +');
  await shot(page, 'schedule-hover-plus');
  await page.mouse.click(col.x + col.width - 6, m.y + 6);
  await page.getByRole('heading', { name: 'New Appointment' }).waitFor();
  check((await page.locator('input[type="time"]').inputValue()) === '09:00', 'schedule: the strip beside the 9:00 blocks books at 9:00');
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'New Appointment' }).waitFor({ state: 'detached' });

  // Drag the = at the bottom: new length on a 5-minute grid, confirm with Save, Undo puts it back.
  sched.length = 0;
  const ph = w.height / 120;
  const k = await late.boundingBox();
  await late.hover();
  await page.mouse.move(k.x + k.width / 2, k.y + k.height - 3);
  await page.mouse.down();
  await page.mouse.move(k.x + k.width / 2, k.y + k.height - 3 + 5 * ph, { steps: 4 });
  await page.mouse.move(k.x + k.width / 2, k.y + k.height - 3 + 10 * ph, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).waitFor();
  const len = sched.filter(([nm]) => nm === 'save_appointment').map(([, b]) => b.p);
  check(len[0]?.id === 'a-4' && len[0].start === `${LA_TODAY} 15:00` && len[0].minutes === 60 && len[0].clients[0]?.id === 'b-5'
    && !sched.some(([nm]) => nm === 'move_appointment'), 'schedule: dragging the bottom edge 10 minutes saves 60 minutes, same start');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(300);
  const back = sched.filter(([nm]) => nm === 'save_appointment').map(([, b]) => b.p)[1];
  check(back?.id === 'a-4' && back.minutes === 50, 'schedule: Undo puts the length back');

  // New appointment: client search uses the Schedule search (no payment data).
  await page.getByRole('button', { name: 'New Appointment' }).click();
  await page.getByPlaceholder(/Search/).first().fill('leo');
  await page.getByRole('button', { name: /Leo Park/ }).click();
  check(sched.some(([n, b]) => n === 'schedule_search_clients' && b.p_query === 'leo'), 'schedule: dialog searches clients with Schedule access');
  check(errors.length === 0, `schedule: no page errors ${errors.join(' | ')}`);
  await context.close();
}
{
  const { page, context, errors } = await open('OWNER', 393, 'schedule/', { timezoneId: 'Asia/Seoul' });
  await page.getByRole('button', { name: /Mina Cho - Private/ }).waitFor();
  check(await noOverflow(page), 'schedule phone: day view, no sideways scroll');
  check(errors.length === 0, `schedule phone: no page errors ${errors.join(' | ')}`);
  await context.close();
}
// Phone: a tap opens the dialog, press and hold then drag moves the block.
{
  sched.length = 0;
  const { page, context, errors } = await open('OWNER', 393, 'schedule/', { timezoneId: 'Asia/Seoul', hasTouch: true, isMobile: true });
  const mina = page.getByRole('button', { name: /Mina Cho - Private/ });
  await mina.waitFor();
  await mina.tap();
  await page.getByRole('heading', { name: 'Edit Appointment' }).waitFor();
  check(true, 'schedule phone: a tap opens the dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Edit Appointment' }).waitFor({ state: 'detached' });
  const workshop = page.getByRole('button', { name: /^12:00 - 2:00\s*Workshop/ });
  await workshop.scrollIntoViewIfNeeded();
  const w = await workshop.boundingBox();
  const cdp = await context.newCDPSession(page);
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: w.x + w.width / 2, y }] });
  const y0 = w.y + 15;
  // A quick swipe scrolls, it doesn't pick the block up.
  await touch('touchStart', y0);
  for (let i = 1; i <= 6; i++) await touch('touchMove', y0 - i * 8);
  await touch('touchEnd');
  await page.waitForTimeout(300);
  check(!(await page.getByRole('heading', { name: 'Move Event' }).count()), 'schedule phone: a swipe does not move the block');
  await workshop.scrollIntoViewIfNeeded();
  const w2 = await workshop.boundingBox();
  const y1 = w2.y + 15;
  const touch2 = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: w2.x + w2.width / 2, y }] });
  await touch2('touchStart', y1);
  await page.waitForTimeout(500); // hold
  for (let i = 1; i <= 8; i++) await touch2('touchMove', y1 + (w2.height / 2) * (i / 8));
  await touch2('touchEnd');
  await page.getByRole('heading', { name: 'Move Event' }).waitFor();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).waitFor();
  const mv = sched.find(([n]) => n === 'move_appointment')?.[1];
  check(mv?.p_id === 'a-3' && mv.p_start === `${LA_TODAY} 13:00`, 'schedule phone: press, hold and drag one hour down moves to 13:00');
  check(errors.length === 0, `schedule phone touch: no page errors ${errors.join(' | ')}`);
  await context.close();
}
for (const [who, path, ok] of [['INSTRUCTOR', 'schedule/', false], ['STAFF', 'schedule/', true], ['STAFF', 'schedule-settings/', false]]) {
  const { page, context } = await open(who, 1280, path);
  await page.locator('h1').waitFor();
  const h1 = await page.locator('h1').innerText();
  check((h1 === 'Schedule' || h1 === 'Schedule settings') === ok, `${who} ${path}: ${ok ? 'opens' : 'not allowed (Settings → Admin access / owner only)'}`);
  await context.close();
}

// 23. Settings › Schedule: Schedulista CSV dry run → counts → import; a wrong file sends nothing
{
  sched.length = 0;
  const { page, context, errors } = await open('OWNER', 1280, 'schedule-settings/');
  check((await page.locator('h1').innerText()) === 'Schedule settings', 'schedule settings: page opens');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(`${os.tmpdir()}/sched-`);
  fs.writeFileSync(`${dir}/wrong.csv`, 'Name,Phone\nMina Cho,555\n');
  fs.writeFileSync(`${dir}/appointments.csv`, [
    'Appointment Time,Appointment Duration,Provider Name,Service Name,Client Name,Client Email,Client Phone,Appointment Created,Price,Appointment Notes,Location',
    '2026-03-08 09:00:00,50,Sunnie,Private with Sunnie -,Mina Cho,,+13105550101,2026-03-01 10:00:00,$130.00,,',
    '2026-03-08 09:00:00,50,Nobody,Private with Nobody,Leo Park,,+13105550199,,,,',
    '2026-03-09 10:00:00,360,,Gyrotonic Workshop,Sara Kim,sara@example.com,,,,"Bring socks\nand water",',
    'not a date,50,Sunnie,Private with Sunnie,Zed Quinn,,,,,,',
  ].join('\n'));
  const file = page.locator('input[type=file]');
  await file.setInputFiles(`${dir}/wrong.csv`);
  await page.getByText(/not a Schedulista appointments export/).waitFor();
  check(!sched.some(([n]) => n === 'import_schedule'), 'import: wrong file is refused before anything is sent');

  await file.setInputFiles(`${dir}/appointments.csv`);
  await page.getByRole('button', { name: 'Import 2 rows' }).waitFor();
  const dry = sched.filter(([n]) => n === 'import_schedule').map(([, b]) => b);
  const [r1, , r3] = dry[0]?.p_rows ?? [];
  check(dry.length === 1 && dry[0].p_commit === false && dry[0].p_rows.length === 3, 'import: dry run first with the 3 readable rows');
  check(r1?.start === '2026-03-08 09:00' && r1.service === 'Private' && r1.instructor === 'Sunnie' && r1.price_cents === 13000
    && r1.created === '2026-03-01 10:00:00' && r1.client_phone === '+13105550101', 'import: row read as studio time, service, instructor, price in cents');
  check(r3?.service === 'Gyrotonic Workshop' && r3.instructor === '' && r3.minutes === 360 && r3.notes === 'Bring socks\nand water', 'import: workshop has no instructor, notes keep line breaks');
  const stat = (label) => page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd').innerText();
  check(await stat('Total records') === '4' && await stat('Ready to import') === '2' && await stat("Can't import") === '2', 'import: preview counts');
  check(await page.getByText(/Instructor not found: Nobody/).isVisible() && await page.getByText(/Missing or invalid date\/time/).isVisible(), 'import: reasons with row numbers');
  await page.getByRole('button', { name: 'Import 2 rows' }).click();
  await page.getByText('Import finished.').waitFor();
  const commit = sched.filter(([n]) => n === 'import_schedule').map(([, b]) => b)[1];
  check(commit?.p_commit === true && commit.p_rows.length === 3 && await stat('Successfully imported') === '2', 'import: import sends the rows and shows the result');
  check(errors.length === 0, `schedule settings: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// 24. Settings › Schedule › Services like Schedulista: categories on the left, their services on the right,
// dialogs that save every field, reorder by keyboard and by dragging
{
  sched.length = 0;
  const { page, context, errors } = await open('OWNER', 1280, 'schedule-settings/');
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const dialog = page.locator('dialog[open]');
  const saved = (rpc) => sched.filter(([n]) => n === rpc).map(([, b]) => b);
  await btn('Individual Classes (2)').waitFor();
  check(await btn('Pilates Classes (1)').isVisible() && await btn('Gyrotonic Classes (1)').isVisible()
    && await btn('Individual Classes (2)').getAttribute('aria-pressed') === 'true', 'services: categories with their counts, the first one picked');
  check(await btn('Edit Private').isVisible() && await btn('Edit Gyrotonic').isVisible() && !(await btn('Edit Pilates Group').count()),
    'services: the picked category lists only its services');
  check(await page.getByRole('img', { name: 'Su kyung YI, Sunnie Lee', exact: true }).count() === 2 && await page.getByText('50 minutes').first().isVisible(),
    'services: a dot per instructor who teaches it (every active one when not set), and the length');
  await btn('Pilates Classes (1)').click();
  check(await btn('Edit Pilates Group').isVisible() && !(await btn('Edit Private').count()), 'services: clicking Pilates Classes shows Pilates Group');
  await btn('Gyrotonic Classes (1)').click();
  check(await page.getByRole('img', { name: 'Su kyung YI', exact: true }).isVisible(), 'services: Gyrotonic Group shows only its instructor');
  await shot(page, 'services-desktop');

  await btn('Add category').click();
  await page.getByRole('heading', { name: 'Add category' }).waitFor();
  check(!(await dialog.getByRole('button', { name: 'Cancel' }).count()) && !(await dialog.getByRole('button', { name: 'Delete category' }).count()),
    'category dialog: Save only, no Cancel or Delete when adding');
  await dialog.getByLabel('Category name').fill('Workshops');
  await shot(page, 'services-add-category');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Saved.', { exact: true }).waitFor();
  const cat = saved('save_schedule_category')[0]?.p;
  check(cat?.name === 'Workshops' && !('id' in cat), 'category dialog: Add category sends save_schedule_category with the name');
  await btn('Edit Pilates Classes').click();
  await page.getByRole('heading', { name: 'Edit category' }).waitFor();
  check(await dialog.getByRole('button', { name: 'Delete category' }).isDisabled() && await dialog.getByText('Move its services to another category first.').isVisible(),
    'category dialog: a category with services cannot be deleted');
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Edit category' }).waitFor({ state: 'detached' });

  await btn('Individual Classes (2)').click();
  await btn('Edit Private').click();
  await page.getByRole('heading', { name: 'Edit service' }).waitFor();
  await dialog.getByRole('button', { name: '5 minutes longer' }).click();
  await dialog.getByLabel('Price ($)').fill('90');
  await shot(page, 'services-edit-service');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Edit service' }).waitFor({ state: 'detached' });
  const edit = saved('save_schedule_service')[0]?.p;
  check(edit?.id === 'v-1' && edit.name === 'Private' && edit.minutes === 55 && edit.price_cents === 9000 && edit.category_id === 'c-ind'
    && edit.staff_ids === null && edit.capacity === 1 && edit.cleanup_minutes === 0 && edit.active === true,
    'service dialog: Edit Private sends 55 minutes, $90 in cents, its category, every instructor (null)');

  await btn('Pilates Classes (1)').click();
  await btn('Edit Pilates Group').click();
  await page.getByRole('heading', { name: 'Edit service' }).waitFor();
  check(await dialog.getByRole('switch', { name: 'Class' }).isChecked() && await dialog.getByLabel('Capacity').inputValue() === '5', 'service dialog: a group is a class with its capacity');
  await dialog.getByRole('checkbox', { name: 'Sunnie Lee' }).uncheck();
  check(await dialog.getByRole('checkbox', { name: 'Su kyung YI' }).isDisabled(), 'service dialog: the last instructor stays checked');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Edit service' }).waitFor({ state: 'detached' });
  const group = saved('save_schedule_service')[1]?.p;
  check(group?.id === 'v-3' && group.staff_ids?.join() === 'i-suk' && group.capacity === 5, 'service dialog: unchecking an instructor sends the other one');

  await btn('Add service').click();
  await page.getByRole('heading', { name: 'Add service' }).waitFor();
  await dialog.getByLabel('Service name').fill('private');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await dialog.getByText('There is already a service with this name.').waitFor();
  await dialog.getByLabel('Service name').fill('Mat Class');
  await dialog.getByLabel('Price ($)').fill('abc');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await dialog.getByText(/Enter dollars from 0 to 100,000/).waitFor();
  check(saved('save_schedule_service').length === 2, 'service dialog: a taken name or a wrong price sends nothing');
  await dialog.getByLabel('Price ($)').fill('');
  await dialog.getByRole('switch', { name: 'Setup/cleanup time' }).check({ force: true });
  await dialog.getByRole('switch', { name: 'Class' }).check({ force: true });
  await dialog.getByLabel('Capacity').fill('8');
  await dialog.getByLabel('Description').fill('Mat work for everyone');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Add service' }).waitFor({ state: 'detached' });
  const added = saved('save_schedule_service')[2]?.p;
  check(added && !('id' in added) && added.name === 'Mat Class' && added.category_id === 'c-pil' && added.price_cents === null && added.cleanup_minutes === 5
    && added.capacity === 8 && added.minutes === 50 && added.description === 'Mat work for everyone' && added.staff_ids === null,
    'service dialog: a new service goes in the picked category with cleanup, class capacity and description');

  await btn('Move Individual Classes').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  const byKey = saved('set_schedule_order')[0];
  check(byKey?.p_categories?.join() === 'c-pil,c-ind,c-gyr' && byKey.p_services === null, 'order: ArrowDown on a category handle saves the new category order');
  check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Move Individual Classes', 'order: focus stays on the moved handle');
  await btn('Individual Classes (2)').click();
  await btn('Move Gyrotonic').dragTo(btn('Move Private'));
  await page.waitForTimeout(300);
  const byDrag = saved('set_schedule_order')[1];
  check(byDrag?.p_services?.join() === 'v-2,v-1,v-3,v-4' && byDrag.p_categories === null, 'order: dragging a service saves every service in the new order');

  // Delete: pencil and trash icons on each row, a Delete button in the dialog, then a confirm with the appointment count.
  await page.reload();
  await btn('Individual Classes (2)').click();
  check(await btn('Delete Private').isVisible() && await btn('Edit Private').isVisible() && !(await page.getByText('Edit', { exact: true }).count()),
    'delete: each service row has an edit (pencil) and a delete (trash) icon, no Edit text');
  await btn('Delete Private').click();
  const confirm = page.locator('dialog[open]').last();
  await confirm.getByText('This service has 312 appointments on the calendar.').waitFor();
  check(await confirm.getByRole('heading', { name: 'Delete service' }).isVisible() && await confirm.getByText('Are you sure you want to delete Private?').isVisible()
    && await confirm.getByRole('button', { name: 'Cancel', exact: true }).isVisible() && await confirm.getByRole('button', { name: 'Delete', exact: true }).isVisible(),
    'delete: the confirm says how many appointments use it and asks, with Delete and Cancel at the bottom');
  check(sched.some(([n, svc, status]) => n === 'count appointments' && svc === 'eq.Private' && status === 'eq.BOOKED'), 'delete: counts only booked appointments of that service');
  await shot(page, 'services-delete-confirm');
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('heading', { name: 'Delete service' }).waitFor({ state: 'detached' });
  check(!saved('delete_schedule_service').length, 'delete: Cancel deletes nothing');

  await btn('Edit Gyrotonic').click();
  await page.getByRole('heading', { name: 'Edit service' }).waitFor();
  await dialog.getByRole('button', { name: 'Delete service' }).click();
  await confirm.getByText('This service has 1 appointment on the calendar.').waitFor();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  check(await page.getByRole('heading', { name: 'Edit service' }).isVisible() && !(await page.getByRole('heading', { name: 'Delete service' }).count()),
    'delete: Cancel on the confirm goes back to the edit dialog');
  await dialog.getByRole('button', { name: 'Delete service' }).click();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Deleted.', { exact: true }).waitFor();
  check(saved('delete_schedule_service')[0]?.p_id === 'v-2' && !(await page.locator('dialog[open]').count()),
    'delete: Delete in the edit dialog, then confirm, deletes that service and closes both dialogs');
  check(errors.length === 0, `services: no page errors ${errors.join(' | ')}`);
  await context.close();
}
for (const colorScheme of ['light', 'dark']) {
  const { page, context, errors } = await open('OWNER', 393, 'schedule-settings/', { colorScheme });
  await page.getByRole('button', { name: 'Individual Classes (2)', exact: true }).waitFor();
  check(await noOverflow(page), `services phone ${colorScheme}: no sideways scroll`);
  await shot(page, `services-phone-${colorScheme}`);
  await page.getByRole('button', { name: 'Edit Private', exact: true }).click();
  await page.getByRole('heading', { name: 'Edit service' }).waitFor();
  check(await noOverflow(page), `services phone ${colorScheme}: dialog fits`);
  await shot(page, `services-phone-dialog-${colorScheme}`);
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete service' }).click();
  await page.getByText('Are you sure you want to delete Private?').waitFor();
  check(await noOverflow(page), `services phone ${colorScheme}: delete confirm fits`);
  await shot(page, `services-phone-delete-${colorScheme}`);
  check(errors.length === 0, `services phone ${colorScheme}: no page errors ${errors.join(' | ')}`);
  await context.close();
}

// An inactive instructor left off a service's list stays off when the service is saved for another reason;
// a typed length that isn't a multiple of 5 still saves.
{
  sched.length = 0;
  const { page, context, errors } = await open('OWNER', 1280, 'schedule-settings/');
  await context.route(`${SUPABASE}/rest/v1/rpc/schedule_instructors`, (r) =>
    r.fulfill({ json: [...INSTRUCTORS, { user_id: 'i-old', full_name: 'Gia Moon', calendar_color: null, active: false }] }));
  await context.route(`${SUPABASE}/rest/v1/schedule_services?**`, (r) =>
    r.fulfill({ json: SERVICES.map((v) => (v.name === 'Pilates Group' ? { ...v, staff_ids: ['i-suk', 'i-sun'] } : v)) }));
  await page.reload();
  await page.getByRole('button', { name: 'Pilates Classes (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Pilates Group', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Duration').fill('52');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Edit service' }).waitFor({ state: 'detached' });
  const p = sched.find(([n]) => n === 'save_schedule_service')?.[1]?.p;
  check(p?.staff_ids?.join() === 'i-suk,i-sun' && p.minutes === 52, 'service dialog: saving keeps a list that leaves out an inactive instructor; 52 minutes saves');
  check(errors.length === 0, `services inactive: no page errors ${errors.join(' | ')}`);
  await context.close();
}

check(!browserCalledSheet, 'staging never calls the Google Sheet');

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
