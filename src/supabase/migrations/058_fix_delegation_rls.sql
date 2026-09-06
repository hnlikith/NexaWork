-- Fix RLS policies for hierarchical delegation
ALTER TABLE project_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- project_teams policies
DROP POLICY IF EXISTS "Anyone can view project teams" ON project_teams;
CREATE POLICY "Anyone can view project teams" ON project_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins and Managers can manage project teams" ON project_teams;
CREATE POLICY "Admins and Managers can manage project teams" ON project_teams FOR ALL
    USING (
        (SELECT role FROM employees WHERE id = auth.uid()) IN ('super_admin', 'manager', 'head')
    );

-- project_members policies
DROP POLICY IF EXISTS "Anyone can view project members" ON project_members;
CREATE POLICY "Anyone can view project members" ON project_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins and Managers can manage project members" ON project_members;
CREATE POLICY "Admins and Managers can manage project members" ON project_members FOR ALL
    USING (
        (SELECT role FROM employees WHERE id = auth.uid()) IN ('super_admin', 'manager', 'head', 'lead')
    );

-- project_tasks policies (ensure managers can insert strategic tasks)
DROP POLICY IF EXISTS "Admins and Managers can create strategic tasks" ON project_tasks;
CREATE POLICY "Admins and Managers can create strategic tasks" ON project_tasks FOR INSERT
    WITH CHECK (
        (SELECT role FROM employees WHERE id = auth.uid()) IN ('super_admin', 'manager', 'head')
    );
