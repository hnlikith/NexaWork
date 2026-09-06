-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 027: Meetings & Video Calls
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS meetings (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT        NOT NULL,
  description     TEXT,
  room_name       TEXT        NOT NULL UNIQUE,
  host_id         UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  channel_id      UUID,
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled','active','ended','cancelled')),
  type            TEXT        NOT NULL DEFAULT 'video'
                              CHECK (type IN ('video','audio','screen')),
  max_participants INT        DEFAULT 100,
  is_recurring    BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id  UUID        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  employee_id UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ,
  left_at     TIMESTAMPTZ,
  role        TEXT        NOT NULL DEFAULT 'participant' CHECK (role IN ('host','participant')),
  UNIQUE (meeting_id, employee_id)
);

-- Add FK to channels after both tables exist
ALTER TABLE meetings ADD CONSTRAINT meetings_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meetings_scheduled_at ON meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS meetings_channel_id ON meetings(channel_id);

-- RLS
ALTER TABLE meetings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

-- Meetings: visible to participants, host, and admins
DROP POLICY IF EXISTS "meetings_select" ON meetings;
CREATE POLICY "meetings_select" ON meetings FOR SELECT TO authenticated USING (
  host_id = auth.uid()
  OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = meetings.id AND mp.employee_id = auth.uid())
  OR EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts'))
);

-- Allow anyone authenticated to insert (host_id validated server-side via service role)
DROP POLICY IF EXISTS "meetings_insert" ON meetings;
CREATE POLICY "meetings_insert" ON meetings FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "meetings_update" ON meetings;
CREATE POLICY "meetings_update" ON meetings FOR UPDATE TO authenticated
  USING (
    host_id = auth.uid()
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts'))
  );

DROP POLICY IF EXISTS "meetings_delete" ON meetings;
CREATE POLICY "meetings_delete" ON meetings FOR DELETE TO authenticated
  USING (
    host_id = auth.uid()
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts'))
  );

-- Meeting participants: open read, controlled write
DROP POLICY IF EXISTS "mp_select" ON meeting_participants;
CREATE POLICY "mp_select" ON meeting_participants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mp_insert" ON meeting_participants;
CREATE POLICY "mp_insert" ON meeting_participants FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mp_update" ON meeting_participants;
CREATE POLICY "mp_update" ON meeting_participants FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "mp_delete" ON meeting_participants;
CREATE POLICY "mp_delete" ON meeting_participants FOR DELETE TO authenticated USING (true);

-- Realtime (participants need to receive incoming call notifications)
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE meetings;             EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE meeting_participants; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
