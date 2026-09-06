-- ============================================================
-- MIGRATION 054: MULTI-TIER WORKFLOW & NOTIFICATIONS
-- ============================================================

-- 1. Extend projects table for hierarchy and status
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'initialized' 
    CHECK (workflow_status IN ('initialized', 'manager_accepted', 'delegated', 'completed'));

-- 2. Extend project_teams table to track Lead and acceptance
ALTER TABLE project_teams ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE project_teams ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined'));

-- 3. Create notifications table
CREATE TABLE IF NOT EXISTS system_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info', -- 'info', 'project_assignment', 'task_update', 'alert'
    reference_id UUID,        -- project_id or task_id
    reference_type TEXT,      -- 'project', 'task'
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for notification lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON system_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON system_notifications(is_read);

-- 4. Trigger to notify manager when project is initialized
CREATE OR REPLACE FUNCTION notify_project_manager()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.manager_id IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.manager_id IS NOT NULL AND OLD.manager_id IS DISTINCT FROM NEW.manager_id) THEN
        INSERT INTO system_notifications (user_id, title, message, type, reference_id, reference_type)
        VALUES (
            NEW.manager_id,
            'New Project Assignment',
            'You have been assigned as the manager for project: ' || NEW.name,
            'project_assignment',
            NEW.id,
            'project'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_project_manager ON projects;
CREATE TRIGGER trg_notify_project_manager
AFTER INSERT OR UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION notify_project_manager();

-- 5. Trigger to notify lead when project team is assigned
CREATE OR REPLACE FUNCTION notify_project_lead()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.lead_id IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.lead_id IS NOT NULL AND OLD.lead_id IS DISTINCT FROM NEW.lead_id) THEN
        INSERT INTO system_notifications (user_id, title, message, type, reference_id, reference_type)
        VALUES (
            NEW.lead_id,
            'New Team Assignment',
            'Your team has been assigned to project cluster. Please review and accept.',
            'project_assignment',
            NEW.project_id,
            'project'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_project_lead ON project_teams;
CREATE TRIGGER trg_notify_project_lead
AFTER INSERT OR UPDATE ON project_teams
FOR EACH ROW EXECUTE FUNCTION notify_project_lead();
