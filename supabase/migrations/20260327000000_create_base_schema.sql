-- ================================================================
-- MyGridTime — Base Schema
-- Migration: 20260327000000_create_base_schema
-- ================================================================
-- Tables: organisations, users, org_members, events, event_days,
--         timetable_entries, audit_log, notification_log
-- RLS enabled on all tables.
-- updated_at trigger on: organisations, events, timetable_entries
-- Auto-create user record on auth.users INSERT.
-- ================================================================

-- ----------------------------------------------------------------
-- Helper: updated_at auto-update
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- Table: organisations
-- ----------------------------------------------------------------
CREATE TABLE organisations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER organisations_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------
-- Table: users (mirrors auth.users — populated by trigger below)
-- ----------------------------------------------------------------
CREATE TABLE users (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- Table: org_members
-- ----------------------------------------------------------------
CREATE TABLE org_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- ----------------------------------------------------------------
-- Table: events
-- ----------------------------------------------------------------
CREATE TABLE events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  slug         text        NOT NULL UNIQUE,
  venue        text,
  timezone     text        NOT NULL DEFAULT 'Europe/London',
  status       text        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  start_date   date        NOT NULL,
  end_date     date        NOT NULL,
  notes        text,
  branding     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------
-- Table: event_days
-- ----------------------------------------------------------------
CREATE TABLE event_days (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  label      text,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- Table: timetable_entries
-- ----------------------------------------------------------------
CREATE TABLE timetable_entries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_day_id uuid        NOT NULL REFERENCES event_days(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  start_time   time        NOT NULL,
  end_time     time,
  category     text,
  notes        text,
  sort_order   integer     NOT NULL DEFAULT 0,
  is_break     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER timetable_entries_updated_at
  BEFORE UPDATE ON timetable_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------
-- Table: audit_log
-- ----------------------------------------------------------------
CREATE TABLE audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES users(id),
  event_id   uuid        REFERENCES events(id),
  action     text        NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- Table: notification_log
-- ----------------------------------------------------------------
CREATE TABLE notification_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid        REFERENCES events(id),
  type            text        NOT NULL,
  recipient_email text        NOT NULL,
  status          text        NOT NULL CHECK (status IN ('queued','sent','failed')),
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- Enable RLS on all tables
-- ================================================================
ALTER TABLE organisations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_days        ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log  ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- Helper: return the calling user's role in an org
-- Returns NULL if user has no membership.
-- ================================================================
CREATE OR REPLACE FUNCTION get_user_org_role(p_org_id uuid)
RETURNS text AS $$
  SELECT role
  FROM org_members
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ================================================================
-- RLS Policies
-- ================================================================

-- ----------------------------------------------------------------
-- organisations
-- ----------------------------------------------------------------
CREATE POLICY "orgs_select_members"
  ON organisations FOR SELECT
  USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "orgs_insert_authenticated"
  ON organisations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "orgs_update_owner_admin"
  ON organisations FOR UPDATE
  USING (get_user_org_role(id) IN ('owner','admin'));

CREATE POLICY "orgs_delete_owner"
  ON organisations FOR DELETE
  USING (get_user_org_role(id) = 'owner');

-- ----------------------------------------------------------------
-- users
-- ----------------------------------------------------------------
CREATE POLICY "users_select_own"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users_insert_own"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- ----------------------------------------------------------------
-- org_members
-- ----------------------------------------------------------------
CREATE POLICY "org_members_select"
  ON org_members FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Phase 3 org creation: service role bypasses this for the initial owner INSERT.
-- Subsequent member additions require owner/admin role.
CREATE POLICY "org_members_insert_owner_admin"
  ON org_members FOR INSERT
  WITH CHECK (get_user_org_role(org_id) IN ('owner','admin'));

CREATE POLICY "org_members_update_owner_admin"
  ON org_members FOR UPDATE
  USING (get_user_org_role(org_id) IN ('owner','admin'));

CREATE POLICY "org_members_delete_owner_admin"
  ON org_members FOR DELETE
  USING (get_user_org_role(org_id) IN ('owner','admin'));

-- ----------------------------------------------------------------
-- events
-- ----------------------------------------------------------------

-- Anonymous / public: published events that are not soft-deleted
CREATE POLICY "events_select_public"
  ON events FOR SELECT
  USING (status = 'published' AND deleted_at IS NULL);

-- Org members: see all events in their org (draft, published, archived)
CREATE POLICY "events_select_members"
  ON events FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "events_insert_editor"
  ON events FOR INSERT
  WITH CHECK (get_user_org_role(org_id) IN ('owner','admin','editor'));

CREATE POLICY "events_update_editor"
  ON events FOR UPDATE
  USING (get_user_org_role(org_id) IN ('owner','admin','editor'));

-- Hard DELETE requires admin+ (soft delete is handled via UPDATE deleted_at)
CREATE POLICY "events_delete_admin"
  ON events FOR DELETE
  USING (get_user_org_role(org_id) IN ('owner','admin'));

-- ----------------------------------------------------------------
-- event_days (inherits event visibility)
-- ----------------------------------------------------------------
CREATE POLICY "event_days_select_public"
  ON event_days FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM events WHERE status = 'published' AND deleted_at IS NULL
    )
  );

CREATE POLICY "event_days_select_members"
  ON event_days FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e
      INNER JOIN org_members om ON om.org_id = e.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "event_days_insert_editor"
  ON event_days FOR INSERT
  WITH CHECK (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','admin','editor')
    )
  );

CREATE POLICY "event_days_update_editor"
  ON event_days FOR UPDATE
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','admin','editor')
    )
  );

CREATE POLICY "event_days_delete_editor"
  ON event_days FOR DELETE
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','admin','editor')
    )
  );

-- ----------------------------------------------------------------
-- timetable_entries (inherits event visibility)
-- ----------------------------------------------------------------
CREATE POLICY "entries_select_public"
  ON timetable_entries FOR SELECT
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE e.status = 'published' AND e.deleted_at IS NULL
    )
  );

CREATE POLICY "entries_select_members"
  ON timetable_entries FOR SELECT
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      INNER JOIN org_members om ON om.org_id = e.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "entries_insert_editor"
  ON timetable_entries FOR INSERT
  WITH CHECK (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.org_id) IN ('owner','admin','editor')
    )
  );

CREATE POLICY "entries_update_editor"
  ON timetable_entries FOR UPDATE
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.org_id) IN ('owner','admin','editor')
    )
  );

CREATE POLICY "entries_delete_editor"
  ON timetable_entries FOR DELETE
  USING (
    event_day_id IN (
      SELECT ed.id FROM event_days ed
      INNER JOIN events e ON e.id = ed.event_id
      WHERE get_user_org_role(e.org_id) IN ('owner','admin','editor')
    )
  );

-- ----------------------------------------------------------------
-- audit_log (admin+ read only; written by server-side code only)
-- ----------------------------------------------------------------
CREATE POLICY "audit_log_select_admin"
  ON audit_log FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','admin')
    )
  );

-- ----------------------------------------------------------------
-- notification_log (admin+ read only; written by server-side code only)
-- ----------------------------------------------------------------
CREATE POLICY "notification_log_select_admin"
  ON notification_log FOR SELECT
  USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE get_user_org_role(e.org_id) IN ('owner','admin')
    )
  );

-- ================================================================
-- Trigger: auto-create public.users row on auth.users INSERT
-- This fires whenever a new Supabase Auth user is created (magic
-- link, OAuth, etc.) and mirrors the row into public.users.
-- ================================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
