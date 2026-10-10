// Settings → Users (owners and admins): list, add (invitation email or a
// password set now), edit details and roles, deactivate, resend an invitation,
// delete. Sign-in accounts change through the staff-admin Edge Function; the
// database functions hold the rules (only owners touch owners, last owner,
// people with records are deactivated instead of deleted).
import { useEffect, useState, type FormEvent } from 'react';
import { Ban, CircleCheck, Hourglass, Pencil, UserPlus } from 'lucide-react';
import { ROLES, useStaff, type PricingTier, type Role, type StaffStatus } from '../auth';
import { useT } from '../i18n';
import Layout from '../Layout';
import { functionError, supabase } from '../supabase';
import { Button, Card, Dialog, Initials, Notice, Skeleton, TextArea, TextField, inputCls } from '../ui';

interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  roles: Role[];
  status: StaffStatus;
  pricing_tier: PricingTier | null;
  phone: string;
  address: string;
  certifications: string;
  notes: string;
  invited_at: string | null;
  last_sign_in_at: string | null;
}

type Pending = { action: 'deactivate' | 'reactivate' | 'delete'; row: UserRow };
type Message = { tone: 'success' | 'error' | 'info'; text: string };

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Where invitation links land (must also be in Supabase Auth → URL Configuration).
const SET_PASSWORD_URL = `${window.location.origin}${import.meta.env.BASE_URL}admin/set-password/`;

type AdminResult = { error?: string; code?: string; warning?: string; linkedExisting?: boolean };

async function staffAdmin(body: Record<string, unknown>): Promise<AdminResult> {
  const { data, error } = await supabase!.functions.invoke('staff-admin', { body });
  if (error) {
    const detail = await functionError(error);
    return { error: detail.error ?? '', code: detail.code };
  }
  return data ?? {};
}

export default function StaffPage() {
  const { t, lang } = useT();
  const me = useStaff();
  const iAmOwner = me.roles.includes('OWNER');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState(0);
  // null = closed, 'new' = Add user, a row = Edit user
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    supabase?.rpc('list_staff').then(({ data, error }) => {
      setLoadFailed(Boolean(error));
      if (!error) setRows(data as UserRow[]);
    });
  }, [version]);

  const reload = () => setVersion((v) => v + 1);

  const errorText = (r: AdminResult, name: string) =>
    r.code === 'LPREF'
      ? t('hasRecords', { name })
      : r.code === '42501'
        ? t('ownerOnly')
        : r.code === '23505'
          ? t('alreadyStaff')
          : r.error || t('somethingWrong');

  const report = (result: AdminResult, success: string, name: string) => {
    if (result.error !== undefined) setMessage({ tone: 'error', text: errorText(result, name) });
    else if (result.warning) setMessage({ tone: 'info', text: result.warning });
    else setMessage({ tone: 'success', text: success });
  };

  const run = async () => {
    if (!pending || busy) return;
    const { row, action } = pending;
    setBusy(true);
    const result = await staffAdmin({ action, userId: row.user_id });
    const done = { deactivate: 'deactivated', reactivate: 'reactivated', delete: 'userDeleted' } as const;
    report(result, t(done[action], { name: row.full_name }), row.full_name);
    setBusy(false);
    setPending(null);
    setEditing(null);
    reload();
  };

  const resend = async (row: UserRow) => {
    setBusy(true);
    const result = await staffAdmin({ action: 'resend', userId: row.user_id, redirectTo: SET_PASSWORD_URL });
    setBusy(false);
    setEditing(null);
    report(result, t('inviteResent', { name: row.full_name }), row.full_name);
  };

  const CONFIRM = { deactivate: 'confirmDeactivate', reactivate: 'confirmReactivate', delete: 'confirmDeleteUser' } as const;
  const confirmText = (p: Pending) => t(CONFIRM[p.action], { name: p.row.full_name });

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
    }).format(new Date(iso));

  return (
    <Layout
      title={t('navUsers')}
      actions={
        <Button onClick={() => setEditing('new')}>
          <UserPlus size={18} strokeWidth={1.75} aria-hidden="true" />
          {t('addUser')}
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
              {rows.map((row) => {
                // Admins manage everyone but owners.
                const locked = row.roles.includes('OWNER') && !iAmOwner;
                return (
                  <li
                    key={row.user_id}
                    className="grid gap-3 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Initials name={row.full_name} className="h-10 w-10 text-sm" />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 font-medium">
                          <span className="truncate">{row.full_name}</span>
                          {row.user_id === me.user_id && (
                            <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-mute">{t('you')}</span>
                          )}
                        </p>
                        <p className="truncate text-sm text-mute">
                          {row.email}
                          {row.phone && ` · ${row.phone}`}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <StatusBadge status={row.status} />
                          {row.roles.map((r) => (
                            <span key={r} className="rounded-full bg-sand px-2.5 py-1 font-medium text-ink">
                              {t(r)}
                            </span>
                          ))}
                          {row.roles.includes('INSTRUCTOR') && (
                            <span className="text-mute">
                              {t('tier')}: {row.pricing_tier ? t(row.pricing_tier) : t('tierNotSet')}
                            </span>
                          )}
                          <span className="text-mute">
                            {row.status === 'INVITED' && row.invited_at
                              ? `${t('invitedOn')}: ${fmtDate(row.invited_at)}`
                              : `${t('lastSignIn')}: ${row.last_sign_in_at ? fmtDate(row.last_sign_in_at) : t('never')}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    {!locked && (
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Button
                          variant="secondary"
                          className="min-h-9 px-3.5 text-[13px]"
                          disabled={busy}
                          onClick={() => setEditing(row)}
                          aria-label={`${t('editUser')}: ${row.full_name}`}
                        >
                          <Pencil {...ICON} size={14} />
                          {t('edit')}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {rows.length <= 1 && <p className="border-t border-ink/10 p-5 text-sm text-mute">{t('noInstructors')}</p>}
          </Card>
        )}
      </div>

      <UserDialog
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.user_id}
        row={editing}
        iAmOwner={iAmOwner}
        isMe={editing !== null && editing !== 'new' && editing.user_id === me.user_id}
        busy={busy}
        onClose={() => setEditing(null)}
        onSaved={(text) => {
          setEditing(null);
          setMessage({ tone: 'success', text });
          reload();
        }}
        onAction={(action, row) => setPending({ action, row })}
        onResend={(row) => void resend(row)}
      />

      <Dialog open={pending !== null} onClose={() => setPending(null)} title={t('confirm')}>
        {pending && (
          <>
            <p className="text-sm text-ink">{confirmText(pending)}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPending(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant={pending.action === 'reactivate' ? 'primary' : 'danger'}
                disabled={busy}
                onClick={() => void run()}
              >
                {t(pending.action === 'delete' ? 'delete' : 'confirm')}
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

/** Add user (row = 'new') or edit one. One form for both, so the details are the same. */
function UserDialog({
  row,
  iAmOwner,
  isMe,
  busy,
  onClose,
  onSaved,
  onAction,
  onResend,
}: {
  row: UserRow | 'new' | null;
  iAmOwner: boolean;
  isMe: boolean;
  busy: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onAction: (action: Pending['action'], row: UserRow) => void;
  onResend: (row: UserRow) => void;
}) {
  const { t } = useT();
  const adding = row === 'new';
  const existing = row !== null && row !== 'new' ? row : null;
  const [f, setF] = useState(() => ({
    email: existing?.email ?? '',
    full_name: existing?.full_name ?? '',
    phone: existing?.phone ?? '',
    address: existing?.address ?? '',
    certifications: existing?.certifications ?? '',
    notes: existing?.notes ?? '',
    roles: existing?.roles ?? (['INSTRUCTOR'] as Role[]),
    pricing_tier: existing?.pricing_tier ?? '',
    join: 'invite' as 'invite' | 'password',
    password: '',
  }));
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const toggleRole = (r: Role) =>
    set({
      roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : ROLES.filter((x) => x === r || f.roles.includes(x)),
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const next = {
      email: !adding || EMAIL_RE.test(f.email.trim()) ? undefined : t('enterEmail'),
      name: f.full_name.trim() ? undefined : t('enterName'),
      password: !adding || f.join === 'invite' || f.password.length >= 8 ? undefined : t('passwordTooShort'),
      form: f.roles.length ? undefined : t('chooseRole'),
    };
    setErrors(next);
    if (next.name || next.email || next.password || next.form) return;
    const profile = {
      full_name: f.full_name.trim(),
      roles: f.roles,
      phone: f.phone,
      address: f.address,
      certifications: f.certifications,
      notes: f.notes,
      pricing_tier: f.roles.includes('INSTRUCTOR') ? f.pricing_tier : '',
    };
    setSaving(true);
    let failure: string | null = null;
    let linked = false;
    if (adding) {
      const result = await staffAdmin(
        f.join === 'invite'
          ? { action: 'invite', email: f.email.trim(), profile, redirectTo: SET_PASSWORD_URL }
          : { action: 'create', email: f.email.trim(), profile, password: f.password },
      );
      if (result.error !== undefined) {
        failure =
          result.code === '23505'
            ? t('alreadyStaff')
            : result.code === '42501'
              ? t('ownerOnly')
              : f.join === 'invite'
                ? t('inviteFailed', { reason: result.error || t('somethingWrong') })
                : result.error || t('somethingWrong');
      }
      linked = Boolean(result.linkedExisting);
    } else {
      const { error } = await supabase!.rpc('update_staff_user', { p_user_id: existing!.user_id, p: profile });
      if (error) failure = error.code === '42501' ? t('ownerOnly') : error.message;
    }
    setSaving(false);
    if (failure) return setErrors({ form: failure });
    const name = profile.full_name;
    onSaved(
      !adding
        ? t('userSaved')
        : linked
          ? t('staffLinked', { name })
          : f.join === 'invite'
            ? t('userInvited', { name })
            : t('staffAdded', { name }),
    );
  };

  return (
    <Dialog open={row !== null} onClose={onClose} title={t(adding ? 'addUser' : 'editUser')}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        {adding ? (
          <TextField
            label={t('email')}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={f.email}
            error={errors.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        ) : (
          <p className="text-sm">
            <span className="text-mute">{t('email')}: </span>
            {existing?.email}
          </p>
        )}
        <TextField
          label={t('fullName')}
          autoComplete="off"
          maxLength={80}
          value={f.full_name}
          error={errors.name}
          onChange={(e) => set({ full_name: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('phone')}
            type="tel"
            autoComplete="off"
            maxLength={50}
            value={f.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
          <TextField
            label={t('address')}
            autoComplete="off"
            maxLength={300}
            value={f.address}
            onChange={(e) => set({ address: e.target.value })}
          />
        </div>
        <TextArea
          label={t('certifications')}
          hint={t('certificationsHint')}
          maxLength={1000}
          value={f.certifications}
          onChange={(e) => set({ certifications: e.target.value })}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('roles')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <label
                key={r}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ring-1 ring-ink/10 ${
                  r === 'OWNER' && !iAmOwner ? 'opacity-50' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-sage"
                  checked={f.roles.includes(r)}
                  // Only an owner hands out (or takes away) the owner role.
                  disabled={r === 'OWNER' && !iAmOwner}
                  onChange={() => toggleRole(r)}
                />
                {t(r)}
              </label>
            ))}
          </div>
          <p className="text-sm text-mute">{t('rolesHint')}</p>
        </fieldset>

        {f.roles.includes('INSTRUCTOR') && (
          <div className="flex flex-col gap-2">
            <label htmlFor="user-tier" className="text-sm font-medium">
              {t('tier')}
            </label>
            <select
              id="user-tier"
              className={inputCls}
              value={f.pricing_tier}
              onChange={(e) => set({ pricing_tier: e.target.value })}
            >
              <option value="">{t('tierNotSet')}</option>
              <option value="CERTIFIED">{t('CERTIFIED')}</option>
              <option value="MASTER">{t('MASTER')}</option>
            </select>
          </div>
        )}

        <TextArea
          label={t('staffNotes')}
          maxLength={1000}
          value={f.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />

        {adding && (
          <fieldset className="flex flex-col gap-2 rounded-xl bg-sand/50 p-4">
            <legend className="sr-only">{t('howJoin')}</legend>
            <p className="text-sm font-medium">{t('howJoin')}</p>
            {(['invite', 'password'] as const).map((j) => (
              <label key={j} className="flex cursor-pointer items-start gap-3 py-1.5 text-sm">
                <input
                  type="radio"
                  name="join"
                  className="mt-0.5 h-5 w-5 accent-sage"
                  checked={f.join === j}
                  onChange={() => set({ join: j })}
                />
                <span>
                  <span className="block font-medium">{t(j === 'invite' ? 'joinInvite' : 'joinPassword')}</span>
                  <span className="block text-mute">{t(j === 'invite' ? 'joinInviteHint' : 'joinPasswordHint')}</span>
                </span>
              </label>
            ))}
            {f.join === 'password' && (
              <TextField
                label={t('firstPassword')}
                type="text"
                autoComplete="new-password"
                autoCapitalize="off"
                spellCheck={false}
                hint={t('firstPasswordHint')}
                value={f.password}
                error={errors.password}
                onChange={(e) => set({ password: e.target.value })}
              />
            )}
          </fieldset>
        )}

        {existing && !isMe && (
          <div className="flex flex-wrap gap-2 border-t border-ink/10 pt-4">
            {existing.status === 'INVITED' && (
              <Button variant="secondary" disabled={busy} onClick={() => onResend(existing)}>
                {t('resendInvite')}
              </Button>
            )}
            {existing.status === 'ACTIVE' && (
              <Button variant="secondary" disabled={busy} onClick={() => onAction('deactivate', existing)}>
                {t('deactivate')}
              </Button>
            )}
            {existing.status === 'INACTIVE' && (
              <Button variant="secondary" disabled={busy} onClick={() => onAction('reactivate', existing)}>
                {t('reactivate')}
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => onAction('delete', existing)}>
              {t('deleteUser')}
            </Button>
          </div>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('saving') : adding ? t(f.join === 'invite' ? 'sendInvite' : 'addUser') : t('save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
