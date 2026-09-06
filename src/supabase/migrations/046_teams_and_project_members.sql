-- ============================================================
-- TEAMS & PROJECT MEMBERS ASSIGNMENT SYSTEM
-- ============================================================

-- 1. CREATE TEAMS TABLE
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    department TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
ALTER TABLE teams ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. CREATE PROJECT_MEMBERS TABLE (Employee-to-Project Assignment)
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'Member', -- Developer, Lead, Designer, Manager, etc.
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, employee_id)
);

-- 3. ENHANCE PROJECTS TABLE
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS progress NUMERIC(3,0) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    ADD COLUMN IF NOT EXISTS team_lead_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

-- 4. ENHANCE PROJECT_TASKS TABLE
ALTER TABLE public.project_tasks
    ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS spent_hours NUMERIC(5,2) DEFAULT 0;

-- 5. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_employee_id ON public.project_members(employee_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON public.project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to ON public.project_tasks(assigned_to);

-- 6. ENABLE REALTIME (if not already enabled)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename = 'teams') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename = 'project_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE project_members;
  END IF;
END $$;

-- 7. FUNCTION TO CALCULATE PROJECT PROGRESS
CREATE OR REPLACE FUNCTION calculate_project_progress()
RETURNS TRIGGER AS $$
DECLARE
    total_tasks INTEGER;
    completed_tasks INTEGER;
    progress_percent NUMERIC;
BEGIN
    SELECT COUNT(*) INTO total_tasks FROM public.project_tasks WHERE project_id = NEW.project_id;

    IF total_tasks = 0 THEN
        UPDATE public.projects SET progress = 0 WHERE id = NEW.project_id;
    ELSE
        SELECT COUNT(*) INTO completed_tasks FROM public.project_tasks
        WHERE project_id = NEW.project_id AND status = 'COMPLETED';

        progress_percent := ROUND((completed_tasks::NUMERIC / total_tasks) * 100);
        UPDATE public.projects SET progress = progress_percent WHERE id = NEW.project_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. TRIGGER TO AUTO-UPDATE PROGRESS
DROP TRIGGER IF EXISTS tr_update_project_progress ON public.project_tasks;
CREATE TRIGGER tr_update_project_progress
AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
FOR EACH ROW
EXECUTE FUNCTION calculate_project_progress();

-- 9. TRIGGER FOR UPDATED_AT (create function if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_teams_at ON teams;
CREATE TRIGGER tr_update_teams_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_update_project_members_at ON project_members;
CREATE TRIGGER tr_update_project_members_at
    BEFORE UPDATE ON project_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 10. ENSURE UNIQUE CONSTRAINT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teams_name_unique' AND conrelid = 'public.teams'::regclass
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_name_unique UNIQUE (name);
  END IF;
END $$;

-- 11. SEED TEAMS (delete and re-insert to ensure fresh data)
DELETE FROM teams WHERE name IN ('Frontend Team', 'Backend Team', 'Design Team', 'DevOps Team');

INSERT INTO teams (name, department, description) VALUES
    ('Frontend Team', 'Engineering', 'Frontend development'),
    ('Backend Team', 'Engineering', 'Backend development'),
    ('Design Team', 'Design', 'UI/UX Design'),
    ('DevOps Team', 'Infrastructure', 'DevOps and Infrastructure');

-- 12. ROW LEVEL SECURITY POLICIES
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_view_teams" ON public.teams;
CREATE POLICY "employees_view_teams" ON public.teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "employees_view_project_members" ON public.project_members;
CREATE POLICY "employees_view_project_members" ON public.project_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins_manage_project_members" ON public.project_members;
CREATE POLICY "admins_manage_project_members" ON public.project_members FOR ALL
    USING ((SELECT role FROM public.employees WHERE id = auth.uid()) IN ('super_admin', 'hr', 'lead'));
