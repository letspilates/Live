import { IMG } from '../media';
import Eyebrow from './Eyebrow';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';

const marks = [
  'REFORMER',
  '·',
  'GYROTONIC',
  '·',
  'GYROKINESIS',
  '·',
  'MAT',
  '·',
  'PRENATAL',
  '·',
  'REHAB',
];

export default function AboutSection() {
  const { t } = useLang();
  const a = t.about;

  return (
    <section id="about" className="relative overflow-hidden bg-cream py-24 md:py-32 lg:py-40">
      {/* auto-scrolling discipline strip */}
      <div className="reveal mb-20 overflow-hidden border-y border-ink/10 py-5">
        <div className="marquee-track">
          {[...marks, ...marks].map((m, i) => (
            <span
              key={i}
              className={`mx-6 shrink-0 font-display text-lg font-medium tracking-tight ${
                m === '·' ? 'text-sage' : 'text-ink/35'
              }`}
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-end gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="reveal lg:col-span-7">
          <Eyebrow>{a.eyebrow}</Eyebrow>
          <h2 className="mt-6 max-w-[20ch] break-keep font-display text-4xl font-semibold leading-[1.12] tracking-tightest text-ink md:text-5xl">
            <Heading parts={a.title} accent={a.titleAccentIndex} />
          </h2>
          {a.body.split('\n\n').map((para, i) => (
            <p
              key={i}
              className={`max-w-[58ch] break-keep text-base leading-relaxed text-mute md:text-lg ${
                i === 0 ? 'mt-7' : 'mt-4'
              }`}
            >
              {para}
            </p>
          ))}
        </div>

        <div className="reveal lg:col-span-5" style={{ ['--reveal-delay' as string]: '120ms' }}>
          <figure className="relative overflow-hidden rounded-[1.8rem] ring-1 ring-ink/10">
            <img
              src={IMG.space}
              alt="A member training on the Gyrotonic tower in a brick-and-wood studio"
              className="aspect-[16/11] w-full object-cover"
              loading="lazy"
            />
            <figcaption className="absolute bottom-3 left-3 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-xs font-medium text-cream backdrop-blur-md">
              {a.caption}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
