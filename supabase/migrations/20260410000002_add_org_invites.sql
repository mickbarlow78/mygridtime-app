-- ================================================================
-- MyGridTime — Org Invites
-- Migration: 20260410000002_add_org_invites
-- ================================================================
-- Table: org_invites — email-based invitations to join an organisation
-- RLS: org owner/admin can SELECT, INSERT, DELETE; service-role bypasses for accept
-- ================================================================

-- ----------------------------------------------------------------
-- Table: org_invites
-- ----------------------------------------------------------------
CREATE TABLE org_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'editor'
                          CHECK (role IN ('admin', 'editor', 'viewer')),
  token       uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  invited_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate pending invites for same email+org
CREATE UNIQUE INDEX org_invites_pending_unique
  ON org_invites (org_id, email)
  WHERE accepted_at IS NULL;

-- ----------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------
ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;

-- Org owner/admin can see invites for their org
CREATE POLICY "invites_select_owner_admin"
  ON org_invites FOR SELECT
  USING (get_user_org_role(org_id) IN ('owner', 'admin'));

-- Org owner/admin can create invites
CREATE POLICY "invites_insert_owner_admin"
  ON org_invites FOR INSERT
  WITH CHECK (get_user_org_role(org_id) IN ('owner', 'admin'));

-- Org owner/admin can delete (revoke) invites
CREATE POLICY "invites_delete_owner_admin"
  ON org_invites FOR DELETE
  USING (get_user_org_role(org_id) IN ('owner', 'admin'));

-- Update policy for marking as accepted (owner/admin only via RLS;
-- actual accept uses service-role to bypass)
CREATE POLICY "invites_update_owner_admin"
  ON org_invites FOR UPDATE
  USING (get_user_org_role(org_id) IN ('owner', 'admin'));
