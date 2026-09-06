-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 025: Project ↔ Team Channel Sync
--
-- When a team is assigned to a project → all team members join project channel
-- When a team is removed from a project → team members leave project channel
--   (unless they are in another team also on that project, or are admin)
-- When an employee joins/leaves a team → sync all project channels that team is on
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Backfill: add all current project_team members to project channels ────
INSERT INTO channel_members (channel_id, employee_id)
SELECT DISTINCT c.id, e.id
  FROM project_teams pt
  JOIN channels c ON c.project_id = pt.project_id
  JOIN employees e ON e.team_id = pt.team_id
 WHERE e.is_active = true
ON CONFLICT (channel_id, employee_id) DO NOTHING;


-- ─── 2. Trigger: team assigned/removed from project ──────────────────────────
CREATE OR REPLACE FUNCTION trg_project_team_sync_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  -- Get the project's channel
  SELECT id INTO v_channel_id FROM channels WHERE project_id = (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END
  ) LIMIT 1;

  IF v_channel_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    -- Add all members of the newly assigned team
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT v_channel_id, e.id
      FROM employees e
     WHERE e.team_id = NEW.team_id AND e.is_active = true
    ON CONFLICT (channel_id, employee_id) DO NOTHING;

  ELSIF TG_OP = 'DELETE' THEN
    -- Remove team members ONLY if they are not on another team still assigned to this project
    -- and they are not admin
    DELETE FROM channel_members
     WHERE channel_id = v_channel_id
       AND employee_id IN (
         SELECT e.id FROM employees e
          WHERE e.team_id = OLD.team_id AND e.is_active = true
            AND e.role NOT IN ('super_admin','accounts')
            AND e.id NOT IN (
              -- Still in the project via another team
              SELECT e2.id FROM employees e2
               JOIN project_teams pt2 ON pt2.team_id = e2.team_id
              WHERE pt2.project_id = OLD.project_id
                AND pt2.team_id <> OLD.team_id
            )
       );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS project_team_sync_channel ON project_teams;
CREATE TRIGGER project_team_sync_channel
  AFTER INSERT OR DELETE ON project_teams
  FOR EACH ROW EXECUTE FUNCTION trg_project_team_sync_channel();


-- ─── 3. Trigger: employee joins/leaves team → sync all project channels ───────
CREATE OR REPLACE FUNCTION trg_employee_team_project_channel_sync()
RETURNS TRIGGER AS $$
DECLARE
  v_channel RECORD;
BEGIN
  -- When employee's team changes, remove from old project channels
  IF TG_OP = 'UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id AND OLD.team_id IS NOT NULL THEN
    FOR v_channel IN
      SELECT c.id FROM channels c
       JOIN project_teams pt ON pt.project_id = c.project_id
      WHERE pt.team_id = OLD.team_id AND c.category = 'project'
    LOOP
      -- Only remove if not on another team for same project
      IF NOT EXISTS (
        SELECT 1 FROM project_teams pt2
         JOIN employees e2 ON e2.team_id = pt2.team_id
        WHERE pt2.project_id = (SELECT project_id FROM channels WHERE id = v_channel.id)
          AND e2.id = OLD.id
          AND pt2.team_id <> OLD.team_id
      ) THEN
        DELETE FROM channel_members
         WHERE channel_id = v_channel.id AND employee_id = OLD.id
           AND OLD.role NOT IN ('super_admin','accounts');
      END IF;
    END LOOP;
  END IF;

  -- Add to new team's project channels
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.team_id IS NOT NULL AND NEW.is_active = true THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id
      FROM channels c
      JOIN project_teams pt ON pt.project_id = c.project_id
     WHERE pt.team_id = NEW.team_id AND c.category = 'project'
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS employee_team_project_channel_sync ON employees;
CREATE TRIGGER employee_team_project_channel_sync
  AFTER INSERT OR UPDATE OF team_id, is_active OR DELETE
  ON employees
  FOR EACH ROW EXECUTE FUNCTION trg_employee_team_project_channel_sync();


-- ─── 4. Verify ───────────────────────────────────────────────────────────────
SELECT
  p.name as project,
  t.name as team,
  COUNT(DISTINCT cm.employee_id) as channel_members
FROM project_teams pt
JOIN projects p ON p.id = pt.project_id
JOIN teams t ON t.id = pt.team_id
LEFT JOIN channels c ON c.project_id = pt.project_id
LEFT JOIN channel_members cm ON cm.channel_id = c.id
GROUP BY p.name, t.name
ORDER BY p.name;
