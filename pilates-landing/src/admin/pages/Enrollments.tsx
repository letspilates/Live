// Enrollments, inside the portal shell. Until Phase 4A moves the data to
// Supabase, this shows the existing screen (/admin/legacy/) unchanged: it still
// talks to Apps Script and asks for the studio's ADMIN_KEY itself.
import { ExternalLink } from 'lucide-react';
import { useT } from '../i18n';
import Layout from '../Layout';

const LEGACY_URL = `${import.meta.env.BASE_URL}admin/legacy/`;

export default function Enrollments() {
  const { t } = useT();
  return (
    <Layout title={t('navEnrollments')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="max-w-2xl text-sm text-mute">{t('enrollmentsNote')}</p>
        <a
          href={LEGACY_URL}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-medium text-sage-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
        >
          <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
          {t('openInNewTab')}
        </a>
      </div>
      {/* Fills the rest of the screen so the old page's fixed Save bar stays in view. */}
      <iframe
        src={LEGACY_URL}
        title={t('enrollmentsFrame')}
        className="block h-[calc(100dvh-12rem)] min-h-[28rem] w-full rounded-2xl bg-cream ring-1 ring-ink/10"
      />
    </Layout>
  );
}
