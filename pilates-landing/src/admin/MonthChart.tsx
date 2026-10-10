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
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-sage" />
          {t('netRevenue')}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-clay" />
          {t('operatingExpenses')}
        </span>
      </figcaption>
      <div className="relative flex">
        <div aria-hidden="true" className="flex h-44 w-12 shrink-0 flex-col justify-between pr-2 text-right text-xs tabular-nums text-mute">
          <span className="-translate-y-1/2">{compact.format(top / 100)}</span>
          <span className="-translate-y-1/2">{compact.format(top / 200)}</span>
          <span className="translate-y-1/2">$0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-44">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-ink/10" />
            <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-ink/10" />
            <ul className="absolute inset-0 flex items-end border-b border-ink/20">
              {months.map((m) => (
                <li
                  key={m.month}
                  className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-t-md px-0.5 hover:bg-ink/[0.03]"
                  title={`${formatMonth(m.month, lang)}\n${t('netRevenue')} ${formatCents(m.net)}\n${t('operatingExpenses')} ${formatCents(m.expenses)}\n${t('estProfit')} ${formatCents(m.profit)}`}
                >
                  <span className="sr-only">
                    {formatMonth(m.month, lang)}: {t('netRevenue')} {formatCents(m.net)}, {t('operatingExpenses')} {formatCents(m.expenses)}
                  </span>
                  <span aria-hidden="true" className="w-full max-w-3 rounded-t bg-sage" style={{ height: pct(m.net) }} />
                  <span aria-hidden="true" className="w-full max-w-3 rounded-t bg-clay" style={{ height: pct(m.expenses) }} />
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
