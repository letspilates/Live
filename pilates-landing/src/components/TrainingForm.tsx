import { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext';

const SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbyTr-4dV5Q-dweH7QAB4i6UeFkt2eh97kHMgrNEpF2n7mGCfC3y2c6J2zWuPpGoJcAS/exec';

// Values recorded in the Google Sheet stay in English regardless of UI language,
// matching the columns the legacy form already wrote.
const COURSE_VALUES: Record<string, string> = {
  A: 'A - Gyrotonic® Level 1 Foundation Course',
  B: 'B - Gyrotonic® Level 2 Program 1 – Pre-Training',
  C: 'C - GYROTONIC® Jumping Stretching Board Course',
  D: 'D - Gyrotonic® Level 1 Apprentice Review Course',
  E: 'E - Gyrotonic® Level 2 Program 1 – Foundation Course',
};

// Course list managed in the "Courses" tab of the registration spreadsheet
// (see pilates-landing/apps-script/). Fetched at page load; falls back to the
// bundled list in translations.ts whenever the endpoint is unreachable.
interface RemoteCourse {
  id: string;
  name_en: string;
  name_kr: string;
  dates: string;
  tag_en: string;
  tag_kr: string;
  capacity?: number | null;
  taken?: number;
  price?: string;
  fee?: string;
  conducted_by?: string;
}

const COURSES_CACHE_KEY = 'lp-courses-v1';

// "1225" / "$1,050" / "1050.5" 등 어떤 형태로 입력돼도 "$1,225" 형식으로 표시.
// 숫자로 해석 안 되는 값(예: "TBD")은 입력 그대로 보여준다.
function formatMoney(v: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  const n = Number(s.replace(/[$,\s]/g, ''));
  if (Number.isNaN(n)) return s;
  return '$' + n.toLocaleString('en-US');
}

function readCachedCourses(): RemoteCourse[] | null {
  try {
    const raw = window.localStorage.getItem(COURSES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RemoteCourse[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}
const STAGE_VALUES = [
  'New Student',
  'Level 1 Trainee',
  'Apprentice',
  'Certified Trainer',
  'Continuing Education',
  'Other',
];
const PREREQ_VALUES = ['Yes', 'No', 'Not sure'];
const AVAIL_VALUES = ['Yes', 'No', 'Need to discuss'];

const inputCls =
  'w-full rounded-xl border border-ink/10 bg-cream/60 px-4 py-3 text-[15px] text-ink outline-none transition-all duration-300 placeholder:text-mute/60 focus:border-sage focus:bg-paper focus:ring-2 focus:ring-sage/20';
const inputErrCls = 'border-red-400/70 ring-2 ring-red-400/10';

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition-all duration-300 ease-smooth ${
        selected
          ? 'border-sage bg-sage font-medium text-cream'
          : 'border-ink/15 bg-transparent text-ink hover:border-sage/50 hover:bg-sage/5'
      }`}
    >
      {label}
    </button>
  );
}

export default function TrainingForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useLang();
  const f = t.trainingForm;
  const wrapRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(1);
  const [courses, setCourses] = useState<string[]>([]);
  const [remoteCourses, setRemoteCourses] = useState<RemoteCourse[] | null>(readCachedCourses);

  // Prefetch the live course list at page load so it is already there when the
  // form opens; cache the last good response so outages never blank the form.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8000);
    fetch(SHEETS_URL, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: { result?: string; courses?: RemoteCourse[] }) => {
        if (j?.result === 'success' && Array.isArray(j.courses) && j.courses.length > 0) {
          setRemoteCourses(j.courses);
          try {
            window.localStorage.setItem(COURSES_CACHE_KEY, JSON.stringify(j.courses));
          } catch {
            /* storage full/blocked — live data still in state */
          }
        }
      })
      .catch(() => {
        /* unreachable endpoint — cached or bundled list stays in place */
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, []);

  const displayCourses = remoteCourses
    ? remoteCourses.map((c) => {
        // capacity 미입력(null) = 무제한 표시 없음 / capacity 0 = 즉시 마감 처리
        const capacity =
          typeof c.capacity === 'number' && !Number.isNaN(c.capacity) ? c.capacity : null;
        const remaining = capacity === null ? null : Math.max(0, capacity - (c.taken ?? 0));
        return {
          id: c.id,
          name: lang === 'ko' ? c.name_kr || c.name_en : c.name_en,
          meta: c.dates || f.courseMeta,
          tag: lang === 'ko' ? c.tag_kr || c.tag_en : c.tag_en,
          remaining,
          full: remaining !== null && remaining <= 0,
          price: c.price || '',
          fee: c.fee || '',
          conductedBy: c.conducted_by || '',
        };
      })
    : f.courses.map((c) => ({
        id: c.id,
        name: c.name,
        meta: f.courseMeta,
        tag: c.tag,
        remaining: null as number | null,
        full: false,
        price: '',
        fee: '',
        conductedBy: '',
      }));

  const courseValue = (id: string) => {
    const rc = remoteCourses?.find((c) => c.id === id);
    return rc ? `${rc.id} - ${rc.name_en}` : (COURSE_VALUES[id] ?? id);
  };
  const [fields, setFields] = useState({
    fullName: '',
    email: '',
    phone: '',
    certification: '',
    studio: '',
    cityState: '',
    questions: '',
    stageOther: '',
    anythingElse: '',
  });
  const [stage, setStage] = useState<number | null>(null);
  const [prereq, setPrereq] = useState<number | null>(null);
  const [avail, setAvail] = useState<number | null>(null);
  const [errFields, setErrFields] = useState<string[]>([]);
  const [stepError, setStepError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => {
        wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const setField = (key: keyof typeof fields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setErrFields((prev) => prev.filter((k) => k !== key));
  };

  const toggleCourse = (id: string) => {
    setStepError('');
    setCourses((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const goTo = (next: number) => {
    setStepError('');
    setStep(next);
    wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const next = () => {
    if (step === 1) {
      if (courses.length === 0) {
        setStepError(f.errCourse);
        return;
      }
      goTo(2);
      return;
    }
    if (step === 2) {
      const required: (keyof typeof fields)[] = ['fullName', 'email', 'phone', 'certification'];
      const bad = required.filter((k) => !fields[k].trim());
      if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
        bad.push('email');
      }
      if (bad.length > 0) {
        setErrFields(bad);
        setStepError(f.errPersonal);
        return;
      }
      goTo(3);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    const data = {
      timestamp: new Date().toISOString(),
      courses: courses.map(courseValue).join(', '),
      fullName: fields.fullName.trim(),
      email: fields.email.trim(),
      phone: fields.phone.trim(),
      certification: fields.certification.trim(),
      studio: fields.studio.trim(),
      cityState: fields.cityState.trim(),
      questions: fields.questions.trim(),
      stage:
        stage === null
          ? ''
          : STAGE_VALUES[stage] === 'Other'
            ? 'Other: ' + fields.stageOther.trim()
            : STAGE_VALUES[stage],
      prereq: prereq === null ? '' : PREREQ_VALUES[prereq],
      availability: avail === null ? '' : AVAIL_VALUES[avail],
      anythingElse: fields.anythingElse.trim(),
    };
    try {
      await fetch(SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data).toString(),
      });
      setSubmitted(true);
      wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      setStepError(f.errSubmit);
    } finally {
      setSubmitting(false);
    }
  };

  const pillBtn =
    'group flex items-center gap-3 rounded-full bg-sage py-2.5 pl-6 pr-2.5 text-sm font-medium text-cream transition-transform duration-500 ease-smooth hover:scale-[1.03] disabled:opacity-60 disabled:hover:scale-100';
  const pillArrow =
    'flex h-8 w-8 items-center justify-center rounded-full bg-cream text-sage transition-transform duration-500 ease-smooth group-hover:translate-x-0.5';

  return (
    <div
      ref={wrapRef}
      className={`grid scroll-mt-28 transition-[grid-template-rows,opacity] duration-700 ease-smooth ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">
        <div className="mt-8 rounded-[2rem] border border-ink/10 bg-paper p-7 shadow-[0_20px_50px_-25px_rgba(28,26,22,0.18)] sm:p-10 md:p-12">
          {submitted ? (
            /* ── Thank-you state ── */
            <div className="py-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-sage"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h3 className="mt-6 font-display text-3xl font-semibold tracking-tight text-ink">
                {f.tyTitle}
              </h3>
              <p className="mx-auto mt-4 max-w-[46ch] break-keep text-[15px] leading-relaxed text-mute">
                {f.tyMsg}
              </p>
              <button type="button" onClick={onClose} className={`${pillBtn} mx-auto mt-8`}>
                {f.btnClose}
                <span className={pillArrow}>✓</span>
              </button>
            </div>
          ) : (
            <>
              {/* ── Header ── */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                    {f.title}
                  </h3>
                  <p className="mt-2 max-w-[52ch] break-keep text-sm leading-relaxed text-mute">
                    {f.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={f.btnClose}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-ink/10 text-mute transition-colors duration-300 hover:border-ink/25 hover:text-ink"
                >
                  ✕
                </button>
              </div>

              {/* ── Progress ── */}
              <div className="mt-8 flex items-center">
                {f.stepLabels.map((label, i) => (
                  <div key={label} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
                    {i > 0 && (
                      <div
                        className={`mx-3 h-px flex-1 transition-colors duration-500 ${
                          step > i ? 'bg-sage' : 'bg-ink/10'
                        }`}
                      />
                    )}
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-500 ${
                          step > i + 1
                            ? 'bg-sage text-cream'
                            : step === i + 1
                              ? 'border-2 border-sage bg-paper text-sage'
                              : 'border border-ink/15 bg-paper text-mute'
                        }`}
                      >
                        {step > i + 1 ? '✓' : i + 1}
                      </span>
                      <span
                        className={`hidden text-[11px] uppercase tracking-[0.14em] sm:block ${
                          step >= i + 1 ? 'text-sage' : 'text-mute'
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Step 1: course selection ── */}
              {step === 1 && (
                <div className="mt-9">
                  <h4 className="font-display text-xl font-semibold tracking-tight text-ink">
                    {f.s1Title}
                  </h4>
                  <p className="mt-1.5 text-sm text-mute">{f.s1Subtitle}</p>
                  <div className="mt-6 flex flex-col gap-3">
                    {displayCourses.map((c) => {
                      const selected = courses.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={c.full}
                          onClick={() => toggleCourse(c.id)}
                          className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-300 ease-smooth sm:p-5 ${
                            c.full
                              ? 'cursor-not-allowed border-ink/10 opacity-55'
                              : selected
                                ? 'border-sage bg-sage/5 ring-1 ring-sage'
                                : 'border-ink/10 hover:border-sage/40 hover:bg-cream/60'
                          }`}
                        >
                          <span
                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold transition-colors duration-300 ${
                              selected ? 'bg-sage text-cream' : 'bg-cream text-mute'
                            }`}
                          >
                            {c.id}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-keep text-[15px] font-medium leading-snug text-ink">
                              {c.name}
                            </span>
                            <span className="mt-1 block text-[13px] text-mute">
                              {c.meta}
                              {c.tag && ` · ${c.tag}`}
                            </span>
                            {c.conductedBy && (
                              <span className="mt-1 block text-[13px] text-mute">
                                {f.conductedBy}
                                <span className="block text-ink">{c.conductedBy}</span>
                              </span>
                            )}
                            {(c.price || c.fee) && (
                              <span className="mt-1 block text-[13px] font-medium text-ink">
                                {c.price && `${f.courseCost} ${formatMoney(c.price)}`}
                                {c.price && c.fee && '  |  '}
                                {c.fee && `${f.studioFee} ${formatMoney(c.fee)}`}
                              </span>
                            )}
                            {c.remaining !== null && !c.full && (
                              <span className="mt-1 block text-xs font-medium text-sage">
                                {f.seatsLeft.replace('{n}', String(c.remaining))}
                              </span>
                            )}
                            {c.full && (
                              <span className="mt-1 block text-xs font-medium text-clay">
                                {f.seatsFullNote}
                              </span>
                            )}
                          </span>
                          {c.full && (
                            <span className="flex-shrink-0 rounded-full bg-clay/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-clay">
                              {f.seatsFull}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {stepError && <p className="mt-4 text-sm text-red-500">{stepError}</p>}
                  <div className="mt-8 flex justify-end border-t border-ink/10 pt-6">
                    <button type="button" onClick={next} className={pillBtn}>
                      {f.btnNext}
                      <span className={pillArrow}>→</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 2: personal info ── */}
              {step === 2 && (
                <div className="mt-9">
                  <h4 className="font-display text-xl font-semibold tracking-tight text-ink">
                    {f.s2Title}
                  </h4>
                  <p className="mt-1.5 text-sm text-mute">{f.s2Subtitle}</p>
                  <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">{f.lblName}</label>
                      <input
                        type="text"
                        value={fields.fullName}
                        onChange={(e) => setField('fullName', e.target.value)}
                        placeholder={f.phName}
                        className={`${inputCls} ${errFields.includes('fullName') ? inputErrCls : ''}`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">{f.lblEmail}</label>
                      <input
                        type="email"
                        value={fields.email}
                        onChange={(e) => setField('email', e.target.value)}
                        placeholder="you@example.com"
                        className={`${inputCls} ${errFields.includes('email') ? inputErrCls : ''}`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">{f.lblPhone}</label>
                      <input
                        type="tel"
                        value={fields.phone}
                        onChange={(e) => setField('phone', e.target.value)}
                        placeholder={f.phPhone}
                        className={`${inputCls} ${errFields.includes('phone') ? inputErrCls : ''}`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">{f.lblCert}</label>
                      <input
                        type="text"
                        value={fields.certification}
                        onChange={(e) => setField('certification', e.target.value)}
                        placeholder={f.phCert}
                        className={`${inputCls} ${errFields.includes('certification') ? inputErrCls : ''}`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        {f.lblStudio} <span className="font-normal text-mute">{f.optional}</span>
                      </label>
                      <input
                        type="text"
                        value={fields.studio}
                        onChange={(e) => setField('studio', e.target.value)}
                        placeholder={f.phStudio}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        {f.lblCity} <span className="font-normal text-mute">{f.optional}</span>
                      </label>
                      <input
                        type="text"
                        value={fields.cityState}
                        onChange={(e) => setField('cityState', e.target.value)}
                        placeholder={f.phCity}
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        {f.lblQuestions} <span className="font-normal text-mute">{f.optional}</span>
                      </label>
                      <textarea
                        value={fields.questions}
                        onChange={(e) => setField('questions', e.target.value)}
                        placeholder={f.phQuestions}
                        rows={3}
                        className={`${inputCls} resize-y`}
                      />
                    </div>
                  </div>
                  {stepError && <p className="mt-4 text-sm text-red-500">{stepError}</p>}
                  <div className="mt-8 flex items-center justify-between border-t border-ink/10 pt-6">
                    <button
                      type="button"
                      onClick={() => goTo(1)}
                      className="text-sm text-mute transition-colors hover:text-ink"
                    >
                      ← {f.btnBack}
                    </button>
                    <button type="button" onClick={next} className={pillBtn}>
                      {f.btnNext}
                      <span className={pillArrow}>→</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 3: confirmation ── */}
              {step === 3 && (
                <div className="mt-9">
                  <h4 className="font-display text-xl font-semibold tracking-tight text-ink">
                    {f.s3Title}
                  </h4>
                  <p className="mt-1.5 text-sm text-mute">{f.s3Subtitle}</p>

                  <div className="mt-6 space-y-7">
                    <div>
                      <p className="mb-3 break-keep text-sm font-medium text-ink">{f.lblStage}</p>
                      <div className="flex flex-wrap gap-2">
                        {f.stageOptions.map((label, i) => (
                          <Chip
                            key={label}
                            label={label}
                            selected={stage === i}
                            onClick={() => setStage(i)}
                          />
                        ))}
                      </div>
                      {stage !== null && STAGE_VALUES[stage] === 'Other' && (
                        <input
                          type="text"
                          value={fields.stageOther}
                          onChange={(e) => setField('stageOther', e.target.value)}
                          placeholder={f.phStageOther}
                          className={`${inputCls} mt-3`}
                        />
                      )}
                    </div>

                    <div>
                      <p className="mb-3 break-keep text-sm font-medium text-ink">{f.lblPrereq}</p>
                      <div className="flex flex-wrap gap-2">
                        {f.prereqOptions.map((label, i) => (
                          <Chip
                            key={label}
                            label={label}
                            selected={prereq === i}
                            onClick={() => setPrereq(i)}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-3 break-keep text-sm font-medium text-ink">{f.lblAvail}</p>
                      <div className="flex flex-wrap gap-2">
                        {f.availOptions.map((label, i) => (
                          <Chip
                            key={label}
                            label={label}
                            selected={avail === i}
                            onClick={() => setAvail(i)}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        {f.lblAnything} <span className="font-normal text-mute">{f.optional}</span>
                      </label>
                      <textarea
                        value={fields.anythingElse}
                        onChange={(e) => setField('anythingElse', e.target.value)}
                        placeholder={f.phAnything}
                        rows={3}
                        className={`${inputCls} resize-y`}
                      />
                    </div>
                  </div>

                  {stepError && <p className="mt-4 text-sm text-red-500">{stepError}</p>}
                  <div className="mt-8 flex items-center justify-between border-t border-ink/10 pt-6">
                    <button
                      type="button"
                      onClick={() => goTo(2)}
                      className="text-sm text-mute transition-colors hover:text-ink"
                    >
                      ← {f.btnBack}
                    </button>
                    <button type="button" onClick={submit} disabled={submitting} className={pillBtn}>
                      {submitting ? f.btnSubmitting : f.btnSubmit}
                      <span className={pillArrow}>→</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
