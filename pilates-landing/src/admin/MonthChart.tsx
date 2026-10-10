// Revenue vs expenses per month: paired columns on one baseline, one axis.
// Plain HTML so labels stay readable at any width; each month has a hover /
// screen-reader summary, and the Reports months table is the table view.
import type { MonthRow } from './finance';
import { formatMonth } from './expenses';
import { useT } from './i18n';
import { formatCents } from './payments';

const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** A clean axis top: 1, 2, 2.5 or 5 × a power of ten, at or above max. */
function niceMax(max: number) {
  if (max <= 0) return 100_00;
  const p = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= max) ?? 10) * p;
}

export default function MonthChart({ months }: { months: MonthRow[] }) {
  const { t, lang } = useT();
  const top = niceMax(Math.max(...months.flatMap((m) => [m.net, m.expenses])));
  const pct = (cents: number) => `${(Math.max(cents, 0) / top) * 100}%`;
  const short = (month: string) =>
    new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { timeZone: 'UTC', month: 'short' }).format(new Date(`${month}T12:00:00Z`));

  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mute">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-sage" />
          {t('netRevenue')}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-clay/80" />
          {t('operatingExpenses')}
        </span>
      </figcaption>
      <div className="relative flex">
        <div aria-hidden="true" className="flex h-52 w-12 shrink-0 flex-col justify-between pr-2 text-right text-xs tabular-nums text-mute">
          <span className="-translate-y-1/2">{compact.format(top / 100)}</span>
          <span className="-translate-y-1/2">{compact.format(top / 200)}</span>
          <span className="translate-y-1/2">$0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-52">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-ink/10" />
            <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-ink/10" />
            <ul className="absolute inset-0 flex items-end border-b border-ink/15">
              {months.map((m, i) => (
                <li
                  key={m.month}
                  tabIndex={0}
                  className="group flex h-full min-w-0 flex-1 items-end justify-center gap-[3px] rounded-t-lg px-0.5 outline-none hover:bg-ink/[0.035] focus-visible:bg-ink/[0.035]"
                >
                  <span className="sr-only">
                    {formatMonth(m.month, lang)}: {t('netRevenue')} {formatCents(m.net)}, {t('operatingExpenses')} {formatCents(m.expenses)}
                  </span>
                  <span aria-hidden="true" className="w-full max-w-3.5 rounded-t-[4px] bg-sage" style={{ height: pct(m.net) }} />
                  <span aria-hidden="true" className="w-full max-w-3.5 rounded-t-[4px] bg-clay/80" style={{ height: pct(m.expenses) }} />
                  {/* Hover / focus tooltip (reference: Company dashboard). Centered on the month, clamped so it never leaves the chart. */}
                  <span
                    aria-hidden="true"
                    style={{ left: `clamp(0px, calc(${((i + 0.5) / months.length) * 100}% - 6.5rem), calc(100% - 13rem))` }}
                    className={`pointer-events-none invisible absolute bottom-full z-10 mb-2 w-52 rounded-xl bg-paper p-3 text-left text-xs opacity-0 shadow-pop ring-1 ring-ink/10 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100`}
                  >
                    <span className="mb-2 block font-medium text-ink">{formatMonth(m.month, lang)}</span>
                    {(
                      [
                        ['bg-sage', t('netRevenue'), m.net],
                        ['bg-clay/80', t('operatingExpenses'), m.expenses],
                      ] as const
                    ).map(([dot, label, cents]) => (
                      <span key={label} className="flex items-center gap-2 py-0.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                        <span className="min-w-0 flex-1 truncate text-mute">{label}</span>
                        <span className="font-medium tabular-nums text-ink">{formatCents(cents)}</span>
                      </span>
                    ))}
                    <span className="mt-2 flex items-center gap-2 border-t border-ink/10 pt-2">
                      <span className="min-w-0 flex-1 truncate text-mute">{t('estProfit')}</span>
                      <span className={`font-semibold tabular-nums ${m.profit < 0 ? 'text-red-700' : 'text-ink'}`}>{formatCents(m.profit)}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden="true" className="mt-2 flex text-xs text-mute">
            {months.map((m, i) => (
              <span key={m.month} className={`min-w-0 flex-1 truncate text-center ${i % 2 && months.length > 6 ? 'max-sm:invisible' : ''}`}>
                {short(m.month)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
