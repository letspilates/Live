// Portal shell: left sidebar (desktop), icon rail (tablet), drawer (phone),
// header with page title, language and account. Menu items depend on role,
// but the database is what actually enforces access.
import { useRef, useState, type ReactNode } from 'react';
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import LogoIcon from '../components/LogoIcon';
import { ROLES, useAuth, useStaff, type Role } from './auth';
import { setLang, useT, type TextKey } from './i18n';
import { Link, useRoute } from './router';
import type { AdminPath } from './routes';
import { IS_STAGING } from './supabase';
import { Initials } from './ui';

const NAV: { to: AdminPath; label: TextKey; Icon: LucideIcon; roles: Role[] }[] = [
  { to: '', label: 'navDashboard', Icon: LayoutDashboard, roles: ROLES },
  { to: 'daily-income', label: 'navDailyIncome', Icon: Wallet, roles: ROLES },
  { to: 'enrollments', label: 'navEnrollments', Icon: ClipboardList, roles: ['OWNER'] },
  { to: 'staff', label: 'navStaff', Icon: Users, roles: ['OWNER'] },
];

const ICON = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const;
const COLLAPSE_KEY = 'lp-admin-sidebar-collapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Layout({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const drawer = useRef<HTMLDialogElement>(null);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* storage blocked */
      }
      return !c;
    });
  };

  return (
    <div className="min-h-[100dvh] bg-cream text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink text-sm text-cream focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:px-4 focus:py-2"
      >
        {t('skipToContent')}
      </a>
      {/* Tablet rail (md) / desktop sidebar (lg) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-ink/10 bg-paper md:flex ${
          collapsed ? '' : 'lg:w-60'
        }`}
      >
        <SidebarContent wide={!collapsed} onToggleCollapsed={toggleCollapsed} collapsed={collapsed} />
      </aside>

      {/* Phone drawer */}
      <dialog
        ref={drawer}
        onClick={(e) => e.target === drawer.current && drawer.current?.close()}
        className="m-0 h-[100dvh] max-h-none w-[min(18rem,85vw)] bg-paper p-0 text-ink backdrop:bg-ink/30"
      >
        <div className="flex h-full flex-col">
          <button
            type="button"
            onClick={() => drawer.current?.close()}
            className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink/[0.05]"
            aria-label={t('closeMenu')}
          >
            <X {...ICON} />
          </button>
          <SidebarContent wide alwaysWide onNavigate={() => drawer.current?.close()} />
        </div>
      </dialog>

      <div className={`md:pl-[72px] ${collapsed ? '' : 'lg:pl-60'}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink/10 bg-cream/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => drawer.current?.showModal()}
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink/[0.05] lg:hidden"
            aria-label={t('menu')}
          >
            <Menu {...ICON} />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold sm:text-xl">{title}</h1>
          {IS_STAGING && (
            <span className="hidden rounded-full bg-clay/20 px-2.5 py-1 text-xs font-semibold text-ink sm:inline">
              {t('staging')}
            </span>
          )}
          <LangToggle />
          <AccountMenu />
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full outline-none max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {actions && <div className="mb-6 flex flex-wrap justify-end gap-3">{actions}</div>}
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  wide,
  alwaysWide = false,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  wide: boolean;
  alwaysWide?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useT();
  const staff = useStaff();
  const { signOut } = useAuth();
  const route = useRoute();
  // In the rail (tablet, or collapsed desktop) only icons show.
  const label = alwaysWide ? '' : wide ? 'hidden lg:inline' : 'hidden';

  return (
    <div className="flex h-full flex-col px-3 py-4">
      <Link
        to=""
        onNavigate={onNavigate}
        className="mb-6 flex h-11 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sage/40 px-3"
        title="Let's Pilates LA"
      >
        <LogoIcon className="h-6 w-6 shrink-0 text-sage" />
        <span className={`font-display font-semibold tracking-tightest ${label}`}>Let&rsquo;s Pilates LA</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.filter((item) => item.roles.includes(staff.role)).map(({ to, label: key, Icon }) => {
          const active = route === to;
          return (
            <Link
              key={to}
              to={to}
              onNavigate={onNavigate}
              aria-current={active ? 'page' : undefined}
              title={t(key)}
              className={`flex h-11 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sage/40 px-3 text-sm font-medium transition-colors ${
                active ? 'bg-sand text-ink' : 'text-mute hover:bg-ink/[0.04] hover:text-ink'
              }`}
            >
              <Icon {...ICON} className={`shrink-0 ${active ? 'text-sage' : ''}`} />
              <span className={label}>{t(key)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-ink/10 pt-3">
        <Link
          to="account"
          onNavigate={onNavigate}
          title={t('navAccount')}
          aria-current={route === 'account' ? 'page' : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sage/40 px-2 py-1.5 transition-colors ${
            route === 'account' ? 'bg-sand' : 'hover:bg-ink/[0.04]'
          }`}
        >
          <Initials name={staff.full_name} className="h-8 w-8 text-xs" />
          <span className={`min-w-0 ${label}`}>
            <span className="block truncate text-sm font-medium">{staff.full_name}</span>
            <span className="block text-xs text-mute">{t(staff.role)}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          title={t('signOut')}
          className="flex h-11 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sage/40 px-3 text-sm text-mute transition-colors hover:bg-ink/[0.04] hover:text-ink"
        >
          <LogOut {...ICON} className="shrink-0" />
          <span className={label}>{t('signOut')}</span>
        </button>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? t('expand') : t('collapse')}
            className="hidden h-11 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sage/40 px-3 text-sm text-mute transition-colors hover:bg-ink/[0.04] hover:text-ink lg:flex"
          >
            {collapsed ? (
              <PanelLeftOpen {...ICON} className="shrink-0" />
            ) : (
              <PanelLeftClose {...ICON} className="shrink-0" />
            )}
            <span className={label}>{collapsed ? t('expand') : t('collapse')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** EN / KR segmented control (same idea as the public site's toggle). */
export function LangToggle() {
  const { lang } = useT();
  return (
    <div role="group" aria-label="Language" className="inline-flex shrink-0 rounded-full bg-sand p-0.5">
      {(['en', 'ko'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`h-8 w-10 rounded-full text-xs font-semibold transition-colors ${
            lang === code ? 'bg-ink text-cream' : 'text-mute hover:text-ink'
          }`}
        >
          {code === 'en' ? 'EN' : 'KR'}
        </button>
      ))}
    </div>
  );
}

/** Initials in the header open a small menu: who is signed in, account, sign out. */
function AccountMenu() {
  const { t } = useT();
  const staff = useStaff();
  const { signOut } = useAuth();
  const menu = useRef<HTMLDivElement>(null);
  const close = () => menu.current?.hidePopover();

  return (
    <>
      <button
        type="button"
        popoverTarget="account-menu"
        title={t('accountMenu')}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
      >
        <Initials name={staff.full_name} className="h-9 w-9 text-xs" />
        <span className="sr-only">{t('accountMenu')}</span>
      </button>
      {/* Native popover: light dismiss (outside click, Escape) comes from the browser. */}
      <div
        ref={menu}
        id="account-menu"
        popover="auto"
        style={{ inset: 'auto 1rem auto auto', top: '4.25rem' }}
        className="m-0 w-64 rounded-2xl bg-paper p-2 text-ink shadow-[0_12px_32px_rgba(28,26,22,0.12)] ring-1 ring-ink/10"
      >
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{staff.full_name}</p>
          <p className="truncate text-xs text-mute">{staff.email}</p>
          <p className="mt-1 text-xs text-mute">{t(staff.role)}</p>
        </div>
        <div className="my-1 border-t border-ink/10" />
        <Link
          to="account"
          onNavigate={close}
          className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-ink/[0.04] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
        >
          <UserRound {...ICON} className="shrink-0 text-mute" />
          {t('navAccount')}
        </Link>
        <button
          type="button"
          onClick={() => {
            close();
            void signOut();
          }}
          className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm hover:bg-ink/[0.04] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
        >
          <LogOut {...ICON} className="shrink-0 text-mute" />
          {t('signOut')}
        </button>
      </div>
    </>
  );
}
