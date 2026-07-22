import { useEffect, useRef } from 'react';
import Eyebrow from './Eyebrow';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';

const HEALCODE_SRC = 'https://widgets.mindbodyonline.com/javascripts/healcode.js';
const WIDGET_HTML =
  '<healcode-widget data-type="schedules" data-widget-partner="object" data-widget-id="ed201547cc85" data-widget-version="1"></healcode-widget>';

/**
 * Live Mindbody (Healcode) class schedule.
 *
 * The healcode script rewrites the <healcode-widget> element into an iframe —
 * outside React's knowledge. To stop React reconciliation (e.g. on language
 * toggle) from wiping that iframe, the widget is injected imperatively into a
 * ref container that React never renders children into. The script is then
 * (re)appended so it scans and upgrades the freshly-inserted element.
 */
export default function ScheduleSection() {
  const { t } = useLang();
  const s = t.schedule;
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    // Insert the widget element imperatively (only if not already present).
    if (!holder.querySelector('healcode-widget, iframe')) {
      holder.innerHTML = WIDGET_HTML;
    }

    // (Re)load the healcode script so it re-scans and upgrades the widget.
    const existing = document.getElementById('healcode-js');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'healcode-js';
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
        <div className="mx-auto mt-14 max-w-5xl rounded-[2rem] bg-paper/60 p-1.5 ring-1 ring-ink/10 shadow-[0_30px_60px_-25px_rgba(28,26,22,0.25)]">
          <div className="min-h-[34rem] overflow-hidden rounded-[1.6rem] bg-paper p-3 sm:p-6">
            {/* React manages only this empty container; healcode fills it. */}
            <div ref={holderRef} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-mute">{s.note}</p>
      </div>
    </section>
  );
}
