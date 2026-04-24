-- ================================================================
-- MGT-107 — Phase 4: rename org → championship at the DB layer
-- Migration: 20260424000000_mgt_107_rename_org_to_championship
-- ================================================================
-- Completes the multi-phase rename started by MGT-104 (UI copy),
-- MGT-105 (internal TS names), and MGT-106 (admin routes). This is
-- the breaking-change phase: the DB schema itself is renamed to the
-- new terminology so the code no longer has to carry a translation
-- layer.
--
-- What this migration does:
--   1. Renames three tables:
--        organisations       -> championships
--        org_members         -> championship_members
--        org_invites         -> championship_invites
--   2. Renames the FK column `org_id` -> `championship_id` on every
--      table that referenced organisations(id):
--        events, templates, audit_log, ai_extraction_log,
--        championship_members (post-rename),
--        championship_invites (post-rename)
--      (notification_emails is a `text[]` COLUMN on events, NOT a
--      table, so nothing to rename there.)
--   3. Renames relevant constraints, indexes, and the updated_at
--      trigger so stored identifiers match the new names.
--   4. Rewrites the body of get_user_org_role(p_org_id) to reference
--      championship_members/championship_id. The FUNCTION NAME and
--      PARAMETER NAME stay unchanged — this is a conscious deferral
--      (see plan) because renaming the helper cascades into ~70 RLS
--      predicate bodies and is out of scope for MGT-107.
--   5. Drops and recreates every RLS policy that referenced a
--      renamed table or the renamed column so the stored policy text
--      uses the new names. Policy identifiers for renamed tables are
--      renamed (orgs_* -> championships_*, org_members_* ->
--      championship_members_*, invites_* -> championship_invites_*);
--      policy identifiers on retained tables keep their historical
--      names as labels (per the 20260420010001 cleanup convention).
--   6. Backfills audit_log.action from 'organisation.*' to
--      'championship.*' so historical rows reflect the new taxonomy.
--   7. Final DO block asserts the end state matches expectations.
--
-- Run inside a single transaction.
-- ================================================================

BEGIN;

-- ================================================================
-- 1. DROP every policy that will need recreation
-- ================================================================
-- Policies on renamed tables
DROP POLICY IF EXISTS "orgs_select_members"              ON organisations;
DROP POLICY IF EXISTS "orgs_insert_authenticated"        ON organisations;
DROP POLICY IF EXISTS "orgs_update_owner_admin"          ON organisations;
DROP POLICY IF EXISTS "orgs_delete_owner"                ON organisations;

DROP POLICY IF EXISTS "org_members_select"               ON org_members;
DROP POLICY IF EXISTS "org_members_insert_owner_admin"   ON org_members;
DROP POLICY IF EXISTS "org_members_update_owner_admin"   ON org_members;
DROP POLICY IF EXISTS "org_members_delete_owner_admin"   ON org_members;

DROP POLICY IF EXISTS "invites_select_owner_admin"       ON org_invites;
DROP POLICY IF EXISTS "invites_insert_owner_admin"       ON org_invites;
DROP POLICY IF EXISTS "invites_delete_owner_admin"       ON org_invites;
DROP POLICY IF EXISTS "invites_update_owner_admin"       ON org_invites;

-- Policies on retained tables that reference org_id
DROP POLICY IF EXISTS "events_select_public"             ON events;
DROP POLICY IF EXISTS "events_select_members"            ON events;
DROP POLICY IF EXISTS "events_insert_editor"             ON events;
DROP POLICY IF EXISTS "events_update_editor"             ON events;
DROP POLICY IF EXISTS "events_delete_admin"              ON events;

DROP POLICY IF EXISTS "event_days_select_public"         ON event_days;
DROP POLICY IF EXISTS "event_days_select_members"        ON event_days;
DROP POLICY IF EXISTS "event_days_insert_editor"         ON event_days;
DROP POLICY IF EXISTS "event_days_update_editor"         ON event_days;
DROP POLICY IF EXISTS "event_days_delete_editor"         ON event_days;

DROP POLICY IF EXISTS "entries_select_public"            ON timetable_entries;
DROP POLICY IF EXISTS "entries_select_members"           ON timetable_entries;
DROP POLICY IF EXISTS "entries_insert_editor"            ON timetable_entries;
DROP POLICY IF EXISTS "entries_update_editor"            ON timetable_entries;
DROP POLICY IF EXISTS "entries_delete_editor"            ON timetable_entries;

DROP POLICY IF EXISTS "audit_log_insert_members"         ON audit_log;
DROP POLICY IF EXISTS "audit_log_select_admin"           ON audit_log;

DROP POLICY IF EXISTS "notification_log_select_admin"    ON notification_log;
DROP POLICY IF EXISTS "notification_log_insert_editor"   ON notification_log;

DROP POLICY IF EXISTS "ai_extraction_log_select_members" ON ai_extraction_log;

DROP POLICY IF EXISTS "templates_select"                 ON templates;
DROP POLICY IF EXISTS "templates_insert"                 ON templates;
DROP POLICY IF EXISTS "templates_delete"                 ON templates;

DROP POLICY IF EXISTS "snapshots_select"                 ON timetable_snapshots;
DROP POLICY IF EXISTS "snapshots_insert"                 ON timetable_snapshots;

-- Storage policies on the event-extractions bucket reference
-- get_user_org_role() but pass a uuid literal, not the renamed
-- column, so they do not need recreation. They will continue to work
-- because the function's signature stays intact.

-- ================================================================
-- 2. Drop the XOR constraint (references the soon-to-be-renamed column)
-- ================================================================
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_scope_xor;

-- ================================================================
-- 3. Rename tables
-- ================================================================
ALTER TABLE organisations RENAME TO championships;
ALTER TABLE org_members   RENAME TO championship_members;
ALTER TABLE org_invites   RENAME TO championship_invites;

-- ================================================================
-- 4. Rename org_id -> championship_id on every FK-bearing table
-- ================================================================
ALTER TABLE championship_members RENAME COLUMN org_id TO championship_id;
ALTER TABLE championship_invites RENAME COLUMN org_id TO championship_id;
ALTER TABLE events               RENAME COLUMN org_id TO championship_id;
ALTER TABLE templates            RENAME COLUMN org_id TO championship_id;
ALTER TABLE audit_log            RENAME COLUMN org_id TO championship_id;
ALTER TABLE ai_extraction_log    RENAME COLUMN org_id TO championship_id;

-- ================================================================
-- 5. Rename constraints and indexes
-- ================================================================
-- Primary keys (auto-renamed by ALTER TABLE RENAME in recent PG, but
-- explicit rename is safer and idempotent).
ALTER TABLE championships        RENAME CONSTRAINT organisations_pkey       TO championships_pkey;
ALTER TABLE championships        RENAME CONSTRAINT organisations_slug_key   TO championships_slug_key;

ALTER TABLE championship_members RENAME CONSTRAINT org_members_pkey             TO championship_members_pkey;
ALTER TABLE championship_members RENAME CONSTRAINT org_members_org_id_fkey      TO championship_members_championship_id_fkey;
ALTER TABLE championship_members RENAME CONSTRAINT org_members_user_id_fkey     TO championship_members_user_id_fkey;
ALTER TABLE championship_members RENAME CONSTRAINT org_members_org_id_user_id_key TO championship_members_championship_id_user_id_key;
ALTER TABLE championship_members RENAME CONSTRAINT org_members_role_check       TO championship_members_role_check;

ALTER TABLE championship_invites RENAME CONSTRAINT org_invites_pkey             TO championship_invites_pkey;
ALTER TABLE championship_invites RENAME CONSTRAINT org_invites_org_id_fkey      TO championship_invites_championship_id_fkey;
ALTER TABLE championship_invites RENAME CONSTRAINT org_invites_invited_by_fkey  TO championship_invites_invited_by_fkey;
ALTER TABLE championship_invites RENAME CONSTRAINT org_invites_token_key        TO championship_invites_token_key;
ALTER TABLE championship_invites RENAME CONSTRAINT org_invites_role_check       TO championship_invites_role_check;

ALTER TABLE events            RENAME CONSTRAINT events_org_id_fkey       TO events_championship_id_fkey;
ALTER TABLE events            RENAME CONSTRAINT events_org_id_slug_key   TO events_championship_id_slug_key;

ALTER TABLE templates         RENAME CONSTRAINT templates_org_id_fkey    TO templates_championship_id_fkey;

ALTER TABLE ai_extraction_log RENAME CONSTRAINT ai_extraction_log_org_id_fkey TO ai_extraction_log_championship_id_fkey;

ALTER TABLE audit_log         RENAME CONSTRAINT audit_log_org_id_fkey    TO audit_log_championship_id_fkey;

-- Explicitly-named indexes
ALTER INDEX org_invites_pending_unique           RENAME TO championship_invites_pending_unique;
ALTER INDEX ai_extraction_log_org_created_idx    RENAME TO ai_extraction_log_championship_created_idx;

-- Triggers
ALTER TRIGGER organisations_updated_at ON championships
  RENAME TO championships_updated_at;

-- ================================================================
-- 6. Rewrite get_user_org_role() body — name + signature unchanged
-- ================================================================
-- The helper is referenced by ~70 RLS predicates and the hand-written
-- types file. Keeping its name stable avoids cascading edits across
-- every stored policy body. Only the SELECT target changes.
CREATE OR REPLACE FUNCTION get_user_org_role(p_org_id uuid)
RETURNS text AS $$
  SELECT CASE
    WHEN is_platform_staff() THEN 'owner'
    ELSE (
      SELECT role
      FROM   championship_members
      WHERE  championship_id = p_org_id
        AND  user_id         = auth.uid()
    )
  END
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ================================================================
-- 7. Re-add the dual-scope XOR CHECK using the new column name
-- ================================================================
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_scope_xor
  CHECK ((event_id IS NULL) <> (championship_id IS NULL));

-- ================================================================
-- 8. Backfill audit_log.action values ('organisation.*' -> 'championship.*')
-- ================================================================
UPDATE audit_log
   SET action = 'championship.' || substring(action FROM length('organisation.') + 1)
 WHERE action LIKE 'organisation.%';

-- ================================================================
-- 9. Recreate RLS policies with the new table/column names
-- ================================================================

-- ----------------------------------------------------------------
-- championships (was organisations)
-- ----------------------------------------------------------------
CREATE POLICY "championships_select_members"
  ON championships FOR SELECT
  USING (
    is_platform_staff()
    OR id IN (SELECT championship_id FROM championship_members WHERE user_id = auth.uid())
  );

CREATE POLICY "championships_insert_authenticated"
  ON championships FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "championships_update_owner_admin"
  ON championships FOR UPDATE
  USING (get_user_org_role(id) = 'owner');

CREATE POLICY "championships_delete_owner"
  ON championships FOR DELETE
  USING (get_user_org_role(id) = 'owner');

-- ----------------------------------------------------------------
-- championship_members (was org_members)
-- ----------------------------------------------------------------
CREATE POLICY "championship_members_select"
  ON championship_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_platform_staff()
  );

CREATE POLICY "championship_members_insert_owner_admin"
  ON championship_members FOR INSERT
  WITH CHECK (get_user_org_role(championship_id) = 'owner');

CREATE POLICY "championship_members_update_owner_admin"
  ON championship_members FOR UPDATE
  USING (get_user_org_role(championship_id) = 'owner');

CREATE POLICY "championship_members_delete_owner_admin"
  ON championship_members FOR DELETE
  USING (get_user_org_role(championship_id) = 'owner');

-- ----------------------------------------------------------------
-- championship_invites (was org_invites)
-- ----------------------------------------------------------------
CREATE POLICY "championship_invites_select_owner_admin"
  ON championship_invites FOR SELECT
  USING (get_user_org_role(championship_id) = 'owner');

CREATE POLICY "championship_invites_insert_owner_admin"
  ON championship_invites FOR INSERT
  WITH CHECK (get_user_org_role(championship_id) = 'owner');

CREATE POLICY "championship_invites_delete_owner_admin"
  ON championship_invites FOR DELETE
  USING (get_user_org_role(championship_id) = 'owner');

CREATE POLICY "championship_invites_update_owner_admin"
  ON championship_invites FOR UPDATE
  USING (get_user_org_role(championship_id) = 'owner');

-- ----------------------------------------------------------------
-- events
-- ----------------------------------------------------------------
CREATE POLICY "events_select_public"
  ON events FOR SELECT
  USING (status = 'published' AND deleted_at IS NULL);

CREATE POLICY "events_select_members"
  ON events FOR SELECT
  USING (
    is_platform_staff()
    OR championship_id IN (SELECT championship_id FROM championship_members WHERE user_id = auth.uid())
  );

CREATE POLICY "events_insert_editor"
  ON events FOR INSERT
  WITH CHECK (get_user_org_role(championship_id) IN ('owner','editor'));

CREATE POLICY "events_update_editor"
  ON events FOR UPDATE
  USING (get_user_org_role(championship_id) IN ('owner','editor'));

CREATE POLICY "events_delete_admin"
  ON events FOR DELETE
  USING (get_user_org_role(championship_id) = 'owner');

-- ----------------------------------------------------------------
-- event_days
-- ----------------------------------------------------------------
CREATE POLICY "event_days_select_public"
  ON event_days FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM events WHERE status = 'published' AND deleted_at IS NULL
    )
  );

CREATE POLICY "event_days_select_members"
  ON event_days FOR SELECT
  USING (
    is_platform_staff()
    OR event_id IN (
      SELECT e.id
      FROM   events e
      INNER  JOIN championship_members cm ON cm.championship_id = e.championship_id
      WHERE  cm.user_id = auth.uid()
    )
  );

CREATE POLICY "event_days_insert_editor"
  ON event_days FOR INSERT
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.championship_id) IN ('owner','editor')
    )
  );

CREATE POLICY "event_days_update_editor"
  ON event_days FOR UPDATE
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.championship_id) IN ('owner','editor')
    )
  );

CREATE POLICY "event_days_delete_editor"
  ON event_days FOR DELETE
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.championship_id) IN ('owner','editor')
    )
  );

-- ----------------------------------------------------------------
-- timetable_entries
-- ----------------------------------------------------------------
CREATE POLICY "entries_select_public"
  ON timetable_entries FOR SELECT
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE e.status = 'published' AND e.deleted_at IS NULL
    )
  );

CREATE POLICY "entries_select_members"
  ON timetable_entries FOR SELECT
  USING (
    is_platform_staff()
    OR event_day_id IN (
      SELECT ed.id
      FROM   event_days ed
      INNER  JOIN events               e  ON e.id              = ed.event_id
      INNER  JOIN championship_members cm ON cm.championship_id = e.championship_id
      WHERE  cm.user_id = auth.uid()
    )
  );

CREATE POLICY "entries_insert_editor"
  ON timetable_entries FOR INSERT
  WITH CHECK (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.championship_id) IN ('owner','editor')
    )
  );

CREATE POLICY "entries_update_editor"
  ON timetable_entries FOR UPDATE
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.championship_id) IN ('owner','editor')
    )
  );

CREATE POLICY "entries_delete_editor"
  ON timetable_entries FOR DELETE
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.championship_id) IN ('owner','editor')
    )
  );

-- ----------------------------------------------------------------
-- audit_log (dual-scoped — MGT-055 / DEC-025)
-- ----------------------------------------------------------------
CREATE POLICY "audit_log_insert_members"
  ON audit_log FOR INSERT
  WITH CHECK (
    (event_id IS NOT NULL
       AND event_id IN (
         SELECT e.id
         FROM   events e
         WHERE  get_user_org_role(e.championship_id) IN ('owner','editor')
       ))
    OR
    (championship_id IS NOT NULL
       AND get_user_org_role(championship_id) IN ('owner','editor'))
  );

CREATE POLICY "audit_log_select_admin"
  ON audit_log FOR SELECT
  USING (
    (event_id IS NOT NULL
       AND event_id IN (
         SELECT e.id
         FROM   events e
         WHERE  get_user_org_role(e.championship_id) = 'owner'
       ))
    OR
    (championship_id IS NOT NULL
       AND get_user_org_role(championship_id) = 'owner')
  );

-- ----------------------------------------------------------------
-- notification_log
-- ----------------------------------------------------------------
CREATE POLICY "notification_log_select_admin"
  ON notification_log FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.championship_id) = 'owner'
    )
  );

CREATE POLICY "notification_log_insert_editor"
  ON notification_log FOR INSERT
  WITH CHECK (
    event_id IS NULL
    OR event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.championship_id) IN ('owner','editor')
    )
  );

-- ----------------------------------------------------------------
-- ai_extraction_log (MGT-070 / DEC-030)
-- ----------------------------------------------------------------
CREATE POLICY "ai_extraction_log_select_members"
  ON ai_extraction_log FOR SELECT
  USING (get_user_org_role(championship_id) IN ('owner','editor'));

-- ----------------------------------------------------------------
-- templates (Phase 6 / MGT chunk 2)
-- ----------------------------------------------------------------
CREATE POLICY templates_select ON templates
  FOR SELECT
  USING (get_user_org_role(championship_id) IS NOT NULL);

CREATE POLICY templates_insert ON templates
  FOR INSERT
  WITH CHECK (get_user_org_role(championship_id) IN ('owner','editor'));

CREATE POLICY templates_delete ON templates
  FOR DELETE
  USING (get_user_org_role(championship_id) IN ('owner','editor'));

-- ----------------------------------------------------------------
-- timetable_snapshots
-- ----------------------------------------------------------------
CREATE POLICY snapshots_select ON timetable_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = timetable_snapshots.event_id
        AND get_user_org_role(e.championship_id) IS NOT NULL
    )
  );

CREATE POLICY snapshots_insert ON timetable_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = timetable_snapshots.event_id
        AND get_user_org_role(e.championship_id) IN ('owner','editor')
    )
  );

-- ================================================================
-- 10. Final guard assertions
-- ================================================================
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Tables exist under new names
  PERFORM 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'championships';
  IF NOT FOUND THEN RAISE EXCEPTION 'championships table missing'; END IF;

  PERFORM 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'championship_members';
  IF NOT FOUND THEN RAISE EXCEPTION 'championship_members table missing'; END IF;

  PERFORM 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'championship_invites';
  IF NOT FOUND THEN RAISE EXCEPTION 'championship_invites table missing'; END IF;

  -- Old table names are gone
  PERFORM 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('organisations','org_members','org_invites');
  IF FOUND THEN RAISE EXCEPTION 'legacy table name still present'; END IF;

  -- championship_id column exists on every expected table
  FOR v_count IN
    SELECT count(*)::int FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name  = 'championship_id'
       AND table_name   IN (
         'championship_members','championship_invites','events',
         'templates','audit_log','ai_extraction_log'
       )
  LOOP
    IF v_count <> 6 THEN
      RAISE EXCEPTION 'championship_id missing on one of the expected tables (found % of 6)', v_count;
    END IF;
  END LOOP;

  -- No org_id columns remain
  SELECT count(*)::int INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name = 'org_id';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org_id column still present on % table(s)', v_count;
  END IF;

  -- audit_log_scope_xor re-added and references championship_id
  PERFORM 1 FROM pg_constraint
    WHERE conname = 'audit_log_scope_xor'
      AND pg_get_constraintdef(oid) LIKE '%championship_id%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit_log_scope_xor not rebuilt with championship_id';
  END IF;

  -- No residual organisation.* audit rows
  SELECT count(*)::int INTO v_count FROM audit_log WHERE action LIKE 'organisation.%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % rows with organisation.* action remain', v_count;
  END IF;
END $$;

COMMIT;
