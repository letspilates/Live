# Claude Code Prompt — Let's Pilates LA (Quiet Luxury concept: content fill)

> Paste everything below into Claude Code. The target file is `quiet-luxury.html`.
> Goal: fill in real content. DO NOT redesign — preserve the existing visual system.

-----

## CONTEXT — who we are

You are editing the homepage for a **boutique Pilates & Gyrotonic studio** in Los Angeles.

Positioning (this drives the copy — do not name competitors anywhere):

- We are a **boutique studio, not a fitness chain.** No crowded rooms, no one-size sequence.
- We work **fully hands-on**, in **private, duet, and small-group** settings.
- We offer **two distinct disciplines: Pilates and Gyrotonic.**
- **Pilates** is taught to the **STOTT PILATES®** international standard, using a full range of apparatus. Every session is a *new sequence written for that member's body and condition on the day* — never a fixed template.
- **Gyrotonic** is a **distinct movement system in its own right — not a form of Pilates.** Created by former ballet dancer Juliu Horvath, it moves the body in circular, three-dimensional sequences that decompress joints and free the spine. Especially valued by dancers, ballet practitioners, and athletes, and powerful for rehabilitation and restoring flexibility/range of motion. Uses specialized apparatus — the **GYROTONIC® Pulley Tower**, **Jumping-Stretching Board**, and **ARCHWAY™** — with each sequence tailored to the individual.
- Both disciplines are available in all three formats: **Private, Duet, Group.**

Studio facts (already in the footer — keep):
674 S. La Fayette Park Place, Los Angeles, CA 90057 · 310-995-0046 · letspilatesla@gmail.com · Instagram @letspilates_la

-----

## HARD RULES — do not break the design

1. **Do NOT change** the color palette, fonts (Cormorant Garamond / Jost), CSS variables, animations, grain overlay, reveal-on-scroll, or layout structure.
1. Keep it a **single self-contained HTML file** (no build tools, no external JS frameworks).
1. Only edit **text content, section IDs, nav links, and the small items explicitly listed below.** Where a section changes role, reuse its existing markup/classes — just swap the copy.
1. **Trademark formatting:** write **GYROTONIC®** (with ®) on first prominent use, **ARCHWAY™**, and **STOTT PILATES®**. Do not invent claims beyond the copy provided.
1. Do NOT name or compare against any competitor brand.

-----

## SECTION-BY-SECTION CHANGES

### A) `<head>` meta + SEO

- `<title>` → `Let's Pilates LA — Boutique Pilates & Gyrotonic Studio | Los Angeles`
- `<meta name="description">` → `A boutique Pilates & Gyrotonic studio in Los Angeles. STOTT PILATES®–based private, duet and small-group sessions, tailored to your body. Move well, live well, be well.`
- Add a **LocalBusiness JSON-LD** `<script type="application/ld+json">` block in `<head>` with: name "Let's Pilates LA", the address/phone/email/Instagram above, and `@type` of `HealthClub` (or `LocalBusiness`). Keep it minimal and valid.

### B) NAV (`header.nav .nav-links`)

Replace the links with anchors that match the new sections (remove the "Studio"/`#team` link entirely):

```
About · Pilates · Gyrotonic · Sessions · Visit · [Book a Class]
```

- `About` → `#about`
- `Pilates` → `#pilates`
- `Gyrotonic` → `#gyrotonic`
- `Sessions` → `#sessions`
- `Visit` → `#visit`
- `Book a Class` (nav-cta) → `#book`

### C) HERO — keep tagline, rewrite lede only

- Eyebrow (keep): `Boutique Pilates & Gyrotonic · Los Angeles`
- H1 (keep): `Move well.` / `Live well. Be well.`
- Replace `p.lede` with:

> A boutique studio for Pilates and Gyrotonic — where every session is built around one body: yours.

### D) INTRO `#about` — boutique differentiation

- Eyebrow → `Personal by Design`
- H2 → `Not a class you fit into — a practice built <em>around you</em>.`
- P →

> We are a boutique studio, not a fitness chain. No crowded rooms, no one-size sequence — only private and small-group sessions, undivided attention, and a plan that evolves as your body does.
- **Stats** (replace the three):
  - `10` / `Years in Practice`  (established 2015)
  - `2` / `Disciplines`  (Pilates & Gyrotonic)
  - `3` / `Session Formats`  (Private · Duet · Group)

### E) SPLIT 1 (`.split`, media `m1`) → DISCIPLINE 01: PILATES

- Add `id="pilates"` to this `<section>`.
- Eyebrow → `Discipline 01 — Pilates`
- H2 → `Classical intelligence, <em>made personal</em>.`
- P1 →

> Taught to the **STOTT PILATES®** international standard — a contemporary, anatomically grounded refinement of Joseph Pilates' original method.
- P2 →

> On the Reformer, Cadillac, Chair and Barrel, every session is a fresh sequence — written for your body, your goals, and how you arrive that day. Never a template.
- Button → `Explore Sessions` linking to `#sessions`

### F) SPLIT 2 (`.split.alt`, media `m2`) → DISCIPLINE 02: GYROTONIC®

- Add `id="gyrotonic"` to this `<section>`.
- Eyebrow → `Discipline 02 — Gyrotonic`
- H2 → `Movement that <em>circles, spirals, frees</em>.`
- P1 →

> A distinct system in its own right — **not a form of Pilates.** Created by former ballet dancer Juliu Horvath, **GYROTONIC®** moves the body in flowing, three-dimensional arcs that decompress the joints and mobilize the spine.
- P2 →

> Long prized by dancers and athletes, it is equally powerful for rehabilitation and for restoring flexibility and range of motion. Using specialized apparatus — the Pulley Tower, Jumping-Stretching Board and **ARCHWAY™** — each sequence is shaped to your body.
- Button → `Explore Sessions` linking to `#sessions`

### G) CLASSES `#classes` → SESSION FORMATS

- Change the section `id` from `classes` to `sessions` (update the nav link to match).
- Head eyebrow → `How We Work Together`
- Head H2 → `Private, Duet & Group`
- Add one line of intro text under the H2 (small, centered, in the existing `.head`):

> Both Pilates and Gyrotonic are offered as private, duet, and small-group sessions.
- Replace the three cards:
  - **Card 01 — Private** → `One-to-one and fully bespoke. Your instructor designs and adjusts every sequence in real time, around your body alone.`
  - **Card 02 — Duet** → `Two people, shared focus. The intimacy of private work with a partner or friend — the same precision, gently shared.`
  - **Card 03 — Group** → `Small by design — never more than five in Pilates, four in Gyrotonic. A handful of clients, so every body is seen and corrected throughout.`
- Keep the `01 / 02 / 03` numerals and `Learn more` styling.

### H) QUOTE `#schedule` — keep

- Keep the Joseph Pilates quote and `View Class Schedule` button.
- Point the button at the booking config (see section K). Update the section's purpose: this button should open the same booking URL.

### I) TEAM `#team` — DELETE & REPLACE with "First Visit"

- **Remove the entire `<section class="team pad" id="team">…</section>` block**, and remove the now-unused `.team` / `.member` CSS rules.
- Replace it with a short "First Visit" reassurance band, reusing the `.intro` (centered) styling so it matches the design. Give the section `id="first-visit"`:
  - Eyebrow → `Your First Visit`
  - H2 → `What to expect.`
  - P → `Arrive a little early and wear something you can move in — bring nothing else. Your first session opens with a short movement assessment, so everything that follows is built around you.`

### J) CTA BAND `#book` — keep, soften MindBody wording

- Eyebrow → `Begin`
- H2 → `Your first session awaits.`
- P →

> Reserve your place in moments — we'll be ready for you.
- Button label → `Book a Class` (not "Book on MindBody"). It should use the booking config URL below.

### K) BOOKING URL — single config point (future-proofing)

We currently schedule via MindBody but will migrate to our own booking system later. Make this a **one-line swap**:

- At the top of the existing `<script>`, add:

  ```js
  const BOOKING_URL = "PASTE_MINDBODY_URL_HERE"; // TODO: swap to in-house booking system later
  ```
- On load, set the `href` of **all** booking links (the nav CTA, both hero buttons that point to booking, the quote-section button, and the CTA band button) to `BOOKING_URL`, opening in a new tab (`target="_blank" rel="noopener"`).
- Leave a clear `// HOLD: custom booking system integration goes here` comment so it's obvious where the future swap happens.

### L) MOBILE NAV — fix the broken burger

The current burger only sets `display:flex` and cannot close, and there is no styled mobile panel. Implement a proper accessible toggle: open/close on tap, a simple full-width stacked menu using the existing palette, `aria-expanded` on the button, and close on link tap. Keep it minimal and on-brand.

### M) FOOTER `#visit` — minor cleanup

- Keep address/phone/email/Instagram as-is.
- Update the footer nav links so they match the new anchors (`#sessions` instead of `#classes` where relevant).
- **Remove** the `Quiet Luxury concept · mockup` note (pre-launch cleanup).
- Add a small trademark line in the footer bottom:

> GYROTONIC®, GYROKINESIS® and ARCHWAY™ are registered trademarks of Gyrotonic Sales Corp. STOTT PILATES® is a registered trademark of Merrithew.

-----

## DELIVERABLE

Return the **full updated `quiet-luxury.html`** as a single file with all the above applied. After editing, give me a short bullet list of exactly what changed so I can review.
