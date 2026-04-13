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
