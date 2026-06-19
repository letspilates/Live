# Phase 2 — Custom Booking System (자체 예약 시스템)

> Companion to `Content.md`. This is the implementation brief for replacing MindBody with our own booking experience.

-----

## Decision (locked)

- **Path: B — Build our own.** MindBody runs in parallel during the build, then we cut over.
- **Hosting:** **GitHub Pages** (stay; $0 for commercial use). Server-side logic moves to **Supabase Edge Functions**; scheduled jobs run on **GitHub Actions**.
- **Launch scope:** ship after **Stage 3** — full online booking + payments at first public release (~7 weeks).
- **Currency:** **USD only** for v1.

## Goal

A boutique booking experience embedded in Let's Pilates LA's own site:

- Class calendar with live availability (Pilates & Gyrotonic; Private / Duet / Group)
- Self-serve booking and cancellation (credit-based)
- Online payments (drop-in + credit packages)
- Member accounts (booking history, remaining credits, profile)
- Instructor + admin dashboards (schedule, roster, no-shows, refunds)
- Automated email (confirmation, 24h reminder, cancellation, waitlist promotion)

## Hard rules

1. **Design parity** — every booking surface uses the Quiet Luxury system from Phase 1 (palette, type, spacing). No third-party widget look.
2. **Single source of truth** — bookings live in our DB, not split across MindBody.
3. **No vendor lock-in** — own the data; payments via Stripe so we can switch processors later.
4. **Trademarks** — GYROTONIC®, ARCHWAY™, STOTT PILATES® stay correctly marked everywhere.

-----

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| DB + Auth | **Supabase** (Postgres, Auth, RLS) | Free to start, row-level security lets the browser query DB safely, scales to $25/mo plan |
| Server logic | **Supabase Edge Functions** (Deno) | Stripe webhook target, atomic booking RPCs, email triggers — all server-side secrets live here, never in the repo |
| Payments | **Stripe** (Checkout + Customer Portal) | Industry standard; 2.9% + $0.30 per charge; subscription support if we ever add memberships |
| Email | **Resend** + React Email templates | 3000/mo free, clean DX, deliverability good for transactional |
| Frontend | **Astro** (static output) | Keeps current static landing as-is; builds `/account` and `/booking` as pre-rendered pages that talk to Supabase from the browser via `supabase-js` |
| Hosting | **GitHub Pages** | Free for commercial use, custom domain `letspilatesla.com` already configured |
| Scheduled jobs | **GitHub Actions** (cron workflows) | 24h reminders, nightly cleanup; free at our scale |
| Admin (interim) | **Supabase Studio** | Manage instructors, sessions, refunds directly while we build the custom admin |
| Admin (later) | Custom `/admin` pages | Built into our design when we have time |

-----

## Data model (Supabase / Postgres)

```
profiles        id, name, phone, email, credits, role, stripe_customer_id, created_at
instructors     id, name, bio, photo_url, disciplines[]              -- 'pilates' | 'gyrotonic'
class_types     id, name, discipline, format, duration_min, capacity -- format = 'private'|'duet'|'group'
sessions        id, class_type_id, instructor_id, starts_at, capacity, status
bookings        id, session_id, profile_id, status, credit_used, created_at, cancelled_at
packages        id, name, credits, price_cents, currency, active
purchases       id, profile_id, package_id, stripe_payment_id, credits_granted, created_at
waitlist        id, session_id, profile_id, position, notified_at
audit_log       id, actor_id, action, target_table, target_id, payload, at
```

Indexes on `sessions.starts_at`, `bookings.session_id`, `bookings.profile_id`.

### Row-level security policies (sketch)

- `profiles` — owner read/write own row; admin read all.
- `sessions` — public read of future sessions; instructor write own; admin all.
- `bookings` — owner read/write own; instructor read own session's roster; admin all.
- `packages` — public read where `active = true`; admin write.
- `purchases` — owner read own; admin all.
- Mutations that move credits (`book_session`, `cancel_booking`, `purchase_complete`) go through **Edge Functions** that run inside a transaction — never let the browser write `profiles.credits` directly.

-----

## 4-stage roadmap

### Stage 1 — Infrastructure + MindBody bridge (1 week)

- Promote `redesign/quiet-luxury.html` to the public landing (replace the old root `index.html`).
- Create Supabase project, Stripe account, Resend domain (`letspilatesla.com`).
- Reserve an `app/` folder for the Astro project that scaffolds in Stage 2; the GH Actions build workflow lands then.
- Wrap the existing MindBody (healcode) widget in our design's chrome on a `/schedule` page so revenue continues during the build.
- Set `BOOKING_URL` so all CTA buttons point at the MindBody booking page.

**Deliverable:** new Quiet Luxury landing live at `letspilatesla.com` via GH Pages, scheduling works via MindBody inside our design.

### Stage 2 — Read-only class calendar + accounts (2–3 weeks)

- Email magic-link sign in (Supabase Auth).
- Public weekly calendar page that reads from `sessions` + computes availability via `capacity - count(bookings where status='confirmed')`.
- `/account` page showing profile, contact info, future bookings (empty for now).
- Instructors + class types + sessions are entered through Supabase Studio (no admin UI yet).
- **Booking flow stops at "Sign in to reserve"** — no money yet, no real holds.

**Deliverable:** members can browse our calendar and create accounts.

### Stage 3 — Payments + real booking (3–4 weeks)

- `/packages` page → Stripe Checkout → `purchase_complete` webhook adds credits.
- `book_session` Edge Function: atomic check-and-decrement; returns 409 if full.
- `cancel_booking` Edge Function: refund credit only if > 24h before start.
- Waitlist join + auto-promote (DB trigger) when a confirmed seat opens.
- Resend templates: confirmation, 24h reminder, cancellation, waitlist promotion.
- Cron (Vercel) sweeps to send reminders and clean up no-shows.

**Deliverable:** end-to-end booking with money, off MindBody for new members.

### Stage 4 — Admin + instructor tools, MindBody sunset (2 weeks)

- Instructor view: my upcoming sessions, attendance check-in, no-show toggle.
- Admin view: revenue summary, capacity by class type, member search, manual credit grant, refund, edit packages and pricing.
- CSV migration from MindBody (members, remaining credits, future bookings).
- Cancel MindBody subscription.

**Deliverable:** fully on our system, MindBody off.

-----

## Still open (need user input before specific stages)

- **Pricing structure** (needed by Stage 3) — drop-in price, package tiers (5/10/20 credits?), credit validity period. We can start from the existing `pricing/` JPGs and refine.
- **Cancellation window** (needed by Stage 3) — confirming the standard 24h refund window is correct.
- **MindBody URL + healcode script** (needed by Stage 1) — to embed the schedule widget on `/schedule` as the bridge.

## Stage 1 — Kickoff plan

### What I (Claude) will do
1. **Promote** `redesign/quiet-luxury.html` to the public landing (replace the old root `index.html`; drop the now-empty `redesign/` folder).
2. **`.env.example`** documenting the env vars: public ones used by the browser build (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_STRIPE_PUBLISHABLE_KEY`, `PUBLIC_BOOKING_URL`), and server-only secrets (`SUPABASE_SERVICE_ROLE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`) which live in Supabase Edge Function secrets — **never** in the repo.
3. **`app/` placeholder** for the Astro project that scaffolds in Stage 2.
4. **`/schedule` page** wrapping the MindBody healcode widget in our design **(once the script is provided)**.
5. **Wire `BOOKING_URL`** through the existing config slot so all CTAs point at the MindBody booking page.

### What you'll need to do (account provisioning)
1. **Supabase** — create a new project (region `us-west-1` Oregon for LA proximity). Send me the project URL + anon key + service-role key (treat the service role like a password).
2. **Stripe** — create account, get the **test mode** keys (publishable + secret). Live mode comes at end of Stage 3.
3. **Resend** — sign up, verify sending domain `letspilatesla.com` (I'll hand you the DNS records to add).
4. Paste the **MindBody booking URL** and the healcode `<script>` into chat.
5. (Already done) GitHub Pages already serves `letspilatesla.com` from this repo — no change needed.

Once the accounts exist and the MindBody script lands, Stage 1 closes in a day or two.

## Trademark notes

Same as Phase 1: GYROTONIC®, GYROKINESIS®, ARCHWAY™ — Gyrotonic Sales Corp. STOTT PILATES® — Merrithew.

## Status

Phase 1 landing page live in `redesign/quiet-luxury.html`. Phase 2 work begins at Stage 1.
