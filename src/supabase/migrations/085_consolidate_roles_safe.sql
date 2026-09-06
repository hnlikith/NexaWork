-- Migration 085: Consolidate Roles (SAFE VERSION)
-- This version migrates all data and updates permissions without breaking database dependencies.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Ensure new roles exist (HARMFUL to skip, SAFE to run)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'department_lead';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_lead';

-- 2. Data Migration: Move everyone to the new roles
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

-- 3. Restore/Update RLS Policies to use the new hierarchy
-- ═══════════════════════════════════════════════════════════════

-- project_teams
DROP POLICY IF EXISTS "Admins and Managers can manage project teams" ON project_teams;
CREATE POLICY "Admins and Managers can manage project teams" ON project_teams FOR ALL
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr'));

-- project_members
DROP POLICY IF EXISTS "Admins and Managers can manage project members" ON project_members;
CREATE POLICY "Admins and Managers can manage project members" ON project_members FOR ALL
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr', 'team_lead'));

-- project_tasks
DROP POLICY IF EXISTS "Admins and Managers can create strategic tasks" ON project_tasks;
CREATE POLICY "Admins and Managers can create strategic tasks" ON project_tasks FOR INSERT
    WITH CHECK ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead'));

-- project delegation
DROP POLICY IF EXISTS "Managers can delegate to any team" ON projects;
CREATE POLICY "Managers can delegate to any team" ON projects FOR UPDATE
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead'));

-- task verification
DROP POLICY IF EXISTS "Leads can verify tasks" ON project_tasks;
CREATE POLICY "Leads can verify tasks" ON project_tasks FOR UPDATE
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'team_lead'));

-- attendance_settings
DROP POLICY IF EXISTS "Admins can manage settings" ON attendance_settings;
CREATE POLICY "Admins can manage settings" ON attendance_settings
    FOR ALL USING (
        (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('super_admin', 'department_lead', 'hr')
    );

-- leave_requests
DROP POLICY IF EXISTS "Admin full access leave_requests" ON leave_requests;
CREATE POLICY "Admin full access leave_requests" ON leave_requests FOR ALL
    USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr'));

-- budgets
DROP POLICY IF EXISTS "budgets_insert_finance" ON budgets;
CREATE POLICY "budgets_insert_finance" ON budgets FOR INSERT
    WITH CHECK ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'department_lead', 'hr', 'accounts'));
