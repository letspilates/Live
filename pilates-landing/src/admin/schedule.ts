// Schedule calendar data. Everything is shown in studio time (Los Angeles),
// never the browser's own zone; writes send studio wall-clock text
// ('YYYY-MM-DD HH:MM') to the database functions.
import type { Lang } from './i18n';
import { addDays } from './payments';
import { supabase } from './supabase';

const LA = 'America/Los_Angeles';

export type BookingStatus = 'BOOKED' | 'CONFIRMED' | 'ATTENDED' | 'NO_SHOW' | 'LATE_CANCEL';
export const BOOKING_STATUSES: BookingStatus[] = ['BOOKED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'LATE_CANCEL'];

export interface Booking {
  /** Missing for a client added in the dialog and not saved yet. */
  id?: string;
  student_id: string | null;
  name: string;
  phone: string;
  status: BookingStatus;
  notes: string;
}

export interface Appointment {
  id: string;
  starts_at: string;
  minutes: number;
  /** null = Other (a guest, or nobody named). */
  staff_id: string | null;
  /** A guest who leads it (Other); only without staff_id. '' = none. */
  guest_instructor: string;
  service: string;
  capacity: number;
  series_id: string | null;
  series_changed: boolean;
  /** Sent back on save; the database refuses a save from an older copy. */
  updated_at: string;
  /** CANCELLED stays on the calendar, striped. */
  status: 'BOOKED' | 'CANCELLED';
  /** Bookings that are not cancelled. */
  clients: Booking[];
  /** Studio day (YYYY-MM-DD) and start in minutes after midnight. */
  day: string;
  start: number;
}

export interface Instructor {
  user_id: string;
  full_name: string;
  calendar_color: string | null;
  active: boolean;
  /** calendar_color, or the fallback palette by order. */
  color: string;
}

export interface Category {
  id: string;
  name: string;
  sort: number;
  /** Others: its services are led by guest instructors, not staff. */
  guest: boolean;
}

export interface Service {
  id: string;
  name: string;
  minutes: number;
  capacity: number;
  active: boolean;
  sort: number;
  category_id: string | null;
  price_cents: number | null;
  cleanup_minutes: number;
  description: string;
  /** Instructors who teach it; null = every instructor. */
  staff_ids: string[] | null;
  /** Who leads it, for a service in an Others category. */
  guest_instructor: string;
}

// Schedulista's block colors, the fallback when an instructor has no color yet.
export const PALETTE = ['#7B55A8', '#D63A43', '#EEBC43', '#D65098', '#4F9079', '#3C78C8', '#E57F2E', '#2E9AA6', '#6B7280'];
export const EVENT_COLOR = '#EB5366';
export const TODAY_COLOR = '#F4D548';

/** Light block colors (the yellow) get a text shadow so the white text stays readable. */
export function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
}

type Row = Omit<Appointment, 'clients' | 'day' | 'start'> & {
  appointment_clients: {
    id: string;
    student_id: string | null;
    client_name: string;
    client_phone: string;
    status: BookingStatus | 'CANCELLED';
    notes: string;
    students: { full_name: string } | null;
  }[];
};

/** Appointments (booked and cancelled) starting on studio days from (inclusive) to (exclusive). */
export async function loadAppointments(from: string, to: string): Promise<Appointment[]> {
  const { data, error } = await supabase!
    .from('appointments')
    .select(
      'id, starts_at, minutes, staff_id, guest_instructor, service, capacity, series_id, series_changed, status, updated_at, appointment_clients(id, student_id, client_name, client_phone, status, notes, students(full_name))',
    )
    .gte('starts_at', laInstant(from))
    .lt('starts_at', laInstant(to))
    .order('starts_at')
    .order('created_at', { referencedTable: 'appointment_clients' });
  if (error) throw error;
  return (data as unknown as Row[]).map(({ appointment_clients, ...a }) => {
    const { day, min } = laWall(a.starts_at);
    return {
      ...a,
      day,
      start: min,
      clients: appointment_clients
        .filter((b) => b.status !== 'CANCELLED')
        .map((b) => ({
          id: b.id,
          student_id: b.student_id,
          name: b.students?.full_name ?? b.client_name,
          phone: b.client_phone,
          status: b.status as BookingStatus,
          notes: b.notes,
        })),
    };
  });
}

/** Other's color on the calendar (Settings › Schedule settings), or the default. */
export async function loadOtherColor(): Promise<string> {
  const { data, error } = await supabase!.from('schedule_settings').select('other_color').maybeSingle();
  if (error) throw error;
  return (data?.other_color as string | null) ?? EVENT_COLOR;
}

export async function loadInstructors(): Promise<Instructor[]> {
  const { data, error } = await supabase!.rpc('schedule_instructors');
  if (error) throw error;
  return (data as Omit<Instructor, 'color'>[]).map((r, i) => ({ ...r, color: r.calendar_color ?? PALETTE[i % PALETTE.length] }));
}

/** Categories and services in their set order (Settings › Schedule); only active services unless all. */
export async function loadServices(all = false): Promise<{ categories: Category[]; services: Service[] }> {
  let services = supabase!
    .from('schedule_services')
    .select('id, name, minutes, capacity, active, sort, category_id, price_cents, cleanup_minutes, description, staff_ids, guest_instructor');
  if (!all) services = services.eq('active', true);
  const [c, s] = await Promise.all([
    supabase!.from('schedule_categories').select('id, name, sort, guest').order('sort').order('name'),
    services.order('sort').order('name'),
  ]);
  if (c.error) throw c.error;
  if (s.error) throw s.error;
  return { categories: c.data as Category[], services: s.data as Service[] };
}

/* ───────────── Studio time ───────────── */

const WALL = new Intl.DateTimeFormat('en-CA', {
  timeZone: LA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Studio day (YYYY-MM-DD) and minutes after midnight of an instant (default: now). */
export function laWall(at: string | number = Date.now()) {
  const p = Object.fromEntries(WALL.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

/** ISO instant of a studio wall-clock time (two passes settle the LA offset, DST included). */
export function laInstant(day: string, min = 0): string {
  const wall = Date.parse(`${day}T00:00:00Z`) + min * 60_000;
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const w = laWall(t);
    t += wall - (Date.parse(`${w.day}T00:00:00Z`) + w.min * 60_000);
  }
  return new Date(t).toISOString();
}

/** 480 → "08:00" (time input value). */
export const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
/** "08:00" → 480 */
export const toMin = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** What the database functions take: 'YYYY-MM-DD HH:MM' in studio time. */
export const wallText = (day: string, min: number) => `${day} ${hhmm(min)}`;

/** 500 → "8:20", the 12-hour time on the blocks. */
export const hm = (min: number) => `${Math.floor(min / 60) % 12 || 12}:${String(min % 60).padStart(2, '0')}`;
/** 500 → "8:20 am" */
export const ampm = (min: number) => `${hm(min)} ${min % 1440 < 720 ? 'am' : 'pm'}`;

const noon = (day: string) => new Date(`${day}T12:00:00Z`);
/** 0 = Sunday */
export const weekday = (day: string) => noon(day).getUTCDay();
/** The Sunday a week starts on. */
export const weekStart = (day: string) => addDays(day, -weekday(day));
/** First day of the next month. */
export const nextMonth = (day: string) => `${addDays(`${day.slice(0, 8)}01`, 31).slice(0, 8)}01`;
/** First day of the previous month. */
export const prevMonth = (day: string) => `${addDays(`${day.slice(0, 8)}01`, -1).slice(0, 8)}01`;

/** Every day of the Sunday–Saturday weeks that cover the month of `day`. */
export function monthCells(day: string): string[] {
  const end = nextMonth(day);
  const cells: string[] = [];
  for (let d = weekStart(`${day.slice(0, 8)}01`); d < end || weekday(d) !== 0; d = addDays(d, 1)) cells.push(d);
  return cells;
}

/** A day as text, e.g. { weekday: 'short' } → "Mon". With `to`, a range: "October 11 – 17, 2026". */
export function dayText(day: string, lang: Lang, opts: Intl.DateTimeFormatOptions, to?: string) {
  const f = new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { timeZone: 'UTC', ...opts });
  return to ? f.formatRange(noon(day), noon(to)) : f.format(noon(day));
}

/** Where blocks sit in a day column, as fractions of its width (like Schedulista): appointments that
 *  start together share the width side by side; one that starts while another is still running is
 *  drawn on top of it, indented by half of the space left. level = how many blocks it sits on. */
export function layout<T extends { start: number; minutes: number }>(items: T[]) {
  const sorted = [...items].sort((x, y) => x.start - y.start || y.minutes - x.minutes);
  const out: { a: T; left: number; width: number; level: number }[] = [];
  for (let i = 0; i < sorted.length; ) {
    const s = sorted[i].start;
    let j = i;
    while (j < sorted.length && sorted[j].start === s) j++;
    const level = Math.max(0, ...out.filter((o) => o.a.start < s && o.a.start + o.a.minutes > s).map((o) => o.level + 1));
    const left = 1 - 0.5 ** level;
    const n = j - i;
    sorted.slice(i, j).forEach((a, k) => out.push({ a, level, left: left + ((1 - left) * k) / n, width: (1 - left) / n }));
    i = j;
  }
  return out;
}
