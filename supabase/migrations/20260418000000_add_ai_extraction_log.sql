-- ================================================================
-- MGT-070 — AI extraction log
-- Migration: 20260418000000_add_ai_extraction_log
-- ================================================================
-- Persistent record of every AI extraction attempt. Drives the
-- 20/org/day rate limit and forms the source of truth for usage /
-- token-cost reporting. Writes are server-only via the service role
-- key (no authenticated INSERT policy); reads are scoped to org.
--
-- event_id is NULL until `saveExtractedEventContent` confirms the
-- extraction was turned into a real event; rate-limited, errored,
-- and validation-failed rows stay NULL permanently.
-- ================================================================

CREATE TABLE IF NOT EXISTS ai_extraction_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id       uuid        REFERENCES users(id)         ON DELETE SET NULL,
  event_id      uuid        REFERENCES events(id)        ON DELETE SET NULL,
  source_mime   text        NOT NULL,
  source_bytes  int         NOT NULL,
  source_path   text,
  model         text,
  tokens_input  int,
  tokens_output int,
  status        text        NOT NULL CHECK (status IN ('success','error','rate_limited','validation_failed')),
  error_code    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_extraction_log_org_created_idx
  ON ai_extraction_log (org_id, created_at DESC);

ALTER TABLE ai_extraction_log ENABLE ROW LEVEL SECURITY;

-- Org admins + editors can read their own org's extraction log.
CREATE POLICY "ai_extraction_log_select_members"
  ON ai_extraction_log FOR SELECT
  USING (get_user_org_role(org_id) IN ('owner','admin','editor'));

-- No authenticated INSERT/UPDATE/DELETE policy — all writes go
-- through the service-role key from src/app/admin/events/extract/actions.ts.
