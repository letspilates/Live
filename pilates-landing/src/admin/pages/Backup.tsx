// Backup (owner): download every client and every payment (voided and edited
// rows included) as CSV for Excel, plus one JSON file with the raw rows of
// every studio table for moving the data to another Supabase project. Reads
// with the owner's own login; RLS decides what comes back.
import { useEffect, useState, type ChangeEvent } from 'react';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import { useT } from '../i18n';
import Layout from '../Layout';
import { IS_STAGING, supabase } from '../supabase';
import { formatMonth, toCsv } from '../expenses';
import { formatCents } from '../payments';
import { Button, Card, CardTitle, Chip, Notice, TextField } from '../ui';

type Row = Record<string, unknown>;

// Every table in supabase/migrations except audit_logs (change history) and
// staff_profiles (read through list_staff and schedule_instructors below,
// since some of its columns are not readable directly). A new table goes here;
// tests/admin-shell.mjs fails until it does. Sort ends in a unique column.
const TABLES = {
  students: ['full_name', 'id'],
  payment_transactions: ['business_date', 'recorded_at', 'id'],
  payment_methods: ['sort_order', 'code'],
  accounting_periods: ['month'],
  appointments: ['starts_at', 'id'],
  appointment_clients: ['id'],
  schedule_services: ['sort', 'id'],
  schedule_categories: ['sort', 'id'],
  schedule_settings: ['id'],
  expenses: ['id'],
  expense_categories: ['code'],
  recurring_expense_rules: ['id'],
  training_courses: ['id'],
  training_registrations: ['submitted_at', 'id'],
  knowledge_items: ['id'],
  knowledge_item_viewers: ['item_id', 'user_id'],
  role_menu_access: ['role', 'menu'],
} as const;
type Table = keyof typeof TABLES;
type Data = Record<Table | 'staff' | 'schedule_instructors', Row[]>;

// Pages of 1000 (the API's cap), ordered down to a unique column so no row is
// skipped or read twice between pages.
async function readAll(table: Table, order: readonly string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    // Booked clients' phone, email and price aren't readable from the table; this function
    // returns every column to someone with Clients access (Owner/Admin).
    let query =
      table === 'appointment_clients' ? supabase!.rpc('appointment_clients_full').select('*') : supabase!.from(table).select('*');
    for (const col of order) query = query.order(col);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

function save(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const cell = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : (v as string | number));

function tableCsv(rows: Row[]) {
  const cols = Object.keys(rows[0] ?? {});
  // Byte-order mark so Excel reads Korean names as UTF-8.
  return `\ufeff${toCsv([cols, ...rows.map((r) => cols.map((c) => cell(r[c])))])}`;
}

export default function Backup() {
  const { t } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  const load = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const out = {} as Data;
      for (const [table, order] of Object.entries(TABLES)) out[table as Table] = await readAll(table as Table, order);
      // Staff names, roles and calendar colors, so staff ids can be matched in a new project.
      for (const fn of ['list_staff', 'schedule_instructors'] as const) {
        const { data, error } = await supabase!.rpc(fn);
        if (error) throw error;
        out[fn === 'list_staff' ? 'staff' : fn] = data;
      }
      setData(out);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  return (
    <Layout title={t('navBackup')}>
      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardTitle icon={DatabaseBackup} title={t('backupTitle')} />
          <p className="mb-4 text-sm text-mute">{t('backupBody')}</p>
          {failed && <Notice tone="error">{t('somethingWrong')}</Notice>}
          {!data ? (
            <Button onClick={load} disabled={busy}>
              {busy ? t('loading') : t('backupPrepare')}
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                {t('backupReady', {
                  clients: String(data.students.length),
                  payments: String(data.payment_transactions.length),
                  appointments: String(data.appointments.length),
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => save(`clients-${day}.csv`, tableCsv(data.students), 'text/csv')}>
                  <Download size={16} aria-hidden /> {t('backupClients')}
                </Button>
                <Button variant="secondary" onClick={() => save(`payments-${day}.csv`, tableCsv(data.payment_transactions), 'text/csv')}>
                  <Download size={16} aria-hidden /> {t('backupPayments')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => save(`backup-${day}.json`, JSON.stringify({ exported_at: new Date().toISOString(), ...data }), 'application/json')}
                >
                  <Download size={16} aria-hidden /> {t('backupFull')}
                </Button>
              </div>
              <Notice tone="info">{t('backupPrivate')}</Notice>
            </div>
          )}
        </Card>
        {!IS_STAGING && <Restore />}
      </div>
    </Layout>
  );
}

// What the restore compares, file key -> label. The schedule (appointments) is left out on
// purpose: the live portal imports a fresh Schedulista CSV instead.
const RESTORED = [
  ['students', 'rClients'],
  ['payment_transactions', 'rPayments'],
  ['payment_methods', 'rMethods'],
  ['accounting_periods', 'rClosedMonths'],
  ['expenses', 'rExpenses'],
  ['recurring_expense_rules', 'rRecurring'],
  ['expense_categories', 'rCategories'],
  ['training_courses', 'rCourses'],
  ['training_registrations', 'rSignups'],
  ['knowledge_items', 'rKnowledge'],
  ['role_menu_access', 'rAccess'],
  ['schedule_services', 'rServices'],
  ['schedule_categories', 'rScheduleCats'],
  ['staff', 'rStaff'],
] as const;

type Counts = Record<string, number>;
type Result = { counts: Counts; months: Counts };

/** Net valid payments per month ("2026-01" -> cents), the same sum Reports shows. */
function monthNet(rows: Row[]): Counts {
  const out: Counts = {};
  for (const r of rows) {
    if (r.status !== 'VALID') continue;
    const m = String(r.business_date).slice(0, 7);
    out[m] = (out[m] ?? 0) + (r.kind === 'REFUND' ? -1 : 1) * Number(r.amount_cents);
  }
  return out;
}

/** A password nobody knows, for logins of people who no longer work here. */
const randomPassword = () => `${crypto.randomUUID()}aA1!`;

function Restore() {
  const { t, lang } = useT();
  // Shown only while this portal is empty (null = still checking).
  const [empty, setEmpty] = useState<boolean | null>(null);
  const [file, setFile] = useState<(Data & { exported_at?: string }) | null>(null);
  const [missing, setMissing] = useState<Row[]>([]);
  const [password, setPassword] = useState('');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [made, setMade] = useState<string[]>([]);

  useEffect(() => {
    Promise.all(
      (['students', 'payment_transactions'] as const).map((tbl) => supabase!.from(tbl).select('id', { count: 'exact', head: true })),
    ).then((res) => setEmpty(res.every((r) => !r.error && r.count === 0)));
  }, []);

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setResult(null);
    setError('');
    let json: (Data & { exported_at?: string }) | null = null;
    try {
      const parsed = JSON.parse(await f.text());
      if (Array.isArray(parsed.students) && Array.isArray(parsed.payment_transactions) && Array.isArray(parsed.staff)) json = parsed;
    } catch {
      /* not JSON */
    }
    setBad(!json);
    setFile(json);
    if (!json) return;
    // People in the file with no login here yet get one before the restore.
    const { data } = await supabase!.rpc('list_staff');
    const here = new Set(((data ?? []) as Row[]).map((r) => String(r.email).toLowerCase()));
    setMissing(json.staff.filter((r) => !here.has(String(r.email).toLowerCase())));
  };

  const needPassword = missing.some((r) => r.status !== 'INACTIVE');

  const run = async () => {
    if (!file) return;
    if (needPassword && password.length < 8) return setError(t('passwordTooShort'));
    setBusy(true);
    setError('');
    const names: string[] = [];
    for (const r of missing) {
      const { error } = await supabase!.functions.invoke('staff-admin', {
        body: {
          action: 'create',
          email: r.email,
          password: r.status === 'INACTIVE' ? randomPassword() : password,
          profile: { full_name: r.full_name, roles: r.roles, phone: r.phone, address: r.address,
            certifications: r.certifications, notes: r.notes, pricing_tier: r.pricing_tier },
        },
      });
      if (error) {
        setError(`${t('somethingWrong')} (${String(r.full_name)})`);
        setBusy(false);
        return;
      }
      if (r.status !== 'INACTIVE') names.push(String(r.full_name));
    }
    setMissing([]);
    setMade(names);
    // The schedule is not restored (a fresh Schedulista CSV goes in instead), so it stays out of the upload.
    const upload: Partial<Data> = { ...file };
    delete upload.appointments;
    delete upload.appointment_clients;
    const { data, error } = await supabase!.rpc('restore_backup', { p: upload });
    if (error) setError(error.message);
    else setResult(data as Result);
    setBusy(false);
  };

  if (!empty && !result) return null;

  const fileMonths = file ? monthNet(file.payment_transactions) : {};
  const months = Object.keys({ ...fileMonths, ...result?.months }).sort();
  const rows = file
    ? RESTORED.map(([key, label]) => ({
        label: t(label),
        inFile: String(file[key as keyof Data]?.length ?? 0),
        here: result ? String(result.counts[key] ?? 0) : null,
      }))
    : [];
  const monthRows = months.map((m) => ({
    label: formatMonth(`${m}-01`, lang),
    inFile: formatCents(fileMonths[m] ?? 0),
    here: result ? formatCents(result.months[m] ?? 0) : null,
  }));
  const allSame = result && [...rows, ...monthRows].every((r) => r.inFile === r.here);

  const th = 'px-3 py-2.5 text-right text-xs font-medium first:rounded-l-lg first:pl-3 first:text-left last:rounded-r-lg';
  const td = 'px-3 py-2.5 text-right tabular-nums first:pl-3 first:text-left';
  const table = (title: string, list: typeof rows) => (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[18rem] text-sm">
        <caption className="mb-2 text-left text-xs font-medium uppercase tracking-wide text-mute">{title}</caption>
        <thead className="text-mute">
          <tr className="bg-ink/[0.04]">
            <th scope="col" className={th}>{t('restoreItem')}</th>
            <th scope="col" className={th}>{t('restoreInFile')}</th>
            {result && <th scope="col" className={th}>{t('restoreHere')}</th>}
            {result && <th scope="col" className={th}>{t('restoreMatch')}</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.label} className="border-b border-ink/[0.06] last:border-0">
              <th scope="row" className={`${td} font-normal`}>{r.label}</th>
              <td className={td}>{r.inFile}</td>
              {result && <td className={td}>{r.here}</td>}
              {result && (
                <td className={td}>
                  {r.here === r.inFile ? <Chip tone="good">{t('restoreSame')}</Chip> : <Chip tone="bad">{t('restoreDiff')}</Chip>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Card>
      <CardTitle icon={Upload} title={t('restoreTitle')} />
      <p className="mb-4 text-sm text-mute">{t('restoreBody')}</p>
      <div className="flex flex-col gap-4">
        {bad && <Notice tone="error">{t('restoreBadFile')}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {file && !result && needPassword && (
          <TextField
            label={t('restoreTempPassword')}
            hint={t('restoreTempPasswordHint', { names: missing.filter((r) => r.status !== 'INACTIVE').map((r) => String(r.full_name)).join(', ') })}
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {!result && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex">
              <input type="file" accept="application/json,.json" className="peer sr-only" onChange={choose} />
              <span className="inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-paper px-5 text-sm font-medium text-ink shadow-[0_1px_2px_rgb(var(--c-shadow)/0.06)] ring-1 ring-ink/[0.12] hover:bg-sand/50 peer-focus-visible:ring-2 peer-focus-visible:ring-sage/40">
                <Upload size={16} aria-hidden /> {t('restoreChoose')}
              </span>
            </label>
            {file && (
              <Button onClick={run} disabled={busy}>
                {busy ? t('restoreRunning') : t('restoreRun')}
              </Button>
            )}
          </div>
        )}
        {file?.exported_at && (
          <p className="text-sm text-mute">
            {t('restoreFileFrom', { date: new Date(file.exported_at).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { timeZone: 'America/Los_Angeles' }) })}
          </p>
        )}
        {result && <Notice tone={allSame ? 'success' : 'error'}>{t(allSame ? 'restoreAllSame' : 'restoreSomeDiff')}</Notice>}
        {result && made.length > 0 && <Notice tone="info">{t('restoreNewLogins', { names: made.join(', ') })}</Notice>}
        {file && table(t('restoreTables'), rows)}
        {file && monthRows.length > 0 && table(t('restoreMonthly'), monthRows)}
      </div>
    </Card>
  );
}
