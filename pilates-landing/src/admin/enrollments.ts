// Training-course rules, ported as-is from the old admin page (public/admin/legacy/)
// so the portal orders, names and counts courses exactly the way the sheet,
// the public form and Apps Script expect.

export interface Course {
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

export interface Registration {
  timestamp: string;
  courses: string;
  fullName: string;
  email: string;
  phone: string;
  certification: string;
  studio: string;
  cityState: string;
  questions: string;
  stage: string;
  prereq: string;
  availability: string;
  anythingElse: string;
}

/** Version of google-apps-script.js these rules match. */
export const EXPECTED_SCRIPT_VERSION = '2026-09-14b';

export const CONDUCTORS = ["Master Trainer Rich O'Connor", 'Pre-Trainer Sunnie Lee'];

/** Studio (LA) date, YYYY-MM-DD, wherever the owner opens the page. */
export function studioToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
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

function resolveCourseId(part: string, list: Course[]): string {
  const c = resolveCourse(part, list);
  if (c) return c.id;
  return String(part || '').match(/^(\S+) - /)?.[1] ?? String(part || '').trim();
}

export function courseIds(cell: string, list: Course[]): string[] {
  return [
    ...new Set(
      splitCourses(cell)
        .map((p) => resolveCourseId(p, list))
        .filter(Boolean),
    ),
  ];
}

/** Entries that match no current course (left out of the counts). */
export function unmatchedParts(cell: string, list: Course[]): string[] {
  return splitCourses(cell).filter((p) => !resolveCourse(p, list));
}
