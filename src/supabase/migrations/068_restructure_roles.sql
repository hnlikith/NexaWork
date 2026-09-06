-- Migration 068: Role Hierarchy Reset & Optimization
-- ═══════════════════════════════════════════════════════════════════════════════
-- This script reverts the internal role names to legacy keys (manager, lead)
-- while setting up the new organizational terminology (Department Lead, Team Lead).
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Ensure 'internship' exists in enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'internship';

-- 2. Data Migration: Revert any experimental roles back to legacy keys
-- team_lead -> manager
-- sub_team_lead -> lead
DO $$
BEGIN
    -- Revert employees
    UPDATE employees SET role = 'manager'::user_role WHERE role::text IN ('team_lead', 'department_manager');
    UPDATE employees SET role = 'lead'::user_role WHERE role::text = 'sub_team_lead';
    
    -- 3. Restore RLS Policies to use legacy keys
    
    -- Update project_teams
    DROP POLICY IF EXISTS "Admins and Managers can manage project teams" ON project_teams;
    CREATE POLICY "Admins and Managers can manage project teams" ON project_teams FOR ALL
        USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'manager', 'hr'));

    -- Update project_members
    DROP POLICY IF EXISTS "Admins and Managers can manage project members" ON project_members;
    CREATE POLICY "Admins and Managers can manage project members" ON project_members FOR ALL
        USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'manager', 'hr', 'lead'));

    -- Update project_tasks
    DROP POLICY IF EXISTS "Admins and Managers can create strategic tasks" ON project_tasks;
    CREATE POLICY "Admins and Managers can create strategic tasks" ON project_tasks FOR INSERT
        WITH CHECK ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'manager'));

    -- Update project delegation
    DROP POLICY IF EXISTS "Managers can delegate to any team" ON projects;
    CREATE POLICY "Managers can delegate to any team" ON projects FOR UPDATE
        USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'manager'));

    -- Update task verification
    DROP POLICY IF EXISTS "Leads can verify tasks" ON project_tasks;
    CREATE POLICY "Leads can verify tasks" ON project_tasks FOR UPDATE
        USING ((SELECT role FROM employees WHERE id = auth.uid())::text IN ('super_admin', 'manager', 'lead'));

END $$;
