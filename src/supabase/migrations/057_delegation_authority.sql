-- Add delegation control flags to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS can_manager_delegate BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS can_lead_delegate BOOLEAN DEFAULT FALSE;
