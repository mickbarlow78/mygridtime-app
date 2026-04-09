-- ================================================================
-- MyGridTime — Org Branding
-- Migration: 20260410000003_add_org_branding
-- ================================================================
-- Adds a nullable jsonb branding column to organisations.
-- Shape: { primaryColor?: string, logoUrl?: string, headerText?: string }
-- No RLS change needed — existing org member policies cover owner/admin writes.
-- Public pages read this column via the service-role client (no anon policy needed).
-- ================================================================

ALTER TABLE organisations ADD COLUMN branding jsonb;
