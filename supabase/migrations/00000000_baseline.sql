-- =====================================================================
-- 00000000_baseline.sql — RECONSTRUCTED from local repository evidence.
-- No production database was accessed to produce this file.
-- See DATABASE_RECONSTRUCTION_PLAN.md and DATABASE_COMPATIBILITY_BLOCKERS.md
-- for full source citations and the reasoning behind every decision below.
--
-- Scope: represents the schema state as of historical file
-- src/supabase/migrations/098 — NOT file 118. Files 099-118 are excluded
-- because they are content-identical ports of what already exists as real
-- files in this same supabase/migrations/ folder (20260624000000 onward).
-- Including them here would cause "relation already exists" when those
-- files run. See DATABASE_RECONSTRUCTION_PLAN.md §A/§N.6/§R.
--
-- Explicitly excluded (see DATABASE_COMPATIBILITY_BLOCKERS.md):
--   - wallets, wallet_transactions  (no live application dependency found)
--   - departments                   (no live application dependency found;
--                                    the real department model is
--                                    teams.type='department' + the plain
--                                    text employees.department/teams.department)
--   - audit_logs.actor_id           (application writes user_id; the three
--                                    actor_id-only routes were fixed in
--                                    application code instead of the schema)
--
-- Resolved conflicts applied here:
--   - workspace_shares uses access_level (not permission) — see
--     WORKSPACE_SHARES_MIGRATION.md. Shape follows
--     src/supabase/migrations/060_workspace_sharing_consolidated.sql.
--   - user_role enum created directly at its file-098 terminal value set
--     (086_final_role_consolidation.sql's result), not replayed through
--     the churn of 068/077/084/085/086.
--
-- New table not found as a CREATE TABLE anywhere, reconstructed from
-- confirmed, repeated application-code usage (src/app/admin/shifts/page.tsx,
-- src/components/users/AddPersonnelDialog.tsx) because employees.shift_id
-- and 098_add_matrix_role.sql's conditional FK both require it to exist:
--   - shifts
-- Same treatment for system_holidays and attendance_protocols (referenced
-- by RLS/app code, never CREATE TABLE'd) — reconstructed from app evidence.
-- =====================================================================

-- =====================================================================
-- SECTION 1: Extensions
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- SECTION 2: Enums (final value sets as of historical file 098)
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'dept_lead', 'team_lead', 'employee', 'intern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'internship', 'target_based');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE salary_type AS ENUM ('fixed_monthly', 'hourly', 'daily', 'stipend');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- SECTION 3: Core identity
-- Source: src/supabase/schema.sql (origin) + 001,045,047,077,087,092,098
-- + standalone leave_entitlement_patch.sql, shift_management_patch.sql
-- =====================================================================

-- shifts: reconstructed from app-code evidence (src/app/admin/shifts/page.tsx,
-- src/components/users/AddPersonnelDialog.tsx). Required because
-- shift_management_patch.sql adds employees.shift_id REFERENCES shifts(id).
CREATE TABLE IF NOT EXISTS public.shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  color_code  TEXT,
  valid_from  DATE,
  valid_to    DATE,
  department  TEXT,
  team_id     UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  employee_id TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  department TEXT,
  designation TEXT,
  team_id UUID,
  joining_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- 001_employee_salary_updates.sql
  employment_type employment_type NOT NULL DEFAULT 'full_time',
  salary_structure salary_type NOT NULL DEFAULT 'fixed_monthly',
  base_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- 045_add_kpi_to_employees.sql
  current_kpi_score NUMERIC(5,2) DEFAULT 0,
  current_kra_score NUMERIC(5,2) DEFAULT 0,
  current_behavioral_score NUMERIC(5,2) DEFAULT 0,
  current_final_score NUMERIC(5,2) DEFAULT 0,
  current_rating TEXT DEFAULT 'Meets',
  ytd_average NUMERIC(5,2) DEFAULT 0,
  performance_trend TEXT DEFAULT 'stable' CHECK (performance_trend IN ('improving','stable','declining')),
  last_kpi_update TIMESTAMPTZ,
  -- 047_salary_ranges_and_kpi_linkage.sql
  salary_min NUMERIC(10,2),
  salary_max NUMERIC(10,2),
  salary_step NUMERIC(10,2),
  hourly_rate NUMERIC(8,2),
  daily_rate NUMERIC(8,2),
  stipend_amount NUMERIC(10,2),
  kpi_weight NUMERIC(3,1) DEFAULT 40,
  kra_weight NUMERIC(3,1) DEFAULT 40,
  behavioral_weight NUMERIC(3,1) DEFAULT 20,
  kpi_enabled BOOLEAN DEFAULT true,
  enable_salary_linkage BOOLEAN DEFAULT false,
  -- leave_entitlement_patch.sql
  monthly_leave_quota NUMERIC DEFAULT 1.5,
  leave_balance NUMERIC DEFAULT 0,
  -- shift_management_patch.sql
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  -- 087_zoho_integration_full.sql
  zoho_email TEXT UNIQUE,
  zoho_user_id TEXT,
  zoho_account_id TEXT,
  zoho_refresh_token TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','offboarding','disabled')),
  offboarded_at TIMESTAMPTZ,
  offboard_reason TEXT,
  personal_email TEXT,
  -- 092_sales_salary_slabs.sql
  commission_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  monthly_sales_target NUMERIC(15,2),
  salary_slab_id UUID, -- FK added after salary_slabs is created (Section 9)
  -- 098_add_matrix_role.sql
  matrix_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_kpi_weights_sum CHECK (kpi_weight + kra_weight + behavioral_weight = 100)
);

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department TEXT,
  description TEXT,
  -- 096 introduces type/parent_id/head_designation/is_active on top of the
  -- earlier 046 formalization; 096's own seed data (the real org chart) is
  -- explicitly EXCLUDED per DATABASE_RECONSTRUCTION_PLAN.md §P (org-specific).
  type TEXT NOT NULL DEFAULT 'team' CHECK (type IN ('company','department','team')),
  parent_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  head_designation TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  lead_id UUID, -- FK added after employees exists (app-code evidence only, see §K)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS fk_employees_team;
ALTER TABLE public.employees ADD CONSTRAINT fk_employees_team FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS fk_teams_lead;
ALTER TABLE public.teams ADD CONSTRAINT fk_teams_lead FOREIGN KEY (lead_id) REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_commission ON public.employees (commission_enabled) WHERE commission_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_teams_parent ON public.teams (parent_id);
CREATE INDEX IF NOT EXISTS idx_teams_type ON public.teams (type);

-- attendance_protocols: reconstructed from app-code evidence only
-- (src/app/admin/attendance/page.tsx, GlobalAttendanceWidget.tsx)
CREATE TABLE IF NOT EXISTS public.attendance_protocols (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  check_in_time  TIME,
  check_out_time TIME,
  target_type    TEXT,
  type           TEXT,
  days           TEXT[],
  effective_from DATE,
  status         TEXT DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- system_holidays: reconstructed from app-code evidence only
-- (src/app/admin/attendance/page.tsx, src/app/dashboard/attendance/page.tsx)
CREATE TABLE IF NOT EXISTS public.system_holidays (
  date          DATE PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  type          TEXT,
  color         TEXT,
  is_half_day   BOOLEAN NOT NULL DEFAULT false,
  start_time    TIME,
  end_time      TIME
);

-- onboarding_checklists: CRITICAL GAP FOUND AND FIXED — this table was
-- referenced by an INSERT in 20260609153800_seed_default_checklist.sql
-- but never CREATE TABLE'd anywhere in this baseline or the 44 canonical
-- files (see FINAL_STATIC_POSTGRES_AUDIT.md CRITICAL finding #1). Schema
-- below is NOT inferred from the INSERT alone — it is the exact,
-- pre-existing CREATE TABLE definition found in src/supabase/lms_schema.sql
-- (a standalone historical schema file), confirmed by repo-wide search to
-- be the only other place this table is defined. No application code
-- anywhere references this table (.from("onboarding_checklists") — zero
-- matches in src/app or src/lib) — it is seed-data-only in the current app.
CREATE TABLE IF NOT EXISTS public.onboarding_checklists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    role_target user_role, -- optional: target specific roles (src/supabase/lms_schema.sql:52)
    steps       JSONB NOT NULL, -- array of {id, title, description, required}
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- user_onboarding: SECOND CRITICAL GAP, found while investigating the first
-- one — supabase/migrations/20260609153500_add_user_onboarding_rls.sql
-- enables RLS and creates 6 policies against this table, but it was never
-- CREATE TABLE'd anywhere (see FINAL_STATIC_POSTGRES_AUDIT.md). Schema below
-- is copied verbatim from the same evidenced source as onboarding_checklists
-- above, src/supabase/lms_schema.sql:58-68, not inferred from the RLS file
-- alone. Cross-checked against every application-code reference
-- (src/app/api/auth/{login,onboard-complete}/route.ts,
-- src/app/api/users/[id]/route.ts): all columns the app actually reads or
-- writes (user_id, status, completed_at, nda_signed_at, completed_steps)
-- are present here unchanged; nothing was simplified or added beyond this
-- evidence.
CREATE TABLE IF NOT EXISTS public.user_onboarding (
    user_id         UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    checklist_id    UUID REFERENCES public.onboarding_checklists(id) ON DELETE CASCADE,
    completed_steps JSONB DEFAULT '[]',
    nda_signed_at   TIMESTAMPTZ,
    nda_url         TEXT,
    status          TEXT CHECK (status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    PRIMARY KEY (user_id, checklist_id)
);

-- =====================================================================
-- SECTION 4: Attendance & leave, and the remaining schema.sql-origin
-- tables (kpi_scores, incentives, payroll_runs, system_config).
-- Source: src/supabase/schema.sql (origin) + standalone attendance
-- patches + 083_attendance_settings.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clock_in TIME,
  clock_out TIME,
  status TEXT NOT NULL CHECK (status IN ('present','absent','late','half_day','on_duty','leave','holiday')),
  -- attendance_audit_patch.sql
  modified_by UUID REFERENCES public.employees(id),
  modified_at TIMESTAMPTZ,
  modification_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PTO','Sick','Unpaid','Weekly Off','Request','Comp Off','On Duty','Maternity','Paternity')),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  start_date DATE,
  end_date DATE,
  days INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (LOWER(status) IN ('pending','approved','rejected')),
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  -- 082_leave_request_support_link.sql
  support_ticket_id UUID, -- FK added in Section 14 once support_tickets exists
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kpi_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  kra_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  kpi_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  behavioral_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  final_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.incentives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  fixed_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  variable_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','claimable','held','claimed')),
  vesting_start DATE NOT NULL,
  vesting_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  base_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
  incentive_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_pay NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','processed','paid')),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- system_config: org-specific defaults (company_name/founder_name from the
-- standalone enterprise_org_patch.sql/org_structure_update.sql) are
-- deliberately NOT reproduced — left blank per DATABASE_RECONSTRUCTION_PLAN.md §P.
CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue NUMERIC(20,2) NOT NULL DEFAULT 0,
  profit_percentage INTEGER NOT NULL DEFAULT 85,
  expense_percentage INTEGER NOT NULL DEFAULT 15,
  company_stage TEXT NOT NULL DEFAULT 'Early Growth',
  vesting_days INTEGER NOT NULL DEFAULT 30,
  bonus_percentage_1m INTEGER NOT NULL DEFAULT 5,
  bonus_percentage_2m INTEGER NOT NULL DEFAULT 10,
  claim_limit INTEGER NOT NULL DEFAULT 25,
  payout_pool_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  payout_capacity TEXT NOT NULL DEFAULT 'HIGH' CHECK (payout_capacity IN ('HIGH','MODERATE','LOW')),
  -- 048_add_consultant_agreement.sql / 050_onboarding_ai_analysis.sql
  consultant_agreement_url TEXT,
  consultant_agreement_text TEXT,
  -- standalone enterprise_org_patch.sql / org_structure_update.sql — defaults
  -- intentionally left blank, NOT the org-specific originals (see header note)
  company_name TEXT DEFAULT '',
  founder_name TEXT DEFAULT '',
  founder_designation TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- attendance_settings: created 083, singleton (id=1)
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id SERIAL PRIMARY KEY,
  holiday_is_paid_leave BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES public.employees(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
  IF (NEW IS NULL) THEN RETURN NULL; END IF;
  BEGIN
    NEW.updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_employees_at ON public.employees;
CREATE TRIGGER tr_update_employees_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
DROP TRIGGER IF EXISTS tr_update_config_at ON public.system_config;
CREATE TRIGGER tr_update_config_at BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
DROP TRIGGER IF EXISTS tr_update_teams_at ON public.teams;
CREATE TRIGGER tr_update_teams_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- =====================================================================
-- SECTION 5: Recruitment / ATS
-- Source: 049_recruitment_system_restoration.sql, 050_recruitment_interview_system.sql,
-- 050_onboarding_ai_analysis.sql, 062_neural_interview_v2.sql, 073_ats_progress_tracking.sql
-- Note: 050_seed_recruitment_clusters.sql's 20 seeded job clusters are NOT
-- replayed here — treated as example/reference data requiring review per
-- DATABASE_RECONSTRUCTION_PLAN.md §M, not blindly copied.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.job_clusters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cluster_id TEXT UNIQUE NOT NULL DEFAULT ('CLUS-' || upper(substring(gen_random_uuid()::text,1,8))),
  company TEXT NOT NULL,
  job_title_variants TEXT[] NOT NULL,
  mandatory_skills JSONB NOT NULL,
  preferred_skills JSONB,
  domain_knowledge JSONB NOT NULL,
  experience_requirements JSONB NOT NULL,
  education JSONB,
  match_weights JSONB NOT NULL,
  gemma_keywords TEXT[] NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clusters_active ON public.job_clusters (active);
CREATE INDEX IF NOT EXISTS idx_clusters_company ON public.job_clusters (company);

CREATE TABLE IF NOT EXISTS public.applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id TEXT UNIQUE NOT NULL DEFAULT ('APP-' || upper(substring(gen_random_uuid()::text,1,8))),
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT,
  applicant_dob DATE,
  applicant_location TEXT,
  applied_cluster_id TEXT NOT NULL REFERENCES public.job_clusters(cluster_id),
  resume_file_path TEXT,
  resume_file_size INT,
  raw_resume_text TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','completed','failed')),
  processing_error TEXT,
  processing_progress INT DEFAULT 0,
  processing_step TEXT,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resume_uploaded_at TIMESTAMPTZ,
  ocr_completed_at TIMESTAMPTZ,
  gemma_analysis_started_at TIMESTAMPTZ,
  gemma_analysis_completed_at TIMESTAMPTZ,
  talent_analysis_ready_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_apps_status ON public.applications (processing_status);
CREATE INDEX IF NOT EXISTS idx_apps_cluster ON public.applications (applied_cluster_id);
CREATE INDEX IF NOT EXISTS idx_apps_created ON public.applications (created_at DESC);

CREATE TABLE IF NOT EXISTS public.talent_analysis (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES public.applications(application_id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES public.job_clusters(cluster_id),
  resume_profile JSONB NOT NULL,
  scoring JSONB NOT NULL,
  multi_cluster_fit JSONB,
  gap_analysis JSONB,
  recommendations JSONB,
  interview_questions JSONB,
  gemma_raw_response JSONB,
  gemma_processing_time_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_talent_app ON public.talent_analysis (application_id);
CREATE INDEX IF NOT EXISTS idx_talent_cluster ON public.talent_analysis (cluster_id);

CREATE TABLE IF NOT EXISTS public.onboarding_analysis_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  analyzed_text TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.onboarding_analysis_queue REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS public.interviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interview_id TEXT UNIQUE NOT NULL DEFAULT ('INT-' || upper(substring(gen_random_uuid()::text,1,8))),
  application_id TEXT NOT NULL REFERENCES public.applications(application_id) ON DELETE CASCADE,
  meeting_link TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 062_neural_interview_v2.sql
  interviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  interview_type TEXT DEFAULT 'technical',
  unique_access_token TEXT UNIQUE DEFAULT ('ni_' || replace(gen_random_uuid()::text,'-','')),
  recording_url TEXT,
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  interviewer_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_interviews_app ON public.interviews (application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON public.interviews (status);
CREATE INDEX IF NOT EXISTS idx_interviews_interviewer ON public.interviews (interviewer_id);

CREATE TABLE IF NOT EXISTS public.interview_permissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interview_id BIGINT REFERENCES public.interviews(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_type TEXT NOT NULL,
  is_granted BOOLEAN DEFAULT FALSE,
  granted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_interview_permissions_interview ON public.interview_permissions (interview_id);

CREATE TABLE IF NOT EXISTS public.interview_availability (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interviewer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interview_availability_interviewer ON public.interview_availability (interviewer_id);

-- =====================================================================
-- SECTION 6: Finance
-- Source: 003,004,006,007,009,011,012,013,014,015,016,017 (both 017 files)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  lead_name TEXT,
  email TEXT,
  value NUMERIC(20,2) DEFAULT 0,
  emp_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  from_pipeline BOOLEAN DEFAULT false,
  company TEXT,
  company_name TEXT,
  contact_person TEXT,
  lead_phone TEXT,
  status TEXT DEFAULT 'Active',
  tier TEXT DEFAULT 'Standard',
  converted_at TIMESTAMPTZ,
  gstin TEXT,
  pan TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  pan TEXT, address TEXT, city TEXT, state TEXT, pincode TEXT, phone TEXT, email TEXT,
  logo_url TEXT, bank_name TEXT, bank_account TEXT, bank_ifsc TEXT, bank_branch TEXT,
  default_terms TEXT,
  -- 007_invoice_settings.sql
  smtp_host TEXT, smtp_port INTEGER DEFAULT 587, smtp_user TEXT, smtp_pass TEXT,
  smtp_from_name TEXT DEFAULT '', smtp_from_email TEXT, smtp_secure BOOLEAN DEFAULT false,
  invoice_prefix TEXT DEFAULT 'INV', default_due_days INTEGER DEFAULT 30,
  invoice_footer TEXT, auto_numbering BOOLEAN DEFAULT true, show_logo BOOLEAN DEFAULT true,
  default_gst_rate NUMERIC(5,2) DEFAULT 18, default_place_of_supply TEXT,
  require_approval BOOLEAN DEFAULT false, send_on_create BOOLEAN DEFAULT false,
  can_create_roles TEXT[] DEFAULT ARRAY['admin'],
  can_send_roles TEXT[] DEFAULT ARRAY['admin'],
  can_mark_paid_roles TEXT[] DEFAULT ARRAY['admin'],
  can_delete_roles TEXT[] DEFAULT ARRAY['admin'],
  can_edit_roles TEXT[] DEFAULT ARRAY['admin'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT, email TEXT, phone TEXT,
  category TEXT DEFAULT 'General',
  total_paid NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS purchase_number_seq;
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number TEXT NOT NULL UNIQUE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  amount NUMERIC(15,2) DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  invoice_id UUID,
  notes TEXT,
  -- 014_purchase_logs.sql
  filed_by_emp_id TEXT, filed_by_name TEXT, filed_by_dept TEXT, filed_by_desig TEXT,
  filed_by_uuid UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  -- 020_budget_full_linking.sql
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS sub_number_seq;
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider TEXT,
  category TEXT DEFAULT 'Software',
  logo_url TEXT,
  cost_per_seat NUMERIC(12,2) DEFAULT 0,
  total_seats INT DEFAULT 1,
  billing_cycle TEXT DEFAULT 'Monthly' CHECK (billing_cycle IN ('Monthly','Annual','Quarterly','One-time')),
  currency TEXT DEFAULT 'INR',
  renewal_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','expiring','inactive','cancelled','trial')),
  notes TEXT, website_url TEXT,
  -- 017_subscription_logs.sql
  filed_by_emp_id TEXT, filed_by_name TEXT, filed_by_dept TEXT, filed_by_desig TEXT,
  filed_by_uuid UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscription_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('department','team','employee')),
  department_name TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  seats_allocated INT DEFAULT 1,
  access_email TEXT, access_login TEXT, access_note TEXT,
  credentials_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ, sent_by_emp_id TEXT, sent_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS budget_number_seq;
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  scope_type TEXT DEFAULT 'department' CHECK (scope_type IN ('department','team','company')),
  department_name TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  fiscal_year INT DEFAULT EXTRACT(YEAR FROM NOW()),
  fiscal_month INT CHECK (fiscal_month BETWEEN 1 AND 12),
  total_amount NUMERIC(15,2) DEFAULT 0,
  category TEXT DEFAULT 'General',
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','closed','draft')),
  created_by_name TEXT, created_by_emp_id TEXT,
  -- 017_budgets_realtime.sql
  purchase_spent NUMERIC(15,2) DEFAULT 0,
  sub_spent NUMERIC(15,2) DEFAULT 0,
  actual_spent NUMERIC(15,2) GENERATED ALWAYS AS (purchase_spent + sub_spent) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS fk_purchases_invoice;
-- (invoice_id FK added after invoices table is created, below)

CREATE TABLE IF NOT EXISTS public.budget_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  label TEXT,
  allocated NUMERIC(15,2) DEFAULT 0,
  linked_sub_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  alert_type TEXT CHECK (alert_type IN ('over_budget','near_limit','allocation_rejected')),
  message TEXT NOT NULL,
  spent NUMERIC(15,2), total NUMERIC(15,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  -- Base columns: MISSING LOCAL EVIDENCE at SQL level (no CREATE TABLE found
  -- in either trail — see DATABASE_RECONSTRUCTION_PLAN.md §K). Reconstructed
  -- from consistent application-code usage across src/app/api/invoices/**.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax NUMERIC(15,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  due_date DATE,
  type TEXT DEFAULT 'receivable' CHECK (type IN ('receivable','payable')),
  notes TEXT,
  -- 006_invoices_enhanced.sql
  project_id UUID, -- FK added in Section 7 once projects exists
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  issued_date DATE,
  cgst NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst NUMERIC(15,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  billing_address TEXT, client_gstin TEXT, client_email TEXT, terms TEXT,
  bank_details TEXT, place_of_supply TEXT,
  -- 008_invoice_log.sql
  created_by_emp_id TEXT, created_by_name TEXT, created_by_dept TEXT,
  created_by_team TEXT, created_by_desig TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS fk_purchases_invoice;
ALTER TABLE public.purchases ADD CONSTRAINT fk_purchases_invoice FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn_sac TEXT,
  quantity NUMERIC(10,2) DEFAULT 1,
  rate NUMERIC(15,2) DEFAULT 0,
  gst_rate NUMERIC(5,2) DEFAULT 18,
  amount NUMERIC(15,2) DEFAULT 0, cgst_amount NUMERIC(15,2) DEFAULT 0,
  sgst_amount NUMERIC(15,2) DEFAULT 0, igst_amount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Numbering + budget spend-engine functions/triggers (013,015,016,017,020)
CREATE OR REPLACE FUNCTION public.generate_purchase_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.purchase_number IS NULL THEN
    NEW.purchase_number := 'PUR-' || LPAD(nextval('purchase_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS set_purchase_number ON public.purchases;
CREATE TRIGGER set_purchase_number BEFORE INSERT ON public.purchases FOR EACH ROW EXECUTE PROCEDURE public.generate_purchase_number();

CREATE OR REPLACE FUNCTION public.generate_sub_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sub_number IS NULL THEN
    NEW.sub_number := 'SUB-' || LPAD(nextval('sub_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS set_sub_number ON public.subscriptions;
CREATE TRIGGER set_sub_number BEFORE INSERT ON public.subscriptions FOR EACH ROW EXECUTE PROCEDURE public.generate_sub_number();

CREATE OR REPLACE FUNCTION public.generate_budget_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.budget_number IS NULL THEN
    NEW.budget_number := 'BUD-' || LPAD(nextval('budget_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS set_budget_number ON public.budgets;
CREATE TRIGGER set_budget_number BEFORE INSERT ON public.budgets FOR EACH ROW EXECUTE PROCEDURE public.generate_budget_number();

CREATE OR REPLACE FUNCTION public.recalculate_budget_spent(p_budget_id UUID) RETURNS VOID AS $$
DECLARE v_purchase NUMERIC(15,2); v_sub NUMERIC(15,2); v_reimb NUMERIC(15,2); v_claims NUMERIC(15,2);
DECLARE v_total NUMERIC(15,2); v_spent NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_purchase FROM public.purchases WHERE invoice_id IN (SELECT id FROM public.invoices WHERE id = invoice_id) AND status <> 'cancelled' AND EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = p_budget_id);
  SELECT COALESCE(SUM(ba.allocated),0) INTO v_sub FROM public.budget_allocations ba WHERE ba.budget_id = p_budget_id AND ba.linked_sub_id IS NOT NULL;
  UPDATE public.budgets SET purchase_spent = COALESCE((SELECT SUM(p.amount) FROM public.purchases p WHERE p.team_id = (SELECT team_id FROM public.budgets WHERE id = p_budget_id) AND p.status <> 'cancelled'),0),
    sub_spent = v_sub
  WHERE id = p_budget_id;
  SELECT total_amount, actual_spent INTO v_total, v_spent FROM public.budgets WHERE id = p_budget_id;
  IF v_total > 0 AND v_spent >= v_total THEN
    INSERT INTO public.budget_alerts (budget_id, alert_type, message, spent, total) VALUES (p_budget_id, 'over_budget', 'Budget exceeded', v_spent, v_total);
  ELSIF v_total > 0 AND v_spent >= v_total * 0.9 THEN
    INSERT INTO public.budget_alerts (budget_id, alert_type, message, spent, total) VALUES (p_budget_id, 'near_limit', 'Budget nearing limit', v_spent, v_total);
  END IF;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_purchases_update_budget() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.team_id IS NOT NULL THEN PERFORM public.recalculate_budget_spent(b.id) FROM public.budgets b WHERE b.team_id = OLD.team_id; END IF;
    RETURN OLD;
  END IF;
  IF NEW.team_id IS NOT NULL THEN PERFORM public.recalculate_budget_spent(b.id) FROM public.budgets b WHERE b.team_id = NEW.team_id; END IF;
  IF TG_OP = 'UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id AND OLD.team_id IS NOT NULL THEN
    PERFORM public.recalculate_budget_spent(b.id) FROM public.budgets b WHERE b.team_id = OLD.team_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS purchases_sync_budget ON public.purchases;
CREATE TRIGGER purchases_sync_budget AFTER INSERT OR UPDATE OR DELETE ON public.purchases FOR EACH ROW EXECUTE PROCEDURE public.trg_purchases_update_budget();

CREATE OR REPLACE FUNCTION public.trg_guard_allocation_ceiling() RETURNS TRIGGER AS $$
DECLARE v_total NUMERIC(15,2); v_allocated NUMERIC(15,2);
BEGIN
  SELECT total_amount INTO v_total FROM public.budgets WHERE id = NEW.budget_id;
  SELECT COALESCE(SUM(allocated),0) INTO v_allocated FROM public.budget_allocations WHERE budget_id = NEW.budget_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF v_total IS NOT NULL AND (v_allocated + NEW.allocated) > v_total THEN
    RAISE EXCEPTION 'Allocation total would exceed budget ceiling';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS guard_allocation_ceiling ON public.budget_allocations;
CREATE TRIGGER guard_allocation_ceiling BEFORE INSERT OR UPDATE ON public.budget_allocations FOR EACH ROW EXECUTE PROCEDURE public.trg_guard_allocation_ceiling();

CREATE OR REPLACE FUNCTION public.sync_vendor_total_paid() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    UPDATE public.vendors SET total_paid = COALESCE((SELECT SUM(amount) FROM public.purchases WHERE vendor_id = NEW.vendor_id AND status = 'paid'),0) WHERE id = NEW.vendor_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_vendor_paid ON public.purchases;
CREATE TRIGGER sync_vendor_paid AFTER INSERT OR UPDATE OF status, amount ON public.purchases FOR EACH ROW EXECUTE PROCEDURE public.sync_vendor_total_paid();

CREATE OR REPLACE FUNCTION public.check_subscription_expiry() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.renewal_date IS NOT NULL AND NEW.renewal_date <= (CURRENT_DATE + INTERVAL '30 days') AND NEW.status = 'active' THEN
    NEW.status := 'expiring';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auto_expiry_check ON public.subscriptions;
CREATE TRIGGER auto_expiry_check BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE PROCEDURE public.check_subscription_expiry();

DROP TRIGGER IF EXISTS purchases_updated_at ON public.purchases;
CREATE TRIGGER purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
DROP TRIGGER IF EXISTS budgets_updated_at ON public.budgets;
CREATE TRIGGER budgets_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
DROP TRIGGER IF EXISTS tr_update_config_at2 ON public.company_profile;
CREATE TRIGGER tr_update_config_at2 BEFORE UPDATE ON public.company_profile FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- =====================================================================
-- SECTION 7: Projects & workspace-adjacent org structures
-- Source: 003,005,010,018,019,020,046,052,053,054,055,056,057,061
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  budget NUMERIC(20,2) NOT NULL DEFAULT 0,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  phase TEXT DEFAULT 'SCOPING' CHECK (phase IN ('SCOPING','IMPLEMENTATION','REVIEW','COMPLETED')),
  due_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- 005_analytics_backend.sql
  health_score NUMERIC(5,2) DEFAULT 75,
  actual_spent NUMERIC(20,2) DEFAULT 0,
  -- 010_project_dates.sql
  issued_date DATE,
  -- 020_budget_full_linking.sql
  budget_id UUID REFERENCES public.budgets(id) ON DELETE SET NULL,
  -- 046_teams_and_project_members.sql
  progress NUMERIC(3,0) DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  team_lead_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  -- 052_project_hierarchy_and_workflow.sql
  department_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  -- 053_project_workflow_columns.sql
  started_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  progress_locked BOOLEAN DEFAULT FALSE,
  -- 054_multi_tier_workflow.sql
  manager_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  workflow_status TEXT DEFAULT 'initialized' CHECK (workflow_status IN ('initialized','manager_accepted','delegated','completed')),
  -- 057_delegation_authority.sql
  can_manager_delegate BOOLEAN DEFAULT FALSE,
  can_lead_delegate BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_department_id ON public.projects (department_id);
CREATE INDEX IF NOT EXISTS idx_projects_started_at ON public.projects (started_at);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS fk_invoices_project;
ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.project_teams (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  -- 054_multi_tier_workflow.sql
  lead_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  PRIMARY KEY (project_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'Member',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members (project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_employee_id ON public.project_members (employee_id);

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'TODO' CHECK (status IN ('TODO','IN_PROGRESS','SUBMITTED','REVIEW','REJECTED','COMPLETED')),
  priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  assigned_to UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  due_date DATE,
  -- 046
  order_index INTEGER DEFAULT 0,
  estimated_hours NUMERIC(5,2),
  spent_hours NUMERIC(5,2) DEFAULT 0,
  -- 052
  submission_notes TEXT, submission_url TEXT, review_feedback TEXT,
  reviewer_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  -- 056_hierarchical_delegation.sql
  last_updated_by UUID REFERENCES public.employees(id),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  task_type TEXT DEFAULT 'operational' CHECK (task_type IN ('strategic','operational')),
  parent_task_id UUID REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  -- 061_task_multi_assignees.sql
  assignee_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON public.project_tasks (status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_to ON public.project_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON public.project_tasks (project_id);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.calculate_project_progress() RETURNS TRIGGER AS $$
DECLARE v_project_id UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN v_project_id := OLD.project_id; ELSE v_project_id := NEW.project_id; END IF;
  IF v_project_id IS NOT NULL THEN
    UPDATE public.projects SET progress = (
      SELECT COALESCE(ROUND((COUNT(*) FILTER (WHERE status = 'COMPLETED')::NUMERIC / NULLIF(COUNT(*), 0)) * 100), 0)
      FROM public.project_tasks WHERE project_id = v_project_id
    ) WHERE id = v_project_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_update_project_progress ON public.project_tasks;
CREATE TRIGGER tr_update_project_progress AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks FOR EACH ROW EXECUTE PROCEDURE public.calculate_project_progress();

CREATE OR REPLACE FUNCTION public.update_task_audit() RETURNS TRIGGER AS $$
BEGIN NEW.last_updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_update_task_audit ON public.project_tasks;
CREATE TRIGGER trg_update_task_audit BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE PROCEDURE public.update_task_audit();

DROP TRIGGER IF EXISTS tr_update_projects_at ON public.projects;
CREATE TRIGGER tr_update_projects_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
DROP TRIGGER IF EXISTS tr_update_project_tasks_at ON public.project_tasks;
CREATE TRIGGER tr_update_project_tasks_at BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
DROP TRIGGER IF EXISTS tr_update_project_members_at ON public.project_members;
CREATE TRIGGER tr_update_project_members_at BEFORE UPDATE ON public.project_members FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- =====================================================================
-- SECTION 8: Payroll, KPI, compensation
-- Source: 002,005,020,044,045,047,092,093,094
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  incentive_id UUID REFERENCES public.incentives(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  cycle INT DEFAULT 1,
  queue_position INT DEFAULT 0,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  department_name TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reimbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) DEFAULT 0,
  reason TEXT NOT NULL,
  receipt_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  department_name TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.priority_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) DEFAULT 0,
  urgency VARCHAR(20) DEFAULT 'high',
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  rating NUMERIC(3,1) DEFAULT 3.5 CHECK (rating BETWEEN 1.0 AND 5.0),
  period_month INTEGER CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER,
  rated_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, period_month, period_year)
);

CREATE TABLE IF NOT EXISTS public.company_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount NUMERIC(20,2) DEFAULT 0,
  source TEXT DEFAULT 'operations',
  department TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, year, source)
);

CREATE TABLE IF NOT EXISTS public.company_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount NUMERIC(20,2) DEFAULT 0,
  category TEXT DEFAULT 'operations',
  department TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, year, category)
);

CREATE TABLE IF NOT EXISTS public.salary_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designation TEXT NOT NULL,
  level TEXT NOT NULL,
  min_salary NUMERIC(10,2) NOT NULL,
  max_salary NUMERIC(10,2) NOT NULL,
  step_increment NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (designation, level)
);
CREATE INDEX IF NOT EXISTS idx_salary_brackets_designation ON public.salary_brackets (designation);

CREATE TABLE IF NOT EXISTS public.salary_performance_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  kpi_score NUMERIC(5,2), kra_score NUMERIC(5,2), behavioral_score NUMERIC(5,2), final_performance_score NUMERIC(5,2),
  adjusted_salary NUMERIC(10,2),
  salary_increase_percent NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salary_performance_mapping_employee_id ON public.salary_performance_mapping (employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_performance_mapping_effective_date ON public.salary_performance_mapping (effective_date);

CREATE TABLE IF NOT EXISTS public.kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month INTEGER CHECK (month BETWEEN 1 AND 12), year INTEGER,
  kpi_score NUMERIC(5,2) DEFAULT 0 CHECK (kpi_score BETWEEN 0 AND 100),
  kpi_entries JSONB DEFAULT '[]'::jsonb,
  kra_score NUMERIC(5,2) DEFAULT 0 CHECK (kra_score BETWEEN 0 AND 100),
  kra_metrics JSONB DEFAULT '{"ownership":0,"quality":0,"initiative":0}'::jsonb,
  behavioral_score NUMERIC(5,2) DEFAULT 0 CHECK (behavioral_score BETWEEN 0 AND 100),
  behavioral_metrics JSONB DEFAULT '{"attendance":0,"discipline":0,"communication":0}'::jsonb,
  final_score NUMERIC(5,2) DEFAULT 0 CHECK (final_score BETWEEN 0 AND 100),
  rating_label TEXT DEFAULT 'Meets' CHECK (rating_label IN ('Outstanding','Exceeds','Meets','Needs Improvement','Poor')),
  remarks TEXT, incentive_hint NUMERIC(10,2),
  entered_by UUID REFERENCES public.employees(id),
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_employee ON public.kpi_metrics (employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_period ON public.kpi_metrics (year, month);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_employee_period ON public.kpi_metrics (employee_id, year, month);

CREATE TABLE IF NOT EXISTS public.kpi_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES public.kpi_metrics(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  prev_kpi_score NUMERIC(5,2), prev_kra_score NUMERIC(5,2), prev_behavioral_score NUMERIC(5,2), prev_final_score NUMERIC(5,2),
  new_kpi_score NUMERIC(5,2), new_kra_score NUMERIC(5,2), new_behavioral_score NUMERIC(5,2), new_final_score NUMERIC(5,2),
  changed_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  change_reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kpi_history_kpi ON public.kpi_history (kpi_id);

CREATE TABLE IF NOT EXISTS public.kpi_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  current_month INTEGER, current_year INTEGER,
  current_score NUMERIC(5,2), current_rating TEXT,
  avg_3month NUMERIC(5,2), avg_6month NUMERIC(5,2), ytd_average NUMERIC(5,2),
  trend TEXT CHECK (trend IN ('improving','stable','declining')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id)
);
CREATE INDEX IF NOT EXISTS idx_kpi_summary_employee ON public.kpi_summary (employee_id);

CREATE TABLE IF NOT EXISTS public.salary_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_target NUMERIC(15,2) DEFAULT 0,
  max_target NUMERIC(15,2),
  commission_percent NUMERIC(5,2) NOT NULL CHECK (commission_percent > 0),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salary_slabs_active ON public.salary_slabs (is_active, sort_order);

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_salary_slab_id_fkey;
ALTER TABLE public.employees ADD CONSTRAINT employees_salary_slab_id_fkey FOREIGN KEY (salary_slab_id) REFERENCES public.salary_slabs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.sales_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month INT CHECK (month BETWEEN 1 AND 12), year INT CHECK (year >= 2020),
  amount_achieved NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  entered_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_sales_records_employee ON public.sales_records (employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_sales_records_period ON public.sales_records (year, month);

CREATE TABLE IF NOT EXISTS public.incentive_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month INT CHECK (month BETWEEN 1 AND 12), year INT,
  fixed_amount NUMERIC(15,2) DEFAULT 0, variable_amount NUMERIC(15,2) DEFAULT 0,
  employee_multiplier NUMERIC(5,2) DEFAULT 1.0, company_multiplier NUMERIC(5,2) DEFAULT 1.0,
  amount NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'locked' CHECK (status IN ('locked','claimable','paid')),
  notes TEXT,
  awarded_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  vested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_incentive_grants_employee ON public.incentive_grants (employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_incentive_grants_status ON public.incentive_grants (status);
CREATE INDEX IF NOT EXISTS idx_incentive_grants_period ON public.incentive_grants (year, month);

CREATE TABLE IF NOT EXISTS public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month INT, year INT,
  base_salary NUMERIC(15,2) DEFAULT 0, hra NUMERIC(15,2) DEFAULT 0, special_allowance NUMERIC(15,2) DEFAULT 0,
  incentive_amount NUMERIC(15,2) DEFAULT 0, sales_commission NUMERIC(15,2) DEFAULT 0, other_earnings NUMERIC(15,2) DEFAULT 0,
  gross_pay NUMERIC(15,2) DEFAULT 0,
  pf_deduction NUMERIC(15,2) DEFAULT 0, professional_tax NUMERIC(15,2) DEFAULT 0, tds_deduction NUMERIC(15,2) DEFAULT 0,
  other_deductions NUMERIC(15,2) DEFAULT 0, total_deductions NUMERIC(15,2) DEFAULT 0,
  net_pay NUMERIC(15,2) DEFAULT 0,
  incentive_grant_ref UUID REFERENCES public.incentive_grants(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','approved','released')),
  generated_by UUID REFERENCES public.employees(id), approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ, released_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON public.payslips (employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON public.payslips (status);
CREATE INDEX IF NOT EXISTS idx_payslips_period ON public.payslips (year, month);

-- KPI functions/triggers (044,045)
CREATE OR REPLACE FUNCTION public.update_kpi_summary() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.kpi_summary (employee_id, current_month, current_year, current_score, current_rating, updated_at)
  VALUES (NEW.employee_id, NEW.month, NEW.year, NEW.final_score, NEW.rating_label, NOW())
  ON CONFLICT (employee_id) DO UPDATE SET current_month = NEW.month, current_year = NEW.year, current_score = NEW.final_score, current_rating = NEW.rating_label, updated_at = NOW();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS kpi_summary_trigger ON public.kpi_metrics;
CREATE TRIGGER kpi_summary_trigger AFTER INSERT OR UPDATE ON public.kpi_metrics FOR EACH ROW EXECUTE PROCEDURE public.update_kpi_summary();

CREATE OR REPLACE FUNCTION public.log_kpi_change() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.kpi_history (kpi_id, employee_id, prev_kpi_score, prev_kra_score, prev_behavioral_score, prev_final_score, new_kpi_score, new_kra_score, new_behavioral_score, new_final_score, changed_at)
  VALUES (NEW.id, NEW.employee_id, OLD.kpi_score, OLD.kra_score, OLD.behavioral_score, OLD.final_score, NEW.kpi_score, NEW.kra_score, NEW.behavioral_score, NEW.final_score, NOW());
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS kpi_history_trigger ON public.kpi_metrics;
CREATE TRIGGER kpi_history_trigger AFTER UPDATE ON public.kpi_metrics FOR EACH ROW EXECUTE PROCEDURE public.log_kpi_change();

CREATE OR REPLACE FUNCTION public.sync_employee_kpi() RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.employees SET current_kpi_score = NEW.kpi_score, current_kra_score = NEW.kra_score,
    current_behavioral_score = NEW.behavioral_score, current_final_score = NEW.final_score,
    current_rating = NEW.rating_label, last_kpi_update = NOW()
  WHERE id = NEW.employee_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_employee_kpi_trigger ON public.kpi_metrics;
CREATE TRIGGER sync_employee_kpi_trigger AFTER INSERT OR UPDATE ON public.kpi_metrics FOR EACH ROW EXECUTE PROCEDURE public.sync_employee_kpi();

-- Department/team snapshot on reimbursement/claim creation (020)
CREATE OR REPLACE FUNCTION public.trg_snapshot_employee_dept() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.department_name IS NULL THEN
    SELECT department INTO NEW.department_name FROM public.employees WHERE id = NEW.employee_id;
  END IF;
  IF NEW.team_id IS NULL THEN
    SELECT team_id INTO NEW.team_id FROM public.employees WHERE id = NEW.employee_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS snapshot_dept_reimbursement ON public.reimbursements;
CREATE TRIGGER snapshot_dept_reimbursement BEFORE INSERT ON public.reimbursements FOR EACH ROW EXECUTE PROCEDURE public.trg_snapshot_employee_dept();
DROP TRIGGER IF EXISTS snapshot_dept_claim ON public.claims;
CREATE TRIGGER snapshot_dept_claim BEFORE INSERT ON public.claims FOR EACH ROW EXECUTE PROCEDURE public.trg_snapshot_employee_dept();

CREATE OR REPLACE FUNCTION public.trg_reimbursement_update_budget() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.team_id IS NOT NULL AND NEW.status = 'approved') THEN
    PERFORM public.recalculate_budget_spent(b.id) FROM public.budgets b WHERE b.team_id = NEW.team_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS reimbursements_sync_budget ON public.reimbursements;
CREATE TRIGGER reimbursements_sync_budget AFTER INSERT OR UPDATE ON public.reimbursements FOR EACH ROW EXECUTE PROCEDURE public.trg_reimbursement_update_budget();

CREATE OR REPLACE FUNCTION public.trg_claims_update_budget() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.team_id IS NOT NULL AND NEW.status = 'approved') THEN
    PERFORM public.recalculate_budget_spent(b.id) FROM public.budgets b WHERE b.team_id = NEW.team_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS claims_sync_budget ON public.claims;
CREATE TRIGGER claims_sync_budget AFTER INSERT OR UPDATE ON public.claims FOR EACH ROW EXECUTE PROCEDURE public.trg_claims_update_budget();

-- =====================================================================
-- SECTION 9: Messaging & meetings
-- Source: 021,022,023,024,025,026,027,028,089,095 (final trigger versions only)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'text' CHECK (type IN ('text','announcement','global')),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  is_global BOOLEAN DEFAULT false,
  -- 024_channel_auto_groups.sql
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('global','team','department','project','other')),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  department_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id),
  UNIQUE (project_id)
);

CREATE TABLE IF NOT EXISTS public.channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  content TEXT DEFAULT '',
  file_url TEXT, file_name TEXT, file_type TEXT, file_size BIGINT,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id_created_at ON public.messages (channel_id, created_at);

CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  room_name TEXT NOT NULL UNIQUE,
  host_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','ended','cancelled')),
  type TEXT DEFAULT 'video' CHECK (type IN ('video','audio','screen')),
  max_participants INT DEFAULT 100,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON public.meetings (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings (status);
CREATE INDEX IF NOT EXISTS idx_meetings_channel_id ON public.meetings (channel_id);

CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ, left_at TIMESTAMPTZ,
  role TEXT DEFAULT 'participant' CHECK (role IN ('host','participant')),
  UNIQUE (meeting_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.meeting_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  transcript TEXT, summary TEXT,
  key_topics JSONB DEFAULT '[]'::jsonb, decisions JSONB DEFAULT '[]'::jsonb, action_items JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published')),
  analysis_model TEXT DEFAULT 'claude-3-5-sonnet-20240620',
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id)
);
CREATE INDEX IF NOT EXISTS idx_mom_meeting_id ON public.meeting_minutes (meeting_id);
CREATE INDEX IF NOT EXISTS idx_mom_status ON public.meeting_minutes (status);

CREATE OR REPLACE FUNCTION public.get_unread_count(p_channel_id UUID, p_employee_id UUID) RETURNS INT AS $$
DECLARE v_last_read TIMESTAMPTZ; v_count INT;
BEGIN
  SELECT last_read_at INTO v_last_read FROM public.channel_members WHERE channel_id = p_channel_id AND employee_id = p_employee_id;
  IF v_last_read IS NULL THEN RETURN 0; END IF;
  SELECT COUNT(*) INTO v_count FROM public.messages WHERE channel_id = p_channel_id AND created_at > v_last_read AND sender_id <> p_employee_id;
  RETURN v_count;
END; $$ LANGUAGE plpgsql;

-- Channel auto-membership sync — final version (095), consolidated from
-- the fragmented 021/024/025 predecessors into 026, then updated for the
-- 5-value role model by 089/095. dept_lead is used here (not admin) for
-- the "auto-promote on channel type" checks, matching 095's final logic.
CREATE OR REPLACE FUNCTION public.trg_employee_sync_all_channels() RETURNS TRIGGER AS $$
DECLARE v_team_channel UUID; v_dept_channel UUID; v_global_channel UUID;
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_active = false) THEN
    DELETE FROM public.channel_members WHERE employee_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT id INTO v_global_channel FROM public.channels WHERE is_global = true LIMIT 1;
  IF v_global_channel IS NOT NULL THEN
    INSERT INTO public.channel_members (channel_id, employee_id) VALUES (v_global_channel, NEW.id) ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  IF NEW.team_id IS NOT NULL THEN
    SELECT id INTO v_team_channel FROM public.channels WHERE team_id = NEW.team_id;
    IF v_team_channel IS NOT NULL THEN
      INSERT INTO public.channel_members (channel_id, employee_id) VALUES (v_team_channel, NEW.id) ON CONFLICT (channel_id, employee_id) DO NOTHING;
    END IF;
  END IF;

  IF NEW.department IS NOT NULL THEN
    SELECT id INTO v_dept_channel FROM public.channels WHERE department_name = NEW.department AND category = 'department';
    IF v_dept_channel IS NOT NULL THEN
      INSERT INTO public.channel_members (channel_id, employee_id) VALUES (v_dept_channel, NEW.id) ON CONFLICT (channel_id, employee_id) DO NOTHING;
    END IF;
  END IF;

  IF NEW.role = 'admin' THEN
    INSERT INTO public.channel_members (channel_id, employee_id)
    SELECT id, NEW.id FROM public.channels ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS employee_sync_all_channels ON public.employees;
CREATE TRIGGER employee_sync_all_channels AFTER INSERT OR UPDATE OF team_id, department, is_active, role OR DELETE ON public.employees FOR EACH ROW EXECUTE PROCEDURE public.trg_employee_sync_all_channels();

CREATE OR REPLACE FUNCTION public.trg_team_create_channel() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.channels (name, team_id, category)
  VALUES (NEW.name, NEW.id, 'team')
  ON CONFLICT (team_id) DO UPDATE SET name = NEW.name;
  IF NEW.head_id IS NOT NULL THEN
    INSERT INTO public.channel_members (channel_id, employee_id) SELECT id, NEW.head_id FROM public.channels WHERE team_id = NEW.id ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS team_create_channel ON public.teams;
CREATE TRIGGER team_create_channel AFTER INSERT OR UPDATE OF name ON public.teams FOR EACH ROW EXECUTE PROCEDURE public.trg_team_create_channel();

CREATE OR REPLACE FUNCTION public.trg_channel_add_admins() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.channel_members (channel_id, employee_id)
  SELECT NEW.id, id FROM public.employees WHERE role = 'admin' AND is_active = true
  ON CONFLICT (channel_id, employee_id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS channel_add_admins ON public.channels;
CREATE TRIGGER channel_add_admins AFTER INSERT ON public.channels FOR EACH ROW EXECUTE PROCEDURE public.trg_channel_add_admins();

CREATE OR REPLACE FUNCTION public.trg_project_create_channel() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.channels (name, project_id, category) VALUES (NEW.name, NEW.id, 'project') ON CONFLICT (project_id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS project_create_channel ON public.projects;
CREATE TRIGGER project_create_channel AFTER INSERT ON public.projects FOR EACH ROW EXECUTE PROCEDURE public.trg_project_create_channel();

CREATE OR REPLACE FUNCTION public.trg_project_rename_channel() RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.channels SET name = NEW.name WHERE project_id = NEW.id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS project_rename_channel ON public.projects;
CREATE TRIGGER project_rename_channel AFTER UPDATE OF name ON public.projects FOR EACH ROW EXECUTE PROCEDURE public.trg_project_rename_channel();

CREATE OR REPLACE FUNCTION public.trg_project_add_admins() RETURNS TRIGGER AS $$
BEGIN
  IF to_regclass('public.project_members') IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, employee_id, role)
    SELECT NEW.id, id, 'Admin' FROM public.employees WHERE role = 'admin' AND is_active = true
    ON CONFLICT (project_id, employee_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS project_add_admins ON public.projects;
CREATE TRIGGER project_add_admins AFTER INSERT ON public.projects FOR EACH ROW EXECUTE PROCEDURE public.trg_project_add_admins();

CREATE OR REPLACE FUNCTION public.trg_project_team_sync_channel() RETURNS TRIGGER AS $$
DECLARE v_channel UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT id INTO v_channel FROM public.channels WHERE project_id = OLD.project_id;
    IF v_channel IS NOT NULL THEN
      DELETE FROM public.channel_members WHERE channel_id = v_channel AND employee_id IN (SELECT employee_id FROM public.project_members WHERE project_id = OLD.project_id);
    END IF;
    RETURN OLD;
  END IF;
  SELECT id INTO v_channel FROM public.channels WHERE project_id = NEW.project_id;
  IF v_channel IS NOT NULL THEN
    INSERT INTO public.channel_members (channel_id, employee_id)
    SELECT v_channel, employee_id FROM public.teams t JOIN public.employees e ON e.team_id = t.id WHERE t.id = NEW.team_id
    ON CONFLICT (channel_id, employee_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS project_team_sync_channel ON public.project_teams;
CREATE TRIGGER project_team_sync_channel AFTER INSERT OR DELETE ON public.project_teams FOR EACH ROW EXECUTE PROCEDURE public.trg_project_team_sync_channel();

CREATE OR REPLACE FUNCTION public.notify_project_manager() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.manager_id IS NOT NULL THEN
    INSERT INTO public.system_notifications (user_id, title, message, type, reference_id, reference_type)
    VALUES (NEW.manager_id, 'Project assignment', 'You have been assigned as manager for ' || NEW.name, 'info', NEW.id, 'project');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_project_manager ON public.projects;
CREATE TRIGGER trg_notify_project_manager AFTER INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE PROCEDURE public.notify_project_manager();

CREATE OR REPLACE FUNCTION public.notify_project_lead() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    INSERT INTO public.system_notifications (user_id, title, message, type, reference_id, reference_type)
    VALUES (NEW.lead_id, 'Team assignment', 'Your team has been assigned to a project', 'info', NEW.project_id, 'project');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_project_lead ON public.project_teams;
CREATE TRIGGER trg_notify_project_lead AFTER INSERT OR UPDATE ON public.project_teams FOR EACH ROW EXECUTE PROCEDURE public.notify_project_lead();

CREATE OR REPLACE FUNCTION public.notify_employee_on_task_v2() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.system_notifications (user_id, title, message, type, reference_id, reference_type)
    VALUES (NEW.assigned_to, 'Task update', NEW.title, 'info', NEW.id, 'task');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_employee_on_task ON public.project_tasks;
CREATE TRIGGER trg_notify_employee_on_task AFTER INSERT OR UPDATE ON public.project_tasks FOR EACH ROW EXECUTE PROCEDURE public.notify_employee_on_task_v2();

CREATE OR REPLACE FUNCTION public.notify_lead_on_submission_v2() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'SUBMITTED' AND NEW.reviewer_id IS NOT NULL THEN
    INSERT INTO public.system_notifications (user_id, title, message, type, reference_id, reference_type)
    VALUES (NEW.reviewer_id, 'Task submitted for review', NEW.title, 'info', NEW.id, 'task');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_notify_lead_on_submission ON public.project_tasks;
CREATE TRIGGER trg_notify_lead_on_submission AFTER UPDATE ON public.project_tasks FOR EACH ROW EXECUTE PROCEDURE public.notify_lead_on_submission_v2();

DROP TRIGGER IF EXISTS set_mom_updated_at ON public.meeting_minutes;
CREATE TRIGGER set_mom_updated_at BEFORE UPDATE ON public.meeting_minutes FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- =====================================================================
-- SECTION 10: Workspace suite
-- Source: 059_workspace.sql, 060_workspace_shares.sql (superseded, see below)
--
-- workspace_shares uses access_level per the FINAL project decision
-- (WORKSPACE_SHARES_MIGRATION.md), following the column shape from
-- 060_workspace_sharing_consolidated.sql — the historical variant that
-- matches confirmed live application columns (item_id, item_type,
-- item_title, user_id, message) plus access_level/created_at, NOT the
-- `permission`/`shared_at` shape from 060_workspace_shares.sql, which is
-- NOT used here.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.workspace_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.workspace_folders(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#6B7280',
  icon TEXT DEFAULT '📁',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT DEFAULT 'Untitled Document',
  content TEXT DEFAULT '',
  folder_id UUID REFERENCES public.workspace_folders(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT false, is_template BOOLEAN DEFAULT false,
  icon TEXT DEFAULT '📄', cover_color TEXT, cover_image TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  shared_with JSONB DEFAULT '[]'::jsonb, is_public BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  last_edited_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  last_edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_docs_owner ON public.workspace_documents (owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_docs_project ON public.workspace_documents (project_id);
CREATE INDEX IF NOT EXISTS idx_workspace_docs_status ON public.workspace_documents (status);

CREATE TABLE IF NOT EXISTS public.workspace_spreadsheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT DEFAULT 'Untitled Spreadsheet',
  sheets JSONB DEFAULT '[{"name":"Sheet 1","data":[],"colWidths":[]}]'::jsonb,
  folder_id UUID REFERENCES public.workspace_folders(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT false, is_template BOOLEAN DEFAULT false,
  icon TEXT DEFAULT '📊', cover_color TEXT, cover_image TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  shared_with JSONB DEFAULT '[]'::jsonb, is_public BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  last_edited_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  last_edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_sheets_owner ON public.workspace_spreadsheets (owner_id);

CREATE TABLE IF NOT EXISTS public.workspace_presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT DEFAULT 'Untitled Presentation',
  slides JSONB DEFAULT '[]'::jsonb,
  theme JSONB DEFAULT '{"primary":"#6366f1"}'::jsonb,
  folder_id UUID REFERENCES public.workspace_folders(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT false, is_template BOOLEAN DEFAULT false,
  icon TEXT DEFAULT '📽️', cover_color TEXT, cover_image TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  shared_with JSONB DEFAULT '[]'::jsonb, is_public BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  last_edited_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  last_edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_ppts_owner ON public.workspace_presentations (owner_id);

CREATE TABLE IF NOT EXISTS public.workspace_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT DEFAULT 'Untitled Note',
  content TEXT DEFAULT '',
  folder_id UUID REFERENCES public.workspace_folders(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT false,
  icon TEXT DEFAULT '📝', color TEXT DEFAULT '#ffffff',
  status TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  shared_with JSONB DEFAULT '[]'::jsonb, is_public BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  last_edited_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  last_edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_owner ON public.workspace_notes (owner_id);

CREATE TABLE IF NOT EXISTS public.workspace_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT CHECK (item_type IN ('document','spreadsheet','presentation','note')),
  item_id UUID NOT NULL,
  item_title TEXT,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  action TEXT CHECK (action IN ('created','edited','shared','viewed','archived','deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_item ON public.workspace_activity (item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_emp ON public.workspace_activity (employee_id);

CREATE TABLE IF NOT EXISTS public.workspace_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT CHECK (item_type IN ('document','spreadsheet','presentation','note')),
  item_id UUID NOT NULL,
  item_title TEXT,
  owner_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  access_level TEXT DEFAULT 'view' CHECK (access_level IN ('view','edit','comment')),
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_type, item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_shares_user ON public.workspace_shares (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_shares_item ON public.workspace_shares (item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_workspace_shares_owner ON public.workspace_shares (owner_id);

-- Matches the shape src/app/api/workspace/shares/route.ts expects:
-- share_id, item_id, item_type, access_level, user_id, name, email, role, employee_id
CREATE OR REPLACE VIEW public.workspace_shared_users AS
SELECT
  ws.id AS share_id,
  ws.item_id,
  ws.item_type,
  ws.item_title,
  ws.access_level,
  ws.message,
  ws.created_at AS shared_at,
  ws.user_id,
  e.name,
  e.email,
  e.role,
  e.employee_id
FROM public.workspace_shares ws
JOIN public.employees e ON e.id = ws.user_id;

CREATE OR REPLACE FUNCTION public.workspace_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ws_docs_updated_at ON public.workspace_documents;
CREATE TRIGGER trg_ws_docs_updated_at BEFORE UPDATE ON public.workspace_documents FOR EACH ROW EXECUTE PROCEDURE public.workspace_set_updated_at();
DROP TRIGGER IF EXISTS trg_ws_sheets_updated_at ON public.workspace_spreadsheets;
CREATE TRIGGER trg_ws_sheets_updated_at BEFORE UPDATE ON public.workspace_spreadsheets FOR EACH ROW EXECUTE PROCEDURE public.workspace_set_updated_at();
DROP TRIGGER IF EXISTS trg_ws_ppts_updated_at ON public.workspace_presentations;
CREATE TRIGGER trg_ws_ppts_updated_at BEFORE UPDATE ON public.workspace_presentations FOR EACH ROW EXECUTE PROCEDURE public.workspace_set_updated_at();
DROP TRIGGER IF EXISTS trg_ws_notes_updated_at ON public.workspace_notes;
CREATE TRIGGER trg_ws_notes_updated_at BEFORE UPDATE ON public.workspace_notes FOR EACH ROW EXECUTE PROCEDURE public.workspace_set_updated_at();

-- =====================================================================
-- SECTION 11: LMS
-- Source: 063_namaah_lms_core.sql, 067_lms_extended_schema.sql
-- Note: 064_seed_lms_data.sql's course content is NOT replayed (review
-- required per DATABASE_RECONSTRUCTION_PLAN.md §M before reuse).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lms_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Engineering',
  thumbnail_url TEXT,
  level TEXT CHECK (level IN ('beginner','intermediate','advanced')) DEFAULT 'beginner',
  status TEXT CHECK (status IN ('draft','published','archived')) DEFAULT 'draft',
  -- 067
  instructor_id UUID REFERENCES public.employees(id),
  estimated_hours NUMERIC(4,1) DEFAULT 0,
  tags JSONB DEFAULT '[]'::jsonb,
  cover_color TEXT DEFAULT 'blue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.lms_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES public.lms_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  video_url TEXT,
  duration_minutes INTEGER DEFAULT 0,
  order_index INTEGER NOT NULL,
  lesson_type TEXT CHECK (lesson_type IN ('lesson','quiz','assignment')) DEFAULT 'lesson',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.lms_courses(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  progress_percent INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  UNIQUE (course_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.lms_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.lms_courses(id),
  employee_id UUID REFERENCES public.employees(id),
  certificate_number TEXT UNIQUE NOT NULL,
  issue_date DATE DEFAULT CURRENT_DATE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_learning_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  cover_color TEXT DEFAULT 'violet',
  status TEXT CHECK (status IN ('draft','published','archived')) DEFAULT 'draft',
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_path_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID REFERENCES public.lms_learning_paths(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.lms_courses(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  UNIQUE (path_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.lms_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.lms_lessons(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER DEFAULT 0,
  UNIQUE (lesson_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.lms_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.lms_lessons(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB DEFAULT '[]'::jsonb,
  correct_index INTEGER DEFAULT 0,
  explanation TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.lms_lessons(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  score_percent INTEGER DEFAULT 0,
  answers JSONB DEFAULT '[]'::jsonb,
  passed BOOLEAN DEFAULT FALSE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT CHECK (priority IN ('low','medium','high','critical')) DEFAULT 'low',
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🏆',
  color TEXT DEFAULT 'amber',
  criteria JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lms_employee_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id UUID REFERENCES public.lms_badges(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  awarded_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  UNIQUE (badge_id, employee_id)
);

-- =====================================================================
-- SECTION 12: Mail / Zoho
-- Source: 069_zoho_mail_schema.sql, 087_zoho_integration_full.sql,
-- 098_zoho_domain_config.sql, 104_candidate_doc_source.sql (external_from only)
-- Org-specific defaults (mail_domain, saml/urls tied to the original org)
-- are intentionally left as neutral placeholders, not the originals —
-- see DATABASE_RECONSTRUCTION_PLAN.md §P / WORKSPACE... N/A here.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.zoho_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT, client_secret TEXT,
  access_token TEXT, refresh_token TEXT, token_expiry TIMESTAMPTZ,
  redirect_uri TEXT,
  mail_domain TEXT,
  zoho_accounts_url TEXT NOT NULL DEFAULT 'https://accounts.zoho.in',
  zoho_mail_api_url TEXT NOT NULL DEFAULT 'https://mail.zoho.in/api',
  org_id TEXT, admin_account_id TEXT,
  is_connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  -- 087
  org_domain TEXT, zoid TEXT,
  -- 098_zoho_domain_config.sql
  domain_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.zoho_mail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  zoho_account_id TEXT,
  email_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.zoho_calendar_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT, refresh_token TEXT, token_expiry TIMESTAMPTZ,
  calendar_uid TEXT, is_connected BOOLEAN DEFAULT FALSE,
  client_id TEXT, client_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_event_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  calendar_type TEXT DEFAULT 'personal' CHECK (calendar_type IN ('personal','department','statutory')),
  department TEXT,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  color TEXT DEFAULT '#6366f1',
  attendees JSONB DEFAULT '[]'::jsonb,
  reminder_mins INT DEFAULT 15,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS calendar_events_start_idx ON public.calendar_events (start_time);
CREATE INDEX IF NOT EXISTS calendar_events_type_idx ON public.calendar_events (calendar_type);
CREATE INDEX IF NOT EXISTS calendar_events_dept_idx ON public.calendar_events (department);

CREATE TABLE IF NOT EXISTS public.mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_message_id TEXT UNIQUE NOT NULL,
  zoho_account_id TEXT NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  folder TEXT DEFAULT 'Inbox',
  subject TEXT, from_address TEXT, from_name TEXT,
  to_address TEXT[], cc_address TEXT[],
  preview TEXT, body TEXT,
  received_at TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT false, is_starred BOOLEAN DEFAULT false, has_attachment BOOLEAN DEFAULT false,
  thread_key TEXT,
  ai_category TEXT DEFAULT 'GENERAL', ai_priority INT DEFAULT 3, ai_sentiment TEXT DEFAULT 'NEUTRAL',
  ai_summary TEXT, ai_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_messages_employee ON public.mail_messages (employee_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON public.mail_messages (folder);
CREATE INDEX IF NOT EXISTS idx_mail_messages_received ON public.mail_messages (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_messages_category ON public.mail_messages (ai_category);
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON public.mail_messages (thread_key);
CREATE INDEX IF NOT EXISTS idx_mail_messages_read ON public.mail_messages (is_read);

CREATE TABLE IF NOT EXISTS public.mail_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  to_addresses TEXT[], cc_addresses TEXT[], bcc_addresses TEXT[],
  subject TEXT, body TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  template_id UUID,
  last_saved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_drafts_employee ON public.mail_drafts (employee_id);

CREATE TABLE IF NOT EXISTS public.mail_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  name TEXT NOT NULL, category TEXT DEFAULT 'general',
  subject TEXT NOT NULL, body TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active', usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_templates_category ON public.mail_templates (category);
CREATE INDEX IF NOT EXISTS idx_mail_templates_status ON public.mail_templates (status);

CREATE TABLE IF NOT EXISTS public.mail_file_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_by UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, file_size BIGINT, file_type TEXT,
  storage_path TEXT NOT NULL, storage_url TEXT,
  shared_with UUID[],
  message_id UUID REFERENCES public.mail_messages(id) ON DELETE SET NULL,
  expiry_at TIMESTAMPTZ,
  download_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  -- 104_candidate_doc_source.sql
  external_from TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_file_shares_by ON public.mail_file_shares (shared_by);

CREATE TABLE IF NOT EXISTS public.mail_ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_message_id TEXT UNIQUE NOT NULL,
  category TEXT, sentiment TEXT, summary TEXT, priority INT,
  reply_suggestions JSONB DEFAULT '[]'::jsonb,
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

CREATE TABLE IF NOT EXISTS public.mail_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  delegate_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  scope TEXT DEFAULT 'read',
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delegator_id, delegate_id)
);

CREATE TABLE IF NOT EXISTS public.mail_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  zoho_message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  zoho_account_id TEXT NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT,
  access_type TEXT DEFAULT 'owner' CHECK (access_type IN ('owner','shared_read','shared_send')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, zoho_account_id)
);

-- =====================================================================
-- SECTION 13: Permissions (structural default matrix — not org data)
-- Source: 070_permissions_system.sql. Row seeding for these two tables
-- is handled by the canonical layer (20260609161200 etc.), not here.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  module_key TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  UNIQUE (role, module_key)
);

CREATE TABLE IF NOT EXISTS public.role_assignable_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigner_role TEXT NOT NULL,
  assignable_role TEXT NOT NULL,
  UNIQUE (assigner_role, assignable_role)
);

-- =====================================================================
-- SECTION 14: Support
-- Source: 075_support_ticket_system.sql, 078,079,080
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  target_role TEXT NOT NULL,
  assignee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  priority ticket_priority DEFAULT 'medium',
  status ticket_status DEFAULT 'open',
  resolution_notes TEXT,
  resolved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  -- 078_support_ticket_linking.sql
  linked_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_creator ON public.support_tickets (creator_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON public.support_tickets (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_target ON public.support_tickets (target_role);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public.support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_linked_id ON public.support_tickets (linked_ticket_id);

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS fk_leave_requests_ticket;
ALTER TABLE public.leave_requests ADD CONSTRAINT fk_leave_requests_ticket FOREIGN KEY (support_ticket_id) REFERENCES public.support_tickets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.ticket_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_responses_ticket ON public.ticket_responses (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.support_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  target_role TEXT NOT NULL,
  target_department UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.trg_ticket_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ticket_updated_at ON public.support_tickets;
CREATE TRIGGER ticket_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE PROCEDURE public.trg_ticket_updated_at();

CREATE OR REPLACE FUNCTION public.trg_approve_leave_on_ticket_resolve() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status <> 'resolved' AND NEW.category = 'Leave Extension' THEN
    UPDATE public.leave_requests SET status = 'approved', approved_at = NOW() WHERE support_ticket_id = NEW.id;
  ELSIF NEW.status = 'rejected' AND OLD.status <> 'rejected' AND NEW.category = 'Leave Extension' THEN
    UPDATE public.leave_requests SET status = 'rejected' WHERE support_ticket_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS approve_leave_on_ticket_resolve ON public.support_tickets;
CREATE TRIGGER approve_leave_on_ticket_resolve AFTER UPDATE OF status ON public.support_tickets FOR EACH ROW EXECUTE PROCEDURE public.trg_approve_leave_on_ticket_resolve();

-- =====================================================================
-- SECTION 15: System (audit_logs, system_notifications)
-- Source: 087_zoho_integration_full.sql (audit_logs)
--
-- audit_logs.user_id ONLY, per the FINAL project decision
-- (DATABASE_COMPATIBILITY_BLOCKERS.md). audit_logs.actor_id is
-- deliberately NOT created — the three application routes that wrote it
-- were fixed to write user_id instead (see Phase 2 of this session).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  action TEXT,
  table_name TEXT,
  record_id TEXT,
  target_type TEXT,
  target_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_date_idx ON public.audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  -- 054/055 (055 patches the gap 054's duplicate CREATE TABLE IF NOT EXISTS left)
  reference_id UUID,
  reference_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.system_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.system_notifications (is_read);

-- =====================================================================
-- SECTION 16: Row-Level Security
-- Source: rls.sql (early draft, superseded — see DATABASE_RECONSTRUCTION_PLAN.md
-- §H) + per-table ENABLE/CREATE POLICY statements across the historical
-- trail, reconciled to their FINAL post-088/089/095 state (get_my_role()
-- returns TEXT as of 088_fix_recursive_rls.sql — the terminal version).
--
-- Tables reconstructed purely from app-code evidence with NO RLS evidence
-- anywhere (shifts, attendance_protocols, system_holidays) are left with
-- RLS ENABLED but only an authenticated-read policy — marked REQUIRES
-- REVIEW below rather than inventing a full policy set.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS TEXT AS $$
DECLARE r TEXT;
BEGIN
  SELECT role::text INTO r FROM public.employees WHERE id = auth.uid();
  RETURN COALESCE(r, 'employee');
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employees_admin_all ON public.employees;
CREATE POLICY employees_admin_all ON public.employees FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS employees_select_own ON public.employees;
CREATE POLICY employees_select_own ON public.employees FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS employees_lead_select ON public.employees;
CREATE POLICY employees_lead_select ON public.employees FOR SELECT USING (public.get_my_role() IN ('dept_lead','team_lead'));

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_admin_all ON public.attendance_logs;
CREATE POLICY attendance_admin_all ON public.attendance_logs FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS attendance_self_all ON public.attendance_logs;
CREATE POLICY attendance_self_all ON public.attendance_logs FOR ALL USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_admin_all ON public.leave_requests;
CREATE POLICY leave_admin_all ON public.leave_requests FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS leave_self_all ON public.leave_requests;
CREATE POLICY leave_self_all ON public.leave_requests FOR ALL USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());

ALTER TABLE public.kpi_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kpi_scores_admin_all ON public.kpi_scores;
CREATE POLICY kpi_scores_admin_all ON public.kpi_scores FOR ALL USING (public.get_my_role() IN ('admin','dept_lead')) WITH CHECK (public.get_my_role() IN ('admin','dept_lead'));
DROP POLICY IF EXISTS kpi_scores_self_select ON public.kpi_scores;
CREATE POLICY kpi_scores_self_select ON public.kpi_scores FOR SELECT USING (employee_id = auth.uid());

ALTER TABLE public.incentives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incentives_admin_all ON public.incentives;
CREATE POLICY incentives_admin_all ON public.incentives FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS incentives_self_select ON public.incentives;
CREATE POLICY incentives_self_select ON public.incentives FOR SELECT USING (employee_id = auth.uid());

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_admin_all ON public.payroll_runs;
CREATE POLICY payroll_admin_all ON public.payroll_runs FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS payroll_self_select ON public.payroll_runs;
CREATE POLICY payroll_self_select ON public.payroll_runs FOR SELECT USING (employee_id = auth.uid());

ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reimbursements_admin_all ON public.reimbursements;
CREATE POLICY reimbursements_admin_all ON public.reimbursements FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS reimbursements_self_all ON public.reimbursements;
CREATE POLICY reimbursements_self_all ON public.reimbursements FOR ALL USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());
-- NOTE: no DELETE policy for non-admins anywhere in the historical trail — matches confirmed evidence, not an omission.

ALTER TABLE public.priority_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS priority_admin_all ON public.priority_payouts;
CREATE POLICY priority_admin_all ON public.priority_payouts FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS priority_self_all ON public.priority_payouts;
CREATE POLICY priority_self_all ON public.priority_payouts FOR ALL USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claims_admin_all ON public.claims;
CREATE POLICY claims_admin_all ON public.claims FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');
DROP POLICY IF EXISTS claims_self_all ON public.claims;
CREATE POLICY claims_self_all ON public.claims FOR ALL USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_admin_all ON public.vendors;
CREATE POLICY vendors_admin_all ON public.vendors FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_admin_all ON public.clients;
CREATE POLICY clients_admin_all ON public.clients FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_admin_all ON public.invoices;
CREATE POLICY invoices_admin_all ON public.invoices FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_admin_all ON public.subscriptions;
CREATE POLICY subscriptions_admin_all ON public.subscriptions FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budgets_select_all ON public.budgets;
CREATE POLICY budgets_select_all ON public.budgets FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS budgets_write_admin ON public.budgets;
CREATE POLICY budgets_write_admin ON public.budgets FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','dept_lead'));
DROP POLICY IF EXISTS budgets_update_admin ON public.budgets;
CREATE POLICY budgets_update_admin ON public.budgets FOR UPDATE USING (public.get_my_role() IN ('admin','dept_lead'));
ALTER TABLE public.budget_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_allocations_select_all ON public.budget_allocations;
CREATE POLICY budget_allocations_select_all ON public.budget_allocations FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS budget_allocations_write_admin ON public.budget_allocations;
CREATE POLICY budget_allocations_write_admin ON public.budget_allocations FOR ALL USING (public.get_my_role() IN ('admin','dept_lead')) WITH CHECK (public.get_my_role() IN ('admin','dept_lead'));

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channels_member_read ON public.channels;
CREATE POLICY channels_member_read ON public.channels FOR SELECT USING (
  is_global OR public.get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = channels.id AND cm.employee_id = auth.uid())
);
DROP POLICY IF EXISTS channels_admin_write ON public.channels;
CREATE POLICY channels_admin_write ON public.channels FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_members_self_read ON public.channel_members;
CREATE POLICY channel_members_self_read ON public.channel_members FOR SELECT USING (employee_id = auth.uid() OR public.get_my_role() = 'admin');

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_member_read ON public.messages;
CREATE POLICY messages_member_read ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = messages.channel_id AND cm.employee_id = auth.uid())
);
DROP POLICY IF EXISTS messages_self_insert ON public.messages;
CREATE POLICY messages_self_insert ON public.messages FOR INSERT WITH CHECK (sender_id = auth.uid());
DROP POLICY IF EXISTS messages_self_update ON public.messages;
CREATE POLICY messages_self_update ON public.messages FOR UPDATE USING (sender_id = auth.uid() OR public.get_my_role() = 'admin');
DROP POLICY IF EXISTS messages_self_delete ON public.messages;
CREATE POLICY messages_self_delete ON public.messages FOR DELETE USING (sender_id = auth.uid() OR public.get_my_role() = 'admin');

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meetings_visible ON public.meetings;
CREATE POLICY meetings_visible ON public.meetings FOR SELECT USING (
  host_id = auth.uid() OR public.get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = meetings.id AND mp.employee_id = auth.uid())
);
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
CREATE POLICY meetings_insert ON public.meetings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS meetings_update ON public.meetings;
CREATE POLICY meetings_update ON public.meetings FOR UPDATE USING (host_id = auth.uid() OR public.get_my_role() = 'admin');
DROP POLICY IF EXISTS meetings_delete ON public.meetings;
CREATE POLICY meetings_delete ON public.meetings FOR DELETE USING (host_id = auth.uid() OR public.get_my_role() = 'admin');

ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mom_visible ON public.meeting_minutes;
CREATE POLICY mom_visible ON public.meeting_minutes FOR SELECT USING (
  created_by = auth.uid() OR public.get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_minutes.meeting_id AND (m.host_id = auth.uid() OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = m.id AND mp.employee_id = auth.uid())))
);
DROP POLICY IF EXISTS mom_insert ON public.meeting_minutes;
CREATE POLICY mom_insert ON public.meeting_minutes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS mom_update ON public.meeting_minutes;
CREATE POLICY mom_update ON public.meeting_minutes FOR UPDATE USING (created_by = auth.uid() OR public.get_my_role() = 'admin');

ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_self_select ON public.system_notifications;
CREATE POLICY notifications_self_select ON public.system_notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_self_update ON public.system_notifications;
CREATE POLICY notifications_self_update ON public.system_notifications FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_admin_all ON public.system_notifications;
CREATE POLICY notifications_admin_all ON public.system_notifications FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.kpi_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kpi_metrics_self_select ON public.kpi_metrics;
CREATE POLICY kpi_metrics_self_select ON public.kpi_metrics FOR SELECT USING (employee_id = auth.uid());
DROP POLICY IF EXISTS kpi_metrics_admin_write ON public.kpi_metrics;
CREATE POLICY kpi_metrics_admin_write ON public.kpi_metrics FOR ALL USING (public.get_my_role() IN ('admin','dept_lead')) WITH CHECK (public.get_my_role() IN ('admin','dept_lead'));

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teams_select_all ON public.teams;
CREATE POLICY teams_select_all ON public.teams FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS teams_admin_write ON public.teams;
CREATE POLICY teams_admin_write ON public.teams FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_members_select_all ON public.project_members;
CREATE POLICY project_members_select_all ON public.project_members FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS project_members_admin_write ON public.project_members;
CREATE POLICY project_members_admin_write ON public.project_members FOR ALL USING (public.get_my_role() IN ('admin','dept_lead','team_lead')) WITH CHECK (public.get_my_role() IN ('admin','dept_lead','team_lead'));

ALTER TABLE public.job_clusters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clusters_public_read ON public.job_clusters;
CREATE POLICY clusters_public_read ON public.job_clusters FOR SELECT USING (active = true OR public.get_my_role() = 'admin');
DROP POLICY IF EXISTS clusters_admin_write ON public.job_clusters;
CREATE POLICY clusters_admin_write ON public.job_clusters FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS applications_public_insert ON public.applications;
CREATE POLICY applications_public_insert ON public.applications FOR INSERT WITH CHECK (true); -- public careers form
DROP POLICY IF EXISTS applications_admin_all ON public.applications;
CREATE POLICY applications_admin_all ON public.applications FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.talent_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talent_admin_all ON public.talent_analysis;
CREATE POLICY talent_admin_all ON public.talent_analysis FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interviews_public_read ON public.interviews;
CREATE POLICY interviews_public_read ON public.interviews FOR SELECT USING (true); -- token-gated at the app layer
DROP POLICY IF EXISTS interviews_admin_all ON public.interviews;
CREATE POLICY interviews_admin_all ON public.interviews FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS role_permissions_admin_write ON public.role_permissions;
CREATE POLICY role_permissions_admin_write ON public.role_permissions FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.role_assignable_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_assignable_read ON public.role_assignable_roles;
CREATE POLICY role_assignable_read ON public.role_assignable_roles FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS role_assignable_admin_write ON public.role_assignable_roles;
CREATE POLICY role_assignable_admin_write ON public.role_assignable_roles FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tickets_visible ON public.support_tickets;
CREATE POLICY tickets_visible ON public.support_tickets FOR SELECT USING (creator_id = auth.uid() OR assignee_id = auth.uid() OR public.get_my_role() IN ('admin','dept_lead'));
DROP POLICY IF EXISTS tickets_self_insert ON public.support_tickets;
CREATE POLICY tickets_self_insert ON public.support_tickets FOR INSERT WITH CHECK (creator_id = auth.uid());
DROP POLICY IF EXISTS tickets_update ON public.support_tickets;
CREATE POLICY tickets_update ON public.support_tickets FOR UPDATE USING (creator_id = auth.uid() OR assignee_id = auth.uid() OR public.get_my_role() IN ('admin','dept_lead'));
-- NOTE: no DELETE policy for support_tickets anywhere in the historical trail — matches confirmed evidence.

ALTER TABLE public.ticket_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS responses_visible ON public.ticket_responses;
CREATE POLICY responses_visible ON public.ticket_responses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_responses.ticket_id AND (t.creator_id = auth.uid() OR t.assignee_id = auth.uid() OR public.get_my_role() IN ('admin','dept_lead')))
);
DROP POLICY IF EXISTS responses_self_insert ON public.ticket_responses;
CREATE POLICY responses_self_insert ON public.ticket_responses FOR INSERT WITH CHECK (sender_id = auth.uid());

ALTER TABLE public.support_routing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS routing_public_read ON public.support_routing_rules;
CREATE POLICY routing_public_read ON public.support_routing_rules FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS routing_admin_write ON public.support_routing_rules;
CREATE POLICY routing_admin_write ON public.support_routing_rules FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_settings_read ON public.attendance_settings;
CREATE POLICY attendance_settings_read ON public.attendance_settings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS attendance_settings_admin_write ON public.attendance_settings;
CREATE POLICY attendance_settings_admin_write ON public.attendance_settings FOR ALL USING (public.get_my_role() IN ('admin','dept_lead')) WITH CHECK (public.get_my_role() IN ('admin','dept_lead'));

ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_access_self ON public.account_access;
CREATE POLICY account_access_self ON public.account_access FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS account_access_admin_all ON public.account_access;
CREATE POLICY account_access_admin_all ON public.account_access FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_visible ON public.calendar_events;
CREATE POLICY calendar_visible ON public.calendar_events FOR SELECT USING (
  calendar_type = 'statutory' OR created_by = auth.uid() OR (calendar_type = 'department' AND department = (SELECT department FROM public.employees WHERE id = auth.uid())) OR public.get_my_role() IN ('admin','dept_lead')
);
DROP POLICY IF EXISTS calendar_write ON public.calendar_events;
CREATE POLICY calendar_write ON public.calendar_events FOR INSERT WITH CHECK (created_by = auth.uid() OR public.get_my_role() IN ('admin','dept_lead'));
DROP POLICY IF EXISTS calendar_update ON public.calendar_events;
CREATE POLICY calendar_update ON public.calendar_events FOR UPDATE USING (created_by = auth.uid() OR public.get_my_role() IN ('admin','dept_lead'));
DROP POLICY IF EXISTS calendar_delete ON public.calendar_events;
CREATE POLICY calendar_delete ON public.calendar_events FOR DELETE USING (created_by = auth.uid() OR public.get_my_role() = 'admin');

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_admin_read ON public.audit_logs;
CREATE POLICY audit_admin_read ON public.audit_logs FOR SELECT USING (public.get_my_role() = 'admin');
-- Writes happen exclusively via service-role (middleware.ts, src/lib/audit.ts) — no INSERT policy for other roles, matches confirmed evidence.

ALTER TABLE public.zoho_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zoho_config_service_only ON public.zoho_config;
CREATE POLICY zoho_config_service_only ON public.zoho_config FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.mail_ai_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_ai_cache_service_only ON public.mail_ai_cache;
CREATE POLICY mail_ai_cache_service_only ON public.mail_ai_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_messages_own ON public.mail_messages;
CREATE POLICY mail_messages_own ON public.mail_messages FOR ALL USING (employee_id = auth.uid() OR public.get_my_role() = 'admin') WITH CHECK (employee_id = auth.uid() OR public.get_my_role() = 'admin');
DROP POLICY IF EXISTS mail_messages_service_all ON public.mail_messages;
CREATE POLICY mail_messages_service_all ON public.mail_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.mail_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_drafts_own ON public.mail_drafts;
CREATE POLICY mail_drafts_own ON public.mail_drafts FOR ALL USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());

ALTER TABLE public.mail_delegations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_delegations_own ON public.mail_delegations;
CREATE POLICY mail_delegations_own ON public.mail_delegations FOR ALL USING (delegator_id = auth.uid() OR delegate_id = auth.uid()) WITH CHECK (delegator_id = auth.uid());

ALTER TABLE public.mail_file_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_file_shares_own ON public.mail_file_shares;
CREATE POLICY mail_file_shares_own ON public.mail_file_shares FOR ALL USING (shared_by = auth.uid() OR auth.uid() = ANY(shared_with) OR public.get_my_role() = 'admin') WITH CHECK (shared_by = auth.uid());

ALTER TABLE public.mail_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_templates_read_all ON public.mail_templates;
CREATE POLICY mail_templates_read_all ON public.mail_templates FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS mail_templates_write_admin ON public.mail_templates;
CREATE POLICY mail_templates_write_admin ON public.mail_templates FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','hr'));
DROP POLICY IF EXISTS mail_templates_update_admin ON public.mail_templates;
CREATE POLICY mail_templates_update_admin ON public.mail_templates FOR UPDATE USING (public.get_my_role() IN ('admin','hr'));
-- NOTE: no DELETE policy anywhere in the historical trail — matches confirmed evidence.

ALTER TABLE public.zoho_mail_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zoho_accounts_service_only ON public.zoho_mail_accounts;
CREATE POLICY zoho_accounts_service_only ON public.zoho_mail_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- workspace_* tables — RLS is intentionally fully permissive (USING true)
-- across the whole suite, per explicit code comment in the historical
-- trail: "service role bypasses RLS anyway"; real access control happens
-- in the API route handlers (src/app/api/workspace/**), not in Postgres.
ALTER TABLE public.workspace_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_documents_all ON public.workspace_documents;
CREATE POLICY workspace_documents_all ON public.workspace_documents FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.workspace_spreadsheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_spreadsheets_all ON public.workspace_spreadsheets;
CREATE POLICY workspace_spreadsheets_all ON public.workspace_spreadsheets FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.workspace_presentations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_presentations_all ON public.workspace_presentations;
CREATE POLICY workspace_presentations_all ON public.workspace_presentations FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.workspace_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_notes_all ON public.workspace_notes;
CREATE POLICY workspace_notes_all ON public.workspace_notes FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.workspace_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_folders_all ON public.workspace_folders;
CREATE POLICY workspace_folders_all ON public.workspace_folders FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_activity_all ON public.workspace_activity;
CREATE POLICY workspace_activity_all ON public.workspace_activity FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.workspace_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_shares_all ON public.workspace_shares;
CREATE POLICY workspace_shares_all ON public.workspace_shares FOR ALL USING (true) WITH CHECK (true);

-- lms_* tables — permissive read for all authenticated (066/067 explicitly
-- override 063's stricter draft policies), admin-gated writes.
ALTER TABLE public.lms_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_courses_read ON public.lms_courses;
CREATE POLICY lms_courses_read ON public.lms_courses FOR SELECT USING (true);
DROP POLICY IF EXISTS lms_courses_admin_write ON public.lms_courses;
CREATE POLICY lms_courses_admin_write ON public.lms_courses FOR ALL USING (public.get_my_role() IN ('admin','hr')) WITH CHECK (public.get_my_role() IN ('admin','hr'));
ALTER TABLE public.lms_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_modules_read ON public.lms_modules;
CREATE POLICY lms_modules_read ON public.lms_modules FOR SELECT USING (true);
DROP POLICY IF EXISTS lms_modules_admin_write ON public.lms_modules;
CREATE POLICY lms_modules_admin_write ON public.lms_modules FOR ALL USING (public.get_my_role() IN ('admin','hr')) WITH CHECK (public.get_my_role() IN ('admin','hr'));
ALTER TABLE public.lms_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_lessons_read ON public.lms_lessons;
CREATE POLICY lms_lessons_read ON public.lms_lessons FOR SELECT USING (true);
DROP POLICY IF EXISTS lms_lessons_admin_write ON public.lms_lessons;
CREATE POLICY lms_lessons_admin_write ON public.lms_lessons FOR ALL USING (public.get_my_role() IN ('admin','hr')) WITH CHECK (public.get_my_role() IN ('admin','hr'));
ALTER TABLE public.lms_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_enrollments_self ON public.lms_enrollments;
CREATE POLICY lms_enrollments_self ON public.lms_enrollments FOR ALL USING (employee_id = auth.uid() OR public.get_my_role() IN ('admin','hr')) WITH CHECK (employee_id = auth.uid() OR public.get_my_role() IN ('admin','hr'));
ALTER TABLE public.lms_certifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_certifications_read ON public.lms_certifications;
CREATE POLICY lms_certifications_read ON public.lms_certifications FOR SELECT USING (employee_id = auth.uid() OR public.get_my_role() IN ('admin','hr'));
DROP POLICY IF EXISTS lms_certifications_admin_write ON public.lms_certifications;
CREATE POLICY lms_certifications_admin_write ON public.lms_certifications FOR ALL USING (public.get_my_role() IN ('admin','hr')) WITH CHECK (public.get_my_role() IN ('admin','hr'));
ALTER TABLE public.lms_learning_paths ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_paths_read ON public.lms_learning_paths;
CREATE POLICY lms_paths_read ON public.lms_learning_paths FOR SELECT USING (true);
DROP POLICY IF EXISTS lms_paths_admin_write ON public.lms_learning_paths;
CREATE POLICY lms_paths_admin_write ON public.lms_learning_paths FOR ALL USING (public.get_my_role() IN ('admin','hr')) WITH CHECK (public.get_my_role() IN ('admin','hr'));
ALTER TABLE public.lms_path_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_path_courses_read ON public.lms_path_courses;
CREATE POLICY lms_path_courses_read ON public.lms_path_courses FOR SELECT USING (true);
ALTER TABLE public.lms_lesson_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_progress_self ON public.lms_lesson_progress;
CREATE POLICY lms_progress_self ON public.lms_lesson_progress FOR ALL USING (employee_id = auth.uid() OR public.get_my_role() IN ('admin','hr')) WITH CHECK (employee_id = auth.uid());
ALTER TABLE public.lms_quiz_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_quiz_questions_read ON public.lms_quiz_questions;
CREATE POLICY lms_quiz_questions_read ON public.lms_quiz_questions FOR SELECT USING (true);
ALTER TABLE public.lms_quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_quiz_attempts_self ON public.lms_quiz_attempts;
CREATE POLICY lms_quiz_attempts_self ON public.lms_quiz_attempts FOR ALL USING (employee_id = auth.uid() OR public.get_my_role() IN ('admin','hr')) WITH CHECK (employee_id = auth.uid());
ALTER TABLE public.lms_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_announcements_read ON public.lms_announcements;
CREATE POLICY lms_announcements_read ON public.lms_announcements FOR SELECT USING (true);
DROP POLICY IF EXISTS lms_announcements_admin_write ON public.lms_announcements;
CREATE POLICY lms_announcements_admin_write ON public.lms_announcements FOR ALL USING (public.get_my_role() IN ('admin','hr')) WITH CHECK (public.get_my_role() IN ('admin','hr'));
ALTER TABLE public.lms_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_badges_read ON public.lms_badges;
CREATE POLICY lms_badges_read ON public.lms_badges FOR SELECT USING (true);
ALTER TABLE public.lms_employee_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lms_employee_badges_read ON public.lms_employee_badges;
CREATE POLICY lms_employee_badges_read ON public.lms_employee_badges FOR SELECT USING (true);

-- REQUIRES REVIEW: the following three tables were reconstructed purely
-- from application-code evidence (no CREATE TABLE, no RLS statement found
-- anywhere in either migration trail). RLS is enabled with a conservative
-- authenticated-read-only policy rather than an invented permissive one —
-- confirm real access requirements before loosening or tightening this.
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shifts_read_all ON public.shifts;
CREATE POLICY shifts_read_all ON public.shifts FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS shifts_admin_write ON public.shifts;
CREATE POLICY shifts_admin_write ON public.shifts FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

ALTER TABLE public.attendance_protocols ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_protocols_read_all ON public.attendance_protocols;
CREATE POLICY attendance_protocols_read_all ON public.attendance_protocols FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS attendance_protocols_admin_write ON public.attendance_protocols;
CREATE POLICY attendance_protocols_admin_write ON public.attendance_protocols FOR ALL USING (public.get_my_role() IN ('admin','dept_lead')) WITH CHECK (public.get_my_role() IN ('admin','dept_lead'));

ALTER TABLE public.system_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS holidays_read_all ON public.system_holidays;
CREATE POLICY holidays_read_all ON public.system_holidays FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS holidays_admin_write ON public.system_holidays;
CREATE POLICY holidays_admin_write ON public.system_holidays FOR ALL USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

-- system_config, company_profile, salary_slabs, sales_records,
-- incentive_grants, payslips, kpi_history, kpi_summary, employee_ratings,
-- company_revenues, company_expenses, salary_brackets,
-- salary_performance_mapping, budget_alerts, subscription_assignments,
-- purchases, invoice_items, project_tasks, task_comments, project_teams,
-- interview_permissions, interview_availability, onboarding_analysis_queue,
-- calendar/zoho support tables not explicitly listed above:
-- REQUIRES REVIEW — RLS is intentionally left DISABLED on these, matching
-- confirmed historical-trail evidence that access to them is gated at the
-- API layer (getSupabaseAdmin() / service-role client) rather than via
-- Postgres RLS. Do not enable RLS on these without also writing real
-- policies — an ENABLE with no policy blocks ALL non-service-role access
-- outright, which would be a functional regression, not a security fix.
