# MyGridTime

Multi-tenant motorsport timetable SaaS. Admins manage a "championship" (events, timetables,
members); consumers view published public timetables and get email/alert notifications.

## Stack

- Next.js 14 (App Router), TypeScript (strict), Tailwind
- Supabase (Postgres + Auth + Storage + RLS) — magic-link auth
- Resend (transactional email), Anthropic SDK (Claude Vision PDF/image extraction), Sentry
- Deployed on Netlify (`netlify.toml`, `@netlify/plugin-nextjs`)

## Commands

```
npm run dev         # next dev
npm run build       # next build
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm test            # vitest run
npm run test:watch  # vitest
```

No E2E tests (Playwright/Cypress) — coverage is Vitest unit/component tests only
(`src/**/*.test.{ts,tsx}`, jsdom, React Testing Library).

## Layout

- `src/app/` — App Router: `(public)` unauthenticated views, `admin/*` authenticated
  championship management, `my/*` consumer routes, `auth/*` magic-link flow, `api/*`
  (cron, webhooks), `invites/[token]`, `notifications/unsubscribe/[token]`
- `src/components/` — `admin/`, `public/`, `ui/` (primitives). `consumer/` and `timetable/`
  are currently empty placeholders.
- `src/lib/` — `supabase/` (client/server/middleware/admin clients), `ai/extract.ts`
  (Claude Vision extraction), `resend/` (email templates + client), `retention/`
  (30-day extraction log + storage cleanup), `types/database.ts` (hand-written DB types,
  source of truth for schema shape), `env.ts` (env validation + feature flags)
- `src/middleware.ts` — session refresh + `/admin/*` route protection
- `supabase/migrations/` — 17 sequential SQL migrations, source of truth for schema
- `scripts/*.mjs` — dev fixture/seed scripts, run via `node --env-file=.env.local scripts/x.mjs`
- `docs/DECISIONS.md` — architecture decision log (DEC-001..041+), check before assuming
  *why* something is built a certain way
- `docs/KNOWN_ISSUES.md` — open/resolved ticket-shaped issues (MGT-*)

## Data model (current — post MGT-107 rename)

Core entity is **championship** (renamed from "organisation" in MGT-104..107):
`championships`, `championship_members`, `championship_invites`, `championship_branding`,
`championship_audit_log`; FK column `championship_id` on `events`, `templates`,
`audit_log`, `ai_extraction_log`, `notification_emails`, etc.

Other key tables: `events` (slug unique per-championship, composite
`UNIQUE(championship_id, slug)`), `event_days`, `event_entries`, `timetable_snapshots`
(publish version history), `templates`, `ai_extraction_log`, `notification_preferences`.

Roles are a 3-axis model (DEC-037): `platform_role` (admin/staff/support, cross-championship),
`championship` role (owner/editor, per-championship via `championship_members`), and
`subscription_status` (member/subscriber). RLS policies key off
`get_user_championship_role(p_championship_id)`.

## Conventions / gotchas

- **`.env.local` currently points at the PRODUCTION Supabase project.** There is no
  staging-pointed local env file — any destructive local script/migration hits live data.
  Treat local dev DB writes as production writes until this is fixed.
- `supabase/seed.sql` still references pre-rename names (`organisations`, `org_id`) —
  `supabase db reset` will fail at the seed step. Doesn't affect prod.
- The org→championship rename was deliberately phased (copy → types → routes → DB → docs,
  DEC-041) to limit blast radius; if you see mixed `org`/`championship` naming in code or
  RLS function names (e.g. `get_user_championship_role` predates full rename), it may be
  intentional residual, not a bug — check `docs/KNOWN_ISSUES.md` before renaming further.
- `next.config.mjs` injects `NEXT_PUBLIC_GIT_COMMIT_SHA` via `git rev-parse --short HEAD`
  at build time, shown in the UI footer as a build identity badge (authenticated layouts only).
- 308 redirect: `/admin/orgs` → `/admin/championships`.
- Path alias `@/*` → `./src/*` (tsconfig + vitest config).
- Vitest requires `@vitejs/plugin-react` for JSX (fixed in MGT-103b) — don't remove it.

## Environment variables (names only)

Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`
App: `APP_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`
Email: `EMAIL_FROM`, `RESEND_API_KEY`
AI extraction: `ANTHROPIC_API_KEY`, `MGT_EXTRACT_MODEL`, `MGT_AI_EXTRACTION_ENABLED`
Auth (dev only): `DEV_ADMIN_EMAIL`
Cron: `CRON_SECRET`
Sentry: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`,
`SENTRY_URL` (recognised but **deliberately unset** — see DEC-043; only needed if the
Netlify token is ever swapped from an org token to a personal one)
Phase 7 (unused stubs): `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (web push),
`TWILIO_*` (SMS alerts), `STRIPE_*` (payments)

## Note on `.claude/CLAUDE.md`

This repo has a separate `.claude/CLAUDE.md` with session-control rules (graphify-first
navigation, mandatory state-snapshot output, ticket-scoped execution discipline). That file
governs *how a Claude session should operate here*; this file (`CLAUDE.md`) documents *what
the codebase is*. Both apply — this one doesn't replace it.
