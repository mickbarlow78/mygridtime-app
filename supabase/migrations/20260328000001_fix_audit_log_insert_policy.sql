-- ================================================================
-- Fix: audit_log had no INSERT policy.
--
-- RLS is enabled on audit_log and there was only a SELECT policy.
-- With no INSERT policy, every insert is silently denied by Postgres.
-- writeAuditLog() swallowed the error (correct — a log failure should
-- not abort the calling action), so the failure was invisible.
--
-- Fix: allow authenticated org members with editor+ role to insert
-- audit log rows for events in their org.
-- ================================================================

CREATE POLICY "audit_log_insert_members"
  ON audit_log FOR INSERT
  WITH CHECK (
    event_id IN (
      SELECT e.id
      FROM   events e
      WHERE  get_user_org_role(e.org_id) IN ('owner', 'admin', 'editor')
    )
  );
