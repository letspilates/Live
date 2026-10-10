// Training-course rules, ported as-is from the old admin page (public/admin/legacy/)
// so courses keep the same letters, order and early-bird rules, plus the
// mapping to the Supabase tables and the one-time import of the old Google Sheet.

/** A course as the screen works with it. `id` is the letter (A, B…), `uid` the database id. */
export interface Course {
  uid: string;
  id: string;
  name_en: string;
  name_kr: string;
  dates: string;
  tag_en: string;
  tag_kr: string;
  capacity: number | string | null;
  taken: number;
  active: boolean;
  time: string;
  price: string;
  fee: string;
  fee_early: string;
  early_until: string;
  conducted_by: string;
  desc_en: string;
  desc_kr: string;
}

/** public.training_courses row */
export interface CourseRow {
  id: string;
  code: string;
  name_en: string;
  name_kr: string;
  dates: string;
  length_days: number | null;
  capacity: number | null;
  class_time: string;
  price: string;
  fee: string;
  fee_early: string;
  early_until: string | null;
  conducted_by: string;
  desc_en: string;
  desc_kr: string;
  active: boolean;
}

/** public.training_registrations row */
export interface Registration {
  id: string;
  submitted_at: string;
  course_ids: string[];
  courses_text: string;
  full_name: string;
  email: string;
  phone: string;
  certification: string;
  studio: string;
  city_state: string;
  questions: string;
  stage: string;
  prereq: string;
  availability: string;
  anything_else: string;
  source: 'form' | 'import';
}

export const CONDUCTORS = ["Master Trainer Rich O'Connor", 'Pre-Trainer Sunnie Lee'];

const LA = 'America/Los_Angeles';

/** Studio (LA) date, YYYY-MM-DD, wherever the owner opens the page. */
export function studioToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** "3 days" / "3일" → "3" */
export function daysOf(c: Pick<Course, 'tag_en' | 'tag_kr'>): string {
  return String(c.tag_kr || c.tag_en || '').match(/\d+/)?.[0] ?? '';
}

export function tagsFor(days: string): { tag_en: string; tag_kr: string } {
  const n = parseInt(days, 10);
  if (!days.trim() || isNaN(n)) return { tag_en: '', tag_kr: '' };
  return { tag_en: `${n} ${n === 1 ? 'day' : 'days'}`, tag_kr: `${n}일` };
}

export function money(v: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = Number(s.replace(/[$,\s]/g, ''));
  return isNaN(n) ? s : '$' + n.toLocaleString('en-US');
}

/** "2026-10-01" → "2026-09-30" (last early-bird day) */
export function dayBefore(v: string): string {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1)).toISOString().slice(0, 10);
}

export type EarlyState =
  | { kind: 'empty' | 'noAmount' | 'noDate' }
  | { kind: 'active' | 'ended'; last: string; until: string; daysLeft: number };

/** The date entered is the day the regular fee starts; early bird runs until the day before. */
export function earlyState(c: Pick<Course, 'fee_early' | 'early_until'>, today = studioToday()): EarlyState {
  const early = c.fee_early.trim();
  const until = c.early_until.trim();
  if (!early && !until) return { kind: 'empty' };
  if (!early) return { kind: 'noAmount' };
  if (!until) return { kind: 'noDate' };
  const days = Math.round((Date.parse(until + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  return { kind: today < until ? 'active' : 'ended', last: dayBefore(until), until, daysLeft: days - 1 };
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

// A date without a year (7/24) means the year closest to today.
function nearestYear(month: number, day: number, today: string): number {
  const y = Number(today.slice(0, 4));
  const base = Date.UTC(y, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  let best = y;
  let bestDiff = Infinity;
  for (const cand of [y - 1, y, y + 1]) {
    const diff = Math.abs(Date.UTC(cand, month - 1, day) - base);
    if (diff < bestDiff || (diff === bestDiff && cand > best)) {
      best = cand;
      bestDiff = diff;
    }
  }
  return best;
}

/** First date in free-form schedule text as YYYY-MM-DD, or ''.
 *  7/24, 7/24/2026, 7/24/26, 2026-07-24, Jul 24, July 24 2026, 7월 24일 */
export function firstDateOf(text: string, today = studioToday()): string {
  const re =
    /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?|(\d{1,2})월\s*(\d{1,2})일|([A-Za-z]{3,9})\.?\s+(\d{1,2})(?!\d)(?:,?\s*(\d{4}))?/g;
  for (const m of String(text || '').matchAll(re)) {
    let y: number | null = null;
    let mo: number;
    let d: number;
    if (m[1]) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    else if (m[4]) {
      [mo, d] = [Number(m[4]), Number(m[5])];
      if (m[6]) y = Number(m[6].length === 2 ? '20' + m[6] : m[6]);
    } else if (m[7]) [mo, d] = [Number(m[7]), Number(m[8])];
    else {
      mo = MONTH_NAMES[m[9].slice(0, 3).toLowerCase()];
      if (!mo) continue;
      d = Number(m[10]);
      if (m[11]) y = Number(m[11]);
    }
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
    y ??= nearestYear(mo, d, today);
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

/** 0 → A … 25 → Z, 26 → AA */
export function letterOf(i: number): string {
  let n = i + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

/** Shown courses by first date, then hidden ones by first date; undated last in each
 *  group (original order kept). IDs are re-lettered A, B, C… in that order. */
export function autoOrder<T extends Pick<Course, 'id' | 'dates' | 'active'>>(list: T[], today = studioToday()): T[] {
  const keyed = list.map((c, i) => ({ c, i, date: firstDateOf(c.dates, today) }));
  keyed.sort((a, b) => {
    const aActive = a.c.active !== false;
    const bActive = b.c.active !== false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (Boolean(a.date) !== Boolean(b.date)) return a.date ? -1 : 1;
    return a.i - b.i;
  });
  return keyed.map((k, i) => ({ ...k.c, id: letterOf(i) }));
}

// Same normalisation as Apps Script normalizeKey_.
function normKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** "D - Gyrotonic® Level 1 …" → current course (Apps Script resolveCourseIndex_ rules):
 *  exact name, else the only partial name match, else the letter. */
export function resolveCourse(part: string, list: Course[]): Course | null {
  const m = String(part || '').match(/^(\S+) - (.*)$/);
  const rawId = m ? m[1] : '';
  const nameKey = normKey(m ? m[2] : part);
  if (nameKey) {
    const exact = list.find((c) => normKey(c.name_en) === nameKey || normKey(c.name_kr) === nameKey);
    if (exact) return exact;
    const contains = (k: string) => k && (k.includes(nameKey) || nameKey.includes(k));
    const partial = list.filter((c) => contains(normKey(c.name_en)) || contains(normKey(c.name_kr)));
    if (partial.length === 1) return partial[0];
  }
  return (rawId && list.find((c) => normKey(c.id) === normKey(rawId))) || null;
}

/** One sheet cell → the course entries in it (comma or newline separated). */
export function splitCourses(cell: string): string[] {
  return String(cell || '')
    .split(/\s*(?:,|\n)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Database row → screen course; `taken` counts the sign-ups that picked it. */
export function fromRow(r: CourseRow, regs: Registration[]): Course {
  return {
    uid: r.id,
    id: r.code,
    name_en: r.name_en,
    name_kr: r.name_kr,
    dates: r.dates,
    ...tagsFor(String(r.length_days ?? '')),
    capacity: r.capacity,
    taken: regs.filter((g) => g.course_ids.includes(r.id)).length,
    active: r.active,
    time: r.class_time,
    price: r.price,
    fee: r.fee,
    fee_early: r.fee_early,
    early_until: r.early_until ?? '',
    conducted_by: r.conducted_by,
    desc_en: r.desc_en,
    desc_kr: r.desc_kr,
  };
}

/** M/D/YYYY h:mm AM in studio time, like the old sheet view. */
export function studioDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/* ───────────── One-time import of the old Google Sheet (CSV download) ───────────── */

/** RFC 4180: quoted fields, "" inside quotes, CRLF or LF. Blank lines dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Column order of the old "Courses" tab (apps-script setupCoursesTab).
const COURSE_COLUMNS = [
  'id',
  'name_en',
  'name_kr',
  'dates',
  'tag_en',
  'tag_kr',
  'active',
  'capacity',
  'time',
  'price',
  'desc_en',
  'desc_kr',
  'fee',
  'conducted_by',
  'fee_early',
  'early_until',
] as const;

/** Courses tab CSV → new (unsaved) courses. Columns by header name, else by position. */
export function coursesFromCsv(text: string): Course[] {
  const rows = parseCsv(text);
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const byName = head.includes('name_en');
  const col = (name: (typeof COURSE_COLUMNS)[number]) => (byName ? head.indexOf(name) : COURSE_COLUMNS.indexOf(name));
  return rows
    .slice(byName || head[0] === 'id' ? 1 : 0)
    .map((r) => {
      const get = (name: (typeof COURSE_COLUMNS)[number]) => (col(name) >= 0 ? String(r[col(name)] ?? '').trim() : '');
      const cap = get('capacity');
      return {
        uid: '',
        id: get('id'),
        name_en: get('name_en'),
        name_kr: get('name_kr'),
        dates: get('dates'),
        tag_en: get('tag_en'),
        tag_kr: get('tag_kr'),
        capacity: /^\d+$/.test(cap) ? Number(cap) : null,
        taken: 0,
        active: !/^(false|no|0)$/i.test(get('active')),
        time: get('time'),
        price: get('price'),
        fee: get('fee'),
        fee_early: get('fee_early'),
        early_until: /^\d{4}-\d{2}-\d{2}$/.test(get('early_until')) ? get('early_until') : '',
        conducted_by: get('conducted_by'),
        desc_en: get('desc_en'),
        desc_kr: get('desc_kr'),
      };
    })
    .filter((c) => c.name_en || c.name_kr || c.dates);
}

// Studio wall-clock time → instant.
// ponytail: uses the offset at the guessed instant; can be an hour off inside a DST switch hour.
function studioToIso(y: number, mo: number, d: number, h: number, mi: number, s: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: LA,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(guess)
      .map((x) => [x.type, x.value]),
  );
  const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - guess;
  return new Date(guess - offset).toISOString();
}

/** Sheet timestamp cell → ISO. ISO text as-is; "10/3/2026 14:05:09" or "10/3/2026 2:05 PM" in studio time. */
export function sheetTime(v: string): string | null {
  const s = v.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/);
  if (m) {
    let h = Number(m[4] ?? 0);
    if (m[7]) h = (h % 12) + (/p/i.test(m[7]) ? 12 : 0);
    return studioToIso(Number(m[3]), Number(m[1]), Number(m[2]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
  }
  const t = Date.parse(s);
  return /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(t) ? new Date(t).toISOString() : null;
}

/** What import_training_registrations takes. */
export type ImportRow = Omit<Registration, 'id' | 'source'>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cut = (v: string | undefined, n: number) =>
  String(v ?? '')
    .trim()
    .slice(0, n);

/** Sign-ups tab CSV (columns A–M as the form wrote them) → rows to import.
 *  The header and rows without a usable email or time are skipped. */
export function registrationsFromCsv(text: string, courses: Course[]): { rows: ImportRow[]; skipped: number } {
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of parseCsv(text)) {
    const email = cut(r[3], 254).toLowerCase();
    const at = sheetTime(r[0] ?? '');
    if (!EMAIL.test(email) || !at) {
      if (/@/.test(r[3] ?? '')) skipped++; // the header row has no @
      continue;
    }
    const picked = splitCourses(r[1]).map((p) => resolveCourse(p, courses)?.uid);
    rows.push({
      submitted_at: at,
      course_ids: [...new Set(picked.filter((x): x is string => Boolean(x)))],
      courses_text: cut(r[1], 2000),
      full_name: cut(r[2], 200) || email,
      email,
      phone: cut(r[4], 50),
      certification: cut(r[5], 500),
      studio: cut(r[6], 500),
      city_state: cut(r[7], 200),
      questions: cut(r[8], 4000),
      stage: cut(r[9], 500),
      prereq: cut(r[10], 500),
      availability: cut(r[11], 500),
      anything_else: cut(r[12], 4000),
    });
  }
  return { rows, skipped };
}
