// Portal shell: left sidebar (desktop), icon rail (tablet), drawer (phone),
// header with page title, language and account. Menu items depend on role,
// but the database is what actually enforces access.
import { useRef, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCog,
  CalendarDays,
  ClipboardList,
  Contact,
  DatabaseBackup,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import LogoIcon from '../components/LogoIcon';
import { canOpen, useAuth, useStaff } from './auth';
import { setLang, useT, type TextKey } from './i18n';
import { Link, useRoute } from './router';
import type { AdminPath } from './routes';
import { IS_STAGING } from './supabase';
import { toggleTheme, useTheme } from './theme';
import { Card, Initials } from './ui';

// Who sees an item: the route's rule in routes.ts (Settings → Admin for menus).
// hero: the header card's title and line on that page (none on the Dashboard).
type NavItem = { to: AdminPath; label: TextKey; Icon: LucideIcon; hero?: [TextKey, TextKey] };
// Settings → Admin lists the same menus.
// eslint-disable-next-line react-refresh/only-export-components
export const NAV: { group: TextKey; items: NavItem[] }[] = [
  {
    group: 'navGroupStudio',
    items: [
      { to: '', label: 'navDashboard', Icon: LayoutDashboard },
      { to: 'clients', label: 'navClients', Icon: Contact, hero: ['heroClients', 'heroClientsBody'] },
      { to: 'schedule', label: 'navSchedule', Icon: CalendarDays, hero: ['heroSchedule', 'heroScheduleBody'] },
      { to: 'trainings', label: 'navTrainings', Icon: ClipboardList, hero: ['heroTrainings', 'heroTrainingsBody'] },
      { to: 'knowledge', label: 'navKnowledge', Icon: BookOpen, hero: ['heroKnowledge', 'knowledgeHint'] },
    ],
  },
  {
    group: 'navGroupAdmin',
    items: [
      { to: 'payments', label: 'navPayments', Icon: Wallet, hero: ['heroPayments', 'heroPaymentsBody'] },
      { to: 'expenses', label: 'navExpenses', Icon: Receipt, hero: ['heroExpenses', 'heroExpensesBody'] },
      { to: 'reports', label: 'navReports', Icon: BarChart3, hero: ['heroReports', 'heroReportsBody'] },
    ],
  },
  {
    group: 'navGroupSettings',
    items: [
      { to: 'users', label: 'navUsers', Icon: Users, hero: ['heroUsers', 'heroUsersBody'] },
      { to: 'notifications', label: 'navNotifications', Icon: Bell, hero: ['notifHeroTitle', 'notifHeroBody'] },
      { to: 'access', label: 'navAccess', Icon: ShieldCheck, hero: ['heroAccess', 'accessIntro'] },
      { to: 'schedule-settings', label: 'navScheduleSettings', Icon: CalendarCog, hero: ['heroScheduleSettings', 'heroScheduleSettingsBody'] },
      { to: 'backup', label: 'navBackup', Icon: DatabaseBackup, hero: ['heroBackup', 'heroBackupBody'] },
    ],
  },
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

/** The header card at the top of each menu page: icon, title, one line, and the icon again in a soft circle. */
function PageHero({ Icon, hero, dot, note }: { Icon: LucideIcon; hero: [TextKey, TextKey]; dot: boolean; note?: ReactNode }) {
  const { t } = useT();
  return (
    <Card className="relative mb-4 overflow-hidden bg-gradient-to-br from-paper to-sage/[0.07]">
      <div className="flex items-start gap-4 pr-0 sm:pr-28">
        <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage/15 text-sage-deep">
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">{t(hero[0])}</h2>
          <p className="mt-1 text-pretty text-sm text-mute">{t(hero[1])}</p>
        </div>
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -top-4 hidden h-32 w-32 items-center justify-center rounded-full bg-sage/10 text-sage sm:flex"
      >
        <Icon size={44} strokeWidth={1.5} className="-rotate-12" />
        {dot && <span className="absolute right-9 top-9 h-3.5 w-3.5 rounded-full bg-clay ring-4 ring-paper" />}
      </span>
      {note && <div className="mt-4 sm:mr-28">{note}</div>}
    </Card>
  );
}

export default function Layout({
  title,
  actions,
  heroNote,
  wide = false,
  children,
}: {
  title: string;
  actions?: ReactNode;
  /** Extra line inside the header card (Notifications' preview note). */
  heroNote?: ReactNode;
  /** Use the whole window width (the calendar). */
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  const route = useRoute();
  const item = NAV.flatMap((g) => g.items).find((i) => i.to === route);
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
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink text-sm text-cream focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:px-4 focus:py-2"
      >
        {t('skipToContent')}
      </a>
      {/* Tablet rail (md) / desktop sidebar (lg) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-ink/[0.08] bg-paper md:flex ${
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
        {IS_STAGING && (
          <div className="bg-clay/20 py-1 text-center text-xs font-semibold text-ink sm:hidden">{t('staging')}</div>
        )}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-canvas/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
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
          <ThemeToggle />
          <LangToggle />
          <AccountMenu />
        </header>

        <main
          id="main"
          tabIndex={-1}
          className={`mx-auto w-full ${wide ? '' : 'max-w-6xl'} px-4 pb-10 pt-4 outline-none sm:px-6 lg:px-8 lg:pt-6`}
        >
          {item?.hero && <PageHero Icon={item.Icon} hero={item.hero} dot={route === 'notifications'} note={heroNote} />}
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

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV.map(({ group, items }) => {
          const mine = items.filter((item) => canOpen(staff, item.to));
          if (!mine.length) return null;
          return (
            <div key={group} className="flex flex-col gap-1 [&+&]:mt-3">
              {/* Group name in the wide sidebar; a thin line in the icon rail. */}
              <p className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute/80 ${label}`}>{t(group)}</p>
              <span
                aria-hidden="true"
                className={`mx-3 mb-1 border-t border-ink/10 ${alwaysWide ? 'hidden' : wide ? 'lg:hidden' : ''}`}
              />
              {mine.map(({ to, label: key, Icon }) => {
                const active = route === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    onNavigate={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    title={t(key)}
                    className={`flex h-11 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sage/40 px-3 text-sm font-medium transition-colors ${
                      active ? 'bg-canvas text-ink ring-1 ring-ink/[0.06]' : 'text-mute hover:bg-ink/[0.04] hover:text-ink'
                    }`}
                  >
                    <Icon {...ICON} className={`shrink-0 ${active ? 'text-sage' : ''}`} />
                    <span className={label}>{t(key)}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Sign out + collapse: icons on one line (they stack in the narrow rail). */}
      <div className="flex flex-wrap gap-1 border-t border-ink/[0.08] pt-3">
        <button
          type="button"
          onClick={() => void signOut()}
          title={t('signOut')}
          aria-label={t('signOut')}
          className="flex h-11 w-11 items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sage/40 text-mute transition-colors hover:bg-ink/[0.04] hover:text-ink"
        >
          <LogOut {...ICON} />
        </button>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? t('expand') : t('collapse')}
            aria-label={collapsed ? t('expand') : t('collapse')}
            className="hidden h-11 w-11 items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sage/40 text-mute transition-colors hover:bg-ink/[0.04] hover:text-ink lg:flex"
          >
            {collapsed ? <PanelLeftOpen {...ICON} /> : <PanelLeftClose {...ICON} />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Sun / moon: light or dark portal (remembered on this device). */
function ThemeToggle() {
  const { t } = useT();
  const dark = useTheme() === 'dark';
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={t(dark ? 'lightMode' : 'darkMode')}
      aria-label={t(dark ? 'lightMode' : 'darkMode')}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
    >
      <Icon {...ICON} size={18} />
    </button>
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
        className="m-0 w-64 rounded-2xl bg-paper p-2 text-ink shadow-pop ring-1 ring-ink/10"
      >
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{staff.full_name}</p>
          <p className="truncate text-xs text-mute">{staff.email}</p>
          <p className="mt-1 text-xs text-mute">{staff.roles.map((r) => t(r)).join(' · ')}</p>
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
