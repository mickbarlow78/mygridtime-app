-- ================================================================
-- MGT-084 — Roles & Permissions foundation (3-axis model)
-- Migration: 20260420010000_mgt_084_roles
-- ================================================================
-- Locks in the intended role model:
--   Platform    (users.platform_role):       'admin' | 'staff' | 'support' | null
--   Org         (org_members.role):          'owner' | 'editor'
--   Subscription(users.subscription_status): 'member' | 'subscriber'
--
-- Data rewrites (see MGT-084 pre-deploy audit):
--   - org_members.role='admin'  -> 'editor'   (downgrade — was permitted to
--                                              edit org settings; now owner-only)
--   - org_members.role='viewer' -> DELETED    (viewer collapses into the
--                                              subscription axis)
--   - org_invites.role in ('admin','viewer') -> 'editor'
--
-- RLS policy bodies still reference 'admin' in their IN(...) lists. Those
-- tokens become dead code after the new CHECK is installed (the DB can
-- never produce 'admin' again) and are rewritten in the cosmetic cleanup
-- migration 20260420010001_mgt_084_rls_cleanup. Keeping the rewrite out
-- of this file keeps the footprint small and the behavioural change
-- trivially reviewable.
--
-- get_user_org_role() + is_platform_staff() are unchanged. is_platform_staff
-- already returns true for ANY non-null platform_role, so adding 'admin'
-- to the allowed set slots in for free and DEC-018 short-circuit behaviour
-- is preserved verbatim.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Rewrite existing org_members rows
-- ----------------------------------------------------------------
UPDATE org_members SET role = 'editor' WHERE role = 'admin';
DELETE FROM org_members WHERE role = 'viewer';

-- ----------------------------------------------------------------
-- 2. Rewrite existing org_invites rows
-- ----------------------------------------------------------------
UPDATE org_invites SET role = 'editor' WHERE role IN ('admin', 'viewer');

-- ----------------------------------------------------------------
-- 3. Tighten CHECK on org_members.role
-- ----------------------------------------------------------------
ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_role_check;
ALTER TABLE org_members
  ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('owner', 'editor'));

-- ----------------------------------------------------------------
-- 4. Tighten CHECK on org_invites.role (editor-only; owners are created
--    only via createOrganisation, never invited)
-- ----------------------------------------------------------------
ALTER TABLE org_invites DROP CONSTRAINT IF EXISTS org_invites_role_check;
ALTER TABLE org_invites
  ADD CONSTRAINT org_invites_role_check
  CHECK (role = 'editor');

-- ----------------------------------------------------------------
-- 5. Extend CHECK on users.platform_role to allow 'admin'
-- ----------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_platform_role_check
  CHECK (platform_role IS NULL OR platform_role IN ('admin', 'staff', 'support'));

-- ----------------------------------------------------------------
-- 6. Add users.subscription_status (Phase 7c Stripe will flip values;
--    no upgrade flow ships now)
-- ----------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'member'
    CHECK (subscription_status IN ('member', 'subscriber'));
