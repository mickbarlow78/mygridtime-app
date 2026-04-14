# Decisions

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

**Reason**: Claude Preview and other local testing tools cannot complete the magic-link auth flow. A real session (not a fake bypass) is required because RLS policies, server actions, and middleware all depend on a valid Supabase session. The route uses `auth.admin.generateLink()` + `verifyOtp()` to create a genuine session without sending an email.

**Date**: 2026-04-13

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
