import { useEffect, useState } from 'react';
import { useLang } from '../i18n/LanguageContext';

export default function Navbar() {
  const { t, lang, setLang } = useLang();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // At the very top we sit over the dark cinematic hero → use light treatment.
  const dark = !scrolled;

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
      <nav
        className={`mx-auto flex max-w-7xl items-center justify-between rounded-full px-3 py-2.5 transition-all duration-500 ease-smooth ${
          scrolled
            ? 'border border-ink/10 bg-cream/80 shadow-[0_8px_30px_rgba(28,26,22,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-xl'
            : 'border border-transparent bg-transparent'
        }`}
      >
        <a href="#top" className="flex items-center pl-2">
          <span
            className={`font-display text-lg font-semibold tracking-tightest sm:text-xl ${
              dark ? 'text-cream' : 'text-ink'
            }`}
          >
            Let&rsquo;s Pilates LA
          </span>
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {t.nav.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ease-smooth ${
                dark
                  ? 'text-cream/75 hover:bg-white/10 hover:text-cream'
                  : 'text-mute hover:bg-ink/[0.04] hover:text-ink'
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <LangToggle lang={lang} onChange={setLang} dark={dark} />
          <a
            href="#schedule"
            className={`group flex items-center gap-2 rounded-full py-2 pl-5 pr-2 text-sm font-medium transition-transform duration-500 ease-smooth hover:scale-[1.03] ${
              dark ? 'bg-cream text-ink' : 'bg-ink text-cream'
            }`}
          >
            <span className="hidden sm:inline">{t.nav.cta}</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sage text-cream transition-transform duration-500 ease-smooth group-hover:translate-x-0.5">
              →
            </span>
          </a>
        </div>
      </nav>
    </header>
  );
}

/** Segmented EN / KR pill — slides a thumb behind the active language. */
function LangToggle({
  lang,
  onChange,
  dark,
}: {
  lang: 'en' | 'ko';
  onChange: (lang: 'en' | 'ko') => void;
  dark: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className={`relative flex items-center rounded-full border p-0.5 backdrop-blur-sm transition-colors duration-500 ease-smooth ${
        dark ? 'border-white/25 bg-white/10' : 'border-ink/10 bg-paper/70'
      }`}
    >
      {/* sliding thumb */}
      <span
        aria-hidden="true"
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-9 rounded-full transition-transform duration-500 ease-smooth ${
          dark ? 'bg-cream' : 'bg-ink'
        }`}
        style={{ transform: lang === 'ko' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      {(['en', 'ko'] as const).map((code) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={active}
            className={`relative z-10 w-9 rounded-full py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-300 ease-smooth ${
              active
                ? dark
                  ? 'text-ink'
                  : 'text-cream'
                : dark
                  ? 'text-cream/70 hover:text-cream'
                  : 'text-mute hover:text-ink'
            }`}
          >
            {code === 'en' ? 'EN' : 'KR'}
          </button>
        );
      })}
    </div>
  );
}
