# Phase 3: Admin CRUD + Timetable Builder

## Objective
Build the full admin experience: event creation, timetable builder with inline editing and drag-and-drop, draft/publish/archive lifecycle, event duplication, validation and audit logging.

## Prerequisites
- Phase 2 complete (schema, auth, seed data working)

## What to Build

### 1. Admin Dashboard (src/app/admin/page.tsx)
- List all events for the user's organisation
- Show: title, venue, start_date, status badge (draft/published/archived)
- Sort by start_date descending
- "Create Event" button → /admin/events/new
- Click event row → /admin/events/[id]
- Status filter: All / Draft / Published / Archived

### 2. Create Event (src/app/admin/events/new/page.tsx)
Form fields:
- Title (required)
- Venue
- Start date (required)
- End date (required)
- Timezone (default: Europe/London)
- Notes (internal, not public)

On submit:
- Validate required fields client-side
- Generate slug from title (lowercase, hyphens, unique)
- INSERT into events with status='draft'
- Auto-create EventDay rows for each date between start_date and end_date
- Redirect to /admin/events/[id]
- Write audit_log: 'event.created'

### 3. Event Editor + Timetable Builder (src/app/admin/events/[id]/page.tsx)
This is the core admin page. Two sections:

#### Event Metadata (top)
- Editable: title, venue, start_date, end_date, timezone, notes
- Save button (updates event, writes audit_log: 'event.updated')
- Status display with action buttons:
  - Draft → "Publish" button
  - Published → "Unpublish" button
  - Any → "Archive" button
  - Any → "Duplicate" button

#### Timetable Builder (below metadata)
- Tab per EventDay (day tabs, labelled by date or custom label)
- "Add Day" / "Remove Day" buttons
- Per day:
  - List of timetable entries
  - Each entry shows: drag handle, title, start_time, end_time, category, notes, is_break toggle, delete button
  - All fields inline-editable (click to edit)
  - "Add Entry" button at bottom of day
  - Drag-and-drop reordering (use @dnd-kit/sortable)
  - On reorder: update sort_order values and save

#### Save Behaviour
- Explicit "Save" button (no auto-save for MVP)
- Save validates all entries, then batch upserts
- Show save confirmation or error

### 4. Validation Rules
On save, validate:
- [ ] Every entry has a title
- [ ] Every entry has a start_time
- [ ] If end_time is set, start_time < end_time
- [ ] No duplicate titles within the same day (warning, not blocking)
- [ ] At least one day exists
- [ ] At least one entry per day

Display inline errors: red border on invalid field, error message below.

### 5. Publish Flow
On "Publish" button click:
1. Run all validation rules above
2. If validation fails → show errors, do not publish
3. If validation passes → show confirmation dialog: "Publish this event? It will be publicly visible."
4. On confirm:
   - UPDATE events SET status='published', published_at=now()
   - Write audit_log: 'event.published'
   - Show success message

### 6. Unpublish Flow
- Confirmation dialog: "Unpublish? This will remove public access."
- UPDATE events SET status='draft'
- Write audit_log: 'event.unpublished'

### 7. Archive Flow
- Confirmation dialog: "Archive this event?"
- UPDATE events SET status='archived'
- Write audit_log: 'event.archived'

### 8. Duplicate Event
- Button on event editor
- Dialog: "Duplicate this event? Enter new title and dates."
- Fields: new title, new start_date, new end_date
- On confirm:
  - Create new event (status='draft')
  - Deep copy: event_days (with new dates) + all timetable_entries
  - New slug generated from new title
  - Redirect to new event editor
  - Write audit_log: 'event.duplicated'

### 9. Audit Log View
- Section at bottom of event editor (collapsible)
- List audit_log entries for this event
- Show: action, user email, timestamp
- Read-only

### 10. Install Dependencies
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## Components to Create

| Component | Location | Purpose |
|---|---|---|
| EventForm | src/components/admin/EventForm.tsx | Event metadata form (create + edit) |
| TimetableBuilder | src/components/admin/TimetableBuilder.tsx | Full timetable editor with day tabs |
| DayTab | src/components/admin/DayTab.tsx | Single day's entry list with DnD |
| EntryRow | src/components/admin/EntryRow.tsx | Single timetable entry (inline edit) |
| StatusBadge | src/components/ui/StatusBadge.tsx | Draft/Published/Archived badge |
| ConfirmDialog | src/components/ui/ConfirmDialog.tsx | Reusable confirmation modal |
| AuditLogView | src/components/admin/AuditLogView.tsx | Audit log display |

## Acceptance Criteria
- [ ] Admin can create a new event with title, venue, dates
- [ ] Event days auto-created from date range
- [ ] Admin can add, edit and delete timetable entries inline
- [ ] Admin can drag-and-drop to reorder entries
- [ ] Admin can add and remove days
- [ ] Validation prevents publishing invalid timetables
- [ ] Publish/unpublish/archive work with confirmation dialogs
- [ ] Duplicate creates a full copy in draft status
- [ ] Audit log records all actions
- [ ] All changes persist after page reload
- [ ] `npm run typecheck` passes
- [ ] No console errors during normal usage

## Test Commands
```bash
npm run typecheck
npm run dev
# Test: Create event → verify in Supabase Studio
# Test: Add entries → save → reload → entries persist
# Test: Drag reorder → save → reload → order persists
# Test: Publish → verify status change
# Test: Duplicate → verify new event created with all entries
# Test: Try to publish with missing title → validation error shown
```

## Do NOT Build in This Phase
- Public timetable page (Phase 4)
- Print view (Phase 4)
- Email notifications (Phase 5)
- Any Phase 7 features
