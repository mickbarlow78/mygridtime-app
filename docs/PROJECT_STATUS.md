# Project Status

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (magic links, OAuth) |
| Email | Resend (transactional) |
| Styling | Tailwind CSS 3 |
| Deployment | Netlify |
| Drag & Drop | @dnd-kit |
| Language | TypeScript 5 |

## Architecture

- Server actions (`'use server'`) for all mutations — no REST API routes (except Stripe stub)
- Supabase RLS enforces org-level access control via `get_user_org_role()`
- Multi-tenant: organisations → members → events → days → entries
- Soft deletes on events (`deleted_at`)
- Audit trail on all significant actions (`audit_log` table)
- Notification logging to `notification_log` table with 10-minute debounce

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
- **Audit log**: tracks event lifecycle + timetable changes with field-level diffs

## In Progress

(None)

## Not Started

- **Error boundaries**: no `error.tsx` files exist
- **Monitoring**: no external monitoring (Sentry, etc.) — only DB logs + `debug.ts` console output
- **Testing**: no test framework configured
- **Consumer dashboard** (`/my/*`): stub pages only — alerts, drivers, upload
- **Web push notifications**: VAPID keys unused, no service worker
- **AI timetable extraction**: Claude Vision integration stub only
- **Stripe payments**: webhook returns 501, no subscription logic
- **SMS/WhatsApp notifications**: Twilio not integrated

## Current Critical Work

No critical notification issues remaining. Both save and publish flows are opt-in.

Current behaviour:
- `saveDayEntries()` — opt-in checkbox in review modal, default unchecked. Correct.
- `publishEvent()` — opt-in checkbox in publish dialog, default unchecked. Correct.
- Metadata-only changes do not trigger notifications.
- Reorder changes are classified as substantive (can trigger notification if opted in).
