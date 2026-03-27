# Phase 6: Multi-Org + Templates + Versioning + White-Label

## Objective
Support multiple organisations per user, event templates, timetable version history and basic white-label branding. This completes the B2B championship tool.

## Prerequisites
- Phase 5 complete (email notifications working)

## What to Build

### 1. Multi-Organisation Support

**Org selector (src/components/admin/OrgSelector.tsx):**
- Dropdown in admin header showing user's organisations
- Switching orgs filters all event views
- Store selected org_id in cookie or URL param

**Create organisation:**
- New page: /admin/orgs/new
- Fields: name, slug
- Creator becomes owner automatically (org_members INSERT)

**Org settings:**
- New page: /admin/orgs/[orgId]/settings
- Edit org name
- Manage members: invite by email, set role, remove
- Invite flow: send email (via Resend) with magic link that auto-adds user to org

### 2. Event Templates

**Save as template:**
- Button on event editor: "Save as Template"
- Creates a copy of the event structure (days + entries) stored as a template
- Template table (new migration):

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| org_id | uuid | FK → organisations(id), NOT NULL |
| name | text | NOT NULL |
| data | jsonb | NOT NULL (full event structure: days + entries) |
| created_by | uuid | FK → users(id) |
| created_at | timestamptz | NOT NULL, default now() |

- RLS: org members only

**Create from template:**
- On "Create Event" page, show: "Start blank" or "Use template"
- Template picker lists org's templates
- Selected template pre-fills days and entries
- User enters new title, dates, venue
- Days are remapped to new date range (maintain day count and order)

### 3. Version History

**Timetable snapshots:**
- When an event is published, snapshot the current timetable state
- Snapshot table (new migration):

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| event_id | uuid | FK → events(id), NOT NULL |
| version | integer | NOT NULL |
| data | jsonb | NOT NULL (full timetable: days + entries) |
| published_by | uuid | FK → users(id) |
| published_at | timestamptz | NOT NULL, default now() |

- Version increments on each publish
- RLS: org members only

**Version viewer:**
- On event editor, "Version History" section (collapsible)
- List of published versions with timestamp and publisher
- Click to view a read-only snapshot of that version's timetable
- No restore functionality for MVP (view-only)

### 4. White-Label Branding

**Branding config:**
- On org settings page, add branding section:
  - Primary colour (hex)
  - Logo URL (external URL for now, no file upload)
  - Custom header text

**Apply branding:**
- Public timetable page reads event.branding (falls back to org branding if event-level not set)
- Apply primary colour to header bar and day tab active state
- Display logo in event header if set
- Store in events.branding jsonb field (already exists in schema)
- Also add branding jsonb to organisations table (new migration)

### 5. Migrations
Create migrations for:
1. `templates` table
2. `timetable_snapshots` table
3. `ALTER TABLE organisations ADD COLUMN branding jsonb`
4. RLS policies for new tables

## Components to Create

| Component | Location | Purpose |
|---|---|---|
| OrgSelector | src/components/admin/OrgSelector.tsx | Org switcher in header |
| OrgSettings | src/components/admin/OrgSettings.tsx | Org name, members, branding |
| MemberManager | src/components/admin/MemberManager.tsx | Invite, role change, remove |
| TemplatePicker | src/components/admin/TemplatePicker.tsx | Select template on event creation |
| VersionHistory | src/components/admin/VersionHistory.tsx | Version list + snapshot viewer |
| BrandingForm | src/components/admin/BrandingForm.tsx | Colour picker, logo URL |

## Acceptance Criteria
- [ ] User can create and switch between multiple organisations
- [ ] Events are scoped to the selected organisation
- [ ] Admin can invite members by email with role assignment
- [ ] Admin can save an event as a template
- [ ] Admin can create a new event from a template with remapped dates
- [ ] Each publish creates a timetable snapshot with incrementing version
- [ ] Admin can view (read-only) any previous version
- [ ] Org branding (colour + logo) applies to public timetable pages
- [ ] Event-level branding overrides org-level branding
- [ ] All new tables have RLS enabled
- [ ] `npx supabase db reset` runs cleanly
- [ ] `npm run typecheck` passes

## Test Commands
```bash
npx supabase db reset
npx supabase gen types typescript --local > src/lib/types/database.ts
npm run typecheck
npm run dev
# Test: create second org → switch → events are different
# Test: save template → create event from template → entries pre-filled
# Test: publish event → check timetable_snapshots table → version 1
# Test: edit + re-publish → version 2 created
# Test: set org branding → view public timetable → colours applied
```

## Do NOT Build in This Phase
- Any Phase 7 features
- Advanced white-label (custom domains, separate deployments)
- Template marketplace or sharing between orgs
