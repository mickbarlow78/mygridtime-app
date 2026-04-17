# Decisions

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

**Status**: Active — Pass C1 (supersedes DEC-019)

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
