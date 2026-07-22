import Eyebrow from './Eyebrow';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';

export default function CtaSection() {
  const { t } = useLang();
  const c = t.cta;

  return (
    <section id="contact" className="bg-cream px-4 pb-24 sm:px-6 lg:px-8">
      <div className="reveal relative mx-auto max-w-7xl overflow-hidden rounded-[2.4rem] bg-ink px-6 py-20 text-center md:px-10 md:py-28">
        {/* ambient sage glow */}
        <div className="float-slow pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full bg-sage/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-clay/15 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-2xl">
          <Eyebrow className="mx-auto border-white/15 bg-white/5 text-sage-soft">
            {c.eyebrow}
          </Eyebrow>
          <h2 className="mt-6 break-keep font-display text-4xl font-semibold leading-[1.1] tracking-tightest text-cream md:text-6xl">
            <Heading parts={c.title} />
          </h2>
          <p className="mt-6 break-keep text-base leading-relaxed text-cream/75 md:text-lg">
            {c.body}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#schedule"
              className="group flex items-center gap-3 rounded-full bg-cream py-3 pl-7 pr-3 text-base font-medium text-ink transition-transform duration-500 ease-smooth hover:scale-[1.03]"
            >
              {c.primary}
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage text-cream transition-transform duration-500 ease-smooth group-hover:translate-x-0.5">
                →
              </span>
            </a>
            <a
              href="#instructors"
              className="rounded-full border border-cream/25 px-7 py-3.5 text-base font-medium text-cream transition-colors duration-300 ease-smooth hover:bg-cream/10"
            >
              {c.secondary}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
