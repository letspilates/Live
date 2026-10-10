import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ChartColumn, ClipboardList, Plus, ReceiptText, TrendingUp, Users, Wallet, type LucideIcon } from 'lucide-react';
import { isAdmin, useStaff } from '../auth';
import { addMonths } from '../expenses';
import { loadReport, thisMonth, type Report } from '../finance';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import MonthChart from '../MonthChart';
import {
  formatCents,
  formatTime,
  laToday,
  loadMethods,
  loadPayments,
  methodLabel,
  totals,
  type Method,
  type Payment,
} from '../payments';
import { Link, navigate } from '../router';
import { supabase } from '../supabase';
import { Button, Card, CardTitle, Chip, Initials, Notice, Skeleton } from '../ui';

function greetingKey(): TextKey {
  // Studio time, not the viewer's device time.
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(),
    ),
  );
  return hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening';
}

type Today = { rows: Payment[]; methods: Method[] };

export default function Dashboard() {
  const { t, lang } = useT();
  const staff = useStaff();
  const owner = isAdmin(staff);
  const paymentsMenu = staff.menus.includes('payments');
  const firstName = staff.full_name.split(/\s+/)[0];
  // Today's payments (LA date). The database decides what each role sees:
  // owners every payment, everyone else only the ones they recorded.
  const [today, setToday] = useState<Today | null>(null);
  const [todayFailed, setTodayFailed] = useState(false);

  useEffect(() => {
    if (!owner && !paymentsMenu) return;
    const day = laToday();
    Promise.all([loadPayments(day, day), loadMethods()])
      .then(([rows, methods]) => setToday({ rows, methods }))
      .catch(() => setTodayFailed(true));
  }, [owner, paymentsMenu]);

  const date = new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <Layout title={t('navDashboard')}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div className="min-w-0">
          <p className="text-sm text-mute">{date}</p>
          <p className="mt-1 text-balance font-display text-2xl font-semibold tracking-tightest sm:text-[2rem] sm:leading-tight">
            {t(greetingKey())}, {firstName}
          </p>
        </div>
        {paymentsMenu && (
          <Button onClick={() => navigate('payments')}>
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
            {t('recordPayment')}
          </Button>
        )}
      </div>

      {owner ? (
        <OwnerBoard today={today} todayFailed={todayFailed} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {paymentsMenu && (
            <>
              <Card pad={false} className="lg:col-span-3">
                <dl className="grid">
                  <TodayKpi today={today} failed={todayFailed} label="myToday" />
                </dl>
              </Card>
              <RecentPayments today={today} failed={todayFailed} owner={false} />
            </>
          )}
          <ProfileCard />
        </div>
      )}
    </Layout>
  );
}

// Owner: this month's money and the last 12 months. Recurring expenses are
// created first so this month's rent is already counted (master plan J.3).
function OwnerBoard({ today, todayFailed }: { today: Today | null; todayFailed: boolean }) {
  const [data, setData] = useState<{ month: Report; year: Report } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const day = laToday();
    Promise.resolve(supabase!.rpc('generate_recurring_expenses'))
      .then(() => Promise.all([loadReport(thisMonth(), day), loadReport(addMonths(thisMonth(), -11), day)]))
      .then(([month, year]) => setData({ month, year }))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <KpiStrip today={today} todayFailed={todayFailed} month={data?.month} failed={failed} />
      <ChartCard year={data?.year} failed={failed} />
      <RecentPayments today={today} failed={todayFailed} owner />
      <TeamCard />
      <EnrollmentsCard />
    </div>
  );
}

/* ── KPI strip: one card, cells split by thin lines (reference: Retainr) ── */

function Kpi({
  icon: Icon,
  label,
  value,
  note,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-6">
      <dt className="flex items-center gap-2.5 text-sm text-mute">
        <span aria-hidden="true" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sage/10 text-sage">
          <Icon size={15} strokeWidth={1.75} />
        </span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="min-w-0">
        {children ?? (
          <>
            <span className="block truncate font-display text-xl font-semibold leading-none sm:text-[1.75rem] tracking-tight tabular-nums">
              {value}
            </span>
            {note && <span className="mt-2 block truncate text-xs text-mute">{note}</span>}
          </>
        )}
      </dd>
    </div>
  );
}

function TodayKpi({ today, failed, label }: { today: Today | null; failed: boolean; label: TextKey }) {
  const { t } = useT();
  const sum = today && totals(today.rows);
  return (
    <Kpi icon={Wallet} label={t(label)}>
      {failed ? (
        <Notice tone="error">{t('somethingWrong')}</Notice>
      ) : !sum ? (
        <Skeleton className="h-12 w-32" />
      ) : (
        <>
          <span className="block font-display text-xl font-semibold leading-none sm:text-[1.75rem] tracking-tight tabular-nums">
            {formatCents(sum.net)}
          </span>
          <span className="mt-2 block truncate text-xs text-mute">
            {t('nPayments', { n: String(sum.count) })}
            {sum.refunds > 0 && ` · ${t('refunds')} −${formatCents(sum.refunds)}`}
          </span>
        </>
      )}
    </Kpi>
  );
}

function KpiStrip({
  today,
  todayFailed,
  month: m,
  failed,
}: {
  today: Today | null;
  todayFailed: boolean;
  month?: Report;
  failed: boolean;
}) {
  const { t } = useT();
  const cell = (node: ReactNode) =>
    failed ? <Notice tone="error">{t('somethingWrong')}</Notice> : !m ? <Skeleton className="h-12 w-32" /> : node;

  return (
    <Card pad={false} label={t('thisMonth')} className="overflow-hidden lg:col-span-3">
      <dl className="grid grid-cols-2 gap-px bg-ink/[0.07] lg:grid-cols-4 [&>*]:bg-paper">
        <TodayKpi today={today} failed={todayFailed} label="todayIncome" />
        <Kpi icon={TrendingUp} label={`${t('netRevenue')} · ${t('thisMonth')}`}>
          {cell(<Big value={formatCents(m?.net ?? 0)} note={t('nPayments', { n: String(m?.payment_count ?? 0) })} />)}
        </Kpi>
        <Kpi icon={ReceiptText} label={t('operatingExpenses')}>
          {cell(
            <Big
              value={formatCents(m?.expenses ?? 0)}
              note={m?.unpaid_count ? t('expensesUnpaid', { amount: formatCents(m.expenses_outstanding) }) : t('thisMonth')}
            />,
          )}
        </Kpi>
        <Kpi icon={ChartColumn} label={t('estProfit')}>
          {cell(<Big value={formatCents(m?.profit ?? 0)} note={t('thisMonth')} tone={m && m.profit < 0 ? 'bad' : undefined} />)}
        </Kpi>
      </dl>
    </Card>
  );
}

function Big({ value, note, tone }: { value: string; note?: string; tone?: 'bad' }) {
  return (
    <>
      <span
        className={`block truncate font-display text-xl font-semibold leading-none sm:text-[1.75rem] tracking-tight tabular-nums ${tone === 'bad' ? 'text-red-700' : ''}`}
      >
        {value}
      </span>
      {note && <span className="mt-2 block truncate text-xs text-mute">{note}</span>}
    </>
  );
}

function ChartCard({ year, failed }: { year?: Report; failed: boolean }) {
  const { t } = useT();
  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardTitle
        icon={ChartColumn}
        title={t('revenueVsExpenses')}
        action={
          <Link to="reports" className="inline-flex items-center gap-1 text-sm font-medium text-sage hover:text-sage-deep">
            {t('navReports')}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-mute">{t('last12Months')}</p>
      {failed ? (
        <Notice tone="error">{t('somethingWrong')}</Notice>
      ) : !year ? (
        <Skeleton className="h-52 w-full" />
      ) : (
        <MonthChart months={year.months} />
      )}
    </Card>
  );
}

/* ── Today's payments, newest first (reference: Finance "Recent transactions") ── */

function RecentPayments({ today, failed, owner }: { today: Today | null; failed: boolean; owner: boolean }) {
  const { t, lang } = useT();
  const rows = today?.rows.slice(0, 6) ?? [];
  return (
    <Card className={`flex min-w-0 flex-col ${owner ? '' : 'lg:col-span-2'}`}>
      <CardTitle
        icon={Wallet}
        title={t(owner ? 'todaysPayments' : 'tabTransactions')}
        action={
          <button
            type="button"
            onClick={() => navigate('payments', { search: '?tab=history' })}
            className="inline-flex items-center gap-1 text-sm font-medium text-sage hover:text-sage-deep"
          >
            {t('viewAll')}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        }
      />
      {failed ? (
        <Notice tone="error">{t('somethingWrong')}</Notice>
      ) : !today ? (
        <div className="grid gap-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-sm text-mute">{t('noPaymentsToday')}</p>
      ) : (
        <ul className="-mx-2 grid">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
              <Initials name={r.payer_name} className="h-9 w-9 rounded-xl text-xs" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.payer_name}</span>
                  {r.kind === 'REFUND' && <Chip tone="warn">{t('refund')}</Chip>}
                  {r.status === 'VOID' && <Chip>{t('statusVoid')}</Chip>}
                </span>
                <span className="block truncate text-xs text-mute">
                  {formatTime(r.recorded_at)} · {methodLabel(today.methods, r.method, lang, r.method_other)}
                </span>
              </span>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${r.status === 'VOID' ? 'text-mute line-through' : ''}`}
              >
                {r.kind === 'REFUND' ? '−' : ''}
                {formatCents(r.amount_cents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
      <CardTitle icon={Users} title={t('team')} />
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

function EnrollmentsCard() {
  const { t } = useT();
  return (
    <Card className="flex flex-col lg:col-span-2">
      <CardTitle icon={ClipboardList} title={t('navTrainings')} />
      <p className="mb-6 max-w-[65ch] text-pretty text-mute">{t('enrollmentsCardBody')}</p>
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
    ['role', staff.roles.map((r) => t(r)).join(' · ')],
    ['email', staff.email],
  ];
  if (staff.roles.includes('INSTRUCTOR')) rows.push(['tier', staff.pricing_tier ? t(staff.pricing_tier) : t('tierNotSet')]);
  return (
    <Card className="flex flex-col">
      <CardTitle icon={Users} title={t('myProfile')} />
      <dl className="grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-sm text-mute">{t(label)}</dt>
            <dd className="min-w-0 truncate text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <Button variant="secondary" className="mt-6 self-start" onClick={() => navigate('account')}>
        {t('navAccount')}
      </Button>
    </Card>
  );
}
