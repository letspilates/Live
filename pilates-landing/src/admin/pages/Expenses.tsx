// Expenses (owner): what the studio spends, month by month, and recurring
// expenses that create one unpaid expense per month. Owners write the tables
// directly (RLS: owner only, no deletes); the database locks closed months and
// keeps every change in the audit log.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, RefreshCw, Repeat, Search, X } from 'lucide-react';
import {
  PAY_METHODS,
  addMonths,
  expenseTotals,
  formatMonth,
  loadCategories,
  loadExpenses,
  loadRules,
  parseSignedCents,
  toCsv,
  type Category,
  type Expense,
  type Rule,
} from '../expenses';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { centsInput, formatCents, formatDay, laToday, parseCents } from '../payments';
import { supabase } from '../supabase';
import { Button, Card, Dialog, Notice, Skeleton, TextField, inputCls } from '../ui';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
const PAY_KEY = (code: string) => `pay${code}` as TextKey;

type T = ReturnType<typeof useT>['t'];
type Staff = { user_id: string; full_name: string };
type Lists = { categories: Category[]; staff: Staff[] };
type Flash = { tone: 'success' | 'error'; text: string } | null;

function errorText(t: T, error: { code?: string }): string {
  return error.code === 'LPCLS' ? t('expenseMonthClosed') : error.code === '42501' ? t('noPermission') : t('somethingWrong');
}

const thisMonth = () => `${laToday().slice(0, 8)}01`;

export default function Expenses() {
  const { t } = useT();
  const [tab, setTab] = useState<'expenses' | 'recurring'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'recurring' ? 'recurring' : 'expenses',
  );
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  const load = () =>
    // Create this month's recurring expenses first, so the list already has them.
    Promise.resolve(supabase!.rpc('generate_recurring_expenses'))
      .then(({ data: created }) => {
        if (created) setFlash({ tone: 'success', text: t('expensesCreated', { n: String(created) }) });
        return Promise.all([
          loadCategories(),
          supabase!.from('staff_profiles').select('user_id,full_name').eq('status', 'ACTIVE').order('full_name'),
        ]);
      })
      .then(([categories, staff]) => setLists({ categories, staff: (staff.data as Staff[]) ?? [] }))
      .catch(() => setFailed(true));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, []);

  const show = (next: typeof tab) => {
    setTab(next);
    setFlash(null);
    window.history.replaceState(null, '', next === 'expenses' ? '?' : '?tab=recurring');
  };

  return (
    <Layout title={t('navExpenses')}>
      <div role="tablist" aria-label={t('navExpenses')} className="mb-6 inline-flex rounded-full bg-sand p-1">
        {(['expenses', 'recurring'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => show(id)}
            className={`min-h-10 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
              tab === id ? 'bg-ink text-cream' : 'text-mute hover:text-ink'
            }`}
          >
            {t(id === 'expenses' ? 'tabExpenses' : 'tabRecurring')}
          </button>
        ))}
      </div>

      {flash && (
        <div className="mb-4">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}

      {failed ? (
        <div className="max-w-xl">
          <Notice tone="error">{t('expensesLoadFailed')}</Notice>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              setFailed(false);
              load();
            }}
          >
            {t('tryAgain')}
          </Button>
        </div>
      ) : !lists ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : tab === 'expenses' ? (
        <ExpenseList lists={lists} setFlash={setFlash} />
      ) : (
        <RuleList lists={lists} setFlash={setFlash} />
      )}
    </Layout>
  );
}

function useCategoryName() {
  const { lang } = useT();
  return (categories: Category[], code: string) => {
    const c = categories.find((x) => x.code === code);
    return c ? (lang === 'ko' ? c.name_ko : c.name_en) : code;
  };
}

/* ───────────────────────────── Expenses of one month ───────────────────────────── */

type StatusFilter = '' | 'UNPAID' | 'PAID' | 'VOID';

function ExpenseList({ lists, setFlash }: { lists: Lists; setFlash: (f: Flash) => void }) {
  const { t, lang } = useT();
  const categoryName = useCategoryName();
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<{ expense: Expense | null; paying?: boolean } | null>(null);

  useEffect(() => {
    let stale = false;
    loadExpenses(month)
      .then((r) => !stale && (setRows(r), setFailed(false)))
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [month, version]);

  const goMonth = (n: number) => {
    setRows(null);
    setMonth((m) => addMonths(m, n));
  };

  const sums = useMemo(() => expenseTotals(rows ?? []), [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!category || r.category === category) &&
        (!status || (status === 'VOID' ? r.status === 'VOID' : r.status === 'ACTIVE' && r.payment_status === status)) &&
        (!q || r.description.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q)),
    );
  }, [rows, category, status, query]);

  const exportCsv = () => {
    const staffName = (id: string | null) => lists.staff.find((s) => s.user_id === id)?.full_name ?? '';
    const csv = toCsv([
      ['Date', 'Category', 'Description', 'Vendor', 'Amount', 'Status', 'Paid on', 'Paid with', 'Due date', 'Recurring', 'Estimate', 'Staff', 'Note', 'Void reason'],
      ...(rows ?? []).map((r) => [
        r.expense_date,
        categoryName(lists.categories, r.category),
        r.description,
        r.vendor,
        r.amount_cents / 100,
        r.status === 'VOID' ? 'Void' : r.payment_status === 'PAID' ? 'Paid' : 'Unpaid',
        r.paid_on ?? '',
        r.payment_method ?? '',
        r.due_date ?? '',
        r.recurring_rule_id ? 'Yes' : '',
        r.is_estimate ? 'Yes' : '',
        staffName(r.payee_staff_id),
        r.notes,
        r.void_reason,
      ]),
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv' }));
    a.download = `expenses-${month.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <IconButton label={t('prevMonth')} onClick={() => goMonth(-1)}>
            <ChevronLeft {...ICON} />
          </IconButton>
          <h2 className="min-w-36 text-center font-display text-lg font-semibold tabular-nums">{formatMonth(month, lang)}</h2>
          <IconButton label={t('nextMonth')} onClick={() => goMonth(1)}>
            <ChevronRight {...ICON} />
          </IconButton>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setVersion((v) => v + 1)} title={t('refresh')}>
            <RefreshCw {...ICON} size={16} />
            <span className="sr-only sm:not-sr-only">{t('refresh')}</span>
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={!rows?.length}>
            <Download {...ICON} size={16} />
            <span className="sr-only sm:not-sr-only">{t('exportCsv')}</span>
          </Button>
          <Button onClick={() => setOpen({ expense: null })}>
            <Plus {...ICON} size={16} />
            {t('addExpense')}
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label={t('expenseTotal')} value={rows ? formatCents(sums.total) : '—'} strong />
          <Stat label={t('PAID')} value={rows ? formatCents(sums.paid) : '—'} />
          <Stat
            label={sums.unpaidCount ? t('unpaidCount', { n: String(sums.unpaidCount) }) : t('UNPAID')}
            value={rows ? formatCents(sums.unpaid) : '—'}
          />
        </dl>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        <label className="relative col-span-2 block sm:min-w-64 sm:flex-1">
          <span className="sr-only">{t('searchExpenses')}</span>
          <Search {...ICON} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
          <input
            type="search"
            value={query}
            placeholder={t('searchExpenses')}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputCls} pl-11`}
          />
        </label>
        <select aria-label={t('category')} value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} sm:w-auto`}>
          <option value="">{t('allCategories')}</option>
          {lists.categories.map((c) => (
            <option key={c.code} value={c.code}>
              {categoryName(lists.categories, c.code)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className={`${inputCls} sm:w-auto`}
        >
          <option value="">{t('allStatuses')}</option>
          <option value="UNPAID">{t('UNPAID')}</option>
          <option value="PAID">{t('PAID')}</option>
          <option value="VOID">{t('statusVoid')}</option>
        </select>
      </div>

      {failed ? (
        <div className="max-w-xl">
          <Notice tone="error">{t('expensesLoadFailed')}</Notice>
          <Button variant="secondary" className="mt-4" onClick={() => setVersion((v) => v + 1)}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : !rows ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : shown.length === 0 ? (
        <Card>
          <p className="text-sm text-mute">{rows.length ? t('noExpensesMatch') : t('noExpenses', { month: formatMonth(month, lang) })}</p>
        </Card>
      ) : (
        <Card className="p-2 sm:p-2">
          <ul className="divide-y divide-ink/10">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={() => setOpen({ expense: r })}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
                >
                  <span className="w-12 shrink-0 text-xs text-mute">{formatDay(r.expense_date, lang).replace(/^[^,]*, /, '')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`truncate text-sm font-medium ${r.status === 'VOID' ? 'text-mute line-through' : ''}`}>
                        {r.description}
                      </span>
                      {r.recurring_rule_id && (
                        <span title={t('recurringTag')} className="inline-flex text-mute">
                          <Repeat {...ICON} size={14} />
                          <span className="sr-only">{t('recurringTag')}</span>
                        </span>
                      )}
                      {r.is_estimate && r.status === 'ACTIVE' && <Tag>{t('estimate')}</Tag>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-mute">
                      {[categoryName(lists.categories, r.category), r.vendor].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-sm font-semibold tabular-nums ${r.status === 'VOID' ? 'text-mute line-through' : ''}`}>
                      {formatCents(r.amount_cents)}
                    </span>
                    <span className="block text-xs text-mute">
                      {r.status === 'VOID'
                        ? t('statusVoid')
                        : r.payment_status === 'PAID'
                          ? `${t('PAID')} ${r.paid_on ? formatDay(r.paid_on, lang).replace(/^[^,]*, /, '') : ''}`
                          : t('UNPAID')}
                    </span>
                  </span>
                </button>
                {r.status === 'ACTIVE' && r.payment_status === 'UNPAID' && (
                  <Button variant="secondary" className="hidden px-4 sm:inline-flex" onClick={() => setOpen({ expense: r, paying: true })}>
                    {t('markPaid')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {open && (
        <ExpenseDialog
          expense={open.expense}
          paying={open.paying}
          month={month}
          lists={lists}
          onClose={() => setOpen(null)}
          onDone={(text) => {
            setOpen(null);
            setFlash({ tone: 'success', text });
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}

/* ───────────────────────────── Add / edit / pay / void one expense ───────────────────────────── */

function ExpenseDialog({
  expense: e,
  paying = false,
  month,
  lists,
  onClose,
  onDone,
}: {
  expense: Expense | null;
  paying?: boolean;
  month: string;
  lists: Lists;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { t } = useT();
  const today = laToday();
  const categoryName = useCategoryName();
  const [form, setForm] = useState({
    category: e?.category ?? '',
    description: e?.description ?? '',
    amount: e ? centsInput(e.amount_cents) : '',
    expense_date: e?.expense_date ?? (today.startsWith(month.slice(0, 8)) ? today : month),
    due_date: e?.due_date ?? '',
    vendor: e?.vendor ?? '',
    payee_staff_id: e?.payee_staff_id ?? '',
    is_estimate: e?.is_estimate ?? false,
    paid: paying || e?.payment_status === 'PAID',
    paid_on: e?.paid_on ?? today,
    payment_method: e?.payment_method ?? '',
    notes: e?.notes ?? '',
  });
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'category' | 'description' | 'amount' | 'notes' | 'method' | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const locked = e?.status === 'VOID';

  const save = async () => {
    const cents = parseSignedCents(form.amount);
    const next: typeof errors = {};
    if (!form.category) next.category = t('chooseCategory');
    if (!form.description.trim()) next.description = t('enterDescription');
    if (cents === null || Math.abs(cents) > 10_000_000) next.amount = t('enterExpenseAmount');
    else if (cents < 0 && !form.notes.trim()) next.notes = t('creditNeedsNote');
    if (form.paid && !form.payment_method) next.method = t('choosePaidWith');
    setErrors(next);
    if (Object.keys(next).length || busy) return;
    setBusy(true);
    const row = {
      category: form.category,
      description: form.description.trim(),
      vendor: form.vendor.trim(),
      amount_cents: cents,
      expense_date: form.expense_date,
      due_date: form.due_date || null,
      payee_staff_id: form.category === 'INSTRUCTOR_PAY' ? form.payee_staff_id || null : null,
      is_estimate: form.is_estimate,
      payment_status: form.paid ? 'PAID' : 'UNPAID',
      paid_on: form.paid ? form.paid_on : null,
      payment_method: form.paid ? form.payment_method : null,
      notes: form.notes.trim(),
    };
    const { error } = e ? await supabase!.from('expenses').update(row).eq('id', e.id) : await supabase!.from('expenses').insert(row);
    setBusy(false);
    if (error) return setErrors({ form: errorText(t, error) });
    onDone(t('expenseSaved'));
  };

  const voidIt = async () => {
    if (!e || busy) return;
    if (!voidReason.trim()) return setErrors({ form: t('enterReason') });
    setBusy(true);
    const { error } = await supabase!.from('expenses').update({ status: 'VOID', void_reason: voidReason.trim() }).eq('id', e.id);
    setBusy(false);
    if (error) return setErrors({ form: errorText(t, error) });
    onDone(t('expenseVoided'));
  };

  return (
    <Dialog open onClose={onClose} title={e ? (paying ? t('markPaid') : t('editExpense')) : t('addExpense')}>
      <CloseButton onClose={onClose} />
      {locked ? (
        <div className="grid gap-3">
          <p className="text-sm">
            <span className="font-medium">{e.description}</span> · {formatCents(e.amount_cents)}
          </p>
          <Notice tone="info">{t('expenseIsVoid', { reason: e.void_reason })}</Notice>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            void save();
          }}
        >
          {e?.recurring_rule_id && <p className="text-xs text-mute">{t('fromRecurring')}</p>}
          <FieldSelect label={t('category')} value={form.category} error={errors.category} onChange={(v) => set('category', v)}>
            <option value="">{t('chooseCategory')}</option>
            {lists.categories.map((c) => (
              <option key={c.code} value={c.code}>
                {categoryName(lists.categories, c.code)}
              </option>
            ))}
          </FieldSelect>
          <TextField
            label={t('description')}
            maxLength={200}
            value={form.description}
            error={errors.description}
            onChange={(ev) => set('description', ev.target.value)}
          />
          <TextField
            label={t('amount')}
            inputMode="decimal"
            value={form.amount}
            hint={t('creditHint')}
            error={errors.amount}
            onChange={(ev) => set('amount', ev.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_estimate} onChange={(ev) => set('is_estimate', ev.target.checked)} className="h-4 w-4 accent-sage" />
            {t('estimateCheck')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <DateField label={t('expenseDate')} value={form.expense_date} onChange={(v) => set('expense_date', v)} required />
            <DateField label={t('dueDate')} value={form.due_date} onChange={(v) => set('due_date', v)} />
          </div>
          <TextField label={t('vendor')} maxLength={120} value={form.vendor} onChange={(ev) => set('vendor', ev.target.value)} />
          {form.category === 'INSTRUCTOR_PAY' && (
            <FieldSelect label={t('payeeStaff')} value={form.payee_staff_id} onChange={(v) => set('payee_staff_id', v)}>
              <option value="">{t('notSelected')}</option>
              {lists.staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </FieldSelect>
          )}

          <fieldset className="grid gap-3 rounded-2xl bg-cream/60 p-4">
            <legend className="sr-only">{t('status')}</legend>
            <div role="radiogroup" className="inline-flex w-fit rounded-full bg-sand p-1">
              {[false, true].map((paid) => (
                <button
                  key={String(paid)}
                  type="button"
                  role="radio"
                  aria-checked={form.paid === paid}
                  onClick={() => set('paid', paid)}
                  className={`min-h-10 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
                    form.paid === paid ? 'bg-ink text-cream' : 'text-mute hover:text-ink'
                  }`}
                >
                  {t(paid ? 'PAID' : 'UNPAID')}
                </button>
              ))}
            </div>
            {form.paid && (
              <div className="grid grid-cols-2 gap-3">
                <DateField label={t('paidOn')} value={form.paid_on} onChange={(v) => set('paid_on', v)} required />
                <FieldSelect label={t('paidWith')} value={form.payment_method} error={errors.method} onChange={(v) => set('payment_method', v)}>
                  <option value="">—</option>
                  {PAY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(PAY_KEY(m))}
                    </option>
                  ))}
                </FieldSelect>
              </div>
            )}
          </fieldset>

          <TextField label={t('note')} maxLength={1000} value={form.notes} error={errors.notes} onChange={(ev) => set('notes', ev.target.value)} />
          {errors.form && <Notice tone="error">{errors.form}</Notice>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('saving') : t('saveExpense')}
            </Button>
          </div>

          {e && (
            <div className="border-t border-ink/10 pt-4">
              {!voiding ? (
                <button type="button" onClick={() => setVoiding(true)} className="min-h-11 text-sm font-medium text-red-700 hover:underline">
                  {t('voidExpense')}
                </button>
              ) : (
                <div className="grid gap-3">
                  <p className="text-sm text-mute">{t('voidExpenseNote')}</p>
                  <TextField label={t('reason')} maxLength={500} value={voidReason} onChange={(ev) => setVoidReason(ev.target.value)} />
                  <div className="flex justify-end">
                    <Button variant="danger" disabled={busy} onClick={() => void voidIt()}>
                      {t('voidExpense')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      )}
    </Dialog>
  );
}

/* ───────────────────────────── Recurring rules ───────────────────────────── */

function RuleList({ lists, setFlash }: { lists: Lists; setFlash: (f: Flash) => void }) {
  const { t, lang } = useT();
  const categoryName = useCategoryName();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<{ rule: Rule | null } | null>(null);

  useEffect(() => {
    loadRules()
      .then((r) => (setRules(r), setFailed(false)))
      .catch(() => setFailed(true));
  }, [version]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <p className="max-w-[70ch] flex-1 text-pretty text-sm text-mute">{t('recurringHint')}</p>
        <Button onClick={() => setOpen({ rule: null })}>
          <Plus {...ICON} size={16} />
          {t('addRule')}
        </Button>
      </div>
      {failed ? (
        <Notice tone="error">{t('expensesLoadFailed')}</Notice>
      ) : !rules ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : rules.length === 0 ? (
        <Card>
          <p className="text-sm text-mute">{t('noRules')}</p>
        </Card>
      ) : (
        <Card className="p-2 sm:p-2">
          <ul className="divide-y divide-ink/10">
            {rules.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpen({ rule: r })}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`truncate text-sm font-medium ${r.active ? '' : 'text-mute'}`}>{r.description}</span>
                      {r.is_estimate && <Tag>{t('estimate')}</Tag>}
                      {!r.active && <Tag>{t('ruleOff')}</Tag>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-mute">
                      {[
                        categoryName(lists.categories, r.category),
                        t('dueDayN', { n: String(r.due_day) }),
                        `${formatMonth(r.start_month, lang)} – ${r.end_month ? formatMonth(r.end_month, lang) : t('noEnd')}`,
                      ].join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{t('perMonth', { amount: formatCents(r.amount_cents) })}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {open && (
        <RuleDialog
          rule={open.rule}
          lists={lists}
          onClose={() => setOpen(null)}
          onDone={async () => {
            setOpen(null);
            const { data } = await supabase!.rpc('generate_recurring_expenses');
            setFlash({ tone: 'success', text: data ? `${t('ruleSaved')} ${t('expensesCreated', { n: String(data) })}` : t('ruleSaved') });
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}

function RuleDialog({ rule: r, lists, onClose, onDone }: { rule: Rule | null; lists: Lists; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const categoryName = useCategoryName();
  const [form, setForm] = useState({
    category: r?.category ?? '',
    description: r?.description ?? '',
    vendor: r?.vendor ?? '',
    amount: r ? centsInput(r.amount_cents) : '',
    due_day: String(r?.due_day ?? 1),
    start_month: (r?.start_month ?? thisMonth()).slice(0, 7),
    end_month: r?.end_month?.slice(0, 7) ?? '',
    is_estimate: r?.is_estimate ?? false,
    payee_staff_id: r?.payee_staff_id ?? '',
    active: r?.active ?? true,
    applyNow: false,
  });
  const [errors, setErrors] = useState<Partial<Record<'category' | 'description' | 'amount' | 'due_day' | 'end' | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cents = parseCents(form.amount);
  const amountChanged = r && cents !== null && cents !== r.amount_cents;

  const save = async () => {
    const day = Number(form.due_day);
    const next: typeof errors = {};
    if (!form.category) next.category = t('chooseCategory');
    if (!form.description.trim()) next.description = t('enterDescription');
    if (cents === null || cents > 10_000_000) next.amount = t('enterAmount');
    if (!Number.isInteger(day) || day < 1 || day > 31) next.due_day = t('dueDayHint');
    const ym = /^\d{4}-\d{2}$/;
    if (!ym.test(form.start_month) || (form.end_month && !ym.test(form.end_month))) next.end = t('monthFormat');
    else if (form.end_month && form.end_month < form.start_month) next.end = t('endBeforeStart');
    setErrors(next);
    if (Object.keys(next).length || busy) return;
    setBusy(true);
    const row = {
      category: form.category,
      description: form.description.trim(),
      vendor: form.vendor.trim(),
      amount_cents: cents,
      due_day: day,
      start_month: `${form.start_month}-01`,
      end_month: form.end_month ? `${form.end_month}-01` : null,
      is_estimate: form.is_estimate,
      payee_staff_id: form.category === 'INSTRUCTOR_PAY' ? form.payee_staff_id || null : null,
      active: form.active,
    };
    let { error } = r
      ? await supabase!.from('recurring_expense_rules').update(row).eq('id', r.id)
      : await supabase!.from('recurring_expense_rules').insert(row);
    if (!error && r && amountChanged && form.applyNow) {
      // Months already created keep their amount; only this month's unpaid one follows, when asked.
      ({ error } = await supabase!
        .from('expenses')
        .update({ amount_cents: cents })
        .eq('recurring_rule_id', r.id)
        .eq('period_month', thisMonth())
        .eq('payment_status', 'UNPAID')
        .eq('status', 'ACTIVE'));
    }
    setBusy(false);
    if (error) return setErrors({ form: errorText(t, error) });
    onDone();
  };

  return (
    <Dialog open onClose={onClose} title={r ? t('editRule') : t('addRule')}>
      <CloseButton onClose={onClose} />
      <form
        className="grid gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          void save();
        }}
      >
        <FieldSelect label={t('category')} value={form.category} error={errors.category} onChange={(v) => set('category', v)}>
          <option value="">{t('chooseCategory')}</option>
          {lists.categories.map((c) => (
            <option key={c.code} value={c.code}>
              {categoryName(lists.categories, c.code)}
            </option>
          ))}
        </FieldSelect>
        <TextField
          label={t('description')}
          maxLength={200}
          value={form.description}
          error={errors.description}
          onChange={(ev) => set('description', ev.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t('amount')} inputMode="decimal" value={form.amount} error={errors.amount} onChange={(ev) => set('amount', ev.target.value)} />
          <TextField
            label={t('dueDay')}
            inputMode="numeric"
            value={form.due_day}
            error={errors.due_day}
            onChange={(ev) => set('due_day', ev.target.value)}
          />
        </div>
        <p className="-mt-2 text-xs text-mute">{t('dueDayHint')}</p>
        {amountChanged && (
          <label className="flex items-start gap-2 rounded-xl bg-cream/60 p-3 text-sm">
            <input type="checkbox" checked={form.applyNow} onChange={(ev) => set('applyNow', ev.target.checked)} className="mt-0.5 h-4 w-4 accent-sage" />
            <span>
              {t('applyThisMonth')}
              <span className="block text-xs text-mute">{t('pastMonthsKept')}</span>
            </span>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_estimate} onChange={(ev) => set('is_estimate', ev.target.checked)} className="h-4 w-4 accent-sage" />
          {t('estimateCheck')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <MonthField label={t('startMonth')} value={form.start_month} onChange={(v) => v && set('start_month', v)} />
          <MonthField label={t('endMonth')} value={form.end_month} error={errors.end} onChange={(v) => set('end_month', v)} />
        </div>
        <TextField label={t('vendor')} maxLength={120} value={form.vendor} onChange={(ev) => set('vendor', ev.target.value)} />
        {form.category === 'INSTRUCTOR_PAY' && (
          <FieldSelect label={t('payeeStaff')} value={form.payee_staff_id} onChange={(v) => set('payee_staff_id', v)}>
            <option value="">{t('notSelected')}</option>
            {lists.staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name}
              </option>
            ))}
          </FieldSelect>
        )}
        {r && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(ev) => set('active', ev.target.checked)} className="h-4 w-4 accent-sage" />
            {t('ruleActiveCheck')}
          </label>
        )}
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ───────────────────────────── Small parts ───────────────────────────── */

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className={`truncate font-display font-semibold tabular-nums ${strong ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>{value}</dd>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full bg-clay/20 px-2 py-0.5 text-xs font-medium text-ink">{children}</span>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
    >
      {children}
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t('close')}
      className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink/[0.05]"
    >
      <X {...ICON} />
    </button>
  );
}

function FieldSelect({
  label,
  value,
  error,
  onChange,
  children,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} className={inputCls}>
        {children}
      </select>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </label>
  );
}

function DateField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        type="date"
        value={value}
        required={required}
        onChange={(e) => (e.target.value || !required) && onChange(e.target.value)}
        className={`${inputCls} py-2.5`}
      />
    </label>
  );
}

function MonthField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input type="month" value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} px-3 py-2.5`} />
      {error && <span className="text-sm text-red-700">{error}</span>}
    </label>
  );
}
