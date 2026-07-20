import LogoIcon from './LogoIcon';
import { IMG } from '../media';
import { useLang } from '../i18n/LanguageContext';

const colOrder = ['programs', 'studio', 'contact'] as const;

export default function Footer() {
  const { t } = useLang();
  const f = t.footer;

  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2.5">
              <LogoIcon className="h-7 w-7 text-sage-soft" />
              <span className="font-display text-xl font-semibold tracking-tightest">
                Let&rsquo;s Pilates LA
              </span>
            </div>
            {/* studio wordmark logo on a cream card */}
            <div className="mt-6 inline-block rounded-2xl bg-cream p-4">
              <img
                src={IMG.logo}
                alt="Let's Pilates LA — Pilates Studio | Gyrotonic®"
                className="h-14 w-auto"
                loading="lazy"
              />
            </div>
            <p className="mt-5 max-w-[40ch] break-keep text-sm leading-relaxed text-cream/65">
              {f.description}
            </p>
            <p className="mt-6 break-keep text-sm text-cream/55">
              {f.address[0]}
              <br />
              {f.address[1]}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {colOrder.map((key) => {
              const col = f.cols[key];
              return (
                <div key={key}>
                  <h4 className="text-[11px] uppercase tracking-[0.16em] text-cream/45">
                    {col.title}
                  </h4>
                  <ul className="mt-4 space-y-3">
                    {col.links.map((link) => (
                      <li key={link}>
                        <a
                          href="#"
                          className="break-keep text-sm text-cream/75 transition-colors duration-300 ease-smooth hover:text-cream"
                        >
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-cream/10 pt-7 text-xs text-cream/45 sm:flex-row sm:items-center">
          <p>{f.rights}</p>
          <div className="flex items-center gap-6">
            <a href="#" className="transition-colors hover:text-cream/80">
              {f.legal[0]}
            </a>
            <a href="#" className="transition-colors hover:text-cream/80">
              {f.legal[1]}
            </a>
            <span className="rounded-full border border-cream/15 px-3 py-1">{f.langBadge}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
