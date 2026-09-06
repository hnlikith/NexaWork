-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 024: Auto Channel Groups
--
-- STRUCTURE:
--   Global   → #general, #announcements — ALL employees auto-joined
--   Teams    → one channel per team — team members auto-joined
--   Depts    → one channel per department — dept employees auto-joined
--   Projects → one channel per project — project members auto-joined
--
-- AUTO-SYNC:
--   Team created/renamed       → channel created/updated
--   Employee team changes      → added/removed from team channel
--   Employee dept changes      → added/removed from dept channel
--   Project created            → channel created, assigned members added
--   Admin always in everything
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Add category column to channels to group sidebar ─────────────────────
ALTER TABLE channels ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('global', 'team', 'department', 'project', 'other'));

ALTER TABLE channels ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS department_name TEXT;

-- Update existing channels
UPDATE channels SET category = 'global'     WHERE is_global = true;
UPDATE channels SET category = 'team'       WHERE team_id IS NOT NULL;


-- ─── 2. Department channels ───────────────────────────────────────────────────
-- Create one channel per distinct department from employees table
INSERT INTO channels (name, description, type, category, department_name, is_global)
SELECT DISTINCT ON (e.department)
  e.department,
  'Channel for ' || e.department || ' department',
  'text',
  'department',
  e.department,
  false
FROM employees e
WHERE e.department IS NOT NULL AND e.department <> ''
  AND e.is_active = true
ON CONFLICT DO NOTHING;

-- Add all dept employees as members
INSERT INTO channel_members (channel_id, employee_id)
SELECT c.id, e.id
  FROM channels c
  JOIN employees e ON e.department = c.department_name
 WHERE c.category = 'department'
   AND e.is_active = true
ON CONFLICT (channel_id, employee_id) DO NOTHING;


-- ─── 3. Project channels ─────────────────────────────────────────────────────
-- Add project_id unique constraint
ALTER TABLE channels ADD CONSTRAINT channels_project_id_unique UNIQUE (project_id);

-- Create one channel per project
INSERT INTO channels (name, description, type, category, project_id, is_global)
SELECT
  p.name,
  'Channel for project: ' || p.name,
  'text',
  'project',
  p.id,
  false
FROM projects p
ON CONFLICT (project_id) DO UPDATE SET name = EXCLUDED.name;

-- Add project members from project_members table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_members') THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, pm.employee_id
      FROM channels c
      JOIN project_members pm ON pm.project_id = c.project_id
     WHERE c.category = 'project'
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;
END $$;


-- ─── 4. Add admins to all new channels ───────────────────────────────────────
INSERT INTO channel_members (channel_id, employee_id)
SELECT c.id, e.id
  FROM channels c
  CROSS JOIN employees e
 WHERE e.role IN ('super_admin', 'accounts')
   AND e.is_active = true
ON CONFLICT (channel_id, employee_id) DO NOTHING;


-- ─── 5. Trigger: employee department changes → sync dept channel ──────────────
CREATE OR REPLACE FUNCTION trg_employee_sync_dept_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_old_ch UUID;
  v_new_ch UUID;
BEGIN
  -- Leave old dept channel
  IF TG_OP = 'UPDATE' AND OLD.department IS DISTINCT FROM NEW.department AND OLD.department IS NOT NULL THEN
    SELECT id INTO v_old_ch FROM channels WHERE category = 'department' AND department_name = OLD.department LIMIT 1;
    IF v_old_ch IS NOT NULL THEN
      DELETE FROM channel_members WHERE channel_id = v_old_ch AND employee_id = OLD.id;
    END IF;
  END IF;

  -- Join new dept channel (create if missing)
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.department IS NOT NULL AND NEW.is_active = true THEN
    SELECT id INTO v_new_ch FROM channels WHERE category = 'department' AND department_name = NEW.department LIMIT 1;
    IF v_new_ch IS NULL THEN
      INSERT INTO channels (name, description, type, category, department_name, is_global)
      VALUES (NEW.department, 'Channel for ' || NEW.department || ' department', 'text', 'department', NEW.department, false)
      ON CONFLICT (name) DO NOTHING
      RETURNING id INTO v_new_ch;
      -- If conflict, fetch existing
      IF v_new_ch IS NULL THEN
        SELECT id INTO v_new_ch FROM channels WHERE name = NEW.department AND category = 'department' LIMIT 1;
      END IF;
    END IF;
    IF v_new_ch IS NOT NULL THEN
      INSERT INTO channel_members (channel_id, employee_id) VALUES (v_new_ch, NEW.id)
      ON CONFLICT (channel_id, employee_id) DO NOTHING;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS employee_sync_dept_channel ON employees;
CREATE TRIGGER employee_sync_dept_channel
  AFTER INSERT OR UPDATE OF department, is_active OR DELETE
  ON employees
  FOR EACH ROW EXECUTE FUNCTION trg_employee_sync_dept_channel();


-- ─── 6. Trigger: project created → auto-create channel ───────────────────────
CREATE OR REPLACE FUNCTION trg_project_create_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  INSERT INTO channels (name, description, type, category, project_id, is_global)
  VALUES (NEW.name, 'Channel for project: ' || NEW.name, 'text', 'project', NEW.id, false)
  ON CONFLICT (project_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_channel_id;

  IF v_channel_id IS NOT NULL THEN
    -- Add admins
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id FROM employees e
     WHERE e.role IN ('super_admin','accounts') AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS project_create_channel ON projects;
CREATE TRIGGER project_create_channel
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION trg_project_create_channel();

-- On project rename, update channel name
CREATE OR REPLACE FUNCTION trg_project_rename_channel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE channels SET name = NEW.name WHERE project_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS project_rename_channel ON projects;
CREATE TRIGGER project_rename_channel
  AFTER UPDATE OF name ON projects
  FOR EACH ROW EXECUTE FUNCTION trg_project_rename_channel();


-- ─── 7. Fix team channel trigger to also use real name ───────────────────────
CREATE OR REPLACE FUNCTION trg_team_create_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  INSERT INTO channels (name, description, type, category, team_id, is_global)
  VALUES (NEW.name, 'Channel for ' || NEW.name || ' team', 'text', 'team', NEW.id, false)
  ON CONFLICT (team_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_channel_id;

  IF v_channel_id IS NOT NULL THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id FROM employees e
     WHERE e.team_id = NEW.id AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;

    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id FROM employees e
     WHERE e.role IN ('super_admin','accounts') AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS team_create_channel ON teams;
CREATE TRIGGER team_create_channel
  AFTER INSERT OR UPDATE OF name ON teams
  FOR EACH ROW EXECUTE FUNCTION trg_team_create_channel();


-- ─── 8. Verify ───────────────────────────────────────────────────────────────
SELECT category, COUNT(*) as channels, SUM(
  (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id)
) as total_members
FROM channels c
GROUP BY category
ORDER BY category;
