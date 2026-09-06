-- ENABLE RLS ON ALL TABLES
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentives ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_requests ENABLE ROW LEVEL SECURITY;

-- HELPER FUNCTION: Get current user role from database (more reliable than JWT)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
DECLARE
    r user_role;
BEGIN
    SELECT role INTO r FROM employees WHERE id = auth.uid();
    RETURN COALESCE(r, 'employee'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- HELPER FUNCTION: Get my employee id
CREATE OR REPLACE FUNCTION get_my_id()
RETURNS UUID AS $$
  SELECT auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. SUPER ADMIN: Full Access
DROP POLICY IF EXISTS super_admin_all_employees ON employees;
CREATE POLICY super_admin_all_employees ON employees FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_teams ON teams;
CREATE POLICY super_admin_all_teams ON teams FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_attendance ON attendance_logs;
CREATE POLICY super_admin_all_attendance ON attendance_logs FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_leaves ON leave_requests;
CREATE POLICY super_admin_all_leaves ON leave_requests FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_kpi ON kpi_scores;
CREATE POLICY super_admin_all_kpi ON kpi_scores FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_incentives ON incentives;
CREATE POLICY super_admin_all_incentives ON incentives FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_payroll ON payroll_runs;
CREATE POLICY super_admin_all_payroll ON payroll_runs FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_vendors ON vendors;
CREATE POLICY super_admin_all_vendors ON vendors FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_clients ON clients;
CREATE POLICY super_admin_all_clients ON clients FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_invoices ON invoices;
CREATE POLICY super_admin_all_invoices ON invoices FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_subs ON subscriptions;
CREATE POLICY super_admin_all_subs ON subscriptions FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_budgets ON team_budgets;
CREATE POLICY super_admin_all_budgets ON team_budgets FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_leads ON leads;
CREATE POLICY super_admin_all_leads ON leads FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_channels ON channels;
CREATE POLICY super_admin_all_channels ON channels FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_members ON channel_members;
CREATE POLICY super_admin_all_members ON channel_members FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_messages ON messages;
CREATE POLICY super_admin_all_messages ON messages FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_meetings ON meetings;
CREATE POLICY super_admin_all_meetings ON meetings FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_attendees ON meeting_attendees;
CREATE POLICY super_admin_all_attendees ON meeting_attendees FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_config ON system_config;
CREATE POLICY super_admin_all_config ON system_config FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_audit ON audit_logs;
CREATE POLICY super_admin_all_audit ON audit_logs FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_reimb ON reimbursements;
CREATE POLICY super_admin_all_reimb ON reimbursements FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS super_admin_all_priority ON priority_requests;
CREATE POLICY super_admin_all_priority ON priority_requests FOR ALL TO authenticated USING (get_my_role() = 'super_admin');

-- 2. ACCOUNTS
DROP POLICY IF EXISTS accounts_read_employees ON employees;
CREATE POLICY accounts_read_employees ON employees FOR SELECT TO authenticated USING (get_my_role() = 'accounts');

DROP POLICY IF EXISTS accounts_all_payroll ON payroll_runs;
CREATE POLICY accounts_all_payroll ON payroll_runs FOR ALL TO authenticated USING (get_my_role() = 'accounts');

-- 3. HR
DROP POLICY IF EXISTS hr_all_employees ON employees;
CREATE POLICY hr_all_employees ON employees FOR ALL TO authenticated USING (get_my_role() = 'hr');

-- 4. LEAD
DROP POLICY IF EXISTS lead_read_my_team ON employees;
CREATE POLICY lead_read_my_team ON employees FOR SELECT TO authenticated 
  USING (team_id IN (SELECT id FROM teams WHERE lead_id = get_my_id()));

-- 5. EMPLOYEE: Own data
DROP POLICY IF EXISTS emp_view_self ON employees;
CREATE POLICY emp_view_self ON employees FOR SELECT TO authenticated USING (id = get_my_id());

DROP POLICY IF EXISTS emp_view_own_attendance ON attendance_logs;
CREATE POLICY emp_view_own_attendance ON attendance_logs FOR SELECT TO authenticated USING (employee_id = get_my_id());

DROP POLICY IF EXISTS emp_manage_own_leaves ON leave_requests;
CREATE POLICY emp_manage_own_leaves ON leave_requests FOR ALL TO authenticated USING (employee_id = get_my_id());

DROP POLICY IF EXISTS emp_view_own_kpi ON kpi_scores;
CREATE POLICY emp_view_own_kpi ON kpi_scores FOR SELECT TO authenticated USING (employee_id = get_my_id());

DROP POLICY IF EXISTS emp_view_own_incentives ON incentives;
CREATE POLICY emp_view_own_incentives ON incentives FOR SELECT TO authenticated USING (employee_id = get_my_id());

DROP POLICY IF EXISTS emp_view_own_payroll ON payroll_runs;
CREATE POLICY emp_view_own_payroll ON payroll_runs FOR SELECT TO authenticated USING (employee_id = get_my_id());

DROP POLICY IF EXISTS emp_manage_own_reimb ON reimbursements;
CREATE POLICY emp_manage_own_reimb ON reimbursements FOR ALL TO authenticated USING (employee_id = get_my_id());

DROP POLICY IF EXISTS emp_manage_own_priority ON priority_requests;
CREATE POLICY emp_manage_own_priority ON priority_requests FOR ALL TO authenticated USING (employee_id = get_my_id());

-- 6. SALES
DROP POLICY IF EXISTS sales_all_leads ON leads;
CREATE POLICY sales_all_leads ON leads FOR ALL TO authenticated USING (get_my_role() = 'sales');

-- GLOBAL ACCESS
DROP POLICY IF EXISTS global_read_channels ON channels;
CREATE POLICY global_read_channels ON channels FOR SELECT TO authenticated 
  USING (id IN (SELECT channel_id FROM channel_members WHERE employee_id = get_my_id()));

DROP POLICY IF EXISTS global_read_messages ON messages;
CREATE POLICY global_read_messages ON messages FOR SELECT TO authenticated 
  USING (
    channel_id IN (SELECT channel_id FROM channel_members WHERE employee_id = get_my_id()) 
    OR sender_id = get_my_id()
  );

DROP POLICY IF EXISTS global_send_messages ON messages;
CREATE POLICY global_send_messages ON messages FOR INSERT TO authenticated 
  WITH CHECK (sender_id = get_my_id());
