-- Migration 091: Targeted Permission Restoration
-- Restores all modules to "Visible" for Admin except Manager and Employee dashboards.
-- Also restores standard access for other roles.

-- 1. Restore Admin: Everything ON except Manager Dashboard and Employee Dashboard
UPDATE role_permissions
SET can_view = true, can_create = true, can_edit = true, can_delete = true, can_export = true
WHERE role = 'admin';

UPDATE role_permissions
SET can_view = false, can_create = false, can_edit = false, can_delete = false, can_export = false
WHERE role = 'admin' AND module_key IN ('manager_dashboard', 'my_dashboard');

-- 2. Restore Department Lead (formerly 'manager')
UPDATE role_permissions
SET can_view = true, can_create = true, can_edit = true, can_delete = false, can_export = false
WHERE role = 'dept_lead' AND module_key IN (
  'manager_dashboard', 'projects', 'manager_teams', 'manager_org_chart',
  'job_clusters', 'recruitment', 'ats_scanner', 'kpi_kra', 'lms_academy',
  'workspace_hub', 'workspace_documents', 'workspace_spreadsheets',
  'workspace_presentations', 'workspace_notes',
  'mail_inbox', 'mail_compose', 'mail_sent', 'mail_files',
  'my_profile', 'my_attendance', 'my_incentives', 'my_payslips',
  'my_messages', 'my_meetings'
);

-- 3. Restore Team Lead (formerly 'lead')
UPDATE role_permissions
SET can_view = true, can_create = true, can_edit = false, can_delete = false, can_export = false
WHERE role = 'team_lead' AND module_key IN (
  'projects', 'kpi_kra', 'recruitment', 'ats_scanner',
  'attendance', 'budgets', 'subscriptions',
  'workspace_hub', 'workspace_documents', 'workspace_spreadsheets',
  'workspace_presentations', 'workspace_notes',
  'mail_hub', 'mail_inbox', 'mail_compose', 'mail_sent', 'mail_files',
  'messages', 'meetings'
);

-- 4. Restore Employee
UPDATE role_permissions
SET can_view = true, can_create = true, can_edit = true, can_delete = false, can_export = false
WHERE role = 'employee' AND module_key IN (
  'my_dashboard', 'my_profile', 'my_attendance', 'my_performance',
  'my_incentives', 'my_payslips', 'my_reimbursements', 'my_priority_payout',
  'training_academy',
  'workspace_hub', 'workspace_documents', 'workspace_spreadsheets',
  'workspace_presentations', 'workspace_notes',
  'mail_inbox', 'mail_compose', 'mail_sent', 'mail_drafts',
  'my_messages', 'my_meetings'
);

-- 5. Restore Intern
UPDATE role_permissions
SET can_view = true, can_create = false, can_edit = false, can_delete = false, can_export = false
WHERE role = 'intern' AND module_key IN (
  'my_dashboard', 'training_academy', 'my_profile', 'my_attendance',
  'workspace_hub', 'workspace_documents', 'workspace_notes',
  'mail_inbox', 'mail_compose', 'mail_sent',
  'my_messages', 'my_meetings'
);
