// Settings › Schedule (Owner/Admin): instructor colors, the services offered
// for new appointments, the change-text delay and the Schedulista CSV import.
// Every save goes through an owner-only database function.
import { useEffect, useRef, useState } from 'react';
import { Check, MessageSquare, Plus, Sparkles, Upload, Users, X } from 'lucide-react';
import { useT } from '../i18n';
import Layout from '../Layout';
import { loadInstructors, PALETTE, type Instructor } from '../schedule';
import { scheduleFromCsv, type ImportProblem, type ScheduleImportRow } from '../scheduleImport';
import { supabase } from '../supabase';
import { Button, Card, CardTitle, Chip, Notice, Skeleton, Stat, Switch, inputCls } from '../ui';

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

type Service = { name: string; minutes: number; capacity: number; active: boolean };
type Note = { card: 'colors' | 'services' | 'text'; tone: 'success' | 'error'; text: string };
type ImportResult = { total: number; importable: number; duplicates: number; failed: number; errors: ImportProblem[] };

async function loadAll() {
  const [instructors, services, settings] = await Promise.all([
    loadInstructors(),
    supabase!.from('schedule_services').select('name, minutes, capacity, active').order('sort').order('name'),
    supabase!.from('schedule_settings').select('change_text_minutes').maybeSingle(),
  ]);
  if (services.error) throw services.error;
  if (settings.error) throw settings.error;
  return {
    instructors,
    services: services.data as Service[],
    textMinutes: (settings.data?.change_text_minutes ?? null) as number | null,
  };
}

const TEXT_DELAYS = ['', '0', '5', '15', '30', '60'];

export default function ScheduleSettings() {
  const { t } = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAll>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [note, setNote] = useState<Note | null>(null);
  const [adding, setAdding] = useState(false);
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

  const saveService = async (s: Service, isNew: boolean) => {
    const ok =
      s.name.length >= 1 &&
      s.name.length <= 60 &&
      Number.isInteger(s.minutes) &&
      s.minutes >= 5 &&
      s.minutes <= 720 &&
      Number.isInteger(s.capacity) &&
      s.capacity >= 1 &&
      s.capacity <= 50;
    if (!ok) return setNote({ card: 'services', tone: 'error', text: t('ssServiceInvalid') });
    // Same name = edit (save_schedule_service upserts by name), so a new one must not reuse a name.
    if (isNew && data?.services.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) {
      return setNote({ card: 'services', tone: 'error', text: t('ssServiceExists') });
    }
    const { error } = await supabase!.rpc('save_schedule_service', { p: s });
    if (error) return setNote({ card: 'services', tone: 'error', text: t('saveFailed', { reason: error.message }) });
    setNote({ card: 'services', tone: 'success', text: t('ssSaved') });
    if (isNew) setAdding(false);
    reload();
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
          <CardTitle
            icon={Sparkles}
            title={t('ssServices')}
            action={
              <Button variant="secondary" className="!min-h-10 !px-4" disabled={adding} onClick={() => setAdding(true)}>
                <Plus {...ICON} />
                {t('add')}
              </Button>
            }
          />
          {show('services')}
          {!data ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-mute">
                  <tr>
                    <th scope="col" className="py-2 pr-2 font-medium">{t('ssService')}</th>
                    <th scope="col" className="pr-2 font-medium">{t('ssMinutes')}</th>
                    <th scope="col" className="pr-2 font-medium">{t('capacity')}</th>
                    <th scope="col" className="pr-2 font-medium">{t('ACTIVE')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/[0.06] tabular-nums">
                  {data.services.map((s) => (
                    // Saved values in the key: a saved row starts fresh from what the database has.
                    <ServiceRow key={`${s.name}|${s.minutes}|${s.capacity}|${s.active}`} svc={s} onSave={saveService} />
                  ))}
                  {adding && <ServiceRow onSave={saveService} onCancel={() => setAdding(false)} />}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-mute">{t('ssServicesHint')}</p>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle icon={MessageSquare} title={t('ssTextTitle')} />
          {show('text')}
          {!data ? (
            <Skeleton className="h-12 w-full max-w-xs" />
          ) : (
            <div className="grid gap-5 md:grid-cols-3">
              <div>
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
              <p className="text-sm text-mute md:col-span-2 md:pt-3">{t('ssTextTwilio')}</p>
            </div>
          )}
        </Card>

        <ImportCard onImported={reload} />
      </div>
    </Layout>
  );
}

/** One service: minutes, capacity and active edit in place; a new row also takes a name. */
function ServiceRow({
  svc,
  onSave,
  onCancel,
}: {
  svc?: Service;
  onSave: (s: Service, isNew: boolean) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useT();
  const [form, setForm] = useState({
    name: svc?.name ?? '',
    minutes: String(svc?.minutes ?? 50),
    capacity: String(svc?.capacity ?? 1),
    active: svc?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const dirty =
    !svc || form.minutes !== String(svc.minutes) || form.capacity !== String(svc.capacity) || form.active !== svc.active;
  const num = `${inputCls} !px-3 !py-2 text-center`;

  const save = async () => {
    setBusy(true);
    await onSave(
      { name: form.name.trim(), minutes: Number(form.minutes), capacity: Number(form.capacity), active: form.active },
      !svc,
    );
    setBusy(false);
  };

  return (
    <tr>
      <th scope="row" className="py-2 pr-2 text-left font-medium">
        {svc ? (
          svc.name
        ) : (
          <input
            aria-label={t('ssService')}
            value={form.name}
            maxLength={60}
            autoFocus
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={`${inputCls} !w-32 !px-3 !py-2`}
          />
        )}
      </th>
      <td className="py-2 pr-2">
        <input
          type="number"
          inputMode="numeric"
          min={5}
          max={720}
          aria-label={t('ssMinutes')}
          value={form.minutes}
          onChange={(e) => setForm({ ...form, minutes: e.target.value })}
          className={`${num} !w-[4.5rem]`}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          aria-label={t('capacity')}
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          className={`${num} !w-16`}
        />
      </td>
      <td className="py-2 pr-2">
        <Switch label={t('ACTIVE')} checked={form.active} onChange={(active) => setForm({ ...form, active })} />
      </td>
      <td className="py-2">
        {dirty && (
          <span className="flex justify-end gap-1">
            {onCancel && (
              <Button variant="secondary" aria-label={t('cancel')} className="!min-h-10 !w-10 !px-0" onClick={onCancel}>
                <X {...ICON} />
              </Button>
            )}
            <Button
              aria-label={svc ? t('save') : t('add')}
              className="!min-h-10 !w-10 !px-0"
              disabled={busy}
              onClick={() => void save()}
            >
              <Check {...ICON} />
            </Button>
          </span>
        )}
      </td>
    </tr>
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
