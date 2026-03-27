# Phase 5: Email Notifications

## Objective
Integrate Resend for transactional email. Send emails on magic link login, event publication, and timetable changes. Log all notifications.

## Prerequisites
- Phase 4 complete (public timetable working)
- Resend account created (resend.com) with API key
- Sender domain verified in Resend (or use onboarding@resend.dev for testing)

## What to Build

### 1. Install Resend
```bash
npm install resend
```

### 2. Resend Client (src/lib/resend/client.ts)
```ts
import { Resend } from 'resend';
export const resend = new Resend(process.env.RESEND_API_KEY);
```

### 3. Email Templates
Create simple, clean HTML email templates. No complex design. Plain, readable, mobile-friendly.

**Publication notification (src/lib/resend/templates/event-published.ts):**
- Subject: "[Event Title] — Timetable Published"
- Body: Event title, venue, dates, link to public timetable
- CTA button: "View Timetable"

**Timetable updated notification (src/lib/resend/templates/event-updated.ts):**
- Subject: "[Event Title] — Timetable Updated"
- Body: Event title, note that the schedule has changed, link to public timetable
- CTA button: "View Updated Timetable"

### 4. Notification Send Function (src/lib/resend/send.ts)
```ts
export async function sendEventNotification(params: {
  eventId: string;
  type: 'publication' | 'change_alert';
  recipients: string[];
}) {
  // Fetch event details
  // Render appropriate template
  // Send via Resend
  // Log each send to notification_log table
}
```

### 5. Integrate with Publish Flow
In the publish action (from Phase 3):
- After setting status='published', call sendEventNotification
- Recipients: all org_members with role admin or owner (for now)
- Log to notification_log with status 'sent' or 'failed'

### 6. Integrate with Update Flow
When a published event's timetable entries are saved:
- Check if event status is 'published'
- If yes, send 'change_alert' notification
- Debounce: don't send more than one update email per event per 10 minutes (use a simple timestamp check against notification_log)

### 7. Admin Notification Settings (optional, simple)
On the event editor page, add a section:
- "Notification recipients" — list of email addresses
- Pre-populated with org member emails
- Admin can add additional emails
- Store as a jsonb field on events table (add migration: `ALTER TABLE events ADD COLUMN notification_emails text[]`)

## Acceptance Criteria
- [ ] Email sent when event is published
- [ ] Email sent when published event's timetable is updated
- [ ] Emails contain correct event title, venue, dates and link
- [ ] notification_log records every send attempt with status
- [ ] No duplicate emails sent within 10 minutes for the same event
- [ ] `npm run typecheck` passes
- [ ] Works with Resend test mode (onboarding@resend.dev)

## Test Commands
```bash
npm run typecheck
npm run dev
# Test: publish an event → check Resend dashboard for sent email
# Test: edit entries on a published event → save → check for update email
# Test: check notification_log in Supabase Studio → entries recorded
```

## Do NOT Build in This Phase
- Templates or multi-org (Phase 6)
- Any Phase 7 features
- Push notifications (Phase 7a)
- SMS/WhatsApp (Phase 7c)
