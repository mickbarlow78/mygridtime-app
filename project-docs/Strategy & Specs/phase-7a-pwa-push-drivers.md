# Phase 7a: PWA + Push Notifications + Drivers + Free Alerts

## Objective
Make the app a PWA installable on phones. Add consumer accounts, driver management and free push notifications (single alert, 15 min before). This is the foundation of the B2C layer.

## Prerequisites
- Phase 4 complete minimum (public timetable working)
- VAPID keys generated for Web Push

## What to Build

### 1. Generate VAPID Keys
```bash
npx web-push generate-vapid-keys
```
Add to .env.local:
```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

### 2. Install Dependencies
```bash
npm install web-push
```

### 3. Consumer Database Tables (Migration)
`npx supabase migration new create_consumer_schema`

**public_users:**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, references auth.users(id) |
| email | text | NOT NULL |
| display_name | text | |
| phone | text | |
| subscription_status | text | NOT NULL, default 'free', CHECK IN ('free','active','cancelled','expired') |
| subscription_plan | text | |
| push_subscription | jsonb | |
| alert_preferences | jsonb | default '{}' |
| created_at | timestamptz | NOT NULL, default now() |

**drivers:**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → public_users(id), NOT NULL |
| name | text | NOT NULL |
| class | text | |
| number | text | |
| created_at | timestamptz | NOT NULL, default now() |

**user_timetables:**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → public_users(id), NOT NULL |
| source_type | text | NOT NULL, CHECK IN ('upload','official','community') |
| official_event_id | uuid | FK → events(id), nullable |
| community_timetable_id | uuid | nullable |
| title | text | NOT NULL |
| championship | text | |
| venue | text | |
| start_date | date | |
| end_date | date | |
| extraction_confidence | float | |
| version | integer | NOT NULL, default 1 |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

**user_timetable_days:**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| user_timetable_id | uuid | FK → user_timetables(id) ON DELETE CASCADE |
| date | date | NOT NULL |
| label | text | |
| sort_order | integer | NOT NULL, default 0 |

**user_timetable_entries:**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| user_timetable_day_id | uuid | FK → user_timetable_days(id) ON DELETE CASCADE |
| title | text | NOT NULL |
| start_time | time | NOT NULL |
| end_time | time | |
| category | text | |
| notes | text | |
| sort_order | integer | NOT NULL, default 0 |
| is_break | boolean | NOT NULL, default false |

**scheduled_alerts:**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → public_users(id), NOT NULL |
| driver_id | uuid | FK → drivers(id), nullable |
| user_timetable_entry_id | uuid | FK → user_timetable_entries(id), NOT NULL |
| alert_at | timestamptz | NOT NULL |
| offset_minutes | integer | NOT NULL |
| channel | text | NOT NULL, default 'push', CHECK IN ('push','sms','whatsapp') |
| status | text | NOT NULL, default 'pending', CHECK IN ('pending','sent','failed','cancelled') |
| sent_at | timestamptz | |
| created_at | timestamptz | NOT NULL, default now() |

RLS: all tables scoped to auth.uid() = user_id.

### 4. PWA Setup

**public/manifest.json** (update from Phase 1 placeholder):
```json
{
  "name": "TKC Timetable",
  "short_name": "TKC",
  "description": "Race-day schedule and alerts",
  "start_url": "/my",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1B3A5C",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```
Generate placeholder icon PNGs (192x192 and 512x512) with "TKC" text.

**public/sw.js** (service worker):
```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'TKC Alert', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/my' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

Register service worker in the app layout:
```ts
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

### 5. Push Subscription Flow (src/lib/push/)

**subscribe.ts:**
- Request notification permission
- Subscribe to push manager with VAPID public key
- Save subscription object to public_users.push_subscription via Supabase

**send.ts (server-side):**
- Use `web-push` library to send notification to a user's push_subscription
- Payload: `{ title, body, url }`

### 6. iOS Install Banner (src/components/consumer/InstallBanner.tsx)
- Detect if running in Safari iOS and NOT in standalone mode
- Show banner: "Add TKC to your Home Screen for alerts"
- Step-by-step: "Tap Share → Add to Home Screen"
- Dismissible (store dismissal in cookie)
- Only show after user has created first timetable

### 7. Consumer Auth
Consumer users use the same Supabase Auth (magic link) but are recorded in public_users instead of users. Detect based on route: /my/* creates public_users record, /admin/* creates users record.

### 8. Consumer Pages

**src/app/my/page.tsx — My Timetables:**
- List user's timetables (from user_timetables)
- Each shows: title, venue, start_date, alert status
- "Add Timetable" button → /my/upload (Phase 7b)
- For Phase 7a: "Link to Official Timetable" — search published events, link one to user_timetables with source_type='official'

**src/app/my/drivers/page.tsx — Manage Drivers:**
- List user's drivers
- Add driver: name, class, number
- Edit / delete drivers
- Simple form, no complexity

**src/app/my/alerts/page.tsx — Alert Preferences:**
- Show current alert settings
- For free users: push only, 15 min, single driver
- Toggle alerts on/off per timetable
- "Upgrade" prompt for SMS/multi-timing (greyed out, links to Phase 7c upgrade)

**src/app/my/[timetableId]/page.tsx — View Personal Timetable:**
- Reuse TimetableView component from Phase 4
- Highlight entries matching user's driver class(es)
- Filter toggle: "Show all" / "Show my races only"
- "Enable alerts" button → triggers push subscription flow

### 9. Alert Scheduling
When user enables alerts on a timetable:
1. For each user_timetable_entry matching driver's class:
2. Calculate alert_at = entry date + start_time - 15 minutes (UTC)
3. INSERT into scheduled_alerts with channel='push', status='pending'

### 10. Alert Dispatch (Edge Function)
**supabase/functions/dispatch-alerts/index.ts:**
- Triggered by cron (pg_cron) every 60 seconds
- Query: `SELECT * FROM scheduled_alerts WHERE status='pending' AND alert_at <= now()`
- For each: send push notification via web-push
- Update status to 'sent' or 'failed'
- For Phase 7a: only handle channel='push'

## Acceptance Criteria
- [ ] App passes Lighthouse PWA audit
- [ ] App installable on Android (install prompt) and iOS (Add to Home Screen)
- [ ] Consumer can sign up via magic link
- [ ] Consumer can add drivers with name and class
- [ ] Consumer can link an official published event as their timetable
- [ ] Consumer can view timetable filtered by their driver's class
- [ ] Consumer can enable push alerts
- [ ] Push notification received 15 minutes before matching session
- [ ] iOS install banner shows in Safari (not in standalone)
- [ ] scheduled_alerts table populates correctly on alert enable
- [ ] Dispatch Edge Function sends push and updates status
- [ ] `npx supabase db reset` runs cleanly
- [ ] `npm run typecheck` passes

## Test Commands
```bash
npx supabase db reset
npx supabase gen types typescript --local > src/lib/types/database.ts
npm run typecheck
npm run dev
# Test: install PWA on phone → opens in standalone mode
# Test: create consumer account → add driver → link timetable
# Test: enable alerts → check scheduled_alerts table
# Test: manually set alert_at to now() → run dispatch function → push received
```

## Do NOT Build in This Phase
- AI extraction / upload (Phase 7b)
- SMS / WhatsApp / Stripe (Phase 7c)
- Community timetables (Phase 7d)
