// Enrollments (owner): teacher-training courses and their sign-ups, stored in
// Supabase (training_courses / training_registrations). Owners read the tables
// directly (RLS); saving and the one-time sheet import go through owner-only
// database functions. No emails are sent.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Mail, Phone, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import {
  autoOrder,
  fromRow,
  registrationsFromCsv,
  studioDateTime,
  studioToday,
  type Course,
  type CourseRow,
  type Registration,
} from '../enrollments';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { supabase } from '../supabase';
import { Button, Card, Dialog, Notice, Skeleton, TextField, inputCls } from '../ui';
import { CourseEditor, CsvButton } from './TrainingCourses';

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
      <div role="tablist" aria-label={t('navTrainings')} className="mb-6 inline-flex rounded-full bg-ink/[0.06] p-1">
        {(['courses', 'registrants'] as const).map((id) => (
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

type AddForm = { name: string; phone: string; email: string; note: string; course_ids: string[]; error: string };
const EMPTY_ADD: AddForm = { name: '', phone: '', email: '', note: '', course_ids: [], error: '' };

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
  const [deleting, setDeleting] = useState<Registration | null>(null);
  const [adding, setAdding] = useState<AddForm | null>(null);
  const [busy, setBusy] = useState(false);
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

  // Owner/Admin only (the database refuses everyone else). Personal-data requests.
  const deleteApplicant = async () => {
    if (!deleting) return;
    setBusy(true);
    const { error } = await supabase!.rpc('delete_training_registration', { p_id: deleting.id });
    setBusy(false);
    setDeleting(null);
    if (error) {
      setStatus({ tone: 'error', text: t('deleteFailed', { reason: error.message }) });
      return;
    }
    setStatus({ tone: 'ok', text: t('applicantDeleted') });
    await reload();
  };

  // Someone who said yes by phone or in person (Owner/Admin only). Counts as a seat.
  const addRegistrant = async () => {
    if (!adding) return;
    if (!adding.name.trim() || adding.course_ids.length === 0) {
      setAdding({ ...adding, error: t('addRegistrantMissing') });
      return;
    }
    setBusy(true);
    const { error } = await supabase!.rpc('add_training_registration', {
      p: { course_ids: adding.course_ids, full_name: adding.name, phone: adding.phone, email: adding.email, note: adding.note },
    });
    setBusy(false);
    if (error) {
      setAdding({ ...adding, error: t('saveFailed', { reason: error.message }) });
      return;
    }
    setAdding(null);
    setStatus({ tone: 'ok', text: t('registrantAdded') });
    await reload();
  };
  const today = studioToday();
  const pickable = autoOrder(courses).filter((c) => !c.ends_on || c.ends_on >= today);

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
        <Button onClick={() => setAdding({ ...EMPTY_ADD })} aria-label={t('addRegistrant')}>
          <UserPlus {...ICON} />
          <span className="hidden sm:inline">{t('addRegistrant')}</span>
        </Button>
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
                    <span className="flex shrink-0 items-center gap-2">
                      <p className="text-xs tabular-nums text-mute">{studioDateTime(r.submitted_at)}</p>
                      <button
                        type="button"
                        onClick={() => setDeleting(r)}
                        aria-label={t('deleteApplicant')}
                        title={t('deleteApplicant')}
                        className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-mute hover:bg-ink/[0.05] hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
                      >
                        <Trash2 {...ICON} size={16} />
                      </button>
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {matched.map((c) => (
                      <Chip key={c.uid} tone="sage">
                        {label(c)}
                      </Chip>
                    ))}
                    {lost && r.courses_text && <Chip tone="clay">{t('unmatched', { list: r.courses_text })}</Chip>}
                    {r.source === 'manual' && <Chip>{t('addedByHand')}</Chip>}
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

      <Dialog open={adding !== null} onClose={() => setAdding(null)} title={t('addRegistrant')}>
        {adding && (
          <div className="grid gap-4">
            <p className="text-sm text-mute">{t('addRegistrantHint')}</p>
            <TextField label={t('fullName')} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value, error: '' })} />
            <TextField label={t('phoneOptional')} type="tel" value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
            <TextField label={t('emailOptional')} type="email" value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} />
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-sm font-medium">{t('regCourses')}</legend>
              {pickable.length === 0 && <p className="text-sm text-mute">{t('noCourses')}</p>}
              {pickable.map((c) => (
                <label key={c.uid} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-sage"
                    checked={adding.course_ids.includes(c.uid)}
                    onChange={(e) =>
                      setAdding({
                        ...adding,
                        error: '',
                        course_ids: e.target.checked ? [...adding.course_ids, c.uid] : adding.course_ids.filter((x) => x !== c.uid),
                      })
                    }
                  />
                  <span className="min-w-0">
                    {label(c)}
                    <span className="block text-mute">{c.dates}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <TextField label={t('noteOptional')} value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} />
            {adding.error && (
              <p role="alert" className="text-sm text-red-700">
                {adding.error}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setAdding(null)}>
                {t('cancel')}
              </Button>
              <Button onClick={addRegistrant} disabled={busy}>
                {busy ? t('saving') : t('add')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} title={t('deleteApplicant')}>
        <p className="text-sm text-mute">{t('confirmDeleteApplicant', { name: deleting?.full_name || t('noName') })}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={deleteApplicant} disabled={busy}>
            {busy ? t('saving') : t('delete')}
          </Button>
        </div>
      </Dialog>
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
