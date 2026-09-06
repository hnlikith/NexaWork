-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 021: Messaging System
--
-- FLOW:
--   Team created      → channel auto-created + all members auto-joined
--   Employee joins team → auto-added to that team's channel
--   Employee leaves/switches team → removed from old channel, added to new
--   Employee deactivated → removed from all channels
--   Admin              → member of ALL channels always
--   Global channels    → #general, #announcements — everyone auto-joined
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. channels ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT        NOT NULL,
  description  TEXT,
  type         TEXT        NOT NULL DEFAULT 'text'
                           CHECK (type IN ('text','announcement','global')),
  team_id      UUID        REFERENCES teams(id) ON DELETE CASCADE,
  is_global    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT channels_team_id_unique UNIQUE (team_id),
  CONSTRAINT channels_name_unique UNIQUE (name)
);

-- ─── 2. channel_members ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_members (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id   UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  employee_id  UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel_id, employee_id)
);

-- ─── 3. messages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id   UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sender_name  TEXT        NOT NULL,
  content      TEXT        NOT NULL DEFAULT '',
  file_url     TEXT,
  file_name    TEXT,
  file_type    TEXT,
  file_size    BIGINT,
  reply_to_id  UUID        REFERENCES messages(id) ON DELETE SET NULL,
  is_deleted   BOOLEAN     NOT NULL DEFAULT false,
  edited_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_channel_id_created_at ON messages(channel_id, created_at);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;

-- channels: visible to members + admins
DROP POLICY IF EXISTS "channels_select" ON channels;
CREATE POLICY "channels_select" ON channels FOR SELECT TO authenticated USING (
  is_global = true
  OR EXISTS (
    SELECT 1 FROM channel_members cm
     WHERE cm.channel_id = channels.id
       AND cm.employee_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM employees e
     WHERE e.id = auth.uid()
       AND e.role IN ('super_admin','accounts')
  )
);

DROP POLICY IF EXISTS "channels_insert" ON channels;
CREATE POLICY "channels_insert" ON channels FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts'))
  );

DROP POLICY IF EXISTS "channels_update" ON channels;
CREATE POLICY "channels_update" ON channels FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts'))
  );

DROP POLICY IF EXISTS "channels_delete" ON channels;
CREATE POLICY "channels_delete" ON channels FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts'))
  );

-- channel_members: full access for all authenticated (server-side triggers manage it)
DROP POLICY IF EXISTS "cm_select" ON channel_members;
DROP POLICY IF EXISTS "cm_insert" ON channel_members;
DROP POLICY IF EXISTS "cm_update" ON channel_members;
DROP POLICY IF EXISTS "cm_delete" ON channel_members;
CREATE POLICY "cm_select" ON channel_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "cm_insert" ON channel_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cm_update" ON channel_members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cm_delete" ON channel_members FOR DELETE TO authenticated USING (true);

-- messages: members of channel can read; sender can insert
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM channel_members cm
     WHERE cm.channel_id = messages.channel_id
       AND cm.employee_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM channels c
     WHERE c.id = messages.channel_id AND c.is_global = true
  )
  OR EXISTS (
    SELECT 1 FROM employees e
     WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts')
  )
);

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts'))
  );

DROP POLICY IF EXISTS "messages_delete" ON messages;
CREATE POLICY "messages_delete" ON messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid()
    OR EXISTS (SELECT 1 FROM employees e WHERE e.id = auth.uid() AND e.role IN ('super_admin','accounts'))
  );


-- ─── 5. Realtime ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE channels;        EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE channel_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE messages;        EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


-- ─── 6. Auto-create channel when a team is created ───────────────────────────
CREATE OR REPLACE FUNCTION trg_team_create_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  -- Create a channel for this team
  INSERT INTO channels (name, description, type, team_id, is_global)
  VALUES (
    LOWER(REGEXP_REPLACE(NEW.name, '\s+', '-', 'g')),
    'Channel for ' || NEW.name || ' team',
    'text',
    NEW.id,
    false
  )
  ON CONFLICT (team_id) DO NOTHING
  RETURNING id INTO v_channel_id;

  IF v_channel_id IS NOT NULL THEN
    -- Add all current members of this team to the channel
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id
      FROM employees e
     WHERE e.team_id = NEW.id AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS team_create_channel ON teams;
CREATE TRIGGER team_create_channel
  AFTER INSERT ON teams
  FOR EACH ROW EXECUTE FUNCTION trg_team_create_channel();


-- ─── 7. Auto-sync members when employee team_id changes ──────────────────────
CREATE OR REPLACE FUNCTION trg_employee_sync_channel_membership()
RETURNS TRIGGER AS $$
DECLARE
  v_old_channel_id UUID;
  v_new_channel_id UUID;
  v_global_channel_id UUID;
BEGIN
  -- Get channel for old team (on UPDATE or DELETE)
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.team_id IS NOT NULL THEN
    SELECT id INTO v_old_channel_id FROM channels WHERE team_id = OLD.team_id LIMIT 1;
  END IF;

  -- Get channel for new team (on INSERT or UPDATE)
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.team_id IS NOT NULL THEN
    SELECT id INTO v_new_channel_id FROM channels WHERE team_id = NEW.team_id LIMIT 1;
  END IF;

  -- Remove from old team channel when team changes or employee deactivated
  IF v_old_channel_id IS NOT NULL THEN
    IF TG_OP = 'DELETE'
       OR (TG_OP = 'UPDATE' AND (OLD.team_id IS DISTINCT FROM NEW.team_id OR NEW.is_active = false))
    THEN
      DELETE FROM channel_members
       WHERE channel_id = v_old_channel_id AND employee_id = OLD.id;
    END IF;
  END IF;

  -- Add to new team channel
  IF v_new_channel_id IS NOT NULL AND TG_OP IN ('INSERT','UPDATE') AND NEW.is_active = true THEN
    INSERT INTO channel_members (channel_id, employee_id)
    VALUES (v_new_channel_id, NEW.id)
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  -- Always ensure membership in all global channels for active employees
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.is_active = true THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id
      FROM channels c
     WHERE c.is_global = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS employee_sync_channel ON employees;
CREATE TRIGGER employee_sync_channel
  AFTER INSERT OR UPDATE OF team_id, is_active OR DELETE
  ON employees
  FOR EACH ROW EXECUTE FUNCTION trg_employee_sync_channel_membership();


-- ─── 8. Seed global channels ─────────────────────────────────────────────────
INSERT INTO channels (name, description, type, is_global)
VALUES
  ('general',       'Company-wide announcements and updates', 'global', true),
  ('announcements', 'Important notices from management',      'announcement', true)
ON CONFLICT (name) DO NOTHING;

-- Add every active employee to global channels
INSERT INTO channel_members (channel_id, employee_id)
SELECT c.id, e.id
  FROM channels c
  CROSS JOIN employees e
 WHERE c.is_global = true AND e.is_active = true
ON CONFLICT (channel_id, employee_id) DO NOTHING;


-- ─── 9. Backfill: create channels for all existing teams ─────────────────────
DO $$
DECLARE r RECORD;
DECLARE v_channel_id UUID;
BEGIN
  FOR r IN SELECT id, name FROM teams LOOP
    INSERT INTO channels (name, description, type, team_id, is_global)
    VALUES (
      LOWER(REGEXP_REPLACE(r.name, '\s+', '-', 'g')),
      'Channel for ' || r.name || ' team',
      'text', r.id, false
    )
    ON CONFLICT (team_id) DO NOTHING
    RETURNING id INTO v_channel_id;

    IF v_channel_id IS NOT NULL THEN
      INSERT INTO channel_members (channel_id, employee_id)
      SELECT v_channel_id, e.id
        FROM employees e
       WHERE e.team_id = r.id AND e.is_active = true
      ON CONFLICT (channel_id, employee_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;


-- ─── 10. unread count helper function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_unread_count(p_channel_id UUID, p_employee_id UUID)
RETURNS BIGINT AS $$
  SELECT COUNT(*)
    FROM messages m
    JOIN channel_members cm
      ON cm.channel_id = m.channel_id AND cm.employee_id = p_employee_id
   WHERE m.channel_id = p_channel_id
     AND m.created_at > cm.last_read_at
     AND m.sender_id  <> p_employee_id
     AND m.is_deleted = false;
$$ LANGUAGE sql SECURITY DEFINER;
