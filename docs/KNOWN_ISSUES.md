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

**Status**: Resolved — Vitest configured with 51 smoke tests covering pure utility functions (app-url, slug, time, resend client, email templates including unsubscribe links, env validation). Run via `npm test`.

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

---

## MGT-008: No admin UI for unsubscribe visibility

**Description**: The `notification_preferences` table tracks per-email unsubscribe state, but there is no admin interface to view which recipients have unsubscribed. Admins cannot see unsubscribe status or re-subscribe recipients on their behalf.

**Impact**: Admins have no visibility into why specific recipients stop receiving emails. Debugging requires direct database queries.

**Status**: Resolved — admin event editor now shows a read-only amber info block listing unsubscribed recipients next to the notification emails field. No admin override capability — visibility only.

---

## MGT-009: Event mutations did not revalidate cached routes

**Description**: Server actions in `src/app/admin/events/actions.ts` (`createEvent`, `updateEventMetadata`, `publishEvent`, `unpublishEvent`, `archiveEvent`, `duplicateEvent`, `addEventDay`, `removeEventDay`, `updateDayLabel`, `saveDayEntries`) mutated the database but never called `revalidatePath()`. Admin list, admin event editor, and public `/{slug}` routes could show stale data until a manual refresh or unrelated navigation cleared the Next.js fetch cache.

**Impact**: After publishing, editing, or saving a timetable, admins and public viewers could see stale content. Confusing UX and potential support noise.

**Status**: Resolved — all event mutation actions now call `revalidatePath()` on success. Admin paths (`/admin/events` and the dynamic `/admin/events/[id]`) are always revalidated; actions that affect published content also revalidate the public dynamic routes (`/[slug]`, `/[slug]/print`), `/my`, and `/`. Day-level actions that only receive a `dayId` use the dynamic-route form (`'/admin/events/[id]'`, `'page'`) so they don't need to re-fetch the parent event id.

---

## MGT-010: writeAuditLog() could crash the calling action

**Description**: `writeAuditLog()` in `src/lib/audit.ts` previously fired `supabase.from('audit_log').insert(...)` without catching errors. A Supabase error row was silently ignored, but any thrown exception (network error, Sentry hook, etc.) would bubble up and flip the primary mutation's result from success to failure even though the real database write had already committed.

**Impact**: Audit logging — a side-effect — could cause spurious action failures, confusing admins and breaking flows that already succeeded in the DB.

**Status**: Resolved — `writeAuditLog()` is now wrapped in a try/catch, inspects the Supabase `{error}` result, and reports any failure to Sentry with a `helper: 'writeAuditLog'` tag. It never throws and never returns a non-void signal to the caller, so the primary mutation remains the single source of success/failure.

---

## MGT-011: Silent partial failures in duplicate/template/save flows

**Description**: Three server actions treated failed child-row inserts as non-fatal:

- `duplicateEvent()` — failed `event_days` inserts were skipped with `continue`; failed `timetable_entries` inserts had no error check at all. A partially-populated event could be returned as `{ success: true }`.
- `createEventFromTemplate()` — same pattern. A partial event could be returned as success.
- `saveDayEntries()` — failed inserts of new entries were silently ignored (only `savedIds` was left `null`). Audit logging and notifications then ran as if the save had fully succeeded.

**Impact**: Admins could see a "success" result for a duplicate/template/save that silently lost days or entries. Notifications could fire for saves that were only partially applied.

**Status**: Resolved —

- `duplicateEvent()` now tracks a `failureReason` for day and entry insert errors, rolls back the new event with `supabase.from('events').delete().eq('id', newEvent.id)` (cascade removes already-inserted children), reports to Sentry, and returns `{ success: false, error }`.
- `createEventFromTemplate()` uses the same rollback pattern.
- `saveDayEntries()` collects insert failures into an `insertFailures` array. If any failed, it reports to Sentry and returns an error *before* running the audit-log write and notification send — so the caller sees the failure and no notifications fire for a partial save. Deletes and updates applied earlier in the same call are left in place (no transaction), and the error message tells the caller to retry.
