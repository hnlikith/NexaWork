-- ============================================================
-- MIGRATION 055: FIX HIERARCHY TRIGGERS & SCHEMA ALIGNMENT
-- ============================================================

-- 1. Drop problematic triggers from 052 that reference non-existent columns (head_id, lead_id on teams)
-- and non-existent columns on system_notifications (link)

DROP TRIGGER IF EXISTS tr_notify_dept_head_on_project ON projects;
DROP TRIGGER IF EXISTS tr_notify_lead_on_team_assignment ON project_teams;
DROP TRIGGER IF EXISTS tr_notify_employee_on_task ON project_tasks;
DROP TRIGGER IF EXISTS tr_notify_lead_on_submission ON project_tasks;

-- 1.5 Ensure system_notifications has the required columns for 3-tier workflow
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_notifications' AND column_name='reference_id') THEN
        ALTER TABLE system_notifications ADD COLUMN reference_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_notifications' AND column_name='reference_type') THEN
        ALTER TABLE system_notifications ADD COLUMN reference_type TEXT;
    END IF;
END $$;

-- 2. Drop the functions as well to keep it clean
DROP FUNCTION IF EXISTS notify_dept_head_on_project();
DROP FUNCTION IF EXISTS notify_lead_on_team_assignment();
DROP FUNCTION IF EXISTS notify_employee_on_task();
DROP FUNCTION IF EXISTS notify_lead_on_submission();

-- 4. Re-implement Task Assignment Notification (Employee Level)
-- This one is still very useful. We use the schema from 054.
CREATE OR REPLACE FUNCTION notify_employee_on_task_v2()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to)) THEN
        INSERT INTO system_notifications (user_id, title, message, type, reference_id, reference_type)
        VALUES (
            NEW.assigned_to, 
            'New Task Assigned', 
            'You have been assigned a new task: "' || NEW.title || '"',
            'info',
            NEW.id,
            'task'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_employee_on_task ON project_tasks;
CREATE TRIGGER trg_notify_employee_on_task
    AFTER INSERT OR UPDATE ON project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_employee_on_task_v2();

-- 4. Re-implement Task Submission Notification (Lead Level)
-- When an employee submits a task, notify the lead assigned to that project-team cluster.
CREATE OR REPLACE FUNCTION notify_lead_on_submission_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_lead_id UUID;
    v_emp_name TEXT;
BEGIN
    IF NEW.status = 'SUBMITTED' AND (OLD.status IS NULL OR OLD.status != 'SUBMITTED') THEN
        -- Find the employee name
        SELECT name INTO v_emp_name FROM employees WHERE id = NEW.assigned_to;
        
        -- Find the lead assigned to this project for the employee's team
        SELECT pt.lead_id INTO v_lead_id 
        FROM project_teams pt
        JOIN employees e ON e.team_id = pt.team_id
        WHERE pt.project_id = NEW.project_id AND e.id = NEW.assigned_to
        LIMIT 1;
        
        IF v_lead_id IS NOT NULL THEN
            INSERT INTO system_notifications (user_id, title, message, type, reference_id, reference_type)
            VALUES (
                v_lead_id, 
                'Task Submitted', 
                v_emp_name || ' has submitted task "' || NEW.title || '" for review.',
                'warning',
                NEW.project_id,
                'project'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_lead_on_submission ON project_tasks;
CREATE TRIGGER trg_notify_lead_on_submission
    AFTER UPDATE ON project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_lead_on_submission_v2();
