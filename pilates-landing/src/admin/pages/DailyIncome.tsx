// Daily Income: every staff member records the payments they receive; staff
// see their own history, owners see every payment with filters and totals.
// The database decides who recorded a payment, its date and who may change it
// (record_payment / correct_payment / void_payment / record_refund).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, CircleCheck, Info, Plus, Receipt, RefreshCw, Search, X } from 'lucide-react';
import { isAdmin, useStaff } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import {
  centsInput,
  formatCents,
  formatDay,
  formatTime,
  laToday,
  loadCollectors,
  loadMethods,
  loadPayments,
  methodLabel,
  parseCents,
  rangeDates,
  totals,
  type Collector,
  type Method,
  type Payment,
  type Range,
  type StudentHit,
} from '../payments';
import { supabase } from '../supabase';
import { Button, Card, CardTitle, Chip, Dialog, Initials, Notice, Skeleton, TextField, inputCls } from '../ui';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
const LAST_METHOD_KEY = 'lp-admin-last-method';

type T = ReturnType<typeof useT>['t'];
type DbError = { code?: string; message?: string };

function errorText(t: T, error: DbError): string {
  switch (error.code) {
    case 'LPCLS':
      return t('monthClosed');
    case 'LPDAY':
      return t('sameDayOnly');
    case '42501':
      return t('noPermission');
    default:
      return t('somethingWrong');
  }
}

export default function DailyIncome() {
  const { t } = useT();
  const owner = isAdmin(useStaff());
  // Only owners/admins get the Transactions tab; everyone sees the day's payments next to the form.
  const [tab, setTab] = useState<'record' | 'history'>(() =>
    owner && new URLSearchParams(window.location.search).get('tab') === 'history' ? 'history' : 'record',
  );
  const [saves, setSaves] = useState(0);
  const [data, setData] = useState<{ methods: Method[]; collectors: Collector[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () =>
    Promise.all([loadMethods(), loadCollectors()])
      .then(([methods, collectors]) => setData({ methods, collectors }))
      .catch(() => setFailed(true));
  useEffect(() => {
    load();
  }, []);

  const show = (next: typeof tab) => {
    setTab(next);
    window.history.replaceState(null, '', next === 'record' ? '?' : '?tab=history');
  };

  return (
    <Layout title={t('navPayments')}>
      {owner && (
        <div role="tablist" aria-label={t('navPayments')} className="mb-6 inline-flex rounded-full bg-ink/[0.06] p-1">
          {(['record', 'history'] as const).map((id) => (
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
              {t(id === 'record' ? 'tabRecord' : 'tabTransactions')}
            </button>
          ))}
        </div>
      )}

      {failed ? (
        <div className="max-w-xl">
          <Notice tone="error">{t('incomeLoadFailed')}</Notice>
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
      ) : !data ? (
        <div className="grid max-w-xl gap-4" aria-busy="true">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : tab === 'record' ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
          <RecordPayment {...data} onSaved={() => setSaves((n) => n + 1)} onShowHistory={owner ? () => show('history') : undefined} />
          <aside className="grid min-w-0 gap-4">
            <DayPayments {...data} saves={saves} onShowAll={owner ? () => show('history') : undefined} />
            <Guide />
          </aside>
        </div>
      ) : (
        <History {...data} />
      )}
    </Layout>
  );
}

/* ───────────────────────────── Record a payment ───────────────────────────── */

function readLastMethod(methods: Method[]): string {
  try {
    const code = window.localStorage.getItem(LAST_METHOD_KEY) ?? '';
    return methods.some((m) => m.code === code) ? code : '';
  } catch {
    return '';
  }
}

function RecordPayment({
  methods,
  collectors,
  onSaved,
  onShowHistory,
}: {
  methods: Method[];
  collectors: Collector[];
  onSaved: () => void;
  onShowHistory?: () => void;
}) {
  const { t, lang } = useT();
  const me = useStaff();
  // Who was handed the money: the person typing, unless they pick someone else.
  const [collector, setCollector] = useState(me.user_id);
  // Owners/admins may record a past day (the database checks it); everyone else records today.
  const canPickDate = isAdmin(me);
  const [day, setDay] = useState(laToday);
  const [client, setClient] = useState<StudentHit | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(() => readLastMethod(methods));
  const [methodOther, setMethodOther] = useState('');
  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  // One id per payment: a resent or double-tapped save is stored once.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [askDuplicate, setAskDuplicate] = useState(false);
  const [saved, setSaved] = useState<Payment | null>(null);

  const cents = parseCents(amount);
  const otherMissing = method === 'OTHER' && !methodOther.trim();
  const methodName = method ? methodLabel(methods, method, lang, methodOther.trim()) : '';

  const pick = (hit: StudentHit) => {
    setClient(hit);
    // The usual case is paying the same as last time: fill it in.
    if (hit.last_amount_cents && !amount.trim()) {
      setAmount(centsInput(hit.last_amount_cents));
      if (hit.last_method && methods.some((m) => m.code === hit.last_method)) setMethod(hit.last_method);
    }
  };

  const save = async (confirmDuplicate = false) => {
    setTried(true);
    if (!client || !cents || !method || otherMissing || busy) return;
    setBusy(true);
    setError('');
    const { data, error: dbError } = await supabase!.rpc('record_payment', {
      p_client_request_id: requestId,
      p_amount_cents: cents,
      p_method: method,
      p_method_other: method === 'OTHER' ? methodOther.trim() : '',
      p_student_id: client.id,
      p_notes: notes.trim(),
      p_confirm_duplicate: confirmDuplicate,
      p_collected_by: collector,
      ...(canPickDate && day !== laToday() ? { p_business_date: day } : {}),
    });
    setBusy(false);
    if (dbError) {
      if (dbError.code === 'LPDUP') setAskDuplicate(true);
      else setError(errorText(t, dbError));
      return;
    }
    setAskDuplicate(false);
    try {
      window.localStorage.setItem(LAST_METHOD_KEY, method);
    } catch {
      /* storage blocked */
    }
    setSaved(data as Payment);
    onSaved();
  };

  const reset = () => {
    setClient(null);
    setAmount('');
    setMethodOther('');
    setNotes('');
    setNoteOpen(false);
    setTried(false);
    setError('');
    setSaved(null);
    setCollector(me.user_id);
    setDay(laToday());
    setRequestId(crypto.randomUUID());
  };

  if (saved) {
    return (
      <Card className="max-w-xl">
        <div className="flex items-start gap-3">
          <CircleCheck {...ICON} size={24} className="mt-0.5 shrink-0 text-sage" />
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">{t('paymentSaved')}</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCents(saved.amount_cents)}</p>
            <p className="mt-1 text-sm text-mute">
              {methodLabel(methods, saved.method, lang, saved.method_other)} · {saved.payer_name} ·{' '}
              {saved.business_date === laToday() ? formatTime(saved.recorded_at) : formatDay(saved.business_date, lang)}
            </p>
            <p className="mt-1 text-sm text-mute">{t('receivedByName', { name: saved.collected_by_name })}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset}>{t('recordAnother')}</Button>
          {onShowHistory && (
            <Button variant="secondary" onClick={onShowHistory}>
              {t('seeHistory')}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card>
        <h2 className="mb-3 text-sm font-medium text-ink">{t('student')}</h2>
        {client ? (
          <>
            <div className="flex items-center gap-3">
              <Initials name={client.full_name} className="h-10 w-10 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{client.full_name}</p>
                {client.phone_last4 && <p className="truncate text-sm text-mute">···{client.phone_last4}</p>}
              </div>
              <Button variant="secondary" className="min-h-10 px-4" onClick={() => setClient(null)}>
                {t('change')}
              </Button>
            </div>
            <ClientHistory clientId={client.id} methods={methods} />
          </>
        ) : (
          <ClientPicker onPick={pick} />
        )}
        {tried && !client && <p className="mt-3 text-sm text-red-700">{t('chooseStudent')}</p>}
      </Card>

      <Card>
        <div className="grid gap-5">
          {canPickDate && (
            <TextField
              label={t('paymentDate')}
              hint={t('paymentDateHint')}
              type="date"
              max={laToday()}
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
          )}
          <TextField
            label={t('amount')}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={tried && !cents ? t('enterAmount') : undefined}
          />
          <MethodFields
            methods={methods}
            method={method}
            other={methodOther}
            onMethod={setMethod}
            onOther={setMethodOther}
            methodError={tried && !method ? t('chooseMethod') : undefined}
            otherError={tried && otherMissing ? t('enterMethodOther') : undefined}
          />
          <CollectorSelect collectors={collectors} value={collector} onChange={setCollector} />
          {noteOpen ? (
            <TextField
              label={t('note')}
              hint={t('noteHint')}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-full text-sm font-medium text-sage-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
            >
              <Plus {...ICON} size={16} />
              {t('addNote')}
            </button>
          )}
        </div>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      {/* Phone: the save button stays under the thumb. */}
      <div className="sticky bottom-0 -mx-4 border-t border-ink/10 bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy
            ? t('saving')
            : cents && method && !otherMissing
              ? t('saveReceived', { amount: formatCents(cents), method: methodName })
              : t('savePayment')}
        </Button>
      </div>

      <Dialog open={askDuplicate} onClose={() => setAskDuplicate(false)} title={t('duplicateTitle')}>
        <p className="text-sm text-mute">
          {t('duplicateBody', { amount: cents ? formatCents(cents) : '', name: client?.full_name ?? '' })}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => setAskDuplicate(false)}>
            {t('cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void save(true)}>
            {t('saveAnyway')}
          </Button>
        </div>
      </Dialog>
    </form>
  );
}

/** Payment method dropdown; "Other" asks what it was. */
function MethodFields({
  methods,
  method,
  other,
  onMethod,
  onOther,
  methodError,
  otherError,
}: {
  methods: Method[];
  method: string;
  other: string;
  onMethod: (code: string) => void;
  onOther: (text: string) => void;
  methodError?: string;
  otherError?: string;
}) {
  const { t, lang } = useT();
  return (
    <>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">{t('method')}</span>
        <select value={method} onChange={(e) => onMethod(e.target.value)} aria-invalid={Boolean(methodError)} className={inputCls}>
          {!method && <option value="">{t('chooseMethodOption')}</option>}
          {methods.map((m) => (
            <option key={m.code} value={m.code}>
              {lang === 'ko' ? m.label_ko : m.label_en}
            </option>
          ))}
        </select>
        {methodError && <span className="text-sm text-red-700">{methodError}</span>}
      </label>
      {method === 'OTHER' && (
        <TextField
          label={t('methodOther')}
          hint={t('methodOtherHint')}
          maxLength={60}
          autoComplete="off"
          value={other}
          onChange={(e) => onOther(e.target.value)}
          error={otherError}
        />
      )}
    </>
  );
}

function CollectorSelect({
  collectors,
  value,
  onChange,
}: {
  collectors: Collector[];
  value: string;
  onChange: (userId: string) => void;
}) {
  const { t } = useT();
  const me = useStaff();
  // The picker always offers the current choice, even if that person was deactivated since.
  const options = collectors.some((c) => c.user_id === value) ? collectors : [...collectors, { user_id: value, full_name: '—' }];
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">{t('receivedBy')}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((c) => (
          <option key={c.user_id} value={c.user_id}>
            {c.user_id === me.user_id ? t('meName', { name: c.full_name }) : c.full_name}
          </option>
        ))}
      </select>
    </label>
  );
}

type HistoryRow = Pick<Payment, 'business_date' | 'kind' | 'status' | 'amount_cents' | 'method' | 'method_other'>;

/** The chosen client's last payments (client_payments: date, amount, method only). */
function ClientHistory({ clientId, methods }: { clientId: string; methods: Method[] }) {
  const { t, lang } = useT();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    let stale = false;
    supabase!.rpc('client_payments', { p_student_id: clientId }).then(({ data }) => !stale && setRows((data as HistoryRow[]) ?? []));
    return () => {
      stale = true;
    };
  }, [clientId]);
  return (
    <section className="mt-4 border-t border-ink/10 pt-3" aria-label={t('paymentHistory')}>
      <h3 className="mb-2 text-xs font-medium text-mute">{t('paymentHistory')}</h3>
      {!rows ? (
        <Skeleton className="h-10 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-mute">{t('noPaymentsYet')}</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((r, i) => (
            <li key={i} className={`flex justify-between gap-4 text-sm ${r.status === 'VOID' ? 'text-mute line-through' : ''}`}>
              <span className="min-w-0 truncate">
                {formatDay(r.business_date, lang)} · {methodLabel(methods, r.method, lang, r.method_other)}
                {r.kind === 'REFUND' ? ` · ${t('refund')}` : ''}
              </span>
              <span className="shrink-0 tabular-nums">
                {r.kind === 'REFUND' ? '−' : ''}
                {formatCents(r.amount_cents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Search the client list. New clients are added on the Clients screen, never here. */
function ClientPicker({ onPick }: { onPick: (hit: StudentHit) => void }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const q = query.trim();
  const searching = q.length >= 2;

  useEffect(() => {
    if (!searching) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      supabase!.rpc('search_students', { p_query: q }).then(({ data, error }) => {
        if (stale) return;
        setFailed(Boolean(error));
        setHits(error ? [] : (data as StudentHit[]));
      });
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [q, searching]);

  return (
    <div className="grid gap-3">
      <label className="relative block">
        <span className="sr-only">{t('searchStudent')}</span>
        <Search {...ICON} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
        <input
          type="search"
          autoComplete="off"
          placeholder={t('searchStudent')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHits(null);
          }}
          className={`${inputCls} pl-11`}
        />
      </label>
      {!searching ? (
        <p className="text-sm text-mute">{t('searchToStart')}</p>
      ) : failed ? (
        <Notice tone="error">{t('somethingWrong')}</Notice>
      ) : !hits ? (
        <div className="grid gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : hits.length === 0 ? (
        <p className="text-sm text-mute">{t('noStudentFound')}</p>
      ) : (
        <ul className="-mx-2 grid gap-1">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onPick(hit)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              >
                <Initials name={hit.full_name} className="h-9 w-9 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{hit.full_name}</span>
                  {hit.phone_last4 && <span className="block truncate text-xs text-mute">···{hit.phone_last4}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────────── The day's payments, beside the form ───────────────────────────── */

function DayPayments({
  methods,
  collectors,
  saves,
  onShowAll,
}: {
  methods: Method[];
  collectors: Collector[];
  saves: number;
  onShowAll?: () => void;
}) {
  const { t, lang } = useT();
  const me = useStaff();
  const owner = isAdmin(me);
  const [day, setDay] = useState(laToday);
  // The database shows staff only their own payments; owners and admins see everyone's.
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<Payment | null>(null);
  const [message, setMessage] = useState('');

  // Moves on to the next day at midnight in Los Angeles.
  useEffect(() => {
    const timer = window.setInterval(() => setDay(laToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let stale = false;
    loadPayments(day, day)
      .then((data) => {
        if (stale) return;
        setRows(data);
        setFailed(false);
      })
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [day, saves, version]);

  const sum = totals(rows ?? []);
  const title = t(owner ? 'dayPayments' : 'myDayPayments', { day: formatDay(day, lang) });

  return (
    <Card pad={false} label={title} className="overflow-hidden">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <CardTitle
          icon={Receipt}
          title={title}
          action={
            onShowAll && (
              <button
                type="button"
                onClick={onShowAll}
                className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full text-sm font-medium text-sage-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              >
                {t('allTransactions')}
                <ChevronRight {...ICON} size={14} />
              </button>
            )
          }
        />
      </div>
      <dl className="grid grid-cols-2 gap-px border-y border-ink/[0.07] bg-ink/[0.07] [&>*]:bg-paper [&>*]:px-5 [&>*]:py-4 sm:[&>*]:px-6">
        <Stat label={t(owner ? 'netRevenue' : 'myNet')} value={formatCents(sum.net)} />
        <Stat label={t('paymentCount')} value={String(sum.count)} />
      </dl>
      {message && (
        <div className="px-5 pt-4 sm:px-6">
          <Notice tone="success">{message}</Notice>
        </div>
      )}
      {failed ? (
        <div className="p-5 sm:px-6">
          <Notice tone="error">{t('incomeLoadFailed')}</Notice>
        </div>
      ) : !rows ? (
        <div className="p-5 sm:px-6">
          <Skeleton className="h-32 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-mute sm:px-6">{t('noPaymentsToday')}</p>
      ) : (
        <ul className="divide-y divide-ink/[0.07] px-2 py-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpen(r)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              >
                <span className="w-16 shrink-0 whitespace-nowrap text-xs tabular-nums text-mute">{formatTime(r.recorded_at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.payer_name}</span>
                    {r.kind === 'REFUND' && <Chip tone="warn">{t('refund')}</Chip>}
                    {r.status === 'VOID' && <Chip>{t('statusVoid')}</Chip>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-mute">
                    {[methodLabel(methods, r.method, lang, r.method_other), owner || r.collected_by !== me.user_id ? r.collected_by_name : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${r.status === 'VOID' ? 'text-mute line-through' : ''}`}>
                  {r.kind === 'REFUND' ? '−' : ''}
                  {formatCents(r.amount_cents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!owner && <p className="border-t border-ink/[0.07] px-5 py-3 text-xs text-mute sm:px-6">{t('dayEditHint')}</p>}

      {open && (
        <PaymentDialog
          payment={open}
          methods={methods}
          collectors={collectors}
          onClose={() => setOpen(null)}
          onDone={(text) => {
            setOpen(null);
            setMessage(text);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </Card>
  );
}

const GUIDE: [TextKey, TextKey][] = [
  ['guide1Title', 'guide1Body'],
  ['guide2Title', 'guide2Body'],
  ['guide3Title', 'guide3Body'],
  ['guide4Title', 'guide4Body'],
];

/** How to record a payment: closed until someone opens it. */
function Guide() {
  const { t } = useT();
  return (
    <Card pad={false}>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[20px] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage/10 text-sage">
            <Info size={16} strokeWidth={1.75} />
          </span>
          <span className="flex-1 font-display text-base font-semibold text-ink">{t('guideTitle')}</span>
          <ChevronDown {...ICON} size={16} className="text-mute transition-transform group-open:rotate-180" />
        </summary>
        <ol className="grid gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          {GUIDE.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{t(title)}</span>
                <span className="mt-0.5 block text-sm text-mute">{t(body)}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mx-5 mb-5 rounded-xl bg-ink/[0.04] px-4 py-3 text-xs text-mute sm:mx-6 sm:mb-6">{t('guideNote')}</p>
      </details>
    </Card>
  );
}

/* ───────────────────────────── History / transactions ───────────────────────────── */

const RANGES: { id: Range; label: TextKey }[] = [
  { id: 'today', label: 'rangeToday' },
  { id: 'week', label: 'rangeWeek' },
  { id: 'month', label: 'rangeMonth' },
  { id: 'lastMonth', label: 'rangeLastMonth' },
  { id: 'custom', label: 'rangeCustom' },
];

function History({ methods, collectors }: { methods: Method[]; collectors: Collector[] }) {
  const { t, lang } = useT();
  const me = useStaff();
  const owner = isAdmin(me);
  // Any dates can be picked; the period menu fills in common ranges.
  const [[from, to], setDates] = useState<[string, string]>(() => rangeDates('today'));
  const range: Range =
    RANGES.find((r) => r.id !== 'custom' && rangeDates(r.id).join() === `${from},${to}`)?.id ?? 'custom';
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [who, setWho] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'VALID' | 'VOID'>('');
  const [open, setOpen] = useState<{ payment: Payment; refund?: boolean } | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let stale = false;
    loadPayments(from, to)
      .then((data) => {
        if (stale) return;
        setRows(data);
        setFailed(false);
      })
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [from, to, version]);

  const receivers = [...new Map((rows ?? []).map((r) => [r.collected_by, r.collected_by_name])).entries()];
  const shown = (rows ?? []).filter(
    (r) =>
      (!who || r.collected_by === who) &&
      (!methodFilter || r.method === methodFilter) &&
      (!statusFilter || r.status === statusFilter),
  );
  const sum = totals(shown);
  const oneDay = from === to;
  const selectCls = `${inputCls} h-12 py-0 sm:w-auto`;

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card pad={false} className="grid grid-cols-2 items-end gap-3 p-4 sm:flex sm:flex-wrap">
        <Select
          label={t('period')}
          value={range}
          onChange={(v) => v !== 'custom' && setDates(rangeDates(v as Exclude<Range, 'custom'>))}
          className={selectCls}
        >
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {t(r.label)}
            </option>
          ))}
        </Select>
        <DateInput label={t('from')} value={from} max={to} onChange={(v) => setDates([v, v > to ? v : to])} />
        <DateInput label={t('to')} value={to} min={from} onChange={(v) => setDates([v < from ? v : from, v])} />
        {owner && (
          <>
            <Select label={t('receivedBy')} value={who} onChange={setWho} className={selectCls}>
              <option value="">{t('everyone')}</option>
              {receivers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            <Select label={t('method')} value={methodFilter} onChange={setMethodFilter} className={selectCls}>
              <option value="">{t('allMethods')}</option>
              {methods.map((m) => (
                <option key={m.code} value={m.code}>
                  {lang === 'ko' ? m.label_ko : m.label_en}
                </option>
              ))}
            </Select>
            <Select
              label={t('status')}
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as typeof statusFilter)}
              className={selectCls}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="VALID">{t('statusValid')}</option>
              <option value="VOID">{t('statusVoid')}</option>
            </Select>
          </>
        )}
        <Button
          variant="secondary"
          className="h-12 w-12 justify-self-start !px-0 sm:ml-auto"
          onClick={() => setVersion((v) => v + 1)}
          title={t('refresh')}
        >
          <RefreshCw {...ICON} size={16} />
          <span className="sr-only">{t('refresh')}</span>
        </Button>
      </Card>

      {message && <Notice tone="success">{message}</Notice>}

      <Card pad={false} className="overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-ink/[0.07] sm:grid-cols-4 [&>*]:bg-paper [&>*]:p-4 sm:[&>*]:p-5">
          <Stat label={t(owner ? 'netRevenue' : 'myNet')} value={formatCents(sum.net)} strong />
          <Stat label={t('grossPayments')} value={formatCents(sum.gross)} />
          <Stat label={t('refunds')} value={sum.refunds ? `−${formatCents(sum.refunds)}` : formatCents(0)} />
          <Stat label={t('paymentCount')} value={String(sum.count)} />
        </dl>
      </Card>

      {failed ? (
        <Notice tone="error">{t('incomeLoadFailed')}</Notice>
      ) : !rows ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : shown.length === 0 ? (
        <Card>
          <p className="text-sm text-mute">{t('noPaymentsInPeriod')}</p>
        </Card>
      ) : (
        <Card pad={false} className="p-2">
          <ul className="divide-y divide-ink/[0.07]">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-2 pr-1">
                <button
                  type="button"
                  onClick={() => setOpen({ payment: r })}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
                >
                  <Initials name={r.payer_name} className="hidden h-9 w-9 rounded-xl text-xs sm:inline-flex" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.payer_name}</span>
                      {r.kind === 'REFUND' && <Chip tone="warn">{t('refund')}</Chip>}
                      {r.status === 'VOID' && <Chip>{t('statusVoid')}</Chip>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-mute">
                      {[
                        oneDay ? formatTime(r.recorded_at) : `${formatDay(r.business_date, lang)}, ${formatTime(r.recorded_at)}`,
                        methodLabel(methods, r.method, lang, r.method_other),
                        owner || r.collected_by !== me.user_id ? t('receivedByName', { name: r.collected_by_name }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${r.status === 'VOID' ? 'text-mute line-through' : ''}`}
                  >
                    {r.kind === 'REFUND' ? '−' : ''}
                    {formatCents(r.amount_cents)}
                  </span>
                </button>
                {owner && r.kind === 'PAYMENT' && r.status === 'VALID' && (
                  <Button variant="secondary" className="min-h-9 shrink-0 px-3.5 text-xs" onClick={() => setOpen({ payment: r, refund: true })}>
                    {t('refund')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {open && (
        <PaymentDialog
          payment={open.payment}
          startRefund={open.refund}
          methods={methods}
          collectors={collectors}
          onClose={() => setOpen(null)}
          onDone={(text) => {
            setOpen(null);
            setMessage(text);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="truncate text-sm text-mute">{label}</dt>
      <dd className={`truncate font-display font-semibold tracking-tight tabular-nums ${strong ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}>
        {value}
      </dd>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  className,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-mute">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        {children}
      </select>
    </label>
  );
}

function DateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-mute">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className={`${inputCls} h-12 min-w-0 py-0`}
      />
    </label>
  );
}

/* ───────────────────────────── One payment: details, correct, void, refund ───────────────────────────── */

function PaymentDialog({
  payment: p,
  startRefund: refundFirst = false,
  methods,
  collectors,
  onClose,
  onDone,
}: {
  payment: Payment;
  startRefund?: boolean;
  methods: Method[];
  collectors: Collector[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t, lang } = useT();
  const me = useStaff();
  const owner = isAdmin(me);
  const [mode, setMode] = useState<'view' | 'correct' | 'void' | 'refund'>(refundFirst ? 'refund' : 'view');
  const [amount, setAmount] = useState(centsInput(p.amount_cents));
  const [method, setMethod] = useState(p.method);
  const [methodOther, setMethodOther] = useState(p.method_other);
  const [collector, setCollector] = useState(p.collected_by);
  const [notes, setNotes] = useState(p.notes);
  const [day, setDay] = useState(p.business_date);
  const [reason, setReason] = useState('');
  const [refunded, setRefunded] = useState<number | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');

  const valid = p.status === 'VALID';
  const canEdit = valid && (owner || (p.kind === 'PAYMENT' && p.recorded_by === me.user_id && p.business_date === laToday()));
  const canRefund = owner && valid && p.kind === 'PAYMENT';
  const cents = parseCents(amount);
  const otherMissing = mode !== 'void' && method === 'OTHER' && !methodOther.trim();
  const remaining = refunded === null ? null : p.amount_cents - refunded;

  // How much of this payment was already refunded, once the refund form is open.
  useEffect(() => {
    if (mode !== 'refund' || refunded !== null) return;
    supabase!
      .from('payment_transactions')
      .select('amount_cents')
      .eq('related_transaction_id', p.id)
      .eq('status', 'VALID')
      .then(({ data, error: dbError }) => {
        if (dbError) return setError(t('somethingWrong'));
        const sum = (data as { amount_cents: number }[]).reduce((s, r) => s + r.amount_cents, 0);
        setRefunded(sum);
        setAmount(centsInput(p.amount_cents - sum));
      });
  }, [mode, refunded, p.id, p.amount_cents, t]);

  const startRefund = () => {
    setMode('refund');
    setTried(false);
    setMethod(p.method);
    setMethodOther(p.method_other);
  };

  const submit = async () => {
    setTried(true);
    if (busy) return;
    if (mode !== 'void' && (!cents || otherMissing)) return;
    if ((mode === 'void' || mode === 'refund') && !reason.trim()) return;
    if (mode === 'refund' && (remaining === null || (cents ?? 0) > remaining)) return;
    setBusy(true);
    setError('');
    const call =
      mode === 'correct'
        ? supabase!.rpc('correct_payment', {
            p_id: p.id,
            p_amount_cents: cents,
            p_method: method,
            p_method_other: method === 'OTHER' ? methodOther.trim() : '',
            p_notes: notes.trim(),
            p_reason: reason.trim(),
            p_collected_by: collector,
            ...(owner && day !== p.business_date ? { p_business_date: day } : {}),
          })
        : mode === 'void'
          ? supabase!.rpc('void_payment', { p_id: p.id, p_reason: reason.trim() })
          : supabase!.rpc('record_refund', {
              p_client_request_id: requestId,
              p_original_id: p.id,
              p_amount_cents: cents,
              p_method: method,
              p_method_other: method === 'OTHER' ? methodOther.trim() : '',
              p_reason: reason.trim(),
            });
    const { error: dbError } = await call;
    setBusy(false);
    if (dbError) {
      setError(dbError.code === '22023' && dbError.message ? dbError.message : errorText(t, dbError));
      return;
    }
    onDone(t(mode === 'correct' ? 'paymentCorrected' : mode === 'void' ? 'paymentVoided' : 'refundSaved'));
  };

  const title =
    mode === 'correct' ? t('correctPayment') : mode === 'void' ? t('voidPayment') : mode === 'refund' ? t('refundPayment') : p.payer_name;

  const rows: [TextKey, string][] = [
    ['amount', `${p.kind === 'REFUND' ? '−' : ''}${formatCents(p.amount_cents)}`],
    ['method', methodLabel(methods, p.method, lang, p.method_other)],
    ['when', `${formatDay(p.business_date, lang)}, ${formatTime(p.recorded_at)}`],
    ['receivedBy', p.collected_by_name],
    ['recordedBy', p.recorded_by_name],
    ['status', `${p.kind === 'REFUND' ? `${t('refund')} · ` : ''}${t(valid ? 'statusValid' : 'statusVoid')}`],
  ];
  if (p.notes) rows.push(['note', p.notes]);
  if (p.reason) rows.push(['reason', p.reason]);

  return (
    <Dialog open onClose={onClose} title={title}>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('close')}
        className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink/[0.05]"
      >
        <X {...ICON} />
      </button>
      {mode === 'view' ? (
        <>
          <dl className="grid gap-2.5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="shrink-0 text-sm text-mute">{t(label)}</dt>
                <dd className="min-w-0 break-words text-right text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {valid && !canEdit && p.kind === 'PAYMENT' && <p className="mt-4 text-sm text-mute">{t('sameDayOnly')}</p>}
          {(canEdit || canRefund) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {canEdit && (
                <Button variant="secondary" onClick={() => setMode('correct')}>
                  {t('correct')}
                </Button>
              )}
              {canRefund && (
                <Button variant="secondary" onClick={startRefund}>
                  {t('refund')}
                </Button>
              )}
              {canEdit && (
                <Button variant="secondary" onClick={() => setMode('void')}>
                  {t('void')}
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === 'void' && <p className="text-sm text-mute">{t('voidNote')}</p>}
          {mode === 'refund' && (
            <p className="text-sm text-mute">
              {remaining === null ? t('loading') : t('refundNote', { amount: formatCents(remaining) })}
            </p>
          )}
          {mode !== 'void' && (
            <>
              <TextField
                label={t('amount')}
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={
                  tried && !cents
                    ? t('enterAmount')
                    : tried && mode === 'refund' && remaining !== null && (cents ?? 0) > remaining
                      ? t('refundTooMuch')
                      : undefined
                }
              />
              <MethodFields
                methods={methods}
                method={method}
                other={methodOther}
                onMethod={setMethod}
                onOther={setMethodOther}
                otherError={tried && otherMissing ? t('enterMethodOther') : undefined}
              />
            </>
          )}
          {mode === 'correct' && owner && (
            <TextField
              label={t('paymentDate')}
              type="date"
              max={laToday()}
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
          )}
          {mode === 'correct' && <CollectorSelect collectors={collectors} value={collector} onChange={setCollector} />}
          {mode === 'correct' && (
            <TextField label={t('note')} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
          <TextField
            label={t(mode === 'correct' ? 'reasonOptional' : 'reason')}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={tried && mode !== 'correct' && !reason.trim() ? t('enterReason') : undefined}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="mt-2 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => (refundFirst ? onClose() : setMode('view'))}>
              {t(refundFirst ? 'cancel' : 'back')}
            </Button>
            <Button type="submit" variant={mode === 'void' ? 'danger' : 'primary'} disabled={busy}>
              {busy ? t('saving') : t(mode === 'correct' ? 'save' : mode === 'void' ? 'void' : 'saveRefund')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
