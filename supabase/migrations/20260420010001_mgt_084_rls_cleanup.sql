-- ================================================================
-- MGT-084 — RLS IN-list cleanup
-- Migration: 20260420010001_mgt_084_rls_cleanup
-- ================================================================
-- Step 4 of MGT-084. The 20260420010000 migration rewrote all
-- admin/viewer data and tightened org_members.role / org_invites.role
-- CHECK constraints so those tokens can never reappear. RLS policy
-- bodies still referenced the dead 'admin' value in IN(...) lists;
-- this migration removes it so pg_policies drift-audits stay clean.
--
-- Semantic rewrite table:
--
--   | Clause                                     | New clause                             |
--   |--------------------------------------------|----------------------------------------|
--   | IN ('owner','admin')                       | = 'owner'                              |
--   | IN ('owner','admin','editor')              | IN ('owner','editor')                  |
--
-- `is_platform_staff()` OR-clauses on SELECT policies are preserved
-- byte-for-byte so DEC-018 cross-org platform access is unchanged.
-- Policy NAMES are preserved — renaming them adds churn without
-- correctness value. Historical `_admin` / `_owner_admin` suffixes
-- become labels, not claims.
--
-- Pre-flight guard (run once, manually, before applying):
--
--   SELECT schemaname, tablename, policyname, qual, with_check
--   FROM   pg_policies
--   WHERE  qual       LIKE '%''admin''%'
--      OR  with_check LIKE '%''admin''%';
--
-- The row set must match what this migration rewrites. Any extra row
-- means a policy was added between discovery and deploy and a
-- follow-up edit is required.
-- ================================================================

-- ----------------------------------------------------------------
-- organisations
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "orgs_update_owner_admin" ON organisations;
CREATE POLICY "orgs_update_owner_admin"
  ON organisations FOR UPDATE
  USING (get_user_org_role(id) = 'owner');

-- ----------------------------------------------------------------
-- org_members
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "org_members_insert_owner_admin" ON org_members;
CREATE POLICY "org_members_insert_owner_admin"
  ON org_members FOR INSERT
  WITH CHECK (get_user_org_role(org_id) = 'owner');

DROP POLICY IF EXISTS "org_members_update_owner_admin" ON org_members;
CREATE POLICY "org_members_update_owner_admin"
  ON org_members FOR UPDATE
  USING (get_user_org_role(org_id) = 'owner');

DROP POLICY IF EXISTS "org_members_delete_owner_admin" ON org_members;
CREATE POLICY "org_members_delete_owner_admin"
  ON org_members FOR DELETE
  USING (get_user_org_role(org_id) = 'owner');

-- ----------------------------------------------------------------
-- org_invites
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "invites_select_owner_admin" ON org_invites;
CREATE POLICY "invites_select_owner_admin"
  ON org_invites FOR SELECT
  USING (get_user_org_role(org_id) = 'owner');

DROP POLICY IF EXISTS "invites_insert_owner_admin" ON org_invites;
CREATE POLICY "invites_insert_owner_admin"
  ON org_invites FOR INSERT
  WITH CHECK (get_user_org_role(org_id) = 'owner');

DROP POLICY IF EXISTS "invites_delete_owner_admin" ON org_invites;
CREATE POLICY "invites_delete_owner_admin"
  ON org_invites FOR DELETE
  USING (get_user_org_role(org_id) = 'owner');

DROP POLICY IF EXISTS "invites_update_owner_admin" ON org_invites;
CREATE POLICY "invites_update_owner_admin"
  ON org_invites FOR UPDATE
  USING (get_user_org_role(org_id) = 'owner');

-- ----------------------------------------------------------------
-- events
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "events_insert_editor" ON events;
CREATE POLICY "events_insert_editor"
  ON events FOR INSERT
  WITH CHECK (get_user_org_role(org_id) IN ('owner','editor'));

DROP POLICY IF EXISTS "events_update_editor" ON events;
CREATE POLICY "events_update_editor"
  ON events FOR UPDATE
  USING (get_user_org_role(org_id) IN ('owner','editor'));

DROP POLICY IF EXISTS "events_delete_admin" ON events;
CREATE POLICY "events_delete_admin"
  ON events FOR DELETE
  USING (get_user_org_role(org_id) = 'owner');

-- ----------------------------------------------------------------
-- event_days
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "event_days_insert_editor" ON event_days;
CREATE POLICY "event_days_insert_editor"
  ON event_days FOR INSERT
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','editor')
    )
  );

DROP POLICY IF EXISTS "event_days_update_editor" ON event_days;
CREATE POLICY "event_days_update_editor"
  ON event_days FOR UPDATE
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','editor')
    )
  );

DROP POLICY IF EXISTS "event_days_delete_editor" ON event_days;
CREATE POLICY "event_days_delete_editor"
  ON event_days FOR DELETE
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','editor')
    )
  );

-- ----------------------------------------------------------------
-- timetable_entries
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "entries_insert_editor" ON timetable_entries;
CREATE POLICY "entries_insert_editor"
  ON timetable_entries FOR INSERT
  WITH CHECK (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.org_id) IN ('owner','editor')
    )
  );

DROP POLICY IF EXISTS "entries_update_editor" ON timetable_entries;
CREATE POLICY "entries_update_editor"
  ON timetable_entries FOR UPDATE
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.org_id) IN ('owner','editor')
    )
  );

DROP POLICY IF EXISTS "entries_delete_editor" ON timetable_entries;
CREATE POLICY "entries_delete_editor"
  ON timetable_entries FOR DELETE
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.org_id) IN ('owner','editor')
    )
  );

-- ----------------------------------------------------------------
-- audit_log (dual-scoped — see MGT-055 / DEC-025)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "audit_log_insert_members" ON audit_log;
CREATE POLICY "audit_log_insert_members"
  ON audit_log FOR INSERT
  WITH CHECK (
    (event_id IS NOT NULL
       AND event_id IN (
         SELECT e.id
         FROM   events e
         WHERE  get_user_org_role(e.org_id) IN ('owner','editor')
       ))
    OR
    (org_id IS NOT NULL
       AND get_user_org_role(org_id) IN ('owner','editor'))
  );

DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
CREATE POLICY "audit_log_select_admin"
  ON audit_log FOR SELECT
  USING (
    (event_id IS NOT NULL
       AND event_id IN (
         SELECT e.id
         FROM   events e
         WHERE  get_user_org_role(e.org_id) = 'owner'
       ))
    OR
    (org_id IS NOT NULL
       AND get_user_org_role(org_id) = 'owner')
  );

-- ----------------------------------------------------------------
-- notification_log
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "notification_log_select_admin" ON notification_log;
CREATE POLICY "notification_log_select_admin"
  ON notification_log FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) = 'owner'
    )
  );

DROP POLICY IF EXISTS "notification_log_insert_editor" ON notification_log;
CREATE POLICY "notification_log_insert_editor"
  ON notification_log FOR INSERT
  WITH CHECK (
    event_id IS NULL
    OR event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','editor')
    )
  );

-- ----------------------------------------------------------------
-- ai_extraction_log (MGT-070 / DEC-030)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "ai_extraction_log_select_members" ON ai_extraction_log;
CREATE POLICY "ai_extraction_log_select_members"
  ON ai_extraction_log FOR SELECT
  USING (get_user_org_role(org_id) IN ('owner','editor'));

-- ----------------------------------------------------------------
-- templates (Phase 6 / MGT chunk 2)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS templates_insert ON templates;
CREATE POLICY templates_insert ON templates
  FOR INSERT
  WITH CHECK (get_user_org_role(org_id) IN ('owner','editor'));

DROP POLICY IF EXISTS templates_delete ON templates;
CREATE POLICY templates_delete ON templates
  FOR DELETE
  USING (get_user_org_role(org_id) IN ('owner','editor'));

-- ----------------------------------------------------------------
-- timetable_snapshots
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS snapshots_insert ON timetable_snapshots;
CREATE POLICY snapshots_insert ON timetable_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = timetable_snapshots.event_id
        AND get_user_org_role(e.org_id) IN ('owner','editor')
    )
  );

-- ----------------------------------------------------------------
-- storage.objects — event-extractions bucket (MGT-070)
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "event_extractions_insert_editors" ON storage.objects;
CREATE POLICY "event_extractions_insert_editors"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-extractions'
    AND get_user_org_role(((storage.foldername(name))[1])::uuid)
        IN ('owner','editor')
  );
