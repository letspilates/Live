// Settings › Schedule (Owner/Admin): the services offered for new appointments in their categories
// (laid out like Schedulista's settings), instructor colors, the change-text delay and the Schedulista
// CSV import. Every save goes through an owner-only database function.
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { GripVertical, MessageSquare, Pencil, Plus, Sparkles, Trash2, Upload, Users } from 'lucide-react';
import { useT } from '../i18n';
import Layout from '../Layout';
import MinutesInput from '../MinutesInput';
import { loadInstructors, loadServices, PALETTE, type Category, type Instructor, type Service } from '../schedule';
import { scheduleFromCsv, type ImportProblem, type ScheduleImportRow } from '../scheduleImport';
import { supabase } from '../supabase';
import { Button, Card, CardTitle, Chip, Dialog, Notice, Skeleton, Stat, Switch, TextArea, TextField, inputCls } from '../ui';

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

type Note = { card: 'colors' | 'text'; tone: 'success' | 'error'; text: string };
type ImportResult = { total: number; importable: number; duplicates: number; failed: number; errors: ImportProblem[] };
type Data = Awaited<ReturnType<typeof loadAll>>;
type List = 'categories' | 'services';

async function loadAll() {
  const [instructors, lists, settings] = await Promise.all([
    loadInstructors(),
    loadServices(true),
    supabase!.from('schedule_settings').select('change_text_minutes').maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  return {
    instructors,
    ...lists,
    textMinutes: (settings.data?.change_text_minutes ?? null) as number | null,
  };
}

const TEXT_DELAYS = ['', '0', '5', '15', '30', '60'];

export default function ScheduleSettings() {
  const { t } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let stale = false;
    loadAll()
      .then((d) => {
        if (stale) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [version]);

  const show = (card: Note['card']) =>
    note?.card === card && (
      <div className="mb-4">
        <Notice tone={note.tone}>{note.text}</Notice>
      </div>
    );

  const setColor = async (p: Instructor, color: string) => {
    if (!data || color === p.calendar_color) return;
    const { error } = await supabase!.rpc('set_calendar_color', { p_user: p.user_id, p_color: color });
    if (error) return setNote({ card: 'colors', tone: 'error', text: t('saveFailed', { reason: error.message }) });
    setNote(null);
    setData({
      ...data,
      instructors: data.instructors.map((i) => (i.user_id === p.user_id ? { ...i, calendar_color: color, color } : i)),
    });
  };

  const setTextDelay = async (value: string) => {
    if (!data) return;
    const minutes = value === '' ? null : Number(value);
    setBusy(true);
    const { error } = await supabase!.rpc('set_change_text_minutes', { p_minutes: minutes });
    setBusy(false);
    if (error) return setNote({ card: 'text', tone: 'error', text: t('saveFailed', { reason: error.message }) });
    setNote({ card: 'text', tone: 'success', text: t('ssSaved') });
    setData({ ...data, textMinutes: minutes });
  };

  if (failed) {
    return (
      <Layout title={t('navScheduleSettings')}>
        <div className="max-w-xl">
          <Notice tone="error">{t('somethingWrong')}</Notice>
          <Button variant="secondary" className="mt-4" onClick={reload}>
            {t('tryAgain')}
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('navScheduleSettings')}>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <ServicesCard data={data} reload={reload} onReorder={(lists) => setData((d) => d && { ...d, ...lists })} />

        <Card>
          <CardTitle icon={Users} title={t('ssInstructors')} />
          {show('colors')}
          {!data ? (
            <Skeleton className="h-40 w-full" />
          ) : !data.instructors.length ? (
            <p className="text-sm text-mute">{t('ssNoInstructors')}</p>
          ) : (
            <ul className="divide-y divide-ink/[0.06]">
              {data.instructors.map((p) => (
                <li key={p.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-[3px]" style={{ background: p.color }} />
                  <span className="w-28 truncate text-sm font-medium" title={p.full_name}>
                    {p.full_name}
                  </span>
                  <span role="group" aria-label={p.full_name} className="flex flex-wrap gap-2">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        aria-pressed={p.color === c}
                        disabled={data.instructors.some((o) => o.user_id !== p.user_id && o.color === c)}
                        onClick={() => void setColor(p, c)}
                        style={{ background: c }}
                        className={`h-[1.6rem] w-[1.6rem] rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/50 disabled:cursor-not-allowed disabled:opacity-[.35] ${
                          p.color === c ? 'ring-2 ring-ink/60 ring-offset-2 ring-offset-paper' : ''
                        }`}
                      />
                    ))}
                  </span>
                  {!p.active && <Chip>{t('INACTIVE')}</Chip>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-mute">{t('ssInstructorsHint')}</p>
        </Card>

        <Card>
          <CardTitle icon={MessageSquare} title={t('ssTextTitle')} />
          {show('text')}
          {!data ? (
            <Skeleton className="h-12 w-full max-w-xs" />
          ) : (
            <div className="grid gap-4">
              <div className="max-w-xs">
                <select
                  aria-label={t('ssTextTitle')}
                  value={data.textMinutes == null ? '' : String(data.textMinutes)}
                  disabled={busy}
                  onChange={(e) => void setTextDelay(e.target.value)}
                  className={inputCls}
                >
                  {TEXT_DELAYS.map((v) => (
                    <option key={v} value={v}>
                      {v === ''
                        ? t('ssTextOff')
                        : v === '0'
                          ? t('ssTextNow')
                          : v === '60'
                            ? t('ssTextHour')
                            : t('ssTextAfter', { n: v })}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-mute">{t('ssTextHint')}</p>
              </div>
              <p className="text-sm text-mute">{t('ssTextTwilio')}</p>
            </div>
          )}
        </Card>

        <ImportCard onImported={reload} />
      </div>
    </Layout>
  );
}

const NONE = ''; // category_id null: the "No category" row and option
// Text links in sage, like Schedulista's green "+ Add".
const LINK =
  'inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-sage transition-colors hover:text-sage-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40';
// Pencil (edit) and trash (delete) at the end of a row.
const ROW_ICON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40';
const EDIT_ICON = `${ROW_ICON} text-sage hover:bg-sage/10 hover:text-sage-deep`;
const DELETE_ICON = `${ROW_ICON} text-mute hover:bg-red-700/10 hover:text-red-700`;
const HANDLE =
  'inline-flex h-10 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-mute/60 hover:text-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40';
const PICK =
  'min-h-11 min-w-0 flex-1 truncate rounded-lg px-1 text-left text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40';
// Picked category: raised like the service rows; the others sit back (Schedulista's grey rows).
const categoryRow = (picked: boolean, dragged: boolean) =>
  `flex items-center gap-1 rounded-xl px-1 ring-1 transition-[background-color,box-shadow,opacity] ${
    picked ? 'bg-paper text-ink shadow-card ring-ink/[0.1]' : 'bg-ink/[0.035] text-mute ring-ink/[0.05]'
  } ${dragged ? 'opacity-50' : ''}`;

/** The list with the item at `from` moved to `to`. */
function moved<T>(list: T[], from: number, to: number) {
  const out = [...list];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

/** Categories on the left, the picked one's services on the right. Drag a row (or ↑ / ↓ on its handle) to reorder. */
function ServicesCard({
  data,
  reload,
  onReorder,
}: {
  data: Data | null;
  reload: () => void;
  onReorder: (lists: Partial<Pick<Data, List>>) => void;
}) {
  const { t } = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [drag, setDrag] = useState<{ list: List; index: number } | null>(null);
  const [editCategory, setEditCategory] = useState<Category | 'new' | null>(null);
  const [editService, setEditService] = useState<Service | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);

  if (!data) {
    return (
      <Card className="lg:col-span-2">
        <CardTitle icon={Sparkles} title={t('ssServices')} />
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }

  const { categories, services, instructors } = data;
  const inCategory = (id: string) => services.filter((s) => (s.category_id ?? NONE) === id);
  const loose = inCategory(NONE).length;
  // The picked row, or the first one while nothing (or a deleted category) is picked.
  const current =
    picked !== null && (picked === NONE ? loose > 0 : categories.some((c) => c.id === picked))
      ? picked
      : (categories[0]?.id ?? NONE);
  const shown = inCategory(current);

  const reorder = async (list: List, from: number, to: number) => {
    if (from === to || to < 0 || to >= (list === 'categories' ? categories : shown).length) return;
    setNote(null);
    let order: { p_categories: string[] | null; p_services: string[] | null };
    if (list === 'categories') {
      const next = moved(categories, from, to);
      onReorder({ categories: next });
      order = { p_categories: next.map((c) => c.id), p_services: null };
    } else {
      // The category's services trade places among the slots they hold in the overall order.
      const mine = moved(shown, from, to);
      let k = 0;
      const next = services.map((s) => ((s.category_id ?? NONE) === current ? mine[k++] : s));
      onReorder({ services: next });
      order = { p_categories: null, p_services: next.map((s) => s.id) };
    }
    const { error } = await supabase!.rpc('set_schedule_order', order);
    if (error) {
      setNote({ tone: 'error', text: t('saveFailed', { reason: error.message }) });
      reload();
    }
  };

  // Native drag and drop between rows of the same list.
  const dnd = (list: List, index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index)); // Firefox only drags with data set
      setDrag({ list, index });
    },
    onDragOver: (e: DragEvent) => drag?.list === list && e.preventDefault(),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (drag?.list === list) void reorder(list, drag.index, index);
      setDrag(null);
    },
    onDragEnd: () => setDrag(null),
  });

  const handle = (list: List, index: number, id: string, name: string) => (
    <button
      type="button"
      data-handle={id}
      aria-label={t('ssMove', { name })}
      className={HANDLE}
      onKeyDown={(e) => {
        const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null;
        if (to === null) return;
        e.preventDefault();
        void reorder(list, index, to);
        // Moving the row moves its element, which drops focus: put it back on this handle.
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus());
      }}
    >
      <GripVertical {...ICON} />
    </button>
  );

  const done = (pick?: string, text = t('ssSaved')) => {
    setEditCategory(null);
    setEditService(null);
    setDeleting(null);
    setNote({ tone: 'success', text });
    if (pick !== undefined) setPicked(pick);
    reload();
  };

  return (
    <Card className="lg:col-span-2">
      <CardTitle icon={Sparkles} title={t('ssServices')} />
      {note && (
        <div className="mb-4">
          <Notice tone={note.tone}>{note.text}</Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <button type="button" onClick={() => setEditCategory('new')} className={`${LINK} -ml-2 mb-2 text-[15px]`}>
            <Plus {...ICON} />
            {t('ssAddCategory')}
          </button>
          <ul className="grid gap-2">
            {categories.map((c, i) => (
              <li key={c.id} {...dnd('categories', i)} className={categoryRow(c.id === current, drag?.list === 'categories' && drag.index === i)}>
                {handle('categories', i, c.id, c.name)}
                <button type="button" aria-pressed={c.id === current} onClick={() => setPicked(c.id)} className={PICK}>
                  {c.name} ({inCategory(c.id).length})
                </button>
                <button type="button" aria-label={t('ssEditNamed', { name: c.name })} onClick={() => setEditCategory(c)} className={EDIT_ICON}>
                  <Pencil {...ICON} />
                </button>
              </li>
            ))}
            {loose > 0 && (
              <li className={categoryRow(current === NONE, false)}>
                <span className="w-8 shrink-0" />
                <button type="button" aria-pressed={current === NONE} onClick={() => setPicked(NONE)} className={PICK}>
                  {t('ssNoCategory')} ({loose})
                </button>
              </li>
            )}
          </ul>
        </div>

        <div className="min-w-0">
          <button type="button" onClick={() => setEditService('new')} className={`${LINK} -ml-2 mb-2 text-[15px]`}>
            <Plus {...ICON} />
            {t('ssAddService')}
          </button>
          {!shown.length ? (
            <p className="py-3 text-sm text-mute">{t('ssNoServices')}</p>
          ) : (
            <ul className="grid gap-2">
              {shown.map((s, i) => {
                const teachers = instructors.filter((p) => (s.staff_ids ? s.staff_ids.includes(p.user_id) : p.active));
                return (
                  <li
                    key={s.id}
                    {...dnd('services', i)}
                    className={`flex items-center gap-1 rounded-xl bg-paper px-1 shadow-[0_1px_2px_rgb(var(--c-shadow)/0.06)] ring-1 ring-ink/[0.08] transition-opacity ${
                      drag?.list === 'services' && drag.index === i ? 'opacity-50' : ''
                    }`}
                  >
                    {handle('services', i, s.id, s.name)}
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 px-1 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[15px] font-medium">{s.name}</span>
                        {teachers.length > 0 && (
                          <span role="img" aria-label={teachers.map((p) => p.full_name).join(', ')} className="flex shrink-0 items-center gap-1">
                            {teachers.slice(0, 5).map((p) => (
                              <span key={p.user_id} className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                            ))}
                            {teachers.length > 5 && <span className="text-xs text-mute">+{teachers.length - 5}</span>}
                          </span>
                        )}
                        {!s.active && <Chip>{t('INACTIVE')}</Chip>}
                      </span>
                      <span className="ml-auto whitespace-nowrap text-sm tabular-nums">
                        {t('ssMinutesLong', { n: String(s.minutes) })}
                        {s.cleanup_minutes > 0 && (
                          <span className="text-mute"> {t('ssCleanupShort', { n: String(s.cleanup_minutes) })}</span>
                        )}
                      </span>
                    </div>
                    <button type="button" aria-label={t('ssEditNamed', { name: s.name })} onClick={() => setEditService(s)} className={EDIT_ICON}>
                      <Pencil {...ICON} />
                    </button>
                    <button type="button" aria-label={t('ssDeleteNamed', { name: s.name })} onClick={() => setDeleting(s)} className={DELETE_ICON}>
                      <Trash2 {...ICON} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-5 grid gap-1 text-xs text-mute">
        <p>{t('ssCategoriesHint')}</p>
        <p>{t('ssDragHint')}</p>
        <p>{t('ssServicesHint')}</p>
      </div>

      {editCategory && (
        <CategoryDialog
          category={editCategory === 'new' ? null : editCategory}
          count={editCategory === 'new' ? 0 : inCategory(editCategory.id).length}
          onClose={() => setEditCategory(null)}
          onDone={done}
        />
      )}
      {editService && (
        <ServiceDialog
          service={editService === 'new' ? null : editService}
          data={data}
          category={current}
          onClose={() => setEditService(null)}
          onDone={done}
          onDelete={editService === 'new' ? undefined : () => setDeleting(editService)}
        />
      )}
      {/* After the edit dialog, so it opens on top of it; Cancel goes back to it. */}
      {deleting && <DeleteServiceDialog service={deleting} onClose={() => setDeleting(null)} onDone={() => done(undefined, t('ssDeleted'))} />}
    </Card>
  );
}

/** Add or rename a category; an empty one can be deleted. */
function CategoryDialog({
  category,
  count,
  onClose,
  onDone,
}: {
  category: Category | null;
  count: number;
  onClose: () => void;
  onDone: (pick?: string) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(category?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) return setError(t('enterName'));
    setBusy(true);
    const { data, error } = await supabase!.rpc('save_schedule_category', { p: { id: category?.id, name: name.trim() } });
    setBusy(false);
    if (error) return setError(t('saveFailed', { reason: error.message }));
    onDone(data as string);
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase!.rpc('delete_schedule_category', { p_id: category!.id });
    setBusy(false);
    if (error) return setError(t('deleteFailed', { reason: error.message }));
    onDone();
  };

  return (
    <Dialog open onClose={onClose} title={t(category ? 'ssEditCategory' : 'ssAddCategory')}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField label={t('ssCategoryName')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {category && (
            <Button variant="danger" className="mr-auto" disabled={busy || count > 0} onClick={() => void remove()}>
              {t('ssDeleteCategory')}
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {t('save')}
          </Button>
        </div>
        {category && count > 0 && <p className="text-xs text-mute">{t('ssCategoryNotEmpty')}</p>}
      </form>
    </Dialog>
  );
}

const TOGGLE = 'flex items-center justify-between gap-4 text-sm font-medium text-ink';

/** Schedulista's "Service Details", the parts that mean something here (no online booking yet). */
function ServiceDialog({
  service: svc,
  data,
  category,
  onClose,
  onDone,
  onDelete,
}: {
  service: Service | null;
  data: Data;
  category: string;
  onClose: () => void;
  onDone: (pick?: string) => void;
  onDelete?: () => void;
}) {
  const { t } = useT();
  const id = useId();
  const active = data.instructors.filter((p) => p.active);
  // Active instructors, plus an inactive one this service still lists.
  const listed = data.instructors.filter((p) => p.active || svc?.staff_ids?.includes(p.user_id));
  const [f, setF] = useState(() => {
    const cents = svc?.price_cents;
    return {
      name: svc?.name ?? '',
      price: cents == null ? '' : (cents / 100).toFixed(cents % 100 ? 2 : 0),
      minutes: svc?.minutes ?? 50,
      cleanupOn: Boolean(svc?.cleanup_minutes),
      cleanup: svc?.cleanup_minutes || 5,
      category: svc ? (svc.category_id ?? NONE) : category,
      description: svc?.description ?? '',
      isClass: (svc?.capacity ?? 1) > 1,
      capacity: String(svc && svc.capacity > 1 ? svc.capacity : 5),
      staff: svc?.staff_ids ?? active.map((p) => p.user_id),
      active: svc?.active ?? true,
    };
  });
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((v) => ({ ...v, [key]: value }));
  const [errors, setErrors] = useState<{ name?: string; price?: string; capacity?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const name = f.name.trim();
    const price = f.price.replace(/[$,\s]/g, '');
    const capacity = f.isClass ? Number(f.capacity) : 1;
    const err: typeof errors = {};
    if (!name) err.name = t('enterName');
    // Without an id the database edits the service of that name, so a new one must not reuse a name.
    else if (!svc && data.services.some((s) => s.name.toLowerCase() === name.toLowerCase())) err.name = t('ssServiceExists');
    if (price && !(/^\d+(\.\d{1,2})?$/.test(price) && Number(price) <= 100000)) err.price = t('ssPriceInvalid');
    if (!Number.isInteger(capacity) || capacity < (f.isClass ? 2 : 1) || capacity > 50) err.capacity = t('ssCapacityInvalid');
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    const { error } = await supabase!.rpc('save_schedule_service', {
      p: {
        id: svc?.id,
        name,
        minutes: f.minutes,
        capacity,
        active: f.active,
        category_id: f.category || null,
        price_cents: price ? Math.round(Number(price) * 100) : null,
        cleanup_minutes: f.cleanupOn ? f.cleanup : 0,
        description: f.description.trim(),
        // Every instructor = null, so someone who joins later teaches it too. An inactive one only counts when the
        // service had no list: an edit that leaves the boxes as they were never widens a saved list.
        staff_ids: data.instructors.every((p) => f.staff.includes(p.user_id) || (!p.active && !svc?.staff_ids)) ? null : f.staff,
      },
    });
    setBusy(false);
    if (error) return setErrors({ form: t('saveFailed', { reason: error.message }) });
    onDone(f.category);
  };

  return (
    <Dialog open onClose={onClose} title={t(svc ? 'ssEditService' : 'ssAddService')}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField label={t('ssServiceName')} maxLength={60} value={f.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <TextField
          label={t('ssPrice')}
          inputMode="decimal"
          value={f.price}
          hint={t('ssPriceHint')}
          error={errors.price}
          onChange={(e) => set('price', e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-minutes`} className="text-sm font-medium text-ink">
            {t('ssDuration')}
          </label>
          <MinutesInput id={`${id}-minutes`} value={f.minutes} onChange={(v) => set('minutes', v)} />
        </div>
        <div className={TOGGLE}>
          {t('ssCleanup')}
          <Switch label={t('ssCleanup')} checked={f.cleanupOn} onChange={(on) => set('cleanupOn', on)} />
        </div>
        {f.cleanupOn && (
          <div>
            <label htmlFor={`${id}-cleanup`} className="sr-only">
              {t('ssCleanup')}
            </label>
            <MinutesInput id={`${id}-cleanup`} min={5} max={120} value={f.cleanup} onChange={(v) => set('cleanup', v)} />
          </div>
        )}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">{t('category')}</span>
          <select value={f.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NONE}>{t('ssNoCategory')}</option>
          </select>
        </label>
        <TextArea label={t('ssDescription')} maxLength={1000} value={f.description} onChange={(e) => set('description', e.target.value)} />

        <hr className="border-ink/[0.08]" />
        <div className={TOGGLE}>
          <span>
            {t('ssClass')}
            <span className="mt-0.5 block text-xs font-normal text-mute">{t('ssClassHint')}</span>
          </span>
          <Switch label={t('ssClass')} checked={f.isClass} onChange={(on) => set('isClass', on)} />
        </div>
        {f.isClass && (
          <div>
            <label className={TOGGLE}>
              {t('capacity')}
              <input
                type="number"
                inputMode="numeric"
                min={2}
                max={50}
                value={f.capacity}
                onChange={(e) => set('capacity', e.target.value)}
                className={`${inputCls} !w-24 text-center tabular-nums`}
              />
            </label>
            {errors.capacity && <p className="mt-1.5 text-sm text-red-700">{errors.capacity}</p>}
          </div>
        )}

        <hr className="border-ink/[0.08]" />
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">{t('ssTaughtBy')}</legend>
          {!listed.length ? (
            <p className="text-sm text-mute">{t('ssNoInstructors')}</p>
          ) : (
            listed.map((p) => {
              const on = f.staff.includes(p.user_id);
              return (
                <label key={p.user_id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-sage"
                    checked={on}
                    // At least one instructor stays checked.
                    disabled={on && f.staff.length === 1}
                    onChange={() => set('staff', on ? f.staff.filter((x) => x !== p.user_id) : [...f.staff, p.user_id])}
                  />
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
                  <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
                  {!p.active && <Chip>{t('INACTIVE')}</Chip>}
                </label>
              );
            })
          )}
        </fieldset>

        <hr className="border-ink/[0.08]" />
        <div className={TOGGLE}>
          {t('ssOffered')}
          <Switch label={t('ssOffered')} checked={f.active} onChange={(on) => set('active', on)} />
        </div>

        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {onDelete && (
            <Button variant="danger" className="mr-auto" disabled={busy} onClick={onDelete}>
              {t('ssDeleteService')}
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Asks first and says how many appointments use the service. They keep its name, so the calendar doesn't change. */
function DeleteServiceDialog({ service, onClose, onDone }: { service: Service; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  // undefined while counting, null when the count failed.
  const [count, setCount] = useState<number | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stale = false;
    void supabase!
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('service', service.name)
      .eq('status', 'BOOKED')
      .then(({ count, error }) => !stale && setCount(error ? null : (count ?? 0)));
    return () => {
      stale = true;
    };
  }, [service.name]);

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase!.rpc('delete_schedule_service', { p_id: service.id });
    setBusy(false);
    if (error) return setError(t('deleteFailed', { reason: error.message }));
    onDone();
  };

  return (
    <Dialog open onClose={onClose} title={t('ssDeleteService')}>
      <div className="grid gap-3 text-[15px]">
        {count !== null && (
          <p aria-live="polite">
            {count === undefined
              ? t('ssCounting')
              : t(count === 0 ? 'ssDeleteCountNone' : count === 1 ? 'ssDeleteCountOne' : 'ssDeleteCount', { n: count.toLocaleString() })}
          </p>
        )}
        <p className="font-medium">{t('ssDeleteSure', { name: service.name })}</p>
        {Boolean(count) && <p className="text-sm text-mute">{t('ssDeleteKeeps')}</p>}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>
          {t('delete')}
        </Button>
      </div>
    </Dialog>
  );
}

/** Calls of about 500 rows stay well under the API's time limit (1,000 rows took up to ~5 s of the 8 s on Staging). Rows with the same start
 *  stay in one call, so a dry run counts exactly what the import will do. */
function chunks(rows: ScheduleImportRow[]) {
  const out: ScheduleImportRow[][] = [];
  for (const r of [...rows].sort((a, b) => a.start.localeCompare(b.start))) {
    const last = out[out.length - 1];
    if (last && (last.length < 500 || last[last.length - 1].start === r.start)) last.push(r);
    else out.push([r]);
  }
  return out;
}

/** Schedulista appointments CSV → a dry run with the counts → the real import. */
function ImportCard({ onImported }: { onImported: () => void }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; rows: ScheduleImportRow[]; problems: ImportProblem[] } | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (rows: ScheduleImportRow[], commit: boolean) => {
    setBusy(true);
    setError('');
    const sum: ImportResult = { total: 0, importable: 0, duplicates: 0, failed: 0, errors: [] };
    for (const part of chunks(rows)) {
      const { data, error } = await supabase!.rpc('import_schedule', { p_rows: part, p_commit: commit });
      if (error) {
        setBusy(false);
        if (!commit || !sum.importable) return setError(t('importFailed', { reason: error.message }));
        // Earlier parts are saved; importing the same file again skips them and finishes the rest.
        setCheck(null);
        setDone(sum);
        onImported();
        return setError(t('ssImportStopped', { reason: error.message }));
      }
      const r = data as ImportResult;
      sum.total += r.total;
      sum.importable += r.importable;
      sum.duplicates += r.duplicates;
      sum.failed += r.failed;
      sum.errors.push(...r.errors);
    }
    setBusy(false);
    setCheck(commit ? null : sum);
    if (commit) {
      setDone(sum);
      onImported();
    }
  };

  const pick = async (f: File) => {
    setFile(null);
    setCheck(null);
    setDone(null);
    setError('');
    const parsed = scheduleFromCsv(await f.text());
    if (!parsed) return setError(t('ssNotExport'));
    if (!parsed.rows.length && !parsed.problems.length) return setError(t('ssNoRows'));
    setFile({ name: f.name, ...parsed });
    await run(parsed.rows, false);
  };

  const result = done ?? check;
  return (
    <Card className="lg:col-span-2">
      <CardTitle icon={Upload} title={t('ssImportTitle')} />
      <p className="mb-4 max-w-[70ch] text-sm text-mute">{t('ssImportHint')}</p>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          <Upload {...ICON} />
          {busy && !check ? t('ssChecking') : t('ssChooseCsv')}
        </Button>
        {file && <span className="min-w-0 truncate text-sm text-mute">{file.name}</span>}
      </div>

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {busy && !result && <Skeleton className="mt-4 h-20 w-full" />}
      {file && result && (
        <div className="mt-5 grid gap-4">
          {done && <Notice tone="success">{t('ssImportDone')}</Notice>}
          <Summary result={result} problems={file.problems} committed={Boolean(done)} />
          {check && (
            <div>
              <Button disabled={busy || !check.importable} onClick={() => void run(file.rows, true)}>
                {busy ? t('ssImporting') : t('ssImportRows', { n: check.importable.toLocaleString('en-US') })}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** The four counts, then the reasons grouped: "Instructor not found: X — 85 rows (12, 40, 51 …)". */
function Summary({ result: r, problems, committed }: { result: ImportResult; problems: ImportProblem[]; committed: boolean }) {
  const { t } = useT();
  const n = (v: number) => v.toLocaleString('en-US');
  const groups: Record<string, number[]> = {};
  for (const e of [...problems, ...r.errors]) (groups[e.reason] ??= []).push(e.row);
  return (
    <>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t('ssTotal')} value={n(problems.length + r.total)} />
        <Stat label={t(committed ? 'ssImported' : 'ssReady')} value={n(r.importable)} />
        <Stat label={t(committed ? 'ssDupSkipped' : 'ssAlready')} value={n(r.duplicates)} />
        <Stat label={t(committed ? 'ssFailed' : 'ssCant')} value={n(problems.length + r.failed)} />
      </dl>
      {Object.keys(groups).length > 0 && (
        <ul className="grid gap-1.5 text-sm">
          {Object.entries(groups).map(([reason, rows]) => (
            <li key={reason} className="break-words">
              {reason} — {t(rows.length === 1 ? 'ssRow' : 'ssRows', { n: n(rows.length) })}{' '}
              <span className="text-mute tabular-nums">
                ({rows.sort((a, b) => a - b).slice(0, 5).join(', ')}
                {rows.length > 5 ? ' …' : ''})
              </span>
            </li>
          ))}
          {r.failed > r.errors.length && (
            <li className="text-xs text-mute">{t('ssRowsCapped', { n: n(problems.length + r.errors.length) })}</li>
          )}
        </ul>
      )}
    </>
  );
}
