// Settings › Notifications › Client texts (Owner/Admin): the SMS switches (sms_settings),
// wording, test numbers, "Send test text" and the last 20 texts. The database queues
// texts and supabase/functions/sms-send sends them (migration 20261014060000_sms_texts).
import { useEffect, useState } from 'react';
import { BellRing, CalendarClock, CalendarX2, FlaskConical, MessageSquare, type LucideIcon } from 'lucide-react';
import { useT, type TextKey } from '../i18n';
import { supabase } from '../supabase';
import { IS_STAGING, SUPABASE_PROJECT } from '../../supabaseProject';
import { Button, Card, CardTitle, Chip, Notice, Skeleton, Switch, TextArea, TextField } from '../ui';

type Settings = {
  enabled: boolean;
  reminders: boolean;
  change_notices: boolean;
  cancel_notices: boolean;
  test_mode: boolean;
  test_phones: string[];
  reminder_text: string;
  change_text: string;
  cancel_text: string;
};
type Msg = { id: string; kind: string; to_phone: string; status: string; error: string; created_at: string };
type Note = { tone: 'error' | 'success' | 'info'; text: string } | null;

const KINDS: { flag: 'reminders' | 'change_notices' | 'cancel_notices'; text: 'reminder_text' | 'change_text' | 'cancel_text';
  title: TextKey; body: TextKey; Icon: LucideIcon }[] = [
  { flag: 'reminders', text: 'reminder_text', title: 'smsReminder', body: 'smsReminderBody', Icon: BellRing },
  { flag: 'change_notices', text: 'change_text', title: 'smsChange', body: 'smsChangeBody', Icon: CalendarClock },
  { flag: 'cancel_notices', text: 'cancel_text', title: 'smsCancel', body: 'smsCancelBody', Icon: CalendarX2 },
];
const KIND_LABEL: Record<string, TextKey> = { REMINDER: 'smsReminder', CHANGE: 'smsChange', CANCEL: 'smsCancel', TEST: 'smsTest' };
const STATUS: Record<string, { label: TextKey; tone: 'neutral' | 'good' | 'warn' | 'bad' }> = {
  QUEUED: { label: 'smsWaiting', tone: 'warn' },
  SENDING: { label: 'smsWaiting', tone: 'warn' },
  SENT: { label: 'smsSent', tone: 'good' },
  FAILED: { label: 'smsFailed', tone: 'bad' },
  SKIPPED: { label: 'smsSkipped', tone: 'neutral' },
};

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

export default function ClientTexts() {
  const { t, lang } = useT();
  const [s, setS] = useState<Settings | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [delay, setDelay] = useState<number | null>(null);
  const [phones, setPhones] = useState('');
  const [words, setWords] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Note>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadMessages = async () => {
    const { data } = await supabase!.from('sms_messages').select('id, kind, to_phone, status, error, created_at')
      .order('created_at', { ascending: false }).limit(20);
    setMsgs((data ?? []) as Msg[]);
  };

  useEffect(() => {
    void (async () => {
      const [set, sched] = await Promise.all([
        supabase!.from('sms_settings').select('*').maybeSingle(),
        supabase!.from('schedule_settings').select('change_text_minutes').maybeSingle(),
        loadMessages(),
      ]);
      if (set.error || !set.data) return setFailed(true);
      setS(set.data as Settings);
      setPhones((set.data.test_phones as string[]).join(', '));
      setDelay(sched.data?.change_text_minutes ?? null);
    })();
  }, []);

  const save = async (patch: Partial<Settings>, done?: TextKey) => {
    setBusy(true);
    setNote(null);
    // The URL lets the 5-minute job in the database reach sms-send.
    const { error } = await supabase!.rpc('save_sms_settings', { p: { ...patch, functions_url: SUPABASE_PROJECT.url } });
    setBusy(false);
    if (error) {
      setNote({ tone: 'error', text: error.code === '22023' ? t('smsBadPhones') : t('somethingWrong') });
      return false;
    }
    setS((prev) => (prev ? { ...prev, ...patch } : prev));
    if (done) setNote({ tone: 'success', text: t(done) });
    return true;
  };

  const sendTest = async () => {
    setBusy(true);
    setNote(null);
    const { data, error } = await supabase!.rpc('send_test_sms');
    if (!error && data) await supabase!.functions.invoke('sms-send', { body: {} });
    await loadMessages();
    setBusy(false);
    setNote(error ? { tone: 'error', text: t('somethingWrong') } : data ? { tone: 'success', text: t('smsTestSent') } : { tone: 'info', text: t('smsNoTestPhones') });
  };

  if (failed) return <Notice tone="error">{t('somethingWrong')}</Notice>;
  if (!s) return <Skeleton className="h-64" />;

  const state = !s.enabled ? { label: t('smsOff'), tone: 'neutral' as const }
    : s.test_mode ? { label: t('smsTestMode'), tone: 'warn' as const } : { label: t('smsOn'), tone: 'good' as const };
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'America/Los_Angeles', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="flex flex-col gap-4">
      <Card pad={false} className="px-4 py-2 sm:px-6" label={t('smsTitle')}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink/[0.06] py-4">
          <IconTile Icon={MessageSquare} strong />
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 font-display text-base font-semibold">
              {t('smsTitle')} <Chip tone={state.tone}>{state.label}</Chip>
            </h2>
            <p className="text-sm text-mute">{t('smsBody')}</p>
          </div>
          <div className="flex w-full items-center gap-2 pl-14 sm:w-auto sm:pl-0">
            <Switch label={t('smsSend')} checked={s.enabled} onChange={(v) => void save({ enabled: v })} />
            <span className="text-xs text-mute">{t('smsSend')}</span>
          </div>
        </div>
        <ul className="divide-y divide-ink/[0.06]">
          {KINDS.map((k) => (
            <li key={k.flag} className="py-4">
              <div className="flex items-center gap-4">
                <IconTile Icon={k.Icon} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(k.title)}</p>
                  <p className="text-xs text-mute">
                    {k.flag === 'reminders' ? t(k.body)
                      : delay == null ? t('smsDelayOff') : t(k.body).replace('{n}', String(delay))}
                  </p>
                </div>
                <Switch label={t(k.title)} checked={s[k.flag]} onChange={(v) => void save({ [k.flag]: v })} />
              </div>
              <details className="group mt-2 pl-14">
                <summary className="cursor-pointer text-xs font-medium text-sage-deep">{t('smsWording')}</summary>
                <div className="mt-3 flex flex-col gap-3">
                  <TextArea
                    label={t(k.title)}
                    hint={t('smsWordingHint')}
                    maxLength={320}
                    value={words[k.text] ?? s[k.text]}
                    onChange={(e) => setWords({ ...words, [k.text]: e.target.value })}
                  />
                  <Button variant="secondary" className="self-start" disabled={busy || !(words[k.text] ?? s[k.text]).trim()}
                    onClick={() => void save({ [k.text]: (words[k.text] ?? s[k.text]).trim() }, 'smsSaved')}>
                    {t('save')}
                  </Button>
                </div>
              </details>
            </li>
          ))}
          <li className="py-4">
            <div className="flex items-center gap-4">
              <IconTile Icon={FlaskConical} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t('smsTestMode')}</p>
                <p className="text-xs text-mute">{t('smsTestModeBody')}</p>
              </div>
              <Switch label={t('smsTestMode')} checked={s.test_mode} onChange={(v) => void save({ test_mode: v })} />
            </div>
            <div className="mt-3 flex flex-col gap-3 pl-14">
              <TextField label={t('smsTestPhones')} hint={t('smsTestPhonesHint')} inputMode="tel" value={phones}
                onChange={(e) => setPhones(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy}
                  onClick={() => void save({ test_phones: phones.split(',').map((p) => p.trim()).filter(Boolean) }, 'smsSaved')}>
                  {t('save')}
                </Button>
                <Button disabled={busy || s.test_phones.length === 0} onClick={() => void sendTest()}>{t('smsSendTest')}</Button>
              </div>
            </div>
          </li>
        </ul>
        {(note || IS_STAGING) && (
          <div className="flex flex-col gap-2 pb-4">
            {IS_STAGING && <Notice tone="info">{t('smsStaging')}</Notice>}
            {note && <Notice tone={note.tone}>{note.text}</Notice>}
          </div>
        )}
      </Card>

      <Card label={t('smsRecent')}>
        <CardTitle icon={MessageSquare} title={t('smsRecent')} />
        {msgs.length === 0 ? (
          <p className="text-sm text-mute">{t('smsNone')}</p>
        ) : (
          <ul className="divide-y divide-ink/[0.06]">
            {msgs.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                <span className="w-28 shrink-0 text-mute">{when(m.created_at)}</span>
                <span className="min-w-0 flex-1 font-medium">{t(KIND_LABEL[m.kind])}</span>
                <span className="text-mute">{m.to_phone ? `•••${m.to_phone.slice(-4)}` : ''}</span>
                <Chip tone={STATUS[m.status].tone}>{t(STATUS[m.status].label)}</Chip>
                {m.error && <p className="w-full text-xs text-mute">{m.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
