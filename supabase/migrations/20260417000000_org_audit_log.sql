-- ================================================================
-- MGT-055 — Org audit logging (dual-scoped audit_log)
-- Migration: 20260417000000_org_audit_log
-- ================================================================
-- Extends audit_log so a row can be scoped to an org instead of an
-- event. Exactly one of event_id / org_id must be set per row. The
-- existing INSERT and SELECT policies are widened to cover both
-- scopes, preserving all existing event-scoped behaviour.
--
-- Closes MGT-054 (backend/data-layer only). UI surface for org-scoped
-- rows is a follow-up pass and is out of scope for this migration.
--
-- See DEC-025 for the dual-scope rule.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. audit_log.org_id + XOR CHECK
-- ----------------------------------------------------------------
ALTER TABLE audit_log
  ADD COLUMN org_id uuid REFERENCES organisations(id);

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_scope_xor
  CHECK ((event_id IS NULL) <> (org_id IS NULL));

-- ----------------------------------------------------------------
-- 2. Widen INSERT policy to cover both scopes
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "audit_log_insert_members" ON audit_log;
CREATE POLICY "audit_log_insert_members"
  ON audit_log FOR INSERT
  WITH CHECK (
    (event_id IS NOT NULL
       AND event_id IN (
         SELECT e.id
         FROM   events e
         WHERE  get_user_org_role(e.org_id) IN ('owner','admin','editor')
       ))
    OR
    (org_id IS NOT NULL
       AND get_user_org_role(org_id) IN ('owner','admin','editor'))
  );

-- ----------------------------------------------------------------
-- 3. Widen SELECT policy to cover both scopes
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
CREATE POLICY "audit_log_select_admin"
  ON audit_log FOR SELECT
  USING (
    (event_id IS NOT NULL
       AND event_id IN (
         SELECT e.id
         FROM   events e
         WHERE  get_user_org_role(e.org_id) IN ('owner','admin')
       ))
    OR
    (org_id IS NOT NULL
       AND get_user_org_role(org_id) IN ('owner','admin'))
  );
