-- ============================================================================
-- NUCLEAR DATA CLEAR — Paste into Supabase SQL Editor and Run
-- Dynamically reads pg_tables so only EXISTING tables are truncated.
-- Zero "relation does not exist" errors.
-- ============================================================================

-- 1. Bypass all FK constraints
SET session_replication_role = replica;

-- 2. Truncate every public table that exists (skips config tables)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN (
    SELECT tablename
    FROM   pg_tables
    WHERE  schemaname = 'public'
    AND    tablename NOT IN (
      -- ── Keep these config tables intact ──────────────
      'role_permissions',      -- module access config per role
      'system_config',         -- SMTP, company name, etc.
      'attendance_settings',   -- shift / attendance config
      'support_routing_rules'  -- ticket routing rules
    )
    ORDER BY tablename
  )
  LOOP
    EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tbl) || ' CASCADE';
    RAISE NOTICE 'Cleared: %', tbl;
  END LOOP;
END $$;

-- 3. Restore FK checks
SET session_replication_role = DEFAULT;

-- ============================================================================
-- DONE. All employee, team, project, payslip, KPI, incentive,
-- messaging, LMS, CRM, finance data is now wiped.
--
-- NEXT STEPS:
-- 1. Go to Supabase Dashboard → Authentication → Users
--    → Select All → Delete  (employees table is empty now, so no FK error)
-- 2. Re-create your admin:  npx tsx src/scripts/create-admin.ts
-- 3. Import fresh employees / departments / teams via the app
-- ============================================================================
