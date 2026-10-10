// Expenses data (owner only): money in integer cents, months as YYYY-MM-01.
// An expense belongs to the month of its expense date.
import { parseCents } from './payments';
import { supabase } from './supabase';

export interface Category {
  code: string;
  name_en: string;
  name_ko: string;
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  vendor: string;
  amount_cents: number;
  expense_date: string;
  due_date: string | null;
  payment_status: 'UNPAID' | 'PAID';
  paid_on: string | null;
  payment_method: string | null;
  status: 'ACTIVE' | 'VOID';
  void_reason: string;
  recurring_rule_id: string | null;
  is_estimate: boolean;
  payee_staff_id: string | null;
  notes: string;
}

export interface Rule {
  id: string;
  category: string;
  description: string;
  vendor: string;
  amount_cents: number;
  due_day: number;
  start_month: string;
  end_month: string | null;
  is_estimate: boolean;
  payee_staff_id: string | null;
  active: boolean;
}

/** How the studio paid an expense (database CHECK has the same list). */
export const PAY_METHODS = ['BANK', 'AUTOPAY', 'CARD', 'ZELLE', 'CHECK', 'CASH', 'OTHER'] as const;

/** "-50", "−50.00", "$1,200" → cents; a minus sign marks a vendor credit. null when not a non-zero amount. */
export function parseSignedCents(text: string): number | null {
  const s = text.trim();
  const negative = /^[-−]/.test(s);
  const cents = parseCents(negative ? s.slice(1) : s);
  return cents === null ? null : negative ? -cents : cents;
}

/** "2026-10-01" + 1 → "2026-11-01". */
export function addMonths(month: string, n: number): string {
  const d = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function formatMonth(month: string, lang: 'en' | 'ko'): string {
  return new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { timeZone: 'UTC', year: 'numeric', month: 'long' }).format(
    new Date(`${month.slice(0, 7)}-01T12:00:00Z`),
  );
}

/** Totals of the month's active expenses (voided ones count nowhere). */
export function expenseTotals(rows: Expense[]) {
  let total = 0;
  let paid = 0;
  let unpaidCount = 0;
  for (const r of rows) {
    if (r.status !== 'ACTIVE') continue;
    total += r.amount_cents;
    if (r.payment_status === 'PAID') paid += r.amount_cents;
    else unpaidCount += 1;
  }
  return { total, paid, unpaid: total - paid, unpaidCount };
}

export async function loadCategories(): Promise<Category[]> {
  const { data, error } = await supabase!.from('expense_categories').select('code,name_en,name_ko').eq('active', true).order('sort_order');
  if (error) throw error;
  return data as Category[];
}

export async function loadExpenses(month: string): Promise<Expense[]> {
  const { data, error } = await supabase!
    .from('expenses')
    .select('*')
    .eq('period_month', month)
    .order('expense_date')
    .order('created_at');
  if (error) throw error;
  return data as Expense[];
}

export async function loadRules(): Promise<Rule[]> {
  const { data, error } = await supabase!.from('recurring_expense_rules').select('*').order('active', { ascending: false }).order('created_at');
  if (error) throw error;
  return data as Rule[];
}

/** Spreadsheet-safe CSV (a leading = + - @ is quoted so Excel never runs it as a formula). */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}
