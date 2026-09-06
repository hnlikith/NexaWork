-- Migration 088: Fix recursive RLS on employees table
-- Problem: policies that do (SELECT role FROM employees WHERE id = auth.uid())
-- inside an employees policy cause infinite recursion → 500 error on any
-- employees query from the browser client.
-- Fix: Use a SECURITY DEFINER function that bypasses RLS to get the role.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Create a security-definer helper — reads role without RLS ─────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER   -- runs as the function owner, bypasses RLS
STABLE
SET search_path = public
AS $$
  SELECT role::text FROM employees WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── 2. Drop all the broken recursive policies on employees ───────────────────
DROP POLICY IF EXISTS "employees_admin_all"   ON employees;
DROP POLICY IF EXISTS "employees_lead_select" ON employees;
DROP POLICY IF EXISTS "employees_select_own"  ON employees;

-- ─── 3. Recreate employees policies using get_my_role() — no recursion ────────

-- Everyone can read their own row
CREATE POLICY "employees_select_own" ON employees
  FOR SELECT USING (auth.uid() = id);

-- Admin can do everything (uses helper fn — no recursion)
CREATE POLICY "employees_admin_all" ON employees
  FOR ALL USING (get_my_role() = 'admin');

-- Dept lead + team lead can read all employees (for their views)
CREATE POLICY "employees_lead_select" ON employees
  FOR SELECT USING (get_my_role() IN ('dept_lead', 'team_lead'));

-- ─── 4. Fix all other tables that have the same recursive subquery pattern ─────

-- projects
DROP POLICY IF EXISTS "Managers can delegate to any team" ON projects;
CREATE POLICY "Managers can delegate to any team" ON projects
  FOR UPDATE USING (get_my_role() IN ('admin', 'dept_lead'));

-- project_tasks
DROP POLICY IF EXISTS "Admins and Managers can create strategic tasks" ON project_tasks;
CREATE POLICY "Admins and Managers can create strategic tasks" ON project_tasks
  FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'dept_lead'));

DROP POLICY IF EXISTS "Leads can verify tasks" ON project_tasks;
CREATE POLICY "Leads can verify tasks" ON project_tasks
  FOR UPDATE USING (get_my_role() IN ('admin', 'dept_lead', 'team_lead'));

-- project_members
DROP POLICY IF EXISTS "Admins and Managers can manage project members" ON project_members;
CREATE POLICY "Admins and Managers can manage project members" ON project_members
  FOR ALL USING (get_my_role() IN ('admin', 'dept_lead', 'team_lead'));

-- project_teams
DROP POLICY IF EXISTS "Admins and Managers can manage project teams" ON project_teams;
CREATE POLICY "Admins and Managers can manage project teams" ON project_teams
  FOR ALL USING (get_my_role() IN ('admin', 'dept_lead'));

-- attendance_settings
DROP POLICY IF EXISTS "Admins can manage settings" ON attendance_settings;
CREATE POLICY "Admins can manage settings" ON attendance_settings
  FOR ALL USING (get_my_role() IN ('admin', 'dept_lead'));

-- leave_requests
DROP POLICY IF EXISTS "Admin full access leave_requests" ON leave_requests;
CREATE POLICY "Admin full access leave_requests" ON leave_requests
  FOR ALL USING (get_my_role() IN ('admin', 'dept_lead'));

-- budgets
DROP POLICY IF EXISTS "budgets_insert_finance" ON budgets;
CREATE POLICY "budgets_insert_finance" ON budgets
  FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'dept_lead'));

-- support_routing_rules
DROP POLICY IF EXISTS "Admin Full Access routing_rules" ON support_routing_rules;
CREATE POLICY "Admin Full Access routing_rules" ON support_routing_rules
  FOR ALL USING (get_my_role() = 'admin');

-- role_permissions
DROP POLICY IF EXISTS "admin_write_permissions" ON role_permissions;
CREATE POLICY "admin_write_permissions" ON role_permissions
  FOR ALL USING (get_my_role() = 'admin');

-- role_assignable_roles
DROP POLICY IF EXISTS "admin_write_assignable" ON role_assignable_roles;
CREATE POLICY "admin_write_assignable" ON role_assignable_roles
  FOR ALL USING (get_my_role() = 'admin');

-- audit_logs
DROP POLICY IF EXISTS "audit_logs_admin" ON audit_logs;
CREATE POLICY "audit_logs_admin" ON audit_logs
  FOR ALL USING (get_my_role() = 'admin');

-- calendar_events
DROP POLICY IF EXISTS "calendar_events_insert" ON calendar_events;
DROP POLICY IF EXISTS "calendar_events_update" ON calendar_events;
DROP POLICY IF EXISTS "calendar_events_delete" ON calendar_events;

CREATE POLICY "calendar_events_insert" ON calendar_events
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    OR get_my_role() IN ('admin', 'dept_lead')
  );

CREATE POLICY "calendar_events_update" ON calendar_events
  FOR UPDATE USING (
    created_by = auth.uid()
    OR get_my_role() IN ('admin', 'dept_lead')
  );

CREATE POLICY "calendar_events_delete" ON calendar_events
  FOR DELETE USING (
    created_by = auth.uid()
    OR get_my_role() = 'admin'
  );

-- account_access
DROP POLICY IF EXISTS "account_access_admin" ON account_access;
CREATE POLICY "account_access_admin" ON account_access
  FOR ALL USING (get_my_role() = 'admin');

-- attendance_logs (if policies exist)
DROP POLICY IF EXISTS "admin_all_attendance"      ON attendance_logs;
DROP POLICY IF EXISTS "dept_lead_read_attendance"  ON attendance_logs;
CREATE POLICY "admin_all_attendance" ON attendance_logs
  FOR ALL USING (get_my_role() = 'admin');
CREATE POLICY "dept_lead_read_attendance" ON attendance_logs
  FOR SELECT USING (get_my_role() IN ('dept_lead', 'team_lead'));

-- audit_logs (other tables from 086)
DROP POLICY IF EXISTS "admin_all_audit"          ON audit_logs;
CREATE POLICY "admin_all_audit" ON audit_logs
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_all_clients"        ON clients;
CREATE POLICY "admin_all_clients"  ON clients
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_all_incentives"     ON incentives;
CREATE POLICY "admin_all_incentives" ON incentives
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_all_invoices"       ON invoices;
CREATE POLICY "admin_all_invoices" ON invoices
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_manage_kpi"         ON kpi_metrics;
CREATE POLICY "admin_manage_kpi" ON kpi_metrics
  FOR ALL USING (get_my_role() IN ('admin', 'dept_lead'));

DROP POLICY IF EXISTS "admin_all_kpi"            ON kpi_scores;
DROP POLICY IF EXISTS "lead_view_team_kpi"       ON kpi_scores;
CREATE POLICY "admin_all_kpi" ON kpi_scores
  FOR ALL USING (get_my_role() = 'admin');
CREATE POLICY "lead_view_team_kpi" ON kpi_scores
  FOR SELECT USING (get_my_role() IN ('dept_lead', 'team_lead'));

DROP POLICY IF EXISTS "admin_all_leads"          ON leads;
CREATE POLICY "admin_all_leads" ON leads
  FOR ALL USING (get_my_role() IN ('admin', 'dept_lead'));

DROP POLICY IF EXISTS "admin_all_payroll"        ON payroll_runs;
CREATE POLICY "admin_all_payroll" ON payroll_runs
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_all_priority"       ON priority_requests;
CREATE POLICY "admin_all_priority" ON priority_requests
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_all_reimb"          ON reimbursements;
CREATE POLICY "admin_all_reimb" ON reimbursements
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_all_subscriptions"  ON subscriptions;
CREATE POLICY "admin_all_subscriptions" ON subscriptions
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_all_config"         ON system_config;
CREATE POLICY "admin_all_config" ON system_config
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_manage_holidays"    ON system_holidays;
CREATE POLICY "admin_manage_holidays" ON system_holidays
  FOR ALL USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "admin_all_vendors"        ON vendors;
CREATE POLICY "admin_all_vendors" ON vendors
  FOR ALL USING (get_my_role() = 'admin');
