# MyGridTime — Project Context Snapshot

> **This is a point-in-time snapshot for manual upload to the Claude Project.**  
> Last verified: **2026-06-19**  
> It is NOT auto-synced. Treat any information here as accurate as of that date only.  
> For current state, check `docs/RECON-2026-06-19.md` and `git log` in the canonical repo.

---

## What is MyGridTime?

A multi-tenant motorsport timetable management application. Allows motorsport championship organisers to build, publish, and notify subscribers of event timetables. Built on Next.js 14 (App Router), Supabase, and Netlify. The intended audience for Phase 7 onward is paid B2C consumers (drivers, fans).

---

## Folder Map

Four `mygridtime*` folders exist locally under `C:\projects`. Only one is the real application repo:

| Folder | Role | Use for app work? |
|---|---|---|
| `C:\projects\mygridtime-app` | **Canonical real repo.** Remote: `https://github.com/mickbarlow78/mygridtime-app.git`. 113 commits of full application history. | **YES — always use this.** |
| `C:\projects\mygridtime` | Stale early scaffold. Different remote (`mygridtime.git`). Only 3 commits. No application value. | NO — ignore. |
| `C:\projects\mygridtime-deploy` | Manual static marketing-site artefact (HTML/CSS/JS). Not a git repo. Separate from the Next.js app. | NO — ignore for app work. |
| `C:\projects\mygridtime-website` | Separate marketing website project with its own git remote. 22 commits on `master`. | NO — separate project. |

---

## Canonical Repository

- **Local path:** `C:\projects\mygridtime-app`
- **GitHub remote:** `https://github.com/mickbarlow78/mygridtime-app.git`
- **Current branch:** `mgt-107-rehearsal`
- **Commits ahead of `origin/main`:** 2

The two unshipped commits on `mgt-107-rehearsal`:
1. `e6e6ebc` — "MGT-107: Phase 4 DB table + column rename (organisation -> championship) [NOT YET APPLIED]"
2. `b661be9` — "rebuild preview" (empty marker commit to trigger Netlify redeploy)

These commits have not yet been merged to `main` via a PR.

---

## Production Deploy

- **Live site:** `app.mygridtime.com` (Netlify site: `mygridtime-app`)
- **Built from:** `main` branch, commit **`3c4220b`**
- **Deploy date:** 2026-04-24
- **Commit content:** "MGT-105+106: championship rename internals and admin routes"

The live app code therefore uses `championship` naming throughout (routes, server actions, components, types).

---

## Production Database Alignment

- **Supabase project:** `mygridtime-app` (NANO tier, `eu-west-1`, PostgreSQL 17.6.x, `ACTIVE_HEALTHY`)
- **Migration applied:** The `organisation → championship` rename migration (`20260424000000_mgt_107_rename_org_to_championship.sql`) was applied to the production database on **2026-04-24**.
- **Tables now in production:** `championships`, `championship_members` (and related `championship_id` columns throughout).
- **Alignment status: ✅ ALIGNED.** Live app code and live DB schema are consistent. No mismatched references in production.

### Migration label clarification

Commit `e6e6ebc` includes the label `[NOT YET APPLIED]` in its message. This referred to the state at write-time. The migration was applied to the production DB afterwards (directly from the feature branch via `supabase db push`, before the code PR was merged to `main`). The label is now misleading in the git history, but the actual DB and code state are consistent. The commit is still unmerged to `main` only because it contains the migration SQL file — the DB change itself has already landed in production.

---

## Build Phase Completion

| Phase | Description | Status |
|---|---|---|
| **0** | Repo / Deploy foundation (Next.js 14, Tailwind, TypeScript, Netlify, Sentry, PWA manifest) | ✅ Complete |
| **1** | Auth (Supabase magic link, OAuth callback, middleware session refresh, admin route guard) | ✅ Complete |
| **2** | Database schema (16+ migrations, RLS policies, hand-typed `database.ts`) | ✅ Complete |
| **3** | Admin CRUD (championship management, event lifecycle, drag-drop timetable builder, member invites, version history, templates, audit log) | ✅ Complete |
| **4** | Public timetable views (`/[slug]`, `/[slug]/[eventSlug]`, print views, 308 redirects from old `/o/[slug]` paths) | ✅ Complete |
| **5** | Email notifications (Resend, 10-min debounce, HTML/plain templates, opt-in triggers, `List-Unsubscribe`, token-based unsubscribe) | ✅ Complete |
| **6** | Multi-org / Templates (cookie-based active championship, template save/load/delete, cascade-delete rollback, first-org onboarding redirect) | ✅ Complete |
| **7b** | AI extraction — Claude Vision (upload, extract, preview, create-from-extraction server actions; rate limiting; retention cron) | ⚠️ Partially shipped |
| **7a** | PWA / Web Push | 🔲 Stub only — `sw.js` is a 4-line placeholder, no `web-push` package |
| **7c** | Stripe / Paid Alerts | 🔲 Empty stub — webhook returns 501, no `stripe` package |
| **7d** | Community Updates | 🔲 Absent — spec exists but no code |

**Phases 0–6 are fully implemented and committed. Phase 7 (paid B2C consumer layer) is the remaining commercial work.**

The test suite has 79 unit tests (Vitest, alongside source files). No E2E tests exist.

---

## Staging Environment

- **Supabase project:** `mygridtime-staging` (MICRO tier, `eu-west-1`, PostgreSQL 17.6.x, `ACTIVE_HEALTHY`)
- **Sizing inversion risk:** Staging is on a MICRO tier; production is on a NANO tier. Staging is larger than production. If the application is memory- or resource-constrained in production, staging will not surface the issue.
- **Migration parity:** Staging migration history was not verified in the 2026-06-19 recon. Unknown whether all 17 migrations are applied there.
- **Env var wiring:** Netlify per-context env vars (production vs deploy-preview vs branch) are managed solely in the Netlify dashboard — not visible in `netlify.toml`. It is unconfirmed whether deploy previews target staging or accidentally use production credentials.

---

## Known Cleanup Items

### 1. `seed.sql` uses pre-rename table names (HIGH priority for local dev)
`supabase/seed.sql` still inserts into `organisations` and references `org_id`. After the MGT-107 migration, running `supabase db reset` locally fails at the seed step.  
**Production impact:** None.  
**Fix:** Update `seed.sql` to use `championships` and `championship_id`.

### 2. `.env.local` points to production Supabase (HIGH risk)
The local development env file connects to the **production** Supabase project. Destructive local operations (db reset, bad seed, accidental data mutation) will hit the live database.  
**Fix:** Create `.env.staging.local` pointing to the staging project for destructive/test use.

### 3. `MGT_AI_EXTRACTION_ENABLED` absent from `.env.local.example` (LOW)
The example template is stale and does not include this variable. New contributors will not know to set it.

---

## Open Next Action

**Review the 2 unshipped commits on `mgt-107-rehearsal` and merge the branch to `main`.**

The conditions for a safe merge are met:
- Production DB already has the `championships` schema.
- `main` already has the championship-rename code (MGT-104, 105, 106).
- The 2 commits add only the migration SQL file and an empty rebuild trigger.
- No code conflicts are expected.

After merge, delete the `mgt-107-rehearsal` branch and verify Netlify auto-deploys `main` successfully.

---

## Key Technology References

| Concern | Detail |
|---|---|
| Framework | Next.js 14, App Router, TypeScript, Tailwind CSS |
| Hosting | Netlify (`@netlify/plugin-nextjs`, Node 20) |
| Database | Supabase (PostgreSQL 17.6.x), migrations under `supabase/migrations/` |
| Auth | Supabase magic link + OAuth callback |
| Email | Resend (`RESEND_API_KEY`) |
| AI extraction | Anthropic SDK `@anthropic-ai/sdk ^0.39.0`, `ANTHROPIC_API_KEY` |
| Drag-drop | `@dnd-kit` |
| Error tracking | Sentry (client/server/edge configs) |
| Tests | Vitest, 79 unit tests |

---

*Generated from read-only recon on 2026-06-19. No files were edited, no git writes performed, no migrations run, no deploy commands executed during the recon that produced this snapshot.*
