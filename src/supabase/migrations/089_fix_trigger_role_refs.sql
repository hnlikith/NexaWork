-- Migration 089: Fix trigger functions that reference old role enum values
-- Problem: trg_employee_sync_all_channels uses role IN ('super_admin','accounts')
-- which causes "invalid input value for enum user_role" on every INSERT/UPDATE/DELETE.
-- Fix: cast role to TEXT before comparison, use new role names.
-- Also runs the get_my_role() RLS fix from 088 if not already applied.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Fix get_my_role() SECURITY DEFINER function (idempotent) ──────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::text FROM employees WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── 2. Fix employees RLS policies to use get_my_role() ──────────────────────
DROP POLICY IF EXISTS "employees_admin_all"   ON employees;
DROP POLICY IF EXISTS "employees_lead_select" ON employees;
DROP POLICY IF EXISTS "employees_select_own"  ON employees;

CREATE POLICY "employees_select_own" ON employees
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "employees_admin_all" ON employees
  FOR ALL USING (get_my_role() = 'admin');

CREATE POLICY "employees_lead_select" ON employees
  FOR SELECT USING (get_my_role() IN ('dept_lead', 'team_lead'));

-- ─── 3. Fix trg_employee_sync_all_channels — cast role to TEXT ───────────────
CREATE OR REPLACE FUNCTION trg_employee_sync_all_channels()
RETURNS TRIGGER AS $$
DECLARE
  v_old_team_ch   UUID;
  v_new_team_ch   UUID;
  v_old_dept_ch   UUID;
  v_new_dept_ch   UUID;
  v_proj_ch       RECORD;
  v_is_admin      BOOLEAN;
  v_old_is_admin  BOOLEAN;
BEGIN

  -- ── DEACTIVATED or DELETED → remove from ALL non-global channels ────────────
  IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true) THEN
    DELETE FROM channel_members
     WHERE employee_id = OLD.id
       AND channel_id IN (
         SELECT id FROM channels WHERE category <> 'global'
       )
       AND employee_id NOT IN (
         SELECT id FROM employees WHERE role::text = 'admin' AND id = OLD.id
       );
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── TEAM CHANNEL SYNC ───────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    IF OLD.team_id IS NOT NULL THEN
      SELECT id INTO v_old_team_ch FROM channels WHERE team_id = OLD.team_id LIMIT 1;
      IF v_old_team_ch IS NOT NULL THEN
        DELETE FROM channel_members
         WHERE channel_id = v_old_team_ch AND employee_id = OLD.id
           AND OLD.role::text NOT IN ('admin', 'dept_lead');
      END IF;
    END IF;

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
      ) AND OLD.role::text NOT IN ('admin', 'dept_lead') THEN
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
           AND OLD.role::text NOT IN ('admin', 'dept_lead');
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

  -- ── ADMIN/LEAD PROMOTION → join ALL channels ────────────────────────────────
  IF TG_OP = 'UPDATE'
     AND NEW.role::text IN ('admin', 'dept_lead')
     AND OLD.role::text NOT IN ('admin', 'dept_lead') THEN
    INSERT INTO channel_members (channel_id, employee_id)
    SELECT c.id, NEW.id FROM channels c
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4. Fix admin user role (any row still stuck on old values) ───────────────
UPDATE employees
SET role = 'admin'::user_role
WHERE role::text NOT IN ('admin','dept_lead','team_lead','employee','intern');

-- ─── 5. Fix auth metadata for those users ─────────────────────────────────────
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'
WHERE id IN (
  SELECT id FROM employees WHERE role::text = 'admin'
)
AND (raw_user_meta_data->>'role') NOT IN ('admin','dept_lead','team_lead','employee','intern');

-- ─── 6. Clean stale assignable_roles table ───────────────────────────────────
DELETE FROM role_assignable_roles
WHERE assigner_role  NOT IN ('admin','dept_lead','team_lead','employee','intern')
   OR assignable_role NOT IN ('admin','dept_lead','team_lead','employee','intern');

-- Re-seed admin's assignable roles
DELETE FROM role_assignable_roles WHERE assigner_role = 'admin';
INSERT INTO role_assignable_roles (assigner_role, assignable_role) VALUES
  ('admin','admin'), ('admin','dept_lead'), ('admin','team_lead'),
  ('admin','employee'), ('admin','intern');
