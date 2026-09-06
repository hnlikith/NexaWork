-- ============================================================
-- MIGRATION 056: HIERARCHICAL DELEGATION & AUDIT TRAIL
-- ============================================================

-- 1. Add audit columns to project_tasks
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS last_updated_by UUID REFERENCES employees(id);
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Add 'type' to project_tasks to distinguish Strategic (Lead level) vs Operational (Employee level)
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'operational' 
    CHECK (task_type IN ('strategic', 'operational'));

-- 3. Add parent_task_id for hierarchical breakdown (Lead can breakdown a Manager's task)
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES project_tasks(id) ON DELETE CASCADE;

-- 4. Function to automatically update audit columns
CREATE OR REPLACE FUNCTION update_task_audit()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_task_audit
    BEFORE UPDATE ON project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_task_audit();

-- 5. Extend project_teams to store specific deliverables/scope from Manager
ALTER TABLE project_teams ADD COLUMN IF NOT EXISTS scope_description TEXT;
ALTER TABLE project_teams ADD COLUMN IF NOT EXISTS assigned_lead_id UUID REFERENCES employees(id);
