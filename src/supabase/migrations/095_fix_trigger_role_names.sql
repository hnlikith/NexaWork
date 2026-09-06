-- ============================================================================
-- 095: Fix all trigger functions using legacy role names
--
-- Old roles used in triggers:  'super_admin', 'accounts', 'hr', 'manager', 'lead'
-- Current valid roles:          'admin', 'dept_lead', 'team_lead', 'employee', 'intern'
--
-- Mapping applied:
--   super_admin  → admin
--   accounts     → admin
--   hr           → admin
--   manager      → dept_lead
--   lead         → team_lead
-- ============================================================================


-- ── 1. trg_channel_add_admins ────────────────────────────────────────────────
-- Triggered AFTER INSERT on channels → adds all admins as members
CREATE OR REPLACE FUNCTION trg_channel_add_admins()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO channel_members (channel_id, employee_id)
  SELECT NEW.id, e.id
    FROM employees e
   WHERE e.role = 'admin'
     AND e.is_active = true
  ON CONFLICT (channel_id, employee_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2. trg_employee_promote_to_admin ────────────────────────────────────────
-- Triggered AFTER UPDATE OF role on employees → when promoted to admin, join all channels
CREATE OR REPLACE FUNCTION trg_employee_promote_to_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'admin' AND (OLD.role IS NULL OR OLD.role <> 'admin') THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id FROM channels c
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 3. trg_employee_sync_all_channels ───────────────────────────────────────
-- Triggered AFTER INSERT/UPDATE/DELETE on employees → full channel membership sync
CREATE OR REPLACE FUNCTION trg_employee_sync_all_channels()
RETURNS TRIGGER AS $$
DECLARE
  v_old_team_ch UUID;
  v_new_team_ch UUID;
  v_old_dept_ch UUID;
  v_new_dept_ch UUID;
  v_proj_ch     RECORD;
BEGIN

  -- ── DEACTIVATED or DELETED → remove from all non-global channels ───────────
  IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true) THEN
    DELETE FROM channel_members
     WHERE employee_id = OLD.id
       AND channel_id IN (SELECT id FROM channels WHERE category <> 'global')
       AND OLD.role <> 'admin';
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── TEAM CHANNEL SYNC ───────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    -- Leave old team channel (unless admin)
    IF OLD.team_id IS NOT NULL THEN
      SELECT id INTO v_old_team_ch FROM channels WHERE team_id = OLD.team_id LIMIT 1;
      IF v_old_team_ch IS NOT NULL THEN
        DELETE FROM channel_members
         WHERE channel_id = v_old_team_ch AND employee_id = OLD.id
           AND OLD.role <> 'admin';
      END IF;
    END IF;

    -- Leave project channels from OLD team
    FOR v_proj_ch IN
      SELECT c.id, c.project_id FROM channels c
       JOIN project_teams pt ON pt.project_id = c.project_id
      WHERE pt.team_id = OLD.team_id AND c.category = 'project'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM project_teams pt2
         JOIN employees e2 ON e2.team_id = pt2.team_id
        WHERE pt2.project_id = v_proj_ch.project_id
          AND e2.id = OLD.id AND pt2.team_id <> OLD.team_id
      ) AND OLD.role <> 'admin' THEN
        DELETE FROM channel_members WHERE channel_id = v_proj_ch.id AND employee_id = OLD.id;
      END IF;
    END LOOP;
  END IF;

  -- Join new team channel
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.team_id IS NOT NULL AND NEW.is_active = true THEN
    SELECT id INTO v_new_team_ch FROM channels WHERE team_id = NEW.team_id LIMIT 1;
    IF v_new_team_ch IS NOT NULL THEN
      INSERT INTO channel_members (channel_id, employee_id) VALUES (v_new_team_ch, NEW.id)
      ON CONFLICT (channel_id, employee_id) DO NOTHING;
    END IF;

    -- Join project channels from NEW team
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id
      FROM channels c
      JOIN project_teams pt ON pt.project_id = c.project_id
     WHERE pt.team_id = NEW.team_id AND c.category = 'project'
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  -- ── DEPARTMENT CHANNEL SYNC ─────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.department IS DISTINCT FROM NEW.department THEN
    IF OLD.department IS NOT NULL THEN
      SELECT id INTO v_old_dept_ch FROM channels
       WHERE category = 'department' AND department_name = OLD.department LIMIT 1;
      IF v_old_dept_ch IS NOT NULL THEN
        DELETE FROM channel_members
         WHERE channel_id = v_old_dept_ch AND employee_id = OLD.id
           AND OLD.role <> 'admin';
      END IF;
    END IF;
  END IF;

  -- Join new dept channel (create if missing)
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.department IS NOT NULL AND NEW.is_active = true THEN
    SELECT id INTO v_new_dept_ch FROM channels
     WHERE category = 'department' AND department_name = NEW.department LIMIT 1;
    IF v_new_dept_ch IS NULL THEN
      INSERT INTO channels (name, description, type, category, department_name, is_global)
      VALUES (NEW.department, 'Channel for ' || NEW.department || ' department', 'text', 'department', NEW.department, false)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_new_dept_ch;
      IF v_new_dept_ch IS NULL THEN
        SELECT id INTO v_new_dept_ch FROM channels WHERE department_name = NEW.department LIMIT 1;
      END IF;
    END IF;
    IF v_new_dept_ch IS NOT NULL THEN
      INSERT INTO channel_members (channel_id, employee_id) VALUES (v_new_dept_ch, NEW.id)
      ON CONFLICT (channel_id, employee_id) DO NOTHING;
    END IF;
  END IF;

  -- ── GLOBAL CHANNELS — always member ─────────────────────────────────────────
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.is_active = true THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id FROM channels c WHERE c.is_global = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  -- ── ADMIN PROMOTION → join ALL channels ─────────────────────────────────────
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin' AND OLD.role <> 'admin' THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id FROM channels c
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 4. trg_project_create_channel ───────────────────────────────────────────
-- Triggered AFTER INSERT on projects → auto-creates a channel and adds admins
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
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id FROM employees e
     WHERE e.role = 'admin' AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 5. trg_team_create_channel ───────────────────────────────────────────────
-- Triggered AFTER INSERT/UPDATE OF name on teams → auto-creates team channel
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
    -- Add team members
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id FROM employees e
     WHERE e.team_id = NEW.id AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;

    -- Add all admins
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id FROM employees e
     WHERE e.role = 'admin' AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 6. trg_project_add_admins ────────────────────────────────────────────────
-- Triggered AFTER INSERT on projects → adds admins to project_members
CREATE OR REPLACE FUNCTION trg_project_add_admins()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_members (project_id, employee_id, role)
  SELECT NEW.id, e.id, 'admin'
    FROM employees e
   WHERE e.role = 'admin'
     AND e.is_active = true
  ON CONFLICT (project_id, employee_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 7. get_my_role() helper — ensure it uses correct enum values ─────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role::text FROM employees WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
