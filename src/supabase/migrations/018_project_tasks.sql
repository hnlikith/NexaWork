-- Migration: Add Project Tasks
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED')) NOT NULL DEFAULT 'TODO',
    priority TEXT CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')) NOT NULL DEFAULT 'Medium',
    assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE project_tasks;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS tr_update_project_tasks_at ON project_tasks;
CREATE TRIGGER tr_update_project_tasks_at 
    BEFORE UPDATE ON project_tasks 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();
