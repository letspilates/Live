import { useEffect } from 'react';
import Eyebrow from './Eyebrow';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';

const HEALCODE_SRC = 'https://widgets.mindbodyonline.com/javascripts/healcode.js';

/**
 * Live Mindbody class schedule, replacing the old static pricing section.
 * The healcode script is injected once on mount; it then upgrades the
 * <healcode-widget> element below into the interactive schedule.
 */
export default function ScheduleSection() {
  const { t } = useLang();
  const s = t.schedule;

  useEffect(() => {
    // Guard against double-append (StrictMode remounts, language re-renders).
    if (document.querySelector(`script[src="${HEALCODE_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = HEALCODE_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <section id="schedule" className="bg-sand py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mx-auto max-w-2xl text-center">
          <Eyebrow className="mx-auto">{s.eyebrow}</Eyebrow>
          <h2 className="mt-6 break-keep font-display text-4xl font-semibold leading-[1.12] tracking-tightest text-ink md:text-5xl">
            <Heading parts={s.title} accent={s.titleAccentIndex} />
          </h2>
          <p className="mt-6 break-keep text-base leading-relaxed text-mute">{s.body}</p>
        </div>

        {/* Widget shell — double-bezel card so the third-party UI sits on-brand */}
        <div
          className="reveal mx-auto mt-14 max-w-5xl rounded-[2rem] bg-paper/60 p-1.5 ring-1 ring-ink/10 shadow-[0_30px_60px_-25px_rgba(28,26,22,0.25)]"
          style={{ ['--reveal-delay' as string]: '120ms' }}
        >
          <div className="min-h-[34rem] overflow-hidden rounded-[1.6rem] bg-paper p-3 sm:p-6">
            <healcode-widget
              data-type="schedules"
              data-widget-partner="object"
              data-widget-id="ed201547cc85"
              data-widget-version="1"
            />
          </div>
        </div>

        <p className="reveal mt-6 text-center text-xs text-mute" style={{ ['--reveal-delay' as string]: '200ms' }}>
          {s.note}
        </p>
      </div>
    </section>
  );
}
