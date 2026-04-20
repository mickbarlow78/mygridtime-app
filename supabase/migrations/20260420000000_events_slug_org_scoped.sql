-- MGT-082: scope event slug uniqueness to the owning organisation.
--
-- The original schema (20260327000000_create_base_schema.sql) declared
-- `events.slug text NOT NULL UNIQUE`, which makes slugs globally unique
-- across the entire `events` table. That contradicts the product intent —
-- two different organisations should be free to each run a "round-1" or
-- "summer-series", and the canonical public URL is nested under the org
-- (`/{orgSlug}/{eventSlug}`) so global uniqueness is unnecessary.
--
-- This migration:
--   1. Drops the global unique constraint `events_slug_key`.
--   2. Adds a composite unique constraint on `(org_id, slug)` so slugs
--      remain unique within an organisation.
--
-- The NOT NULL constraint on `slug` is preserved.

ALTER TABLE events DROP CONSTRAINT events_slug_key;

ALTER TABLE events
  ADD CONSTRAINT events_org_id_slug_key UNIQUE (org_id, slug);
