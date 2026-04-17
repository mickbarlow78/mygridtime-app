# Launch Plan

## Definition: Market-Ready v1

A stable, deployable product where:
- Admins can create, edit, and publish timetables without unintended side effects
- Notifications are controlled and opt-in
- Public viewers see accurate, up-to-date timetables
- The system handles errors gracefully and is observable in production

---

## P0 — Release Blocking

1. ~~**Fix publish auto-notify bug**~~ ✓ — `publishEvent()` now requires opt-in before sending notifications
2. ~~**Add error boundaries**~~ ✓ — `global-error.tsx`, root `error.tsx`, plus section-level boundaries for `(public)`, `admin`, and `my`
3. ~~**Production logging/monitoring**~~ ✓ — Sentry integrated for client, server, and edge error tracking. All error boundaries report to Sentry. Key server-side catch blocks captured.

Dependencies: None — these are independent and can be done in parallel.

---

## Must Have

4. ~~**Notification confirmation UX on publish**~~ ✓ — opt-in checkbox added to publish dialog, consistent with save flow
5. ~~**Basic smoke tests**~~ ✓ — Vitest configured with 57 smoke tests covering app-url, slug, time, resend client, email templates (including unsubscribe links), and env validation. Pure-function tests only, no jsdom or Supabase mocking.
6. ~~**Review notification edge cases**~~ ✓ — Verified: debounce works as designed, failed sends do not block retry, explicit opt-in required for both publish and save, unpublish does not notify, rapid publish/unpublish/republish drops the second notification within the 10-minute window (acceptable by design per DEC-004)
7. ~~**Environment hardening**~~ ✓ — `DEBUG_NOTIFICATIONS` is env-driven (defaults to `false`). Startup env validation via `src/lib/env.ts` validates required vars on server boot, fails fast in production.

Dependencies: Items 4 depends on P0 #1 (both now complete).

---

## Should Have

8. ~~**Consumer dashboard MVP** (`/my/*`)~~ ✓ — read-only timetable list and detail view with auth guard, branding, and day tabs. Remaining: alerts, drivers, upload (Nice to Have)
9. ~~**Notification preferences per recipient**~~ ✓ — global per-email unsubscribe via `notification_preferences` table. Token-based unsubscribe link in event emails. Public unsubscribe page at `/notifications/unsubscribe/[token]`. No auth required. `List-Unsubscribe` header included. Admin event editor shows unsubscribed recipients (read-only amber info block).
10. ~~**Audit log UI improvements**~~ ✓ — Action-type filter, text search (action label, email, detail), date-range filtering (day-level inclusive), CSV export. Auto-loads all entries on panel open (2000-row cap). Client-side filtering, no new dependencies.
11. ~~**Template management UI**~~ ✓ — Dedicated admin page at `/admin/templates` to browse, use, and delete templates. Per-row "Use template" link with preselection on new-event page via `?template=` query param. Server actions, `TemplatePicker`, and template creation in new-event flow all complete.

Dependencies: Item 9 depends on Must Have #4.

---

## Launch Hardening — Tier 1

~~L1. **Viewport metadata + manifest link**~~ ✓ — `viewport` export and `manifest` metadata added to root layout
~~L2. **Security headers**~~ ✓ — X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy (strict-origin-when-cross-origin) via `next.config.mjs`
~~L3. **robots.txt + sitemap**~~ ✓ — static `robots.txt` blocks private routes; dynamic `sitemap.ts` includes public routes and published event slugs
~~L5. **Consumer stub page cleanup**~~ ✓ — `/my/alerts`, `/my/drivers`, `/my/upload` replaced with clean "Coming soon" UI, no internal phase language
~~L6. **Loading skeletons**~~ ✓ — `loading.tsx` added for `/admin`, `/admin/events/[id]`, and `/my`
~~L8. **Privacy policy + terms**~~ ✓ — `/privacy` and `/terms` pages with credible content covering email, auth, notifications, third-party services

---

## Launch Hardening — Tier 2

~~L7. **Replace browser confirm() with ConfirmDialog**~~ ✓ — MemberManager member removal now uses the existing `ConfirmDialog` component with destructive styling instead of native `confirm()`
~~L9. **Empty-state copy consistency**~~ ✓ — Standardised all user-facing empty states to use consistent "No timetables have been published yet" wording across public landing, consumer dashboard, and detail pages
~~L11. **Admin empty states**~~ ✓ — MemberManager (members + pending invites) and VersionHistory now show helpful guidance instead of blank/hidden sections
~~L13. **Responsive fixes in event editor**~~ ✓ — Date/time/timezone grid stacks on mobile; action bar wraps cleanly; invite form stacks vertically on narrow screens
~~L14. **Basic ARIA/accessibility fixes**~~ ✓ — `aria-expanded` on AuditLogView and VersionHistory collapsibles; `aria-label` on filter dropdown and role selectors; `aria-pressed` on break/race toggle in EntryRow

---

## Nice to Have

12. **Web push notifications** — service worker, subscription management
13. **AI timetable extraction** — Claude Vision document upload + OCR _(Phases A + B shipped MGT-069 / MGT-070 — real Claude Vision tool-use behind `MGT_AI_EXTRACTION_ENABLED`, `ai_extraction_log` observability, 20/org/24h rate limit, private `event-extractions` Storage archive — **Shipped (disabled in env)** pending `ANTHROPIC_API_KEY`, see MGT-071-BLOCKED)_
14. **Stripe integration** — paid alerts, subscriptions
15. **SMS/WhatsApp via Twilio** — alternative notification channels
16. **Batch timetable upload** — `/my/upload` functionality

Dependencies: Items 14–15 require Stripe integration first.

---

## Phases

| Phase | Items | Prerequisite |
|-------|-------|-------------|
| 1. Stabilise | P0 #1–3 | None |
| 2. Harden | Must Have #4–7 | Phase 1 |
| 3. Expand | Should Have #8–11 | Phase 2 |
| 4. Grow | Nice to Have #12–16 | Phase 3 (partial) |
