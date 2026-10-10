import { useState, type FormEvent } from 'react';
import { useAuth, useStaff } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout, { LangToggle } from '../Layout';
import { supabase } from '../supabase';
import { Button, Card, Notice, TextArea, TextField } from '../ui';

type Result = { tone: 'success' | 'error'; key: TextKey } | null;

export default function Account() {
  const { t } = useT();
  const staff = useStaff();
  const { refresh, signOut } = useAuth();

  const [name, setName] = useState(staff.full_name);
  const [phone, setPhone] = useState(staff.phone ?? '');
  const [address, setAddress] = useState(staff.address ?? '');
  const [certs, setCerts] = useState(staff.certifications ?? '');
  // Arrived from an invitation: ask them to check what the owner entered.
  const welcome = new URLSearchParams(window.location.search).has('welcome');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameResult, setNameResult] = useState<Result>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwResult, setPwResult] = useState<Result>(null);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setNameResult({ tone: 'error', key: 'enterName' });
    setNameBusy(true);
    const { error } = await supabase!.rpc('update_my_profile', {
      p: { full_name: name, phone, address, certifications: certs },
    });
    setNameBusy(false);
    setNameResult(error ? { tone: 'error', key: 'somethingWrong' } : { tone: 'success', key: 'profileSaved' });
    if (!error) refresh();
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setPwResult({ tone: 'error', key: 'passwordTooShort' });
    if (password !== confirm) return setPwResult({ tone: 'error', key: 'passwordMismatch' });
    setPwBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setPwBusy(false);
    if (error) return setPwResult({ tone: 'error', key: error.status === 429 ? 'tooManyAttempts' : 'somethingWrong' });
    setPassword('');
    setConfirm('');
    setPwResult({ tone: 'success', key: 'passwordUpdated' });
  };

  return (
    <Layout title={t('myAccount')}>
      <div className="grid max-w-2xl gap-4">
        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">{t('profile')}</h2>
          <form onSubmit={saveName} className="flex flex-col gap-4" noValidate>
            {welcome && !nameResult && <Notice tone="info">{t('welcomeCheckDetails')}</Notice>}
            {nameResult && <Notice tone={nameResult.tone}>{t(nameResult.key)}</Notice>}
            <TextField
              label={t('fullName')}
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label={t('phone')}
              type="tel"
              autoComplete="tel"
              maxLength={50}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <TextField
              label={t('address')}
              autoComplete="street-address"
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <TextArea
              label={t('certifications')}
              hint={t('certificationsHint')}
              maxLength={1000}
              value={certs}
              onChange={(e) => setCerts(e.target.value)}
            />
            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-mute">{t('email')}:</dt>
                <dd>{staff.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-mute">{t('role')}:</dt>
                <dd>{staff.roles.map((r) => t(r)).join(' · ')}</dd>
              </div>
            </dl>
            <Button type="submit" variant="secondary" className="self-start" disabled={nameBusy}>
              {nameBusy ? t('saving') : t('saveProfile')}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">{t('language')}</h2>
          <LangToggle />
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-lg font-semibold">{t('changePassword')}</h2>
          <form onSubmit={savePassword} className="flex flex-col gap-4" noValidate>
            {pwResult && <Notice tone={pwResult.tone}>{t(pwResult.key)}</Notice>}
            <TextField
              label={t('newPassword')}
              type="password"
              autoComplete="new-password"
              hint={t('passwordHint')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              label={t('confirmPassword')}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" variant="secondary" className="self-start" disabled={pwBusy || !password}>
              {pwBusy ? t('saving') : t('changePassword')}
            </Button>
          </form>
        </Card>

        <Button variant="secondary" className="self-start" onClick={() => void signOut()}>
          {t('signOut')}
        </Button>
      </div>
    </Layout>
  );
}
