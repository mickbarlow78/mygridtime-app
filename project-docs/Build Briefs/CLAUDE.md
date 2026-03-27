# TKC Timetable Platform

## Project Overview
Race-day schedule and alert system for karting events. Two product layers:
1. **Championship tool (B2B)** — Admin timetable builder + public timetable for organisers (Phases 1–6).
2. **Driver/parent layer (B2C)** — Personal timetable from PDF/photo upload, AI extraction, multi-driver management, push/SMS/WhatsApp alerts with freemium model (Phase 7).

Position as: "Race-day awareness system" — NOT "timetable builder."

## Tech Stack
- Next.js (App Router) with TypeScript
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Edge Functions, Row-Level Security)
- Resend (transactional email — Phase 5)
- Twilio (SMS + WhatsApp alerts — Phase 7)
- Stripe (subscription payments — Phase 7)
- Claude Vision API (PDF/photo timetable extraction — Phase 7)
- PWA (service worker, Web Push API, VAPID keys — Phase 7)

## Current State
Migrating from a working HTML/JS prototype with JSON data layer to a production Next.js + Supabase stack. The prototype code and JSON data exist in this repo as reference. The JSON data must be migrated to Supabase as seed data.

## Commands
- `npm run dev`: Start Next.js dev server (port 3000)
- `npm run build`: Production build
- `npm run lint`: ESLint check
- `npm run typecheck`: TypeScript strict check (tsc --noEmit)
- `npx supabase start`: Start local Supabase (Postgres, Auth, Edge Functions)
- `npx supabase db reset`: Reset local DB and re-run migrations + seed
- `npx supabase gen types typescript --local > src/lib/types/database.ts`: Regenerate DB types

## Architecture
```
src/
├── app/
│   ├── (public)/               # Public timetable routes
│   │   ├── page.tsx            # Landing / event list
│   │   └── [slug]/
│   │       ├── page.tsx        # Public timetable
│   │       └── print/page.tsx
│   ├── admin/                  # Authenticated admin routes (B2B)
│   │   ├── layout.tsx          # Auth guard
│   │   ├── page.tsx            # Dashboard
│   │   └── events/
│   │       ├── new/page.tsx
│   │       └── [id]/
│   │           ├── page.tsx           # Timetable builder
│   │           └── preview/page.tsx
│   ├── my/                     # Driver/parent routes (B2C — Phase 7)
│   │   ├── layout.tsx          # Consumer auth guard
│   │   ├── page.tsx            # My timetables dashboard
│   │   ├── upload/page.tsx     # Upload PDF/photo
│   │   ├── drivers/page.tsx    # Manage drivers
│   │   ├── alerts/page.tsx     # Alert preferences
│   │   └── [timetableId]/
│   │       └── page.tsx        # View personal timetable
│   ├── auth/
│   │   ├── login/page.tsx
│   │   └── callback/page.tsx
│   └── api/
│       └── webhooks/
│           └── stripe/route.ts # Stripe webhook handler
├── components/
│   ├── timetable/              # Shared timetable display
│   ├── admin/                  # Admin-specific (B2B)
│   ├── consumer/               # Driver/parent-specific (B2C)
│   └── ui/                     # Generic UI primitives
├── lib/
│   ├── supabase/               # Client init + helpers
│   ├── stripe/                 # Stripe client + webhook helpers
│   ├── twilio/                 # SMS + WhatsApp helpers
│   ├── extraction/             # Claude Vision API extraction logic
│   ├── push/                   # Web Push subscription + send helpers
│   ├── types/                  # Generated DB types
│   └── utils/
├── styles/
└── public/
    ├── manifest.json           # PWA manifest
    ├── sw.js                   # Service worker (push + caching)
    └── icons/                  # PWA icons (192x192, 512x512)
supabase/
├── migrations/                 # Versioned SQL migrations
├── functions/
│   ├── extract-timetable/      # Claude Vision API extraction
│   ├── publish-event/          # Publish validation + notify
│   ├── unpublish-event/
│   ├── duplicate-event/
│   ├── archive-event/
│   ├── dispatch-alerts/        # Alert scheduler (cron-triggered)
│   └── stripe-webhook/         # Stripe event handler
└── seed.sql                    # Migrated prototype data
```

## Database Tables

### Championship layer (Phases 1–6)
organisations, users, org_members, events, event_days, timetable_entries, audit_log, notification_log.

### Consumer layer (Phase 7)
public_users, drivers, user_timetables, user_timetable_days, user_timetable_entries, community_timetables, scheduled_alerts, alert_delivery_log.

All tables use UUID PKs and timestamptz. See @docs/technical-spec.md and @docs/phase7-addendum.md for full schemas.

## Key Conventions
- TypeScript strict mode. No `any` types.
- Use named exports, not default exports (except Next.js page components which require default).
- Tailwind utility classes only. No custom CSS files.
- All DB types auto-generated from Supabase schema. Never hand-write DB types.
- Supabase RLS enforces access control. Every table must have RLS enabled.
- Auth: magic link / email OTP via Supabase Auth. JWT in httpOnly cookie.
- Public pages: SSG with on-demand revalidation on publish.
- Admin pages: client-side rendering with Supabase client SDK.
- sort_order integer on event_days and timetable_entries controls display order.
- Soft delete (deleted_at) on events. Hard delete on timetable_entries.
- Event statuses: draft, published, archived.
- Consumer subscription statuses: free, active, cancelled, expired.

## PWA Requirements (Phase 7)
- manifest.json: display: standalone, icons 192+512, theme_color, background_color.
- Service worker: handles push events, notificationclick, app shell caching.
- iOS requires "Add to Home Screen" for push. Show custom install banner after first timetable created.
- iOS push does NOT work in EU (Apple DMA). Detect and recommend SMS/WhatsApp fallback.

## AI Extraction (Phase 7)
- Edge Function: POST /functions/v1/extract-timetable
- Model routing: clean PDFs → Claude Haiku (cheaper), photos/scans → Claude Sonnet (better layout comprehension).
- Returns structured JSON: { event_name, championship, venue, days: [{ date, entries: [{ title, start_time, end_time, category }] }] }
- User must review and approve extracted data before saving.
- NEVER auto-save extracted data without user confirmation.

## Alert System (Phase 7)
- Alerts pre-calculated on timetable confirm → stored in scheduled_alerts table.
- Cron job (pg_cron or external) runs every 60 seconds, dispatches due alerts.
- Channels: push (Web Push API + VAPID), SMS (Twilio), WhatsApp (Twilio).
- If timetable updated, delete pending alerts and recalculate.
- Free users: push only (single alert, 15 min). Paid users: SMS/WhatsApp + multiple timings + multiple drivers.

## Payments (Phase 7)
- Stripe Checkout for subscription signup.
- Stripe Webhooks update subscription_status in public_users.
- Upgrade triggered at moment of intent (user taps SMS, adds second driver, etc).
- NEVER show paywall before user has received value from free push alerts.

## Important Rules
- NEVER commit .env or .env.local files.
- NEVER expose SUPABASE_SERVICE_ROLE_KEY to the client.
- NEVER expose ANTHROPIC_API_KEY, TWILIO_AUTH_TOKEN, STRIPE_SECRET_KEY to the client.
- NEVER use localStorage or sessionStorage in the app (not supported in some PWA contexts).
- Run `npm run typecheck` after any code changes.
- Run `npx supabase db reset` after any migration changes to verify they apply cleanly.
- When creating Supabase migrations, use `npx supabase migration new <name>`.
- Edge Functions use Deno runtime, not Node.js.

## Phases
Building in phases. Do not build features from later phases unless explicitly asked.
- **Phase 1**: Project setup, folder structure, Netlify deploy, CI pipeline.
- **Phase 2**: Supabase schema, RLS, auth flow, CRUD, data migration from JSON.
- **Phase 3**: Validation, draft/publish lifecycle, duplicate, audit log, drag-and-drop.
- **Phase 4**: Public timetable optimisation, print view, mobile-perfect, SEO.
- **Phase 5**: Email notifications via Resend.
- **Phase 6**: Templates, multi-org, version history, white-label.
- **Phase 7a**: PWA setup, push notifications, driver management, basic alerts (FREE).
- **Phase 7b**: AI extraction from PDF/photo (Claude Vision API).
- **Phase 7c**: SMS + WhatsApp alerts (Twilio), Stripe payments, upgrade flow (PAID).
- **Phase 7d**: Community timetables, championship matching, timetable updates.

## Reference Documents
- @docs/technical-spec.md — Full schema, API contracts, acceptance criteria (Phases 1–6)
- @docs/phase7-addendum.md — Consumer layer spec (Phase 7)
- @docs/gtm-plan.md — Go-to-market plan and product roadmap
- @docs/pricing-model.md — Pricing strategy and unit economics
- @docs/moat-strategy.md — Defensibility layers
