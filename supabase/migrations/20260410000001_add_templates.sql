-- ================================================================
-- Phase 6 — Chunk 2: Event Templates
-- Migration: 20260410000001_add_templates
-- ================================================================
-- Stores reusable event structures (days + entries) as templates
-- scoped to an organisation.
-- ================================================================

CREATE TABLE templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  data       jsonb       NOT NULL,
  created_by uuid        REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the org can view templates
CREATE POLICY templates_select ON templates
  FOR SELECT
  USING (get_user_org_role(org_id) IS NOT NULL);

-- INSERT: editor+ can create templates
CREATE POLICY templates_insert ON templates
  FOR INSERT
  WITH CHECK (get_user_org_role(org_id) IN ('owner', 'admin', 'editor'));

-- DELETE: editor+ can delete templates
CREATE POLICY templates_delete ON templates
  FOR DELETE
  USING (get_user_org_role(org_id) IN ('owner', 'admin', 'editor'));
