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
- **Error boundaries**: `global-error.tsx`, root `error.tsx`, `(public)/error.tsx`, `admin/error.tsx`, `my/error.tsx` — styled error recovery UI across all route segments, all report to Sentry
- **Monitoring**: Sentry error tracking — client, server, and edge runtime coverage. Exceptions captured from all error boundaries and key server-side catch blocks. Conservative 10% trace sampling.
- **Environment validation**: Startup env var validation via `src/lib/env.ts`. Required vars (Supabase) error in all environments; server-required vars (service role key) error in production; feature-required vars (Resend) warn everywhere. Runs once in `instrumentation.ts` on nodejs runtime.

## In Progress

(None)

## Not Started

- **Testing**: no test framework configured
- **Consumer dashboard** (`/my/*`): stub pages only — alerts, drivers, upload
- **Web push notifications**: VAPID keys unused, no service worker
- **AI timetable extraction**: Claude Vision integration stub only
- **Stripe payments**: webhook returns 501, no subscription logic
- **SMS/WhatsApp notifications**: Twilio not integrated

## Current Critical Work

All P0 items complete. Production monitoring (Sentry) is live. Both save and publish notification flows are opt-in.

Current behaviour:
- `saveDayEntries()` — opt-in checkbox in review modal, default unchecked. Correct.
- `publishEvent()` — opt-in checkbox in publish dialog, default unchecked. Correct.
- Metadata-only changes do not trigger notifications.
- Reorder changes are classified as substantive (can trigger notification if opted in).
- `DEBUG_NOTIFICATIONS` is env-driven (`false` by default), no longer hardcoded to `true`.
