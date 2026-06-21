import { ArrowRight } from 'lucide-react';
import { IMG, VIDEO } from '../media';

export default function UseCasesSection() {
  return (
    <section className="bg-[#F5F5F5] px-6 py-24">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Left column */}
        <div className="md:pr-12 md:pt-2">
          <p className="text-black/60 text-sm mb-2">Let&rsquo;s Pilates in Practice</p>
          <h2
            className="text-black text-5xl md:text-6xl font-medium leading-none mb-6"
            style={{ letterSpacing: '-0.04em' }}
          >
            Ways to move
          </h2>
          <p className="text-black/60 text-base leading-relaxed max-w-sm">
            Let&rsquo;s Pilates powers a wide range of modes — reformer,
            Gyrotonic, mat and private training — for every body, goal and level,
            plus more.
          </p>
        </div>

        {/* Right column — video card */}
        <div className="relative rounded-3xl overflow-hidden min-h-[720px]">
          <video
            className="object-cover absolute inset-0 w-full h-full"
            autoPlay
            muted
            loop
            playsInline
            poster={IMG.reformer}
          >
            <source src={VIDEO.useCases} type="video/mp4" />
          </video>

          {/* Light gradient for legibility */}
          <div className="absolute inset-0 z-[5] bg-gradient-to-b from-white/55 via-white/10 to-transparent pointer-events-none" />

          <div className="relative z-10 p-10 md:p-12">
            <h3
              className="text-black text-4xl md:text-5xl font-medium leading-tight mb-5"
              style={{ letterSpacing: '-0.03em' }}
            >
              Reformer
            </h3>
            <p className="text-black/70 text-base max-w-md mb-8">
              Build strength, flexibility and control on the reformer with
              spring-based resistance that adapts to your body — guided by
              certified instructors every step of the way.
            </p>
            <a href="#" className="group inline-flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center group-hover:bg-white transition-colors duration-200">
                <ArrowRight className="w-4 h-4 text-black" />
              </span>
              <span className="text-black font-medium">Explore classes</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
