# Known Issues

## MGT-001: publishEvent() auto-sends notifications

**Description**: `publishEvent()` in `src/app/admin/events/actions.ts` unconditionally calls `sendEventNotification()` on publish. There is no opt-in checkbox or confirmation — unlike the save flow, which correctly uses an opt-in checkbox in the review modal.

**Impact**: Users may unintentionally send notifications to all configured recipients every time they publish or republish an event.

**Status**: Resolved — `publishEvent()` now accepts a `notify` parameter (default `false`). Publish dialog includes an opt-in checkbox, matching the save flow pattern.

---

## MGT-002: No error boundaries

**Description**: No `error.tsx` files exist anywhere in the app. Unhandled errors in any route will result in a white screen or Next.js default error page.

**Impact**: Poor user experience on any runtime error. No graceful recovery or actionable feedback.

**Status**: Resolved — error boundaries added at root (`global-error.tsx`, `error.tsx`), `(public)/error.tsx`, `admin/error.tsx`, and `my/error.tsx`. All routes now have styled error recovery UI.

---

## MGT-003: No production monitoring

**Description**: Error tracking is limited to in-database `notification_log` and console output via `src/lib/debug.ts`. No external monitoring service (Sentry, Datadog, etc.) is configured.

**Impact**: Production errors may go undetected. No alerting, no dashboards, no error aggregation.

**Status**: Resolved — Sentry integrated via `@sentry/nextjs`. Client, server, and edge runtimes covered. All 5 error boundaries capture to Sentry. Key server-side catch blocks in `events/actions.ts`, `orgs/actions.ts`, and `notifications.ts` report to Sentry. Conservative 10% trace sampling.

---

## MGT-004: No test framework

**Description**: No testing framework is configured. No unit, integration, or end-to-end tests exist. All testing is manual.

**Impact**: Regressions can ship undetected. Refactoring is high-risk without automated coverage.

**Status**: Resolved — Vitest configured with 45 smoke tests covering pure utility functions (app-url, slug, time, resend client, email templates, env validation). Run via `npm test`.

---

## MGT-005: Notification debounce edge cases

**Description**: The 10-minute per-recipient per-event debounce in `src/lib/resend/notifications.ts` prevents duplicate sends, but edge cases exist:
- Rapid publish → unpublish → republish within 10 minutes: second publish notification is silently dropped
- Failed sends (`status: 'failed'`) do NOT block retry — the debounce only checks `status = 'sent'`, so a failed send can be retried immediately by re-triggering the action
- No admin UI to view failed notifications or manually retry them

**Impact**: Recipients may miss legitimate notifications in rapid-action scenarios. Failed sends are retryable but only by repeating the triggering action (publish/save), not through a dedicated retry mechanism.

**Status**: Verified — all five edge cases confirmed against code (2026-04-13):
1. Debounce works as intended (10-min per-recipient per-event, checks `status = 'sent'` only)
2. Failed sends do not block retry (debounce ignores `status = 'failed'`)
3. Explicit opt-in required for both publish and save notifications
4. Unpublish does not trigger notifications
5. Rapid publish/unpublish/republish: second publish notification silently dropped within 10-min window — acceptable by design (DEC-004)

Remaining gap: no admin UI to view failed notifications or manually retry them.

---

## MGT-007: Invite URL uses hardcoded production fallback

**Description**: `inviteMember()` in `src/app/admin/orgs/actions.ts` built the invite accept URL using `process.env.NEXT_PUBLIC_APP_URL ?? 'https://mygridtime.com'` instead of the canonical `getServerAppUrl()` helper. This meant invite emails in non-production environments (local dev, preview deploys) contained the wrong URL.

**Impact**: Invite links in development/preview environments pointed to production instead of the current environment.

**Status**: Resolved — replaced hardcoded URL logic with `getServerAppUrl()`, which respects the full env priority chain (APP_URL → NEXT_PUBLIC_APP_URL → URL → NEXT_PUBLIC_SITE_URL → localhost).

---

## MGT-006: Debug logging enabled by default

**Description**: `DEBUG_NOTIFICATIONS` in `src/lib/debug.ts` was hardcoded to `true`. This output verbose notification tracing to the console in all environments.

**Impact**: Potential information leakage in production logs. Noise in log output.

**Status**: Resolved — `DEBUG_NOTIFICATIONS` is now driven by the `DEBUG_NOTIFICATIONS` env var (defaults to `false`). Set to `"true"` in `.env.local` for local debugging only.
