// Notifications (owner): placeholder in the Settings menu. Nothing is sent
// yet (email notifications are on hold); settings land here when they exist.
import { BellOff } from 'lucide-react';
import { useT } from '../i18n';
import Layout from '../Layout';
import { Card } from '../ui';

export default function Notifications() {
  const { t } = useT();
  return (
    <Layout title={t('navNotifications')}>
      <Card className="max-w-xl">
        <div className="flex items-start gap-3">
          <BellOff size={22} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-mute" />
          <div>
            <h2 className="font-display text-lg font-semibold">{t('noNotificationsTitle')}</h2>
            <p className="mt-1 text-pretty text-sm text-mute">{t('noNotificationsBody')}</p>
          </div>
        </div>
      </Card>
    </Layout>
  );
}
