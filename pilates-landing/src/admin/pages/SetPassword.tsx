// Landing page for invitation and password-reset emails. Supabase signs the
// user in from the link; here they choose a password.
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { useT, type TextKey } from '../i18n';
import { navigate } from '../router';
import { EMAIL_LINK, supabase } from '../supabase';
import { Button, CenteredCard, Notice, Splash, TextField } from '../ui';

export default function SetPassword() {
  const { t } = useT();
  const { state, refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const isInvite = EMAIL_LINK.get('type') === 'invite';
  const linkFailed = EMAIL_LINK.has('error') || EMAIL_LINK.has('error_code');

  if (state.status === 'loading') return <Splash label={t('loading')} />;

  if (state.status !== 'signed-in') {
    return (
      <CenteredCard title={t('newPasswordTitle')}>
        <Notice tone={linkFailed ? 'error' : 'info'}>{linkFailed ? t('linkExpired') : t('openEmailLink')}</Notice>
        <Button variant="secondary" className="mt-5 w-full" onClick={() => navigate('login')}>
          {t('backToSignIn')}
        </Button>
      </CenteredCard>
    );
  }

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    if (password.length < 8) return setError('passwordTooShort');
    if (password !== confirm) return setError('passwordMismatch');
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.status === 429 ? 'tooManyAttempts' : updateError.status ? 'somethingWrong' : 'networkError');
      return;
    }
    refresh();
    navigate('', { replace: true });
  };

  return (
    <CenteredCard title={isInvite ? t('welcomeSetPassword') : t('newPasswordTitle')}>
      <form onSubmit={save} className="flex flex-col gap-5" noValidate>
        {error && <Notice tone="error">{t(error)}</Notice>}
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
        <Button type="submit" disabled={busy || !password || !confirm} className="w-full">
          {busy ? t('saving') : t('savePassword')}
        </Button>
      </form>
    </CenteredCard>
  );
}
