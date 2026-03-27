# Phase 7c: Paid Alerts — SMS, WhatsApp, Stripe

## Objective
Add SMS and WhatsApp alert channels via Twilio. Integrate Stripe for subscription payments. Build the upgrade flow. This is the monetisation phase.

## Prerequisites
- Phase 7a complete (push alerts, drivers, scheduled_alerts working)
- Twilio account with: Account SID, Auth Token, phone number, WhatsApp sender approved
- Stripe account with: secret key, publishable key, webhook secret
- Stripe product + price created for "Race Alerts+" (£3.99 per event)

## What to Build

### 1. Install Dependencies
```bash
npm install stripe twilio
```

### 2. Twilio Integration

**src/lib/twilio/client.ts:**
```ts
import twilio from 'twilio';
export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
```

**src/lib/twilio/sms.ts:**
- sendSMS(to: string, body: string): Promise<string> → returns message SID

**src/lib/twilio/whatsapp.ts:**
- sendWhatsApp(to: string, templateSid: string, variables: Record<string, string>): Promise<string>
- WhatsApp requires pre-approved templates. Template example:
  - "Your race {{1}} starts in {{2}} minutes at {{3}}"

### 3. Update Dispatch Edge Function
**supabase/functions/dispatch-alerts/index.ts** — extend from Phase 7a:

Current: only handles channel='push'
Add:
- channel='sms' → call Twilio SMS API
- channel='whatsapp' → call Twilio WhatsApp API
- Log delivery to alert_delivery_log table

**alert_delivery_log** (migration if not created in 7a):
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| scheduled_alert_id | uuid | FK → scheduled_alerts(id) |
| channel | text | NOT NULL |
| status | text | NOT NULL (success/failed/bounced) |
| provider_message_id | text | |
| error_detail | text | |
| created_at | timestamptz | NOT NULL, default now() |

### 4. Alert Preference Upgrades

**src/app/my/alerts/page.tsx** — extend from Phase 7a:

Free users see:
- Push alerts: enabled ✓
- SMS alerts: locked 🔒 "Upgrade to Race Alerts+"
- WhatsApp alerts: locked 🔒 "Upgrade to Race Alerts+"
- Multiple timings: locked 🔒
- Multiple drivers: locked 🔒 (only 1 driver can have alerts)

Paid users see:
- All channels available
- Alert timing selector: 5, 10, 15, 30, 60 minutes
- Multiple timings toggle: e.g. "30 min + 10 min"
- Per-driver alert config
- Phone number input (for SMS/WhatsApp, E.164 format with validation)

### 5. Stripe Integration

**src/lib/stripe/client.ts:**
```ts
import Stripe from 'stripe';
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

**Checkout flow:**
1. User taps locked feature → upgrade prompt appears
2. "Upgrade — £3.99 for this event" button
3. Button calls API route that creates Stripe Checkout session:
   - mode: 'payment' (one-time per event)
   - success_url: /my/alerts?upgraded=true
   - cancel_url: /my/alerts
   - metadata: { user_id, event_id }
4. Redirect to Stripe Checkout (Apple Pay / Google Pay enabled)
5. On success → redirect back

**src/app/api/webhooks/stripe/route.ts:**
- Verify webhook signature using STRIPE_WEBHOOK_SECRET
- Handle event: checkout.session.completed
- Extract user_id from metadata
- Update public_users: subscription_status='active', subscription_plan='alerts_event'
- Optionally store the specific event_id that was purchased

### 6. Upgrade Triggers (src/components/consumer/UpgradePrompt.tsx)

Show upgrade prompt when user:
1. Taps "SMS alerts" → trigger
2. Tries to set multiple alert timings → trigger
3. Tries to add alerts for second driver → trigger
4. After receiving 1-2 push alerts, show soft prompt: "Want a backup SMS alert?"

**Upgrade prompt UI (3 screens):**

Screen 1 — Value proposition:
- "Upgrade to Race Alerts+"
- SMS alerts that reach you even without internet
- Never miss your race again
- Alerts for all your drivers
- Multiple warning times
- Schedule change notifications

Screen 2 — Payment:
- "£3.99 for this event"
- Apple Pay / Google Pay button (Stripe Checkout)
- "Powered by Stripe" badge

Screen 3 — Confirmation:
- "Done. Alerts active."
- Return to alerts page with paid features unlocked

### 7. Alert Scheduling Updates

When paid user configures alerts:
- Delete existing pending scheduled_alerts for this user + timetable
- Recalculate: for each matching entry × each offset × each channel
- INSERT new scheduled_alerts rows
- Example: user wants 30 min + 10 min push + SMS for 2 drivers across 8 entries = 64 alerts

### 8. Phone Number Collection

On alerts page, when user enables SMS or WhatsApp:
- Show phone number input with country code selector
- Validate E.164 format
- Save to public_users.phone
- Send verification SMS: "Reply YES to confirm TKC alerts" (optional for MVP, recommended post-MVP)

### 9. Environment Variables
Add to .env.local and Supabase secrets:
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+44...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

## Acceptance Criteria
- [ ] Free user sees locked SMS/WhatsApp options with upgrade prompt
- [ ] Upgrade prompt appears on correct triggers (SMS tap, multi-timing, second driver)
- [ ] Stripe Checkout opens with correct price (£3.99)
- [ ] Apple Pay / Google Pay work in Stripe Checkout
- [ ] Webhook updates subscription_status to 'active' on successful payment
- [ ] Paid user can configure SMS and WhatsApp alerts
- [ ] Paid user can set multiple alert timings
- [ ] Paid user can enable alerts for multiple drivers
- [ ] SMS delivered via Twilio at correct time
- [ ] WhatsApp delivered via Twilio at correct time
- [ ] alert_delivery_log records every send with status and provider ID
- [ ] Phone number validated as E.164 format
- [ ] `npm run typecheck` passes

## Test Commands
```bash
npm run typecheck
npm run dev
# Test: free user → tap SMS → upgrade prompt shown
# Test: complete Stripe Checkout (use test card 4242 4242 4242 4242)
# Test: webhook fires → subscription_status updated in Supabase
# Test: set SMS alert → manually trigger dispatch → SMS received
# Test: set WhatsApp alert → manually trigger dispatch → WhatsApp received
# Test: check alert_delivery_log → entries recorded
# Test: Stripe webhook with invalid signature → rejected
```

## Do NOT Build in This Phase
- Community timetables (Phase 7d)
- Timetable update detection (Phase 7d)
- Monthly subscription option (later, after per-event pricing validated)
