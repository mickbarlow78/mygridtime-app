# Phase 2: Schema + Auth

## Objective
Create the full B2B database schema in Supabase, apply RLS policies, implement magic link authentication, build the auth UI, protect admin routes and migrate prototype JSON data as seed data.

## Prerequisites
- Phase 1 complete (project scaffolded, Supabase running locally)

## What to Build

### 1. Database Schema (Migration File)
Create migration: `npx supabase migration new create_base_schema`

#### Table: organisations
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| name | text | NOT NULL |
| slug | text | UNIQUE, NOT NULL |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

#### Table: users
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, references auth.users(id) |
| email | text | NOT NULL |
| display_name | text | |
| created_at | timestamptz | NOT NULL, default now() |

#### Table: org_members
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| org_id | uuid | FK → organisations(id), NOT NULL |
| user_id | uuid | FK → users(id), NOT NULL |
| role | text | NOT NULL, CHECK IN ('owner','admin','editor','viewer') |
| created_at | timestamptz | NOT NULL, default now() |
| UNIQUE | | (org_id, user_id) |

#### Table: events
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| org_id | uuid | FK → organisations(id), NOT NULL |
| title | text | NOT NULL |
| slug | text | UNIQUE, NOT NULL |
| venue | text | |
| timezone | text | NOT NULL, default 'Europe/London' |
| status | text | NOT NULL, default 'draft', CHECK IN ('draft','published','archived') |
| published_at | timestamptz | |
| start_date | date | NOT NULL |
| end_date | date | NOT NULL |
| notes | text | |
| branding | jsonb | |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |
| deleted_at | timestamptz | |

#### Table: event_days
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| event_id | uuid | FK → events(id) ON DELETE CASCADE, NOT NULL |
| date | date | NOT NULL |
| label | text | |
| sort_order | integer | NOT NULL, default 0 |
| created_at | timestamptz | NOT NULL, default now() |

#### Table: timetable_entries
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| event_day_id | uuid | FK → event_days(id) ON DELETE CASCADE, NOT NULL |
| title | text | NOT NULL |
| start_time | time | NOT NULL |
| end_time | time | |
| category | text | |
| notes | text | |
| sort_order | integer | NOT NULL, default 0 |
| is_break | boolean | NOT NULL, default false |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

#### Table: audit_log
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → users(id) |
| event_id | uuid | FK → events(id) |
| action | text | NOT NULL |
| detail | jsonb | |
| created_at | timestamptz | NOT NULL, default now() |

#### Table: notification_log
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| event_id | uuid | FK → events(id) |
| type | text | NOT NULL |
| recipient_email | text | NOT NULL |
| status | text | NOT NULL, CHECK IN ('queued','sent','failed') |
| sent_at | timestamptz | |
| created_at | timestamptz | NOT NULL, default now() |

### 2. Auto-update Triggers
Create `updated_at` triggers for: organisations, events, timetable_entries.

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
Apply to each table.

### 3. Helper Function for RLS
```sql
CREATE OR REPLACE FUNCTION get_user_org_role(p_org_id uuid)
RETURNS text AS $$
  SELECT role FROM org_members
  WHERE org_id = p_org_id AND user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 4. RLS Policies
Enable RLS on ALL tables. Create policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| organisations | Members only | Authenticated | Owner/admin | Owner only |
| org_members | Members of same org | Owner/admin | Owner/admin | Owner/admin |
| events | Public if published + not deleted; members if draft/archived | Editor+ | Editor+ | Admin+ (set deleted_at) |
| event_days | Follows event visibility | Editor+ | Editor+ | Editor+ |
| timetable_entries | Follows event visibility | Editor+ | Editor+ | Editor+ |
| audit_log | Admin+ in org | None (system only) | None | None |
| notification_log | Admin+ in org | None (system only) | System only | None |

Public SELECT on events: `status = 'published' AND deleted_at IS NULL`

### 5. Auth Flow

**src/app/auth/login/page.tsx**:
- Email input field
- "Send magic link" button
- Calls `supabase.auth.signInWithOtp({ email })`
- Shows "Check your email" confirmation message
- Clean, simple UI. No clutter.

**src/app/auth/callback/page.tsx**:
- Handles auth callback from Supabase
- Exchanges code for session
- Redirects to /admin

**src/middleware.ts** (update):
- Refresh session on all requests
- Redirect unauthenticated users from /admin/* to /auth/login
- Allow public routes without auth

### 6. Auth Guard Layout

**src/app/admin/layout.tsx**:
- Server component
- Check for valid Supabase session
- If no session → redirect to /auth/login
- If session → render children
- Display minimal header with user email and logout button

### 7. Auto-create User Record
Create a Supabase trigger or use the auth hook: when a new auth.users row is created, automatically insert a row into the `users` table with the same id and email.

### 8. Seed Data
Examine the prototype JSON files in the repo and create `supabase/seed.sql`:
- Create a default organisation
- Create test user (linked to a Supabase Auth test account)
- Create org_member (owner role)
- Insert events, event_days and timetable_entries from the prototype JSON data
- Ensure slugs are URL-safe
- Ensure sort_order values are sequential

### 9. Generate TypeScript Types
```bash
npx supabase gen types typescript --local > src/lib/types/database.ts
```

## Acceptance Criteria
- [ ] `npx supabase db reset` runs cleanly (migrations + seed apply without errors)
- [ ] All 8 tables exist with correct columns and constraints
- [ ] RLS is enabled on every table
- [ ] Seed data populates correctly (events, days, entries visible in Supabase Studio)
- [ ] Magic link login flow works end-to-end (send email → click link → session created)
- [ ] /admin redirects to /auth/login when not authenticated
- [ ] /admin loads when authenticated
- [ ] Logout works and redirects to /auth/login
- [ ] `npm run typecheck` passes
- [ ] `src/lib/types/database.ts` is generated and reflects all tables

## Test Commands
```bash
npx supabase db reset
npx supabase gen types typescript --local > src/lib/types/database.ts
npm run typecheck
npm run dev
# Test: visit /admin → should redirect to /auth/login
# Test: enter email → receive magic link → click → redirected to /admin
# Test: visit Supabase Studio (localhost:54323) → verify tables and seed data
```

## Do NOT Build in This Phase
- Admin CRUD UI (Phase 3)
- Timetable builder (Phase 3)
- Public timetable rendering (Phase 4)
- Any Phase 7 tables (consumer layer)
