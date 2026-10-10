// Enrollments (owner): teacher-training courses and their sign-ups, stored in
// Supabase (training_courses / training_registrations). Owners read the tables
// directly (RLS); saving and the one-time sheet import go through owner-only
// database functions. No emails are sent.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Mail, Phone, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import {
  CONDUCTORS,
  autoOrder,
  coursesFromCsv,
  daysOf,
  earlyState,
  fromRow,
  money,
  registrationsFromCsv,
  studioDateTime,
  type Course,
  type CourseRow,
  type Registration,
} from '../enrollments';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { supabase } from '../supabase';
import { Button, Card, Dialog, Notice, Skeleton, TextField, inputCls } from '../ui';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

type Status = { tone: 'ok' | 'error'; text: string } | null;

/** Both tables at once: registrations give each course its sign-up count. */
async function loadAll(): Promise<{ courses: Course[]; regs: Registration[] }> {
  const [c, r] = await Promise.all([
    supabase!.from('training_courses').select('*'),
    supabase!.from('training_registrations').select('*').order('submitted_at', { ascending: false }),
  ]);
  if (c.error) throw c.error;
  if (r.error) throw r.error;
  const regs = r.data as Registration[];
  return { courses: (c.data as CourseRow[]).map((row) => fromRow(row, regs)), regs };
}

/** A course as edited on screen: early-bird switch and day count are form-only. */
type Draft = Course & { key: string; early_on: boolean; days: string };

let nextKey = 0;
const toDraft = (c: Course): Draft => ({
  ...c,
  capacity: c.capacity ?? '',
  key: String(nextKey++),
  early_on: Boolean(c.fee_early.trim() || c.early_until.trim()),
  days: daysOf(c),
});

const BLANK: Course = {
  uid: '',
  id: '',
  name_en: '',
  name_kr: '',
  dates: '',
  tag_en: '',
  tag_kr: '',
  capacity: '',
  taken: 0,
  active: true,
  time: '',
  price: '',
  fee: '',
  fee_early: '',
  early_until: '',
  conducted_by: '',
  desc_en: '',
  desc_kr: '',
};

/** What save_training_courses takes: empty cards dropped, early bird blanked when switched off. */
function toRows(drafts: Draft[]) {
  const filled = drafts.filter((c) => c.name_en.trim() || c.name_kr.trim() || c.dates.trim());
  return autoOrder(filled).map((c) => ({
    id: c.uid,
    code: c.id,
    name_en: c.name_en.trim(),
    name_kr: c.name_kr.trim(),
    dates: c.dates.trim(),
    length_days: /^\d+$/.test(c.days.trim()) ? c.days.trim() : '',
    capacity: String(c.capacity ?? '').trim(),
    class_time: c.time.trim(),
    price: c.price.trim(),
    fee: c.fee.trim(),
    fee_early: c.early_on ? c.fee_early.trim() : '',
    early_until: c.early_on ? c.early_until.trim() : '',
    conducted_by: c.conducted_by,
    desc_en: c.desc_en.trim(),
    // Not editable here, but kept so saving does not wipe it.
    desc_kr: c.desc_kr,
    active: c.active,
  }));
}

export default function Enrollments() {
  const { t } = useT();
  const [tab, setTab] = useState<'courses' | 'registrants'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'registrants' ? 'registrants' : 'courses',
  );
  const [data, setData] = useState<{ courses: Course[]; regs: Registration[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = () =>
    loadAll().then((out) => {
      setData(out);
      return out;
    });

  useEffect(() => {
    loadAll()
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const show = (next: typeof tab) => {
    setTab(next);
    window.history.replaceState(null, '', next === 'courses' ? '?' : '?tab=registrants');
  };

  return (
    <Layout title={t('navTrainings')}>
      <div role="tablist" aria-label={t('navTrainings')} className="mb-6 inline-flex rounded-full bg-sand p-1">
        {(['courses', 'registrants'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => show(id)}
            className={`min-h-10 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
              tab === id ? 'bg-ink text-cream' : 'text-mute hover:text-ink'
            }`}
          >
            {t(id === 'courses' ? 'tabCourses' : 'tabRegistrants')}
            {id === 'registrants' && data && <span className="ml-1.5 tabular-nums opacity-70">{data.regs.length}</span>}
          </button>
        ))}
      </div>

      {failed ? (
        <div className="max-w-2xl">
          <Notice tone="error">{t('enrollLoadFailed')}</Notice>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              setFailed(false);
              reload().catch(() => setFailed(true));
            }}
          >
            {t('tryAgain')}
          </Button>
        </div>
      ) : !data ? (
        <ListSkeleton />
      ) : tab === 'courses' ? (
        <CourseEditor initial={data.courses} reload={() => reload().then((out) => out.courses)} />
      ) : (
        <Registrants
          regs={data.regs}
          courses={data.courses}
          onRefresh={() => {
            setData(null);
            reload().catch(() => setFailed(true));
          }}
          reload={reload}
        />
      )}
    </Layout>
  );
}

function ListSkeleton() {
  return (
    <div className="grid max-w-3xl gap-4" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

function Chip({ tone = 'plain', children }: { tone?: 'plain' | 'sage' | 'clay'; children: ReactNode }) {
  const cls = { plain: 'bg-sand text-mute', sage: 'bg-sage/10 text-sage-deep', clay: 'bg-clay/20 text-ink' }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

/** Opens the file picker and hands over the chosen CSV file's text. */
function CsvButton({ onText }: { onText: (text: string) => void }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          file?.text().then(onText);
        }}
      />
      <Button variant="secondary" onClick={() => input.current?.click()} aria-label={t('importCsv')}>
        <Upload {...ICON} />
        <span className="hidden sm:inline">{t('importCsv')}</span>
      </Button>
    </>
  );
}

/* ───────────── Courses ───────────── */

function CourseEditor({ initial, reload }: { initial: Course[]; reload: () => Promise<Course[]> }) {
  const { t } = useT();
  const [drafts, setDrafts] = useState(() => autoOrder(initial).map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(() => {
    // The saved letters differ from the schedule order: saving fixes the site.
    const ordered = autoOrder(initial);
    return ordered.some((c, i) => c.id !== initial[i].id || c.name_en !== initial[i].name_en)
      ? { tone: 'ok', text: t('reordered') }
      : null;
  });
  const [deleting, setDeleting] = useState<Draft | null>(null);

  // Leaving with unsaved edits loses them: let the browser ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (key: string, patch: Partial<Draft>) => {
    setDrafts((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    setDirty(true);
  };
  // Like the old page: re-letter after the schedule or visibility changes.
  const reorder = () => setDrafts((list) => autoOrder(list));

  const add = () => {
    setDrafts((list) => autoOrder([...list, toDraft({ ...BLANK })]));
    setDirty(true);
  };

  // Old sheet's Courses tab → new cards (names already on screen are skipped). Kept by Save.
  const importCsv = (text: string) => {
    const have = new Set(drafts.map((c) => c.name_en.trim().toLowerCase()));
    const found = coursesFromCsv(text).filter((c) => !have.has(c.name_en.trim().toLowerCase()));
    if (found.length === 0) {
      setStatus({ tone: 'error', text: t('nothingImported') });
      return;
    }
    setDrafts((list) => autoOrder([...list, ...found.map(toDraft)]));
    setDirty(true);
    setStatus({ tone: 'ok', text: t('coursesImported', { n: String(found.length) }) });
  };

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase!.rpc('save_training_courses', { p_courses: toRows(drafts) });
      if (error) throw error;
      // Read the table back: that is what the site now shows.
      const fresh = await reload();
      setDrafts(autoOrder(fresh).map(toDraft));
      setDirty(false);
      setStatus({ tone: 'ok', text: t('coursesSaved') });
    } catch (e) {
      setStatus({ tone: 'error', text: t('saveFailed', { reason: (e as { message?: string }).message ?? '' }) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="max-w-3xl">
        <div className="mb-4 flex justify-end gap-3">
          <CsvButton onText={importCsv} />
          <Button variant="secondary" onClick={add}>
            <Plus {...ICON} />
            {t('addCourse')}
          </Button>
        </div>

        {drafts.length === 0 ? (
          <Card>
            <p className="text-mute">{t('noCourses')}</p>
            <p className="mt-2 text-sm text-mute">{t('importCoursesHint')}</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {drafts.map((c) => (
              <CourseCard key={c.key} c={c} edit={edit} reorder={reorder} onDelete={() => setDeleting(c)} />
            ))}
          </div>
        )}

        <aside className="mt-6 rounded-2xl bg-sand/60 p-4 text-sm leading-relaxed text-mute sm:p-5">
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('hintIds')}</li>
            <li>{t('hintCounts')}</li>
            <li>{t('hintCapacity')}</li>
            <li>{t('hintSchedule')}</li>
            <li>
              <a
                href={`${import.meta.env.BASE_URL}#register`}
                target="_blank"
                rel="noopener"
                className="font-medium text-sage-deep underline-offset-2 hover:underline"
              >
                {t('openSignupForm')}
              </a>
            </li>
          </ul>
        </aside>
      </div>

      {/* Sticks to the bottom of the screen while editing, like the old Save bar. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-ink/10 bg-canvas px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex max-w-3xl items-center gap-3">
          <p
            role="status"
            className={`min-w-0 flex-1 text-sm ${status?.tone === 'error' ? 'text-red-700' : status ? 'text-sage-deep' : 'text-mute'}`}
          >
            {status?.text ?? (dirty ? t('unsavedChanges') : '')}
          </p>
          <Button onClick={save} disabled={busy} className="px-8">
            {busy ? t('saving') : t('save')}
          </Button>
        </div>
      </div>

      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} title={t('deleteCourse')}>
        <p className="text-sm text-mute">
          {t('confirmDeleteCourse', { name: deleting?.name_en || deleting?.name_kr || t('untitledCourse') })}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const key = deleting!.key;
              setDrafts((list) => autoOrder(list.filter((c) => c.key !== key)));
              setDirty(true);
              setDeleting(null);
            }}
          >
            {t('delete')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function SeatChips({ c }: { c: Course }) {
  const { t } = useT();
  const cap = c.capacity;
  if (cap === null || cap === '' || isNaN(Number(cap))) {
    return (
      <>
        <Chip>{t('signups', { n: String(c.taken ?? 0) })}</Chip>
        <Chip>{t('capacityNone')}</Chip>
      </>
    );
  }
  const left = Math.max(0, Number(cap) - (Number(c.taken) || 0));
  return (
    <>
      <Chip>{t('signupsOf', { n: String(c.taken ?? 0), cap: String(cap) })}</Chip>
      {left === 0 ? (
        <Chip tone="clay">{t('full')}</Chip>
      ) : (
        <Chip tone="sage">{t('seatsLeft', { n: String(left) })}</Chip>
      )}
    </>
  );
}

function EarlyNote({ c }: { c: Draft }) {
  const { t } = useT();
  const s = earlyState(c);
  if (!('last' in s)) {
    const key = { empty: 'earlyEmpty', noAmount: 'earlyNoAmount', noDate: 'earlyNoDate' } as const;
    return <p className="text-sm text-mute">{t(key[s.kind as keyof typeof key])}</p>;
  }
  return (
    <div className="flex flex-col items-start gap-2 text-sm text-mute">
      <p>{t('earlyLine', { early: money(c.fee_early), last: s.last, until: s.until, fee: money(c.fee) })}</p>
      {s.kind === 'active' ? (
        <Chip tone="sage">{s.daysLeft === 0 ? t('earlyLastDay') : t('earlyActive', { n: String(s.daysLeft) })}</Chip>
      ) : (
        <Chip tone="clay">{t('earlyEnded')}</Chip>
      )}
    </div>
  );
}

function CourseCard({
  c,
  edit,
  reorder,
  onDelete,
}: {
  c: Draft;
  edit: (key: string, patch: Partial<Draft>) => void;
  reorder: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const id = useId();
  const set = (patch: Partial<Draft>) => edit(c.key, patch);

  return (
    <Card>
      <div className="mb-5 flex items-start gap-3">
        <span
          title={t('courseIdHint')}
          className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl bg-sand px-3 font-display text-lg font-semibold"
        >
          {c.id}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 pt-2">
          <SeatChips c={c} />
          {!c.active && <Chip tone="clay">{t('hiddenOnSite')}</Chip>}
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('deleteCourse')}
          title={t('deleteCourse')}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
        >
          <Trash2 {...ICON} />
        </button>
      </div>

      <div className="grid gap-4">
        <TextField label={t('courseNameEn')} value={c.name_en} onChange={(e) => set({ name_en: e.target.value })} />
        <TextField label={t('courseNameKr')} value={c.name_kr} onChange={(e) => set({ name_kr: e.target.value })} />
        <TextField
          label={t('schedule')}
          placeholder={t('schedulePlaceholder')}
          value={c.dates}
          onChange={(e) => set({ dates: e.target.value })}
          onBlur={reorder}
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <TextField
            label={t('lengthDays')}
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="3"
            value={c.days}
            onChange={(e) => set({ days: e.target.value })}
          />
          <TextField
            label={t('capacity')}
            type="number"
            min={0}
            inputMode="numeric"
            placeholder={t('capacityNone')}
            value={String(c.capacity ?? '')}
            onChange={(e) => set({ capacity: e.target.value })}
          />
          <div className="col-span-2 sm:col-span-1">
            <TextField
              label={t('classTime')}
              placeholder="9:00 AM - 5:00 PM"
              value={c.time}
              onChange={(e) => set({ time: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('coursePrice')}
            placeholder="$1,050"
            value={c.price}
            onChange={(e) => set({ price: e.target.value })}
          />
          <TextField
            label={t('studioFee')}
            placeholder="$350"
            value={c.fee}
            onChange={(e) => set({ fee: e.target.value })}
          />
        </div>

        <div className="rounded-xl bg-sand/50 p-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={c.early_on}
              onChange={(e) => set({ early_on: e.target.checked })}
              className="h-5 w-5 accent-sage"
            />
            {t('useEarly')}
          </label>
          {c.early_on && (
            <div className="mt-3 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={t('earlyFee')}
                  placeholder="$250"
                  value={c.fee_early}
                  onChange={(e) => set({ fee_early: e.target.value })}
                />
                <TextField
                  label={t('regularFrom')}
                  type="date"
                  value={c.early_until}
                  onChange={(e) => set({ early_until: e.target.value })}
                />
              </div>
              <EarlyNote c={c} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-by`} className="text-sm font-medium">
            {t('conductedBy')}
          </label>
          <select
            id={`${id}-by`}
            className={inputCls}
            value={c.conducted_by}
            onChange={(e) => set({ conducted_by: e.target.value })}
          >
            <option value="">{t('notSelected')}</option>
            {/* Keep a saved value even if it is not one of the usual names. */}
            {[...new Set([...CONDUCTORS, c.conducted_by].filter(Boolean))].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <TextField label={t('descEn')} value={c.desc_en} onChange={(e) => set({ desc_en: e.target.value })} />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-ink/10 pt-4 text-sm font-medium">
          <input
            type="checkbox"
            checked={c.active}
            onChange={(e) => {
              set({ active: e.target.checked });
              reorder();
            }}
            className="h-5 w-5 accent-sage"
          />
          {t('showOnSite')}
        </label>
      </div>
    </Card>
  );
}

/* ───────────── Registrants ───────────── */

const DETAIL_ROWS: [keyof Registration, TextKey][] = [
  ['courses_text', 'regCourses'],
  ['certification', 'certification'],
  ['studio', 'studio'],
  ['city_state', 'cityState'],
  ['stage', 'stage'],
  ['prereq', 'prereq'],
  ['availability', 'availability'],
  ['questions', 'questions'],
  ['anything_else', 'anythingElse'],
];

function Registrants({
  regs,
  courses,
  onRefresh,
  reload,
}: {
  regs: Registration[];
  courses: Course[];
  onRefresh: () => void;
  reload: () => Promise<unknown>;
}) {
  const { t } = useT();
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const byUid = new Map(courses.map((c) => [c.uid, c]));
  const countOf = (uid: string) => regs.filter((r) => r.course_ids.includes(uid)).length;
  const used = [...courses]
    .sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id))
    .filter((c) => countOf(c.uid) > 0);
  const current = used.some((c) => c.uid === filter) ? filter : '';
  const list = current ? regs.filter((r) => r.course_ids.includes(current)) : regs;
  const label = (c: Course) => `${c.id} · ${c.name_en || c.name_kr}`;

  // Old sheet's sign-ups tab → import_training_registrations. Rows already there are skipped.
  const importCsv = async (text: string) => {
    if (courses.length === 0) {
      setStatus({ tone: 'error', text: t('saveCoursesFirst') });
      return;
    }
    const { rows, skipped } = registrationsFromCsv(text, courses);
    let added = 0;
    if (rows.length) {
      const { data, error } = await supabase!.rpc('import_training_registrations', { p_rows: rows });
      if (error) {
        setStatus({ tone: 'error', text: t('importFailed', { reason: error.message }) });
        return;
      }
      added = Number(data) || 0;
    }
    const parts = [added ? t('regsImported', { n: String(added) }) : t('nothingImported')];
    if (skipped) parts.push(t('rowsSkipped', { n: String(skipped) }));
    setStatus({ tone: added ? 'ok' : 'error', text: parts.join(' ') });
    if (added) await reload();
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex gap-3">
        <select
          aria-label={t('allCourses')}
          className={`${inputCls} min-w-0 flex-1`}
          value={current}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">
            {t('allCourses')} ({t('peopleCount', { n: String(regs.length) })})
          </option>
          {used.map((c) => (
            <option key={c.uid} value={c.uid}>
              {label(c)} ({t('peopleCount', { n: String(countOf(c.uid)) })})
            </option>
          ))}
        </select>
        <CsvButton onText={importCsv} />
        <Button variant="secondary" onClick={onRefresh} aria-label={t('refresh')}>
          <RefreshCw {...ICON} />
          <span className="hidden sm:inline">{t('refresh')}</span>
        </Button>
      </div>

      {status && (
        <p role="status" className={`mb-4 text-sm ${status.tone === 'error' ? 'text-red-700' : 'text-sage-deep'}`}>
          {status.text}
        </p>
      )}

      {list.length === 0 ? (
        <Card>
          <p className="text-mute">{t('noRegistrants')}</p>
          {regs.length === 0 && <p className="mt-2 text-sm text-mute">{t('importRegsHint')}</p>}
        </Card>
      ) : (
        <ul className="grid gap-3">
          {list.map((r) => {
            const matched = r.course_ids.flatMap((uid) => byUid.get(uid) ?? []);
            // Not matched to a course (or one was deleted since): show what the applicant picked.
            const lost = matched.length === 0 || matched.length < r.course_ids.length;
            return (
              <li key={r.id}>
                <Card className="!p-4 sm:!p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">{r.full_name || t('noName')}</p>
                    <p className="shrink-0 text-xs tabular-nums text-mute">{studioDateTime(r.submitted_at)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {matched.map((c) => (
                      <Chip key={c.uid} tone="sage">
                        {label(c)}
                      </Chip>
                    ))}
                    {lost && r.courses_text && <Chip tone="clay">{t('unmatched', { list: r.courses_text })}</Chip>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.phone && (
                      <ContactLink href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
                        <Phone {...ICON} size={16} />
                        {r.phone}
                      </ContactLink>
                    )}
                    {r.email && (
                      <ContactLink href={`mailto:${r.email}`}>
                        <Mail {...ICON} size={16} />
                        {r.email}
                      </ContactLink>
                    )}
                  </div>
                  <details className="group mt-3 border-t border-ink/10 pt-2">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-mute hover:text-ink [&::-webkit-details-marker]:hidden">
                      <ChevronDown {...ICON} size={16} className="transition-transform group-open:rotate-180" />
                      {t('details')}
                    </summary>
                    <dl className="grid gap-2 pb-1 text-sm">
                      {DETAIL_ROWS.filter(([f]) => r[f]).map(([f, key]) => (
                        <div key={f} className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                          <dt className="text-mute">{t(key)}</dt>
                          <dd className="whitespace-pre-line break-words">{String(r[f])}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ContactLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-9 max-w-full items-center gap-1.5 truncate rounded-full bg-sage/10 px-3 text-sm text-sage-deep transition-colors hover:bg-sage/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
    >
      {children}
    </a>
  );
}
