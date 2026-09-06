-- =====================================================================
-- supabase/seed.sql — LOCAL DEVELOPMENT SEED ONLY
--
-- Referenced by supabase/README.md's folder layout but never created
-- until now. Contains ONLY fake, clearly-synthetic data:
--   - no real employee/customer/payroll/financial data
--   - no real documents, passwords, API keys, tokens, or Zoho credentials
--   - no production email addresses
--
-- NOT auto-applied to production. Run manually against a local dev
-- database only (`supabase db reset --local` applies this automatically
-- after migrations, per the Supabase CLI convention).
--
-- IMPORTANT: auth.users rows cannot be created via plain SQL INSERT in a
-- way that Supabase Auth will accept as real, loginable accounts — they
-- must go through the Supabase Auth Admin API or Dashboard. This seed
-- therefore only inserts data that does NOT depend on auth.users existing
-- yet (system_config, generic teams, default settings singletons). The
-- first admin employee must be created following the exact steps already
-- documented in supabase/README.md, using a clearly fake address such as
-- admin@example.local — never a real one.
-- =====================================================================

-- Default system configuration (generic, non-org-specific)
INSERT INTO public.system_config (revenue, profit_percentage, expense_percentage, company_stage, company_name, founder_name, founder_designation)
VALUES (0, 85, 15, 'Early Growth', '', '', '')
ON CONFLICT DO NOTHING;

-- Generic dev team structure (not a real org chart — compare to the
-- excluded 096_seed_departments_teams.sql, which is real org data and is
-- deliberately NOT replayed here)
INSERT INTO public.teams (name, department, type, is_active) VALUES
  ('Engineering', 'Engineering', 'department', true),
  ('Product', 'Product', 'department', true),
  ('Operations', 'Operations', 'department', true)
ON CONFLICT (name) DO NOTHING;

-- Singleton settings rows required by the app before any real config exists
INSERT INTO public.attendance_settings (id, holiday_is_paid_leave) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Example fake dev sample data (generic, not tied to any real org):
INSERT INTO public.mail_templates (name, category, subject, body, status) VALUES
  ('Welcome (Dev Sample)', 'general', 'Welcome to the team', 'This is placeholder onboarding copy for local development.', 'active')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- Manual step required after this file runs (per supabase/README.md):
--
-- 1. Create an auth user via Dashboard -> Authentication -> Users -> Add
--    user (tick "Auto Confirm User"), using a fake address, e.g.:
--      admin@example.local
--
-- 2. Copy the generated UUID, then run:
--
--    INSERT INTO public.employees (
--      id, name, email, role, employee_id, is_active, joining_date
--    ) VALUES (
--      '<paste-auth-user-uuid-here>',
--      'Dev Admin',
--      'admin@example.local',
--      'admin',
--      'DEV-0001',
--      true,
--      CURRENT_DATE
--    );
--
-- Repeat with hr@example.local / employee@example.local and appropriate
-- roles for additional dev accounts, as needed.
-- =====================================================================
