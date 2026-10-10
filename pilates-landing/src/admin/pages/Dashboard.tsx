import { useEffect, useState } from 'react';
import { useStaff } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
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
          <TeamCard />
          <EnrollmentsCard />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
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
    <Card>
      <h2 className="mb-4 text-sm font-medium text-mute">{t('team')}</h2>
      {failed ? (
        <Notice tone="error">{t('somethingWrong')}</Notice>
      ) : !counts ? (
        <div className="flex gap-6">
          <Skeleton className="h-12 w-16" />
          <Skeleton className="h-12 w-16" />
          <Skeleton className="h-12 w-16" />
        </div>
      ) : (
        <dl className="flex gap-8">
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
      <Button variant="secondary" className="mt-6" onClick={() => navigate('staff')}>
        {t('manageStaff')}
      </Button>
    </Card>
  );
}

// No numbers here yet: enrollment data still lives in the Google Sheet (Phase 4A).
function EnrollmentsCard() {
  const { t } = useT();
  return (
    <Card className="flex flex-col">
      <h2 className="mb-4 text-sm font-medium text-mute">{t('navEnrollments')}</h2>
      <p className="flex-1 text-ink">{t('enrollmentsCardBody')}</p>
      <Button variant="secondary" className="mt-6 self-start" onClick={() => navigate('enrollments')}>
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
      <p className="mt-5 text-sm text-mute">{t('instructorSoon')}</p>
      <Button variant="secondary" className="mt-6" onClick={() => navigate('account')}>
        {t('navAccount')}
      </Button>
    </Card>
  );
}
