// Backup (owner): download every client and every payment (voided and edited
// rows included) as CSV for Excel, plus one JSON file with the raw rows of
// every studio table for moving the data to another Supabase project. Reads
// with the owner's own login; RLS decides what comes back.
import { useState } from 'react';
import { DatabaseBackup, Download } from 'lucide-react';
import { useT } from '../i18n';
import Layout from '../Layout';
import { supabase } from '../supabase';
import { toCsv } from '../expenses';
import { Button, Card, CardTitle, Notice } from '../ui';

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
    let query = supabase!.from(table).select('*');
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
      </div>
    </Layout>
  );
}
