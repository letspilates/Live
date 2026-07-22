import Eyebrow from './Eyebrow';
import Heading from './Heading';
import LogoIcon from './LogoIcon';
import { useLang } from '../i18n/LanguageContext';

// Stable order; all copy comes from the translation dictionary.
// Photos are intentionally hidden for now — cards are typographic.
const roster = [
  { key: 'sunnie', featured: true },
  { key: 'eunice', featured: false },
  { key: 'soo', featured: false },
  { key: 'haley', featured: false },
] as const;

export default function InstructorsSection() {
  const { t } = useLang();
  const s = t.instructors;

  return (
    <section id="instructors" className="bg-sand py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal max-w-2xl">
          <Eyebrow>{s.eyebrow}</Eyebrow>
          <h2 className="mt-6 break-keep font-display text-4xl font-semibold leading-[1.12] tracking-tightest text-ink md:text-5xl">
            <Heading parts={s.title} accent={s.titleAccentIndex} />
          </h2>
          <p className="mt-6 max-w-[52ch] break-keep text-base leading-relaxed text-mute">
            {s.body}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {roster.map((item, i) => {
            const person = s.people[item.key];
            const featured = item.featured;
            return (
              <article
                key={item.key}
                className={`reveal relative overflow-hidden rounded-[1.8rem] p-7 md:p-8 ${
                  featured
                    ? 'bg-ink text-cream ring-1 ring-ink'
                    : 'bg-paper text-ink ring-1 ring-ink/10'
                }`}
                style={{ ['--reveal-delay' as string]: `${i * 80}ms` }}
              >
                {/* corner watermark */}
                <LogoIcon
                  className={`absolute -right-4 -top-4 h-24 w-24 ${
                    featured ? 'text-cream/10' : 'text-sage/10'
                  }`}
                />

                <div className="flex items-center gap-4">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold ${
                      featured ? 'bg-sage text-cream' : 'bg-sage/15 text-sage'
                    }`}
                  >
                    {person.name.slice(0, 1)}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-semibold tracking-tight">
                      {person.name}
                    </h3>
                    <p
                      className={`mt-0.5 break-keep text-sm ${
                        featured ? 'text-sage-soft' : 'text-sage'
                      }`}
                    >
                      {person.role}
                    </p>
                  </div>
                </div>

                <ul className="mt-6 flex flex-wrap gap-2">
                  {person.certs.map((cert) => (
                    <li
                      key={cert}
                      className={`rounded-full border px-3 py-1.5 text-xs ${
                        featured
                          ? 'border-cream/20 bg-cream/5 text-cream/85'
                          : 'border-ink/10 bg-cream text-ink/75'
                      }`}
                    >
                      {cert}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
