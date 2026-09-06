-- Migration 070: Dynamic Role Permission System
-- Replaces hardcoded sidebar nav with database-driven per-role module control.
-- Super Admin can toggle ON/OFF any module for any role from /admin/permissions.

-- ═══════════════════════════════════════════════════════════════
-- TABLE: role_permissions
-- Stores which modules each role can see and what they can do
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS role_permissions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  role        TEXT        NOT NULL,
  module_key  TEXT        NOT NULL,
  can_view    BOOLEAN     NOT NULL DEFAULT false,
  can_create  BOOLEAN     NOT NULL DEFAULT false,
  can_edit    BOOLEAN     NOT NULL DEFAULT false,
  can_delete  BOOLEAN     NOT NULL DEFAULT false,
  can_export  BOOLEAN     NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        REFERENCES employees(id) ON DELETE SET NULL,
  UNIQUE (role, module_key)
);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: role_assignable_roles
-- Controls which roles can create employees with specific roles.
-- Example: HR can assign 'employee', 'internship', 'lead' but not 'super_admin'.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS role_assignable_roles (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assigner_role   TEXT NOT NULL,
  assignable_role TEXT NOT NULL,
  UNIQUE (assigner_role, assignable_role)
);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE role_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignable_roles  ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (sidebar needs to load permissions)
CREATE POLICY "read_role_permissions" ON role_permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only super_admin can write permissions
CREATE POLICY "super_admin_write_permissions" ON role_permissions
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "read_assignable_roles" ON role_assignable_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "super_admin_write_assignable" ON role_assignable_roles
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'super_admin'
  );

-- ═══════════════════════════════════════════════════════════════
-- SEED: Insert all role × module combinations (all OFF by default)
-- Then UPDATE the ones that should be ON per role
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  all_keys TEXT[] := ARRAY[
    -- Organization
    'admin_dashboard','manager_dashboard','my_dashboard',
    'projects','employees','shift_management','teams','org_chart',
    'manager_teams','manager_org_chart',
    -- Workspace
    'workspace_hub','workspace_documents','workspace_spreadsheets',
    'workspace_presentations','workspace_notes',
    -- HR & Hiring
    'job_clusters','recruitment','ats_scanner','interviews',
    -- Learning & Development
    'lms_academy','lms_courses','lms_certifications','training_academy',
    -- Operations
    'attendance','kpi_kra','payroll','incentives',
    'claims','reimbursements','priority_payout',
    -- Finance
    'invoicing','vendors','subscriptions','budgets',
    -- Sales & CRM
    'sales_pipeline','crm_clients',
    -- Communications
    'mail_hub','mail_inbox','mail_compose','mail_sent',
    'mail_drafts','mail_files','mail_templates','mail_config',
    'messages','meetings',
    -- My Account (Employee Self-Service)
    'my_profile','my_attendance','my_performance',
    'my_incentives','my_payslips','my_reimbursements',
    'my_priority_payout','my_messages','my_meetings',
    -- System (Admin Only)
    'analytics','permissions_control','feature_report','system_config'
  ];
  all_roles TEXT[] := ARRAY[
    'super_admin','hr','accounts','manager','lead','sales','employee','internship'
  ];
  r TEXT;
  m TEXT;
BEGIN
  FOREACH r IN ARRAY all_roles LOOP
    FOREACH m IN ARRAY all_keys LOOP
      INSERT INTO role_permissions
        (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
      VALUES (r, m, false, false, false, false, false)
      ON CONFLICT (role, module_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SUPER ADMIN — Full access to everything
-- ─────────────────────────────────────────────────────────────
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=true, can_export=true
WHERE role = 'super_admin';

-- ─────────────────────────────────────────────────────────────
-- HR MANAGER — People & operations, no payroll/finance/system
-- ─────────────────────────────────────────────────────────────
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=true
WHERE role = 'hr' AND module_key IN (
  'admin_dashboard','projects','employees','shift_management','teams',
  'workspace_hub','workspace_documents','workspace_spreadsheets',
  'workspace_presentations','workspace_notes',
  'job_clusters','recruitment','ats_scanner','interviews',
  'lms_academy','lms_certifications',
  'attendance','kpi_kra','incentives','claims','reimbursements','priority_payout',
  'mail_hub','mail_inbox','mail_compose','mail_sent',
  'mail_drafts','mail_files','mail_templates',
  'messages','meetings','feature_report'
);

-- ─────────────────────────────────────────────────────────────
-- ACCOUNTS — Finance & payroll only
-- ─────────────────────────────────────────────────────────────
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=true
WHERE role = 'accounts' AND module_key IN (
  'admin_dashboard',
  'payroll','incentives','claims','reimbursements',
  'invoicing','vendors','subscriptions','budgets',
  'mail_hub','mail_inbox','mail_compose','mail_sent',
  'mail_drafts','mail_files','mail_templates',
  'messages','meetings','analytics'
);

-- ─────────────────────────────────────────────────────────────
-- MANAGER (Department Lead) — Team + workspace + self-service
-- ─────────────────────────────────────────────────────────────
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=false
WHERE role = 'manager' AND module_key IN (
  'manager_dashboard','projects','manager_teams','manager_org_chart',
  'job_clusters','recruitment','ats_scanner','kpi_kra','lms_academy',
  'workspace_hub','workspace_documents','workspace_spreadsheets',
  'workspace_presentations','workspace_notes',
  'mail_inbox','mail_compose','mail_sent','mail_files',
  'my_profile','my_attendance','my_incentives','my_payslips',
  'my_messages','my_meetings'
);

-- ─────────────────────────────────────────────────────────────
-- TEAM LEAD — Team management + workspace + comms
-- ─────────────────────────────────────────────────────────────
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=false, can_delete=false, can_export=false
WHERE role = 'lead' AND module_key IN (
  'projects','kpi_kra','recruitment','ats_scanner',
  'attendance','budgets','subscriptions',
  'workspace_hub','workspace_documents','workspace_spreadsheets',
  'workspace_presentations','workspace_notes',
  'mail_hub','mail_inbox','mail_compose','mail_sent','mail_files',
  'messages','meetings'
);

-- ─────────────────────────────────────────────────────────────
-- SALES — CRM + self-service + comms
-- ─────────────────────────────────────────────────────────────
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=false
WHERE role = 'sales' AND module_key IN (
  'sales_pipeline','crm_clients',
  'my_dashboard','my_profile','my_payslips',
  'mail_inbox','mail_compose','mail_sent',
  'messages','meetings'
);

-- ─────────────────────────────────────────────────────────────
-- EMPLOYEE — Self-service + workspace + comms
-- ─────────────────────────────────────────────────────────────
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=false
WHERE role = 'employee' AND module_key IN (
  'my_dashboard','my_profile','my_attendance','my_performance',
  'my_incentives','my_payslips','my_reimbursements','my_priority_payout',
  'training_academy',
  'workspace_hub','workspace_documents','workspace_spreadsheets',
  'workspace_presentations','workspace_notes',
  'mail_inbox','mail_compose','mail_sent','mail_drafts',
  'my_messages','my_meetings'
);

-- ─────────────────────────────────────────────────────────────
-- INTERNSHIP — Limited: Training + basic workspace + comms
-- ─────────────────────────────────────────────────────────────
UPDATE role_permissions
SET can_view=true, can_create=false, can_edit=false, can_delete=false, can_export=false
WHERE role = 'internship' AND module_key IN (
  'my_dashboard','training_academy','my_profile','my_attendance',
  'workspace_hub','workspace_documents','workspace_notes',
  'mail_inbox','mail_compose','mail_sent',
  'my_messages','my_meetings'
);

-- ═══════════════════════════════════════════════════════════════
-- DEFAULT ROLE ASSIGNMENT PERMISSIONS
-- Controls which roles can add employees with specific role values
-- ═══════════════════════════════════════════════════════════════
INSERT INTO role_assignable_roles (assigner_role, assignable_role) VALUES
  ('super_admin', 'super_admin'),
  ('super_admin', 'hr'),
  ('super_admin', 'accounts'),
  ('super_admin', 'manager'),
  ('super_admin', 'lead'),
  ('super_admin', 'sales'),
  ('super_admin', 'employee'),
  ('super_admin', 'internship'),
  ('hr', 'employee'),
  ('hr', 'lead'),
  ('hr', 'internship'),
  ('hr', 'sales'),
  ('manager', 'employee'),
  ('manager', 'internship')
ON CONFLICT (assigner_role, assignable_role) DO NOTHING;
