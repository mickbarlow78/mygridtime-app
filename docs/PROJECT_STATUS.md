# Project Status

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (magic links, OAuth) |
| Email | Resend (transactional) |
| Styling | Tailwind CSS 3 |
| Monitoring | Sentry (@sentry/nextjs) |
| Deployment | Netlify |
| Drag & Drop | @dnd-kit |
| Testing | Vitest |
| Language | TypeScript 5 |

## Architecture

- Server actions (`'use server'`) for all mutations — no REST API routes (except Stripe stub and dev-only `/api/auth/dev-session`)
- Supabase RLS enforces org-level access control via `get_user_org_role()`
- Multi-tenant: organisations → members → events → days → entries
- Soft deletes on events (`deleted_at`)
- Audit trail on all significant actions (`audit_log` table)
- Notification logging to `notification_log` table with 10-minute debounce
- Notification preferences in `notification_preferences` table (global per-email unsubscribe, token-based, service-role access only)

## Complete and Stable

- **Auth**: magic link login, OAuth callback, session management
- **Organisations**: create, switch, branding (logo, colour, header text)
- **Members**: invite (token-based), accept, role management (owner/admin/editor/viewer)
- **Events**: full CRUD — create, edit, publish, unpublish, archive, duplicate
- **Timetable builder**: day management, entry CRUD, drag-drop reorder
- **Public view**: read-only timetable at `/{slug}`, print-friendly layout
- **Email notifications**: Resend integration, HTML + plain text templates, notification_log
- **Timetable save notifications**: opt-in checkbox in review modal, default unchecked
- **Publish notifications**: opt-in checkbox in publish dialog, default unchecked
- **Version history**: timetable snapshots created on each publish
- **Templates**: save event structure as reusable template, load into new events
- **Audit log**: tracks event lifecycle + timetable changes with field-level diffs. UI includes action-type filter dropdown, text search (action label, email, detail), date-range filtering (day-level inclusive), and CSV export of filtered entries. Auto-loads all entries on panel open (2000-row safety cap). Shared `writeAuditLog()` helper extracted to `src/lib/audit.ts`.
- **Error boundaries**: `global-error.tsx`, root `error.tsx`, `(public)/error.tsx`, `admin/error.tsx`, `my/error.tsx` — styled error recovery UI across all route segments, all report to Sentry
- **Monitoring**: Sentry error tracking — client, server, and edge runtime coverage. Exceptions captured from all error boundaries and key server-side catch blocks. Conservative 10% trace sampling.
- **Environment validation**: Startup env var validation via `src/lib/env.ts`. Required vars (Supabase) error in all environments; server-required vars (service role key) error in production; feature-required vars (Resend) warn everywhere. Runs once in `instrumentation.ts` on nodejs runtime.
- **Consumer dashboard MVP** (`/my/*`): read-only consumer dashboard. Auth-guarded layout with org membership check. Timetable list (`/my`) shows published events across all user's orgs. Timetable view (`/my/{id}`) renders full timetable with day tabs, branding, and TimetableDay component. "Manage events" link shown only for elevated roles (owner/admin/editor). Shared `resolveEffectiveBranding()` utility extracted to `src/lib/utils/branding.ts`.
- **Notification preferences**: Global per-email unsubscribe via `notification_preferences` table. Token-based unsubscribe link in all event notification emails. Public unsubscribe page at `/notifications/unsubscribe/[token]` — no auth required. Unsubscribed recipients silently skipped during send. `List-Unsubscribe` header included. Admin event editor shows read-only unsubscribe state next to notification emails field (MGT-008 resolved).
- **Testing**: Vitest configured with `@` path alias. 51 smoke tests covering pure utility functions: app-url, slug, time, resend client, email templates (including unsubscribe links), env validation. No jsdom, no component tests, no Supabase mocking.
- **Dev tooling**: `/api/auth/dev-session` route creates a real Supabase session for `DEV_ADMIN_EMAIL` and redirects to `/admin`. Hard-gated on `NODE_ENV === 'development'` — returns 404 outside dev. Enables Claude Preview and local testing without magic-link email flow (DEC-010).
- **Template management UI (#11)**: Dedicated admin page at `/admin/templates` — server component listing all org templates with name, day count, and created date. Per-row "Use template" link navigates to `/admin/events/new?template={id}` with automatic preselection in `TemplatePicker`. Delete with confirmation dialog via client subcomponent (`TemplateActions`). Empty state guides users to save from event editor. Backend: `saveAsTemplate`, `listTemplates`, `deleteTemplate`, `createEventFromTemplate` server actions. New-event page reads `?template=` query param to preselect template mode.
- **Launch hardening (Tier 1)**: Viewport meta + manifest link in root layout. Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) via `next.config.mjs`. `robots.txt` blocks `/admin`, `/my`, `/auth`, `/api`, `/invites`, `/notifications`. Dynamic `sitemap.ts` includes public routes and published event slugs. Loading skeletons for `/admin`, `/admin/events/[id]`, and `/my`. Privacy policy and terms of service at `/privacy` and `/terms`. Consumer stub pages (`/my/alerts`, `/my/drivers`, `/my/upload`) replaced with clean "Coming soon" UI — no internal phase language exposed.
- **Audit log UI (#10)**: action-type filter, text search (action label, user email, stringified detail — case-insensitive), date-range filtering (day-level inclusive), CSV export of filtered entries. Auto-loads all entries on panel open via `loadAllAuditLog()` server action (2000-row safety cap with UI warning if hit). No pagination — all filtering and export handled client-side.
- **Launch hardening (Tier 2)**: Browser `confirm()` replaced with `ConfirmDialog` in MemberManager. Empty-state copy standardised across all user-facing pages. Admin empty states improved in MemberManager (members + pending invites) and VersionHistory. Responsive fixes for event editor date/time grid, action bar, and invite form. Basic ARIA fixes: `aria-expanded` on collapsibles, `aria-label` on filter/role controls, `aria-pressed` on break/race toggle.
- **Bug & friction pass 1 (reliability hardening)**: Event mutation server actions now call `revalidatePath()` after successful writes so admin and public caches stay consistent without a manual reload. `writeAuditLog()` is contained — Supabase row errors and thrown exceptions are captured to Sentry and swallowed so audit-log failures can never flip a primary mutation's result. `duplicateEvent()` and `createEventFromTemplate()` detect day and entry insert failures, roll back the partially-created event via cascade delete, and return a clear error instead of silently returning success. `saveDayEntries()` detects failed inserts of new entries, returns an error, and skips audit logging and notifications on partial failure.
- **Bug & friction pass 2 (reliability + usability hardening)**: `EventEditor` "Save details" button is disabled (and shows "Saving…") while the metadata save is in flight, preventing concurrent submissions on both the direct-save and review-modal paths. `MemberManager` role changes now require confirmation via the existing `ConfirmDialog` — cancel relies on the controlled `<select value={member.role}>` to snap back to the current role on re-render, and downgrades get explicit "they will lose permissions" wording plus destructive styling. `MemberManager.loadData()` returns a structured result instead of swallowing errors; all call sites (invite/remove/role-change/revoke + `useEffect` refetch) surface a clear inline error if the refresh fails, and never fake success. `acceptInvite()` now error-checks the `org_invites.accepted_at` update on both branches (already-a-member and new insert) — a failed mark-as-accepted is reported to Sentry and returned as a clear failure instead of leaving a stale "pending" invite forever.
- **Bug & friction pass 3 (onboarding + silent-failure hardening)**: `/auth/callback` distinguishes zero-memberships from viewer-only and routes each to a useful destination — zero memberships → `/admin/orgs/new` (first-run onboarding), viewer-only → `/my`, elevated → `/admin`. Middleware sets an `x-pathname` request header so `admin/layout.tsx` can permit `/admin/orgs/new` through its guard for users with zero memberships, and shows a "Welcome — create your first organisation" CTA instead of "Access denied" when a zero-membership user lands on `/admin`. `AcceptInviteForm` renders a manual "Continue to …" link alongside the post-accept auto-redirect so users are not stranded if the client-side navigation stalls. `getDatesInRange()` no longer silently caps at 14 days — `MAX_EVENT_DAYS` and a new `countDaysInRange()` helper are exported from `slug.ts`, and `createEvent()`, `createEventFromTemplate()`, and `duplicateEvent()` all pre-validate the user-supplied range and return a clear error (`"Events are limited to 14 days. The selected range spans N days — please shorten it."`) instead of silently dropping days. `TimetableBuilder.handleSaveLabel()` inspects the `updateDayLabel()` result, shows the error inline in a red banner, keeps the tab in edit mode on failure, and guards against double-invocation via a `savingLabel` flag. `sendEventNotification()` captures errors on every `notification_preferences` upsert (and on the follow-up fetch), reports failures to Sentry, refuses to send to any recipient without a readable preference row (no unsubscribe link = no send), and records a `notification_log` row with `status: 'failed'` for each skipped recipient so the failure is visible.

## In Progress

(none)

## Not Started

- **Consumer dashboard — alerts, drivers, upload** (`/my/alerts`, `/my/drivers`, `/my/upload`): stub pages only
- **Web push notifications**: VAPID keys unused, no service worker, no `web-push` dependency
- **AI timetable extraction**: Claude Vision integration stub only, no `@anthropic-ai/sdk` dependency
- **Stripe payments**: webhook returns 501, no subscription logic, no `stripe` dependency
- **SMS/WhatsApp notifications**: Twilio not integrated, no `twilio` dependency

## Current Critical Work

All P0, Must Have, and Should Have items (#8–#11) complete. Launch hardening Tier 1 and Tier 2 complete. Next phase is Nice to Have items (#12–#16).

Current behaviour:
- `saveDayEntries()` — opt-in checkbox in review modal, default unchecked. Correct.
- `publishEvent()` — opt-in checkbox in publish dialog, default unchecked. Correct.
- Metadata-only changes do not trigger notifications.
- Reorder changes are classified as substantive (can trigger notification if opted in).
- `DEBUG_NOTIFICATIONS` is env-driven (`false` by default), no longer hardcoded to `true`.
