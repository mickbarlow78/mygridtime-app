-- ================================================================
-- Phase A — Platform staff access + audit actor_context
-- Migration: 20260416000000_phase_a_platform_role
-- ================================================================
-- Adds:
--   1. users.platform_role       — nullable text, CHECK constrained
--   2. audit_log.actor_context   — nullable jsonb (via + optional metadata)
--   3. is_platform_staff()       — SQL helper, SECURITY DEFINER STABLE
--   4. get_user_org_role()       — extended to short-circuit platform staff
--                                   to the effective role 'owner'
--      (Phase A compatibility shortcut — application code preserves the
--       via: 'platform' | 'membership' distinction in audit_context and in
--       ActiveOrg so UI/business semantics never imply platform staff
--       are actual customer org owners.)
--   5. SELECT policies on organisations, org_members, events, event_days,
--      and timetable_entries — extended with OR is_platform_staff() so
--      cross-org platform staff can read without a membership row.
-- Editor publish behaviour is unchanged: get_user_org_role() returns
-- 'owner' for platform staff, which is already a permitted editor role
-- for publish/unpublish/archive policies.
-- Organisation INSERT policy is unchanged (any authenticated user).
-- ================================================================

-- ----------------------------------------------------------------
-- 1. users.platform_role
-- ----------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN platform_role text
    CHECK (platform_role IS NULL OR platform_role IN ('staff', 'support'));

-- ----------------------------------------------------------------
-- 2. audit_log.actor_context
-- ----------------------------------------------------------------
ALTER TABLE audit_log
  ADD COLUMN actor_context jsonb;

-- ----------------------------------------------------------------
-- 3. is_platform_staff() helper
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_platform_staff()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   users
    WHERE  id = auth.uid()
      AND  platform_role IS NOT NULL
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------
-- 4. Extend get_user_org_role() — Phase A compatibility shortcut
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_org_role(p_org_id uuid)
RETURNS text AS $$
  SELECT CASE
    WHEN is_platform_staff() THEN 'owner'
    ELSE (
      SELECT role
      FROM   org_members
      WHERE  org_id  = p_org_id
        AND  user_id = auth.uid()
    )
  END
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------
-- 5. Extend SELECT policies that bypassed get_user_org_role()
-- ----------------------------------------------------------------
-- These policies list by membership subquery rather than by role, so
-- the function change alone does not grant platform staff read access.
-- Each is replaced with an OR is_platform_staff() variant.

DROP POLICY IF EXISTS "orgs_select_members" ON organisations;
CREATE POLICY "orgs_select_members"
  ON organisations FOR SELECT
  USING (
    is_platform_staff()
    OR id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org_members_select" ON org_members;
CREATE POLICY "org_members_select"
  ON org_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_platform_staff()
  );

DROP POLICY IF EXISTS "events_select_members" ON events;
CREATE POLICY "events_select_members"
  ON events FOR SELECT
  USING (
    is_platform_staff()
    OR org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "event_days_select_members" ON event_days;
CREATE POLICY "event_days_select_members"
  ON event_days FOR SELECT
  USING (
    is_platform_staff()
    OR event_id IN (
      SELECT e.id
      FROM   events e
      INNER  JOIN org_members om ON om.org_id = e.org_id
      WHERE  om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "entries_select_members" ON timetable_entries;
CREATE POLICY "entries_select_members"
  ON timetable_entries FOR SELECT
  USING (
    is_platform_staff()
    OR event_day_id IN (
      SELECT ed.id
      FROM   event_days ed
      INNER  JOIN events       e  ON e.id      = ed.event_id
      INNER  JOIN org_members  om ON om.org_id = e.org_id
      WHERE  om.user_id = auth.uid()
    )
  );
