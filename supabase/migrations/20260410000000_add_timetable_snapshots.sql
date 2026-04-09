-- ================================================================
-- Phase 6 — Chunk 1: Timetable Snapshots (Version History)
-- Migration: 20260410000000_add_timetable_snapshots
-- ================================================================
-- Stores a read-only snapshot of the timetable each time an event
-- is published. Version numbers increment per event.
-- ================================================================

-- ----------------------------------------------------------------
-- Table: timetable_snapshots
-- ----------------------------------------------------------------
CREATE TABLE timetable_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version      integer     NOT NULL,
  data         jsonb       NOT NULL,
  published_by uuid        REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, version)
);

ALTER TABLE timetable_snapshots ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- RLS policies
-- ----------------------------------------------------------------

-- SELECT: any member of the event's org can view snapshots
CREATE POLICY snapshots_select ON timetable_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = timetable_snapshots.event_id
        AND get_user_org_role(e.org_id) IS NOT NULL
    )
  );

-- INSERT: editor+ in the event's org can create snapshots
CREATE POLICY snapshots_insert ON timetable_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = timetable_snapshots.event_id
        AND get_user_org_role(e.org_id) IN ('owner', 'admin', 'editor')
    )
  );
