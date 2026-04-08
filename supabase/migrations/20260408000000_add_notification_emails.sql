-- ================================================================
-- Phase 5: Email Notifications
-- Migration: 20260408000000_add_notification_emails
-- ================================================================

-- Add notification_emails to events.
-- Stores the list of addresses the organiser wants notified on
-- publish and timetable updates. Managed via the admin editor.
ALTER TABLE events
  ADD COLUMN notification_emails text[] NOT NULL DEFAULT '{}';

-- Add error column to notification_log for failure detail.
-- Allows post-hoc debugging of failed sends without crashing actions.
ALTER TABLE notification_log
  ADD COLUMN error text;

-- Allow editors (owner/admin/editor) to insert notification log rows.
-- Notifications are triggered by editor-level actions (publish, timetable
-- save), so this mirrors the pattern used by audit_log_insert_editor.
CREATE POLICY "notification_log_insert_editor"
  ON notification_log FOR INSERT
  WITH CHECK (
    event_id IS NULL
    OR event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner', 'admin', 'editor')
    )
  );
