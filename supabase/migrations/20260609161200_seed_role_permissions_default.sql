-- 1. Add 'hr' and 'accounts' role value to enum user_role if they don't exist
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accounts';

-- 2. Insert all missing keys for all roles
DO $$
DECLARE
  new_keys TEXT[] := ARRAY['hr_dashboard', 'accounts_dashboard', 'my_calendar', 'my_projects', 'my_academy'];
  all_roles TEXT[] := ARRAY['admin', 'hr', 'accounts', 'dept_lead', 'team_lead', 'employee', 'intern'];
  r TEXT;
  m TEXT;
BEGIN
  FOREACH r IN ARRAY all_roles LOOP
    FOREACH m IN ARRAY new_keys LOOP
      INSERT INTO role_permissions
        (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
      VALUES (r, m, false, false, false, false, false)
      ON CONFLICT (role, module_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- 3. Insert default empty permissions for 'hr' and 'accounts' for all existing keys
DO $$
DECLARE
  existing_keys TEXT[] := ARRAY[
    'admin_dashboard','manager_dashboard','my_dashboard',
    'projects','employees','shift_management','teams','org_chart',
    'manager_teams','manager_org_chart',
    'workspace_hub','workspace_documents','workspace_spreadsheets',
    'workspace_presentations','workspace_notes',
    'job_clusters','recruitment','ats_scanner','interviews',
    'lms_academy','lms_courses','lms_certifications','training_academy',
    'attendance','kpi_kra','payroll','incentives',
    'claims','reimbursements','priority_payout','support_admin',
    'invoicing','vendors','subscriptions','budgets',
    'sales_pipeline','crm_clients',
    'mail_hub','mail_inbox','mail_compose','mail_sent',
    'mail_drafts','mail_files','mail_templates','mail_accounts','mail_config',
    'messages','meetings',
    'my_profile','my_attendance','my_performance',
    'my_incentives','my_payslips','my_reimbursements',
    'my_priority_payout','my_messages','my_meetings','support_user',
    'analytics','permissions_control','feature_report','system_config','payslips_management'
  ];
  new_roles TEXT[] := ARRAY['hr', 'accounts'];
  r TEXT;
  m TEXT;
BEGIN
  FOREACH r IN ARRAY new_roles LOOP
    FOREACH m IN ARRAY existing_keys LOOP
      INSERT INTO role_permissions
        (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
      VALUES (r, m, false, false, false, false, false)
      ON CONFLICT (role, module_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- 4. Seed/Update default permissions for 'admin' (make sure new keys are views)
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=true, can_export=true
WHERE role = 'admin' AND module_key IN ('hr_dashboard', 'accounts_dashboard', 'my_calendar', 'my_projects', 'my_academy');

-- 5. Seed default permissions for 'hr'
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=true
WHERE role = 'hr' AND module_key IN (
  'hr_dashboard', 'my_dashboard',
  'projects', 'employees', 'shift_management', 'teams', 'org_chart',
  'workspace_hub', 'workspace_documents', 'workspace_spreadsheets', 'workspace_presentations', 'workspace_notes',
  'job_clusters', 'recruitment', 'ats_scanner', 'interviews',
  'lms_academy', 'lms_courses', 'lms_certifications', 'training_academy',
  'attendance', 'kpi_kra', 'incentives', 'claims', 'reimbursements', 'priority_payout', 'support_admin',
  'mail_hub', 'mail_inbox', 'mail_compose', 'mail_sent', 'mail_drafts', 'mail_files', 'mail_templates',
  'messages', 'meetings', 'feature_report',
  'my_profile', 'my_attendance', 'my_calendar', 'my_meetings', 'my_messages', 'my_projects', 'my_performance', 'my_payslips', 'my_incentives', 'my_reimbursements', 'my_priority_payout', 'my_academy', 'support_user'
);

-- 6. Seed default permissions for 'accounts'
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=true
WHERE role = 'accounts' AND module_key IN (
  'accounts_dashboard', 'my_dashboard',
  'payroll', 'payslips_management', 'incentives', 'claims', 'reimbursements', 'priority_payout',
  'invoicing', 'vendors', 'subscriptions', 'budgets',
  'mail_hub', 'mail_inbox', 'mail_compose', 'mail_sent', 'mail_drafts', 'mail_files', 'mail_templates',
  'messages', 'meetings', 'analytics', 'feature_report',
  'workspace_hub', 'workspace_documents', 'workspace_spreadsheets', 'workspace_presentations', 'workspace_notes',
  'my_profile', 'my_attendance', 'my_calendar', 'my_meetings', 'my_messages', 'my_projects', 'my_performance', 'my_payslips', 'my_incentives', 'my_reimbursements', 'my_priority_payout', 'my_academy', 'support_user'
);

-- 7. Seed new calendar/project/academy self-service keys for other roles
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true
WHERE role IN ('dept_lead', 'team_lead', 'employee', 'intern') AND module_key IN ('my_calendar', 'my_projects', 'my_academy');

-- 8. Seed role assignment permissions
INSERT INTO role_assignable_roles (assigner_role, assignable_role) VALUES
  ('admin', 'hr'),
  ('admin', 'accounts'),
  ('hr', 'accounts'),
  ('hr', 'hr')
ON CONFLICT (assigner_role, assignable_role) DO NOTHING;
