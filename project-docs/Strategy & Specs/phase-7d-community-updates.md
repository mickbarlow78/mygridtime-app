# Phase 7d: Community Timetables + Championship Matching + Update Alerts

## Objective
Enable community timetable sharing so one user's upload benefits others at the same event. Detect timetable updates and re-alert users. This is where network effects begin.

## Prerequisites
- Phase 7b complete (AI extraction, user_timetables populated)
- Phase 7c complete (paid alerts, scheduled_alerts dispatch working)

## What to Build

### 1. Community Timetables Table
Already in schema from Phase 7a migration. If not created yet:

**community_timetables:**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| championship | text | NOT NULL |
| event_name | text | NOT NULL |
| venue | text | |
| start_date | date | NOT NULL |
| source_user_id | uuid | FK → public_users(id) |
| adoption_count | integer | default 0 |
| data | jsonb | NOT NULL |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

RLS: SELECT open to all authenticated users. source_user_id is NOT exposed in queries (anonymous sharing).

### 2. Auto-Create Community Timetable on Upload Confirm

When a user confirms an extracted timetable (Phase 7b flow):
1. Check community_timetables for existing match: `championship ILIKE extracted.championship AND start_date = extracted.start_date`
2. If NO match exists:
   - Create community_timetable from user's confirmed data
   - Set source_user_id (for internal tracking only)
   - User's timetable links via community_timetable_id
3. If match EXISTS:
   - Do NOT overwrite
   - Offer user choice: "Another user has already submitted a timetable for this event."
   - Options: "Use existing" / "Keep mine" / "Compare"

### 3. Community Timetable Discovery

**On /my/upload — before upload:**
Add search step:
1. "Search for your event" — text search against community_timetables + published events
2. Show results with labels:
   - "Official" badge (from published events, source_type='official')
   - "Community" badge (from community_timetables, source_type='community')
   - Adoption count: "Used by X drivers"
3. User can tap to preview → if they want it, tap "Use this timetable"
4. Creates user_timetable linked to the community or official source
5. If no results: "Not found — upload your own"

### 4. Comparison View (src/components/consumer/TimetableCompare.tsx)

When user has their own version AND a community/official version exists:
- Side-by-side or diff view
- Highlight differences:
  - Green: entries in new version not in old
  - Red: entries in old version not in new
  - Amber: entries with changed times
- "Accept changes" / "Keep my version" buttons

### 5. Timetable Update Detection

#### Official timetable updates (B2B → B2C):
When an organiser re-publishes an event (Phase 3 publish flow):
1. Query user_timetables WHERE official_event_id = this event
2. For each affected user:
   - Create notification: "The timetable for [event] has been updated"
   - If user has push subscription → send push notification
   - If user is paid + has SMS → send SMS
3. Update the user_timetable version number
4. Delete pending scheduled_alerts for this user + timetable
5. Recalculate alerts from the updated official data

#### Community timetable updates:
When a new user uploads a timetable that matches an existing community_timetable AND has a later timestamp:
1. Update community_timetable with new data (if adoption_count > 0, store both versions)
2. Notify all users who adopted the community version:
   - "A newer version of the timetable for [event] is available. Review changes?"
3. User can accept (update their version) or ignore

### 6. Update Alert UI

**In /my/[timetableId] — when update available:**
- Banner at top: "This timetable has been updated. Review changes?"
- Tap → comparison view
- "Accept update" → update user_timetable data, recalculate alerts
- "Dismiss" → hide banner (store dismissal)

### 7. Adoption Count
When a user adopts a community timetable:
- INCREMENT community_timetables.adoption_count
- This count is displayed in search results as a trust signal

### 8. Update Notification Edge Function

Extend dispatch-alerts or create new function:
**supabase/functions/notify-timetable-update/index.ts:**
- Called when a published event is updated or a community timetable is updated
- Queries affected users
- Sends push/SMS based on user preferences
- Logs to alert_delivery_log

### 9. Alert Recalculation
Create utility function:
```ts
async function recalculateAlerts(userId: string, userTimetableId: string) {
  // 1. Delete all pending alerts for this user + timetable
  // 2. Fetch latest timetable entries
  // 3. Fetch user's drivers and alert preferences
  // 4. For each matching entry × offset × channel: INSERT scheduled_alert
}
```
Call this on:
- Timetable update accepted
- Alert preferences changed
- Driver added/removed

## Components to Create

| Component | Location | Purpose |
|---|---|---|
| EventSearch | src/components/consumer/EventSearch.tsx | Search official + community timetables |
| CommunityBadge | src/components/consumer/CommunityBadge.tsx | "Official" / "Community" / adoption count |
| TimetableCompare | src/components/consumer/TimetableCompare.tsx | Side-by-side diff view |
| UpdateBanner | src/components/consumer/UpdateBanner.tsx | "Timetable updated" notification banner |

## Acceptance Criteria
- [ ] First upload for a championship auto-creates community_timetable
- [ ] Second user searching for same event finds the community timetable
- [ ] Adoption count increments when a user adopts a community timetable
- [ ] "Official" badge shows for published events, "Community" badge for user-submitted
- [ ] When organiser re-publishes, all linked users receive update notification
- [ ] Update notification includes push (free) and SMS (paid) delivery
- [ ] User can view comparison between their version and the update
- [ ] "Accept update" replaces user's timetable data and recalculates alerts
- [ ] Pending alerts deleted and recreated on timetable update
- [ ] Community timetable update notifies all adopters
- [ ] source_user_id is never exposed to other users (anonymous sharing)
- [ ] `npm run typecheck` passes

## Test Commands
```bash
npm run typecheck
npm run dev
# Test: User A uploads timetable for "TKC Round 3" → community_timetable created
# Test: User B searches "TKC Round 3" → finds community version → adopts it
# Test: adoption_count = 1 for that community timetable
# Test: Organiser publishes official "TKC Round 3" → User A + B notified
# Test: User A accepts update → timetable data refreshed → alerts recalculated
# Test: User A uploads newer version → User B notified of update
# Test: Comparison view shows diff correctly
```

## Do NOT Build in This Phase
- Monthly subscription pricing (later)
- Moderation tools for community timetables (later)
- Advanced search / filtering (later)
- User ratings or reviews of community timetables (later)
