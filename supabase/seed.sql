-- =============================================================
-- MyGridTime — Seed Data
-- =============================================================
-- Applied by: npx supabase db reset (after Phase 2 migrations)
--
-- PURPOSE
-- Provides realistic test data for local development.
-- Structured so real prototype data can be swapped in later
-- by replacing the INSERT blocks below with actual event data.
--
-- DEPENDENCIES
-- Phase 2 migration (001_create_base_schema.sql) must be applied first.
-- A Supabase Auth test user must exist — create one via:
--   npx supabase auth users create --email dev@mygridtime.com --password test1234
-- Then copy the returned UUID into DEV_USER_ID below.
-- =============================================================

-- ---------------------------------------------------------------
-- 0. Constants — replace with real values after Phase 2
-- ---------------------------------------------------------------

-- Replace with the UUID of your local Supabase Auth test user.
-- Create with: npx supabase auth users create --email dev@mygridtime.com --password test1234
DO $$
DECLARE
  v_org_id   uuid := gen_random_uuid();
  v_user_id  uuid;  -- Set after creating auth user — see instructions above
  v_event1   uuid := gen_random_uuid();
  v_event2   uuid := gen_random_uuid();
  v_day1     uuid := gen_random_uuid();
  v_day2     uuid := gen_random_uuid();
  v_day3     uuid := gen_random_uuid();
BEGIN

  -- ---------------------------------------------------------------
  -- 1. Organisation
  -- ---------------------------------------------------------------
  INSERT INTO organisations (id, name, slug)
  VALUES (v_org_id, 'MyGridTime Demo Club', 'mygridtime-demo')
  ON CONFLICT (slug) DO NOTHING;

  -- ---------------------------------------------------------------
  -- 2. User record
  -- Linked to auth.users — must match an existing auth user UUID.
  -- Skipped here: insert manually once you have a real auth user ID.
  -- ---------------------------------------------------------------

  -- ---------------------------------------------------------------
  -- 3. Events
  -- ---------------------------------------------------------------

  -- Event 1: Published — visible on public timetable
  INSERT INTO events (
    id, org_id, title, slug, venue, timezone,
    status, published_at, start_date, end_date, notes
  ) VALUES (
    v_event1,
    v_org_id,
    'Round 3 — Whilton Mill',
    'round-3-whilton-mill',
    'Whilton Mill Kart Circuit',
    'Europe/London',
    'published',
    now(),
    '2026-05-10',
    '2026-05-11',
    'Championship round 3. Both days race format.'
  );

  -- Event 2: Draft — admin-only, not publicly visible
  INSERT INTO events (
    id, org_id, title, slug, venue, timezone,
    status, start_date, end_date, notes
  ) VALUES (
    v_event2,
    v_org_id,
    'Round 4 — Larkhall',
    'round-4-larkhall',
    'Larkhall Raceway',
    'Europe/London',
    'draft',
    '2026-06-14',
    '2026-06-14',
    'Single-day round. Timetable TBC.'
  );

  -- ---------------------------------------------------------------
  -- 4. Event Days — Round 3
  -- ---------------------------------------------------------------
  INSERT INTO event_days (id, event_id, date, label, sort_order) VALUES
    (v_day1, v_event1, '2026-05-10', 'Saturday', 0),
    (v_day2, v_event1, '2026-05-11', 'Sunday',   1);

  -- Event Days — Round 4 (draft)
  INSERT INTO event_days (id, event_id, date, label, sort_order) VALUES
    (v_day3, v_event2, '2026-06-14', 'Sunday', 0);

  -- ---------------------------------------------------------------
  -- 5. Timetable Entries — Round 3, Saturday
  -- Replace with real prototype data when available.
  -- Ensure sort_order is sequential starting from 0.
  -- ---------------------------------------------------------------
  INSERT INTO timetable_entries (
    event_day_id, title, start_time, end_time, category, is_break, sort_order
  ) VALUES
    (v_day1, 'Gates Open',             '07:30', '08:00', NULL,       TRUE,  0),
    (v_day1, 'Sign-On & Scrutineering','08:00', '09:00', NULL,       FALSE, 1),
    (v_day1, 'Junior Cadet — Practice','09:00', '09:15', 'Cadet',    FALSE, 2),
    (v_day1, 'Mini Max — Practice',    '09:15', '09:30', 'Mini Max', FALSE, 3),
    (v_day1, 'Junior Max — Practice',  '09:30', '09:45', 'Junior',   FALSE, 4),
    (v_day1, 'Senior Max — Practice',  '09:45', '10:00', 'Senior',   FALSE, 5),
    (v_day1, 'Lunch Break',            '12:00', '13:00', NULL,       TRUE,  6),
    (v_day1, 'Junior Cadet — Heat 1',  '13:00', '13:15', 'Cadet',    FALSE, 7),
    (v_day1, 'Mini Max — Heat 1',      '13:15', '13:30', 'Mini Max', FALSE, 8),
    (v_day1, 'Junior Max — Heat 1',    '13:30', '13:45', 'Junior',   FALSE, 9),
    (v_day1, 'Senior Max — Heat 1',    '13:45', '14:00', 'Senior',   FALSE, 10),
    (v_day1, 'Junior Cadet — Final',   '15:30', '15:45', 'Cadet',    FALSE, 11),
    (v_day1, 'Mini Max — Final',       '15:45', '16:00', 'Mini Max', FALSE, 12),
    (v_day1, 'Junior Max — Final',     '16:00', '16:15', 'Junior',   FALSE, 13),
    (v_day1, 'Senior Max — Final',     '16:15', '16:30', 'Senior',   FALSE, 14),
    (v_day1, 'Presentations',          '17:00', NULL,    NULL,       FALSE, 15);

  -- Round 3, Sunday
  INSERT INTO timetable_entries (
    event_day_id, title, start_time, end_time, category, is_break, sort_order
  ) VALUES
    (v_day2, 'Gates Open',             '07:30', '08:00', NULL,       TRUE,  0),
    (v_day2, 'Sign-On',                '08:00', '08:30', NULL,       FALSE, 1),
    (v_day2, 'Junior Cadet — Warm Up', '08:30', '08:45', 'Cadet',    FALSE, 2),
    (v_day2, 'Mini Max — Warm Up',     '08:45', '09:00', 'Mini Max', FALSE, 3),
    (v_day2, 'Junior Max — Warm Up',   '09:00', '09:15', 'Junior',   FALSE, 4),
    (v_day2, 'Senior Max — Warm Up',   '09:15', '09:30', 'Senior',   FALSE, 5),
    (v_day2, 'Lunch Break',            '12:00', '13:00', NULL,       TRUE,  6),
    (v_day2, 'Junior Cadet — Final',   '15:00', '15:15', 'Cadet',    FALSE, 7),
    (v_day2, 'Mini Max — Final',       '15:15', '15:30', 'Mini Max', FALSE, 8),
    (v_day2, 'Junior Max — Final',     '15:30', '15:45', 'Junior',   FALSE, 9),
    (v_day2, 'Senior Max — Final',     '15:45', '16:00', 'Senior',   FALSE, 10),
    (v_day2, 'Presentations',          '16:30', NULL,    NULL,       FALSE, 11);

  -- Round 4 (draft) — minimal placeholder
  INSERT INTO timetable_entries (
    event_day_id, title, start_time, end_time, category, is_break, sort_order
  ) VALUES
    (v_day3, 'TBC — check back closer to the event', '09:00', NULL, NULL, FALSE, 0);

END $$;
