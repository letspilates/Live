import { IMG } from '../media';
import Eyebrow from './Eyebrow';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';

export default function ProgramsSection() {
  const { t } = useLang();
  const p = t.programs;

  return (
    <section id="programs" className="bg-sand py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Eyebrow>{p.eyebrow}</Eyebrow>
            <h2 className="mt-6 max-w-[22ch] break-keep font-display text-4xl font-semibold leading-[1.12] tracking-tightest text-ink md:text-5xl">
              <Heading parts={p.title} accent={p.titleAccentIndex} />
            </h2>
          </div>
          <p className="max-w-[36ch] break-keep text-base leading-relaxed text-mute">{p.body}</p>
        </div>

        {/* Asymmetric bento — varied heights */}
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-6">
          {/* Private — tall feature */}
          <article className="reveal group relative overflow-hidden rounded-[1.8rem] ring-1 ring-ink/10 md:col-span-4 md:row-span-2">
            <img
              src={IMG.private}
              alt="Supported footwork with the feet cradled in straps during a private session"
              className="h-72 w-full object-cover object-top transition-transform duration-700 ease-smooth group-hover:scale-[1.04] md:h-full md:min-h-[28rem]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-7">
              <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cream backdrop-blur-md">
                {p.items.private.badge}
              </span>
              <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-cream md:text-3xl">
                {p.items.private.title}
              </h3>
              <p className="mt-2 max-w-[44ch] break-keep text-sm leading-relaxed text-cream/85">
                {p.items.private.desc}
              </p>
              <p className="mt-4 font-display text-sm text-cream/70">{p.items.private.meta}</p>
            </div>
          </article>

          {/* Duet — image card */}
          <article className="reveal group relative overflow-hidden rounded-[1.8rem] ring-1 ring-ink/10 md:col-span-2">
            <img
              src={IMG.reformer}
              alt="Merrithew Reformer detail in soft studio light"
              className="h-64 w-full object-cover transition-transform duration-700 ease-smooth group-hover:scale-[1.04] md:h-full md:min-h-[14rem]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cream backdrop-blur-md">
                {p.items.duet.badge}
              </span>
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-cream">
                {p.items.duet.title}
              </h3>
              <p className="mt-2 break-keep text-sm leading-relaxed text-cream/85">
                {p.items.duet.desc}
              </p>
              <p className="mt-3 font-display text-sm text-cream/70">{p.items.duet.meta}</p>
            </div>
          </article>

          {/* Pilates Group — Cadillac image card */}
          <article className="reveal group relative overflow-hidden rounded-[1.8rem] ring-1 ring-ink/10 md:col-span-2">
            <img
              src={IMG.pilatesGroup}
              alt="A group class on reformers, legs lifted in straps in warm window light"
              className="h-64 w-full object-cover transition-transform duration-700 ease-smooth group-hover:scale-[1.04] md:h-full md:min-h-[14rem]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cream backdrop-blur-md">
                {p.items.pilatesGroup.badge}
              </span>
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-cream">
                {p.items.pilatesGroup.title}
              </h3>
              <p className="mt-2 break-keep text-sm leading-relaxed text-cream/85">
                {p.items.pilatesGroup.desc}
              </p>
            </div>
          </article>

          {/* GYROTONIC® Group — wide split */}
          <article className="reveal group relative overflow-hidden rounded-[1.8rem] ring-1 ring-ink/10 md:col-span-6">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <img
                src={IMG.gyrotonic}
                alt="A member rotating the Gyrotonic® tower handles, working the spine in spirals"
                className="h-56 w-full object-cover transition-transform duration-700 ease-smooth group-hover:scale-[1.04] md:h-full"
                loading="lazy"
              />
              <div className="flex flex-col items-start justify-center bg-ink p-7 text-cream md:p-10">
                <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cream backdrop-blur-md">
                  {p.items.gyroGroup.badge}
                </span>
                <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  {p.items.gyroGroup.title}
                </h3>
                <p className="mt-2 max-w-[50ch] break-keep text-sm leading-relaxed text-cream/80">
                  {p.items.gyroGroup.desc}
                </p>
                <p className="mt-5 font-display text-sm text-cream/65">{p.items.gyroGroup.meta}</p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
