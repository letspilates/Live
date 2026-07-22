import Eyebrow from './Eyebrow';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';

/**
 * Collapsed accordion FAQ. Uses native <details>/<summary> so every answer
 * lives in the DOM and is user-accessible — visible-content-compliant for
 * search engines, while staying visually quiet on the page.
 */
export default function FaqSection() {
  const { t } = useLang();
  const f = t.faq;

  return (
    <section id="faq" className="bg-cream py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="reveal text-center">
          <Eyebrow className="mx-auto">{f.eyebrow}</Eyebrow>
          <h2 className="mt-6 break-keep font-display text-4xl font-semibold leading-[1.12] tracking-tightest text-ink md:text-5xl">
            <Heading parts={f.title} accent={f.titleAccentIndex} />
          </h2>
        </div>

        <div
          className="reveal mt-12 border-t border-ink/10"
          style={{ ['--reveal-delay' as string]: '100ms' }}
        >
          {f.items.map((item) => (
            <details key={item.q} className="group border-b border-ink/10">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 [&::-webkit-details-marker]:hidden">
                <h3 className="break-keep font-display text-lg font-medium text-ink">
                  {item.q}
                </h3>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink/15 text-lg text-mute transition-transform duration-300 ease-smooth group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="max-w-[62ch] break-keep pb-6 text-[15px] leading-relaxed text-mute">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
