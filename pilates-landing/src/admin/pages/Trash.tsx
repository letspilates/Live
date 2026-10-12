// Settings › Trash (owner): deleted schedule services and categories wait here until they are
// restored (back as they were) or deleted forever.
import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { supabase } from '../supabase';
import { Button, Card, CardTitle, Chip, Dialog, Notice, Skeleton } from '../ui';

type Item = {
  id: string;
  kind: 'schedule_service' | 'schedule_category';
  label: string;
  deleted_at: string;
  staff_profiles: { full_name: string } | null;
};

const KIND: Record<Item['kind'], TextKey> = { schedule_service: 'trashService', schedule_category: 'trashCategory' };
const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

export default function Trash() {
  const { t, lang } = useT();
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [purging, setPurging] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let stale = false;
    void supabase!
      .from('trash')
      .select('id, kind, label, deleted_at, staff_profiles(full_name)')
      .order('deleted_at', { ascending: false })
      .then(({ data, error }) => {
        if (stale) return;
        if (error) setFailed(true);
        else setItems(data as unknown as Item[]);
      });
    return () => {
      stale = true;
    };
  }, [version]);

  const act = async (fn: 'restore_trash' | 'purge_trash', item: Item) => {
    setBusy(true);
    setNote(null);
    const { error } = await supabase!.rpc(fn, { p_id: item.id });
    setBusy(false);
    setPurging(null);
    if (!error) setNote({ tone: 'success', text: t(fn === 'restore_trash' ? 'trashRestored' : 'trashPurged', { name: item.label }) });
    // Same name in use again: say so in the page's language.
    else if (error.code === '23505') setNote({ tone: 'error', text: t('trashNameTaken', { name: item.label }) });
    else setNote({ tone: 'error', text: t(fn === 'restore_trash' ? 'trashRestoreFailed' : 'deleteFailed', { reason: error.message }) });
    setVersion((v) => v + 1);
  };

  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  return (
    <Layout title={t('navTrash')}>
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardTitle icon={Trash2} title={t('trashTitle')} />
          <p className="mb-4 text-sm text-mute">{t('trashBody')}</p>
          {note && (
            <div className="mb-4">
              <Notice tone={note.tone}>{note.text}</Notice>
            </div>
          )}
          {failed ? (
            <Notice tone="error">{t('somethingWrong')}</Notice>
          ) : !items ? (
            <Skeleton className="h-24 w-full" />
          ) : !items.length ? (
            <p className="py-6 text-center text-sm text-mute">{t('trashEmpty')}</p>
          ) : (
            <ul className="divide-y divide-ink/[0.08]">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[15px] font-medium">{item.label}</span>
                      <Chip>{t(KIND[item.kind])}</Chip>
                    </p>
                    <p className="mt-0.5 text-xs text-mute">
                      {item.staff_profiles
                        ? t('trashDeletedBy', { when: when(item.deleted_at), name: item.staff_profiles.full_name })
                        : t('trashDeletedAt', { when: when(item.deleted_at) })}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    aria-label={t('trashRestoreNamed', { name: item.label })}
                    disabled={busy}
                    onClick={() => void act('restore_trash', item)}
                  >
                    <RotateCcw {...ICON} />
                    {t('trashRestore')}
                  </Button>
                  <button
                    type="button"
                    aria-label={t('trashPurgeNamed', { name: item.label })}
                    disabled={busy}
                    onClick={() => setPurging(item)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-mute transition-colors hover:bg-red-700/10 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 disabled:opacity-40"
                  >
                    <Trash2 {...ICON} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-mute">{t('trashHint')}</p>
        </Card>
      </div>

      {purging && (
        <Dialog open onClose={() => setPurging(null)} title={t('trashPurge')}>
          <p className="text-[15px]">{t('trashPurgeSure', { name: purging.label })}</p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setPurging(null)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void act('purge_trash', purging)}>
              {t('trashPurge')}
            </Button>
          </div>
        </Dialog>
      )}
    </Layout>
  );
}
