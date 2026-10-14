// Daily Income data: money in integer cents, dates as Los Angeles business days
// (YYYY-MM-DD). Totals are added up in cents, never in floating dollars.
import { supabase } from './supabase';

const LA = 'America/Los_Angeles';

export interface Payment {
  id: string;
  kind: 'PAYMENT' | 'REFUND';
  status: 'VALID' | 'VOID';
  amount_cents: number;
  method: string;
  method_other: string;
  student_id: string | null;
  payer_name: string;
  related_transaction_id: string | null;
  recorded_by: string;
  recorded_by_name: string;
  collected_by: string;
  collected_by_name: string;
  recorded_at: string;
  business_date: string;
  notes: string;
  reason: string;
}

export interface Method {
  code: string;
  label_en: string;
  label_ko: string;
}

export interface Collector {
  user_id: string;
  full_name: string;
}

export interface StudentHit {
  id: string;
  full_name: string;
  phone_last4: string;
  last_paid_on: string | null;
  last_amount_cents: number | null;
  last_method: string | null;
}

/** "$1,250.50", "1250.5", "1,250" → 125050. null when it is not a positive amount. */
export function parseCents(text: string): number | null {
  const s = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatCents = (cents: number) => USD.format(cents / 100);
/** For the amount field: 12000 → "120.00". */
export const centsInput = (cents: number) => (cents / 100).toFixed(2);

/** Today's date at the studio. */
export function laToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LA }).format(new Date());
}

/** Calendar math on YYYY-MM-DD strings (UTC noon keeps DST out of it). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type Range = 'today' | 'week' | 'month' | 'lastMonth' | 'custom';

/** [from, to] for a preset. Weeks start on Monday. */
export function rangeDates(range: Exclude<Range, 'custom'>, today = laToday()): [string, string] {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (range) {
    case 'today':
      return [today, today];
    case 'week': {
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
      return [addDays(today, -((weekday + 6) % 7)), today];
    }
    case 'month':
      return [monthStart, today];
    case 'lastMonth': {
      const end = addDays(monthStart, -1);
      return [`${end.slice(0, 8)}01`, end];
    }
  }
}

export function formatDay(day: string, lang: 'en' | 'ko'): string {
  return new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${day}T12:00:00Z`));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: LA, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export interface Totals {
  gross: number;
  refunds: number;
  net: number;
  count: number;
}

/** Master plan J.1: gross = valid payments, refunds = valid refunds, count = valid payments. */
export function totals(rows: Payment[]): Totals {
  let gross = 0;
  let refunds = 0;
  let count = 0;
  for (const r of rows) {
    if (r.status !== 'VALID') continue;
    if (r.kind === 'PAYMENT') {
      gross += r.amount_cents;
      count += 1;
    } else refunds += r.amount_cents;
  }
  return { gross, refunds, net: gross - refunds, count };
}

/** Payments the caller may see (RLS: staff their own, owners all), newest first.
 *  Supabase returns at most 1000 rows per request, so read in pages; the totals
 *  must cover every row to match Reports. */
export async function loadPayments(from: string, to: string): Promise<Payment[]> {
  const all: Payment[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase!
      .from('payment_transactions')
      .select('*')
      .gte('business_date', from)
      .lte('business_date', to)
      .order('recorded_at', { ascending: false })
      .order('id')
      .range(start, start + 999);
    if (error) throw error;
    all.push(...(data as Payment[]));
    if (data.length < 1000) return all;
  }
}

export async function loadMethods(): Promise<Method[]> {
  const { data, error } = await supabase!
    .from('payment_methods')
    .select('code,label_en,label_ko')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return data as Method[];
}

/** "Zelle"; for Other with a description, "Other (ClassPass)". */
export const methodLabel = (methods: Method[], code: string, lang: 'en' | 'ko', other = '') => {
  const m = methods.find((x) => x.code === code);
  const label = m ? (lang === 'ko' ? m.label_ko : m.label_en) : code;
  return code === 'OTHER' && other ? `${label} (${other})` : label;
};

/** Active staff who can be named as having received a payment. */
export async function loadCollectors(): Promise<Collector[]> {
  const { data, error } = await supabase!.rpc('list_collectors');
  if (error) throw error;
  return data as Collector[];
}
