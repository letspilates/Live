# Let's Pilates — Landing Page

A premium, fintech-style landing page **re-themed for a Pilates & Gyrotonic
studio**, built from the "USD Halo" design prompt.

Stack: **React + TypeScript + Vite + Tailwind CSS v3**, icons via `lucide-react`.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to /dist
```

## Sections

1. **Navbar + Hero** (full-height, `overflow-hidden`) — halo logo mark,
   transparent nav, headline "Your Body Works", "Book a class" CTA, and an
   infinite brand marquee of Pilates equipment/method names.
2. **Info** — "Meet the Method." plus a 3-card grid (one photo card, two `#2B2644`
   dark cards).
3. **Backed By** — instructor/certification marquee.
4. **Use Cases** — "Ways to move" with a large reformer video card.

## Media — how to swap

All media is configured in [`src/media.ts`](src/media.ts):

- **Images** live in `/public/media` and are bundled locally, so they always load:
  - `reformer.jpg` — reformer photo (hero + use-cases poster)
  - `dancer.jpg` — Pilates with stability ball (info card)
  - `letspilates.jpg` — studio sign
- **Videos** point to free Pilates stock footage URLs. Replace them with your own
  studio footage anytime. If a video URL fails to load, its `poster` image is
  shown instead — the page never looks broken.

## Fonts

The design calls for **TT Norms Pro**. Drop the licensed files into
`/public/fonts/`:

- `tt-norms-pro-regular.woff2` (weight 400)
- `tt-norms-pro-semibold.woff2` (weight 600)

Until those files are present, `font-display: swap` falls back to **Inter**
(loaded from Google Fonts) / system UI.
