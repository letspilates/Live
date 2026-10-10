// Settings › Notifications (owner). Layout follows the MindFlow reference:
// a header card, then groups of events with one switch per channel.
// ponytail: nothing is sent yet, so choices live in component state only;
// save them to the database when sending is built.
import { useState } from 'react';
import {
  Bell,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Info,
  LockKeyhole,
  Mail,
  MessageSquare,
  ReceiptText,
  Send,
  Undo2,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { Card, Switch, inputCls } from '../ui';

const CHANNELS = [
  { id: 'email', label: 'notifEmail', Icon: Mail },
  { id: 'sms', label: 'notifSms', Icon: MessageSquare },
] as const;
type Channel = (typeof CHANNELS)[number]['id'];

type Event = { id: string; title: TextKey; body: TextKey; Icon: LucideIcon; on: Channel[] };
const GROUPS: { title: TextKey; body: TextKey; Icon: LucideIcon; events: Event[] }[] = [
  {
    title: 'notifGroupPayments',
    body: 'notifGroupPaymentsBody',
    Icon: Wallet,
    events: [
      { id: 'payment', title: 'notifNewPayment', body: 'notifNewPaymentBody', Icon: CircleDollarSign, on: [] },
      { id: 'refund', title: 'notifRefund', body: 'notifRefundBody', Icon: Undo2, on: ['email'] },
      { id: 'void', title: 'notifVoid', body: 'notifVoidBody', Icon: ReceiptText, on: ['email'] },
    ],
  },
  {
    title: 'notifGroupStudio',
    body: 'notifGroupStudioBody',
    Icon: ClipboardList,
    events: [
      { id: 'training', title: 'notifTraining', body: 'notifTrainingBody', Icon: ClipboardList, on: ['email', 'sms'] },
      { id: 'client', title: 'notifClient', body: 'notifClientBody', Icon: UserPlus, on: [] },
    ],
  },
  {
    title: 'notifGroupMoney',
    body: 'notifGroupMoneyBody',
    Icon: ReceiptText,
    events: [
      { id: 'bill', title: 'notifBillDue', body: 'notifBillDueBody', Icon: CalendarClock, on: ['email'] },
      { id: 'close', title: 'notifClose', body: 'notifCloseBody', Icon: LockKeyhole, on: ['email'] },
    ],
  },
  {
    title: 'notifGroupTeam',
    body: 'notifGroupTeamBody',
    Icon: Users,
    events: [{ id: 'joined', title: 'notifJoined', body: 'notifJoinedBody', Icon: UserPlus, on: ['email'] }],
  },
];

const initial = () =>
  new Set(GROUPS.flatMap((g) => g.events.flatMap((e) => e.on.map((c) => `${e.id}:${c}`))));

function IconTile({ Icon, strong = false }: { Icon: LucideIcon; strong?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        strong ? 'bg-sage/15 text-sage-deep' : 'bg-ink/[0.04] text-mute'
      }`}
    >
      <Icon size={18} strokeWidth={1.75} />
    </span>
  );
}

export default function Notifications() {
  const { t } = useT();
  const [on, setOn] = useState(initial);
  const [frequency, setFrequency] = useState('instant');

  const flip = (key: string, value: boolean) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <Layout title={t('navNotifications')}>
      <div className="flex max-w-4xl flex-col gap-4">
        {/* Header card (reference: "Stay in the loop") */}
        <Card className="relative overflow-hidden bg-gradient-to-br from-paper to-sage/[0.07]">
          <div className="flex items-start gap-4 pr-0 sm:pr-28">
            <IconTile Icon={Bell} strong />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">{t('notifHeroTitle')}</h2>
              <p className="mt-1 text-pretty text-sm text-mute">{t('notifHeroBody')}</p>
            </div>
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-4 -top-4 hidden h-32 w-32 items-center justify-center rounded-full bg-sage/10 text-sage sm:flex"
          >
            <Bell size={44} strokeWidth={1.5} className="-rotate-12" />
            <span className="absolute right-9 top-9 h-3.5 w-3.5 rounded-full bg-clay ring-4 ring-paper" />
          </span>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-ink/[0.04] px-3 py-2.5 text-xs text-mute sm:mr-28">
            <Info size={14} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0" />
            {t('notifPreview')}
          </p>
        </Card>

        {GROUPS.map((g) => (
          <Card key={g.title} pad={false} className="px-4 py-2 sm:px-6">
            <section aria-label={t(g.title)}>
              <div className="flex items-center gap-4 border-b border-ink/[0.06] py-4">
                <IconTile Icon={g.Icon} strong />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-base font-semibold">{t(g.title)}</h2>
                  <p className="text-sm text-mute">{t(g.body)}</p>
                </div>
                {/* Channel names once per group on wide screens; each switch is labelled for screen readers. */}
                <div aria-hidden="true" className="hidden gap-2 sm:flex">
                  {CHANNELS.map(({ id, label, Icon }) => (
                    <span key={id} className="flex w-16 items-center justify-center gap-1.5 text-xs text-mute">
                      <Icon size={13} strokeWidth={1.75} />
                      {t(label)}
                    </span>
                  ))}
                </div>
              </div>
              <ul className="divide-y divide-ink/[0.06]">
                {g.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
                    <IconTile Icon={e.Icon} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t(e.title)}</p>
                      <p className="text-xs text-mute">{t(e.body)}</p>
                    </div>
                    <div className="flex w-full gap-2 pl-14 sm:w-auto sm:pl-0">
                      {CHANNELS.map(({ id, label, Icon }) => (
                        <div key={id} className="flex items-center gap-2 sm:w-16 sm:justify-center">
                          <Switch
                            label={`${t(e.title)}: ${t(label)}`}
                            checked={on.has(`${e.id}:${id}`)}
                            onChange={(v) => flip(`${e.id}:${id}`, v)}
                          />
                          <span aria-hidden="true" className="flex items-center gap-1 text-xs text-mute sm:hidden">
                            <Icon size={13} strokeWidth={1.75} />
                            {t(label)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </Card>
        ))}

        {/* Frequency row (reference: "Notification frequency") */}
        <Card pad={false} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
          <IconTile Icon={Send} strong />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('notifFrequency')}</p>
            <p className="text-xs text-mute">{t('notifFrequencyBody')}</p>
          </div>
          <select
            aria-label={t('notifFrequency')}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className={`${inputCls} w-full sm:w-48`}
          >
            <option value="instant">{t('notifInstant')}</option>
            <option value="daily">{t('notifDaily')}</option>
            <option value="weekly">{t('notifWeekly')}</option>
          </select>
        </Card>
      </div>
    </Layout>
  );
}
