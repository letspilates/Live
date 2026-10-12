// Backup (owner): download every client and every payment (voided and edited
// rows included) as CSV for Excel, plus one JSON file with the raw rows for
// moving the data to another Supabase project. Reads with the owner's own
// login; RLS decides what comes back.
import { useState } from 'react';
import { DatabaseBackup, Download } from 'lucide-react';
import { useT } from '../i18n';
import Layout from '../Layout';
import { supabase } from '../supabase';
import { toCsv } from '../expenses';
import { Button, Card, CardTitle, Notice } from '../ui';

type Row = Record<string, unknown>;
type Data = { students: Row[]; payment_transactions: Row[]; payment_methods: Row[]; accounting_periods: Row[] };

// Pages of 1000 (the API's cap), ordered down to a unique column so no row is
// skipped or read twice between pages.
async function readAll(table: keyof Data, order: string[]): Promise<Row[]> {
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
      setData({
        students: await readAll('students', ['full_name', 'id']),
        payment_transactions: await readAll('payment_transactions', ['business_date', 'recorded_at', 'id']),
        payment_methods: await readAll('payment_methods', ['sort_order', 'code']),
        accounting_periods: await readAll('accounting_periods', ['month']),
      });
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
                {t('backupReady', { clients: String(data.students.length), payments: String(data.payment_transactions.length) })}
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
