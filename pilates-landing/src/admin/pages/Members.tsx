// Members (owner): one list of studio members, built from Mindbody and
// Schedulista client exports plus students added on the payment screen.
// Every member shows which system they came from. Import and edits go through
// owner-only database functions (import_members / update_member).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import { isAdmin, useStaff } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { membersFromCsv, type Member, type MemberSource } from '../members';
import { formatCents, formatDay, type Payment } from '../payments';
import { supabase } from '../supabase';
import { Button, Card, Dialog, Initials, Notice, Skeleton, TextField, inputCls } from '../ui';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
const PAGE = 100;

type SourceFilter = 'all' | 'mindbody' | 'schedulista' | 'both' | 'portal';
type ImportResult = { added: number; linked: number; updated: number; skipped: number };
type Pending = { source: MemberSource; rows: ReturnType<typeof membersFromCsv> };

/** Every member. Supabase returns at most 1000 rows per request, so read in pages. */
async function loadMembers(): Promise<Member[]> {
  const all: Member[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!
      .from('students')
      .select('*')
      .order('full_name')
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data as Member[]));
    if (data.length < 1000) return all;
  }
}

const SOURCE_FILTERS: { id: SourceFilter; label: TextKey }[] = [
  { id: 'all', label: 'allMembers' },
  { id: 'mindbody', label: 'mindbody' },
  { id: 'schedulista', label: 'schedulista' },
  { id: 'both', label: 'inBoth' },
  { id: 'portal', label: 'portalOnly' },
];

function matchesSource(m: Member, f: SourceFilter) {
  const mb = Boolean(m.mindbody_id);
  const sc = Boolean(m.schedulista_key);
  return (
    f === 'all' ||
    (f === 'mindbody' && mb) ||
    (f === 'schedulista' && sc) ||
    (f === 'both' && mb && sc) ||
    (f === 'portal' && !mb && !sc)
  );
}

/** "2026-10-13 18:30:00" (studio time, as exported) → "Tue, Oct 13" */
const visitDay = (ts: string | null, lang: 'en' | 'ko') => (ts ? formatDay(ts.slice(0, 10), lang) : '');

export default function Members() {
  const { t, lang } = useT();
  // Staff and instructors with the Clients menu (Settings → Admin) only look; owners/admins edit and import.
  const admin = isAdmin(useStaff());
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | ''>('ACTIVE');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<{ member: Member | null } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let stale = false;
    loadMembers()
      .then((rows) => {
        if (stale) return;
        setMembers(rows);
        setFailed(false);
      })
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [version]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return (members ?? []).filter(
      (m) =>
        (!status || m.status === status) &&
        matchesSource(m, source) &&
        (!q ||
          m.full_name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (digits.length >= 3 && m.phone.replace(/\D/g, '').includes(digits))),
    );
  }, [members, query, source, status]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        SOURCE_FILTERS.map((f) => [f.id, (members ?? []).filter((m) => matchesSource(m, f.id)).length]),
      ),
    [members],
  );

  const pickFile = (text: string) => {
    const parsed = membersFromCsv(text);
    if (!parsed) return setMessage({ tone: 'error', text: t('notAnExport') });
    if (!parsed.rows.length) return setMessage({ tone: 'error', text: t('nothingImported') });
    setMessage(null);
    setPending({ source: parsed.source, rows: parsed });
  };

  const runImport = async () => {
    if (!pending?.rows || busy) return;
    setBusy(true);
    const { data, error } = await supabase!.rpc('import_members', {
      p_source: pending.source,
      p_rows: pending.rows.rows,
    });
    setBusy(false);
    const name = t(pending.source === 'MINDBODY' ? 'mindbody' : 'schedulista');
    setPending(null);
    if (error) return setMessage({ tone: 'error', text: t('importFailed', { reason: error.message }) });
    const r = data as ImportResult;
    setMessage({
      tone: 'success',
      text: t('membersImported', {
        source: name,
        added: String(r.added),
        linked: String(r.linked),
        updated: String(r.updated),
      }),
    });
    setVersion((v) => v + 1);
  };

  return (
    <Layout
      title={t('navClients')}
      actions={
        <>
          <Button variant="secondary" onClick={() => setVersion((v) => v + 1)} title={t('refresh')}>
            <RefreshCw {...ICON} size={16} />
            <span className="sr-only sm:not-sr-only">{t('refresh')}</span>
          </Button>
          {admin && <CsvPicker onText={pickFile} />}
          {admin && (
            <Button onClick={() => setOpen({ member: null })}>
              <Plus {...ICON} size={16} />
              {t('addStudent')}
            </Button>
          )}
        </>
      }
    >
      <p className="mb-4 max-w-[70ch] text-pretty text-sm text-mute">{t('membersHint')}</p>
      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <Card pad={false} className="mb-4 grid gap-3 p-4">
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="relative block sm:min-w-72 sm:flex-1">
          <span className="sr-only">{t('searchMembers')}</span>
          <Search {...ICON} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
          <input
            type="search"
            value={query}
            placeholder={t('searchMembers')}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            className={`${inputCls} pl-11`}
          />
        </label>
        <select
          aria-label={t('status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className={`${inputCls} sm:w-auto`}
        >
          <option value="ACTIVE">{t('ACTIVE')}</option>
          <option value="INACTIVE">{t('INACTIVE')}</option>
          <option value="">{t('allStatuses')}</option>
        </select>
      </div>

      <div role="group" aria-label={t('source')} className="flex flex-wrap gap-2">
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={source === f.id}
            onClick={() => {
              setSource(f.id);
              setLimit(PAGE);
            }}
            className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
              source === f.id ? 'bg-ink text-cream' : 'bg-paper text-ink ring-1 ring-ink/15 hover:bg-sand/60'
            }`}
          >
            {t(f.label)}
            {members && <span className="ml-1.5 tabular-nums opacity-70">{counts[f.id]}</span>}
          </button>
        ))}
      </div>
      </Card>

      {failed ? (
        <div className="max-w-xl">
          <Notice tone="error">{t('membersLoadFailed')}</Notice>
          <Button variant="secondary" className="mt-4" onClick={() => setVersion((v) => v + 1)}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : !members ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : shown.length === 0 ? (
        <Card>
          <p className="text-sm text-mute">{t(members.length ? 'noMembersMatch' : 'noMembersYet')}</p>
        </Card>
      ) : (
        <Card pad={false} className="p-2">
          <p className="px-3 pb-1 pt-2 text-xs text-mute">{t('membersShown', { n: String(shown.length) })}</p>
          <ul className="divide-y divide-ink/[0.07]">
            {shown.slice(0, limit).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setOpen({ member: m })}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
                >
                  <Initials name={m.full_name} className="h-9 w-9 rounded-xl text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{m.full_name}</span>
                      <SourceBadges m={m} />
                      {m.status === 'INACTIVE' && <Badge tone="plain">{t('INACTIVE')}</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-mute">
                      {[m.phone, m.email].filter(Boolean).join(' · ') || t('noContact')}
                    </span>
                  </span>
                  {m.schedulista_last_visit && (
                    <span className="hidden shrink-0 text-right text-xs text-mute sm:block">
                      {t('lastVisit')}
                      <span className="block text-sm text-ink">{visitDay(m.schedulista_last_visit, lang)}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {shown.length > limit && (
            <div className="p-3">
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                {t('showMore', { n: String(Math.min(PAGE, shown.length - limit)) })}
              </Button>
            </div>
          )}
        </Card>
      )}

      <Dialog open={Boolean(pending)} onClose={() => setPending(null)} title={t('importMembersTitle')}>
        {pending?.rows && (
          <>
            <p className="text-sm text-mute">
              {t('importMembersBody', {
                source: t(pending.source === 'MINDBODY' ? 'mindbody' : 'schedulista'),
                n: String(pending.rows.rows.length),
              })}
            </p>
            {pending.rows.skipped > 0 && (
              <p className="mt-2 text-sm text-mute">{t('rowsWithoutName', { n: String(pending.rows.skipped) })}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => setPending(null)}>
                {t('cancel')}
              </Button>
              <Button disabled={busy} onClick={() => void runImport()}>
                {busy ? t('saving') : t('importNow')}
              </Button>
            </div>
          </>
        )}
      </Dialog>

      {open && (
        <MemberDialog
          member={open.member}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            setMessage({ tone: 'success', text: t('memberSaved') });
            setVersion((v) => v + 1);
          }}
        />
      )}
    </Layout>
  );
}

function CsvPicker({ onText }: { onText: (text: string) => void }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onText(await file.text());
        }}
      />
      <Button onClick={() => input.current?.click()}>
        <Upload {...ICON} size={16} />
        {t('importCsv')}
      </Button>
    </>
  );
}

function Badge({ tone, children }: { tone: 'mindbody' | 'schedulista' | 'plain'; children: ReactNode }) {
  const cls = {
    mindbody: 'bg-sage/15 text-sage-deep',
    schedulista: 'bg-clay/20 text-ink',
    plain: 'bg-ink/[0.06] text-mute',
  }[tone];
  return <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

function SourceBadges({ m }: { m: Member }) {
  const { t } = useT();
  return (
    <>
      {m.mindbody_id && <Badge tone="mindbody">{t('mindbody')}</Badge>}
      {m.schedulista_key && <Badge tone="schedulista">{t('schedulista')}</Badge>}
      {!m.mindbody_id && !m.schedulista_key && <Badge tone="plain">{t('portal')}</Badge>}
    </>
  );
}

function MemberDialog({
  member: m,
  onClose,
  onSaved,
}: {
  member: Member | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useT();
  const admin = isAdmin(useStaff());
  const [form, setForm] = useState({
    full_name: m?.full_name ?? '',
    phone: m?.phone ?? '',
    email: m?.email ?? '',
    address: m?.address ?? '',
    notes: m?.notes ?? '',
    status: m?.status ?? 'ACTIVE',
  });
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (!m) return;
    supabase!
      .from('payment_transactions')
      .select('*')
      .eq('student_id', m.id)
      .order('recorded_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setPayments((data as Payment[]) ?? []));
  }, [m]);

  const save = async () => {
    if (!form.full_name.trim() || busy) return setError(form.full_name.trim() ? '' : t('enterName'));
    setBusy(true);
    // A new client: add_student creates them (or finds the same name + phone), then the rest is saved.
    const created = m
      ? null
      : await supabase!.rpc('add_student', { p_full_name: form.full_name.trim(), p_phone: form.phone.trim() });
    if (created?.error) {
      setBusy(false);
      return setError(t('somethingWrong'));
    }
    const { error: dbError } = await supabase!.rpc('update_member', {
      p_id: m ? m.id : (created!.data as string),
      p_full_name: form.full_name,
      p_phone: form.phone,
      p_email: form.email,
      p_address: form.address,
      p_notes: form.notes,
      p_status: form.status,
    });
    setBusy(false);
    if (dbError) return setError(t('somethingWrong'));
    onSaved();
  };

  const day = (iso: string | null) => (iso ? formatDay(iso.slice(0, 10), lang) : '');

  return (
    <Dialog open onClose={onClose} title={m ? m.full_name : t('addStudent')}>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('close')}
        className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink/[0.05]"
      >
        <X {...ICON} />
      </button>
      {m && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          <SourceBadges m={m} />
        </div>
      )}

      {m?.mindbody_id && (
        <Section title={t('fromMindbody')}>
          <Row label={t('mindbodyId')} value={m.mindbody_id} />
          <Row label={t('importedOn')} value={day(m.mindbody_imported_at)} />
        </Section>
      )}
      {m?.schedulista_key && (
        <Section title={t('fromSchedulista')}>
          <Row label={t('lastVisit')} value={visitDay(m.schedulista_last_visit, lang) || '—'} />
          <Row label={t('nextVisit')} value={visitDay(m.schedulista_next_visit, lang) || '—'} />
          <Row label={t('visitCount')} value={m.schedulista_visits == null ? '—' : String(m.schedulista_visits)} />
          {m.schedulista_notes && <Row label={t('note')} value={m.schedulista_notes} />}
          {m.schedulista_services.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {m.schedulista_services.map((s) => (
                <Badge key={s} tone="plain">
                  {s}
                </Badge>
              ))}
            </div>
          )}
          <Row label={t('importedOn')} value={day(m.schedulista_imported_at)} />
        </Section>
      )}

      {m && (
        <Section title={t('payments')}>
          {!payments ? (
            <Skeleton className="h-10 w-full" />
          ) : payments.length === 0 ? (
            <p className="text-sm text-mute">{t('noPaymentsYet')}</p>
          ) : (
            payments.map((p) => (
              <Row
                key={p.id}
                label={`${formatDay(p.business_date, lang)}${p.status === 'VOID' ? ` · ${t('statusVoid')}` : ''}`}
                value={`${p.kind === 'REFUND' ? '−' : ''}${formatCents(p.amount_cents)}`}
              />
            ))
          )}
        </Section>
      )}

      <form
        className={`grid gap-4 ${m ? 'mt-5 border-t border-ink/10 pt-5' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={!admin} className="contents">
          <TextField label={t('fullName')} maxLength={120} value={form.full_name} onChange={set('full_name')} />
          <TextField label={t('phone')} type="tel" maxLength={30} value={form.phone} onChange={set('phone')} />
          <TextField label={t('email')} type="email" maxLength={254} value={form.email} onChange={set('email')} />
          <TextField label={t('address')} maxLength={300} value={form.address} onChange={set('address')} />
          <TextField label={t('memberNotes')} maxLength={2000} value={form.notes} onChange={set('notes')} />
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">{t('status')}</span>
            <select value={form.status} onChange={set('status')} className={inputCls}>
              <option value="ACTIVE">{t('ACTIVE')}</option>
              <option value="INACTIVE">{t('INACTIVE')}</option>
            </select>
          </label>
        </fieldset>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t(admin ? 'cancel' : 'close')}
          </Button>
          {admin && (
            <Button type="submit" disabled={busy}>
              {busy ? t('saving') : m ? t('save') : t('addStudent')}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">{title}</h3>
      <div className="grid gap-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-mute">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}
