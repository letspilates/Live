// Knowledge: the team's library of Pilates and Gyrotonic training videos and
// documents. Everyone with a portal account reads it; owners and admins add,
// edit and remove items (save_knowledge_item / delete_knowledge_item).
// Uploaded files sit in a private bucket and open through signed URLs.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, FileText, Pencil, Play, Plus, RefreshCw, Search, X } from 'lucide-react';
import { isAdmin, useStaff, type Role } from '../auth';
import { useT, type TextKey } from '../i18n';
import {
  BUCKET,
  MAX_FILE_BYTES,
  embedFor,
  formatBytes,
  uploadPath,
  type KnowledgeAudience,
  type KnowledgeCategory,
  type KnowledgeItem,
  type KnowledgeKind,
  type Source,
} from '../knowledge';
import Layout from '../Layout';
import { supabase } from '../supabase';
import { Button, Card, Chip, Dialog, Notice, Skeleton, TextArea, TextField, inputCls } from '../ui';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
/** Signed links stay valid this long; Refresh signs them again. */
const SIGNED_SECONDS = 4 * 60 * 60;

const CATEGORIES: { id: KnowledgeCategory; label: TextKey }[] = [
  { id: 'PILATES', label: 'catPilates' },
  { id: 'GYROTONIC', label: 'catGyrotonic' },
];
const KINDS: { id: KnowledgeKind; label: TextKey }[] = [
  { id: 'VIDEO', label: 'kindVideo' },
  { id: 'DOCUMENT', label: 'kindDocument' },
];
const SOURCE_LABEL: Record<Source, TextKey> = {
  youtube: 'sourceYoutube',
  vimeo: 'sourceVimeo',
  drive: 'sourceDrive',
  link: 'sourceWeb',
  file: 'sourceUpload',
};
const catLabel = (c: KnowledgeCategory) => CATEGORIES.find((x) => x.id === c)!.label;

/** An item with what it needs to open: an embeddable player and/or a URL. */
type Entry = KnowledgeItem & {
  source: Source;
  url: string | null;
  player?: string;
  thumbnail?: string;
  video: boolean;
  /** Who was chosen (owners and admins see the full list; others only themselves). */
  viewer_ids: string[];
};

async function loadLibrary(): Promise<Entry[]> {
  const { data, error } = await supabase!.from('knowledge_items').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const items = data as KnowledgeItem[];
  const { data: viewerRows, error: viewerError } = await supabase!.from('knowledge_item_viewers').select('item_id, user_id');
  if (viewerError) throw viewerError;
  const viewers = (id: string) =>
    (viewerRows as { item_id: string; user_id: string }[]).filter((v) => v.item_id === id).map((v) => v.user_id);
  const paths = items.flatMap((i) => (i.file_path ? [i.file_path] : []));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls, error: signError } = await supabase!.storage.from(BUCKET).createSignedUrls(paths, SIGNED_SECONDS);
    if (signError) throw signError;
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  return items.map((i) => {
    if (i.file_path) {
      const url = signed.get(i.file_path) ?? null;
      // Uploaded videos play in a <video> element.
      return { ...i, source: 'file', url, video: i.kind === 'VIDEO' && Boolean(url), viewer_ids: viewers(i.id) };
    }
    const embed = embedFor(i.link_url!);
    return { ...i, ...embed, url: i.link_url, video: Boolean(embed.player), viewer_ids: viewers(i.id) };
  });
}

export default function Knowledge() {
  const { t } = useT();
  const admin = isAdmin(useStaff());
  const [items, setItems] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory | ''>('');
  const [kind, setKind] = useState<KnowledgeKind | ''>('');
  const [watching, setWatching] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<{ item: Entry | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    loadLibrary()
      .then((rows) => {
        if (stale) return;
        setItems(rows);
        setFailed(false);
      })
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [version]);

  const inKind = useMemo(() => (items ?? []).filter((i) => !kind || i.kind === kind), [items, kind]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inKind.filter(
      (i) =>
        (!category || i.category === category) &&
        (!q || i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
    );
  }, [inKind, category, query]);
  const count = (c: KnowledgeCategory | '') => inKind.filter((i) => !c || i.category === c).length;

  const done = (text: string) => {
    setEditing(null);
    setMessage(text);
    setVersion((v) => v + 1);
  };

  return (
    <Layout
      title={t('navKnowledge')}
      actions={
        <>
          <Button variant="secondary" onClick={() => setVersion((v) => v + 1)} title={t('refresh')}>
            <RefreshCw {...ICON} size={16} />
            <span className="sr-only sm:not-sr-only">{t('refresh')}</span>
          </Button>
          {admin && (
            <Button
              onClick={() => {
                setMessage(null);
                setEditing({ item: null });
              }}
            >
              <Plus {...ICON} size={16} />
              {t('addKnowledge')}
            </Button>
          )}
        </>
      }
    >
      <p className="mb-4 max-w-[70ch] text-pretty text-sm text-mute">{t('knowledgeHint')}</p>
      {message && (
        <div className="mb-4">
          <Notice tone="success">{message}</Notice>
        </div>
      )}

      <Card pad={false} className="mb-4 grid gap-3 p-4">
        <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
          <label className="relative block sm:min-w-72 sm:flex-1">
            <span className="sr-only">{t('searchKnowledge')}</span>
            <Search {...ICON} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
            <input
              type="search"
              value={query}
              placeholder={t('searchKnowledge')}
              onChange={(e) => setQuery(e.target.value)}
              className={`${inputCls} pl-11`}
            />
          </label>
          <select
            aria-label={t('knowledgeType')}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={`${inputCls} sm:w-auto`}
          >
            <option value="">{t('allKinds')}</option>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {t(k.label)}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label={t('category')} className="flex flex-wrap gap-2">
          {[{ id: '' as const, label: 'allCategoriesShort' as TextKey }, ...CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
                category === c.id ? 'bg-ink text-cream' : 'bg-paper text-ink ring-1 ring-ink/15 hover:bg-sand/60'
              }`}
            >
              {t(c.label)}
              {items && <span className="ml-1.5 tabular-nums opacity-70">{count(c.id)}</span>}
            </button>
          ))}
        </div>
      </Card>

      {failed ? (
        <div className="max-w-xl">
          <Notice tone="error">{t('knowledgeLoadFailed')}</Notice>
          <Button variant="secondary" className="mt-4" onClick={() => setVersion((v) => v + 1)}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : !items ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-[20px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <p className="text-sm text-mute">{t(items.length ? 'noKnowledgeMatch' : 'noKnowledgeYet')}</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => (
            <li key={item.id} className="min-w-0">
              <ItemCard item={item} admin={admin} onWatch={() => setWatching(item)} onEdit={() => {
                  setMessage(null);
                  setEditing({ item });
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {watching && <Viewer item={watching} onClose={() => setWatching(null)} />}
      {editing && <ItemDialog item={editing.item} onClose={() => setEditing(null)} onDone={done} />}
    </Layout>
  );
}

function ItemCard({ item, admin, onWatch, onEdit }: { item: Entry; admin: boolean; onWatch: () => void; onEdit: () => void }) {
  const { t } = useT();
  const KindIcon = item.kind === 'VIDEO' ? Play : FileText;
  const meta = [t(SOURCE_LABEL[item.source]), item.file_size ? formatBytes(item.file_size) : ''].filter(Boolean).join(' · ');

  const cover = (
    <span className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-t-[20px] bg-sage/10 text-sage">
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.style.display = 'none')}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <KindIcon size={36} strokeWidth={1.5} aria-hidden="true" />
      )}
      {item.thumbnail && (
        <span aria-hidden="true" className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-paper/90 text-ink shadow-pop">
          <Play size={20} strokeWidth={1.75} className="ml-0.5" />
        </span>
      )}
    </span>
  );

  return (
    <Card pad={false} className="flex h-full flex-col">
      {item.video ? (
        <button type="button" onClick={onWatch} aria-label={`${t('watch')}: ${item.title}`} className="rounded-t-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40">
          {cover}
        </button>
      ) : item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${t('openItem')}: ${item.title}`} className="rounded-t-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40">
          {cover}
        </a>
      ) : (
        cover
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="good">{t(catLabel(item.category))}</Chip>
          <Chip>{t(item.kind === 'VIDEO' ? 'kindVideo' : 'kindDocument')}</Chip>
          {admin && item.audience === 'SELECTED' && <Chip tone="warn">{t('onlyPeople', { n: String(item.viewer_ids.length) })}</Chip>}
        </div>
        <h2 className="break-words font-display text-base font-semibold text-ink">{item.title}</h2>
        {item.description && <p className="line-clamp-3 whitespace-pre-line break-words text-sm text-mute">{item.description}</p>}
        <div className="mt-auto flex items-center gap-2 pt-3">
          <span className="min-w-0 flex-1 truncate text-xs text-mute">{meta}</span>
          {admin && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`${t('editKnowledge')}: ${item.title}`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
            >
              <Pencil {...ICON} size={16} />
            </button>
          )}
          {item.video ? (
            <Button variant="secondary" className="min-h-10 px-4" onClick={onWatch}>
              <Play {...ICON} size={16} />
              {t('watch')}
            </Button>
          ) : (
            item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-paper px-4 text-sm font-medium text-ink ring-1 ring-ink/[0.12] transition-colors hover:bg-sand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              >
                <ExternalLink {...ICON} size={16} />
                {t('openItem')}
              </a>
            )
          )}
        </div>
      </div>
    </Card>
  );
}

/** Wide player dialog (the shared Dialog is sized for forms). */
function Viewer({ item, onClose }: { item: Entry; onClose: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={item.title}
      className="max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),60rem)] overflow-y-auto rounded-[20px] bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/50"
    >
      <div className="flex items-center gap-3 px-5 py-3">
        <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold">{item.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/[0.05]"
        >
          <X {...ICON} />
        </button>
      </div>
      <div className="aspect-video w-full bg-black">
        {item.player ? (
          <iframe
            src={item.player}
            title={item.title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <video src={item.url ?? undefined} controls playsInline className="h-full w-full" />
        )}
      </div>
      <div className="flex flex-col gap-3 p-5">
        {item.description && <p className="whitespace-pre-line text-sm text-mute">{item.description}</p>}
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-sage-deep hover:underline">
            <ExternalLink {...ICON} size={16} />
            {t('openNewTab')}
          </a>
        )}
      </div>
    </dialog>
  );
}

function ItemDialog({ item, onClose, onDone }: { item: Entry | null; onClose: () => void; onDone: (text: string) => void }) {
  const { t } = useT();
  const [form, setForm] = useState({
    title: item?.title ?? '',
    category: item?.category ?? ('PILATES' as KnowledgeCategory),
    kind: item?.kind ?? ('VIDEO' as KnowledgeKind),
    description: item?.description ?? '',
    source: 'link' as 'link' | 'file',
    link: '',
    audience: item?.audience ?? ('ALL' as KnowledgeAudience),
    viewer_ids: item?.viewer_ids ?? ([] as string[]),
  });
  // People who can be chosen: everyone active or invited except owners/admins (they see everything anyway).
  const [people, setPeople] = useState<{ user_id: string; full_name: string; roles: Role[] }[] | null>(null);
  useEffect(() => {
    supabase!.rpc('list_staff').then(({ data }) =>
      setPeople(
        ((data ?? []) as { user_id: string; full_name: string; roles: Role[]; status: string }[]).filter(
          (p) => p.status !== 'INACTIVE' && !isAdmin(p),
        ),
      ),
    );
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<'title' | 'link' | 'file' | 'people' | 'form', string>>>({});
  const [busy, setBusy] = useState<'' | 'saving' | 'uploading'>('');
  const [confirming, setConfirming] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fail = (error: { code?: string }) =>
    setErrors({ form: t(error.code === '42501' ? 'noPermission' : 'somethingWrong') });

  const save = async () => {
    const next: typeof errors = {};
    if (!form.title.trim()) next.title = t('enterTitle');
    if (!item && form.source === 'link' && !/^https?:\/\/\S+$/i.test(form.link.trim())) next.link = t('enterLink');
    if (!item && form.source === 'file') {
      if (!file) next.file = t('chooseFile');
      else if (file.size > MAX_FILE_BYTES) next.file = t('fileTooBig');
    }
    if (form.audience === 'SELECTED' && !form.viewer_ids.length) next.people = t('choosePeople');
    setErrors(next);
    if (Object.keys(next).length || busy) return;

    const row: Record<string, unknown> = {
      id: item?.id ?? null,
      category: form.category,
      kind: form.kind,
      title: form.title.trim(),
      description: form.description.trim(),
      audience: form.audience,
      viewer_ids: form.audience === 'SELECTED' ? form.viewer_ids : [],
    };
    let uploaded: string | null = null;
    if (!item && form.source === 'link') row.link_url = form.link.trim();
    if (!item && form.source === 'file' && file) {
      setBusy('uploading');
      uploaded = uploadPath(file.name);
      const { error } = await supabase!.storage
        .from(BUCKET)
        .upload(uploaded, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        setBusy('');
        const big = 'statusCode' in error && String(error.statusCode) === '413';
        return big ? setErrors({ file: t('fileTooBig') }) : fail(error as { code?: string });
      }
      Object.assign(row, { file_path: uploaded, file_name: file.name, file_size: file.size });
    }
    setBusy('saving');
    const { error } = await supabase!.rpc('save_knowledge_item', { p: row });
    setBusy('');
    if (error) {
      // Do not leave an orphan file behind.
      if (uploaded) await supabase!.storage.from(BUCKET).remove([uploaded]);
      return fail(error);
    }
    onDone(t('knowledgeSaved'));
  };

  const remove = async () => {
    if (!item || busy) return;
    setBusy('saving');
    const { data, error } = await supabase!.rpc('delete_knowledge_item', { p_id: item.id });
    if (!error && data) await supabase!.storage.from(BUCKET).remove([data as string]);
    setBusy('');
    if (error) return fail(error);
    onDone(t('knowledgeRemoved', { title: item.title }));
  };

  const segment = (on: boolean) =>
    `min-h-10 flex-1 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
      on ? 'bg-paper text-ink shadow-card' : 'text-mute hover:text-ink'
    }`;

  return (
    <Dialog open onClose={onClose} title={item ? t('editKnowledge') : t('addKnowledge')}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField label={t('itemTitle')} maxLength={200} value={form.title} error={errors.title} onChange={(e) => set('title', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label={t('category')} value={form.category} onChange={(v) => set('category', v as KnowledgeCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.label)}
              </option>
            ))}
          </SelectField>
          <SelectField label={t('knowledgeType')} value={form.kind} onChange={(v) => set('kind', v as KnowledgeKind)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {t(k.label)}
              </option>
            ))}
          </SelectField>
        </div>

        {item ? (
          <p className="text-sm text-mute">
            {t(SOURCE_LABEL[item.source])}: <span className="break-all text-ink">{item.file_name ?? item.link_url}</span>
            <span className="mt-1 block text-xs">{t('sourceKept')}</span>
          </p>
        ) : (
          <>
            <div role="group" aria-label={t('itemSource')} className="flex gap-1 rounded-full bg-ink/[0.06] p-1">
              <button type="button" aria-pressed={form.source === 'link'} onClick={() => set('source', 'link')} className={segment(form.source === 'link')}>
                {t('sourceLink')}
              </button>
              <button type="button" aria-pressed={form.source === 'file'} onClick={() => set('source', 'file')} className={segment(form.source === 'file')}>
                {t('sourceFile')}
              </button>
            </div>
            {form.source === 'link' ? (
              <TextField
                label={t('linkUrl')}
                type="url"
                inputMode="url"
                placeholder="https://youtu.be/…"
                value={form.link}
                hint={t('linkHint')}
                error={errors.link}
                onChange={(e) => set('link', e.target.value)}
              />
            ) : (
              <TextField
                label={t('fileLabel')}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.key,.xls,.xlsx,.txt,image/*,video/*"
                hint={file ? `${file.name} · ${formatBytes(file.size)}` : t('fileHint')}
                error={errors.file}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f?.type.startsWith('video/')) set('kind', 'VIDEO');
                  else if (f) set('kind', 'DOCUMENT');
                  if (f && !form.title.trim()) set('title', f.name.replace(/\.[^.]+$/, ''));
                }}
              />
            )}
          </>
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium text-ink">{t('audienceLabel')}</legend>
          <div className="flex gap-1 rounded-full bg-ink/[0.06] p-1">
            {(['ALL', 'SELECTED'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={form.audience === a} onClick={() => set('audience', a)} className={segment(form.audience === a)}>
                {t(a === 'ALL' ? 'audienceAll' : 'audienceSelected')}
              </button>
            ))}
          </div>
          {form.audience === 'SELECTED' && (
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl p-1 ring-1 ring-ink/[0.12]">
              {!people ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                people.map((p) => (
                  <label key={p.user_id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm hover:bg-ink/[0.03]">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-sage"
                      checked={form.viewer_ids.includes(p.user_id)}
                      onChange={(e) =>
                        set('viewer_ids', e.target.checked ? [...form.viewer_ids, p.user_id] : form.viewer_ids.filter((id) => id !== p.user_id))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
                    <span className="shrink-0 text-xs text-mute">{p.roles.map((r) => t(r)).join(' · ')}</span>
                  </label>
                ))
              )}
            </div>
          )}
          {errors.people && <p className="text-sm text-red-700">{errors.people}</p>}
          <p className="text-xs text-mute">{t('audienceHint')}</p>
        </fieldset>

        <TextArea label={t('description')} maxLength={4000} value={form.description} onChange={(e) => set('description', e.target.value)} />

        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        {confirming && item && <Notice tone="info">{t('confirmRemoveItem', { title: item.title })}</Notice>}

        <div className="flex flex-wrap items-center gap-3">
          {item &&
            (confirming ? (
              <Button variant="danger" onClick={() => void remove()} disabled={Boolean(busy)}>
                {t('removeForGood')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                {t('removeItem')}
              </Button>
            ))}
          <span className="flex-1" />
          <Button type="submit" disabled={Boolean(busy)}>
            {busy === 'uploading' ? t('uploading') : busy === 'saving' ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {children}
      </select>
    </label>
  );
}
