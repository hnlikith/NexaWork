-- ============================================================
-- MIGRATION 052: 3-TIER PROJECT ARCHITECTURE & WORKFLOW
-- ============================================================

-- 1. ENHANCE PROJECTS TABLE
ALTER TABLE projects ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES employees(id) ON DELETE SET NULL;

-- 2. ENHANCE PROJECT_TASKS TABLE
DO $$
BEGIN
    -- Add submission and review fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_tasks' AND column_name='submission_notes') THEN
        ALTER TABLE project_tasks ADD COLUMN submission_notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_tasks' AND column_name='submission_url') THEN
        ALTER TABLE project_tasks ADD COLUMN submission_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_tasks' AND column_name='review_feedback') THEN
        ALTER TABLE project_tasks ADD COLUMN review_feedback TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_tasks' AND column_name='reviewer_id') THEN
        ALTER TABLE project_tasks ADD COLUMN reviewer_id UUID REFERENCES employees(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. EXPAND TASK STATUS (if not already handled by relaxed constraints)
-- Note: Most dashboards handle status as strings, but we ensure consistency
ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_status_check;
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_status_check 
    CHECK (status IN ('TODO', 'IN_PROGRESS', 'SUBMITTED', 'REVIEW', 'REJECTED', 'COMPLETED'));

-- 4. NOTIFICATION FUNCTIONS

-- Function to notify Dept Head when project assigned to department
CREATE OR REPLACE FUNCTION notify_dept_head_on_project()
RETURNS TRIGGER AS $$
DECLARE
    v_head_id UUID;
BEGIN
    IF NEW.department_id IS NOT NULL AND (OLD.department_id IS NULL OR OLD.department_id != NEW.department_id) THEN
        -- Find the head of the department
        SELECT head_id INTO v_head_id FROM teams WHERE id = NEW.department_id;
        
        IF v_head_id IS NOT NULL THEN
            INSERT INTO system_notifications (user_id, title, message, type, link)
            VALUES (
                v_head_id, 
                'New Project Assigned', 
                'Project "' || NEW.name || '" has been assigned to your department. Please delegate to relevant teams.',
                'info',
                '/manager/dashboard'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for dept head notification
DROP TRIGGER IF EXISTS tr_notify_dept_head_on_project ON projects;
CREATE TRIGGER tr_notify_dept_head_on_project
    AFTER INSERT OR UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION notify_dept_head_on_project();

-- Function to notify lead when project assigned to team
CREATE OR REPLACE FUNCTION notify_lead_on_team_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_lead_id UUID;
    v_proj_name TEXT;
BEGIN
    -- Find the lead of the team
    SELECT lead_id INTO v_lead_id FROM teams WHERE id = NEW.team_id;
    SELECT name INTO v_proj_name FROM projects WHERE id = NEW.project_id;
    
    IF v_lead_id IS NOT NULL THEN
        INSERT INTO system_notifications (user_id, title, message, type, link)
        VALUES (
            v_lead_id, 
            'New Team Project', 
            'Your team has been assigned to project "' || v_proj_name || '". Please breakdown into tasks.',
            'info',
            '/lead/dashboard'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for lead notification (on project_teams junction)
DROP TRIGGER IF EXISTS tr_notify_lead_on_team_assignment ON project_teams;
CREATE TRIGGER tr_notify_lead_on_team_assignment
    AFTER INSERT ON project_teams
    FOR EACH ROW
    EXECUTE FUNCTION notify_lead_on_team_assignment();

-- Function to notify employee on task assignment
CREATE OR REPLACE FUNCTION notify_employee_on_task()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
        INSERT INTO system_notifications (user_id, title, message, type, link)
        VALUES (
            NEW.assigned_to, 
            'New Task Assigned', 
            'You have a new task: "' || NEW.title || '". Check your dashboard for details.',
            'info',
            '/dashboard'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for employee notification
DROP TRIGGER IF EXISTS tr_notify_employee_on_task ON project_tasks;
CREATE TRIGGER tr_notify_employee_on_task
    AFTER INSERT OR UPDATE ON project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_employee_on_task();

-- Function to notify lead on task submission
CREATE OR REPLACE FUNCTION notify_lead_on_submission()
RETURNS TRIGGER AS $$
DECLARE
    v_lead_id UUID;
    v_team_id UUID;
    v_emp_name TEXT;
BEGIN
    IF NEW.status = 'SUBMITTED' AND OLD.status != 'SUBMITTED' THEN
        -- Find the employee name
        SELECT name INTO v_emp_name FROM employees WHERE id = NEW.assigned_to;
        
        -- Find the lead of the team this project belongs to
        -- (Simplified: find first team assigned to this project)
        SELECT team_id INTO v_team_id FROM project_teams WHERE project_id = NEW.project_id LIMIT 1;
        SELECT lead_id INTO v_lead_id FROM teams WHERE id = v_team_id;
        
        IF v_lead_id IS NOT NULL THEN
            INSERT INTO system_notifications (user_id, title, message, type, link)
            VALUES (
                v_lead_id, 
                'Task Submitted for Review', 
                v_emp_name || ' has submitted task "' || NEW.title || '" for review.',
                'warning',
                '/lead/dashboard'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for lead notification on submission
DROP TRIGGER IF EXISTS tr_notify_lead_on_submission ON project_tasks;
CREATE TRIGGER tr_notify_lead_on_submission
    AFTER UPDATE ON project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_lead_on_submission();
