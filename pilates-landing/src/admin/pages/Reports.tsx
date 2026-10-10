// Reports (owner): the month's or year's numbers from finance_report(), and
// monthly closing. The database does the math and the locking; this page
// only shows it and asks for confirmation.
import { useEffect, useState, type ReactNode } from 'react';
import { ChartColumn, ChevronLeft, ChevronRight, CircleCheck, Download, Lock, RefreshCw } from 'lucide-react';
import { addMonths, formatMonth, loadCategories, toCsv, type Category } from '../expenses';
import { closePeriod, loadPeriod, loadReport, monthEnd, reopenPeriod, thisMonth, type Period, type Report } from '../finance';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import MonthChart from '../MonthChart';
import { formatCents, loadMethods, methodLabel, type Method } from '../payments';
import { supabase } from '../supabase';
import { Button, Card, CardTitle, Chip, Dialog, IconButton, Notice, Skeleton, Stat, TextField } from '../ui';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

type T = ReturnType<typeof useT>['t'];
type Staff = { user_id: string; full_name: string };
type Lists = { categories: Category[]; methods: Method[]; staff: Staff[] };
type Flash = { tone: 'success' | 'error'; text: string } | null;

function errorText(t: T, error: { code?: string }): string {
  return error.code === 'LPCLS'
    ? t('alreadyClosed')
    : error.code === '42501'
      ? t('noPermission')
      : t('somethingWrong');
}

function useNames(lists: Lists) {
  const { lang } = useT();
  return {
    category: (code: string) => {
      const c = lists.categories.find((x) => x.code === code);
      return c ? (lang === 'ko' ? c.name_ko : c.name_en) : code;
    },
    method: (code: string) => methodLabel(lists.methods, code, lang),
  };
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`\ufeff${toCsv(rows)}`], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** The report as a spreadsheet: summary, then each breakdown. Amounts in dollars. */
function reportRows(r: Report, names: ReturnType<typeof useNames>): (string | number)[][] {
  const $ = (cents: number) => cents / 100;
  const rows: (string | number)[][] = [
    ['From', r.from, 'To', r.to],
    [],
    ['Item', 'Amount'],
    ['Gross revenue', $(r.gross)],
    ['Refunds', $(r.refunds)],
    ['Net revenue', $(r.net)],
    ['Operating expenses', $(r.expenses)],
    ['  Paid', $(r.expenses_paid)],
    ['  Unpaid', $(r.expenses_outstanding)],
    ['Estimated operating profit', $(r.profit)],
    ['Payments (count)', r.payment_count],
    [],
    ['Payment method', 'Gross', 'Refunds', 'Net', 'Payments'],
    ...r.by_method.map((m) => [names.method(m.method), $(m.gross), $(m.refunds), $(m.net), m.count]),
    [],
    ['Received by', 'Gross', 'Payments'],
    ...r.by_collector.map((c) => [c.name, $(c.gross), c.count]),
    [],
    ['Expense category', 'Amount', 'Entries'],
    ...r.by_category.map((c) => [names.category(c.category), $(c.amount), c.count]),
  ];
  if (r.months.length > 1) {
    rows.push([], ['Month', 'Net revenue', 'Expenses', 'Est. profit', 'Payments', 'Status']);
    for (const m of r.months) rows.push([m.month.slice(0, 7), $(m.net), $(m.expenses), $(m.profit), m.payment_count, m.status]);
  }
  return rows;
}

export default function Reports() {
  const { t } = useT();
  const [tab, setTab] = useState<'overview' | 'closing'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'closing' ? 'closing' : 'overview',
  );
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () =>
    // Recurring expenses first, so this month's rent is in the numbers.
    Promise.resolve(supabase!.rpc('generate_recurring_expenses'))
      .then(() =>
        Promise.all([
          loadCategories(),
          loadMethods(),
          supabase!.from('staff_profiles').select('user_id,full_name').order('full_name'),
        ]),
      )
      .then(([categories, methods, staff]) => setLists({ categories, methods, staff: (staff.data as Staff[]) ?? [] }))
      .catch(() => setFailed(true));
  useEffect(() => {
    load();
  }, []);

  const show = (next: typeof tab) => {
    setTab(next);
    window.history.replaceState(null, '', next === 'overview' ? '?' : '?tab=closing');
  };

  return (
    <Layout title={t('navReports')}>
      <div role="tablist" aria-label={t('navReports')} className="mb-6 inline-flex rounded-full bg-ink/[0.06] p-1">
        {(['overview', 'closing'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => show(id)}
            className={`min-h-10 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
              tab === id ? 'bg-paper text-ink shadow-card' : 'text-mute hover:text-ink'
            }`}
          >
            {t(id === 'overview' ? 'tabOverview' : 'tabClosing')}
          </button>
        ))}
      </div>

      {failed ? (
        <Retry
          onRetry={() => {
            setFailed(false);
            load();
          }}
        />
      ) : !lists ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : tab === 'overview' ? (
        <Overview lists={lists} />
      ) : (
        <Closing lists={lists} />
      )}
    </Layout>
  );
}

function Retry({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <div className="max-w-xl">
      <Notice tone="error">{t('reportLoadFailed')}</Notice>
      <Button variant="secondary" className="mt-4" onClick={onRetry}>
        {t('tryAgain')}
      </Button>
    </div>
  );
}

/** finance_report(from, to), loaded again whenever the range or version changes. */
function useReport(from: string, to: string, version: number) {
  const key = `${from}|${to}|${version}`;
  const [result, setResult] = useState<{ key: string; report?: Report; failed?: boolean }>({ key: '' });
  useEffect(() => {
    let stale = false;
    loadReport(from, to)
      .then((report) => !stale && setResult({ key, report }))
      .catch(() => !stale && setResult({ key, failed: true }));
    return () => {
      stale = true;
    };
  }, [from, to, key]);
  const current = result.key === key;
  return { report: current ? (result.report ?? null) : null, failed: current && !!result.failed };
}

function Stepper({ label, prev, next, prevLabel, nextLabel }: { label: string; prev: () => void; next: () => void; prevLabel: string; nextLabel: string }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label={prevLabel} onClick={prev}>
        <ChevronLeft {...ICON} />
      </IconButton>
      <h2 className="min-w-36 text-center font-display text-lg font-semibold tabular-nums">{label}</h2>
      <IconButton label={nextLabel} onClick={next}>
        <ChevronRight {...ICON} />
      </IconButton>
    </div>
  );
}

function StatusBadge({ status }: { status: 'OPEN' | 'CLOSED' }) {
  const { t } = useT();
  return status === 'CLOSED' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.07] px-2 py-0.5 text-xs font-medium text-ink">
      <Lock size={11} strokeWidth={2} aria-hidden="true" />
      {t('statusCLOSED')}
    </span>
  ) : (
    <Chip tone="good">{t('statusOPEN')}</Chip>
  );
}

/* ───────────────────────────── Overview ───────────────────────────── */

function Overview({ lists }: { lists: Lists }) {
  const { t, lang } = useT();
  const names = useNames(lists);
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState(thisMonth);
  const [version, setVersion] = useState(0);
  const year = month.slice(0, 4);
  const [from, to] = mode === 'month' ? [month, monthEnd(month)] : [`${year}-01-01`, `${year}-12-31`];
  const { report: r, failed } = useReport(from, to, version);
  const label = mode === 'month' ? formatMonth(month, lang) : year;
  const step = mode === 'month' ? 1 : 12;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label={t('periodMonth')} className="inline-flex rounded-full bg-paper p-1 ring-1 ring-ink/10">
          {(['month', 'year'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => setMode(id)}
              className={`min-h-9 rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
                mode === id ? 'bg-sand text-ink' : 'text-mute hover:text-ink'
              }`}
            >
              {t(id === 'month' ? 'periodMonth' : 'periodYear')}
            </button>
          ))}
        </div>
        <Stepper
          label={label}
          prev={() => setMonth((m) => addMonths(m, -step))}
          next={() => setMonth((m) => addMonths(m, step))}
          prevLabel={t(mode === 'month' ? 'prevMonth' : 'prevYear')}
          nextLabel={t(mode === 'month' ? 'nextMonth' : 'nextYear')}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setVersion((v) => v + 1)} title={t('refresh')}>
            <RefreshCw {...ICON} size={16} />
            <span className="sr-only sm:not-sr-only">{t('refresh')}</span>
          </Button>
          <Button
            variant="secondary"
            disabled={!r}
            onClick={() => r && downloadCsv(`report-${mode === 'month' ? month.slice(0, 7) : year}.csv`, reportRows(r, names))}
          >
            <Download {...ICON} size={16} />
            <span className="sr-only sm:not-sr-only">{t('exportCsv')}</span>
          </Button>
        </div>
      </div>

      {failed ? (
        <Notice tone="error">{t('reportLoadFailed')}</Notice>
      ) : !r ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="grid gap-4">
          <Statement report={r} status={mode === 'month' ? r.months[0]?.status : undefined} />
          {mode === 'year' && (
            <Card>
              <CardTitle icon={ChartColumn} title={t('revenueVsExpenses')} />
              <MonthChart months={r.months} />
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <Breakdown
              title={t('byMethod')}
              rows={r.by_method.map((m) => ({ key: m.method, label: names.method(m.method), value: m.net, note: t('nPayments', { n: String(m.count) }) }))}
            />
            <Breakdown
              title={t('byCollector')}
              rows={r.by_collector.map((c) => ({ key: c.name, label: c.name, value: c.gross, note: t('nPayments', { n: String(c.count) }) }))}
            />
            <Breakdown
              title={t('byCategory')}
              rows={r.by_category.map((c) => ({ key: c.category, label: names.category(c.category), value: c.amount }))}
              bar="bg-clay/80"
            />
          </div>
          {mode === 'year' && <MonthTable report={r} />}
        </div>
      )}
    </>
  );
}

/** Gross − refunds = net − expenses = estimated profit. */
function Statement({ report: r, status }: { report: Report; status?: 'OPEN' | 'CLOSED' }) {
  const { t } = useT();
  const line = (label: TextKey, cents: number, sign: '' | '−' | '=', note?: string, strong = false) => (
    <div className={`flex flex-wrap items-baseline gap-x-3 py-2 ${strong ? 'border-t border-ink/15 pt-3' : ''}`}>
      <dt className={`min-w-0 flex-1 ${strong ? 'font-medium text-ink' : 'text-mute'}`}>
        <span aria-hidden="true" className="inline-block w-4 text-mute">
          {sign}
        </span>
        {t(label)}
        {note && <span className="ml-2 text-sm text-mute">({note})</span>}
      </dt>
      <dd className={`font-display tabular-nums ${strong ? 'text-2xl font-semibold' : 'text-lg font-medium'}`}>{formatCents(cents)}</dd>
    </div>
  );
  return (
    <Card>
      {status && (
        <div className="mb-2">
          <StatusBadge status={status} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
        <div className="min-w-0">
          <dl className="max-w-2xl">
            {line('grossRevenue', r.gross, '', t('nPayments', { n: String(r.payment_count) }))}
            {line('refunds', r.refunds, '−')}
            {line('netRevenue', r.net, '=', undefined, true)}
            {line('operatingExpenses', r.expenses, '−', t('paidUnpaid', { paid: formatCents(r.expenses_paid), unpaid: formatCents(r.expenses_outstanding) }))}
            {line('estProfit', r.profit, '=', undefined, true)}
          </dl>
          <p className="mt-4 max-w-[70ch] text-pretty text-sm text-mute">{t('reportBasis')}</p>
        </div>
        {r.net > 0 && <Margin report={r} />}
      </div>
    </Card>
  );
}

/** Where each revenue dollar went: expenses vs what is left (reference: Retainr "This week" panel). */
function Margin({ report: r }: { report: Report }) {
  const { t } = useT();
  const spent = Math.min(Math.max(r.expenses / r.net, 0), 1);
  const margin = Math.round((r.profit / r.net) * 1000) / 10;
  return (
    <div className="self-start rounded-2xl bg-ink/[0.03] p-5 ring-1 ring-ink/[0.05]">
      <p className="text-sm text-mute">{t('profitMargin')}</p>
      <p className={`mt-1 font-display text-3xl font-semibold tracking-tight tabular-nums ${margin < 0 ? 'text-red-700' : ''}`}>{margin}%</p>
      <div aria-hidden="true" className="mt-4 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {spent > 0 && <span className="h-full rounded-l-full bg-clay/80" style={{ width: `${spent * 100}%` }} />}
        {spent < 1 && <span className="h-full flex-1 rounded-r-full bg-sage" />}
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-clay/80" />
          <span className="flex-1 text-mute">{t('operatingExpenses')}</span>
          <span className="tabular-nums">{Math.round(spent * 100)}%</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sage" />
          <span className="flex-1 text-mute">{t('estProfit')}</span>
          <span className="tabular-nums">{Math.round((1 - spent) * 100)}%</span>
        </li>
      </ul>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  bar = 'bg-sage',
}: {
  title: string;
  rows: { key: string; label: string; value: number; note?: string }[];
  bar?: string;
}) {
  const { t } = useT();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <Card>
      <h3 className="mb-5 font-display text-base font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-mute">{t('nothingRecorded')}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {r.label}
                  {r.note && <span className="ml-2 text-mute">{r.note}</span>}
                </span>
                <span className="font-medium tabular-nums">{formatCents(r.value)}</span>
              </div>
              <div aria-hidden="true" className="mt-2 h-2 rounded-full bg-ink/[0.05]">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${(Math.max(r.value, 0) / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MonthTable({ report: r }: { report: Report }) {
  const { t, lang } = useT();
  const th = 'px-3 py-2.5 text-right text-xs font-medium first:rounded-l-lg first:pl-3 first:text-left last:rounded-r-lg';
  const td = 'px-3 py-3 text-right tabular-nums first:pl-3 first:text-left';
  return (
    <Card className="min-w-0">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-mute">
            <tr className="bg-ink/[0.04]">
              <th scope="col" className={th}>{t('monthCol')}</th>
              <th scope="col" className={th}>{t('netRevenue')}</th>
              <th scope="col" className={th}>{t('operatingExpenses')}</th>
              <th scope="col" className={th}>{t('estProfit')}</th>
              <th scope="col" className={th}>{t('payments')}</th>
              <th scope="col" className={th}>{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {r.months.map((m) => (
              <tr key={m.month} className="border-b border-ink/[0.06] transition-colors last:border-0 hover:bg-ink/[0.02]">
                <th scope="row" className={`${td} font-normal`}>{formatMonth(m.month, lang)}</th>
                <td className={td}>{formatCents(m.net)}</td>
                <td className={td}>{formatCents(m.expenses)}</td>
                <td className={`${td} font-medium`}>{formatCents(m.profit)}</td>
                <td className={td}>{m.payment_count}</td>
                <td className={td}>
                  <StatusBadge status={m.status} />
                </td>
              </tr>
            ))}
            <tr className="border-t border-ink/15 font-medium">
              <th scope="row" className={`${td} font-medium`}>{year(r)}</th>
              <td className={td}>{formatCents(r.net)}</td>
              <td className={td}>{formatCents(r.expenses)}</td>
              <td className={td}>{formatCents(r.profit)}</td>
              <td className={td}>{r.payment_count}</td>
              <td className={td} />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const year = (r: Report) => r.from.slice(0, 4);

/* ───────────────────────────── Monthly closing ───────────────────────────── */

const STEPS = ['payments', 'refunds', 'expenses', 'results'] as const;

function Closing({ lists }: { lists: Lists }) {
  const { t, lang } = useT();
  const [month, setMonth] = useState(() => addMonths(thisMonth(), -1));
  const [version, setVersion] = useState(0);
  const [periodResult, setPeriodResult] = useState<{ key: string; period: Period | null }>({ key: '', period: null });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<Flash>(null);
  const [dialog, setDialog] = useState<'close' | 'reopen' | null>(null);
  const { report: r, failed } = useReport(month, monthEnd(month), version);
  const names = useNames(lists);
  const label = formatMonth(month, lang);
  const ended = month < thisMonth();

  const periodKey = `${month}|${version}`;
  // undefined while loading; null = never closed.
  const period = periodResult.key === periodKey ? periodResult.period : undefined;
  useEffect(() => {
    let stale = false;
    loadPeriod(month)
      .then((p) => !stale && setPeriodResult({ key: periodKey, period: p }))
      .catch(() => !stale && setPeriodResult({ key: periodKey, period: null }));
    return () => {
      stale = true;
    };
  }, [month, periodKey]);

  const go = (n: number) => {
    setMonth((m) => addMonths(m, n));
    setChecked(new Set());
    setFlash(null);
  };
  const done = (text: string) => {
    setDialog(null);
    setChecked(new Set());
    setFlash({ tone: 'success', text });
    setVersion((v) => v + 1);
  };
  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  const closed = period?.status === 'CLOSED';
  const staffName = (id: string | null) => lists.staff.find((s) => s.user_id === id)?.full_name ?? '—';

  const steps: Record<(typeof STEPS)[number], { title: TextKey; body: string; notes?: ReactNode }> | null = r && {
    payments: { title: 'stepPayments', body: t('stepPaymentsBody', { n: String(r.payment_count), amount: formatCents(r.gross) }) },
    refunds: {
      title: 'stepRefunds',
      body: t('stepRefundsBody', {
        refunds: String(r.refund_count),
        amount: formatCents(r.refunds),
        voids: String(r.void_count),
        expenseVoids: String(r.expense_void_count),
      }),
    },
    expenses: {
      title: 'stepExpenses',
      body: t('stepExpensesBody', { n: String(r.expense_count), amount: formatCents(r.expenses) }),
      notes: (r.estimate_count > 0 || r.unpaid_count > 0) && (
        <div className="mt-3 grid gap-2">
          {r.estimate_count > 0 && <Notice tone="info">{t('estimatesWarn', { n: String(r.estimate_count) })}</Notice>}
          {r.unpaid_count > 0 && (
            <Notice tone="info">{t('unpaidInfo', { n: String(r.unpaid_count), amount: formatCents(r.expenses_outstanding) })}</Notice>
          )}
        </div>
      ),
    },
    results: {
      title: 'stepResults',
      body: t('stepResultsBody', { net: formatCents(r.net), expenses: formatCents(r.expenses), profit: formatCents(r.profit) }),
    },
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Stepper label={label} prev={() => go(-1)} next={() => go(1)} prevLabel={t('prevMonth')} nextLabel={t('nextMonth')} />
        {period !== undefined && <StatusBadge status={closed ? 'CLOSED' : 'OPEN'} />}
        <div className="ml-auto">
          <Button variant="secondary" disabled={!r} onClick={() => r && downloadCsv(`report-${month.slice(0, 7)}.csv`, reportRows(r, names))}>
            <Download {...ICON} size={16} />
            <span className="sr-only sm:not-sr-only">{t('exportCsv')}</span>
          </Button>
        </div>
      </div>

      {flash && (
        <div className="mb-4">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}

      {failed ? (
        <Notice tone="error">{t('reportLoadFailed')}</Notice>
      ) : !steps || period === undefined ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <Card className="max-w-3xl">
          {closed ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {t('closedBy', { name: staffName(period!.closed_by), when: when(period!.closed_at!), n: String(period!.version) })}
              </p>
              <Button variant="secondary" onClick={() => setDialog('reopen')}>
                {t('reopen')}
              </Button>
            </div>
          ) : (
            <p className="mb-5 max-w-[65ch] text-pretty text-sm text-mute">
              {ended ? t('closingIntro') : t('closingNotEnded', { month: label })}
            </p>
          )}
          {period?.reopened_at && !closed && (
            <div className="mb-5">
              <Notice tone="info">{t('lastReopened', { when: when(period.reopened_at), reason: period.reopen_reason })}</Notice>
            </div>
          )}
          <ol className="grid gap-3">
            {STEPS.map((id, i) => {
              const s = steps[id];
              const on = closed || checked.has(id);
              return (
                <li key={id} className="rounded-xl bg-cream/60 p-4 ring-1 ring-ink/10">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        <span className="mr-2 text-mute tabular-nums">{i + 1}.</span>
                        {t(s.title)}
                      </p>
                      <p className="mt-1 text-sm text-mute tabular-nums">{s.body}</p>
                    </div>
                    {closed ? (
                      <CircleCheck {...ICON} className="shrink-0 text-sage" />
                    ) : (
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-sage"
                          checked={on}
                          disabled={!ended}
                          onChange={(e) =>
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(id);
                              else next.delete(id);
                              return next;
                            })
                          }
                        />
                        {t('stepChecked')}
                      </label>
                    )}
                  </div>
                  {s.notes}
                </li>
              );
            })}
          </ol>
          {!closed && (
            <div className="mt-5 flex justify-end">
              <Button disabled={!ended || checked.size < STEPS.length} onClick={() => setDialog('close')}>
                <Lock {...ICON} size={16} />
                {t('closeMonth', { month: label })}
              </Button>
            </div>
          )}
        </Card>
      )}

      {r && (
        <CloseDialog
          open={dialog === 'close'}
          month={month}
          report={r}
          onClose={() => setDialog(null)}
          onDone={() => done(t('monthClosedDone', { month: label }))}
        />
      )}
      <ReopenDialog
        open={dialog === 'reopen'}
        month={month}
        onClose={() => setDialog(null)}
        onDone={() => done(t('monthReopened', { month: label }))}
      />
    </>
  );
}

function CloseDialog({ open, month, report: r, onClose, onDone }: { open: boolean; month: string; report: Report; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = formatMonth(month, lang);
  return (
    <Dialog open={open} onClose={onClose} title={t('closeMonth', { month: label })}>
      <dl className="mb-4 grid grid-cols-2 gap-4">
        <Stat label={t('netRevenue')} value={formatCents(r.net)} />
        <Stat label={t('operatingExpenses')} value={formatCents(r.expenses)} />
        <Stat label={t('estProfit')} value={formatCents(r.profit)} />
      </dl>
      <p className="mb-5 text-sm text-mute">{t('closeConfirm', { month: label })}</p>
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            closePeriod(month)
              .then(onDone)
              .catch((e) => setError(errorText(t, e)))
              .finally(() => setBusy(false));
          }}
        >
          <Lock {...ICON} size={16} />
          {t('closeMonth', { month: label })}
        </Button>
      </div>
    </Dialog>
  );
}

function ReopenDialog({ open, month, onClose, onDone }: { open: boolean; month: string; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog open={open} onClose={onClose} title={t('reopenTitle', { month: formatMonth(month, lang) })}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return setError(t('enterReason'));
          setBusy(true);
          setError('');
          reopenPeriod(month, reason.trim())
            .then(() => {
              setReason('');
              onDone();
            })
            .catch((err) => setError(errorText(t, err)))
            .finally(() => setBusy(false));
        }}
      >
        <p className="mb-4 text-sm text-mute">{t('reopenBody')}</p>
        <TextField label={t('reason')} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} error={error} />
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('reopen')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
