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
5. **Basic smoke tests** — cover publish, save, and notification flows at minimum
6. **Review notification edge cases** — verify debounce works under rapid publish/unpublish/republish cycles
7. ~~**Environment hardening (partial)**~~ ✓ — `DEBUG_NOTIFICATIONS` is now env-driven (defaults to `false`). Remaining: validate required env vars on startup.

Dependencies: Items 4 depends on P0 #1 (both now complete).

---

## Should Have

8. **Consumer dashboard** (`/my/*`) — alerts, driver/parent view, individual timetable view
9. **Notification preferences per recipient** — allow recipients to unsubscribe or manage frequency
10. **Audit log UI improvements** — filtering, search, export
11. **Template management UI** — browse, edit, delete templates from admin

Dependencies: Item 9 depends on Must Have #4.

---

## Nice to Have

12. **Web push notifications** — service worker, subscription management
13. **AI timetable extraction** — Claude Vision document upload + OCR
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
