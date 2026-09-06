-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 022: Admin Auto-Membership
--
-- Ensures super_admin / accounts employees are always members of:
--   • Every existing channel (backfill)
--   • Every new channel the moment it is created
--   • Every new project (via trigger on project_members if table exists)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Backfill: add all admins to every channel they are not yet in ─────────
INSERT INTO channel_members (channel_id, employee_id)
SELECT c.id, e.id
  FROM channels c
  CROSS JOIN employees e
 WHERE e.role IN ('super_admin', 'accounts')
   AND e.is_active = true
ON CONFLICT (channel_id, employee_id) DO NOTHING;


-- ─── 2. Trigger: when a new channel is created, add all admins ───────────────
CREATE OR REPLACE FUNCTION trg_channel_add_admins()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO channel_members (channel_id, employee_id)
  SELECT NEW.id, e.id
    FROM employees e
   WHERE e.role IN ('super_admin', 'accounts')
     AND e.is_active = true
  ON CONFLICT (channel_id, employee_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS channel_add_admins ON channels;
CREATE TRIGGER channel_add_admins
  AFTER INSERT ON channels
  FOR EACH ROW EXECUTE FUNCTION trg_channel_add_admins();


-- ─── 3. Trigger: when an employee is promoted to admin, add to all channels ──
CREATE OR REPLACE FUNCTION trg_employee_promote_to_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- If the employee just became admin/accounts, join all channels
  IF NEW.role IN ('super_admin', 'accounts') AND (OLD.role IS NULL OR OLD.role NOT IN ('super_admin', 'accounts')) THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id
      FROM channels c
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS employee_promote_to_admin ON employees;
CREATE TRIGGER employee_promote_to_admin
  AFTER UPDATE OF role ON employees
  FOR EACH ROW EXECUTE FUNCTION trg_employee_promote_to_admin();


-- ─── 4. Project members: ensure admins are on every project ──────────────────
-- Only runs if project_members table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_members') THEN
    -- Backfill admins into all projects
    INSERT INTO project_members (project_id, employee_id, role)
    SELECT p.id, e.id, 'admin'
      FROM projects p
      CROSS JOIN employees e
     WHERE e.role IN ('super_admin', 'accounts')
       AND e.is_active = true
    ON CONFLICT (project_id, employee_id) DO NOTHING;

    -- Trigger: new project → add admins
    EXECUTE $trig$
      CREATE OR REPLACE FUNCTION trg_project_add_admins()
      RETURNS TRIGGER AS $fn$
      BEGIN
        INSERT INTO project_members (project_id, employee_id, role)
        SELECT NEW.id, e.id, 'admin'
          FROM employees e
         WHERE e.role IN ('super_admin', 'accounts')
           AND e.is_active = true
        ON CONFLICT (project_id, employee_id) DO NOTHING;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER;
    $trig$;

    EXECUTE $trig$
      DROP TRIGGER IF EXISTS project_add_admins ON projects;
      CREATE TRIGGER project_add_admins
        AFTER INSERT ON projects
        FOR EACH ROW EXECUTE FUNCTION trg_project_add_admins();
    $trig$;
  END IF;
END $$;
