import { ArrowRight } from 'lucide-react';
import { IMG } from '../media';

export default function InfoSection() {
  return (
    <section className="bg-[#F5F5F5] px-6 py-24">
      <div className="max-w-[88rem] mx-auto">
        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16 items-start">
          <div>
            <h2
              className="text-black text-4xl md:text-5xl font-medium leading-tight mb-8"
              style={{ letterSpacing: '-0.03em' }}
            >
              Meet the Method.
            </h2>
            <a
              href="#"
              className="inline-flex items-center gap-3 bg-black text-white text-base font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200"
            >
              Discover it
              <span className="bg-white rounded-full p-2">
                <ArrowRight className="w-5 h-5 text-black" />
              </span>
            </a>
          </div>
          <p className="text-black/70 text-2xl md:text-3xl leading-relaxed">
            Let&rsquo;s Pilates blends classical reformer work with flowing
            Gyrotonic movement so your body grows stronger, more mobile and more
            balanced — session after session.
          </p>
        </div>

        {/* Row 2 — card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 — image background, spans 2 cols on lg */}
          <div
            className="lg:col-span-2 rounded-2xl overflow-hidden p-7 min-h-80 flex flex-col justify-between"
            style={{
              backgroundImage: `url(${IMG.movement})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <h3
              className="text-black text-2xl font-medium leading-snug"
              style={{ letterSpacing: '-0.02em' }}
            >
              Strength that blooms
            </h3>
            <p className="text-black/70 text-base max-w-xs">
              Build deep core strength and length as every session is tailored
              to exactly how your body moves.
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl p-7 min-h-80 flex flex-col justify-between bg-[#2B2644]">
            <h3 className="text-white text-2xl font-medium leading-snug">
              Always fluid,
              <br />
              always aligned.
            </h3>
            <p className="text-white/60 text-base">
              Move freely with Gyrotonic&rsquo;s circular, flowing patterns — no
              strain, no limits.
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-2xl p-7 min-h-80 flex flex-col justify-between bg-[#2B2644]">
            <h3 className="text-white text-2xl font-medium leading-snug">
              Fully
              <br />
              guided
            </h3>
            <p className="text-white/60 text-base">
              Skip the guesswork. Certified instructors program every session
              around you.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
