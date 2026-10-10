// Access gate for every admin page. Hiding a page here is convenience only:
// the database refuses the data to anyone without the right role.
import { useEffect, type ComponentType } from 'react';
import { canOpen, useAuth } from './auth';
import { useT, type TextKey } from './i18n';
import { navigate, useRoute } from './router';
import type { AdminPath } from './routes';
import { Button, CenteredCard, Notice, Splash } from './ui';
import Account from './pages/Account';
import DailyIncome from './pages/DailyIncome';
import Dashboard from './pages/Dashboard';
import Enrollments from './pages/Enrollments';
import Expenses from './pages/Expenses';
import Login from './pages/Login';
import Members from './pages/Members';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import SetPassword from './pages/SetPassword';
import Access from './pages/Access';
import StaffPage from './pages/Staff';

const PAGES: Record<Exclude<AdminPath, 'login' | 'set-password'>, ComponentType> = {
  '': Dashboard,
  clients: Members,
  trainings: Enrollments,
  payments: DailyIncome,
  expenses: Expenses,
  reports: Reports,
  users: StaffPage,
  access: Access,
  notifications: Notifications,
  account: Account,
};

function Redirect({ to, search = '' }: { to: AdminPath; search?: string }) {
  useEffect(() => navigate(to, { search, replace: true }), [to, search]);
  return null;
}

export default function App() {
  const { t } = useT();
  const route = useRoute();
  const { state, refresh, signOut } = useAuth();

  if (route === null) return <Redirect to="" />;
  if (route === 'set-password') return <SetPassword />;

  if (route === 'login') {
    if (state.status === 'loading') return <Splash label={t('loading')} />;
    if (state.status === 'signed-in') {
      const next = new URLSearchParams(window.location.search).get('next') ?? '';
      const safe = Object.hasOwn(PAGES, next) ? (next as AdminPath) : '';
      return <Redirect to={safe} />;
    }
    return <Login sessionEnded={state.status === 'signed-out' && state.expired} />;
  }

  if (state.status === 'loading') return <Splash label={t('loading')} />;
  if (state.status === 'signed-out') {
    return <Redirect to="login" search={route ? `?next=${route}` : ''} />;
  }
  if (state.status === 'error') {
    return (
      <CenteredCard>
        <Notice tone="error">{t('networkError')}</Notice>
        <Button className="mt-5 w-full" onClick={refresh}>
          {t('tryAgain')}
        </Button>
      </CenteredCard>
    );
  }

  const { staff } = state;
  if (!staff || staff.status !== 'ACTIVE') {
    const [title, body]: [TextKey, TextKey] = staff
      ? ['inactiveTitle', 'inactiveBody']
      : ['noAccessTitle', 'noAccessBody'];
    return (
      <CenteredCard title={t(title)}>
        <p className="text-sm text-mute">{t(body)}</p>
        <Button variant="secondary" className="mt-5 w-full" onClick={() => void signOut()}>
          {t('signOut')}
        </Button>
      </CenteredCard>
    );
  }

  if (!canOpen(staff, route)) return <Redirect to="" />;

  const Page = PAGES[route];
  return <Page />;
}

export function NotConfigured() {
  const { t } = useT();
  return (
    <CenteredCard>
      <Notice tone="info">{t('notConfigured')}</Notice>
    </CenteredCard>
  );
}
