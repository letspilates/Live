import { IMG } from '../media';
import Eyebrow from './Eyebrow';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';

export default function ApproachSection() {
  const { t } = useLang();
  const a = t.approach;

  return (
    <section id="approach" className="bg-cream py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-20">
        {/* image — alternating side */}
        <div className="reveal order-1 lg:order-2">
          <div className="relative">
            <div className="float-slow pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-sage/20 blur-2xl" />
            <figure className="relative overflow-hidden rounded-[2rem] ring-1 ring-ink/10">
              <img
                src={IMG.approach}
                alt="A group training session at the Gyrotonic pulley towers, kneeling in unison"
                className="aspect-[4/5] w-full object-cover"
                loading="lazy"
              />
            </figure>
            {/* floating metric card */}
            <div className="absolute -bottom-6 -left-4 w-44 rounded-2xl border border-ink/10 bg-paper/90 p-5 shadow-[0_20px_40px_-15px_rgba(28,26,22,0.25)] backdrop-blur-md sm:-left-8">
              <p className="font-display text-3xl font-semibold tracking-tight text-ink">
                {a.metricValue}
              </p>
              <p className="mt-1 break-keep text-xs text-mute">{a.metricLabel}</p>
            </div>
          </div>
        </div>

        {/* text */}
        <div className="order-2 lg:order-1">
          <div className="reveal">
            <Eyebrow>{a.eyebrow}</Eyebrow>
            <h2 className="mt-6 max-w-[18ch] break-keep font-display text-4xl font-semibold leading-[1.12] tracking-tightest text-ink md:text-5xl">
              <Heading parts={a.title} accent={a.titleAccentIndex} />
            </h2>
          </div>

          <div className="mt-10 space-y-px">
            {a.steps.map((step, i) => (
              <div
                key={step.no}
                className="reveal flex gap-6 border-t border-ink/10 py-7"
                style={{ ['--reveal-delay' as string]: `${i * 90}ms` }}
              >
                <span className="font-display text-sm font-semibold text-sage">{step.no}</span>
                <div>
                  <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-[48ch] break-keep text-[15px] leading-relaxed text-mute">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hosted-here banner + course inquiries */}
      <div className="reveal relative mt-16 overflow-hidden rounded-[2rem] bg-sage text-cream ring-1 ring-sage-deep/30">
        {/* ambient glow + oversized watermark */}
        <div className="float-slow pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-cream/15 blur-3xl" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 right-6 select-none font-display text-[7rem] font-semibold leading-none text-cream/[0.07] md:text-[9rem]"
        >
          Level 1
        </span>

        <div className="relative grid grid-cols-1 items-center gap-8 p-8 md:grid-cols-[1.6fr_1fr] md:p-12">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cream/90">
              <span className="h-1.5 w-1.5 rounded-full bg-cream" />
              {a.note.badge}
            </span>
            <h3 className="mt-5 break-keep font-display text-3xl font-semibold leading-tight tracking-tightest md:text-4xl">
              {a.note.lead}
            </h3>
            <p className="mt-4 max-w-[58ch] break-keep text-sm leading-relaxed text-cream/85 md:text-base">
              {a.note.sub}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 md:items-end">
            <a
              href="https://www.gyrotonic.com/teacher-training/gyrotonic-level-1/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-full bg-cream py-2.5 pl-6 pr-2.5 text-sm font-medium text-ink transition-transform duration-500 ease-smooth hover:scale-[1.03]"
            >
              {a.note.cta}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-cream transition-transform duration-500 ease-smooth group-hover:translate-x-0.5">
                →
              </span>
            </a>
            <a
              href="https://www.gyrotonic.com/teacher-training/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 text-sm text-cream/75 underline decoration-cream/30 underline-offset-4 transition-colors hover:text-cream"
            >
              {a.note.linkLabel} · gyrotonic.com →
            </a>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
