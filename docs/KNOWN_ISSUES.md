# Known Issues

## MGT-001: publishEvent() auto-sends notifications

**Description**: `publishEvent()` in `src/app/admin/events/actions.ts` unconditionally calls `sendEventNotification()` on publish. There is no opt-in checkbox or confirmation — unlike the save flow, which correctly uses an opt-in checkbox in the review modal.

**Impact**: Users may unintentionally send notifications to all configured recipients every time they publish or republish an event.

**Status**: Resolved — `publishEvent()` now accepts a `notify` parameter (default `false`). Publish dialog includes an opt-in checkbox, matching the save flow pattern.

---

## MGT-002: No error boundaries

**Description**: No `error.tsx` files exist anywhere in the app. Unhandled errors in any route will result in a white screen or Next.js default error page.

**Impact**: Poor user experience on any runtime error. No graceful recovery or actionable feedback.

**Status**: Open

---

## MGT-003: No production monitoring

**Description**: Error tracking is limited to in-database `notification_log` and console output via `src/lib/debug.ts`. No external monitoring service (Sentry, Datadog, etc.) is configured.

**Impact**: Production errors may go undetected. No alerting, no dashboards, no error aggregation.

**Status**: Open

---

## MGT-004: No test framework

**Description**: No testing framework is configured. No unit, integration, or end-to-end tests exist. All testing is manual.

**Impact**: Regressions can ship undetected. Refactoring is high-risk without automated coverage.

**Status**: Open

---

## MGT-005: Notification debounce edge cases

**Description**: The 10-minute per-recipient per-event debounce in `src/lib/resend/notifications.ts` prevents duplicate sends, but edge cases exist:
- Rapid publish → unpublish → republish within 10 minutes: second publish notification is silently dropped
- Failed sends (`status: 'failed'`) do NOT block retry — the debounce only checks `status = 'sent'`, so a failed send can be retried immediately by re-triggering the action
- No admin UI to view failed notifications or manually retry them

**Impact**: Recipients may miss legitimate notifications in rapid-action scenarios. Failed sends are retryable but only by repeating the triggering action (publish/save), not through a dedicated retry mechanism.

**Status**: Open

---

## MGT-006: Debug logging enabled by default

**Description**: `DEBUG_NOTIFICATIONS` in `src/lib/debug.ts` is set to `true`. This outputs verbose notification tracing to the console in all environments.

**Impact**: Potential information leakage in production logs. Noise in log output.

**Status**: Open
