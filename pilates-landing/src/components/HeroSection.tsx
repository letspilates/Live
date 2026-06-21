import { ArrowRight } from 'lucide-react';
import { IMG, VIDEO } from '../media';
import type { CSSProperties } from 'react';

interface Brand {
  name: string;
  style: CSSProperties;
}

const brands: Brand[] = [
  { name: 'Balanced Body', style: { fontFamily: 'Georgia, serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '15px' } },
  { name: 'STOTT PILATES', style: { fontFamily: 'Arial, sans-serif', fontWeight: 900, letterSpacing: '0.08em', fontSize: '13px', textTransform: 'uppercase' } },
  { name: 'Gyrotonic', style: { fontFamily: '"Trebuchet MS", sans-serif', fontWeight: 600, letterSpacing: '0.01em', fontSize: '15px', fontStyle: 'italic' } },
  { name: 'BASI', style: { fontFamily: '"Courier New", monospace', fontWeight: 700, letterSpacing: '0.12em', fontSize: '13px', textTransform: 'uppercase' } },
  { name: 'Merrithew', style: { fontFamily: 'Palatino, "Book Antiqua", serif', fontWeight: 400, letterSpacing: '-0.01em', fontSize: '16px' } },
  { name: 'Polestar', style: { fontFamily: 'Impact, "Arial Narrow", sans-serif', fontWeight: 400, letterSpacing: '0.04em', fontSize: '14px' } },
  { name: 'Peak Pilates', style: { fontFamily: 'Verdana, sans-serif', fontWeight: 700, letterSpacing: '-0.03em', fontSize: '13px' } },
];

export default function HeroSection() {
  return (
    <section className="flex-1 px-6 pt-20 pb-6 flex items-end">
      <div
        className="relative w-full max-w-[88rem] mx-auto rounded-2xl overflow-hidden"
        style={{ height: 'calc(100vh - 96px)' }}
      >
        {/* Background video with local image poster fallback */}
        <video
          className="object-cover absolute inset-0 w-full h-full"
          autoPlay
          muted
          loop
          playsInline
          poster={IMG.reformer}
        >
          <source src={VIDEO.hero} type="video/mp4" />
        </video>

        {/* Soft light gradient to keep the black text legible over footage */}
        <div className="absolute inset-0 z-[5] bg-gradient-to-br from-white/55 via-white/15 to-transparent pointer-events-none" />

        {/* Content overlay */}
        <div className="relative z-10 flex flex-col items-start justify-start h-full p-12 pt-36">
          <h1
            className="text-black text-5xl md:text-6xl font-medium leading-tight max-w-xl mb-4"
            style={{ letterSpacing: '-0.04em' }}
          >
            Your Body
            <br />
            Works
          </h1>

          <p
            className="text-black/70 text-base md:text-lg max-w-md mb-8 leading-relaxed"
            style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
          >
            A mindful, movement-powered studio built for reformer Pilates and
            Gyrotonic — designed for strength, mobility and effortless wellbeing.
          </p>

          <a
            href="#"
            className="inline-flex items-center gap-3 bg-black text-white text-base md:text-lg font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200"
          >
            Book a class
            <span className="bg-white rounded-full p-2">
              <ArrowRight className="w-5 h-5 text-black" />
            </span>
          </a>

          {/* Brand marquee */}
          <div className="mt-24 w-full max-w-md overflow-hidden">
            <style>{`
              @keyframes marquee {
                from { transform: translateX(0); }
                to { transform: translateX(-50%); }
              }
              .marquee-track {
                display: flex;
                width: max-content;
                animation: marquee 22s linear infinite;
              }
            `}</style>
            <div className="marquee-track">
              {[...brands, ...brands].map((brand, i) => (
                <span
                  key={i}
                  className="mx-7 shrink-0 text-black/60 whitespace-nowrap"
                  style={brand.style}
                >
                  {brand.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
