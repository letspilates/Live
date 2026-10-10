// Settings → Admin: which menus each role may open. Owners and admins always
// have every menu (and edit, delete, invite users). Staff and instructors get
// the menus switched on here; the database checks the same table (app.can).
import { useEffect, useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { MENUS, ROLES, type Menu, type Role } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout, { NAV } from '../Layout';
import { ADMIN_ROUTES } from '../routes';
import { supabase } from '../supabase';
import { Card, Notice, Skeleton } from '../ui';

type Grant = { role: Role; menu: Menu };
const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

// Every menu in the sidebar, plus Schedule before it has a screen.
const ROWS: { label: TextKey; rule: string; soon?: boolean }[] = [
  ...NAV.flatMap((g) => g.items).map((i) => ({ label: i.label, rule: ADMIN_ROUTES[i.to] as string })),
  { label: 'navSchedule', rule: 'schedule', soon: true },
];

export default function Access() {
  const { t } = useT();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    supabase!
      .from('role_menu_access')
      .select('role, menu')
      .then(({ data, error }) => (error ? setLoadFailed(true) : setGrants(data as Grant[])));
  }, []);

  const has = (role: Role, menu: Menu) => Boolean(grants?.some((g) => g.role === role && g.menu === menu));

  const toggle = async (role: Role, menu: Menu) => {
    const on = !has(role, menu);
    setGrants((list) =>
      on ? [...(list ?? []), { role, menu }] : (list ?? []).filter((g) => g.role !== role || g.menu !== menu),
    );
    const { error } = await supabase!.rpc('set_role_menu_access', { p_role: role, p_menu: menu, p_on: on });
    if (error) {
      // Put the switch back.
      setGrants((list) =>
        on ? (list ?? []).filter((g) => g.role !== role || g.menu !== menu) : [...(list ?? []), { role, menu }],
      );
      setStatus({ tone: 'error', text: t('somethingWrong') });
    } else setStatus({ tone: 'success', text: t('accessSaved') });
  };

  const cell = (row: (typeof ROWS)[number], role: Role) => {
    if (role === 'OWNER' || role === 'ADMIN' || row.rule === 'staff')
      return <Check {...ICON} className="text-sage" aria-label={t('always')} />;
    if (!MENUS.includes(row.rule as Menu))
      return <Minus {...ICON} className="text-mute/60" aria-label={t('adminsOnly')} />;
    const menu = row.rule as Menu;
    return (
      <input
        type="checkbox"
        role="switch"
        className="h-5 w-5 cursor-pointer accent-sage"
        aria-label={`${t(role)}: ${t(row.label)}`}
        checked={has(role, menu)}
        onChange={() => void toggle(role, menu)}
      />
    );
  };

  return (
    <Layout title={t('navAccess')}>
      <div className="flex max-w-3xl flex-col gap-4">
        <p className="text-sm text-mute">{t('accessIntro')}</p>
        {loadFailed && <Notice tone="error">{t('somethingWrong')}</Notice>}
        {status && <Notice tone={status.tone}>{status.text}</Notice>}
        <Card className="p-0 sm:p-0">
          {grants ? (
            <div
              role="table"
              aria-label={t('navAccess')}
              className="grid grid-cols-[minmax(0,1fr)_repeat(4,3.75rem)] text-sm sm:grid-cols-[minmax(0,1fr)_repeat(4,6rem)]"
            >
              <div role="row" className="contents">
                <span role="columnheader" className="px-4 py-3 font-medium text-mute sm:px-5">
                  {t('menuCol')}
                </span>
                {ROLES.map((r) => (
                  <span
                    key={r}
                    role="columnheader"
                    className="flex items-center justify-center py-3 text-xs font-medium text-mute sm:text-sm"
                  >
                    {t(r)}
                  </span>
                ))}
              </div>
              {ROWS.map((row) => (
                <div key={row.label} role="row" className="contents">
                  <span role="rowheader" className="border-t border-ink/10 px-4 py-3 font-medium sm:px-5">
                    {t(row.label)}
                    {row.soon && <span className="block text-xs font-normal text-mute">{t('comingSoon')}</span>}
                  </span>
                  {ROLES.map((r) => (
                    <span key={r} role="cell" className="flex items-center justify-center border-t border-ink/10 py-3">
                      {cell(row, r)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-5" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          )}
        </Card>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-mute">
          <li>{t('accessNoteAdmins')}</li>
          <li>{t('accessNoteInside')}</li>
          <li>{t('accessNoteFixed')}</li>
        </ul>
      </div>
    </Layout>
  );
}
