-- Migration 061: Add multi-assignee support to project_tasks
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS assignee_ids UUID[] DEFAULT '{}';

-- Back-fill existing single assigned_to into the array
UPDATE project_tasks SET assignee_ids = ARRAY[assigned_to] WHERE assigned_to IS NOT NULL AND (assignee_ids IS NULL OR assignee_ids = '{}');
