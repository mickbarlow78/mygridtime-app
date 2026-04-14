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

---

## MGT-012: "Save details" button not disabled while metadata save in flight

**Description**: The `EventEditor` "Save details" button (`src/components/admin/EventEditor.tsx`) stayed enabled while a metadata save was in progress. Rapid clicks or re-submissions could fire concurrent `updateEventMetadata()` calls. The direct-save path (no review cards) never touched `reviewSaving`, so even the modal-driven pending treatment did not apply there.

**Impact**: Possible duplicate server-action invocations, wasted round-trips, race conditions around `savedMeta` / `router.refresh()`, and an unclear button state for the user.

**Status**: Resolved — the button is disabled and shows "Saving…" whenever `reviewSaving && reviewMode === 'metadata'`. `handleSaveMetadata()` now returns immediately if `reviewSaving` is already true (concurrent-submission guard) and wraps the direct-save path in `setReviewSaving(true)` / `finally setReviewSaving(false)` so both paths gate the button identically.

---

## MGT-013: Role changes applied instantly on select change

**Description**: `MemberManager` committed a role change the moment the `<select>` fired `onChange`. An accidental click / arrow-key scroll could downgrade or promote a member with no confirmation, and no way to recover other than re-selecting the original role.

**Impact**: High-blast-radius accidental role changes, especially downgrades that silently revoked permissions.

**Status**: Resolved — role changes now route through the existing `ConfirmDialog`. Cancel relies on the controlled select (`value={member.role}`) to snap back to the unchanged role on re-render. The dialog uses a downgrade-aware description (explicit "they will immediately lose any permissions not granted to the {newRole} role" wording) plus destructive styling for downgrades. No audit-notes / undo surface added — scope kept tight.

---

## MGT-014: MemberManager refetch failures hidden from the user

**Description**: `MemberManager.loadData()` caught all errors and silently returned, so a failing `listOrgMembers()` / `listOrgInvites()` after an invite, removal, role change, or revoke would leave the UI showing stale data with a success banner. The initial `useEffect` refetch had the same problem on org-switch.

**Impact**: Users could see "Member removed." / "Role updated." while the on-screen list never reflected the change, causing confusion or repeated attempts on already-completed actions.

**Status**: Resolved — `loadData()` now returns `{ success: true } | { success: false, error }`. Every call site (invite / remove / role-change / revoke / `useEffect` refetch) inspects the result and surfaces an inline error message on failure. The error wording is explicit that the primary action *did* succeed but the refresh did not (e.g. "Member removed, but the member list could not be refreshed: …"), so we never fake success.

---

## MGT-016: New users with no orgs landed on an unhelpful page

**Description**: `/auth/callback` mapped any user without an elevated role to `/` (public landing). Two distinct populations were conflated: users with viewer-only memberships, and users with **zero** memberships. A brand-new signed-in user with no orgs was dropped onto the public marketing page with no path forward — they could not reach `/admin/orgs/new` because the admin layout showed "Access denied" for anyone without an active org.

**Impact**: First-run dead end. New sign-ups had no visible next step without manual admin intervention.

**Status**: Resolved — `/auth/callback` now distinguishes the two cases: zero memberships → `/admin/orgs/new`; viewer-only memberships → `/my` (consumer dashboard). The admin layout reads an `x-pathname` header (set in `middleware.ts`) and permits `/admin/orgs/new` through the guard when the user has zero memberships, so the onboarding page is actually reachable. When a zero-membership user lands on `/admin`, the access-denied state is replaced with a "Welcome to MyGridTime — create your first organisation" CTA that links straight to the form.

---

## MGT-017: Invite acceptance redirect had no manual fallback

**Description**: `AcceptInviteForm` called `router.push()` inside a `setTimeout` after a successful `acceptInvite()`. If the client-side navigation did not land cleanly (blocked navigation, slow route transition, transient client error), the user was stranded on the success screen with no way to continue — no visible link, only the auto-redirect that had already fired once.

**Impact**: Low-probability but high-friction dead end immediately after a successful account action.

**Status**: Resolved — the success state now renders a manual "Continue to admin" / "Continue to your timetables" link alongside the redirecting message. Auto-redirect behaviour is unchanged (same 1.5s `setTimeout`); the link is additive. The destination is stored in component state so the manual link always points to the same target as the auto-redirect (`/my` for viewers, `/admin` for elevated roles).

---

## MGT-018: getDatesInRange silently truncated ranges over 14 days

**Description**: `getDatesInRange()` in `src/lib/utils/slug.ts` hard-capped its loop at 14 iterations. Any caller that passed a longer range (createEvent, createEventFromTemplate, duplicateEvent) silently got a truncated list and built an event with fewer days than the user-supplied range — no error, no warning. The unit test at `slug.test.ts` even documented the cap as intended behaviour.

**Impact**: User picks a 20-day range → event is created with 14 days of content and 6 missing dates, with no feedback. Data loss masquerading as success.

**Status**: Resolved —
- Exported `MAX_EVENT_DAYS = 14` and a new `countDaysInRange()` helper from `slug.ts`.
- `getDatesInRange()` no longer caps at 14; it now has a 366-day safety bound purely to defend against pathological inputs, and its contract explicitly requires callers to pre-validate.
- `createEvent()` (events/actions.ts), `createEventFromTemplate()` (templates/actions.ts), and `duplicateEvent()` (events/actions.ts) all now call `countDaysInRange()` up front and return `{ success: false, error: "Events are limited to 14 days…" }` if the range is too long, or `"End date must be on or after the start date."` if reversed. The error bubbles through `handleSubmit` in the new-event form and the duplicate modal and is rendered inline on the existing error banners — no UI changes needed.
- The 14-day product limit itself is unchanged (per DEC-016).
- `slug.test.ts` updated: the "caps at 14 days" test is replaced with assertions that `getDatesInRange` now returns the full range, plus new coverage for `countDaysInRange` and `MAX_EVENT_DAYS`.

---

## MGT-019: Day-label edit errors swallowed by TimetableBuilder

**Description**: `handleSaveLabel()` in `src/components/admin/TimetableBuilder.tsx` awaited `updateDayLabel()` without inspecting its result, then unconditionally updated local state and exited edit mode. A server-side failure (RLS denial, network blip, validation error) produced an optimistic local update that did not match the database, and the tab returned to its normal "saved" appearance.

**Impact**: Silent desync between UI and DB on any failed label save. User believed the rename landed; on refresh it reverted.

**Status**: Resolved — `handleSaveLabel()` now inspects `result.success`. On failure it shows the returned error inline in a red banner under the tab row, keeps the tab in edit mode so the draft is preserved, and offers a Cancel action that clears the draft and the error. On success it behaves exactly as before. A concurrent-save guard (`savingLabel` flag) prevents blur + Enter from double-firing the action. Esc still exits edit mode and clears the error.

---

## MGT-020: Notification preference upsert failures were swallowed

**Description**: `sendEventNotification()` in `src/lib/resend/notifications.ts` looped over recipients and called `admin.from('notification_preferences').upsert(...)` without checking the result. A failed upsert (RLS issue, PG error, network fault) meant no preference row was created, the subsequent pref fetch returned no row for that recipient, `pref?.token` was undefined, and the email was sent **without** an unsubscribe link. The List-Unsubscribe header was also omitted for that recipient. The failure was entirely invisible to Sentry and to `notification_log`.

**Impact**: Potentially non-compliant sends (no working unsubscribe link) with zero visibility. Debugging required direct DB comparison of `notification_preferences` against `notification_emails`.

**Status**: Resolved —
- Every preference-row upsert now captures `{ error }`. Failures are reported to Sentry with `tags: { action: 'sendEventNotification.preferenceUpsert' }` and the failing email is tracked in a local `upsertFailedEmails` set.
- The follow-up preference fetch now also captures and reports its own error to Sentry (`action: 'sendEventNotification.preferenceFetch'`).
- If a recipient has no preference row in `prefMap` at send time (because the upsert failed or the row was never readable), the helper **refuses to send** to that recipient. It writes a `notification_log` row with `status: 'failed'` and a reason string — either "Preference row upsert failed — unsubscribe link unavailable." or "Preference row missing after upsert — unsubscribe link unavailable." — and moves on to the next recipient.
- The rest of the send flow is unaffected: recipients whose preference rows succeeded still receive their emails with working unsubscribe links.

---

## MGT-015: acceptInvite() pending-state update not error-checked

**Description**: `acceptInvite()` in `src/app/admin/orgs/actions.ts` had two branches that updated `org_invites.accepted_at`: the "already-a-member" path and the "membership insert succeeded" path. Both fired the update without capturing `{ error }`. If the update failed for any reason (network blip, RLS/permission regression, row missing), the function returned `{ success: true }` and the invite row was left with `accepted_at = null`, so it would still show as "pending" forever.

**Impact**: Stale pending invites that could not be revoked cleanly, inconsistent invite-list state, and a silent failure mode the team could not see without direct DB inspection.

**Status**: Resolved — both update branches now check `{ error: markError }`, report to Sentry with `tags: { action: 'acceptInvite.markAccepted' | 'acceptInvite.markAcceptedExisting' }`, and return `{ success: false, error }` on failure. On the membership-insert path, the returned error explains that the member row *was* created (so the user has access) and the user should refresh and retry the accept step. No transaction/RPC added — out of scope for this pass.
