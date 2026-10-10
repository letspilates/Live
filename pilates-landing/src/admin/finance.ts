// Financial reports and monthly closing (owner only). Every number comes from
// the database function finance_report(), so the dashboard, reports, closing
// and CSV always agree (master plan J.2). Money in integer cents.
import { addMonths } from './expenses';
import { addDays, laToday } from './payments';
import { supabase } from './supabase';

export interface MonthRow {
  month: string;
  net: number;
  expenses: number;
  profit: number;
  payment_count: number;
  status: 'OPEN' | 'CLOSED';
  closed_at: string | null;
  version: number | null;
}

export interface Report {
  from: string;
  to: string;
  gross: number;
  refunds: number;
  net: number;
  payment_count: number;
  refund_count: number;
  void_count: number;
  expenses: number;
  expenses_paid: number;
  expenses_outstanding: number;
  expense_count: number;
  unpaid_count: number;
  estimate_count: number;
  expense_void_count: number;
  profit: number;
  by_method: { method: string; gross: number; refunds: number; net: number; count: number }[];
  by_collector: { name: string; gross: number; count: number }[];
  by_category: { category: string; amount: number; count: number }[];
  months: MonthRow[];
}

export interface Period {
  month: string;
  status: 'OPEN' | 'CLOSED';
  version: number;
  closed_by: string | null;
  closed_at: string | null;
  reopened_at: string | null;
  reopen_reason: string;
}

export const thisMonth = () => `${laToday().slice(0, 8)}01`;
export const monthEnd = (month: string) => addDays(addMonths(month, 1), -1);

export async function loadReport(from: string, to: string): Promise<Report> {
  const { data, error } = await supabase!.rpc('finance_report', { p_from: from, p_to: to });
  if (error) throw error;
  return data as Report;
}

/** The month's closing row, or null when it was never closed. */
export async function loadPeriod(month: string): Promise<Period | null> {
  const { data, error } = await supabase!.from('accounting_periods').select('*').eq('month', month);
  if (error) throw error;
  return (data as Period[])[0] ?? null;
}

export async function closePeriod(month: string) {
  const { error } = await supabase!.rpc('close_period', { p_month: month });
  if (error) throw error;
}

export async function reopenPeriod(month: string, reason: string) {
  const { error } = await supabase!.rpc('reopen_period', { p_month: month, p_reason: reason });
  if (error) throw error;
}
