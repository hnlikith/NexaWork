-- ============================================================
-- MIGRATION 053: PROJECT WORKFLOW COLUMNS
-- ============================================================

-- Add project lifecycle columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress_locked BOOLEAN DEFAULT FALSE;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_department_id ON projects(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_started_at ON projects(started_at);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
