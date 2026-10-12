// Trainings › Courses: one line per course grouped by what the site shows, a
// switch to show/hide right away, and an edit panel that slides in from the right
// (full screen on phones). Every change saves the whole list through
// save_training_courses, which also re-letters A, B, C… in schedule order.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Copy, Minus, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  CONDUCTORS,
  autoOrder,
  coursesFromCsv,
  daysOf,
  earlyState,
  money,
  rangesDays,
  rangesEnd,
  rangesOf,
  rangesText,
  studioToday,
  tagsFor,
  type Course,
  type DateRange,
} from '../enrollments';
import { useT } from '../i18n';
import { supabase } from '../supabase';
import { Button, Card, Chip, Dialog, Switch, TextField, inputCls } from '../ui';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
type Status = { tone: 'ok' | 'error'; text: string } | null;

/** Opens the file picker and hands over the chosen CSV file's text. */
export function CsvButton({ onText }: { onText: (text: string) => void }) {
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

/** What save_training_courses takes for one course. */
function toRow(c: Course) {
  return {
    id: c.uid,
    code: c.id,
    name_en: c.name_en.trim(),
    name_kr: c.name_kr.trim(),
    dates: c.dates.trim(),
    length_days: daysOf(c),
    capacity: String(c.capacity ?? '').trim(),
    class_time: c.time.trim(),
    price: c.price.trim(),
    fee: c.fee.trim(),
    fee_early: c.fee_early.trim(),
    early_until: c.early_until.trim(),
    conducted_by: c.conducted_by,
    desc_en: c.desc_en.trim(),
    desc_kr: c.desc_kr,
    active: c.active,
    ends_on: c.ends_on,
    held_seats: c.held_seats || 0,
  };
}

const isPast = (c: Course, today = studioToday()) => Boolean(c.ends_on) && c.ends_on < today;
const capOf = (c: Course) => (c.capacity === null || c.capacity === '' || isNaN(Number(c.capacity)) ? null : Number(c.capacity));
const takenOf = (c: Course) => (Number(c.taken) || 0) + (c.held_seats || 0);

/* ───────────── Edit form ───────────── */

/** The panel's working copy of a course. */
type Form = {
  uid: string;
  id: string;
  name_en: string;
  name_kr: string;
  ranges: DateRange[];
  /** Schedule text that has no readable dates (e.g. "TBD"); kept until dates are picked. */
  legacy: string;
  time: string;
  limited: boolean;
  capacity: number;
  held: number;
  price: string;
  fee: string;
  early_on: boolean;
  fee_early: string;
  early_until: string;
  conducted_by: string;
  desc_en: string;
  desc_kr: string;
  active: boolean;
  taken: number;
};

const EMPTY_RANGE: DateRange = { start: '', end: '' };

function toForm(c: Course): Form {
  const ranges = rangesOf(c.dates, c.ends_on || studioToday());
  const cap = capOf(c);
  return {
    uid: c.uid,
    id: c.id,
    name_en: c.name_en,
    name_kr: c.name_kr,
    ranges: ranges.length ? ranges : [EMPTY_RANGE],
    legacy: ranges.length ? '' : c.dates,
    time: c.time,
    limited: cap !== null,
    capacity: cap ?? 8,
    held: c.held_seats || 0,
    price: c.price,
    fee: c.fee,
    early_on: Boolean(c.fee_early.trim() || c.early_until.trim()),
    fee_early: c.fee_early,
    early_until: c.early_until,
    conducted_by: c.conducted_by,
    desc_en: c.desc_en,
    desc_kr: c.desc_kr,
    active: c.active,
    taken: Number(c.taken) || 0,
  };
}

function fromForm(f: Form): Course {
  const picked = f.ranges.filter((r) => r.start);
  const days = picked.length ? String(rangesDays(picked)) : '';
  return {
    uid: f.uid,
    id: f.id,
    name_en: f.name_en.trim(),
    name_kr: f.name_kr.trim(),
    dates: picked.length ? rangesText(picked) : f.legacy,
    ...tagsFor(days),
    capacity: f.limited ? f.capacity : null,
    taken: f.taken,
    active: f.active,
    time: f.time,
    price: f.price,
    fee: f.fee,
    fee_early: f.early_on ? f.fee_early : '',
    early_until: f.early_on ? f.early_until : '',
    conducted_by: f.conducted_by.trim(),
    desc_en: f.desc_en,
    desc_kr: f.desc_kr,
    ends_on: rangesEnd(picked),
    held_seats: f.held,
  };
}

const NEW_COURSE: Course = {
  uid: '',
  id: '',
  name_en: '',
  name_kr: '',
  dates: '',
  tag_en: '',
  tag_kr: '',
  capacity: 8,
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
  ends_on: '',
  held_seats: 0,
};

/* ───────────── List ───────────── */

export function CourseEditor({ initial, reload }: { initial: Course[]; reload: () => Promise<Course[]> }) {
  const { t } = useT();
  const [list, setList] = useState(() => autoOrder(initial));
  const [status, setStatus] = useState<Status>(() =>
    autoOrder(initial).some((c, i) => c.id !== initial[i].id || c.uid !== initial[i].uid)
      ? { tone: 'ok', text: t('reordered') }
      : null,
  );
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /** Saves the whole list, then reads back what the site now shows. */
  const persist = async (next: Course[], ok: string) => {
    setBusy(true);
    setStatus(null);
    try {
      const { error: e } = await supabase!.rpc('save_training_courses', { p_courses: autoOrder(next).map(toRow) });
      if (e) throw e;
      setList(autoOrder(await reload()));
      setStatus({ tone: 'ok', text: ok });
      return true;
    } catch (e) {
      setStatus({ tone: 'error', text: t('saveFailed', { reason: (e as { message?: string }).message ?? '' }) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggle = (c: Course, on: boolean) => {
    const before = list;
    const next = list.map((x) => (x.uid === c.uid ? { ...x, active: on } : x));
    setList(next);
    persist(next, t(on ? 'shownNow' : 'hiddenNow')).then((ok) => !ok && setList(before));
  };

  const saveForm = async () => {
    if (!form) return;
    if (!form.name_en.trim()) {
      setError(t('nameRequired'));
      return;
    }
    const course = fromForm(form);
    const next = form.uid ? list.map((c) => (c.uid === form.uid ? course : c)) : [...list, course];
    if (await persist(next, t('coursesSaved'))) setForm(null);
  };

  const remove = async () => {
    if (!form) return;
    setDeleting(false);
    if (form.uid && !(await persist(list.filter((c) => c.uid !== form.uid), t('courseDeleted')))) return;
    setForm(null);
  };

  // Old sheet's Courses tab → saved right away (names already in the list are skipped).
  const importCsv = (text: string) => {
    const have = new Set(list.map((c) => c.name_en.trim().toLowerCase()));
    const found = coursesFromCsv(text)
      .filter((c) => !have.has(c.name_en.trim().toLowerCase()))
      .map((c) => ({ ...c, ends_on: rangesEnd(rangesOf(c.dates)) }));
    if (found.length === 0) {
      setStatus({ tone: 'error', text: t('nothingImported') });
      return;
    }
    persist([...list, ...found], t('coursesImported', { n: String(found.length) }));
  };

  const open = (c: Course) => {
    setError('');
    setForm(toForm(c));
  };
  const duplicate = () => {
    if (!form) return;
    setError('');
    setForm({ ...form, uid: '', id: '', name_en: form.name_en + t('copySuffix'), ranges: [EMPTY_RANGE], legacy: '', taken: 0, held: 0 });
  };

  const today = studioToday();
  const groups: [string, string, Course[]][] = [
    [t('groupOpen'), t('groupOpenHint'), list.filter((c) => c.active && !isPast(c, today))],
    [t('groupHidden'), t('groupHiddenHint'), list.filter((c) => !c.active && !isPast(c, today))],
    [t('groupPast'), t('groupPastHint'), list.filter((c) => isPast(c, today))],
  ];
  const conductors = [...new Set([...CONDUCTORS, ...list.map((c) => c.conducted_by)].filter(Boolean))];

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <p
          role="status"
          className={`order-last w-full text-sm sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 ${status?.tone === 'error' ? 'text-red-700' : 'text-sage-deep'}`}
        >
          {busy ? t('saving') : status?.text}
        </p>
        <CsvButton onText={importCsv} />
        <Button onClick={() => open(NEW_COURSE)}>
          <Plus {...ICON} />
          {t('addCourse')}
        </Button>
      </div>

      {list.length === 0 ? (
        <Card>
          <p className="text-mute">{t('noCourses')}</p>
          <p className="mt-2 text-sm text-mute">{t('importCoursesHint')}</p>
        </Card>
      ) : (
        <div className="grid gap-6">
          {groups.map(
            ([title, hint, items]) =>
              items.length > 0 && (
                <section key={title} aria-label={title}>
                  <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-mute">
                    {title}
                    <span className="font-normal">
                      {items.length} · {hint}
                    </span>
                  </h2>
                  <ul className="overflow-hidden rounded-2xl bg-paper shadow-card">
                    {items.map((c) => (
                      <CourseRow key={c.uid} c={c} past={isPast(c, today)} onOpen={() => open(c)} onToggle={(on) => toggle(c, on)} />
                    ))}
                  </ul>
                </section>
              ),
          )}
        </div>
      )}

      <p className="mt-6 text-sm text-mute">
        {t('hintIds')}{' '}
        <a
          href={`${import.meta.env.BASE_URL}#register`}
          target="_blank"
          rel="noopener"
          className="font-medium text-sage-deep underline-offset-2 hover:underline"
        >
          {t('openSignupForm')}
        </a>
      </p>

      <Panel open={form !== null} title={form?.uid ? t('editCourse') : t('newCourse')} letter={form?.id ?? ''} onClose={() => setForm(null)}>
        {form && (
          <CourseForm
            f={form}
            set={(patch) => {
              setError('');
              setForm((cur) => (cur ? { ...cur, ...patch } : cur));
            }}
            conductors={conductors}
          />
        )}
        <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-2 border-t border-ink/10 bg-paper px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          {form?.uid && (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              aria-label={t('deleteCourse')}
              title={t('deleteCourse')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-ink/[0.05] hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
            >
              <Trash2 {...ICON} />
            </button>
          )}
          {form?.uid && (
            <Button variant="secondary" onClick={duplicate}>
              <Copy {...ICON} />
              {t('duplicate')}
            </Button>
          )}
          <p role="alert" className="min-w-0 flex-1 basis-40 text-sm text-red-700">
            {error}
          </p>
          <Button variant="secondary" onClick={() => setForm(null)}>
            {t('cancel')}
          </Button>
          <Button onClick={saveForm} disabled={busy} className="px-7">
            {busy ? t('saving') : t('save')}
          </Button>
        </div>
      </Panel>

      <Dialog open={deleting} onClose={() => setDeleting(false)} title={t('deleteCourse')}>
        <p className="text-sm text-mute">
          {t('confirmDeleteCourse', { name: form?.name_en || form?.name_kr || t('untitledCourse') })}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleting(false)}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={remove}>
            {t('delete')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function CourseRow({ c, past, onOpen, onToggle }: { c: Course; past: boolean; onOpen: () => void; onToggle: (on: boolean) => void }) {
  const { t, lang } = useT();
  const days = daysOf(c);
  const cap = capOf(c);
  const taken = takenOf(c);
  const name = (lang === 'ko' && c.name_kr) || c.name_en || c.name_kr || t('untitledCourse');
  return (
    <li className={`flex items-center gap-3 border-t border-ink/[0.07] px-3 py-3 first:border-t-0 sm:gap-4 sm:px-4 ${past || !c.active ? 'text-mute' : ''}`}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('editCourse')}: ${name}`}
        className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 sm:gap-4"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand font-display font-semibold text-ink">
          {c.id}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block break-words font-medium leading-snug ${past || !c.active ? '' : 'text-ink'}`}>{name}</span>
          <span className="mt-0.5 block text-sm text-mute">
            {c.dates || t('datesTba')}
            {days && ` · ${t('daysN', { n: days })}`}
            {c.conducted_by && <span className="hidden md:inline"> · {c.conducted_by}</span>}
          </span>
          <Seats cap={cap} taken={taken} held={c.held_seats} className="mt-2 md:hidden" />
        </span>
        <Seats cap={cap} taken={taken} held={c.held_seats} className="hidden w-36 shrink-0 md:grid" />
        <span className="hidden w-24 shrink-0 text-right text-sm tabular-nums md:block">
          <span className="block text-ink">{money(c.price) || '—'}</span>
          <span className="block text-mute">
            {t('feeShort')} {money(c.fee) || '—'}
          </span>
        </span>
      </button>
      <span className="flex w-14 shrink-0 justify-end">
        {past ? (
          <Chip>{t('pastChip')}</Chip>
        ) : (
          <Switch label={`${t('showOnSite')}: ${name}`} checked={c.active} onChange={onToggle} />
        )}
      </span>
    </li>
  );
}

function Seats({ cap, taken, held, className = '' }: { cap: number | null; taken: number; held: number; className?: string }) {
  const { t } = useT();
  const heldNote = held ? ` · ${t('heldN', { n: String(held) })}` : '';
  if (cap === null)
    return (
      <span className={`grid gap-1 text-sm tabular-nums text-mute ${className}`}>
        {t('takenNoLimit', { n: String(taken) })}
        {heldNote}
      </span>
    );
  const left = Math.max(0, cap - taken);
  return (
    <span className={`grid gap-1.5 text-sm tabular-nums ${className}`}>
      <span className={left === 0 ? 'text-clay' : 'text-mute'}>
        {cap === 0 ? t('closed') : `${taken}/${cap} · ${left === 0 ? t('full') : t('seatsLeft', { n: String(left) })}`}
        {heldNote}
      </span>
      {cap > 0 && (
        <span className="block h-1.5 overflow-hidden rounded-full bg-sand" aria-hidden="true">
          <span className="block h-full rounded-full bg-sage" style={{ width: `${Math.min(100, (taken / cap) * 100)}%` }} />
        </span>
      )}
    </span>
  );
}

/* ───────────── Panel ───────────── */

/** Native <dialog> docked to the right (full screen on phones). Escape and the X close it. */
function Panel({ open, title, letter, onClose, children }: { open: boolean; title: string; letter: string; onClose: () => void; children: ReactNode }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-full bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/30 sm:max-w-xl sm:rounded-l-[20px]"
    >
      <div className="flex min-h-full flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink/10 bg-paper px-5 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          {letter && (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand font-display font-semibold">{letter}</span>
          )}
          <h2 className="min-w-0 flex-1 font-display text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
          >
            <X {...ICON} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-ink/10 py-5 first:border-t-0">
      <legend className="float-left mb-1 w-full font-display text-base font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

const NEW_INSTRUCTOR = '\u0000new';

function CourseForm({ f, set, conductors }: { f: Form; set: (patch: Partial<Form>) => void; conductors: string[] }) {
  const { t } = useT();
  const id = useId();
  const [addingPerson, setAddingPerson] = useState(false);
  const picked = f.ranges.filter((r) => r.start);
  const days = rangesDays(picked);
  const last = rangesEnd(picked);
  const text = rangesText(picked);
  const setRange = (i: number, patch: Partial<DateRange>) =>
    set({
      ranges: f.ranges.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch };
        // Picking a first day after the last day moves the last day with it.
        if (patch.start && next.end && next.end < patch.start) next.end = patch.start;
        return next;
      }),
    });
  const early = earlyState({ fee_early: f.fee_early, early_until: f.early_until });
  const preview = fromForm(f);
  const cap = f.limited ? f.capacity : null;
  const left = cap === null ? null : Math.max(0, cap - f.taken - f.held);

  return (
    <div className="flex-1 px-5">
      <Section title={t('secName')}>
        <TextField label={t('nameEn')} value={f.name_en} onChange={(e) => set({ name_en: e.target.value })} required />
        <TextField
          label={t('nameKrOptional')}
          hint={t('nameKrHint')}
          value={f.name_kr}
          onChange={(e) => set({ name_kr: e.target.value })}
        />
      </Section>

      <Section title={t('secSchedule')}>
        {f.ranges.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
              <TextField label={t('startDate')} type="date" value={r.start} onChange={(e) => setRange(i, { start: e.target.value })} />
              <TextField label={t('endDate')} type="date" value={r.end} min={r.start || undefined} onChange={(e) => setRange(i, { end: e.target.value })} />
            </div>
            {f.ranges.length > 1 && (
              <button
                type="button"
                aria-label={t('removeRange')}
                title={t('removeRange')}
                onClick={() => set({ ranges: f.ranges.filter((_, j) => j !== i) })}
                className="mb-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              >
                <X {...ICON} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => set({ ranges: [...f.ranges, EMPTY_RANGE] })}
          className="justify-self-start text-sm font-medium text-sage-deep underline-offset-2 hover:underline"
        >
          + {t('addRange')}
        </button>
        <p className="rounded-xl bg-sage/10 px-3 py-2 text-sm text-sage-deep">
          {picked.length
            ? t('scheduleAuto', { days: String(days), text, last: text.split(/ - |, /).at(-1) ?? '' })
            : f.legacy
              ? t('scheduleLegacy', { text: f.legacy })
              : t('scheduleTba')}
        </p>
        {last && last < studioToday() && <Chip tone="warn">{t('pastHidden')}</Chip>}
        <TextField label={t('classTime')} placeholder="9:00 AM - 5:00 PM" value={f.time} onChange={(e) => set({ time: e.target.value })} />
      </Section>

      <Section title={t('secSeats')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('capacity')}</span>
          <div role="group" aria-label={t('capacity')} className="inline-flex rounded-full bg-ink/[0.06] p-1">
            {[true, false].map((on) => (
              <button
                key={String(on)}
                type="button"
                aria-pressed={f.limited === on}
                onClick={() => set({ limited: on })}
                className={`min-h-9 rounded-full px-4 text-sm font-medium transition-colors ${f.limited === on ? 'bg-paper text-ink shadow-card' : 'text-mute hover:text-ink'}`}
              >
                {on ? t('limitSeats') : t('capacityNone')}
              </button>
            ))}
          </div>
        </div>
        {f.limited && (
          <Stepper
            label={t('capacity')}
            value={f.capacity}
            onChange={(n) => set({ capacity: n })}
            after={t('seatsTaken', { n: String(f.taken + f.held) })}
          />
        )}
        <div className="rounded-xl bg-sand/50 p-4">
          <Stepper label={t('heldSeats')} value={f.held} onChange={(n) => set({ held: n })} after={t('people')} />
          <p className="mt-2 text-sm text-mute">{t('heldHint')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('coursePrice')} placeholder="$1,050" inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} />
          <TextField label={t('studioFee')} placeholder="$350" inputMode="decimal" value={f.fee} onChange={(e) => set({ fee: e.target.value })} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('useEarly')}</span>
          <Switch label={t('useEarly')} checked={f.early_on} onChange={(on) => set({ early_on: on })} />
        </div>
        {f.early_on && (
          <div className="grid gap-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t('earlyFee')} placeholder="$250" inputMode="decimal" value={f.fee_early} onChange={(e) => set({ fee_early: e.target.value })} />
              <TextField label={t('regularFrom')} type="date" value={f.early_until} onChange={(e) => set({ early_until: e.target.value })} />
            </div>
            <p className="text-sm text-mute">
              {'last' in early
                ? t('earlyLine', { early: money(f.fee_early), last: early.last, until: early.until, fee: money(f.fee) })
                : t(({ empty: 'earlyEmpty', noAmount: 'earlyNoAmount', noDate: 'earlyNoDate' } as const)[early.kind])}
            </p>
          </div>
        )}
      </Section>

      <Section title={t('secPeople')}>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-by`} className="text-sm font-medium">
            {t('conductedBy')}
          </label>
          <select
            id={`${id}-by`}
            className={inputCls}
            value={addingPerson ? NEW_INSTRUCTOR : f.conducted_by}
            onChange={(e) => {
              const v = e.target.value;
              setAddingPerson(v === NEW_INSTRUCTOR);
              set({ conducted_by: v === NEW_INSTRUCTOR ? '' : v });
            }}
          >
            <option value="">{t('notSelected')}</option>
            {[...new Set([...conductors, f.conducted_by].filter(Boolean))].map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={NEW_INSTRUCTOR}>{t('addInstructor')}</option>
          </select>
        </div>
        {addingPerson && (
          <TextField
            label={t('newInstructor')}
            hint={t('newInstructorHint')}
            placeholder="Master Trainer …"
            value={f.conducted_by}
            onChange={(e) => set({ conducted_by: e.target.value })}
            autoFocus
          />
        )}
        <TextField label={t('descOptional')} value={f.desc_en} onChange={(e) => set({ desc_en: e.target.value })} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('showOnSite')}</span>
          <Switch label={t('showOnSite')} checked={f.active} onChange={(on) => set({ active: on })} />
        </div>
      </Section>

      <Section title={t('secPreview')}>
        <div className="rounded-2xl bg-canvas p-3">
          <div className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-paper p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream font-display text-sm font-semibold text-mute">
              {f.id || '•'}
            </span>
            <span className="min-w-0 flex-1 text-[15px]">
              <span className="block break-words font-medium leading-snug">{f.name_en || t('untitledCourse')}</span>
              <span className="mt-1 block text-[13px] text-mute">
                {preview.dates || 'Dates to be announced'}
                {preview.tag_en && ` · ${preview.tag_en}`}
              </span>
              {f.conducted_by && (
                <span className="mt-1 block text-[13px] text-mute">
                  Conducted by <span className="block text-ink">{f.conducted_by}</span>
                </span>
              )}
              {(f.price || f.fee) && (
                <span className="mt-1 block text-[13px] font-medium">
                  {[f.price && `Course Cost ${money(f.price)}`, f.fee && `Studio Fee ${money(f.early_on && 'last' in early && early.kind === 'active' ? f.fee_early : f.fee)}`]
                    .filter(Boolean)
                    .join(' | ')}
                </span>
              )}
              {left !== null && (
                <span className={`mt-1 block text-xs ${left === 0 ? 'text-clay' : 'text-sage'}`}>
                  {left === 0 ? 'Full' : `${left} spots left`}
                </span>
              )}
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Stepper({ label, value, onChange, after }: { label: string; value: number; onChange: (n: number) => void; after: string }) {
  const { t } = useT();
  const id = useId();
  const btn =
    'inline-flex h-11 w-11 items-center justify-center rounded-xl border border-ink/[0.12] bg-paper text-ink hover:bg-sand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="mr-auto text-sm font-medium">
        {label}
      </label>
      <button type="button" className={btn} aria-label={t('fewer')} onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0}>
        <Minus {...ICON} />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className={`${inputCls} !w-20 text-center tabular-nums`}
      />
      <button type="button" className={btn} aria-label={t('more')} onClick={() => onChange(value + 1)}>
        <Plus {...ICON} />
      </button>
      <span className="text-sm text-mute">{after}</span>
    </div>
  );
}
