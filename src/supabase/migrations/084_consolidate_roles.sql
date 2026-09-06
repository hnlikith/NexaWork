-- Migration 084: Consolidate Roles (Final / Perfect Version)
-- Rename 'manager' & 'lead' to 'department_lead' and 'sub_team_lead' to 'team_lead'
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Drop ALL known and potential dependencies
-- ═══════════════════════════════════════════════════════════════════════════════

-- A. Drop Trigger
DROP TRIGGER IF EXISTS employee_sync_all_channels ON employees;

-- B. Drop Known Policies (Common dependencies)
DROP POLICY IF EXISTS "Admins and Managers can manage project teams" ON project_teams;
DROP POLICY IF EXISTS "Admins and Managers can manage project members" ON project_members;
DROP POLICY IF EXISTS "Admins and Managers can create strategic tasks" ON project_tasks;
DROP POLICY IF EXISTS "Managers can delegate to any team" ON projects;
DROP POLICY IF EXISTS "Leads can verify tasks" ON project_tasks;
DROP POLICY IF EXISTS "Admins can manage settings" ON attendance_settings;
DROP POLICY IF EXISTS "Allow admins to manage attendance settings" ON attendance_settings;
DROP POLICY IF EXISTS "super_admin_write_permissions" ON role_permissions;
DROP POLICY IF EXISTS "super_admin_write_assignable" ON role_assignable_roles;

-- C. Drop Additional Policies found in logs/errors
DROP POLICY IF EXISTS "Admin full access" ON leave_requests;
DROP POLICY IF EXISTS "Admin full access" ON employees;
DROP POLICY IF EXISTS "Admin full access" ON projects;
DROP POLICY IF EXISTS "Admin full access" ON attendance_logs;
DROP POLICY IF EXISTS "Admin Full Access routing_rules" ON support_routing_rules;

-- 2. Ensure new roles exist in user_role enum (Preparation)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Highlight and run these two lines separately first if in SQL Editor!
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'department_lead';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_lead';

-- 3. Data Migration
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE employees SET role = 'department_lead'::user_role WHERE role::text IN ('manager', 'lead');
UPDATE employees SET role = 'team_lead'::user_role WHERE role::text = 'sub_team_lead';

-- Update related tables
UPDATE role_permissions SET role = 'department_lead' WHERE role IN ('manager', 'lead');
UPDATE role_permissions SET role = 'team_lead' WHERE role = 'sub_team_lead';
UPDATE role_assignable_roles SET assigner_role = 'department_lead' WHERE assigner_role IN ('manager', 'lead');
UPDATE role_assignable_roles SET assignable_role = 'department_lead' WHERE assignable_role IN ('manager', 'lead');
UPDATE role_assignable_roles SET assigner_role = 'team_lead' WHERE assigner_role = 'sub_team_lead';
UPDATE role_assignable_roles SET assignable_role = 'team_lead' WHERE assignable_role = 'sub_team_lead';

-- 4. Permanent Enum Cleanup
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel IN ('manager', 'lead', 'sub_team_lead')) THEN
        CREATE TYPE user_role_new AS ENUM ('super_admin', 'accounts', 'hr', 'employee', 'sales', 'internship', 'department_lead', 'team_lead');
        ALTER TABLE employees ALTER COLUMN role DROP DEFAULT;
        ALTER TABLE employees ALTER COLUMN role TYPE user_role_new USING role::text::user_role_new;
        ALTER TABLE employees ALTER COLUMN role SET DEFAULT 'employee'::user_role_new;
        DROP TYPE user_role;
        ALTER TYPE user_role_new RENAME TO user_role;
        ALTER TABLE employees ALTER COLUMN role SET DEFAULT 'employee'::user_role;
    END IF;
END $$;

-- 5. Restore Dependencies
-- ═══════════════════════════════════════════════════════════════════════════════

-- A. Restore Trigger
CREATE TRIGGER employee_sync_all_channels
  AFTER INSERT OR UPDATE OF team_id, department, is_active, role OR DELETE
  ON employees
  FOR EACH ROW EXECUTE FUNCTION trg_employee_sync_all_channels();

-- B. Restore RLS Policies
CREATE POLICY "Admins and Managers can manage project teams" ON project_teams FOR ALL
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr'));

CREATE POLICY "Admins and Managers can manage project members" ON project_members FOR ALL
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr', 'team_lead'));

CREATE POLICY "Admins and Managers can create strategic tasks" ON project_tasks FOR INSERT
    WITH CHECK ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead'));

CREATE POLICY "Managers can delegate to any team" ON projects FOR UPDATE
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead'));

CREATE POLICY "Leads can verify tasks" ON project_tasks FOR UPDATE
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'team_lead'));

CREATE POLICY "Admins can manage settings" ON attendance_settings
    FOR ALL USING (
        (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('super_admin', 'department_lead', 'hr')
    );

CREATE POLICY "super_admin_write_permissions" ON role_permissions
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "super_admin_write_assignable" ON role_assignable_roles
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'super_admin'
  );

-- Restore additional policies
CREATE POLICY "Admin full access" ON leave_requests FOR ALL
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr'));
