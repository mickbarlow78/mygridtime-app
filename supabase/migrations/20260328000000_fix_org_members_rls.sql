-- ================================================================
-- Fix: org_members SELECT policy was self-referential (circular).
--
-- The original policy:
--   USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))
--
-- queried org_members from within the org_members policy itself.
-- Postgres evaluated the inner subquery under the same RLS policy,
-- returning zero rows, so the outer USING clause matched nothing.
-- This caused membership lookups to return null for all authenticated
-- users, which cascaded to events/event_days/entries being invisible too.
--
-- Fix: use direct equality on user_id — non-recursive, correct.
-- ================================================================

DROP POLICY IF EXISTS "org_members_select" ON org_members;

CREATE POLICY "org_members_select"
  ON org_members FOR SELECT
  USING (user_id = auth.uid());
