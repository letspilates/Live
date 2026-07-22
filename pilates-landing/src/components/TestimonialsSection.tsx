import Eyebrow from './Eyebrow';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';

// Stable order + masonry spans; review text comes from the dictionary.
const layout = [
  { key: 'r1', span: 'sm:row-span-2' },
  { key: 'r2', span: '' },
  { key: 'r3', span: '' },
  { key: 'r4', span: 'sm:row-span-2' },
  { key: 'r5', span: '' },
] as const;

export default function TestimonialsSection() {
  const { t } = useLang();
  const s = t.testimonials;

  return (
    <section className="bg-cream py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <Eyebrow>{s.eyebrow}</Eyebrow>
            <h2 className="mt-6 break-keep font-display text-4xl font-semibold leading-[1.12] tracking-tightest text-ink md:text-5xl">
              <Heading parts={s.title} />
            </h2>
          </div>
          <div className="flex items-end gap-3">
            <span className="font-display text-5xl font-semibold tracking-tight text-sage">4.87</span>
            <span className="mb-1 break-keep text-sm text-mute">
              {s.ratingLabel[0]}
              <br />
              {s.ratingLabel[1]}
            </span>
          </div>
        </div>

        {/* masonry-ish staggered grid */}
        <div className="mt-14 grid auto-rows-[minmax(0,auto)] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {layout.map((item, i) => {
            const r = s.reviews[item.key];
            return (
              <figure
                key={item.key}
                className={`reveal flex flex-col justify-between rounded-[1.6rem] border border-ink/10 bg-paper p-7 ${item.span}`}
                style={{ ['--reveal-delay' as string]: `${(i % 3) * 80}ms` }}
              >
                <blockquote className="break-keep text-[15px] leading-relaxed text-ink/90">
                  “{r.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage/15 font-display text-sm font-semibold text-sage">
                    {r.name.slice(0, 1)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{r.name}</p>
                    <p className="break-keep text-xs text-mute">{r.meta}</p>
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
