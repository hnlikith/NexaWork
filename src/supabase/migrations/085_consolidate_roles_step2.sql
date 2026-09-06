-- Migration 085: Consolidate Roles - Step 2 (Automated Cleanup & Migration)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. DYNAMIC DEPENDENCY CLEANUP (The "Perfect" Fix)
-- This block handles Triggers, Policies, and VIEWS that block column type changes.
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- A. Drop dependent trigger
    DROP TRIGGER IF EXISTS employee_sync_all_channels ON employees;

    -- B. Drop dependent views (Critical: Views block column type changes)
    DROP VIEW IF EXISTS workspace_shared_users;

    -- C. Find and drop all dependent policies
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE (qual ILIKE '%role%' OR qual ILIKE '%employees%' OR with_check ILIKE '%role%' OR with_check ILIKE '%employees%')
          AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- 2. Data Migration: Map legacy values to new consolidated roles
-- ═══════════════════════════════════════════════════════════════════════════════
-- manager & lead -> department_lead
-- sub_team_lead -> team_lead
UPDATE employees SET role = 'department_lead'::user_role WHERE role::text IN ('manager', 'lead');
UPDATE employees SET role = 'team_lead'::user_role WHERE role::text = 'sub_team_lead';

-- Update related tables
UPDATE role_permissions SET role = 'department_lead' WHERE role IN ('manager', 'lead');
UPDATE role_permissions SET role = 'team_lead' WHERE role = 'sub_team_lead';
UPDATE role_assignable_roles SET assigner_role = 'department_lead' WHERE assigner_role IN ('manager', 'lead');
UPDATE role_assignable_roles SET assignable_role = 'department_lead' WHERE assignable_role IN ('manager', 'lead');
UPDATE role_assignable_roles SET assigner_role = 'team_lead' WHERE assigner_role = 'sub_team_lead';
UPDATE role_assignable_roles SET assignable_role = 'team_lead' WHERE assignable_role = 'sub_team_lead';

-- 3. Permanent Enum Cleanup (Completely removing legacy values)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel IN ('manager', 'lead', 'sub_team_lead')) THEN
        -- Create new type without legacy values (manager, lead, sub_team_lead)
        CREATE TYPE user_role_new AS ENUM ('super_admin', 'accounts', 'hr', 'employee', 'sales', 'internship', 'department_lead', 'team_lead');
        
        -- Handle Default Value
        ALTER TABLE employees ALTER COLUMN role DROP DEFAULT;
        
        -- Update column type
        ALTER TABLE employees ALTER COLUMN role TYPE user_role_new USING role::text::user_role_new;
        
        -- Restore Default with new type
        ALTER TABLE employees ALTER COLUMN role SET DEFAULT 'employee'::user_role_new;
        
        -- Swap types
        DROP TYPE user_role;
        ALTER TYPE user_role_new RENAME TO user_role;
        
        -- Final default update
        ALTER TABLE employees ALTER COLUMN role SET DEFAULT 'employee'::user_role;
    END IF;
END $$;

-- 4. Restore Core Dependencies
-- ═══════════════════════════════════════════════════════════════════════════════

-- A. Restore Trigger
CREATE TRIGGER employee_sync_all_channels
  AFTER INSERT OR UPDATE OF team_id, department, is_active, role OR DELETE
  ON employees
  FOR EACH ROW EXECUTE FUNCTION trg_employee_sync_all_channels();

-- B. Restore Views
CREATE OR REPLACE VIEW workspace_shared_users AS
SELECT 
  ws.id as share_id,
  ws.item_id,
  ws.item_type,
  ws.item_title,
  ws.access_level,
  ws.message,
  ws.created_at as shared_at,
  e.id as user_id,
  e.name,
  e.email,
  e.role,
  e.employee_id
FROM workspace_shares ws
JOIN employees e ON ws.user_id = e.id;

-- C. Restore Core RLS Policies
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

CREATE POLICY "Admin full access leave_requests" ON leave_requests FOR ALL
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr'));

CREATE POLICY "budgets_insert_finance" ON budgets FOR INSERT
    WITH CHECK ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr', 'accounts'));
