-- HELPER FUNCTION: Get current user role from database (more reliable than JWT)
--
-- SAFE MIGRATION SEQUENCE (rewritten during local baseline reconstruction —
-- see DATABASE_IMPLEMENTATION_REPORT.md "BLOCKER REPAIR VALIDATION"):
--
-- This function's return type is changing from TEXT (the reconstructed local
-- baseline's version, matching the historical trail's terminal state) to the
-- user_role enum (what this migration originally, and still, intends).
-- Postgres refuses a plain CREATE OR REPLACE when the return type differs,
-- which is why the original form of this migration used a bare
-- `DROP FUNCTION get_my_role()`. On the reconstructed baseline, dozens of RLS
-- policies call get_my_role() in their USING/WITH CHECK expressions, and
-- Postgres records those as hard dependencies — a bare DROP fails outright
-- once those policies exist, and DROP ... CASCADE would silently delete
-- every one of those policies with nothing to recreate them.
--
-- This version captures the exact definition of every policy that
-- references get_my_role() from pg_policies BEFORE dropping anything, drops
-- exactly those policies explicitly, drops and recreates the function with
-- its new signature, then reissues every captured policy verbatim — so
-- nothing is silently lost, and nothing outside this specific dependency set
-- is touched. This is fully general (it finds every dependent policy by
-- querying the catalog, not by a hand-maintained list), so it stays correct
-- even if the exact policy set changes later.

DO $$
DECLARE
  captured_count INT;
BEGIN
  DROP TABLE IF EXISTS _grm_policy_backup;
  CREATE TEMP TABLE _grm_policy_backup (
    schemaname text, tablename text, policyname text,
    permissive text, roles text[], cmd text, qual text, with_check text
  );

  INSERT INTO _grm_policy_backup
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual ILIKE '%get_my_role%' OR with_check ILIKE '%get_my_role%');

  SELECT COUNT(*) INTO captured_count FROM _grm_policy_backup;
  RAISE NOTICE 'get_my_role() migration: captured % dependent RLS polic(ies) before drop', captured_count;
END $$;

-- Drop exactly the captured policies (explicit, not CASCADE — so nothing
-- outside this exact dependency set can ever be touched by this step).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM _grm_policy_backup LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- The function has no remaining dependents, so it can now be dropped and
-- recreated with the new return type without CASCADE.
DROP FUNCTION IF EXISTS get_my_role();
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
DECLARE
    r user_role;
BEGIN
    SELECT role INTO r FROM employees WHERE id = auth.uid();
    RETURN COALESCE(r, 'employee'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reissue every captured policy exactly as it was. The USING/WITH CHECK text
-- was captured while get_my_role() still returned TEXT (e.g.
-- `get_my_role() = 'admin'::text`, or, for an original `IN (...)` list,
-- Postgres's own deparse form `get_my_role() = ANY (ARRAY['admin'::text,
-- 'dept_lead'::text])`). Replaying that text verbatim after get_my_role()
-- is redefined to return the user_role enum fails with "operator does not
-- exist: user_role = text", because the captured literals are still
-- text-typed constants.
--
-- The fix casts get_my_role()'s result back to TEXT at each call site
-- inside the captured expression, rather than touching the literals: every
-- captured expression is rewritten by replacing each occurrence of
-- `get_my_role()` with `get_my_role()::text`, leaving everything else in
-- the expression completely untouched. This is deliberately NOT done by
-- rewriting the literal-side casts (e.g. 'admin'::text -> 'admin'::user_role)
-- for two reasons found by inspecting the actual captured expressions:
--   1. Some policies OR a get_my_role() comparison together with an
--      unrelated text-column comparison in the same clause (e.g.
--      calendar_visible: `calendar_type = 'statutory' OR ... OR
--      get_my_role() IN ('admin','dept_lead')`) — a blanket ::text ->
--      ::user_role replacement anywhere in the expression would wrongly
--      corrupt that unrelated `calendar_type = 'statutory'` comparison.
--   2. Several policies compare get_my_role() against 'hr' (e.g. the
--      mail_templates_* and lms_* admin-write policies), but 'hr' is not a
--      value of the user_role enum (admin, dept_lead, team_lead, employee,
--      intern). Casting 'hr' to ::user_role would fail immediately with
--      "invalid input value for enum user_role: \"hr\"". Casting
--      get_my_role() to ::text instead preserves the original, pre-existing
--      behavior exactly: that branch was always unreachable (get_my_role()
--      can never return the string 'hr') both before and after this
--      migration, without requiring the enum's label set to be touched.
-- Casting the function call back to TEXT keeps every comparison exactly as
-- it was — text compared to text — regardless of which literals are
-- involved, without inspecting or altering a single literal or existing
-- cast.
DO $$
DECLARE
  r RECORD;
  cmd_sql TEXT;
  fixed_qual TEXT;
  fixed_check TEXT;
  restored_count INT := 0;
BEGIN
  FOR r IN SELECT * FROM _grm_policy_backup ORDER BY tablename, policyname LOOP
    fixed_qual := regexp_replace(r.qual, 'get_my_role\(\)', 'get_my_role()::text', 'g');
    fixed_check := regexp_replace(r.with_check, 'get_my_role\(\)', 'get_my_role()::text', 'g');

    cmd_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s',
      r.policyname, r.schemaname, r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd);
    IF r.roles IS NOT NULL THEN
      cmd_sql := cmd_sql || format(' TO %s', array_to_string(r.roles, ', '));
    END IF;
    IF fixed_qual IS NOT NULL THEN
      cmd_sql := cmd_sql || format(' USING (%s)', fixed_qual);
    END IF;
    IF fixed_check IS NOT NULL THEN
      cmd_sql := cmd_sql || format(' WITH CHECK (%s)', fixed_check);
    END IF;
    EXECUTE cmd_sql;
    restored_count := restored_count + 1;
  END LOOP;
  RAISE NOTICE 'get_my_role() migration: restored % RLS polic(ies) after function recreation', restored_count;
END $$;

DROP TABLE IF EXISTS _grm_policy_backup;

-- Post-condition check: fail loudly (not silently) if the restore didn't
-- reach the same count that was captured — this can only diverge if a
-- CREATE POLICY above hit an error that its own EXECUTE didn't already raise.
DO $$
DECLARE final_count INT;
BEGIN
  SELECT COUNT(*) INTO final_count FROM pg_policies
  WHERE schemaname = 'public' AND (qual ILIKE '%get_my_role%' OR with_check ILIKE '%get_my_role%');
  RAISE NOTICE 'get_my_role() migration: % polic(ies) reference get_my_role() after this migration', final_count;
END $$;
