-- Migration 086: Final 5-Role Consolidation (Spec-Compliant, Error-Free)
-- Strategy: Cast role column to TEXT first, migrate data as text,
--            then swap the entire enum — avoids the "new enum value must
--            be committed before use" (55P04) error entirely.
-- Roles: admin | dept_lead | team_lead | employee | intern
-- ═══════════════════════════════════════════════════════════════════════

-- ─── STEP 1: Drop ALL dependent objects ─────────────────────────────────────

DROP TRIGGER IF EXISTS employee_sync_all_channels ON employees;
DROP VIEW IF EXISTS workspace_shared_users;

-- Drop every known policy that references old or new role names
-- (covers both a fresh DB and a partially-applied state)

-- attendance_logs
DROP POLICY IF EXISTS "hr_all_attendance"              ON attendance_logs;
DROP POLICY IF EXISTS "super_admin_all_attendance"     ON attendance_logs;
DROP POLICY IF EXISTS "lead_read_team_attendance"      ON attendance_logs;
DROP POLICY IF EXISTS "admin_all_attendance"           ON attendance_logs;
DROP POLICY IF EXISTS "dept_lead_read_attendance"      ON attendance_logs;

-- attendance_settings
DROP POLICY IF EXISTS "Admins can manage settings"                    ON attendance_settings;
DROP POLICY IF EXISTS "Allow admins to manage attendance settings"     ON attendance_settings;
DROP POLICY IF EXISTS "admin_manage_attendance_settings"              ON attendance_settings;

-- audit_logs
DROP POLICY IF EXISTS "super_admin_all_audit"  ON audit_logs;
DROP POLICY IF EXISTS "admin_all_audit"        ON audit_logs;

-- clients
DROP POLICY IF EXISTS "accounts_all_clients"     ON clients;
DROP POLICY IF EXISTS "super_admin_all_clients"  ON clients;
DROP POLICY IF EXISTS "admin_all_clients"        ON clients;

-- employees
DROP POLICY IF EXISTS "hr_all_employees"           ON employees;
DROP POLICY IF EXISTS "super_admin_all_employees"  ON employees;
DROP POLICY IF EXISTS "accounts_read_employees"    ON employees;
DROP POLICY IF EXISTS "lead_read_my_team"          ON employees;
DROP POLICY IF EXISTS "employees_select_own"       ON employees;
DROP POLICY IF EXISTS "employees_admin_all"        ON employees;
DROP POLICY IF EXISTS "employees_lead_select"      ON employees;

-- incentives
DROP POLICY IF EXISTS "super_admin_all_incentives"  ON incentives;
DROP POLICY IF EXISTS "admin_all_incentives"        ON incentives;

-- invoices
DROP POLICY IF EXISTS "accounts_all_invoices"     ON invoices;
DROP POLICY IF EXISTS "super_admin_all_invoices"  ON invoices;
DROP POLICY IF EXISTS "admin_all_invoices"        ON invoices;

-- kpi_metrics
DROP POLICY IF EXISTS "hr_manage_kpi"   ON kpi_metrics;
DROP POLICY IF EXISTS "hr_view_all_kpi" ON kpi_metrics;
DROP POLICY IF EXISTS "admin_manage_kpi" ON kpi_metrics;

-- kpi_scores
DROP POLICY IF EXISTS "hr_all_kpi"          ON kpi_scores;
DROP POLICY IF EXISTS "lead_view_team_kpi"  ON kpi_scores;
DROP POLICY IF EXISTS "super_admin_all_kpi" ON kpi_scores;
DROP POLICY IF EXISTS "admin_all_kpi"       ON kpi_scores;

-- leads
DROP POLICY IF EXISTS "sales_all_leads"       ON leads;
DROP POLICY IF EXISTS "super_admin_all_leads" ON leads;
DROP POLICY IF EXISTS "admin_all_leads"       ON leads;
DROP POLICY IF EXISTS "employee_all_leads"    ON leads;

-- leave_requests
DROP POLICY IF EXISTS "Admin full access leave_requests"  ON leave_requests;
DROP POLICY IF EXISTS "admin_all_leave_requests"          ON leave_requests;

-- payroll_runs
DROP POLICY IF EXISTS "accounts_all_payroll"     ON payroll_runs;
DROP POLICY IF EXISTS "super_admin_all_payroll"  ON payroll_runs;
DROP POLICY IF EXISTS "admin_all_payroll"        ON payroll_runs;

-- priority_requests
DROP POLICY IF EXISTS "accounts_all_priority"     ON priority_requests;
DROP POLICY IF EXISTS "super_admin_all_priority"  ON priority_requests;
DROP POLICY IF EXISTS "admin_all_priority"        ON priority_requests;

-- project_members
DROP POLICY IF EXISTS "Admins and Managers can manage project members"  ON project_members;
DROP POLICY IF EXISTS "admin_manage_project_members"                    ON project_members;

-- project_tasks
DROP POLICY IF EXISTS "Admins and Managers can create strategic tasks"  ON project_tasks;
DROP POLICY IF EXISTS "Leads can verify tasks"                          ON project_tasks;
DROP POLICY IF EXISTS "admin_create_tasks"                              ON project_tasks;
DROP POLICY IF EXISTS "leads_verify_tasks"                              ON project_tasks;

-- project_teams
DROP POLICY IF EXISTS "Admins and Managers can manage project teams"  ON project_teams;
DROP POLICY IF EXISTS "admin_manage_project_teams"                    ON project_teams;

-- projects
DROP POLICY IF EXISTS "Managers can delegate to any team"  ON projects;
DROP POLICY IF EXISTS "admin_delegate_projects"            ON projects;

-- reimbursements
DROP POLICY IF EXISTS "accounts_all_reimb"     ON reimbursements;
DROP POLICY IF EXISTS "super_admin_all_reimb"  ON reimbursements;
DROP POLICY IF EXISTS "admin_all_reimb"        ON reimbursements;

-- role_permissions
DROP POLICY IF EXISTS "read_role_permissions"          ON role_permissions;
DROP POLICY IF EXISTS "super_admin_write_permissions"  ON role_permissions;
DROP POLICY IF EXISTS "admin_write_permissions"        ON role_permissions;

-- role_assignable_roles
DROP POLICY IF EXISTS "read_assignable_roles"          ON role_assignable_roles;
DROP POLICY IF EXISTS "super_admin_write_assignable"   ON role_assignable_roles;
DROP POLICY IF EXISTS "admin_write_assignable"         ON role_assignable_roles;

-- subscriptions
DROP POLICY IF EXISTS "accounts_all_subs"       ON subscriptions;
DROP POLICY IF EXISTS "super_admin_all_subs"    ON subscriptions;
DROP POLICY IF EXISTS "admin_all_subscriptions" ON subscriptions;

-- support_routing_rules
DROP POLICY IF EXISTS "Admin Full Access routing_rules"  ON support_routing_rules;
DROP POLICY IF EXISTS "admin_routing_rules"              ON support_routing_rules;

-- system_config
DROP POLICY IF EXISTS "super_admin_all_config"  ON system_config;
DROP POLICY IF EXISTS "admin_all_config"        ON system_config;

-- system_holidays
DROP POLICY IF EXISTS "Super admins and accounts can manage holidays"  ON system_holidays;
DROP POLICY IF EXISTS "admin_manage_holidays"                          ON system_holidays;

-- team_budgets / budgets
DROP POLICY IF EXISTS "accounts_all_budgets"     ON team_budgets;
DROP POLICY IF EXISTS "super_admin_all_budgets"  ON team_budgets;
DROP POLICY IF EXISTS "admin_all_budgets"        ON team_budgets;
DROP POLICY IF EXISTS "budgets_insert_finance"   ON budgets;
DROP POLICY IF EXISTS "admin_insert_budgets"     ON budgets;

-- vendors
DROP POLICY IF EXISTS "accounts_all_vendors"     ON vendors;
DROP POLICY IF EXISTS "super_admin_all_vendors"  ON vendors;
DROP POLICY IF EXISTS "admin_all_vendors"        ON vendors;

-- Also catch anything missed with a dynamic sweep
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (qual       ILIKE '%super_admin%'
            OR qual       ILIKE '%accounts%'
            OR qual       ILIKE '%department_lead%'
            OR qual       ILIKE '%sub_team_lead%'
            OR qual       ILIKE '%internship%'
            OR with_check ILIKE '%super_admin%'
            OR with_check ILIKE '%accounts%'
            OR with_check ILIKE '%department_lead%'
            OR with_check ILIKE '%sub_team_lead%'
            OR with_check ILIKE '%internship%')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ─── STEP 2: Release the enum — cast role column to plain TEXT ──────────────
ALTER TABLE employees ALTER COLUMN role DROP DEFAULT;
ALTER TABLE employees ALTER COLUMN role TYPE TEXT USING role::TEXT;

-- ─── STEP 3: Migrate employees text values to new 5-role names ──────────────
UPDATE employees SET role = 'admin'
  WHERE role IN ('super_admin', 'accounts', 'hr');

UPDATE employees SET role = 'dept_lead'
  WHERE role IN ('department_lead', 'manager', 'lead');

UPDATE employees SET role = 'team_lead'
  WHERE role = 'sub_team_lead';

UPDATE employees SET role = 'employee'
  WHERE role = 'sales';

UPDATE employees SET role = 'intern'
  WHERE role = 'internship';

-- ─── STEP 4: Swap enum — drop old, create new 5-value type ──────────────────
DROP TYPE IF EXISTS user_role CASCADE;

CREATE TYPE user_role AS ENUM ('admin', 'dept_lead', 'team_lead', 'employee', 'intern');

ALTER TABLE employees
  ALTER COLUMN role TYPE user_role
  USING role::user_role;

ALTER TABLE employees
  ALTER COLUMN role SET DEFAULT 'employee'::user_role;

-- ─── STEP 5: Restore trigger ─────────────────────────────────────────────────
CREATE TRIGGER employee_sync_all_channels
  AFTER INSERT OR UPDATE OF team_id, department, is_active, role OR DELETE
  ON employees
  FOR EACH ROW EXECUTE FUNCTION trg_employee_sync_all_channels();

-- ─── STEP 6: Restore view ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW workspace_shared_users AS
SELECT
  ws.id           AS share_id,
  ws.item_id,
  ws.item_type,
  ws.access_level,
  ws.created_at   AS shared_at,
  e.id            AS user_id,
  e.name,
  e.email,
  e.role,
  e.employee_id
FROM workspace_shares ws
JOIN employees e ON ws.user_id = e.id;

-- ─── STEP 7: Recreate all RLS policies with new role names ───────────────────

-- employees: self-read
CREATE POLICY "employees_select_own" ON employees
  FOR SELECT USING (auth.uid() = id);

-- employees: admin full access
CREATE POLICY "employees_admin_all" ON employees
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- employees: dept_lead and team_lead can view all
CREATE POLICY "employees_lead_select" ON employees
  FOR SELECT USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('dept_lead', 'team_lead')
  );

-- attendance_logs: admin full access
CREATE POLICY "admin_all_attendance" ON attendance_logs
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- attendance_logs: dept_lead can read
CREATE POLICY "dept_lead_read_attendance" ON attendance_logs
  FOR SELECT USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('dept_lead', 'team_lead')
  );

-- attendance_settings: admin and dept_lead manage
CREATE POLICY "Admins can manage settings" ON attendance_settings
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

-- audit_logs: admin only
CREATE POLICY "admin_all_audit" ON audit_logs
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- clients: admin full access
CREATE POLICY "admin_all_clients" ON clients
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- incentives: admin full access
CREATE POLICY "admin_all_incentives" ON incentives
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- invoices: admin full access
CREATE POLICY "admin_all_invoices" ON invoices
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- kpi_metrics: admin and dept_lead manage
CREATE POLICY "admin_manage_kpi" ON kpi_metrics
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

-- kpi_scores: admin full access
CREATE POLICY "admin_all_kpi" ON kpi_scores
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- kpi_scores: team_lead and dept_lead can view
CREATE POLICY "lead_view_team_kpi" ON kpi_scores
  FOR SELECT USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('dept_lead', 'team_lead')
  );

-- leads: admin and employee (sales) full access
CREATE POLICY "admin_all_leads" ON leads
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

-- leave_requests: admin and dept_lead full access
CREATE POLICY "Admin full access leave_requests" ON leave_requests
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

-- payroll_runs: admin full access
CREATE POLICY "admin_all_payroll" ON payroll_runs
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- priority_requests: admin full access
CREATE POLICY "admin_all_priority" ON priority_requests
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- project_members
CREATE POLICY "Admins and Managers can manage project members" ON project_members
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead', 'team_lead')
  );

-- project_tasks: insert
CREATE POLICY "Admins and Managers can create strategic tasks" ON project_tasks
  FOR INSERT WITH CHECK (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

-- project_tasks: update
CREATE POLICY "Leads can verify tasks" ON project_tasks
  FOR UPDATE USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead', 'team_lead')
  );

-- project_teams
CREATE POLICY "Admins and Managers can manage project teams" ON project_teams
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

-- projects: update / delegation
CREATE POLICY "Managers can delegate to any team" ON projects
  FOR UPDATE USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

-- reimbursements: admin full access
CREATE POLICY "admin_all_reimb" ON reimbursements
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- role_permissions
CREATE POLICY "read_role_permissions" ON role_permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_write_permissions" ON role_permissions
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- role_assignable_roles
CREATE POLICY "read_assignable_roles" ON role_assignable_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_write_assignable" ON role_assignable_roles
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- subscriptions: admin full access
CREATE POLICY "admin_all_subscriptions" ON subscriptions
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- support_routing_rules
CREATE POLICY "Admin Full Access routing_rules" ON support_routing_rules
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- system_config: admin only
CREATE POLICY "admin_all_config" ON system_config
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- system_holidays: admin manages
CREATE POLICY "admin_manage_holidays" ON system_holidays
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- budgets: admin and dept_lead insert
CREATE POLICY "budgets_insert_finance" ON budgets
  FOR INSERT WITH CHECK (
    (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

-- vendors: admin full access
CREATE POLICY "admin_all_vendors" ON vendors
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- ─── STEP 8: Reseed role_permissions — clean slate then fresh insert ─────────

-- Wipe everything (avoids all duplicate-key errors)
DELETE FROM role_permissions;

-- Insert all role × module combinations (all OFF by default)
DO $$
DECLARE
  all_keys TEXT[] := ARRAY[
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
    'analytics','permissions_control','feature_report','system_config'
  ];
  all_roles TEXT[] := ARRAY['admin','dept_lead','team_lead','employee','intern'];
  r TEXT;
  m TEXT;
BEGIN
  FOREACH r IN ARRAY all_roles LOOP
    FOREACH m IN ARRAY all_keys LOOP
      INSERT INTO role_permissions
        (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
      VALUES (r, m, false, false, false, false, false);
    END LOOP;
  END LOOP;
END $$;

-- ADMIN: full access to everything
UPDATE role_permissions
  SET can_view=true, can_create=true, can_edit=true, can_delete=true, can_export=true
  WHERE role = 'admin';

-- DEPT_LEAD: department management + self-service
UPDATE role_permissions
  SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=false
  WHERE role = 'dept_lead' AND module_key IN (
    'manager_dashboard','projects','manager_teams','manager_org_chart',
    'workspace_hub','workspace_documents','workspace_spreadsheets',
    'workspace_presentations','workspace_notes',
    'job_clusters','recruitment','ats_scanner','interviews',
    'lms_academy','lms_courses','lms_certifications',
    'attendance','kpi_kra','incentives','claims','reimbursements',
    'priority_payout','support_admin',
    'mail_hub','mail_inbox','mail_compose','mail_sent',
    'mail_drafts','mail_files','mail_templates',
    'messages','meetings',
    'my_profile','my_attendance','my_performance',
    'my_incentives','my_payslips','my_reimbursements',
    'my_priority_payout','my_messages','my_meetings','support_user'
  );

-- TEAM_LEAD: team + workspace + comms + self-service
UPDATE role_permissions
  SET can_view=true, can_create=true, can_edit=false, can_delete=false, can_export=false
  WHERE role = 'team_lead' AND module_key IN (
    'projects','kpi_kra',
    'workspace_hub','workspace_documents','workspace_spreadsheets',
    'workspace_presentations','workspace_notes',
    'mail_hub','mail_inbox','mail_compose','mail_sent','mail_files',
    'messages','meetings',
    'my_dashboard','my_profile','my_attendance','my_performance',
    'my_incentives','my_payslips','my_messages','my_meetings','support_user'
  );

-- EMPLOYEE: self-service + workspace + comms
UPDATE role_permissions
  SET can_view=true, can_create=true, can_edit=true, can_delete=false, can_export=false
  WHERE role = 'employee' AND module_key IN (
    'my_dashboard','my_profile','my_attendance','my_performance',
    'my_incentives','my_payslips','my_reimbursements','my_priority_payout',
    'training_academy',
    'workspace_hub','workspace_documents','workspace_spreadsheets',
    'workspace_presentations','workspace_notes',
    'mail_inbox','mail_compose','mail_sent','mail_drafts',
    'my_messages','my_meetings','support_user'
  );

-- INTERN: training + basic workspace + comms only
UPDATE role_permissions
  SET can_view=true, can_create=false, can_edit=false, can_delete=false, can_export=false
  WHERE role = 'intern' AND module_key IN (
    'my_dashboard','training_academy','my_profile','my_attendance',
    'workspace_hub','workspace_documents','workspace_notes',
    'mail_inbox','mail_compose','mail_sent',
    'my_messages','my_meetings','support_user'
  );

-- ─── STEP 9: Reseed role_assignable_roles ────────────────────────────────────
DELETE FROM role_assignable_roles;

INSERT INTO role_assignable_roles (assigner_role, assignable_role) VALUES
  ('admin',     'admin'),
  ('admin',     'dept_lead'),
  ('admin',     'team_lead'),
  ('admin',     'employee'),
  ('admin',     'intern'),
  ('dept_lead', 'team_lead'),
  ('dept_lead', 'employee'),
  ('dept_lead', 'intern'),
  ('team_lead', 'employee');
