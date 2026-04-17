-- ================================================================
-- MGT-070 — event-extractions Storage bucket
-- Migration: 20260418000001_add_event_extractions_bucket
-- ================================================================
-- Private bucket that archives each uploaded PDF/PNG/JPG so we can
-- reproduce a Claude extraction later (debugging, customer support,
-- regulator requests). One object per extraction at:
--   {org_id}/{extraction_id}/{timestamp}.{ext}
--
-- Writes happen via service role in the server action, but we still
-- publish RLS policies for authenticated reads and belt-and-braces
-- uploads. 30-day retention cleanup is deferred per KNOWN_ISSUES.
-- ================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-extractions', 'event-extractions', false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- INSERT: editor+ in the folder's org can upload
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "event_extractions_insert_editors" ON storage.objects;
CREATE POLICY "event_extractions_insert_editors"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-extractions'
    AND get_user_org_role(((storage.foldername(name))[1])::uuid)
        IN ('owner','admin','editor')
  );

-- ----------------------------------------------------------------
-- SELECT: any org member can read their own org's archived files
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "event_extractions_select_members" ON storage.objects;
CREATE POLICY "event_extractions_select_members"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'event-extractions'
    AND get_user_org_role(((storage.foldername(name))[1])::uuid) IS NOT NULL
  );
