import { useEffect, useRef } from 'react';

interface ParallaxOptions {
  /** How far the layer drifts relative to scroll (0 = fixed, 1 = moves with page). */
  speed?: number;
  /** Maximum zoom applied as you scroll through the section. */
  maxScale?: number;
  /** Smoothing factor for the lerp — lower = silkier / more lag. */
  ease?: number;
}

/**
 * Smooth, scroll-linked parallax for a single layer.
 *
 * - Animates ONLY `transform` (translate3d + scale) → GPU-composited, no layout.
 * - Eases toward the scroll target with a lerp each frame for a buttery feel
 *   instead of snapping 1:1 to the scrollbar.
 * - The rAF loop parks itself once motion settles and re-arms on the next
 *   scroll, so it costs nothing while idle.
 * - Fully disabled under `prefers-reduced-motion`.
 */
export default function useParallax<T extends HTMLElement = HTMLDivElement>({
  speed = 0.16,
  maxScale = 1.12,
  ease = 0.1,
}: ParallaxOptions = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let target = window.scrollY;
    let current = target;
    let raf = 0;
    let running = false;

    const render = () => {
      // Clamp travel to the layer's overflow so edges never peek in.
      const maxTravel = el.offsetHeight * 0.18;
      const y = Math.max(-maxTravel, Math.min(maxTravel, current * speed));
      const scale = Math.min(maxScale, 1 + current * 0.00014);
      el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    };

    const tick = () => {
      current += (target - current) * ease;
      render();
      if (Math.abs(target - current) < 0.15) {
        running = false; // settled — park the loop
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const arm = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onScroll = () => {
      target = window.scrollY;
      arm();
    };

    render(); // initial paint
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [speed, maxScale, ease]);

  return ref;
}
