-- =============================================================
-- MyGridTime — Seed Data
-- =============================================================
-- Applied by: npx supabase db reset  (local)
-- Applied by: Supabase Dashboard > SQL Editor  (hosted)
--
-- What this seeds:
--   - 1 organisation (MyGridTime Demo Club)
--   - 2 events (1 published, 1 draft)
--   - 3 event days
--   - Full timetable entries for Round 3 (Sat + Sun) + placeholder for Round 4
--
-- What this does NOT seed:
--   - Auth users (created via magic link sign-in)
--   - public.users rows (created automatically by trigger on first sign-in)
--   - org_members (add yourself after first sign-in — see instructions below)
--
-- POST-SEED SETUP (run once after your first magic link sign-in):
-- ---------------------------------------------------------------
-- 1. Sign in at /auth/login to create your auth.users + public.users row.
-- 2. In Supabase Dashboard > SQL Editor, run:
--
--      INSERT INTO org_members (org_id, user_id, role)
--      SELECT
--        (SELECT id FROM organisations WHERE slug = 'mygridtime-demo'),
--        auth.uid(),   -- replace with your user UUID if running outside a session
--        'owner'
--      WHERE NOT EXISTS (
--        SELECT 1 FROM org_members
--        WHERE user_id = (SELECT id FROM users LIMIT 1)
--      );
--
--    Or simply:
--      INSERT INTO org_members (org_id, user_id, role)
--      VALUES (
--        '<org_id from organisations table>',
--        '<your user UUID from auth.users>',
--        'owner'
--      );
-- =============================================================

DO $$
DECLARE
  v_org_id  uuid := gen_random_uuid();
  v_event1  uuid := gen_random_uuid();
  v_event2  uuid := gen_random_uuid();
  v_day1    uuid := gen_random_uuid();
  v_day2    uuid := gen_random_uuid();
  v_day3    uuid := gen_random_uuid();
BEGIN

  -- -----------------------------------------------------------
  -- 1. Organisation
  -- -----------------------------------------------------------
  INSERT INTO organisations (id, name, slug)
  VALUES (v_org_id, 'MyGridTime Demo Club', 'mygridtime-demo')
  ON CONFLICT (slug) DO NOTHING;

  -- -----------------------------------------------------------
  -- 2. Events
  -- -----------------------------------------------------------

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

  -- -----------------------------------------------------------
  -- 3. Event Days
  -- -----------------------------------------------------------
  INSERT INTO event_days (id, event_id, date, label, sort_order) VALUES
    (v_day1, v_event1, '2026-05-10', 'Saturday', 0),
    (v_day2, v_event1, '2026-05-11', 'Sunday',   1),
    (v_day3, v_event2, '2026-06-14', 'Sunday',   0);

  -- -----------------------------------------------------------
  -- 4. Timetable Entries — Round 3, Saturday
  -- -----------------------------------------------------------
  INSERT INTO timetable_entries (
    event_day_id, title, start_time, end_time, category, is_break, sort_order
  ) VALUES
    (v_day1, 'Gates Open',              '07:30', '08:00', NULL,        true,  0),
    (v_day1, 'Sign-On & Scrutineering', '08:00', '09:00', NULL,        false, 1),
    (v_day1, 'Junior Cadet — Practice', '09:00', '09:15', 'Cadet',     false, 2),
    (v_day1, 'Mini Max — Practice',     '09:15', '09:30', 'Mini Max',  false, 3),
    (v_day1, 'Junior Max — Practice',   '09:30', '09:45', 'Junior',    false, 4),
    (v_day1, 'Senior Max — Practice',   '09:45', '10:00', 'Senior',    false, 5),
    (v_day1, 'Lunch Break',             '12:00', '13:00', NULL,        true,  6),
    (v_day1, 'Junior Cadet — Heat 1',   '13:00', '13:15', 'Cadet',     false, 7),
    (v_day1, 'Mini Max — Heat 1',       '13:15', '13:30', 'Mini Max',  false, 8),
    (v_day1, 'Junior Max — Heat 1',     '13:30', '13:45', 'Junior',    false, 9),
    (v_day1, 'Senior Max — Heat 1',     '13:45', '14:00', 'Senior',    false, 10),
    (v_day1, 'Junior Cadet — Final',    '15:30', '15:45', 'Cadet',     false, 11),
    (v_day1, 'Mini Max — Final',        '15:45', '16:00', 'Mini Max',  false, 12),
    (v_day1, 'Junior Max — Final',      '16:00', '16:15', 'Junior',    false, 13),
    (v_day1, 'Senior Max — Final',      '16:15', '16:30', 'Senior',    false, 14),
    (v_day1, 'Presentations',           '17:00', NULL,    NULL,        false, 15);

  -- Round 3, Sunday
  INSERT INTO timetable_entries (
    event_day_id, title, start_time, end_time, category, is_break, sort_order
  ) VALUES
    (v_day2, 'Gates Open',              '07:30', '08:00', NULL,        true,  0),
    (v_day2, 'Sign-On',                 '08:00', '08:30', NULL,        false, 1),
    (v_day2, 'Junior Cadet — Warm Up',  '08:30', '08:45', 'Cadet',     false, 2),
    (v_day2, 'Mini Max — Warm Up',      '08:45', '09:00', 'Mini Max',  false, 3),
    (v_day2, 'Junior Max — Warm Up',    '09:00', '09:15', 'Junior',    false, 4),
    (v_day2, 'Senior Max — Warm Up',    '09:15', '09:30', 'Senior',    false, 5),
    (v_day2, 'Lunch Break',             '12:00', '13:00', NULL,        true,  6),
    (v_day2, 'Junior Cadet — Final',    '15:00', '15:15', 'Cadet',     false, 7),
    (v_day2, 'Mini Max — Final',        '15:15', '15:30', 'Mini Max',  false, 8),
    (v_day2, 'Junior Max — Final',      '15:30', '15:45', 'Junior',    false, 9),
    (v_day2, 'Senior Max — Final',      '15:45', '16:00', 'Senior',    false, 10),
    (v_day2, 'Presentations',           '16:30', NULL,    NULL,        false, 11);

  -- Round 4 — placeholder
  INSERT INTO timetable_entries (
    event_day_id, title, start_time, end_time, category, is_break, sort_order
  ) VALUES
    (v_day3, 'TBC — check back closer to the event', '09:00', NULL, NULL, false, 0);

END $$;
