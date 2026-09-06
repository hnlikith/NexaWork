-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 026: Consolidate all employee channel sync into ONE trigger
--
-- Replaces these 3 fragmented triggers on employees:
--   • employee_sync_channel          (021) → team channel sync
--   • employee_sync_dept_channel     (024) → dept channel sync
--   • employee_team_project_channel_sync (025) → project channel sync
--
-- Single function handles ALL channel membership changes for an employee.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the 3 old fragmented triggers
DROP TRIGGER IF EXISTS employee_sync_channel              ON employees;
DROP TRIGGER IF EXISTS employee_sync_dept_channel         ON employees;
DROP TRIGGER IF EXISTS employee_team_project_channel_sync ON employees;

-- ─── Master employee channel sync function ───────────────────────────────────
CREATE OR REPLACE FUNCTION trg_employee_sync_all_channels()
RETURNS TRIGGER AS $$
DECLARE
  v_old_team_ch   UUID;
  v_new_team_ch   UUID;
  v_old_dept_ch   UUID;
  v_new_dept_ch   UUID;
  v_proj_ch       RECORD;
BEGIN

  -- ── DEACTIVATED or DELETED → remove from ALL non-global channels ────────────
  IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true) THEN
    DELETE FROM channel_members
     WHERE employee_id = OLD.id
       AND channel_id IN (
         SELECT id FROM channels WHERE category <> 'global'
       )
       AND employee_id NOT IN (
         SELECT id FROM employees WHERE role IN ('super_admin','accounts') AND id = OLD.id
       );
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── TEAM CHANNEL SYNC ───────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    -- Leave old team channel
    IF OLD.team_id IS NOT NULL THEN
      SELECT id INTO v_old_team_ch FROM channels WHERE team_id = OLD.team_id LIMIT 1;
      IF v_old_team_ch IS NOT NULL THEN
        DELETE FROM channel_members
         WHERE channel_id = v_old_team_ch AND employee_id = OLD.id
           AND OLD.role NOT IN ('super_admin','accounts');
      END IF;
    END IF;

    -- Leave project channels from OLD team (unless on another team for same project)
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
      ) AND OLD.role NOT IN ('super_admin','accounts') THEN
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
    -- Leave old dept channel
    IF OLD.department IS NOT NULL THEN
      SELECT id INTO v_old_dept_ch FROM channels
       WHERE category = 'department' AND department_name = OLD.department LIMIT 1;
      IF v_old_dept_ch IS NOT NULL THEN
        DELETE FROM channel_members
         WHERE channel_id = v_old_dept_ch AND employee_id = OLD.id
           AND OLD.role NOT IN ('super_admin','accounts');
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

  -- ── GLOBAL CHANNELS — always member ────────────────────────────────────────
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.is_active = true THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id FROM channels c WHERE c.is_global = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  -- ── ADMIN PROMOTION → join ALL channels ─────────────────────────────────────
  IF TG_OP = 'UPDATE'
     AND NEW.role IN ('super_admin','accounts')
     AND OLD.role NOT IN ('super_admin','accounts') THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id FROM channels c
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Single trigger replacing all three
DROP TRIGGER IF EXISTS employee_sync_all_channels ON employees;
CREATE TRIGGER employee_sync_all_channels
  AFTER INSERT OR UPDATE OF team_id, department, is_active, role OR DELETE
  ON employees
  FOR EACH ROW EXECUTE FUNCTION trg_employee_sync_all_channels();

-- Also drop the old promote trigger from 022 (now handled above)
DROP TRIGGER IF EXISTS employee_promote_to_admin ON employees;


-- ─── Verify: show all triggers on employees table ────────────────────────────
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'employees'
ORDER BY trigger_name;
