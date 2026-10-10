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
        </div>
      ) : (
        <Card>
          <p className="text-mute">{t('instructorSoon')}</p>
        </Card>
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

