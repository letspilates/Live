# Phase 2 — Custom Booking System (자체 예약 시스템)

> Companion to `Content.md`. This is the implementation brief for replacing MindBody with our own booking experience.

-----

## Decision

**Path: B — Build our own.** MindBody runs in parallel during the build, then we cut over.

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
| DB + Auth | **Supabase** (Postgres, Auth, RLS, Edge Functions) | Free to start, row-level security gives us safe direct-from-browser queries, scales to monthly $25 plan |
| Payments | **Stripe** (Checkout + Customer Portal) | Industry standard; 2.9% + $0.30 per charge; subscription support if we ever add memberships |
| Email | **Resend** + React Email templates | 3000/mo free, clean DX, deliverability good for transactional |
| Dynamic frontend | **Astro** islands (or Vite + TS) | Keeps the current static landing as-is; adds `/account` and `/booking` as discrete pages |
| Hosting | **Vercel** (move from GitHub Pages) | Needs to host serverless functions, preview branches, env vars |
| Admin (interim) | **Supabase Studio** | We can manage instructors, sessions, and refunds directly while we build the custom admin |
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

- Create Supabase project, Stripe account, Resend domain (`letspilatesla.com`).
- Move hosting from GitHub Pages → Vercel. Wire env vars. Preserve current static landing.
- Wrap the existing MindBody (healcode) widget in our design's chrome on a `/schedule` page so revenue continues during the build.
- Add `BOOKING_URL` to point at the MindBody booking page from all CTA buttons.

**Deliverable:** site lives on Vercel, scheduling works via MindBody inside our design.

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

## Open decisions (need user input)

1. **Hosting move** — GitHub Pages → Vercel. Required for Stage 1. Free tier covers us.
2. **First launch scope** — ship after Stage 2 (browse + accounts, pay at studio) or after Stage 3 (full online payments)?
3. **Pricing structure** — drop-in cost, package tiers, validity period. Pull from existing `pricing/` JPGs or fresh?
4. **Currency** — defaulting to **USD only** (LA studio). Flag if you want KRW too for Korean clients.

## Trademark notes

Same as Phase 1: GYROTONIC®, GYROKINESIS®, ARCHWAY™ — Gyrotonic Sales Corp. STOTT PILATES® — Merrithew.

## Status

Phase 1 landing page live in `redesign/quiet-luxury.html`. Phase 2 work begins at Stage 1.
