import { useState, type FormEvent } from 'react';
import { LangToggle } from '../Layout';
import { useT, type TextKey } from '../i18n';
import { adminUrl } from '../router';
import { supabase } from '../supabase';
import { Button, CenteredCard, Notice, TextField } from '../ui';

// Never reveal whether an email has an account: one message for bad email or password.
function signInError(error: { status?: number; code?: string; name?: string }): TextKey {
  if (error.code === 'user_banned') return 'inactiveBody';
  if (error.status === 429) return 'tooManyAttempts';
  if (error.name === 'AuthRetryableFetchError' || !error.status) return 'networkError';
  return 'badCredentials';
}

export default function Login({ sessionEnded }: { sessionEnded: boolean }) {
  const { t } = useT();
  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TextKey | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // On success the auth listener moves on to the next page.
    if (authError) {
      setError(signInError(authError));
      setBusy(false);
    }
  };

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + adminUrl('set-password'),
    });
    setBusy(false);
    if (resetError && (resetError.status === 429 || !resetError.status)) {
      setError(resetError.status === 429 ? 'tooManyAttempts' : 'networkError');
      return;
    }
    setResetSent(true);
  };

  const switchMode = (next: 'signin' | 'reset') => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  return (
    <CenteredCard title={mode === 'signin' ? t('signIn') : t('resetTitle')}>
      {mode === 'signin' ? (
        <form onSubmit={signIn} className="flex flex-col gap-5" noValidate>
          {sessionEnded && !error && <Notice tone="info">{t('sessionEnded')}</Notice>}
          {error && <Notice tone="error">{t(error)}</Notice>}
          <TextField
            label={t('email')}
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label={t('password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="h-9 rounded-full px-3 text-sm font-medium text-mute hover:text-ink"
              >
                {showPassword ? t('hide') : t('show')}
              </button>
            }
          />
          <Button type="submit" disabled={busy || !email || !password} className="w-full">
            {busy ? t('signingIn') : t('signIn')}
          </Button>
          <button
            type="button"
            onClick={() => switchMode('reset')}
            className="self-start text-sm font-medium text-sage-deep underline-offset-4 hover:underline"
          >
            {t('forgotPassword')}
          </button>
        </form>
      ) : (
        <form onSubmit={sendReset} className="flex flex-col gap-5" noValidate>
          {resetSent ? (
            <Notice tone="success">{t('resetSent')}</Notice>
          ) : (
            <p className="text-sm text-mute">{t('resetBody')}</p>
          )}
          {error && <Notice tone="error">{t(error)}</Notice>}
          {!resetSent && (
            <>
              <TextField
                label={t('email')}
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={busy || !email.includes('@')} className="w-full">
                {busy ? t('sending') : t('sendLink')}
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="self-start text-sm font-medium text-sage-deep underline-offset-4 hover:underline"
          >
            {t('backToSignIn')}
          </button>
        </form>
      )}
      <div className="mt-6 flex justify-end">
        <LangToggle />
      </div>
    </CenteredCard>
  );
}
