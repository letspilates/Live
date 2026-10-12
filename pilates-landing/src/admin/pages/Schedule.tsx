// Schedule: the studio calendar (Schedulista layout). Month / week / day in
// studio time (Los Angeles). Click a block to edit it, drag it (mouse) to move
// it, click an empty slot to book. Every write goes through save_appointment,
// move_appointment or cancel_appointment; the database checks who may do what.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronLeft, ChevronRight, FileText, Plus, RotateCw, Search, Settings, TriangleAlert, X } from 'lucide-react';
import { isAdmin, useStaff } from '../auth';
import { useT, type TextKey } from '../i18n';
import Layout from '../Layout';
import { addDays, formatDay, laToday, type StudentHit } from '../payments';
import { navigate } from '../router';
import {
  BOOKING_STATUSES,
  EVENT_COLOR,
  PALETTE,
  TODAY_COLOR,
  ampm,
  dayText,
  hhmm,
  hm,
  isLight,
  laWall,
  layout,
  loadAppointments,
  loadInstructors,
  loadServices,
  monthCells,
  nextMonth,
  prevMonth,
  toMin,
  wallText,
  weekStart,
  weekday,
  type Appointment,
  type Booking,
  type BookingStatus,
  type Instructor,
  type Service,
} from '../schedule';
import { supabase } from '../supabase';
import { Button, Card, Initials, Notice, Skeleton, inputCls } from '../ui';

type View = 'month' | 'week' | 'day';
type Scope = 'one' | 'following';
type Grid = { ph: number; g0: number; g1: number };
type Drag = Grid & {
  a: Appointment;
  x0: number;
  y0: number;
  grab: number;
  root: Element | null;
  on: boolean;
  col?: HTMLElement;
  day?: string;
  min?: number;
};
type Spot = { a: Appointment; day: string; min: number };

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
const MINI = { size: 12, strokeWidth: 2.5, 'aria-hidden': true } as const;
const DURATIONS = [30, 40, 45, 50, 55, 60, 80, 90, 110, 120, 180, 360];
const SNAP = 15;
const LINE = 'rgb(var(--c-ink) / 0.08)';
const SHADOW = '[text-shadow:0_1px_1px_rgb(0_0_0/0.28)]';
const ROUND =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper shadow-[0_1px_2px_rgb(var(--c-shadow)/0.06)] ring-1 ring-ink/[0.12] transition-colors hover:bg-sand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40';
// Dialog rows: label column + field column, stacked on phones.
const ROW = 'grid items-center gap-1.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-x-4';
const LABEL = 'text-[15px]';
const CHECK = 'h-[1.05rem] w-[1.05rem] shrink-0 accent-sage';

export default function Schedule() {
  const { t, lang } = useT();
  const me = useStaff();
  // Phones start on one day, wider screens on the week.
  const [view, setView] = useState<View>(() => (window.matchMedia('(min-width: 768px)').matches ? 'week' : 'day'));
  const [day, setDay] = useState(laToday);
  const [now, setNow] = useState(() => laWall());
  const [setup, setSetup] = useState<{ instructors: Instructor[]; services: Service[] } | null>(null);
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [edit, setEdit] = useState<{ a: Appointment | null; day: string; min: number } | null>(null);
  const [move, setMove] = useState<Spot | null>(null);
  const [ghost, setGhost] = useState<{ id: string; day: string; min: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [tip, setTip] = useState<Appointment | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false); // the click that ends a drag must not open the dialog
  const seq = useRef(0);

  const ws = weekStart(day);
  const [from, to] =
    view === 'day' ? [day, addDays(day, 1)] : view === 'week' ? [ws, addDays(ws, 7)] : [`${day.slice(0, 8)}01`, nextMonth(day)];

  const reload = useCallback(() => {
    const n = ++seq.current; // only the latest request may land
    return loadAppointments(from, to).then(
      (rows) => n === seq.current && setAppts(rows),
      () => n === seq.current && setFailed(true),
    );
  }, [from, to]);

  useEffect(() => {
    void reload();
  }, [reload, version]);

  useEffect(() => {
    let stale = false;
    Promise.all([loadInstructors(), loadServices()])
      .then(([instructors, services]) => !stale && setSetup({ instructors, services }))
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [version]);

  // Today and the yellow now line follow the studio clock.
  useEffect(() => {
    const id = window.setInterval(() => setNow(laWall()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !drag.current?.on) return;
      drag.current = null;
      dragged.current = true;
      setGhost(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const instructors = setup?.instructors ?? [];
  const byId = new Map(instructors.map((i) => [i.user_id, i]));
  const shown = (appts ?? []).filter((a) => !hidden.has(a.staff_id ?? ''));
  const today = now.day;

  const color = (a: Appointment) => (a.staff_id ? (byId.get(a.staff_id)?.color ?? PALETTE[8]) : EVENT_COLOR);
  // The name without its last word: "Su kyung YI" → "Su kyung", "Sunnie Lee" → "Sunnie".
  const firstName = (a: Appointment) => {
    const name = byId.get(a.staff_id ?? '')?.full_name ?? '';
    return name.split(' ').slice(0, -1).join(' ') || name;
  };
  const count = (a: Appointment) => ({ n: String(a.clients.length), cap: String(a.capacity) });
  /** "Ava Moon" or "4/5"; null for a studio event or nobody booked. */
  const who = (a: Appointment) =>
    !a.staff_id ? null : a.capacity > 1 ? `${a.clients.length}/${a.capacity}` : (a.clients[0]?.name ?? null);
  const label = (a: Appointment) => (who(a) ? `${who(a)} - ${a.service}` : a.service);
  /** "Private with Sunnie" */
  const full = (a: Appointment) => (a.staff_id ? t('calWith', { service: a.service, name: firstName(a) }) : a.service);
  const when = (d: string, start: number, minutes: number) =>
    `${formatDay(d, lang)} · ${hm(start)} - ${ampm(start + minutes)}`;

  const tipLines = (a: Appointment) =>
    [
      `${hm(a.start)} - ${hm(a.start + a.minutes)}`,
      a.minutes % 60 || a.minutes < 120
        ? t('calMinutes', { n: String(a.minutes) })
        : t('calHours', { n: String(a.minutes / 60) }),
      !a.staff_id ? a.service : a.capacity > 1 ? t('calBookedOf', count(a)) : a.clients[0]?.name,
      a.staff_id ? full(a) : t('calStudioEvent'),
      a.series_id && a.series_changed ? t('calChanged') : '',
    ].filter(Boolean);

  const placeTip = (e: PointerEvent) => {
    const el = tipRef.current;
    if (!el) return;
    el.style.left = `${Math.min(e.clientX + 14, window.innerWidth - el.offsetWidth - 8)}px`;
    el.style.top = `${Math.min(e.clientY + 14, window.innerHeight - el.offsetHeight - 8)}px`;
  };

  /* Drag to move (mouse / pen): 5px before it starts, snaps to 15 minutes, any day column of the same grid. */
  const dragMove = (d: Drag, e: PointerEvent) => {
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.on = true;
      setTip(null);
    }
    const col = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el): el is HTMLElement => el instanceof HTMLElement && Boolean(el.dataset.day) && Boolean(d.root?.contains(el)));
    if (col) d.col = col;
    if (!d.col) return;
    const y = e.clientY - d.grab - d.col.getBoundingClientRect().top;
    const last = d.g0 + Math.floor((d.g1 - d.a.minutes - d.g0) / SNAP) * SNAP; // latest start on the 15-minute grid
    const min = Math.max(d.g0, Math.min(last, d.g0 + Math.round(y / d.ph / SNAP) * SNAP));
    if (d.day === d.col.dataset.day && d.min === min) return;
    d.day = d.col.dataset.day!;
    d.min = min;
    setGhost({ id: d.a.id, day: d.day, min });
  };

  const dragEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return; // a plain click: onClick opens the dialog
    dragged.current = true;
    if (!d.day || d.min === undefined || (d.day === d.a.day && d.min === d.a.start)) return setGhost(null);
    setMove({ a: d.a, day: d.day, min: d.min });
  };

  const blockEvents = (a: Appointment, grid: Grid): ButtonHTMLAttributes<HTMLButtonElement> => ({
    onClick: (e) => {
      e.stopPropagation();
      setTip(null);
      if (dragged.current) dragged.current = false;
      else setEdit({ a, day: a.day, min: a.start });
    },
    onPointerDown: (e) => {
      dragged.current = false;
      if (e.button !== 0 || e.pointerType === 'touch') return; // phones: a tap opens the dialog, change the time there
      const el = e.currentTarget;
      drag.current = {
        ...grid,
        a,
        x0: e.clientX,
        y0: e.clientY,
        grab: e.clientY - el.getBoundingClientRect().top,
        root: el.closest('[data-grid]'),
        on: false,
      };
      el.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      if (drag.current?.a.id === a.id) dragMove(drag.current, e);
      else if (e.pointerType === 'mouse') placeTip(e);
    },
    onPointerUp: () => {
      if (drag.current?.a.id === a.id) dragEnd();
    },
    onPointerCancel: () => {
      drag.current = null;
      setGhost(null);
    },
    onPointerEnter: (e) => {
      if (e.pointerType !== 'mouse' || drag.current) return;
      setTip(a);
      placeTip(e);
    },
    onPointerLeave: () => setTip(null),
  });

  const block = (a: Appointment, start: number, style: CSSProperties, grid: Grid | null) => (
    <Block
      key={grid ? a.id : 'ghost'}
      a={a}
      start={start}
      label={label(a)}
      color={color(a)}
      style={style}
      className={
        grid
          ? `z-[2] hover:z-[4] [@media(hover:hover)]:cursor-grab ${ghost?.id === a.id ? 'opacity-[0.35]' : ''}`
          : 'pointer-events-none z-[6] shadow-[0_10px_24px_-6px_rgb(0_0_0/0.35),0_0_0_2px_rgb(255_255_255/0.9)]'
      }
      {...(grid ? blockEvents(a, grid) : { tabIndex: -1, 'aria-hidden': true })}
    />
  );

  const step = (dir: 1 | -1) =>
    setDay((d) =>
      view === 'day' ? addDays(d, dir) : view === 'week' ? addDays(d, 7 * dir) : dir > 0 ? nextMonth(d) : prevMonth(d),
    );
  const showDay = (d: string) => {
    setDay(d);
    setView('day');
  };
  const newAt = (d: string, min: number) => setEdit({ a: null, day: d, min });
  const newAppt = () => newAt(today >= from && today < to ? today : from, 600);
  const mine = instructors.find((i) => i.active && i.user_id === me.user_id) ?? instructors.find((i) => i.active);

  const doMove = async (scope: Scope) => {
    const { a, day: d, min } = move!;
    const { error } = await supabase!.rpc('move_appointment', {
      p_id: a.id,
      p_start: wallText(d, min),
      p_scope: scope,
      p_series_changed: true,
    });
    if (error) return error.message;
    await reload();
    setMove(null);
    setGhost(null);
    setToast({
      text: t('calMovedTo', { when: `${dayText(d, lang, { weekday: 'short' })} ${ampm(min).toUpperCase()}` }),
      // Undo only for one date: moving "this and following" back can catch dates the move skipped.
      undo:
        scope === 'one'
          ? async () => {
              setToast(null);
              const { error: undoError } = await supabase!.rpc('move_appointment', {
                p_id: a.id,
                p_start: wallText(a.day, a.start),
                p_scope: 'one',
                p_series_changed: a.series_changed,
              });
              if (undoError) setToast({ text: undoError.message });
              setVersion((v) => v + 1); // reload what is on screen now
            }
          : undefined,
    });
    return null;
  };

  // Same instructor already busy at the new time: a warning, never a block.
  const clash = ({ a, day: d, min }: Spot) => {
    const end = min + a.minutes;
    const c =
      a.staff_id &&
      appts?.find((x) => x.id !== a.id && x.staff_id === a.staff_id && x.day === d && x.start < end && min < x.start + x.minutes);
    return c
      ? t('calClash', {
          name: firstName(a),
          what: c.capacity > 1 ? c.service : (c.clients[0]?.name ?? c.service),
          time: `${hm(c.start)} - ${hm(c.start + c.minutes)}`,
        })
      : '';
  };

  const legend: [string, string, string][] = [
    ...instructors
      .filter((i) => i.active || appts?.some((a) => a.staff_id === i.user_id))
      .map((i): [string, string, string] => [i.user_id, i.full_name, i.color]),
    ['', t('calStudioEvent'), EVENT_COLOR],
  ];
  const toggle = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ghostSpot = ghost && appts?.find((a) => a.id === ghost.id);
  const title =
    view === 'month'
      ? dayText(day, lang, { month: 'long', year: 'numeric' })
      : view === 'day'
        ? dayText(day, lang, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : dayText(from, lang, { month: 'long', day: 'numeric', year: 'numeric' }, addDays(to, -1));

  return (
    <Layout title={t('navSchedule')}>
      <Card pad={false} className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-4 md:grid-cols-[1fr_auto_1fr] md:px-5 md:py-5">
          <div role="tablist" aria-label={t('navSchedule')} className="inline-flex justify-self-start rounded-full bg-ink/[0.06] p-1">
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`min-h-10 rounded-full px-[1.1rem] text-[0.8rem] font-medium uppercase tracking-[0.04em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
                  view === v ? 'bg-paper text-ink shadow-card' : 'text-mute hover:text-ink'
                }`}
              >
                {t(v === 'month' ? 'calMonth' : v === 'week' ? 'calWeek' : 'calDay')}
              </button>
            ))}
          </div>
          <div className="order-last col-span-2 flex items-center justify-center gap-3 md:order-none md:col-span-1 md:gap-5">
            <button type="button" className={ROUND} aria-label={t('calPrev')} onClick={() => step(-1)}>
              <ChevronLeft {...ICON} size={20} />
            </button>
            <h2 className="min-w-0 text-center font-display text-xl font-semibold tracking-tight md:whitespace-nowrap md:text-2xl">
              <span className="md:hidden">{view === 'day' ? dayText(day, lang, { weekday: 'short', month: 'short', day: 'numeric' }) : title}</span>
              <span className="hidden md:inline">{title}</span>
            </h2>
            <button type="button" className={ROUND} aria-label={t('calNext')} onClick={() => step(1)}>
              <ChevronRight {...ICON} size={20} />
            </button>
          </div>
          {isAdmin(me) ? (
            <button
              type="button"
              className={`${ROUND} justify-self-end`}
              aria-label={t('navScheduleSettings')}
              title={t('navScheduleSettings')}
              onClick={() => navigate('schedule-settings')}
            >
              <Settings {...ICON} size={20} />
            </button>
          ) : (
            <span />
          )}
        </div>

        <div className="flex border-t border-ink/[0.08]">
          <aside className="hidden w-56 shrink-0 border-r border-ink/[0.08] px-4 py-6 xl:block">
            <Button variant="secondary" className="w-full" disabled={!setup} onClick={newAppt}>
              <Plus {...ICON} size={16} />
              {t('calNew')}
            </Button>
            <MiniMonth
              key={day.slice(0, 7)}
              day={day}
              range={view === 'month' ? null : [from, to]}
              today={today}
              onPick={(d) => {
                setDay(d);
                if (view === 'month') setView('week');
              }}
            />
            <p className="mt-8 text-[11px] font-medium uppercase tracking-wider text-mute">{t('calInstructors')}</p>
            <ul className="mt-2 grid gap-0.5 text-sm">
              {legend.map(([id, name, c]) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={!hidden.has(id)}
                    onClick={() => toggle(id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
                      hidden.has(id) ? 'opacity-40' : ''
                    }`}
                  >
                    <span className="h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: c }} />
                    <span className="truncate">{name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-mute">{t('calLegendHint')}</p>
          </aside>

          <div className="min-w-0 flex-1">
            {failed ? (
              <div className="max-w-xl p-5">
                <Notice tone="error">{t('calLoadFailed')}</Notice>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => {
                    setFailed(false);
                    setVersion((v) => v + 1);
                  }}
                >
                  {t('tryAgain')}
                </Button>
              </div>
            ) : !appts || !setup ? (
              <div className="p-4">
                <Skeleton className="h-[30rem] w-full" />
              </div>
            ) : (
              // Phones: the grid scrolls inside this box, never the page.
              <div className="max-h-[calc(100dvh-16.5rem)] overflow-auto md:max-h-none">
                <div className={view === 'day' ? 'min-w-[18rem]' : 'min-w-[46rem]'}>
                  {view === 'month' ? (
                    <MonthGrid
                      day={day}
                      appts={shown}
                      today={today}
                      color={color}
                      pill={(a) => (!a.staff_id ? a.service : a.capacity > 1 ? `${who(a)} ${a.service}` : (who(a) ?? a.service))}
                      onOpen={(a) => setEdit({ a, day: a.day, min: a.start })}
                      onDay={showDay}
                    />
                  ) : (
                    <TimeGrid
                      days={view === 'day' ? [day] : [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i))}
                      ph={view === 'day' ? 1 : 0.8}
                      appts={shown}
                      ghost={ghostSpot ? { a: ghostSpot, day: ghost.day, min: ghost.min } : null}
                      now={now}
                      block={block}
                      onSlot={newAt}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {setup && (
        <Button className="fixed bottom-5 right-5 z-20 !px-5 shadow-pop xl:hidden" onClick={newAppt}>
          <Plus {...ICON} size={20} />
          {t('calNewShort')}
        </Button>
      )}

      <div
        ref={tipRef}
        hidden={!tip}
        className="pointer-events-none fixed z-[60] min-w-[11rem] max-w-[16rem] rounded border border-ink/20 bg-paper px-[0.7rem] py-2 text-[13px] leading-[1.45] text-ink shadow-[0_8px_24px_-10px_rgb(var(--c-shadow)/0.35)]"
      >
        {tip && tipLines(tip).map((line, i) => <div key={i}>{line}</div>)}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[55] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-4 rounded-[14px] bg-ink py-3 pl-[1.1rem] pr-3 text-sm text-cream shadow-pop"
        >
          <span className="min-w-0">{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={toast.undo}
              className="shrink-0 rounded-full bg-cream/[0.14] px-[0.9rem] py-[0.45rem] font-semibold hover:bg-cream/[0.24]"
            >
              {t('calUndo')}
            </button>
          )}
        </div>
      )}

      {edit && setup && (
        <AppointmentDialog
          a={edit.a}
          day={edit.day}
          min={edit.min}
          instructors={setup.instructors}
          services={setup.services}
          defaultStaff={mine?.user_id ?? ''}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void reload();
          }}
        />
      )}

      {move && (
        <MoveDialog
          title={t(!move.a.staff_id ? 'calMoveEvent' : move.a.capacity > 1 ? 'calRescheduleClass' : 'calReschedule')}
          color={color(move.a)}
          who={
            !move.a.staff_id
              ? move.a.service
              : move.a.capacity > 1
                ? `${full(move.a)} · ${t('calBookedCount', count(move.a))}`
                : who(move.a)
                  ? `${who(move.a)} - ${full(move.a)}`
                  : full(move.a)
          }
          from={when(move.a.day, move.a.start, move.a.minutes)}
          to={when(move.day, move.min, move.a.minutes)}
          warn={clash(move)}
          repeats={Boolean(move.a.series_id)}
          onClose={() => {
            setMove(null);
            setGhost(null);
          }}
          onMove={doMove}
        />
      )}
    </Layout>
  );
}

function Block({
  a,
  start,
  label,
  color,
  className = '',
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { a: Appointment; start: number; label: string; color: string }) {
  const short = a.minutes <= 30;
  const icons = [
    a.series_id &&
      (a.series_changed ? (
        // Repeats, but this date was changed on its own: the repeat icon with a slash.
        <span
          key="x"
          className="relative inline-flex after:absolute after:-inset-y-0.5 after:left-1/2 after:w-[1.5px] after:-translate-x-1/2 after:-rotate-45 after:rounded-[1px] after:bg-current after:content-['']"
        >
          <RotateCw {...MINI} />
        </span>
      ) : (
        <RotateCw key="r" {...MINI} />
      )),
    a.clients.some((b) => b.status === 'CONFIRMED') && <Check key="c" {...MINI} />,
    a.clients.some((b) => b.notes.trim()) && <FileText key="n" {...MINI} />,
  ].filter(Boolean);
  return (
    <button
      type="button"
      style={{ ...style, background: color }}
      className={`absolute flex select-none flex-col overflow-hidden rounded-[3px] px-[5px] py-[3px] text-left leading-[1.22] text-white transition-[filter] duration-150 hover:brightness-[1.06] hover:saturate-[1.05] ${
        isLight(color) ? SHADOW : ''
      } ${className}`}
      {...rest}
    >
      <span className="shrink-0 overflow-hidden whitespace-nowrap text-[11.5px] tabular-nums" style={{ marginRight: icons.length * 14 }}>
        {hm(start)} - {short ? label : hm(start + a.minutes)}
      </span>
      {!short && <span className="shrink-0 text-[12.5px] font-medium">{label}</span>}
      {icons.length > 0 && <span className="absolute right-[3px] top-[3px] flex gap-0.5">{icons}</span>}
    </button>
  );
}

/** Hour column + one column per day (week = 7, day = 1). */
function TimeGrid({
  days,
  ph,
  appts,
  ghost,
  now,
  block,
  onSlot,
}: {
  days: string[];
  /** pixels per minute */
  ph: number;
  appts: Appointment[];
  ghost: Spot | null;
  now: { day: string; min: number };
  block: (a: Appointment, start: number, style: CSSProperties, grid: Grid | null) => ReactNode;
  onSlot: (day: string, min: number) => void;
}) {
  const { lang } = useT();
  // 6 am – 10 pm, longer when something starts earlier or ends later.
  const g0 = Math.min(360, ...appts.map((a) => Math.floor(a.start / 60) * 60));
  const g1 = Math.min(1440, Math.max(1320, ...appts.map((a) => Math.ceil((a.start + a.minutes) / 60) * 60)));
  const grid = { ph, g0, g1 };
  const height = (g1 - g0) * ph;
  const cols = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };
  const nowOn = days.includes(now.day) && now.min >= g0 && now.min <= g1;
  const hours: number[] = [];
  for (let m = g0 + 60; m < g1; m += 60) hours.push(m);
  const pos = (start: number, minutes: number) => ({ top: (start - g0) * ph, height: Math.max(minutes * ph - 2, 16) });

  return (
    <div data-grid="">
      <div className="sticky top-0 z-[7] grid border-b border-ink/[0.08] bg-paper" style={cols}>
        <div />
        {days.map((d) => (
          <div
            key={d}
            className={`relative flex h-11 items-center justify-center border-l border-ink/[0.08] text-[13px] ${
              d === now.day ? 'font-medium' : ''
            }`}
          >
            {dayText(d, lang, { weekday: 'short' })} {Number(d.slice(8))}
            {d === now.day && <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: TODAY_COLOR }} />}
          </div>
        ))}
      </div>
      <div className="grid" style={cols}>
        <div className="relative" style={{ height }}>
          {hours.map((m) => (
            <span key={m} className="absolute right-2 -translate-y-1/2 text-xs text-mute" style={{ top: (m - g0) * ph }}>
              {(m / 60) % 12 || 12}
              {m < 720 ? 'am' : 'pm'}
            </span>
          ))}
          {nowOn && (
            <b
              className="absolute -right-0.5 h-0 w-0 -translate-y-1/2 border-y-8 border-l-[12px] border-y-transparent"
              style={{ top: (now.min - g0) * ph, borderLeftColor: TODAY_COLOR }}
            />
          )}
        </div>
        {days.map((d) => (
          <div
            key={d}
            data-day={d}
            className="relative cursor-cell border-l border-ink/[0.08]"
            style={{ height, backgroundImage: `linear-gradient(${LINE} 1px, transparent 1px)`, backgroundSize: `100% ${60 * ph}px` }}
            onClick={(e) => onSlot(d, g0 + Math.floor((e.clientY - e.currentTarget.getBoundingClientRect().top) / ph / 30) * 30)}
          >
            {d === now.day && nowOn && (
              <div
                className="pointer-events-none absolute inset-x-0 z-[3] h-[3px]"
                style={{ top: (now.min - g0) * ph - 1, background: TODAY_COLOR }}
              />
            )}
            {layout(appts.filter((a) => a.day === d)).map(({ a, c, n }) =>
              block(a, a.start, { ...pos(a.start, a.minutes), left: `calc(${(c / n) * 100}% + 1px)`, width: `calc(${100 / n}% - 2px)` }, grid),
            )}
            {ghost?.day === d &&
              block(ghost.a, ghost.min, { ...pos(ghost.min, ghost.a.minutes), left: 1, width: 'calc(100% - 2px)' }, null)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sunday–Saturday weeks, up to 3 colored lines a day, then "+N more" (opens the day). */
function MonthGrid({
  day,
  appts,
  today,
  color,
  pill,
  onOpen,
  onDay,
}: {
  day: string;
  appts: Appointment[];
  today: string;
  color: (a: Appointment) => string;
  pill: (a: Appointment) => string;
  onOpen: (a: Appointment) => void;
  onDay: (day: string) => void;
}) {
  const { t, lang } = useT();
  const first = `${day.slice(0, 8)}01`;
  const end = nextMonth(day);
  const cells = monthCells(day);
  const edge = '[&:not(:nth-child(7n+1))]:border-l';
  return (
    <>
      <div className="grid grid-cols-7 border-b border-ink/[0.08] text-center text-xs font-medium text-mute">
        {cells.slice(0, 7).map((d) => (
          <div key={d} className={`border-ink/[0.08] py-2.5 ${edge}`}>
            {dayText(d, lang, { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const inMonth = d >= first && d < end;
          const list = inMonth ? appts.filter((a) => a.day === d) : [];
          return (
            <div
              key={d}
              className={`flex min-h-[7.5rem] min-w-0 flex-col gap-0.5 border-ink/[0.08] p-1 [&:nth-child(n+8)]:border-t ${edge} ${
                inMonth ? '' : 'bg-ink/[0.025]'
              }`}
            >
              <button
                type="button"
                onClick={() => onDay(d)}
                className={`mb-1 self-start text-xs tabular-nums ${
                  d === today
                    ? 'inline-flex h-6 w-6 items-center justify-center rounded-full font-semibold text-[#1c1a16]'
                    : inMonth
                      ? 'px-1 text-ink'
                      : 'px-1 text-mute/60'
                }`}
                style={d === today ? { background: TODAY_COLOR } : undefined}
              >
                {Number(d.slice(8))}
              </button>
              {list.slice(0, 3).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpen(a)}
                  className={`truncate rounded-[3px] px-[5px] py-px text-left text-[11.5px] font-medium text-white ${
                    isLight(color(a)) ? SHADOW : ''
                  }`}
                  style={{ background: color(a) }}
                >
                  {hm(a.start)} {pill(a)}
                </button>
              ))}
              {list.length > 3 && (
                <button type="button" onClick={() => onDay(d)} className="self-start px-1 text-xs font-medium text-mute hover:text-ink">
                  {t('calMore', { n: String(list.length - 3) })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Left panel month: the shown week (or day) is shaded, today is yellow. */
function MiniMonth({
  day,
  range,
  today,
  onPick,
}: {
  day: string;
  range: [string, string] | null;
  today: string;
  onPick: (day: string) => void;
}) {
  const { t, lang } = useT();
  const [month, setMonth] = useState(`${day.slice(0, 8)}01`);
  const end = nextMonth(month);
  const cells = monthCells(month);
  const last = range && addDays(range[1], -1);
  return (
    <>
      <div className="mt-8 flex items-center justify-between text-sm">
        <button type="button" aria-label={t('calPrev')} onClick={() => setMonth(prevMonth(month))} className="rounded-full p-1.5 hover:bg-ink/[0.05]">
          <ChevronLeft {...ICON} size={16} />
        </button>
        <span className="font-medium">{dayText(month, lang, { month: 'long', year: 'numeric' })}</span>
        <button type="button" aria-label={t('calNext')} onClick={() => setMonth(end)} className="rounded-full p-1.5 hover:bg-ink/[0.05]">
          <ChevronRight {...ICON} size={16} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-y-0.5 text-center text-[13px]">
        {cells.slice(0, 7).map((d) => (
          <span key={`w${d}`} className="flex h-[1.85rem] items-center justify-center text-xs font-medium">
            {dayText(d, lang, { weekday: 'short' }).slice(0, 2)}
          </span>
        ))}
        {cells.map((d) => {
          const on = range && d >= range[0] && d < range[1];
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              className={`flex h-[1.85rem] items-center justify-center tabular-nums ${on ? 'bg-ink/[0.07]' : 'hover:bg-ink/[0.04]'} ${
                on && d === range[0] ? 'rounded-l-full' : ''
              } ${on && d === last ? 'rounded-r-full' : ''} ${d < month || d >= end ? 'text-mute' : ''}`}
            >
              {d === today ? (
                <b
                  className="inline-flex h-[1.6rem] w-[1.6rem] items-center justify-center rounded-full font-semibold text-[#1c1a16]"
                  style={{ background: TODAY_COLOR }}
                >
                  {Number(d.slice(8))}
                </b>
              ) : (
                Number(d.slice(8))
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Native <dialog> like ui.tsx's Dialog, sized and titled like the calendar dialogs in the approved design. */
function Modal({ title, width, onClose, children }: { title: string; width: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Only a click that starts and ends on the backdrop closes it (not the end of a drag or a text selection).
      onPointerDown={(e) => (downOnBackdrop.current = e.target === ref.current)}
      onClick={(e) => downOnBackdrop.current && e.target === ref.current && onClose()}
      className={`max-h-[calc(100dvh-2rem)] ${width} overflow-y-auto rounded-[20px] bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/30`}
    >
      <div className="p-6 md:p-8">
        <h2 className="text-center font-display text-2xl font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

/** "This appointment only / This and following" for a repeating appointment. */
function ScopeRow({ value, onChange }: { value: Scope; onChange: (scope: Scope) => void }) {
  const { t } = useT();
  const name = useId();
  return (
    <div className={`${ROW} sm:!items-start`}>
      <span className={LABEL}>{t('calScope')}</span>
      <div className="grid gap-2 text-[15px]">
        {(['one', 'following'] as const).map((s) => (
          <label key={s} className="inline-flex items-center gap-2">
            <input type="radio" name={name} checked={value === s} onChange={() => onChange(s)} className={CHECK} />
            {t(s === 'one' ? 'calThisOnly' : 'calFollowing')}
          </label>
        ))}
      </div>
    </div>
  );
}

function MoveDialog({
  title,
  color,
  who,
  from,
  to,
  warn,
  repeats,
  onClose,
  onMove,
}: {
  title: string;
  color: string;
  who: string;
  from: string;
  to: string;
  warn: string;
  repeats: boolean;
  onClose: () => void;
  /** Resolves to the database error text, or null when moved. */
  onMove: (scope: Scope) => Promise<string | null>;
}) {
  const { t } = useT();
  const [scope, setScope] = useState<Scope>('one');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true);
    setError('');
    const e = await onMove(scope);
    setBusy(false);
    if (e) setError(e);
  };
  return (
    <Modal title={title} width="w-[min(calc(100%-2rem),31rem)]" onClose={onClose}>
      <div className="mt-5 grid gap-4 border-t border-ink/10 pt-6">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 shrink-0 rounded-[3px]" style={{ background: color }} />
          <p className="min-w-0 font-medium">{who}</p>
        </div>
        <div className={ROW}>
          <span className={`${LABEL} text-mute`}>{t('calFrom')}</span>
          <span className="text-[15px] tabular-nums text-mute line-through">{from}</span>
        </div>
        <div className={ROW}>
          <span className={LABEL}>{t('calTo')}</span>
          <span className="text-[15px] font-semibold tabular-nums">{to}</span>
        </div>
        {warn && (
          <p className="flex items-start gap-2 rounded-xl bg-clay/10 px-3 py-2.5 text-sm">
            <TriangleAlert {...ICON} size={16} className="mt-0.5 shrink-0 text-clay" />
            {warn}
          </p>
        )}
        {repeats && <ScopeRow value={scope} onChange={setScope} />}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-ink/10 pt-6">
        <Button variant="secondary" className="!px-7" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button className="!px-8" disabled={busy} onClick={() => void run()}>
          {busy ? t('saving') : t('calMove')}
        </Button>
      </div>
    </Modal>
  );
}

/** New / edit appointment (Schedulista "Edit Appointment" layout). */
function AppointmentDialog({
  a,
  day,
  min,
  instructors,
  services,
  defaultStaff,
  onClose,
  onSaved,
}: {
  a: Appointment | null;
  day: string;
  min: number;
  instructors: Instructor[];
  services: Service[];
  defaultStaff: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useT();
  const id = useId();
  const first = services[0];
  const [f, setF] = useState(() => ({
    staff: a ? (a.staff_id ?? '') : defaultStaff,
    service: a?.service ?? first?.name ?? '',
    date: a?.day ?? day,
    time: hhmm(a?.start ?? min),
    minutes: a?.minutes ?? first?.minutes ?? 50,
    capacity: a?.capacity ?? first?.capacity ?? 1,
    repeat: false,
    every: 1,
    days: [weekday(a?.day ?? day)],
    ends: 'never' as 'never' | 'count' | 'until',
    count: 10,
    until: '',
    scope: 'one' as Scope,
    clients: a?.clients ?? [],
  }));
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const svc = services.find((s) => s.name === f.service);
  const showCapacity = (svc?.capacity ?? 1) > 1 || (a?.capacity ?? 1) > 1;
  const group = f.capacity > 1 || f.clients.length > 1;
  const client = f.clients[0];
  const title = !a ? t('calNew') : !a.staff_id ? t('calEditEvent') : a.capacity > 1 ? t('calEditClass') : t('calEditAppt');
  const cancelLabel = a && t(!a.staff_id ? 'calCancelEvent' : a.capacity > 1 ? 'calCancelClass' : 'calCancelAppt');
  const dot = f.staff ? (instructors.find((i) => i.user_id === f.staff)?.color ?? PALETTE[8]) : EVENT_COLOR;
  const durations = [...new Set([...DURATIONS, f.minutes])].sort((x, y) => x - y);
  const valid = Boolean(f.service && f.date && f.time) && (!f.repeat || (f.days.length > 0 && (f.ends !== 'until' || f.until)));
  const statusOptions = BOOKING_STATUSES.map((s) => (
    <option key={s} value={s}>
      {t(`cal${s}` as TextKey)}
    </option>
  ));

  const run = async (fn: string, args: object) => {
    setBusy(true);
    setError('');
    const { error: e } = await supabase!.rpc(fn, args);
    setBusy(false);
    if (e) setError(e.message);
    else onSaved();
  };
  const save = () =>
    run('save_appointment', {
      p: {
        id: a?.id,
        start: wallText(f.date, toMin(f.time)),
        minutes: f.minutes,
        staff_id: f.staff || null,
        service: f.service,
        capacity: f.capacity,
        ...(a?.series_id ? { scope: f.scope } : {}),
        ...(!a && f.repeat
          ? {
              repeat: {
                every: f.every,
                days: f.days,
                ends: f.ends,
                ...(f.ends === 'count' ? { count: f.count } : {}),
                ...(f.ends === 'until' ? { until: f.until } : {}),
              },
            }
          : {}),
        // A booking left out of the list becomes CANCELLED.
        clients: f.clients.map((c) => ({ id: c.id, student_id: c.student_id, status: c.status, notes: c.notes })),
      },
    });

  const setClient = (i: number, patch: Partial<Booking>) =>
    set({ clients: f.clients.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const add = (hit: StudentHit) => {
    setAdding(false);
    if (f.clients.some((c) => c.student_id === hit.id)) return;
    const c: Booking = { student_id: hit.id, name: hit.full_name, phone: hit.phone_last4, status: 'BOOKED', notes: '' };
    set({ clients: group ? [...f.clients, c] : [c] });
  };

  return (
    <Modal title={title} width="w-[min(calc(100%-2rem),34rem)]" onClose={onClose}>
      <div className="mt-5 grid gap-4 border-t border-ink/10 pt-6">
        <div className={ROW}>
          <label htmlFor={`${id}-staff`} className={LABEL}>
            {t('calInstructor')}
          </label>
          <div className="flex items-center gap-3">
            <select
              id={`${id}-staff`}
              value={f.staff}
              onChange={(e) => set({ staff: e.target.value })}
              className={`${inputCls} font-medium`}
            >
              {instructors
                .filter((i) => i.active || i.user_id === a?.staff_id)
                .map((i) => (
                  <option key={i.user_id} value={i.user_id}>
                    {i.full_name}
                  </option>
                ))}
              <option value="">{t('calNoInstructor')}</option>
            </select>
            <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: dot }} />
          </div>
        </div>
        <div className={ROW}>
          <label htmlFor={`${id}-svc`} className={LABEL}>
            {t('calService')}
          </label>
          <select
            id={`${id}-svc`}
            value={f.service}
            onChange={(e) => {
              const s = services.find((x) => x.name === e.target.value);
              set({ service: e.target.value, ...(s ? { minutes: s.minutes, capacity: s.capacity } : {}) });
            }}
            className={`${inputCls} font-medium`}
          >
            {!svc && <option value={f.service}>{f.service}</option>}
            {services.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className={ROW}>
          <label htmlFor={`${id}-date`} className={LABEL}>
            {t('calDate')}
          </label>
          <input
            id={`${id}-date`}
            type="date"
            value={f.date}
            onChange={(e) => set({ date: e.target.value, ...(e.target.value ? { days: [weekday(e.target.value)] } : {}) })}
            className={inputCls}
          />
        </div>
        <div className={ROW}>
          <label htmlFor={`${id}-time`} className={LABEL}>
            {t('calTime')}
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`${id}-time`}
              type="time"
              step={300}
              value={f.time}
              onChange={(e) => set({ time: e.target.value })}
              className={`${inputCls} !w-40 font-medium tabular-nums`}
            />
            {f.time && (
              <span className="whitespace-nowrap text-[15px] tabular-nums">
                {t('calUntil', { time: ampm(toMin(f.time) + f.minutes) })}
              </span>
            )}
          </div>
        </div>
        <div className={ROW}>
          <label htmlFor={`${id}-dur`} className={LABEL}>
            {t('calDuration')}
          </label>
          <select
            id={`${id}-dur`}
            value={f.minutes}
            onChange={(e) => set({ minutes: Number(e.target.value) })}
            className={`${inputCls} font-medium`}
          >
            {durations.map((m) => (
              <option key={m} value={m}>
                {t('calMinutes', { n: String(m) })}
              </option>
            ))}
          </select>
        </div>
        {showCapacity && (
          <div className={ROW}>
            <label htmlFor={`${id}-cap`} className={LABEL}>
              {t('calCapacity')}
            </label>
            <input
              id={`${id}-cap`}
              type="number"
              min={1}
              max={50}
              value={f.capacity}
              onChange={(e) => set({ capacity: Number(e.target.value) })}
              className={`${inputCls} !w-24 font-medium tabular-nums`}
            />
          </div>
        )}
        {a ? (
          a.series_id && (
            <div className={ROW}>
              <span className={LABEL}>{t('calRepeats')}</span>
              <span className="text-[15px]">{t('calWeeklyOn', { day: dayText(a.day, lang, { weekday: 'long' }) })}</span>
            </div>
          )
        ) : (
          <>
            <div className={ROW}>
              <label htmlFor={`${id}-rep`} className={LABEL}>
                {t('calRepeats')}
              </label>
              <select
                id={`${id}-rep`}
                value={f.repeat ? 'weekly' : ''}
                onChange={(e) => set({ repeat: e.target.value === 'weekly' })}
                className={`${inputCls} font-medium`}
              >
                <option value="">{t('calNoRepeat')}</option>
                <option value="weekly">{t('calWeekly')}</option>
              </select>
            </div>
            {f.repeat && (
              <>
                <div className={ROW}>
                  <label htmlFor={`${id}-every`} className={LABEL}>
                    {t('calRepeatEvery')}
                  </label>
                  <select
                    id={`${id}-every`}
                    value={f.every}
                    onChange={(e) => set({ every: Number(e.target.value) })}
                    className={`${inputCls} font-medium`}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? t('calOneWeek') : t('calWeeksN', { n: String(n) })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={ROW}>
                  <span className={LABEL}>{t('calRepeatOn')}</span>
                  <div className="flex flex-wrap gap-x-[0.9rem] gap-y-2">
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                      <label key={i} className="inline-flex items-center gap-1.5 text-[15px]">
                        <input
                          type="checkbox"
                          checked={f.days.includes(i)}
                          onChange={(e) =>
                            set({ days: e.target.checked ? [...f.days, i].sort((x, y) => x - y) : f.days.filter((x) => x !== i) })
                          }
                          className={CHECK}
                        />
                        {/* 2026-10-11 is a Sunday */}
                        {dayText(addDays('2026-10-11', i), lang, { weekday: 'narrow' })}
                      </label>
                    ))}
                  </div>
                </div>
                <div className={`${ROW} sm:!items-start`}>
                  <span className={`${LABEL} sm:pt-1`}>{t('calEnds')}</span>
                  <div className="grid gap-3 text-[15px]">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" name={`${id}-ends`} checked={f.ends === 'never'} onChange={() => set({ ends: 'never' })} className={CHECK} />
                      {t('calNever')}
                    </label>
                    <label className="inline-flex flex-wrap items-center gap-2">
                      <input type="radio" name={`${id}-ends`} checked={f.ends === 'count'} onChange={() => set({ ends: 'count' })} className={CHECK} />
                      {t('calAfter')}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={f.count}
                        aria-label={t('calOccurrences')}
                        onChange={(e) => set({ ends: 'count', count: Number(e.target.value) })}
                        className={`${inputCls} !w-20 !py-1.5 tabular-nums`}
                      />
                      {t('calOccurrences')}
                    </label>
                    <label className="inline-flex flex-wrap items-center gap-2">
                      <input type="radio" name={`${id}-ends`} checked={f.ends === 'until'} onChange={() => set({ ends: 'until' })} className={CHECK} />
                      {t('calOnDate')}
                      <input
                        type="date"
                        value={f.until}
                        min={f.date}
                        aria-label={t('calOnDate')}
                        onChange={(e) => set({ ends: 'until', until: e.target.value })}
                        className={`${inputCls} !w-44 !py-1.5`}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {group ? (
        <div className="mt-6 grid gap-3 border-t border-ink/10 pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">
              {t('calClients')}{' '}
              <span className="tabular-nums text-mute">
                {f.clients.length}/{f.capacity}
              </span>
            </p>
            <Button variant="secondary" className="!min-h-9 !px-4" onClick={() => setAdding(true)}>
              <Plus {...ICON} size={16} />
              {t('calAddClient')}
            </Button>
          </div>
          {adding && <ClientSearch autoFocus onPick={add} />}
          {f.clients.length ? (
            <ul className="divide-y divide-ink/[0.06] text-sm">
              {f.clients.map((c, i) => (
                <li key={c.id ?? c.student_id ?? i} className="flex items-center gap-3 py-2.5">
                  <Initials name={c.name} className="h-8 w-8 text-[11px]" />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <select
                    aria-label={t('status')}
                    value={c.status}
                    onChange={(e) => setClient(i, { status: e.target.value as BookingStatus })}
                    className={`${inputCls} !w-auto !px-3 !py-1.5`}
                  >
                    {statusOptions}
                  </select>
                  <button
                    type="button"
                    aria-label={t('calRemove', { name: c.name })}
                    onClick={() => set({ clients: f.clients.filter((_, j) => j !== i) })}
                    className="rounded-full p-1.5 text-mute hover:bg-ink/[0.05]"
                  >
                    <X {...ICON} size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">{t('calNoClients')}</p>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 border-t border-ink/10 pt-6">
          <div className={`${ROW} sm:!items-start`}>
            <span className={`${LABEL} sm:pt-2`}>{t('calClient')}</span>
            {client ? (
              <div className="flex min-w-0 items-center gap-3">
                <Initials name={client.name} className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{client.name}</p>
                  {client.phone && <p className="text-xs tabular-nums text-mute">···{client.phone.replace(/\D/g, '').slice(-4)}</p>}
                </div>
                <button type="button" onClick={() => set({ clients: [] })} className="text-sm font-medium text-sage-deep hover:underline">
                  {t('calChangeClient')}
                </button>
              </div>
            ) : (
              <ClientSearch onPick={add} />
            )}
          </div>
          {client && (
            <>
              <div className={ROW}>
                <label htmlFor={`${id}-status`} className={LABEL}>
                  {t('status')}
                </label>
                <select
                  id={`${id}-status`}
                  value={client.status}
                  onChange={(e) => setClient(0, { status: e.target.value as BookingStatus })}
                  className={inputCls}
                >
                  {statusOptions}
                </select>
              </div>
              <div className={`${ROW} sm:!items-start`}>
                <label htmlFor={`${id}-notes`} className={`${LABEL} sm:pt-2.5`}>
                  {t('calNotes')}
                </label>
                <textarea
                  id={`${id}-notes`}
                  rows={2}
                  value={client.notes}
                  placeholder={t('calNotesHint')}
                  onChange={(e) => setClient(0, { notes: e.target.value })}
                  className={`${inputCls} resize-y`}
                />
              </div>
            </>
          )}
        </div>
      )}

      {a?.series_id && (
        <div className="mt-6 border-t border-ink/10 pt-6">
          <ScopeRow value={f.scope} onChange={(scope) => set({ scope })} />
        </div>
      )}
      {error && (
        <div className="mt-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {confirming ? (
        <div className="mt-7 grid gap-4 border-t border-ink/10 pt-6">
          <p className="text-[15px]">{t('calCancelAsk')}</p>
          <div className="flex flex-wrap justify-end gap-3">
            {/* autoFocus also scrolls the question into view */}
            <Button variant="secondary" autoFocus onClick={() => setConfirming(false)}>
              {t('calKeep')}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void run('cancel_appointment', { p_id: a!.id, p_scope: f.scope })}>
              {busy ? t('saving') : cancelLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-6">
          {a ? (
            <button type="button" onClick={() => setConfirming(true)} className="text-[15px] font-medium text-sage-deep hover:underline">
              {cancelLabel}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <Button variant="secondary" className="!px-7" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button className="!px-8" disabled={busy || !valid} onClick={() => void save()}>
              {busy ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Find an existing client (new clients are added on the Clients screen). */
function ClientSearch({ onPick, autoFocus = false }: { onPick: (hit: StudentHit) => void; autoFocus?: boolean }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let stale = false;
    const timer = window.setTimeout(() => {
      supabase!.rpc('schedule_search_clients', { p_query: q }).then(({ data, error }) => {
        if (stale) return;
        setFailed(Boolean(error));
        setHits(error ? [] : (data as StudentHit[]));
      });
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [q]);

  return (
    <div className="grid min-w-0 gap-2">
      <label className="relative block">
        <span className="sr-only">{t('searchStudent')}</span>
        <Search {...ICON} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
        <input
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={t('searchStudent')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHits(null);
          }}
          className={`${inputCls} pl-11`}
        />
      </label>
      {q.length < 2 ? null : failed ? (
        <Notice tone="error">{t('somethingWrong')}</Notice>
      ) : !hits ? (
        <Skeleton className="h-11 w-full" />
      ) : hits.length === 0 ? (
        <p className="text-sm text-mute">{t('noStudentFound')}</p>
      ) : (
        <ul className="grid max-h-56 gap-0.5 overflow-y-auto">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onPick(hit)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              >
                <Initials name={hit.full_name} className="h-8 w-8 text-[11px]" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{hit.full_name}</span>
                {hit.phone_last4 && <span className="shrink-0 text-xs tabular-nums text-mute">···{hit.phone_last4}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
