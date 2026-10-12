// A length in minutes: type it, or step it with − / + (5 minutes); from an hour up it also
// reads "(1 hr 20 min)". Used for appointment and service lengths.
import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useT } from './i18n';
import { inputCls } from './ui';

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
const STEP_BUTTON =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-ink/[0.12] transition-colors hover:bg-sand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 disabled:pointer-events-none disabled:opacity-40';

export default function MinutesInput({
  id,
  value,
  onChange,
  min = 5,
  max = 720,
  step = 5,
}: {
  id?: string;
  value: number;
  onChange: (minutes: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const { t } = useT();
  // What is typed, kept apart from value so "8" on the way to "80" isn't corrected mid-typing.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const h = Math.floor(value / 60);
  const m = value % 60;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-label={t('minutesLess', { n: String(step) })}
        disabled={value <= min}
        onClick={() => onChange(clamp(Math.ceil(value / step) * step - step))}
        className={STEP_BUTTON}
      >
        <Minus {...ICON} />
      </button>
      <span className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(Math.round(n));
          }}
          onBlur={() => {
            if (draft !== null && draft !== '' && Number.isFinite(Number(draft))) onChange(clamp(Number(draft)));
            setDraft(null);
          }}
          className={`${inputCls} !w-[6.5rem] !pr-11 text-center font-medium tabular-nums [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        />
        <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-mute">
          {t('minutesUnit')}
        </span>
      </span>
      <button
        type="button"
        aria-label={t('minutesMore', { n: String(step) })}
        disabled={value >= max}
        onClick={() => onChange(clamp(Math.floor(value / step) * step + step))}
        className={STEP_BUTTON}
      >
        <Plus {...ICON} />
      </button>
      {h > 0 && (
        <span className="whitespace-nowrap text-[15px] tabular-nums text-mute">
          ({m ? t('hoursMinutes', { h: String(h), m: String(m) }) : t('hoursOnly', { h: String(h) })})
        </span>
      )}
    </div>
  );
}
