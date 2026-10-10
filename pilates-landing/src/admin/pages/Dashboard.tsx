import { useEffect, useState } from 'react';
import { useStaff } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { formatCents, laToday, loadPayments, totals, type Totals } from '../payments';
import { navigate } from '../router';
import { supabase } from '../supabase';
import { Button, Card, Notice, Skeleton } from '../ui';

function greetingKey(): TextKey {
  // Studio time, not the viewer's device time.
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(),
    ),
  );
  return hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';
}

export default function Dashboard() {
  const { t } = useT();
  const staff = useStaff();
  const firstName = staff.full_name.split(/\s+/)[0];

  return (
    <Layout title={t('navDashboard')}>
      <p className="mb-6 font-display text-2xl font-semibold tracking-tightest sm:text-3xl">
        {t(greetingKey())}, {firstName}
      </p>
      {staff.role === 'OWNER' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <TodayCard />
          <TeamCard />
          <EnrollmentsCard />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <TodayCard />
          <ProfileCard />
        </div>
      )}
    </Layout>
  );
}

type Counts = { ACTIVE: number; INVITED: number; INACTIVE: number };

function TeamCard() {
  const { t } = useT();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    supabase?.rpc('list_staff').then(({ data, error }) => {
      if (error) return setFailed(true);
      const next: Counts = { ACTIVE: 0, INVITED: 0, INACTIVE: 0 };
      for (const row of data as { status: keyof Counts }[]) next[row.status] += 1;
      setCounts(next);
    });
  }, []);

  return (
    <Card className="flex flex-col">
      <h2 className="mb-4 text-sm font-medium text-mute">{t('team')}</h2>
      {failed ? (
        <div className="mb-6">
          <Notice tone="error">{t('somethingWrong')}</Notice>
        </div>
      ) : !counts ? (
        <div className="mb-6 flex gap-6">
          <Skeleton className="h-12 w-16" />
          <Skeleton className="h-12 w-16" />
          <Skeleton className="h-12 w-16" />
        </div>
      ) : (
        <dl className="mb-6 flex gap-8">
          {(
            [
              ['ACTIVE', 'activeCount'],
              ['INVITED', 'invitedCount'],
              ['INACTIVE', 'inactiveCount'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col-reverse">
              <dt className="text-sm text-mute">{t(label)}</dt>
              <dd className="font-display text-3xl font-semibold tabular-nums">{counts[key]}</dd>
            </div>
          ))}
        </dl>
      )}
      <Button variant="secondary" className="mt-auto self-start" onClick={() => navigate('users')}>
        {t('manageStaff')}
      </Button>
    </Card>
  );
}

// Today's payments (LA date). The database decides what each role sees:
// owners every payment, everyone else only the ones they recorded.
function TodayCard() {
  const { t } = useT();
  const owner = useStaff().role === 'OWNER';
  const [sum, setSum] = useState<Totals | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const today = laToday();
    loadPayments(today, today)
      .then((rows) => setSum(totals(rows)))
      .catch(() => setFailed(true));
  }, []);

  return (
    <Card className="flex flex-col">
      <h2 className="mb-4 text-sm font-medium text-mute">{t(owner ? 'todayIncome' : 'myToday')}</h2>
      {failed ? (
        <div className="mb-6">
          <Notice tone="error">{t('somethingWrong')}</Notice>
        </div>
      ) : !sum ? (
        <Skeleton className="mb-6 h-14 w-40" />
      ) : (
        <div className="mb-6">
          <p className="font-display text-3xl font-semibold tabular-nums">{formatCents(sum.net)}</p>
          <p className="mt-1 text-sm text-mute">
            {t('nPayments', { n: String(sum.count) })}
            {sum.refunds > 0 && ` · ${t('refunds')} −${formatCents(sum.refunds)}`}
          </p>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-3">
        <Button onClick={() => navigate('payments')}>{t('recordPayment')}</Button>
        {owner && (
          <Button variant="secondary" onClick={() => navigate('payments', { search: '?tab=history' })}>
            {t('tabTransactions')}
          </Button>
        )}
      </div>
    </Card>
  );
}

// No numbers here yet: enrollment data still lives in the Google Sheet (Phase 4A).
function EnrollmentsCard() {
  const { t } = useT();
  return (
    <Card className="flex flex-col">
      <h2 className="mb-4 text-sm font-medium text-mute">{t('navTrainings')}</h2>
      <p className="mb-6 max-w-[65ch] text-pretty text-ink">{t('enrollmentsCardBody')}</p>
      <Button variant="secondary" className="mt-auto self-start" onClick={() => navigate('trainings')}>
        {t('openEnrollments')}
      </Button>
    </Card>
  );
}

function ProfileCard() {
  const { t } = useT();
  const staff = useStaff();
  const rows: [TextKey, string][] = [
    ['role', t(staff.role)],
    ['email', staff.email],
  ];
  if (staff.role === 'INSTRUCTOR') rows.push(['tier', staff.pricing_tier ? t(staff.pricing_tier) : t('tierNotSet')]);
  return (
    <Card>
      <h2 className="mb-4 text-sm font-medium text-mute">{t('myProfile')}</h2>
      <dl className="grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-sm text-mute">{t(label)}</dt>
            <dd className="min-w-0 truncate text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <Button variant="secondary" className="mt-6" onClick={() => navigate('account')}>
        {t('navAccount')}
      </Button>
    </Card>
  );
}
