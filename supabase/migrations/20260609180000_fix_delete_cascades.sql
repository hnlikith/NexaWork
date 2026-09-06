-- Migration: Fix Delete Cascades for employees table
-- Updates foreign keys referencing employees(id) that block deletion to use ON DELETE CASCADE or ON DELETE SET NULL.

-- audit_logs (user_id) — the reconstructed local baseline uses user_id as
-- the actor-identifying column, not actor_id (see DATABASE_COMPATIBILITY_BLOCKERS.md
-- and DATABASE_IMPLEMENTATION_REPORT.md). This statement originally targeted
-- actor_id; the intent — ensure the actor FK exists and cascades to SET NULL
-- rather than blocking employee deletion — is preserved here against the
-- column that actually exists.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES employees(id) ON DELETE SET NULL;

-- kpi_history (employee_id, changed_by)
ALTER TABLE kpi_history DROP CONSTRAINT IF EXISTS kpi_history_employee_id_fkey;
ALTER TABLE kpi_history ADD CONSTRAINT kpi_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

ALTER TABLE kpi_history DROP CONSTRAINT IF EXISTS kpi_history_changed_by_fkey;
ALTER TABLE kpi_history ADD CONSTRAINT kpi_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES employees(id) ON DELETE SET NULL;

-- kpi_metrics (entered_by)
ALTER TABLE kpi_metrics DROP CONSTRAINT IF EXISTS kpi_metrics_entered_by_fkey;
ALTER TABLE kpi_metrics ADD CONSTRAINT kpi_metrics_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES employees(id) ON DELETE SET NULL;

-- lms_announcements (created_by)
ALTER TABLE lms_announcements DROP CONSTRAINT IF EXISTS lms_announcements_created_by_fkey;
ALTER TABLE lms_announcements ADD CONSTRAINT lms_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL;

-- lms_employee_badges (awarded_by)
ALTER TABLE lms_employee_badges DROP CONSTRAINT IF EXISTS lms_employee_badges_awarded_by_fkey;
ALTER TABLE lms_employee_badges ADD CONSTRAINT lms_employee_badges_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES employees(id) ON DELETE SET NULL;

-- attendance_settings (updated_by)
ALTER TABLE attendance_settings DROP CONSTRAINT IF EXISTS attendance_settings_updated_by_fkey;
ALTER TABLE attendance_settings ADD CONSTRAINT attendance_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL;

-- calendar_events (created_by)
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL;

-- sales_records (entered_by)
ALTER TABLE sales_records DROP CONSTRAINT IF EXISTS sales_records_entered_by_fkey;
ALTER TABLE sales_records ADD CONSTRAINT sales_records_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES employees(id) ON DELETE SET NULL;

-- incentive_grants (awarded_by)
ALTER TABLE incentive_grants DROP CONSTRAINT IF EXISTS incentive_grants_awarded_by_fkey;
ALTER TABLE incentive_grants ADD CONSTRAINT incentive_grants_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES employees(id) ON DELETE SET NULL;

-- payslips (generated_by, approved_by)
ALTER TABLE payslips DROP CONSTRAINT IF EXISTS payslips_generated_by_fkey;
ALTER TABLE payslips ADD CONSTRAINT payslips_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE payslips DROP CONSTRAINT IF EXISTS payslips_approved_by_fkey;
ALTER TABLE payslips ADD CONSTRAINT payslips_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL;
