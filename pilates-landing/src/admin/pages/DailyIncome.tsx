// Daily Income: every staff member records the payments they receive; staff
// see their own history, owners see every payment with filters and totals.
// The database decides who recorded a payment, its date and who may change it
// (record_payment / correct_payment / void_payment / record_refund).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CircleCheck, Plus, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { useStaff } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import {
  centsInput,
  formatCents,
  formatDay,
  formatTime,
  laToday,
  loadMethods,
  loadPayments,
  methodLabel,
  parseCents,
  rangeDates,
  totals,
  type Method,
  type Payment,
  type Range,
  type StudentHit,
} from '../payments';
import { supabase } from '../supabase';
import { Button, Card, Dialog, Initials, Notice, Skeleton, TextField, inputCls } from '../ui';

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
  const owner = useStaff().role === 'OWNER';
  const [tab, setTab] = useState<'record' | 'history'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'history' ? 'history' : 'record',
  );
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () =>
    loadMethods()
      .then(setMethods)
      .catch(() => setFailed(true));
  useEffect(() => {
    load();
  }, []);

  const show = (next: typeof tab) => {
    setTab(next);
    window.history.replaceState(null, '', next === 'record' ? '?' : '?tab=history');
  };

  return (
    <Layout title={t('navDailyIncome')}>
      <div role="tablist" aria-label={t('navDailyIncome')} className="mb-6 inline-flex rounded-full bg-sand p-1">
        {(['record', 'history'] as const).map((id) => (
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
            {t(id === 'record' ? 'tabRecord' : owner ? 'tabTransactions' : 'tabMyHistory')}
          </button>
        ))}
      </div>

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
      ) : !methods ? (
        <div className="grid max-w-xl gap-4" aria-busy="true">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : tab === 'record' ? (
        <RecordPayment methods={methods} onShowHistory={() => show('history')} />
      ) : (
        <History methods={methods} />
      )}
    </Layout>
  );
}

/* ───────────────────────────── Record a payment ───────────────────────────── */

type Payer = { kind: 'student'; hit: StudentHit } | { kind: 'walkin'; name: string };

function readLastMethod(methods: Method[]): string {
  try {
    const code = window.localStorage.getItem(LAST_METHOD_KEY) ?? '';
    return methods.some((m) => m.code === code) ? code : '';
  } catch {
    return '';
  }
}

function RecordPayment({ methods, onShowHistory }: { methods: Method[]; onShowHistory: () => void }) {
  const { t, lang } = useT();
  const [payer, setPayer] = useState<Payer | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(() => readLastMethod(methods));
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
  const methodName = method ? methodLabel(methods, method, lang) : '';

  const pick = (next: Payer) => {
    setPayer(next);
    // The usual case is paying the same as last time: fill it in.
    if (next.kind === 'student' && next.hit.last_amount_cents && !amount.trim()) {
      setAmount(centsInput(next.hit.last_amount_cents));
      if (next.hit.last_method && methods.some((m) => m.code === next.hit.last_method)) setMethod(next.hit.last_method);
    }
  };

  const save = async (confirmDuplicate = false) => {
    setTried(true);
    if (!payer || !cents || !method || busy) return;
    setBusy(true);
    setError('');
    const { data, error: dbError } = await supabase!.rpc('record_payment', {
      p_client_request_id: requestId,
      p_amount_cents: cents,
      p_method: method,
      p_student_id: payer.kind === 'student' ? payer.hit.id : null,
      p_payer_name: payer.kind === 'walkin' ? payer.name.trim() || null : null,
      p_notes: notes.trim(),
      p_confirm_duplicate: confirmDuplicate,
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
  };

  const reset = () => {
    setPayer(null);
    setAmount('');
    setNotes('');
    setNoteOpen(false);
    setTried(false);
    setError('');
    setSaved(null);
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
              {methodLabel(methods, saved.method, lang)} · {saved.payer_name} · {formatTime(saved.recorded_at)}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset}>{t('recordAnother')}</Button>
          <Button variant="secondary" onClick={onShowHistory}>
            {t('seeHistory')}
          </Button>
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
        {payer ? (
          <div className="flex items-center gap-3">
            {payer.kind === 'student' ? (
              <Initials name={payer.hit.full_name} className="h-10 w-10 text-sm" />
            ) : (
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand text-mute">
                <UserRound {...ICON} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {payer.kind === 'student' ? payer.hit.full_name : payer.name.trim() || t('walkIn')}
              </p>
              <p className="truncate text-sm text-mute">
                {payer.kind === 'walkin' ? t('walkIn') : <StudentMeta hit={payer.hit} />}
              </p>
            </div>
            <Button variant="secondary" className="min-h-10 px-4" onClick={() => setPayer(null)}>
              {t('change')}
            </Button>
          </div>
        ) : (
          <StudentPicker onPick={pick} />
        )}
        {tried && !payer && <p className="mt-3 text-sm text-red-700">{t('chooseStudent')}</p>}
      </Card>

      <Card>
        <div className="grid gap-5">
          <TextField
            label={t('amount')}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={tried && !cents ? t('enterAmount') : undefined}
            hint={
              payer?.kind === 'student' && payer.hit.last_amount_cents && payer.hit.last_paid_on
                ? t('lastTime', {
                    amount: formatCents(payer.hit.last_amount_cents),
                    method: payer.hit.last_method ? methodLabel(methods, payer.hit.last_method, lang) : '',
                    date: formatDay(payer.hit.last_paid_on, lang),
                  })
                : undefined
            }
          />
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">{t('method')}</legend>
            <div className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  aria-pressed={method === m.code}
                  onClick={() => setMethod(m.code)}
                  className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
                    method === m.code ? 'bg-ink text-cream' : 'bg-paper text-ink ring-1 ring-ink/15 hover:bg-sand/60'
                  }`}
                >
                  {lang === 'ko' ? m.label_ko : m.label_en}
                </button>
              ))}
            </div>
            {tried && !method && <p className="mt-2 text-sm text-red-700">{t('chooseMethod')}</p>}
          </fieldset>
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
      <div className="sticky bottom-0 -mx-4 border-t border-ink/10 bg-cream/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy
            ? t('saving')
            : cents && method
              ? t('saveReceived', { amount: formatCents(cents), method: methodName })
              : t('savePayment')}
        </Button>
      </div>

      <Dialog open={askDuplicate} onClose={() => setAskDuplicate(false)} title={t('duplicateTitle')}>
        <p className="text-sm text-mute">
          {t('duplicateBody', {
            amount: cents ? formatCents(cents) : '',
            name: payer?.kind === 'student' ? payer.hit.full_name : payer?.name.trim() || t('walkIn'),
          })}
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

function StudentMeta({ hit }: { hit: StudentHit }) {
  const { t, lang } = useT();
  const parts = [];
  if (hit.phone_last4) parts.push(`···${hit.phone_last4}`);
  parts.push(hit.last_paid_on ? t('lastPaid', { date: formatDay(hit.last_paid_on, lang) }) : t('noPaymentsYet'));
  return <>{parts.join(' · ')}</>;
}

function StudentPicker({ onPick }: { onPick: (payer: Payer) => void }) {
  const { t } = useT();
  const [mode, setMode] = useState<'search' | 'new' | 'walkin'>('search');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const searching = query.trim().length >= 2;

  useEffect(() => {
    if (mode !== 'search') return;
    let stale = false;
    const timer = window.setTimeout(
      () => {
        supabase!.rpc('search_students', { p_query: query.trim() }).then(({ data, error }) => {
          if (stale) return;
          setFailed(Boolean(error));
          setHits(error ? [] : (data as StudentHit[]));
        });
      },
      query.trim().length >= 2 ? 250 : 0,
    );
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [query, mode]);

  const addStudent = async () => {
    setTried(true);
    if (!name.trim() || busy) return;
    setBusy(true);
    const { data, error } = await supabase!.rpc('add_student', { p_full_name: name.trim(), p_phone: phone.trim() });
    setBusy(false);
    if (error) return setFailed(true);
    onPick({
      kind: 'student',
      hit: {
        id: data as string,
        full_name: name.trim(),
        phone_last4: phone.replace(/\D/g, '').slice(-4),
        last_paid_on: null,
        last_amount_cents: null,
        last_method: null,
      },
    });
  };

  if (mode === 'new' || mode === 'walkin') {
    const isNew = mode === 'new';
    return (
      <div className="grid gap-4">
        <p className="text-sm text-mute">{t(isNew ? 'newStudentNote' : 'walkInNote')}</p>
        <TextField
          label={t(isNew ? 'fullName' : 'nameOptional')}
          autoComplete="off"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={isNew && tried && !name.trim() ? t('enterName') : undefined}
        />
        {isNew && (
          <TextField
            label={t('phoneOptional')}
            type="tel"
            autoComplete="off"
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        )}
        {failed && <Notice tone="error">{t('somethingWrong')}</Notice>}
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy}
            onClick={() => (isNew ? void addStudent() : onPick({ kind: 'walkin', name }))}
          >
            {t(isNew ? 'addStudent' : 'useWalkIn')}
          </Button>
          <Button variant="secondary" onClick={() => setMode('search')}>
            {t('back')}
          </Button>
        </div>
      </div>
    );
  }

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
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputCls} pl-11`}
        />
      </label>
      <p className="text-xs font-medium text-mute">{t(searching ? 'results' : 'recentlyPaid')}</p>
      {failed ? (
        <Notice tone="error">{t('somethingWrong')}</Notice>
      ) : !hits ? (
        <div className="grid gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : hits.length === 0 ? (
        <p className="text-sm text-mute">{t(searching ? 'noStudentFound' : 'noRecentStudents')}</p>
      ) : (
        <ul className="-mx-2 grid gap-1">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onPick({ kind: 'student', hit })}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              >
                <Initials name={hit.full_name} className="h-9 w-9 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{hit.full_name}</span>
                  <span className="block truncate text-xs text-mute">
                    <StudentMeta hit={hit} />
                  </span>
                </span>
                {hit.last_amount_cents && (
                  <span className="shrink-0 text-sm tabular-nums text-mute">{formatCents(hit.last_amount_cents)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t border-ink/10 pt-3">
        <Button
          variant="secondary"
          className="min-h-10 px-4"
          onClick={() => {
            setName(searching && !/\d{3}/.test(query) ? query.trim() : '');
            setPhone(/\d{3}/.test(query) ? query.trim() : '');
            setTried(false);
            setMode('new');
          }}
        >
          <Plus {...ICON} size={16} />
          {t('newStudent')}
        </Button>
        <Button
          variant="secondary"
          className="min-h-10 px-4"
          onClick={() => {
            setName('');
            setMode('walkin');
          }}
        >
          {t('walkIn')}
        </Button>
      </div>
    </div>
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

function History({ methods }: { methods: Method[] }) {
  const { t, lang } = useT();
  const me = useStaff();
  const owner = me.role === 'OWNER';
  const [range, setRange] = useState<Range>('today');
  const [custom, setCustom] = useState<[string, string]>(() => [laToday(), laToday()]);
  const [from, to] = range === 'custom' ? custom : rangeDates(range);
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [who, setWho] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'VALID' | 'VOID'>('');
  const [open, setOpen] = useState<Payment | null>(null);
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

  const recorders = [...new Map((rows ?? []).map((r) => [r.recorded_by, r.recorded_by_name])).entries()];
  const shown = (rows ?? []).filter(
    (r) =>
      (!who || r.recorded_by === who) &&
      (!methodFilter || r.method === methodFilter) &&
      (!statusFilter || r.status === statusFilter),
  );
  const sum = totals(shown);
  const oneDay = from === to;
  const selectCls = `${inputCls} py-2.5 sm:w-auto`;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <Select label={t('period')} value={range} onChange={(v) => setRange(v as Range)} className={selectCls}>
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {t(r.label)}
            </option>
          ))}
        </Select>
        {range === 'custom' && (
          <>
            <DateInput label={t('from')} value={custom[0]} max={custom[1]} onChange={(v) => setCustom([v, custom[1]])} />
            <DateInput label={t('to')} value={custom[1]} min={custom[0]} onChange={(v) => setCustom([custom[0], v])} />
          </>
        )}
        {owner && (
          <>
            <Select label={t('recordedBy')} value={who} onChange={setWho} className={selectCls}>
              <option value="">{t('everyone')}</option>
              {recorders.map(([id, name]) => (
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
          className="min-h-[46px] justify-self-start px-4"
          onClick={() => setVersion((v) => v + 1)}
          title={t('refresh')}
        >
          <RefreshCw {...ICON} size={16} />
          <span className="sr-only sm:not-sr-only">{t('refresh')}</span>
        </Button>
      </div>

      {message && <Notice tone="success">{message}</Notice>}

      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
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
        <Card className="p-2 sm:p-2">
          <ul className="divide-y divide-ink/10">
            {shown.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpen(r)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.payer_name}</span>
                      {r.kind === 'REFUND' && <Tag>{t('refund')}</Tag>}
                      {r.status === 'VOID' && <Tag tone="void">{t('statusVoid')}</Tag>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-mute">
                      {[
                        oneDay ? formatTime(r.recorded_at) : `${formatDay(r.business_date, lang)}, ${formatTime(r.recorded_at)}`,
                        methodLabel(methods, r.method, lang),
                        owner ? r.recorded_by_name : '',
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
              </li>
            ))}
          </ul>
        </Card>
      )}

      {open && (
        <PaymentDialog
          payment={open}
          methods={methods}
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
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className={`truncate font-display font-semibold tabular-nums ${strong ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>
        {value}
      </dd>
    </div>
  );
}

function Tag({ tone = 'plain', children }: { tone?: 'plain' | 'void'; children: ReactNode }) {
  const cls = tone === 'void' ? 'bg-ink/[0.06] text-mute' : 'bg-clay/20 text-ink';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
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
        className={`${inputCls} py-2.5`}
      />
    </label>
  );
}

/* ───────────────────────────── One payment: details, correct, void, refund ───────────────────────────── */

function PaymentDialog({
  payment: p,
  methods,
  onClose,
  onDone,
}: {
  payment: Payment;
  methods: Method[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t, lang } = useT();
  const me = useStaff();
  const owner = me.role === 'OWNER';
  const [mode, setMode] = useState<'view' | 'correct' | 'void' | 'refund'>('view');
  const [amount, setAmount] = useState(centsInput(p.amount_cents));
  const [method, setMethod] = useState(p.method);
  const [notes, setNotes] = useState(p.notes);
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
  const remaining = refunded === null ? null : p.amount_cents - refunded;

  const startRefund = async () => {
    setMode('refund');
    setTried(false);
    setMethod(p.method);
    const { data, error: dbError } = await supabase!
      .from('payment_transactions')
      .select('amount_cents')
      .eq('related_transaction_id', p.id)
      .eq('status', 'VALID');
    if (dbError) return setError(t('somethingWrong'));
    const sum = (data as { amount_cents: number }[]).reduce((s, r) => s + r.amount_cents, 0);
    setRefunded(sum);
    setAmount(centsInput(p.amount_cents - sum));
  };

  const submit = async () => {
    setTried(true);
    if (busy) return;
    if (mode !== 'void' && !cents) return;
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
            p_notes: notes.trim(),
            p_reason: reason.trim(),
          })
        : mode === 'void'
          ? supabase!.rpc('void_payment', { p_id: p.id, p_reason: reason.trim() })
          : supabase!.rpc('record_refund', {
              p_client_request_id: requestId,
              p_original_id: p.id,
              p_amount_cents: cents,
              p_method: method,
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
    ['method', methodLabel(methods, p.method, lang)],
    ['when', `${formatDay(p.business_date, lang)}, ${formatTime(p.recorded_at)}`],
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
                <Button variant="secondary" onClick={() => void startRefund()}>
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
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">{t('method')}</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                  {methods.map((m) => (
                    <option key={m.code} value={m.code}>
                      {lang === 'ko' ? m.label_ko : m.label_en}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
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
            <Button variant="secondary" onClick={() => setMode('view')}>
              {t('back')}
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
