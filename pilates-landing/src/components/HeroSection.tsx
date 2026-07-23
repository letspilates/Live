import { IMG } from '../media';
import Heading from './Heading';
import { useLang } from '../i18n/LanguageContext';
import useParallax from '../hooks/useParallax';

export default function HeroSection() {
  const { t } = useLang();
  const h = t.hero;
  const mediaRef = useParallax({ speed: 0.16, maxScale: 1.14 });

  return (
    <section id="top" className="relative min-h-[100dvh] overflow-hidden bg-ink">
      {/* Parallax media layer — taller than the frame so it can drift freely */}
      <div ref={mediaRef} className="absolute inset-0 will-change-transform">
        <img
          src={IMG.hero}
          alt="A cinematic montage of Gyrotonic® tower work and a Reformer side-stretch silhouette, backlit against sheer curtains"
          className="absolute left-0 top-[-20%] h-[140%] w-full object-cover object-[90%_30%] md:object-center"
          loading="eager"
          fetchPriority="high"
        />
      </div>

      {/* Legibility overlays: left-weighted darkness for text, warm fade into the body */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/55 to-ink/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/50 via-transparent to-ink/40" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-cream to-transparent" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-7xl flex-col justify-center px-4 pb-28 pt-32 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h1
            className="reveal break-keep font-display text-5xl font-semibold leading-[1.05] tracking-tightest text-cream drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)] sm:text-6xl lg:text-7xl"
            style={{ ['--reveal-delay' as string]: '80ms' }}
          >
            <Heading parts={h.title} accent={h.titleAccentIndex} />
          </h1>

          <p
            className="reveal mt-7 max-w-[46ch] break-keep text-base leading-relaxed text-cream/80 sm:text-lg"
            style={{ ['--reveal-delay' as string]: '160ms' }}
          >
            {h.body}
          </p>

          <div
            className="reveal mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
            style={{ ['--reveal-delay' as string]: '240ms' }}
          >
            <a
              href="#schedule"
              className="group flex items-center gap-3 rounded-full bg-cream py-2.5 pl-7 pr-2.5 text-base font-medium text-ink transition-transform duration-500 ease-smooth hover:scale-[1.03]"
            >
              {h.primaryCta}
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage text-cream transition-transform duration-500 ease-smooth group-hover:translate-x-0.5">
                →
              </span>
            </a>
            <a
              href="#programs"
              className="rounded-full border border-cream/30 px-7 py-3 text-base font-medium text-cream transition-colors duration-300 ease-smooth hover:bg-cream/10"
            >
              {h.secondaryCta}
            </a>
            <a
              href="#register"
              onClick={(e) => {
                // 같은 해시를 다시 눌러도 폼이 열리도록 hashchange를 보장
                e.preventDefault();
                if (window.location.hash !== '#register') {
                  window.location.hash = 'register';
                } else {
                  window.dispatchEvent(new HashChangeEvent('hashchange'));
                }
              }}
              className="rounded-full border border-cream/30 px-7 py-3 text-base font-medium text-cream transition-colors duration-300 ease-smooth hover:bg-cream/10"
            >
              {h.registerCta}
            </a>
          </div>

          <dl
            className="reveal mt-14 grid max-w-xl grid-cols-3 gap-6 border-t border-cream/20 pt-7"
            style={{ ['--reveal-delay' as string]: '320ms' }}
          >
            {h.stats.map((s) => (
              <div key={s.label}>
                <dt className="font-display text-lg font-semibold tracking-tight text-cream sm:text-xl">
                  {s.value}
                </dt>
                <dd className="mt-1.5 break-keep text-[11px] uppercase tracking-[0.14em] text-cream/60">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 md:block">
        <span className="flex h-9 w-5 items-start justify-center rounded-full border border-cream/40 p-1">
          <span className="h-2 w-1 animate-bounce rounded-full bg-cream/70" />
        </span>
      </div>
    </section>
  );
}
