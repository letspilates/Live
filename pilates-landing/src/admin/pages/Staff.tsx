// Owner-only staff management: list, invite, cancel invite, deactivate,
// reactivate, change role. Auth-admin actions go through the staff-admin
// Edge Function; role changes call the owner-checked database function.
import { useEffect, useState, type FormEvent } from 'react';
import { Ban, CircleCheck, Hourglass, UserPlus } from 'lucide-react';
import { useStaff, type PricingTier, type Role, type StaffStatus } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { adminUrl } from '../router';
import { functionError, supabase } from '../supabase';
import { Button, Card, Dialog, Initials, Notice, Skeleton, TextField, inputCls } from '../ui';

interface StaffRow {
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
  status: StaffStatus;
  pricing_tier: PricingTier | null;
  invited_at: string | null;
  last_sign_in_at: string | null;
}

type Action = 'deactivate' | 'reactivate' | 'cancel' | 'makeOwner' | 'makeInstructor';
type Message = { tone: 'success' | 'error' | 'info'; text: string };

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function staffAdmin(body: Record<string, string>): Promise<{ error?: string; warning?: string }> {
  const { data, error } = await supabase!.functions.invoke('staff-admin', { body });
  if (error) return { error: (await functionError(error)) ?? '' };
  return { warning: data?.warning };
}

const inviteRedirect = () => window.location.origin + adminUrl('set-password');

export default function StaffPage() {
  const { t, lang } = useT();
  const me = useStaff();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<{ action: Action; row: StaffRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    supabase?.rpc('list_staff').then(({ data, error }) => {
      setLoadFailed(Boolean(error));
      if (!error) setRows(data as StaffRow[]);
    });
  }, [version]);

  const reload = () => setVersion((v) => v + 1);

  const report = (result: { error?: string; warning?: string }, success: string) => {
    if (result.error !== undefined) setMessage({ tone: 'error', text: result.error || t('somethingWrong') });
    else if (result.warning) setMessage({ tone: 'info', text: result.warning });
    else setMessage({ tone: 'success', text: success });
  };

  const run = async () => {
    if (!pending || busy) return;
    const { action, row } = pending;
    const vars = { name: row.full_name, email: row.email };
    setBusy(true);
    if (action === 'makeOwner' || action === 'makeInstructor') {
      const { error } = await supabase!.rpc('set_staff_role', {
        p_user_id: row.user_id,
        p_role: action === 'makeOwner' ? 'OWNER' : 'INSTRUCTOR',
      });
      report(error ? { error: error.message } : {}, t('roleUpdated'));
    } else {
      const result = await staffAdmin({ action, userId: row.user_id });
      const done: Record<typeof action, TextKey> = {
        deactivate: 'deactivated',
        reactivate: 'reactivated',
        cancel: 'inviteCancelled',
      };
      report(result, t(done[action], vars));
    }
    setBusy(false);
    setPending(null);
    reload();
  };

  const resend = async (row: StaffRow) => {
    setBusy(true);
    const result = await staffAdmin({
      action: 'invite',
      email: row.email,
      fullName: row.full_name,
      pricingTier: row.pricing_tier ?? '',
      redirectTo: inviteRedirect(),
    });
    setBusy(false);
    report(result, t('inviteSent', { email: row.email }));
    reload();
  };

  const confirmText: Record<Action, TextKey> = {
    deactivate: 'confirmDeactivate',
    reactivate: 'confirmReactivate',
    cancel: 'confirmCancelInvite',
    makeOwner: 'confirmMakeOwner',
    makeInstructor: 'confirmMakeInstructor',
  };

  const actionsFor = (row: StaffRow) => {
    if (row.user_id === me.user_id) return null;
    const btn = (label: TextKey, onClick: () => void) => (
      <Button key={label} variant="secondary" className="min-h-9 px-3.5 text-[13px]" disabled={busy} onClick={onClick}>
        {t(label)}
      </Button>
    );
    if (row.status === 'INVITED') {
      return [btn('resendInvite', () => void resend(row)), btn('cancelInvite', () => setPending({ action: 'cancel', row }))];
    }
    if (row.status === 'INACTIVE') return [btn('reactivate', () => setPending({ action: 'reactivate', row }))];
    return [
      row.role === 'OWNER'
        ? btn('makeInstructor', () => setPending({ action: 'makeInstructor', row }))
        : btn('makeOwner', () => setPending({ action: 'makeOwner', row })),
      btn('deactivate', () => setPending({ action: 'deactivate', row })),
    ];
  };

  const onlyOwners = rows?.every((r) => r.role === 'OWNER');

  return (
    <Layout
      title={t('navStaff')}
      actions={
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus size={18} strokeWidth={1.75} aria-hidden="true" />
          {t('inviteInstructor')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {loadFailed && <Notice tone="error">{t('somethingWrong')}</Notice>}

        {!rows && !loadFailed && (
          <Card className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </Card>
        )}

        {rows && (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-ink/10">
              {rows.map((row) => (
                <li key={row.user_id} className="grid gap-3 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <Initials name={row.full_name} className="h-10 w-10 text-sm" />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 font-medium">
                        <span className="truncate">{row.full_name}</span>
                        {row.user_id === me.user_id && (
                          <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-mute">{t('you')}</span>
                        )}
                      </p>
                      <p className="truncate text-sm text-mute">{row.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <StatusBadge status={row.status} />
                        <span className="rounded-full bg-sand px-2.5 py-1 font-medium text-ink">{t(row.role)}</span>
                        <span className="text-mute">
                          {t('tier')}: {row.pricing_tier ? t(row.pricing_tier) : t('tierNotSet')}
                        </span>
                        <span className="text-mute">
                          {t('lastSignIn')}:{' '}
                          {row.last_sign_in_at
                            ? new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', {
                                timeZone: 'America/Los_Angeles',
                                dateStyle: 'medium',
                              }).format(new Date(row.last_sign_in_at))
                            : t('never')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">{actionsFor(row)}</div>
                </li>
              ))}
            </ul>
            {onlyOwners && <p className="border-t border-ink/10 p-5 text-sm text-mute">{t('noInstructors')}</p>}
          </Card>
        )}
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSent={(email) => {
          setInviteOpen(false);
          setMessage({ tone: 'success', text: t('inviteSent', { email }) });
          reload();
        }}
      />

      <Dialog open={pending !== null} onClose={() => setPending(null)} title={t('confirm')}>
        {pending && (
          <>
            <p className="text-sm text-ink">
              {t(confirmText[pending.action], { name: pending.row.full_name, email: pending.row.email })}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPending(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant={pending.action === 'deactivate' || pending.action === 'cancel' ? 'danger' : 'primary'}
                disabled={busy}
                onClick={() => void run()}
              >
                {t('confirm')}
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </Layout>
  );
}

function StatusBadge({ status }: { status: StaffStatus }) {
  const { t } = useT();
  const style = {
    ACTIVE: { cls: 'bg-sage/10 text-sage-deep', Icon: CircleCheck },
    INVITED: { cls: 'bg-clay/15 text-ink', Icon: Hourglass },
    INACTIVE: { cls: 'bg-ink/[0.06] text-mute', Icon: Ban },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${style.cls}`}>
      <style.Icon {...ICON} size={13} />
      {t(status)}
    </span>
  );
}

function InviteDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const { t } = useT();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const close = () => {
    setErrors({});
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next = {
      name: fullName.trim() ? undefined : t('enterName'),
      email: EMAIL_RE.test(email.trim()) ? undefined : t('enterEmail'),
    };
    setErrors(next);
    if (next.name || next.email) return;
    setBusy(true);
    const result = await staffAdmin({
      action: 'invite',
      email: email.trim(),
      fullName: fullName.trim(),
      pricingTier: tier,
      redirectTo: inviteRedirect(),
    });
    setBusy(false);
    if (result.error !== undefined) {
      setErrors({ form: result.error || t('somethingWrong') });
      return;
    }
    onSent(email.trim());
    setFullName('');
    setEmail('');
    setTier('');
  };

  return (
    <Dialog open={open} onClose={close} title={t('inviteInstructor')}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <TextField
          label={t('fullName')}
          autoComplete="off"
          value={fullName}
          error={errors.name}
          onChange={(e) => setFullName(e.target.value)}
        />
        <TextField
          label={t('email')}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-tier" className="text-sm font-medium">
            {t('tier')}
          </label>
          <select id="invite-tier" className={inputCls} value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">{t('tierNotSet')}</option>
            <option value="CERTIFIED">{t('CERTIFIED')}</option>
            <option value="MASTER">{t('MASTER')}</option>
          </select>
        </div>
        <p className="text-sm text-mute">{t('inviteNote')}</p>
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="secondary" onClick={close}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('sending') : t('sendInvite')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
