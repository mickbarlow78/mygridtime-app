# Decisions

## DEC-038: Build identity is surfaced in the UI as `v<version> | <short-hash>`; hash resolved from Git at build time, never from Netlify deploy IDs or runtime network calls

**Decision**: MGT-092 extends the bottom-right footer badge from `v{APP_VERSION}` to `v{APP_VERSION} | {APP_COMMIT_SHA}`. The short hash is computed once in `next.config.mjs` via `execSync('git rev-parse --short HEAD')` at build-config load time and exposed through the existing Next.js `env` block as `NEXT_PUBLIC_GIT_COMMIT_SHA`. `src/lib/version.ts` reads the baked-in value on both server and client bundles. If the `git` command fails (shallow clone, non-git build context), the exported value falls back to `''` and the badge renders plain `v{APP_VERSION}` — the pipe and hash are omitted rather than showing `unknown`.

**Why not Netlify deploy IDs**: Netlify's deploy ID names the *deploy*, not the *code*. Two deploys of the same commit (rollback, rebuild) get different deploy IDs and identical code. The public UI must identify the code, so a screenshot of any page maps to exactly one GitHub commit and one diff. The Git short-hash is the smallest value that makes that mapping unambiguous.

**Why not a runtime fetch**: A runtime hash lookup would add a network dependency to every page render, would need cache-busting, and would give the wrong answer during deploys (stale JS bundle querying a fresher endpoint, or vice-versa). Build-time injection makes the hash a property of the bundle itself — it cannot drift from the code it identifies.

**Why hide the pipe on fallback (vs "unknown")**: the badge is a silent identity marker, not a diagnostic. If the build context has no Git metadata, the user-facing UI should degrade to the prior behaviour (version only) rather than surface an operational artefact. Operators can still confirm the fallback path via the `NEXT_PUBLIC_GIT_COMMIT_SHA` env at build time.

**Scope in this ticket**:
- `package.json` version bumped `0.1.1` → `0.1.2` to mark the release that introduces the new identity format.
- No Git tag created — commit hash is the identity; tagging is a separate concern.
- No new dependency, no DB migration, no env variable required in Netlify config (the Netlify build image already provides the Git checkout that `git rev-parse` needs).

**Rejected alternatives**:
- *Read `process.env.COMMIT_REF`* (Netlify-provided): works on Netlify only, would regress if the build moves or runs locally, and couples the identity layer to a single host.
- *Prebuild script writing a JSON file*: more moving parts (generated file, gitignore entry, import path) for no behavioural gain over `execSync` in `next.config.mjs`.
- *Fail the build when Git is unavailable*: too brittle for local `next build` in contexts where Git is not installed (e.g., container snapshots); user-facing badge gracefully hiding the hash is the right default.

## DEC-037: Role model is three orthogonal axes (PLATFORM / ORG / SUBSCRIPTION); platform staff/support are surfaced honestly in the UI, never relabelled as Owner

**Decision**: MGT-084 aligns the role model to the three-axis shape the product has always implied, and makes the shape visible in the header. Each axis is stored and displayed independently:

| Axis | Column | Values | Default | Who sets |
|---|---|---|---|---|
| Platform | `users.platform_role` | `admin \| staff \| support \| null` | `null` | Internal invite only |
| Org (per org) | `org_members.role` | `owner \| editor` | — | Owner at create; editor via invite |
| Subscription | `users.subscription_status` | `member \| subscriber` | `member` | Signup → member; Phase 7c Stripe flips to subscriber |

**Data migration**:
- `org_members.role = 'admin'` → `'editor'` (current admins lose org-settings access; owner must re-promote if intended)
- `org_members.role = 'viewer'` → row deleted (ex-viewers retain auth via the subscription axis and reach `/my`)
- `org_invites.role IN ('admin','viewer')` → `'editor'` (invites only produce editors under the new model)
- `users.platform_role` CHECK extended to allow `'admin'`; no existing rows change
- `users.subscription_status` added with default `'member'`; every existing row backfills to `member` via the column default

**Badge priority** (top-right pill):

1. `platform_role = 'admin'` → **Admin** (no org qualifier — global)
2. `platform_role = 'staff'` → **Staff — {OrgName}** (scoped to the active org)
3. `platform_role = 'support'` → **Support — {OrgName}** (scoped to the active org)
4. Active org membership → **Owner — {OrgName}** or **Editor — {OrgName}**
5. Else → **Subscriber** or **Member**

**Why staff/support are surfaced as their true label and not as Owner**: `get_user_org_role()` short-circuits platform `admin`/`staff`/`support` to effective `'owner'` so RLS grants cross-org access (DEC-018, unchanged). But *access level* and *identity* are different questions. Labelling a support engineer as "Owner — Acme Ltd" in the header misrepresents what Acme's owner is seeing and breaks audit reasoning ("the owner did X" vs "a support engineer acting as owner did X"). The UI reads the user's true platform role via `computeUserBadge()` while RLS keeps using the effective role — the discriminator is `ActiveOrg.via: 'platform' | 'membership'`, already threaded through from Phase A and preserved on every `writeAuditLog()` call site via `actor_context.via`.

**Rationale**:

- **Three axes because they move independently.** A platform support engineer can also be an org owner (of their own throwaway test org) and also a subscription subscriber (if they paid personally). Collapsing any pair loses information. `org_members.role = 'admin'` was a permission-muddled middle tier — it granted almost-owner power without clear semantics, and two-thirds of the production admin rows were actually meant to be editors. `viewer` duplicated what the subscription axis will cover properly (a read-only account that does not belong to an org), and kept the org axis carrying a role that is not really a role in the org.
- **Editor as the only invitable role is a feature, not a limitation.** Owners are intentionally created only via `createOrganisation()`. A single-value `org_invites.role` CHECK (`'editor'`) makes this invariant explicit in the schema rather than a convention enforced in application code. If a second assignable role is needed later, the CHECK widens in one migration.
- **CHECK constraint in the role migration + RLS body rewrite as a separate migration.** The first migration rewrites data and tightens the CHECK — that is enough for correctness, because `'admin'` can never reappear in `org_members.role` once the CHECK is in place. The surviving `IN ('owner','admin','editor')` clauses in RLS bodies become dead code. The second migration is pure clean-up (drift-audit hygiene so `pg_policies LIKE '%''admin''%'` returns zero rows); policy *names* are preserved — renaming policies widens the migration for no correctness gain, so the historical `_admin` / `_owner_admin` suffixes become labels, not claims.
- **`is_platform_staff()` OR-clauses preserved byte-for-byte.** The RLS cleanup migration rewrites `USING` / `WITH CHECK` bodies only; every existing `is_platform_staff()` OR on SELECT policies is copied across unchanged so DEC-018 cross-org platform access keeps working without re-verification.
- **Pre-deploy audit script**. Before the role migration runs, operators should list the users who will lose `admin` → `editor` and who will be deleted as `viewer`:
  ```sql
  SELECT om.user_id, u.email, o.name, om.role
  FROM   org_members om
  JOIN   users u ON u.id = om.user_id
  JOIN   organisations o ON o.id = om.org_id
  WHERE  om.role IN ('admin','viewer');
  ```
  Output is a punch list for owners who want to re-promote intended admins before the migration applies.

**Rejected alternatives**:

- *Keep `org_members.role = 'admin'` alongside `'editor'`*: retained the permission muddle that motivated the ticket. No product surface needed the middle tier — the settings surface is owner-only, event editing is editor-or-above, and cross-org platform work already flows through `get_user_org_role()`'s short-circuit. Three values on one axis with no distinguishable product behaviour between two of them is a leaky abstraction.
- *Label platform staff as "Owner — {OrgName}" to keep the header compact*: dishonest. A support engineer clicking through a customer org should see that they are acting as Support, and the customer's own audit trail should read "Support — Acme Ltd" on actions taken during a support session. Cross-referencing `audit_log.actor_context.via` ('platform' vs 'membership') and the header badge against each other is how an owner verifies their org has not been touched out-of-band.
- *Put the subscription axis on `org_members` as a per-org flag*: makes orgless consumer users (the whole point of the subscription tier) unrepresentable. Subscription is a property of the **user**, not of any single org relationship.

**Scope**:

- Applies to every auth surface: `/admin/*`, `/my/*`, invite acceptance flow, `/auth/callback` post-login routing.
- Does not apply to the public `/(public)` routes — they remain unauthenticated and unchanged.
- `writeAuditLog()` call sites remain unchanged: `actor_context` was already widened in Phase A (DEC-018) and carries the `via` discriminator; no new columns, no new payload shape.

**Verification**:

- Post-migration: `SELECT count(*) FROM org_members WHERE role NOT IN ('owner','editor')` returns 0. `SELECT subscription_status, count(*) FROM users GROUP BY 1` shows every row defaults to `'member'`.
- Drift audit: `SELECT policyname FROM pg_policies WHERE qual LIKE '%''admin''%' OR with_check LIKE '%''admin''%'` returns zero rows after the cleanup migration.
- Browser: dev admin reads **Owner — {OrgName}**; flipping `platform_role = 'admin'` reads **Admin** (no org qualifier); `'staff'` reads **Staff — {OrgName}**, **not** Owner; `'support'` reads **Support — {OrgName}**. Orgless user with `subscription_status = 'subscriber'` reads **Subscriber** on `/my`. Invited editor sees `/admin/orgs/settings` 403 via the `requireOwner()` gate.

**Tickets**: MGT-084 (roles foundation + header badge).

**Related**: Supersedes the implicit 4-way `org_members.role` union that Phase 0 shipped. Does not supersede DEC-018 — that document still governs the effective-owner short-circuit for RLS; DEC-037 only adds that the UI label must reflect the **true** platform role, not the effective one.

---

## DEC-036: Event slugs are unique per organisation; canonical public URL is nested (`/{orgSlug}/{eventSlug}`) — supersedes DEC-022 for event routing

**Decision**: MGT-082 fixes a production bug where creating a second event titled the same as any existing event in the system failed with `duplicate key value violates unique constraint "events_slug_key"`. The fix makes event slugs unique *only within the owning organisation* and moves the canonical public event URL to `/{orgSlug}/{eventSlug}`.

Concrete changes:

1. **Database** — `supabase/migrations/20260420000000_events_slug_org_scoped.sql` drops the global `events_slug_key` unique constraint and replaces it with a composite `UNIQUE (org_id, slug)` (`events_org_id_slug_key`). `NOT NULL` on `slug` is preserved.

2. **Routing**:
   - New canonical route `/[slug]/[eventSlug]/page.tsx` (+ `/print`) resolves the org first, then fetches the event by `(org_id, slug)`.
   - Top-level `/[slug]/page.tsx` now resolves **organisations first**. If the slug does not match any org, it falls through to a legacy resolver that 308-redirects to the canonical nested URL iff *exactly one* published event in the system still uses that slug. Multiple matches → 404 (ambiguous under per-org uniqueness), zero matches → 404.
   - Legacy `/[slug]/print/page.tsx` applies the same 308 fallback for print URLs; otherwise 404.
   - Reserved top-level slugs (`/admin`, `/api`, `/o`, …) remain blocked at org creation via `isReservedSlug`.

3. **Create / duplicate / template flows** — the previous `generateUniqueSlug` auto-suffix helper (`round-1`, `round-1-2`, `round-1-3`…) is replaced by an org-scoped `computeEventSlug` pre-check in `src/app/admin/events/actions.ts` and `src/app/admin/templates/actions.ts`. If the slug is already taken within the org, the action returns a handled validation error `"An event with this title already exists in this organisation. Please choose a different title."` — surfaced verbatim in the existing `ERROR_BANNER` on `/admin/events/new`. Unexpected DB errors during the pre-check still go to Sentry under `tags.action = 'computeEventSlug'`.

4. **Link generators** updated to emit canonical nested URLs: `src/app/sitemap.ts`, `src/lib/resend/notifications.ts` (publish / updated emails), `src/app/(public)/page.tsx` (landing), `src/components/public/PublicOrgView.tsx`, `src/app/my/[timetableId]/page.tsx`, and `src/components/admin/EventEditor.tsx` (admin URL preview + copy-URL). `revalidatePath` calls in `src/app/admin/events/actions.ts` now invalidate both `/[orgSlug]/[eventSlug]` and `/[slug]` so org landing and event pages are refreshed together.

5. **Org cross-table slug check preserved**: `createOrganisation` still rejects a new org slug that collides with any existing event slug. Under DEC-036, this is no longer required for DB integrity (events live under a nested path) but it is still required for **legacy URL stability** — otherwise creating an org named after a legacy event slug would shadow the 308 redirect for that slug. The cost is one extra `SELECT` on a unique-indexed column at org creation; acceptable.

**Why nested canonical URL rather than keeping `/{eventSlug}` + per-org uniqueness**: Per-org uniqueness alone would allow two different orgs' events to claim the same slug, at which point `/{eventSlug}` would have to pick one or offer a disambiguation page — both of which are silent-collision footguns the product intent is trying to avoid. A nested URL makes the org context explicit in the URL itself and means "which event is this?" has a single deterministic answer.

**Why no auto-suffix on duplicate slugs**: Auto-suffix (`round-1`, `round-1-2`, `round-1-3`) produces URLs the user never chose and can't predict, which is particularly bad for printed collateral, QR codes, and shared links — the typical lifecycle of a public event URL. A handled validation error with a clear message puts the user back in control of their URL. (This also removes a class of race-condition bugs where two concurrent creates could both read `round-1` as taken, both compute `round-1-2`, and have the second insert fail at the constraint.)

**Why 308 and not 301 for legacy redirects**: 308 preserves method semantics (identical behaviour for GET; no method rewrite on POST) and signals permanence. Matches the existing `/o/{slug}` → `/{slug}` redirect introduced under DEC-022.

**Alternatives considered**:
- Keep global uniqueness and auto-suffix indefinitely. Rejected — the bug that triggered this ticket is exactly the auto-suffix path failing when the suffix space is narrow (every `round-1` variant across every org collides in one namespace).
- Add a hidden randomised suffix (`round-1-x4f7`). Rejected — same URL-stability problem as numeric suffixing, and makes URLs uglier.
- Keep global uniqueness but widen the slug to include a date or org prefix automatically. Rejected — couples two unrelated identifiers (org + event) into a single user-visible string without making the org context navigable; the nested-URL option is strictly better.
- Return the raw Postgres `duplicate key` error to the UI. Rejected — leaks schema internals; the friendly message is a small wrapper that also lets us handle the rare case where `slugify(title)` produced an identical slug for two differently-titled events in the same org.

**Backward safety**: The migration drops `events_slug_key` and immediately adds the composite constraint, so there is no window where events can be inserted with duplicate `(org_id, slug)`. Existing events are unchanged — no data movement. Legacy shared URLs `/{eventSlug}` continue to resolve via 308 as long as exactly one event retains that slug; once a second event in another org picks the same slug the legacy resolver returns 404 (the expected behaviour under the new model — a legacy share can't disambiguate).

**Relationship to DEC-022**: DEC-022 established the top-level `/{orgSlug}` + top-level `/{eventSlug}` model and the org-creation cross-table slug check. DEC-036 supersedes DEC-022 for **event routing only** — `/{orgSlug}` for the org page is unchanged, reserved slugs are unchanged, the cross-table check is preserved (now for legacy URL stability rather than routing correctness). DEC-022's "Status" is updated to mark the event-routing portion superseded.

**Date**: 2026-04-20

**Status**: Active — shipped 2026-04-20 via MGT-082.

---

## DEC-035: 30-day retention for `ai_extraction_log` + `event-extractions` storage runs via an authenticated cron route that delegates to a shared helper

**Decision**: MGT-081 closes the deferred 30-day retention story for the `event-extractions` Storage bucket and the matching `ai_extraction_log` rows. The retention logic lives in one shared helper — `runExtractionRetention({ admin, olderThanDays = 30, now })` in `src/lib/retention/extractions.ts` — called from two entry points: (a) a new authenticated `GET /api/cron/retention-extractions` route (`export const dynamic = 'force-dynamic'`, `runtime = 'nodejs'`) that bearer-auths against `CRON_SECRET` (401 on mismatch, 503 when the secret is not configured on the server), and (b) a manual runner `npm run retention:extractions` that fetches the same route with the same bearer, so both paths exercise identical production code. The helper pages through old rows in batches of 1000, chunks storage removals in groups of 100, removes storage objects first, and only deletes the DB rows whose objects were confirmed removed (or whose `source_path` is null/empty — no object to remove). Rows whose storage removal errored are left intact for retry on the next run; the returned `storageErrors` array surfaces per-chunk failures. The service-role admin client is used throughout (`createAdminClient()`), matching the existing Storage-write pattern. No schema change, no RLS change, no UI, and no new runtime dependency. Scheduler platform config (Vercel Cron / Netlify Scheduled Functions / GitHub Actions) is explicitly out of scope for this ticket — the route and helper ship ready to be wired up by whichever platform the deploy target chooses.

**Why storage-first, DB-second**: If the DB row is deleted before the storage object and the storage remove then fails, the orphan object is unreachable — there is no index from bucket path back to log row other than the log row itself. By removing the object first and only then deleting the row, a failure at any point leaves a row that can be retried on the next run. The price — a window where the row exists but the object is gone — is harmless: the row still records what happened, and no downstream code reads the object without first reading the row.

**Why one helper, two entry points**: The manual runner exists as a verification shortcut for operators and dev-time smoke checks; the cron route is the production path. Duplicating the logic across a `.mjs` script and a `.ts` route would risk drift in exit conditions, batching, or error handling — the bugs the ticket is specifically trying to prevent. Having the script fetch the route keeps the helper as the single source of truth and means any manual invocation exercises the same auth / admin-client path the production cron will use.

**Alternatives considered**:
- Scheduler config in-repo (Vercel `vercel.json` cron, Netlify `netlify.toml` scheduled function). Rejected for this ticket — platform choice is a deploy-time decision and the ticket is explicit that scheduler wiring is a follow-up. The route is the stable primitive either platform will call.
- DB-first, then storage. Rejected — creates unreachable orphans on partial failure (see above).
- A dedicated retention table or backfill tombstone. Rejected — the existing `source_path` + `created_at` columns are sufficient; adding state would widen the schema for no gain.
- Signed-URL-based deletion. Rejected — service-role already bypasses RLS and is the idiomatic path for admin-scope cleanup.

**Implications**: `CRON_SECRET` is added to `src/lib/env.ts` as `feature-required` (warn everywhere, error nowhere) — the app boots fine without it; hitting the route without the secret simply returns 503. The `event-extractions` bucket migration's "30-day retention cleanup is deferred per KNOWN_ISSUES" comment is now outdated; a future migration touch can strike it, but the comment is descriptive and does not affect behaviour. Retention is idempotent and safe to run repeatedly — calling it a second time with no eligible rows is a no-op.

**Date**: 2026-04-20

**Status**: Active — shipped 2026-04-20 via MGT-081. Scheduler-platform wiring deferred to a follow-up.

---

## DEC-034: Operational QA flows for dev-only tooling live in `docs/QA_RUNBOOKS.md`, separate from `DECISIONS.md`

**Decision**: Manual verification flows that depend on dev-only scripts, routes, or fixtures (starting with the MGT-075 `seed:extractions` / `cleanup:extractions` pair) are documented in a new top-level doc `docs/QA_RUNBOOKS.md`. Each runbook is a self-contained, step-by-step procedure — required env vars inline, command to run, expected browser state, cleanup command, troubleshooting table — written so a new operator can execute the flow end-to-end without opening any script file or source module. Design rationale (why the tool exists, what alternatives were rejected, what the blast radius is) stays in `DECISIONS.md`; runbooks reference the relevant DEC rather than duplicating prose. `docs/README.md` is updated to list the new file alongside the existing four; `docs/PROJECT_STATUS.md` and `docs/LAUNCH_PLAN.md` reference it from the MGT-075 entries so operators land on the runbook when following the scripts.

**Why a dedicated file rather than a `## QA` section in `PROJECT_STATUS.md` or `DECISIONS.md`**: `PROJECT_STATUS.md` is a state snapshot, not a how-to; `DECISIONS.md` is append-only rationale, not procedure. A reviewer trying to run the extraction-log seed should not have to scroll past 33 decisions or 200 lines of state prose to find the command. A dedicated runbook file keeps each concern in one place and gives future runbooks (dev-session auth flow, audit-fixture pattern if ever reintroduced, notification-log replay, etc.) a natural home without growing either of the existing docs.

**Why not the plan (`LAUNCH_PLAN.md`) or `KNOWN_ISSUES.md`**: the plan is roadmap; known issues is defect tracking. Runbooks are neither — they are operational artefacts that describe *how to run existing tooling*, independent of whether the feature is shipped, blocked, or in progress.

**Alternatives considered**:
- Put the runbook inline inside DEC-033. Rejected — DEC-033 is the rationale for the seed/cleanup design (source_path marker, .mjs over ts-node, scripts over dev route); mixing operational steps into that prose makes both jobs harder to read.
- A top-level `docs/RUNBOOKS.md` covering *all* runbooks (not just QA). Rejected for this pass — the only runbooks on the horizon are QA-shaped (dev-only verification, manual browser checks). If a production runbook ever appears (incident response, key rotation, DB recovery), it can live in a sibling `docs/OPS_RUNBOOKS.md` without renaming this one.
- Inline operational steps inside the scripts themselves as expanded top-of-file comments. Rejected — forces the operator to open the script to understand the flow, which is the exact failure mode this doc prevents.

**Implications**: every future dev-only verification tool (scripts, `/api/dev/*` routes, fixture builders) should add a section to `QA_RUNBOOKS.md` at ship time, and the feature's DEC / PROJECT_STATUS entry should cross-link to that section. The runbook file is markdown-only — no code, no migrations, no runtime surface; edits to it do not require a build or redeploy and cannot break the app.

**Date**: 2026-04-20

**Status**: Active — shipped 2026-04-20 via MGT-076.

---

## DEC-033: ExtractionLogView dev verification uses a local-only seed/cleanup script pair with a `source_path` marker — no new runtime surface

**Decision**: MGT-075 introduces a dev-only verification harness for the `ExtractionLogView` panel (DEC-032) as two Node scripts — `scripts/seed-extraction-log.mjs` and `scripts/cleanup-extraction-log.mjs` — wired through npm as `seed:extractions` / `cleanup:extractions`. Both use the service-role Supabase client (`SUPABASE_SERVICE_ROLE_KEY`) loaded via Node 20's native `--env-file=.env.local`, so no new dev dependency (`dotenv`, `ts-node`, etc.) is added. The seed script resolves the org via `DEV_ADMIN_EMAIL → users.id → org_members (role IN owner/admin/editor)` and inserts 6 rows covering every rendered branch of `ExtractionLogView`: success linked to a live event, success unlinked, success linked to a soft-deleted event (falls back to unlinked when no such event exists), `error` with `error_code`, `rate_limited`, `validation_failed` with `error_code`. Every seeded row carries `source_path = 'seed/mgt-075/<uuid>'`; cleanup deletes via `LIKE 'seed/mgt-075/%'`, so the marker is the single source of truth for "is this a seeded row?" and the pair is idempotent and fully reversible. No DB migration, no RLS change, no new API route, no new env var, no UI change, and no touch of the `extractEventFromUpload()` / `saveExtractedEventContent()` production paths.

**Why a `source_path` marker rather than a dedicated seed flag column**: adding a nullable `seeded boolean` would require a migration, widen the production row shape, and leak dev concerns into a table that the RLS policy already permits member SELECT on. `source_path` is already nullable, already carries the real storage path `{org_id}/{extraction_id}/{ts}.{ext}` in the Phase-B code path, and is never read by the ExtractionLogView UI — it renders only the MIME / byte size / model / tokens / status / error_code columns. Using a sentinel prefix in an existing column is zero-cost in schema terms and the prefix itself is self-documenting for anyone inspecting the table directly.

**Why ship this at all**: MGT-071-BLOCKED leaves the real Claude Vision path unreachable until `ANTHROPIC_API_KEY` is provisioned; in the meantime MGT-073 / MGT-074 shipped the full ExtractionLogView UI surface without a repeatable way to exercise the non-`success` branches (error / rate_limited / validation_failed) or the soft-deleted-event fallback. Reviewers and future maintainers need a one-command way to populate the panel, verify visually, and clean up — matching the spirit of the DEV_ADMIN_EMAIL / `/api/auth/dev-session` pattern already established for dev auth (DEC-010). Scripts rather than a dev route are chosen because the seed is a one-time setup + teardown, not an interactive per-request operation, and because a route would introduce production surface area (404-gated or not) for no gain.

**Alternatives considered**:
- A dev-only `POST /api/dev/extraction-seed` route mirroring DEC-028's audit-fixture pattern. Rejected — MGT-066 already retired DEC-028's route once verification was complete, and adding a new one would re-open the same production-surface footprint for a use case that is fundamentally build-time (seed once, verify, clean up) rather than request-time.
- `ts-node scripts/*.ts` with shared TypeScript types from `src/app/admin/extractions/actions.ts`. Rejected — adds a `ts-node` dev dep and the script only writes to the table; the column shape is enforced by Postgres. `.mjs` with inline field names is the smallest viable surface.
- Marker in `model` field (e.g. `model = 'seed:mgt-075'`). Rejected — `model` is rendered in the UI and non-seed `rate_limited` / `error` rows legitimately have `model = null`; a seed-specific string would be visible in every row and would misrepresent the row to a reviewer reading the panel.

**Implications**: Scripts are dev-only by dependency, not by runtime gate — they require `SUPABASE_SERVICE_ROLE_KEY` which production never exposes to the client or to Node processes outside the `createAdminClient()` path. If a developer accidentally pointed `.env.local` at a production Supabase project, cleanup would still remove exactly the rows the seed inserted (via the sentinel prefix) and nothing else, so the worst-case blast radius is bounded to six rows that carry an obvious marker. The seed is not wired into CI and is not expected to be run during automated verification — it is an on-demand tool for manual browser verification of the panel.

**Date**: 2026-04-20

**Status**: Active — shipped 2026-04-20 via MGT-075.

---

## DEC-032: Extraction log visibility is an org-settings section that queries `ai_extraction_log` directly — no audit_log join, no schema change

**Decision**: MGT-073 adds a read-only `Extraction log` section to `/admin/orgs/settings`, rendered by a new `ExtractionLogView` client component fed by a new `loadExtractionLog(orgId)` server action (`src/app/admin/extractions/actions.ts`). The action selects from `ai_extraction_log` with `users:user_id ( email )` and `events:event_id ( id, title, slug, deleted_at )` joins, orders by `created_at DESC`, and caps at 2000 rows — mirroring the shape of `loadAuditLog()` (DEC-026). The view follows the `OrgAuditLogView` idiom: collapsible panel, client-side filters (status dropdown, date range, free-text search across email / error_code / model / event title), `refreshSignal`-driven reload (DEC-027), subtle 2000-row cap banner. No CSV export and no `was_modified` column in this pass. The page-level `owner | admin` gate at `src/app/admin/orgs/settings/page.tsx` governs visibility; editors cannot see the section even though the underlying RLS policy permits them to read.

**Why no audit_log join for `was_modified`**: `was_modified` lives on the `event.created_from_extraction` audit row detail (DEC-031). Surfacing it alongside the `ai_extraction_log` list would require a second query and a mapping step keyed on `detail.extraction_id`. For MGT-073 the flag remains visible in each event's per-event audit row; the extraction log answers "what attempts happened, which failed, which created events" without needing it. If future demand makes the per-event lookup awkward (e.g. "percentage of extractions accepted unchanged"), promoting `was_modified` to a column on `ai_extraction_log` is a cleaner upgrade path than a cross-table join.

**Why nest under settings rather than a standalone `/admin/extractions` page**: the log is a low-traffic observability surface. Reusing the existing `SettingsPanels` wrapper, its `bumpRefresh` plumbing, and its owner/admin gate keeps the change to two new files plus two wiring edits — no new route, no new nav link, no layout duplication. Editor-role invisibility is the known trade-off: editors hitting the rate limit must ask an admin. A future promotion to `/admin/extractions` (visible to editors) remains trivial and was explicitly deferred.

**Alternatives considered**:
- Standalone `/admin/extractions` page. Rejected for MGT-073 — duplicates the page scaffolding and introduces a new nav link for a surface that admins will consult occasionally, not daily. Deferred to a follow-up if editor visibility becomes a problem.
- Embedding in the existing per-event `AuditLogView`. Rejected — only shows attempts that became events, hiding the exact failure modes (`rate_limited`, `error`, `validation_failed`) the log exists to expose.
- Adding a `was_modified` column via audit_log join. Rejected in this pass as a scope expansion — the flag is already visible per-event and adding a second query for a secondary signal violates the "minimal scope" constraint on MGT-073.

**Implications**: mock-path extractions (`MGT_AI_EXTRACTION_ENABLED=false`) are invisible here by design — the mock path at `src/app/admin/events/extract/actions.ts:160` returns without writing an `ai_extraction_log` row. The empty-state copy documents this so reviewers don't mistake it for a bug. Soft-deleted event links render as `(event deleted)` rather than a dead hyperlink. The `error_code` column shows raw strings with no label map, so new codes appear without a docs change.

**Date**: 2026-04-20

**Status**: Active — shipped 2026-04-20 via MGT-073; presentation-only UX polish follow-up shipped 2026-04-20 via MGT-074 (empty-state redesign, dismissible mock-mode tip banner, status-pill dot + tooltip, "Updated ·" indicator, "Clear filters" reset — no query/schema/API change, DEC-032 architecture unchanged).

---

## DEC-031: Extraction review step derives `was_modified` via `JSON.stringify` diff and logs it through existing `ExtractionMeta` — no DB schema change

**Decision**: MGT-072 formalises the review contract between AI extraction and event creation without adding a new screen or persistence column. `ExtractionPreview` captures the server-returned `ExtractedEvent` into a `useRef` pristine snapshot on first render, then at confirm time computes `wasModified = JSON.stringify(pristineRef.current) !== JSON.stringify(state)` and passes it via a widened `onConfirm(edited, wasModified)` callback. The flag is threaded through the existing `ExtractionMeta` object (new optional field `was_modified?: boolean`) into `saveExtractedEventContent` and rides along in the existing `event.created_from_extraction` audit row — no migration, no new column.

**Why `JSON.stringify` and not a deep-equals helper**: the repo has no existing deep-equals utility and no lodash; `ExtractedEvent` is plain serialisable data with no `Date`/`Function`/`Symbol` values; mutations always go through `updateMeta`/`updateDay`/`updateEntry` which spread onto existing objects so key order is stable. The flag is a log-only signal (audit colour, not business logic), so the one-line inline compare is the minimal fit. A future refactor that reorders keys could false-positive the flag — acceptable trade-off given it never drives persistence or control flow.

**Why no dedicated column**: a `was_modified` boolean is useful observability but is not load-bearing on any user-facing behaviour. Adding a column would require a migration, a backfill story, and a typed Supabase row shape — disproportionate for a signal whose only consumer today is the human reading an audit row. If it ever needs to become queryable (e.g. "percentage of extractions accepted unchanged"), it can be promoted from the JSON `meta` into a column in a later, targeted migration.

---

## DEC-030: AI extraction calls Claude Vision via forced tool-use, archives every upload, and soft-caps at 20 extractions per org per 24 hours

**Decision**: MGT-070 Phase B wires `extractEventFromUpload()` to a real Claude Vision call via `extractWithClaude()` in `src/lib/ai/extract.ts`. The call uses `@anthropic-ai/sdk`'s `messages.create` with `tool_choice: { type: 'tool', name: 'emit_event' }` against a JSON schema that mirrors `ExtractedEvent` — the model cannot return free-text prose, only a structured `tool_use` block. After parsing the block, the existing hand-written `isExtractedEvent()` guard is run; any mismatch throws `ExtractValidationError` and is logged as `validation_failed`. The system prompt is prompt-cached (`cache_control: { type: 'ephemeral' }`) so subsequent extractions in the same 5-minute window reuse the cached tokens. Default model is `claude-sonnet-4-6`, overridable via `MGT_EXTRACT_MODEL`.

The whole feature is gated on `MGT_AI_EXTRACTION_ENABLED`: when unset or `"false"`, `extractEventFromUpload()` returns the existing `MOCK_EXTRACTED_EVENT` fixture so preview / staging envs still demo the UX without an API key or credit cost. When enabled, a rate-limit pre-flight counts `ai_extraction_log` rows for the caller's org with `status='success'` in the last rolling 24 hours; at ≥ 20 the action writes a `rate_limited` row (so the rolling count stays accurate) and returns the single explicit user-facing error `"Daily extraction limit reached. Please try again tomorrow."` — no Claude call is made. Successful calls upload the original bytes to a private Supabase Storage bucket `event-extractions` at `{org_id}/{extraction_id}/{ts}.{ext}`, then write a `success` row carrying the extraction UUID, model id, input/output tokens, and the storage path. On `saveExtractedEventContent()` success, the log row is linked to the created event (`event_id = …`) so we can trace from any event back to its original upload.

**Context**: Options considered for the model contract were (a) free-text JSON output parsed with a tolerant parser, (b) Anthropic's structured-output mode, (c) forced tool-use. Tool-use won because the JSON schema matches the existing `ExtractedEvent` contract almost 1:1, the guard step is cheap, and prose hallucinations become impossible by construction — the model must call `emit_event` exactly once. Options considered for the rate limit were (a) token-bucket in Redis, (b) per-user vs per-org, (c) per-org per-day counted from `ai_extraction_log`. The log-counted approach was picked: no new infra (the log table is needed for observability anyway), the window is naturally rolling, and the 20/day cap is generous for legitimate use (a single admin processing a whole season's schedule) while being tight enough that a runaway script is caught inside one day of spend. Per-org rather than per-user prevents gaming via multiple admins on the same org. Storage retention is kept at 30 days but the cleanup cron is deferred — the bucket is private, the `source_path` on the log row stays queryable, and 30 days of karting-schedule PDFs on the Supabase plan is negligible.

**Alternatives considered**:
- Free-text prose + regex parsing. Rejected — brittle, no type safety on the model side, and the parse step would need to re-implement the guards we already have.
- Anthropic structured outputs. Rejected for this pass — tool-use is already supported in the same SDK call and the `tool_choice` forcing is explicit. We can migrate later if structured outputs become the recommended primitive.
- Rate limit via a dedicated counter table or Redis. Rejected — `ai_extraction_log` is the counter. Reusing it keeps schema + infra minimal and the count is trivially joinable with model/token data for future cost reporting.
- Per-user rate limit. Rejected — an org with three admins on the same seat would hit 60/day while a solo admin gets 20. Org-scoped matches billing semantics.
- Make `ANTHROPIC_API_KEY` `server-required` so prod boot fails without it. Rejected — the feature flag already governs whether the key is needed. Matching the `RESEND_API_KEY` / `EMAIL_FROM` `feature-required` pattern means an env missing the key boots cleanly into the mock path, which is useful for preview deploys.

**Implications**: Real extraction costs Anthropic tokens per call; the log carries per-call token counts so billing reconciliation is trivial. Phase A audit rows (`mock: true`) and Phase B rows (`model: "..."`) coexist — `OrgAuditLogView`'s generic detail pretty-printer renders both correctly without a discriminated renderer. The `ai_extraction_log` RLS policy restricts SELECT to `owner`/`admin`/`editor` via `get_user_org_role()`, so cross-org reads are impossible. The Storage bucket's first-path-segment RLS scoping means a URL leak cannot expose files from another org — even if a signed URL were generated (none are in this pass), the bucket is private and any direct read goes through RLS.

**Status**: Active — shipped 2026-04-17 via MGT-070.

---

## DEC-029: AI-assisted event extraction ships UX + data-path first with a mock server-action response; real model integration follows in a separate pass

**Decision**: MGT-069 delivers the full upload → editable-preview → create-event UX on `/admin/events/new` using a hardcoded mock response from `extractEventFromUpload()` (`src/app/admin/events/extract/actions.ts`) — no `@anthropic-ai/sdk`, no `ANTHROPIC_API_KEY`, no `ai_extraction_log` table, no Storage bucket, no rate limiting. The server action still hard-gates on `requireEditor()`, re-validates the file's MIME and byte length (PDF/PNG/JPG, 10 MB cap) on entry, and waits 800 ms before returning the truncated `MOCK_EXTRACTED_EVENT` fixture from `src/lib/ai/extract.ts` — so the loading state is observable and the contract matches what a real Claude Vision tool call will produce. Every audit row emitted by the flow carries `detail.mock = true` alongside `source_mime`, `source_bytes`, `day_count`, which keeps the Phase A rows filterable in `OrgAuditLogView` after the Phase B cutover. The shared `ExtractedEvent` / `ExtractedDay` / `ExtractedEntry` types + type guards in `src/lib/ai/extract.ts` are the single source of truth that both the mock (today) and the real model response (MGT-070) must satisfy, so MGT-070 can swap the action's body without any UI or contract churn.

**Context**: The original single-ticket plan for MGT-069 bundled UX delivery with a real Claude Vision call, a new `ai_extraction_log` table + RLS policy, a private Supabase Storage bucket with 30-day retention, and a per-org 20-extractions/24h rate limit. That scope was large enough to slow the first reviewable drop. Splitting into Phase A (UX + mock) and Phase B (real integration + observability + guardrails — MGT-070) de-risks the UX surface independently of the model-integration surface, keeps each ticket shippable in one sitting, and lets us demo the flow to users before paying any external-API cost. The Phase A fixture is a believable two-day karting event with mixed `is_break`, `end_time: null`, and `category: null` values so the preview UI exercises every render branch without needing a calendar-aware fixture. `truncateExtractedEvent()` runs over the fixture before it leaves the server so overlong values can never reach the insert path even if a future edit to the fixture (or a schema-valid but verbose model response) slips through.

**Alternatives considered**:
- Ship the real Claude Vision integration in one pass. Rejected — ties UX review to model-prompt tuning and forces the first review to cover the Anthropic SDK, env-var plumbing, `ai_extraction_log` RLS, and Storage retention semantics simultaneously. Any one of those reveals a surprise late in review and the whole ticket slips.
- Gate the Phase A mock UX behind a feature flag. Rejected — the mock flow is safe to expose by default (no external cost, no production data risk beyond a normal `createEvent()` call), and a flag would carry rollback weight without any corresponding risk reduction. MGT-070 introduces `MGT_AI_EXTRACTION_ENABLED` specifically because the real flow has external cost.
- Validate the extracted shape with zod. Rejected in Phase A — zod is not a project dependency and the plan's "no new runtime deps" spirit favours hand-written type guards in `src/lib/ai/extract.ts` mirroring the `isMetaChanges` pattern already used by `AuditLogView.tsx`. The same type guards remain usable in Phase B against the real model response, so the choice is forward-compatible rather than path-locked.

**Implications**: `/admin/events/new` has three tabs (`From scratch`, `From template`, `From PDF / image`). Any valid PDF/PNG/JPG under 10 MB produces the same mock event — acceptable because this phase is proving the plumbing, not the extraction quality. Audit rows carry `mock: true`; Phase B flips that to `{ model, tokens_input, tokens_output }`. Phase A rows stay filterable via the explicit `mock: true` marker post-cutover. No migration is needed for Phase A; Phase B introduces both the `ai_extraction_log` table and the `event-extractions` Storage bucket via their own migrations.

**Status**: Active — shipped 2026-04-17 via MGT-069. Phase B shipped 2026-04-17 via MGT-070 (see DEC-030).

---

## DEC-028: Dev-only route for exercising the positive `target_email` audit branch

**Decision**: A dev-only `POST /api/dev/audit-fixture` route handler
(`src/app/api/dev/audit-fixture/route.ts`) inserts synthetic `org_member.role_updated`
and `org_member.removed` audit rows with caller-supplied non-null `target_email`
values by invoking the shared `writeAuditLog()` helper (`src/lib/audit.ts:81`) through
the caller's authenticated Supabase client. The route is hard-gated on
`NODE_ENV === 'development'` (returns `404` in every other environment, matching the
DEC-010 `/api/auth/dev-session` gate verbatim), additionally requires
`DEV_ADMIN_EMAIL` to be set and the session email to match, requires the request's
`orgId` to match the caller's active org, and requires the caller to hold
`owner` or `admin` role in that org. The detail-payload shape matches the exact
fields written by `updateMemberRole()` / `removeMember()` in
`src/app/admin/orgs/actions.ts:426-438,495-507`, and `actor_context` is stamped via
the shared `makeActorContext()` helper so the fixture row is structurally
indistinguishable from a production write. Rejected alternatives: (a) a raw SQL
snippet in docs — not repeatable without Supabase-console access and easy to get
the payload shape wrong against the hardened `audit_log_scope_xor` CHECK; (b) a
service-role client bypass — introduces a second audit write path and widens the
trust surface for no functional gain, since the fixture doesn't need to bypass
RLS for the *target user*, only inject a known `target_email` string into the
detail payload; (c) extending `updateMemberRole()` / `removeMember()` with a dev
flag — explicitly violates the "no backend production changes" constraint.

**Reason**: MGT-063 closed the positive-branch by inspection but left the live
UI and CSV rendering paths (`OrgAuditLogView.tsx:160,165,269,285`) unexercised
end-to-end. The `users_select_own` RLS policy nulls `users.email` for every
non-self row in the `updateMemberRole()` / `removeMember()` joins, so
`target_email` is always `null` on live org audit rows and the non-null branch
is unreachable by any production action. Sole-owner guards block the
self-target workaround. A dev-only route that shares the `writeAuditLog()`
invariants (XOR scope `CHECK`, RLS, Sentry-swallowed failure mode) lets the
branch be exercised in dev without any production-code, schema, RLS, or
event-audit change. Sharing the writer preserves the single-source-of-truth
property of DEC-025 (no second write path that could drift from the
production shape). The dev-only + `DEV_ADMIN_EMAIL` + active-org match triple
gate means the route cannot write audit rows in production even if the
`NODE_ENV` gate were somehow bypassed.

**Date**: 2026-04-17

**Status**: Closed — dev fixture removed via MGT-066 (2026-04-17). Route was dev-only (NODE_ENV + DEV_ADMIN_EMAIL guarded); no production impact. Positive-branch audit UI verification complete.

---

## DEC-027: Org-settings live audit refresh uses a client wrapper, not React Context

**Decision**: The live-refresh plumbing for `OrgAuditLogView` on `/admin/orgs/settings` lives in a single colocated `'use client'` wrapper — `src/app/admin/orgs/settings/SettingsPanels.tsx` — rather than a new React Context provider. The wrapper owns `const [refreshSignal, setRefreshSignal] = useState(0)` plus a `bumpRefresh` helper, renders the four interactive sections (org name, slug, branding, members & invites, audit log) inline with their existing `<section>` + `H2` markup, and passes `onSaved={bumpRefresh}` to `OrgNameForm`, `BrandingForm`, `MemberManager` and `refreshSignal={refreshSignal}` to `OrgAuditLogView`. The settings page stays a server component and delegates the entire panel stack (plus the static slug card) to `<SettingsPanels … />`, keeping breadcrumb, H1, and subtitle at the server layer. Mirrors DEC-023 exactly: the `EventEditor` → `AuditLogView` pattern for events is reused wholesale for the org surface.

**Reason**: The page already parallel-fetches org, members, invites, and audit entries server-side — a Context provider would force either a second fetch layer or awkward prop-then-context re-declaration, and would add an abstraction that exists to serve a single one-page relationship. One local `useState` + one callback prop per form is the minimum-surface signal that reuses the already-established `OrgAuditLogView.useEffect → allLoaded = false` retry path (shipped inert in MGT-057). The wrapper also keeps the server page small: auth, `getActiveOrg`, and the `Promise.all` data fetch stay on the server; all `'use client'` state lives in one file. Putting the slug card inside the wrapper (even though it has no state) is a readability call — the four visible sections stay visually adjacent in one source file rather than being interleaved between server and client components in the page. The event-side pattern (DEC-023) is the authoritative precedent for audit-refresh signalling in this codebase, so the choice is "same shape, second surface" rather than a new idiom.

**Date**: 2026-04-17

**Status**: Active — shipped with MGT-058

---

## DEC-026: Audit log read layer is scope-polymorphic via `loadAuditLog(scope: AuditScope)`

**Decision**: The audit log read layer mirrors the write layer's scope contract (DEC-025). A single server action `loadAuditLog(scope: AuditScope)` in `src/app/admin/audit/actions.ts` accepts the discriminated union `{ eventId: string } | { orgId: string }` already exported from `src/lib/audit.ts` and dispatches to `.eq('event_id', …)` or `.eq('org_id', …)` on the `audit_log` table. The `AuditLogEntry` row-shape type moves from `src/app/admin/events/actions.ts` to `src/lib/audit.ts` so both the event-side and audit-side action files reference one source. RLS (`audit_log_select_admin`) remains the sole access gate for both branches — the loader only requires an authenticated user, consistent with the existing `loadAllAuditLog()` pattern. `loadAllAuditLog(eventId)` stays exported from `src/app/admin/events/actions.ts` as a thin delegator (`return loadAuditLog({ eventId })`) and `AuditLogEntry` is type-re-exported from the same module, so `AuditLogView`'s imports at `src/components/admin/AuditLogView.tsx:5` are unchanged. The 2000-row safety cap and row-mapping shape are preserved verbatim. `loadMoreAuditLog(eventId, cursor)` at `src/app/admin/events/actions.ts:1280` is deliberately **not** unified in this pass — it is a cursor-pagination fallback, not the primary flow (DEC-014), and the forthcoming org-audit UI will reuse the `loadAll` path.

**Reason**: MGT-055 wrote org-scoped rows to `audit_log` but left the read layer event-only, so those rows were invisible to any UI. Before the org-audit surface can ship, the read layer needs the same compile-time scope-branch safety the writer has. Putting the shared loader in a dedicated `src/app/admin/audit/actions.ts` (rather than extending events/ or orgs/) keeps the audit read layer independent of both action groups and avoids the naming anomaly of an "events" file owning an org-scoped reader. Centralising `AuditLogEntry` in `src/lib/audit.ts` removes the implicit circular-import risk that would otherwise appear once orgs/actions.ts starts reading audit rows. Keeping `loadAllAuditLog(eventId)` as a one-line delegator (rather than renaming all call sites) holds the "NO UI changes in this task" boundary — the prep refactor ships without touching any component — and lets the next MGT ticket (org-audit UI) land as a pure consumer of the new API. Leaving `loadMoreAuditLog` event-only is a scope call: per-scope volumes remain small (DEC-014's 2000-row cap has never been hit in practice), and the org UI will reuse the `loadAll` path; unifying the cursor variant speculatively would add surface area for no current caller.

**Date**: 2026-04-17

**Status**: Active — shipped with MGT-056

---

## DEC-025: `audit_log` is dual-scoped — exactly one of `event_id` / `org_id` per row

**Decision**: The `audit_log` table is now scoped to either an event **or** an organisation, enforced by a DB `CHECK` constraint (`audit_log_scope_xor`: `((event_id IS NULL) <> (org_id IS NULL))`). A nullable `org_id uuid REFERENCES organisations(id)` column is added alongside the existing nullable `event_id`. The shared `writeAuditLog()` helper in `src/lib/audit.ts` now takes a discriminated-union `scope: { eventId: string } | { orgId: string }` argument — the helper writes one of the two columns based on the branch and leaves the other `NULL`. Both the INSERT policy (`audit_log_insert_members`) and the SELECT policy (`audit_log_select_admin`) are re-created to cover both branches (event rows via `event_id IN (SELECT e.id FROM events e WHERE get_user_org_role(e.org_id) IN (...))`, org rows via `get_user_org_role(org_id) IN (...)`), with INSERT permitted for `owner | admin | editor` and SELECT restricted to `owner | admin`. Admin-client audit fallback is explicitly rejected — every `writeAuditLog()` call goes through the caller's authenticated Supabase client so RLS remains the single source of truth for who can write an audit row to which scope. Platform-staff access inherits both branches automatically via DEC-018's `get_user_org_role()` short-circuit; no separate platform clause is added to either policy.

**Reason**: Closing MGT-054's zero-audit-coverage gap in `src/app/admin/orgs/actions.ts` required a scope the table did not have — the pre-existing `event_id`-only shape could not represent `organisation.created`, membership changes, or branding edits without a fake event. A nullable `org_id` with an XOR `CHECK` is the smallest schema change that covers the eight org-scoped actions while preserving the existing event-scoped behaviour untouched; a separate `org_audit_log` table was considered and rejected because every read path (`AuditLogView`, future admin reporting) would need to UNION both tables. A discriminated-union `scope` argument forces call sites to commit to one branch at compile time, so R1 (malformed scope violating the CHECK) is caught at typecheck and cannot land in production. Keeping audits on the authenticated client means a compromised or misused code path can only write rows the caller is permitted to — consistent with the rest of the admin server-action layer and with DEC-014's "no service-role fallback on user-initiated writes" principle. Admin-client fallback would have widened the trust surface for no functional gain; platform staff already have org coverage via DEC-018.

**Date**: 2026-04-17

**Status**: Active — shipped with MGT-055

---

## DEC-001: Notifications are opt-in

**Decision**: All notifications (publish and save) require explicit user opt-in before sending.

**Reason**: Auto-sending on publish caused unintended notifications. Users must control when recipients are contacted. The save flow already implements this correctly via a checkbox in the review modal.

**Date**: 2026-04-13

**Status**: Active — both save and publish flows now require explicit opt-in (MGT-001 resolved)

---

## DEC-002: Metadata-only changes do not notify

**Decision**: Changes to event metadata (title, venue, dates, timezone, notes) do not trigger notifications, even if the event is published.

**Reason**: Only substantive timetable changes (entry add/remove/edit/reorder) are relevant to attendees. Metadata edits are administrative.

**Date**: 2026-04-13

**Status**: Active

---

## DEC-003: Reorder changes are substantive

**Decision**: Reordering timetable entries counts as a substantive change and can trigger notifications (if user opts in).

**Reason**: Entry order affects the schedule attendees follow. A reorder changes the effective timetable.

**Date**: 2026-04-13

**Status**: Active

---

## DEC-004: 10-minute notification debounce per recipient per event

**Decision**: Notifications are debounced with a 10-minute window, scoped per recipient email and per event, enforced server-side via `notification_log` queries.

**Reason**: Prevents duplicate emails from rapid saves, double-clicks, or repeated publishes. Per-recipient scoping allows independent tracking.

**Date**: 2026-04-13

**Status**: Active

---

## DEC-005: MVP-first approach

**Decision**: Ship core functionality first. No over-engineering, no speculative features. Phase 7+ features (push notifications, AI extraction, payments, SMS) are deferred until core is stable.

**Reason**: The product must be usable and reliable before expanding scope. Stubs exist for future phases but are not active.

**Date**: 2026-04-13

**Status**: Active

---

## DEC-006: Supabase with Row Level Security

**Decision**: Use Supabase (PostgreSQL) with RLS policies as the primary data and access control layer. All row-level authorization is enforced at the database level via `get_user_org_role()`.

**Reason**: Centralises security enforcement. Server actions don't need manual auth checks — RLS handles it. Reduces surface area for access control bugs.

**Date**: 2026-04-13

**Status**: Active

---

## DEC-007: Sentry for production error monitoring

**Decision**: Use `@sentry/nextjs` as the sole production error monitoring tool. Conservative configuration: 10% trace sampling, no session replay, source map upload gated behind `SENTRY_AUTH_TOKEN` so builds never break without it.

**Reason**: Console-only error logging is invisible in production. Sentry provides error aggregation, alerting, and stack traces without building custom infrastructure. Keeping the config lean avoids complexity for the first pass — replay and performance profiling can be added later if needed.

**Date**: 2026-04-13

**Status**: Active

---

## DEC-008: Startup environment variable validation

**Decision**: Validate environment variables once on server startup via `instrumentation.ts`, using a centralized registry in `src/lib/env.ts`. Three severity levels: `required` (error everywhere), `server-required` (error in production, warn in dev), `feature-required` (warn everywhere). No new dependencies — hand-rolled validation with ~120 lines.

**Reason**: Env var errors were previously lazy — failures only surfaced when a feature was first used at runtime. A misconfigured production deploy could serve errors to users. Startup validation fails fast with a clear message listing exactly which vars are missing and why they matter.

**Date**: 2026-04-13

**Status**: Active

---

## DEC-009: Vitest for smoke testing

**Decision**: Use Vitest as the test framework. Tests are limited to pure utility functions — no jsdom, no component tests, no Supabase mocking. Run via `npm test` (CI) and `npm run test:watch` (local dev).

**Reason**: The project had zero automated tests (MGT-004). Vitest is fast, TypeScript-native, and supports the existing `@` path alias with minimal config. Scope is deliberately narrow: only pure functions with no external dependencies are tested, keeping the test suite fast and maintenance-free. Integration and E2E testing can be added later as separate concerns.

**Date**: 2026-04-13

**Status**: Active

---

## DEC-010: Dev-only auto-login route

**Decision**: Provide `/api/auth/dev-session` as a development-only route that creates a real Supabase session for `DEV_ADMIN_EMAIL` and redirects to `/admin`. Hard-gated on `NODE_ENV === 'development'` — returns 404 in all other environments.

**Reason**: Claude Preview and other local testing tools cannot complete the magic-link auth flow. A real session (not a fake bypass) is required because RLS policies, server actions, and middleware all depend on a valid Supabase session.

**Implementation note (2026-04-17, revised)**: The route no longer uses `admin.generateLink` + `verifyOtp`. That path cannot redeem an admin-minted magic-link token through an `@supabase/ssr` client: `createServerClient` hard-codes `auth.flowType: 'pkce'` (see `node_modules/@supabase/ssr/src/createServerClient.ts:190`, which applies `flowType: "pkce"` *after* the caller's `options?.auth` spread, so it cannot be overridden), while `admin.generateLink` mints implicit-flow tokens — the PKCE verify endpoint rejects every `(type, variant)` combination (`'email'`/`'magiclink'` × `token_hash`/`email_otp`) with `"Email link is invalid or has expired"` or `"Token has expired or is invalid"`. An earlier note in this DEC recorded `type: 'email'` as the "runtime-correct verify type"; that was based on a mistaken SDK-typing diagnosis — both `'email'` and `'magiclink'` sit on the `EmailOtpType` union and both fail at runtime for the same underlying reason. The route now mints sessions via `admin.auth.admin.updateUserById(userId, { password: <one-shot random uuid> })` + `supabase.auth.signInWithPassword({ email, password })` on a `createServerClient` cookie adapter. Password sign-in is PKCE-compatible, so the adapter captures real `sb-*` session cookies, which are attached to the `NextResponse.redirect('/admin')` response. The temp password is regenerated per request (a fresh `crypto.randomUUID()`) and never returned to the client, so no stable credential is persisted.

**Date**: 2026-04-13 (updated 2026-04-17 to record the PKCE/implicit-flow incompatibility and the password sign-in implementation)

**Status**: Active

---

## DEC-011: Consumer dashboard is read-only MVP

**Decision**: The `/my/*` consumer dashboard shows published timetables only. No editing, no preferences, no alerts/drivers/upload pages. Access requires org membership (any role including viewer). The "Manage events" link is shown only for elevated roles (owner/admin/editor).

**Reason**: Consumers need a simple way to view their timetables without the complexity of the admin interface. Read-only scope keeps the first iteration small and testable. Alerts, drivers, and upload are deferred to Nice to Have phase.

**Date**: 2026-04-14

**Status**: Active

---

## DEC-013: Launch hardening tiered approach

**Decision**: Launch hardening is split into three tiers. Tier 1 covers viewport/manifest, security headers, robots/sitemap, loading skeletons, legal pages, and stub page cleanup. Tier 2 covers ConfirmDialog replacement, empty-state copy consistency, admin empty states, responsive fixes, and basic ARIA/accessibility. Tier 3 (CSP, rate limiting, advanced SEO, etc.) is deferred.

**Reason**: Tier 1 items are low-risk, high-value improvements that make the product presentable and secure for initial launch without introducing complexity. Tier 2 items are polish/usability/accessibility improvements that improve first-use experience without feature expansion. Deferring CSP and rate limiting avoids breaking changes during launch preparation.

**Date**: 2026-04-14

**Status**: Active — Tier 1 and Tier 2 complete

---

## DEC-012: Global token-based unsubscribe for notifications

**Decision**: Use a `notification_preferences` table with a unique UUID token per email address. Unsubscribe links use the token (no auth required). Scope is global on/off per email — no per-event or frequency controls. All table access via service-role client only (RLS enabled, no policies). Email stored in lowercase with a CHECK constraint.

**Reason**: Recipients are raw email strings in `events.notification_emails`, not authenticated users. A token-based approach allows unsubscribe without login. Global scope keeps the MVP simple — per-event preferences and frequency controls are deferred. Service-role-only access prevents unauthorized preference enumeration.

**Date**: 2026-04-14

**Status**: Active

---

## DEC-015: Partial-failure handling in multi-row mutations

**Decision**: Server actions that insert multiple child rows handle partial failures in two different ways, depending on whether a clean rollback is possible:

- `duplicateEvent()` and `createEventFromTemplate()` — on any failed day or entry insert, delete the newly-created parent event (`supabase.from('events').delete()`), which cascades to clean up any already-inserted children. Return `{ success: false, error }`.
- `saveDayEntries()` — collect insert failures, skip audit logging and notifications, return `{ success: false, error }`. Deletes and updates already applied earlier in the same call are left in place; the caller is expected to retry.

`writeAuditLog()` never affects the result — it is fully contained (try/catch + Sentry) so that audit side-effects can never flip a primary mutation's success value.

**Reason**: Silent partial success is worse than a loud partial-state error. For `duplicateEvent()` / `createEventFromTemplate()` the parent event is brand-new, so cascading delete gives a clean rollback. For `saveDayEntries()` the event already exists and has pre-existing state being edited in place — there is no safe rollback without a true DB transaction, so the best we can do is refuse to report success, skip the "everything saved" side-effects (audit + notifications), and surface a retry message. Supabase client calls are not transactional across statements, so a full atomic solution would require a Postgres function — deferred as out of scope for bug-pass 1.

**Date**: 2026-04-14

**Status**: Active

---

## DEC-016: 14-day event span is a hard limit, enforced by the caller

**Decision**: `MAX_EVENT_DAYS` (14) is a hard limit on how many days a single event can cover. It is enforced by the server actions that build events (`createEvent`, `createEventFromTemplate`, `duplicateEvent`) *before* any DB write. `getDatesInRange()` is a pure helper and does not enforce the limit itself — it only has a 366-day runaway-loop safety cap. An oversized range returns a clear `"Events are limited to 14 days…"` error instead of silently producing a shorter event.

**Reason**: The old behaviour was to silently truncate inside `getDatesInRange()`, which produced events with fewer days than the user had asked for and reported success. That is data loss masquerading as a successful write. Moving the limit check to the caller makes truncation impossible and makes the error visible to the user. The product limit stays at 14; changing it is out of scope for bug-pass 3 and would require a separate review of templates, notifications, and UI day-tab layout.

**Date**: 2026-04-14

**Status**: Active

---

## DEC-017: Notifications refuse to send without a working unsubscribe link

**Decision**: `sendEventNotification()` will not send to a recipient whose `notification_preferences` row is missing at send time. Such recipients are logged as `status: 'failed'` in `notification_log` with a reason string, and the underlying upsert/fetch errors are captured to Sentry. The rest of the recipients in the batch still receive their emails normally.

**Reason**: A missing preference row means no unsubscribe token, which means the email would be sent without a working unsubscribe link and without the List-Unsubscribe header. Sending anyway would be non-compliant and would hide a real infrastructure failure. Refusing to send makes the failure loud (visible in `notification_log` and Sentry) without breaking the other recipients in the batch.

**Date**: 2026-04-14

**Status**: Active

---

## DEC-014: Audit log uses load-all with client-side filtering

**Decision**: The audit log UI loads all entries (up to 2000) on panel open, then performs all filtering (action type, search, date range) and CSV export client-side. No server-side search or date filtering. The `loadAllAuditLog()` server action replaces cursor-based pagination for the primary flow.

**Reason**: Per-event audit log volume is small (typically under a few hundred entries). Loading all entries avoids pagination/filter conflict (server-paginated results can't be filtered or searched client-side without re-fetching). Client-side filtering makes CSV export trivial — just serialize the current filtered set. No new dependencies needed. A 2000-row safety cap prevents runaway queries; a subtle UI warning is shown if the cap is hit.

**Date**: 2026-04-14

**Status**: Active

---

## DEC-021: Character limits enforced at the input layer only (no DB / no server validation in this pass)

**Decision**: Admin event and org editing forms now apply per-field maximum character lengths at the input layer via native `maxLength` plus a visible `used/max` counter (`CharCounter`). Limits are centralised in `src/lib/constants/field-limits.ts` and composed inline at each call site. No database `CHECK` constraints are added, no Supabase migration is required, and the server actions (`createEvent`, `updateEventMetadata`, `saveDayEntries`, `createOrganisation`, `updateOrganisation`, `updateOrgBranding`, `inviteMember`, `addEventDay`, `updateDayLabel`, `saveAsTemplate`, `duplicateEvent`) are not extended with length validation — existing validation (required fields, date ordering, hex format, email type) is preserved verbatim. The counter uses a subtle three-state colour (gray → amber at ≥90% → red at cap) so layout stays visually quiet while still signalling proximity to the limit.

**Reason**: The goal of this pass is to prevent pathological input (pasted documents, accidental keyholds, buffer-style abuse) and give users a visible budget, not to impose product policy or change persisted data shape. Enforcing only at the input layer keeps the change fully reversible, contained to client components, and avoids the risk surface of a schema migration or a rewrite of every server-action validation block. Since `maxLength` is a hard browser constraint and every text field in scope is authored through these components, the input-layer enforcement is sufficient in practice for the MVP surface. Server-side and DB-level enforcement are deferred to a future pass when product-policy limits (rather than safety limits) are agreed; if such a pass lands, the constants file is the single source of truth to copy from.

**Date**: 2026-04-16

**Status**: Active

---

## DEC-020: Product-visible member roles reduced to owner + admin (UI-only)

**Decision**: The `MemberManager` UI surfaces only two product-visible roles: `owner` and `admin`. Legacy `editor` and `viewer` roles remain fully supported in the database, in RLS policies, in the `updateMemberRole()` / `inviteMember()` / `acceptInvite()` server actions, and in `get_user_org_role()` — they are only hidden from the UI as newly-assignable options. Pre-existing member rows on a legacy role continue to render their current role via a disabled `<option>` so the row remains visible and accurate. New invites are always sent with `role: 'admin'` — the invite form no longer includes a role selector. The member role dropdown on a row that is already on a legacy role does not allow re-selecting `editor` or `viewer` (disabled options); upgrading a legacy member to `admin` or `owner` remains possible, and the legacy role can remain in place indefinitely.

**Reason**: The full four-role matrix (owner / admin / editor / viewer) was a source of confusion for customers during onboarding — the semantic gap between `editor` and `admin` was narrow, and `viewer` was rarely used in practice. Narrowing the visible set to `owner + admin` reduces decision cost at invite time without any backend refactor, RLS rewrite, or data migration — the full matrix stays in the database and the server actions still accept all four strings, so existing customer orgs are untouched and any future re-expansion is free. Shipping as a UI-only pass keeps the change fully reversible and contained to `MemberManager`.

**Date**: 2026-04-16

**Status**: Active

---

## DEC-022: Public organisation pages live at `/{orgSlug}` (top-level), with reserved-slug + cross-table collision validation

**Decision**: The public organisation page is served at `/{orgSlug}` at the top level of the public URL tree. Per-event public URLs remain at `/{eventSlug}` (no prefix) and are unchanged. Both URL shapes share the top-level route namespace. Resolution at `/[slug]` is ordered: try published-event lookup first, fall through to organisation lookup, otherwise `notFound()`. The legacy `/o/{orgSlug}` route is preserved as a 308 permanent redirect to `/{orgSlug}` so previously shared URLs continue to resolve. Organisation creation enforces three slug-collision checks: (1) the slug is not on the reserved-slug list (`src/lib/constants/reserved-slugs.ts` — covers all top-level static + framework segments, including `o` so the legacy redirect cannot be shadowed), (2) the slug is not already taken by another organisation, (3) the slug is not already taken by any event (soft-deleted events included). Event-creation slug-uniqueness checks against organisations are explicitly out of scope for Pass C1 (deferred to Pass C2 alongside the broader event URL changes). No DB migration, no RLS change, and no widening of anon access on `organisations` — the org-resolver continues to use the admin Supabase client, matching the existing pattern for the public landing and per-event pages.

**Reason**: A top-level public organisation URL (`mygridtime.com/acme`) is the natural canonical shape: shorter, easier to share verbally, matches conventional SaaS patterns, and mirrors the per-event URL shape. The `/o/` prefix introduced in DEC-019 was a defensive choice to avoid event-slug collisions; with a reserved-slug list and a cross-table uniqueness check at organisation creation, the same safety can be enforced without the prefix. Soft-deleted events are intentionally included in the cross-table check because their slug rows remain in the table and could be recovered, so the namespace must remain reserved. The legacy `/o/{slug}` route is kept as a permanent redirect (rather than deleted) because per-event URLs were already externally published and any external links to `/o/{slug}` from the Pass-B window must continue to resolve. Pass C1 deliberately defers the symmetrical event-creation check (and the broader nested event URL design) to Pass C2 to keep the change surface tight.

**Date**: 2026-04-16

**Status**: Partially superseded by DEC-036 (2026-04-20). The `/{orgSlug}` organisation-page route, reserved-slug list, and org-creation cross-table slug check remain active. The paragraph about per-event URLs remaining at top-level `/{eventSlug}` and event-org slug-collision resolution order is superseded: events now live at `/{orgSlug}/{eventSlug}` with per-org slug uniqueness, and top-level `/{eventSlug}` URLs are preserved via a 308 redirect in `/[slug]/page.tsx` (with the legacy resolver returning 404 when multiple events share a slug under the new model).

---

## DEC-019: Public organisation pages live at `/o/{slug}`, not at `/{slug}` (superseded by DEC-022)

**Decision**: The public organisation index page is served at `/o/{slug}` (e.g. `/o/acme`). Per-event public URLs remain at `/{event-slug}` (no prefix) and are unchanged. The org page resolves the `organisations` row via the admin Supabase client (RLS unchanged), lists only published + non-deleted events for that org, `notFound()`s on resolve failure, and degrades to an empty-state render on event-list failure (with Sentry capture). The sitemap includes `/o/{slug}` entries only for orgs with at least one published event.

**Reason**: Event slugs and organisation slugs share a namespace at the top level. Putting org pages at `/{org-slug}` would collide with the existing per-event URLs — and those per-event URLs are already externally published, printed on collateral, and linked from email notifications, so renaming or reserving them is not an option. Prefixing org pages with `/o/` keeps the event URL space intact, reads naturally in copy ("your organisation's public page is at `/o/acme`"), and avoids introducing any routing-disambiguation logic at the top of the tree. The admin-client resolve path mirrors what the existing public landing and per-event pages already do for `organisations` reads, so Pass B ships without widening anon RLS.

**Date**: 2026-04-16

**Status**: Superseded by DEC-022 (2026-04-16) — the public organisation page now lives at `/{orgSlug}` with reserved-slug and cross-table collision validation. The `/o/{orgSlug}` route is preserved as a 308 redirect.

---

## DEC-024: Admin-UI date-chip presets produce local-calendar `YYYY-MM-DD` strings, not UTC-derived ISO slices

**Decision**: Any date-preset affordance in the admin UI that writes into an `<input type="date">` filter must derive its `YYYY-MM-DD` string from the **local** `getFullYear` / `getMonth` / `getDate` components of a `Date`, via the file-local `toLocalIsoDate(d: Date): string` helper pattern. Date offsets must be applied through the `Date` constructor (`new Date(y, m, d - n)`), never through millisecond arithmetic (`Date.now() - n * 86_400_000`). `new Date(...).toISOString().slice(0, 10)` must not be used to produce these strings. The one exception is CSV-filename timestamping (e.g. `AuditLogView`, `NotificationLogView` export filenames), where a UTC slice is an acceptable artefact label and not a filter input. In `NotificationLogView` the rule originally governed nine date-value chips; as of MGT-052 those chips are consolidated into a single **Date range** `<select>` whose `handleDateRangeChange()` writes the same ISO pairs through the same local-calendar helpers, so the rule still applies to the dropdown's switch-case outputs. The three daily-triage preset chips (Failures today / Sent today / Published today) continue to inherit `todayIso` via `applyPreset()`. The **All time** dropdown option is explicitly outside this rule because it writes no date string: it unconditionally clears both `dateFrom` and `dateTo` to the empty string, and its selected-value derivation comes from `isAllTimeActive = !dateFrom && !dateTo` rather than equality with a generated ISO value. A **Custom** option is surfaced (disabled, for display only) when the current state matches no preset — e.g. the admin typed a manual range into the From/To inputs.

**Reason**: `<input type="date">` values, the filter parser `new Date(iso + 'T00:00:00')`, and the user's mental model of "today" are all **local-calendar** dates. A UTC-derived slice disagrees with all three whenever the browser is not in UTC. Observed defects from the mixed model: off-by-one **Today** between 00:00–01:00 local in any `UTC+N` zone (including UK in BST); **This month** silently spanning into the previous month on the 1st; DST-unsafe millisecond subtraction. Constructor-based offsets (`new Date(y, m, d - 1)`) handle day/month/year rollover and DST transitions correctly. A single file-local helper keeps the rule visible at the call site and avoids a premature shared-utility extraction. See MGT-051 for the incident that drove this rule.

**Date**: 2026-04-17

**Status**: Active

---

## DEC-023: Audit log panel uses a `refreshSignal` counter prop for live refresh after save

**Decision**: After a successful `saveDayEntries()` call, `EventEditor` increments an `auditRefreshSignal` counter (`useState(0)` → `n + 1`) passed to `AuditLogView` as the new optional `refreshSignal?: number` prop. `AuditLogView` watches the prop in a `useEffect` and, when it changes to a non-zero value, sets `allLoaded` back to `false`, which re-triggers the existing panel-open `useEffect` → `loadAll()` path. The initial-mount firing is suppressed by guarding `refreshSignal > 0`. The counter is only wired through the timetable save path in `performTimetableSave`; `performMetaSave` remains unchanged. No server code, no notification system, and no `VersionHistory` change.

**Reason**: `router.refresh()` alone was insufficient: `AuditLogView` loads the full entry list into client-side state on first panel open (`allEntries`, `allLoaded`) and the existing effect only re-fires when `allLoaded` flips to `false`. A server-data refresh updates `initialEntries` but cannot re-populate the client cache. A counter prop is the minimum-surface signal that re-uses the already-established retry path (same one the Retry banner uses) without introducing a new state owner, prop-drilling refs, or coupling the audit view to a parent-held ref. The `> 0` guard avoids a double-fire on mount because the default (`0`) matches the mount render. Metadata saves are deliberately not wired in this pass — the task scope constrained the change to timetable saves and the metadata-audit-live-refresh gap is captured as a follow-up.

**Date**: 2026-04-17

**Status**: Active

---

## DEC-018: Phase A platform access uses a compatibility shortcut (effective owner), not a new role tier

**Decision**: Platform staff (`users.platform_role IN ('staff','support')`) reach any org as an effective `'owner'` for permission evaluation, via two coordinated changes:

1. The existing `get_user_org_role(p_org_id)` RLS helper short-circuits to `'owner'` when the new `is_platform_staff()` helper returns true. All existing RLS policies that go through `get_user_org_role()` inherit platform access automatically with no policy-text changes.
2. The five SELECT policies that bypass `get_user_org_role()` with direct `org_id IN (SELECT … FROM org_members …)` subqueries (`orgs_select_members`, `org_members_select`, `events_select_members`, `event_days_select_members`, `entries_select_members`) are extended with `OR is_platform_staff()`.

The `ActiveOrg` type and the new `audit_log.actor_context` column preserve a `via: 'platform' | 'membership'` discriminator (plus `platform_role` when `via === 'platform'`) so platform-reached access is never presented as genuine customer ownership in UI copy, audit reporting, or downstream tooling. Editors retain publish capability. Org creation remains open to any authenticated user. Platform staff are cross-org and do not require org membership — `getActiveOrg()` falls back through cookie → membership → oldest organisation.

**Reason**: A full platform-admin role tier (distinct policies, distinct UI surfaces, distinct tooling) is out of scope for Phase A. The shortcut lets platform staff act on customer orgs for support and recovery work immediately, without rewriting every RLS policy or introducing a second access-control pathway in application code. The `via` discriminator keeps the semantic distinction honest: platform staff are *not* customer org owners, and the audit trail records the real provenance so reviewers can tell the two cases apart. Phase B can replace the shortcut with a dedicated platform-admin UI and narrower per-action capabilities without changing the underlying audit data model.

**Date**: 2026-04-16

**Status**: Active
