// Settings → Admin: menu access and backups, one tab each.
import { useState } from 'react';
import { useT } from '../i18n';
import Layout from '../Layout';
import Access from './Access';
import Backup from './Backup';

export default function Admin() {
  const { t } = useT();
  const [tab, setTab] = useState<'access' | 'backup'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'backup' ? 'backup' : 'access',
  );

  const show = (next: typeof tab) => {
    setTab(next);
    window.history.replaceState(null, '', `?tab=${next}`);
  };

  return (
    <Layout title={t('navAdmin')}>
      <div
        role="tablist"
        aria-label={t('navAdmin')}
        className="mb-6 inline-flex rounded-full bg-ink/[0.06] p-1"
      >
        {(['access', 'backup'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => show(id)}
            className={`min-h-10 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
              tab === id ? 'bg-paper text-ink shadow-card' : 'text-mute hover:text-ink'
            }`}
          >
            {t(id === 'access' ? 'navAccess' : 'navBackup')}
          </button>
        ))}
      </div>
      {tab === 'access' ? <Access /> : <Backup />}
    </Layout>
  );
}
