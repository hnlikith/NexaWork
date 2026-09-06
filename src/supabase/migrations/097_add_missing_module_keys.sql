-- ============================================================================
-- 097: Add missing module keys to role_permissions
--
-- Adds: payslips_management (admin payslips page)
-- These were added to the sidebar after migration 086 seeded the permissions table.
-- ============================================================================

DO $$
DECLARE
  new_keys TEXT[] := ARRAY['payslips_management'];
  all_roles TEXT[] := ARRAY['admin','dept_lead','team_lead','employee','intern'];
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

-- Admin: full access to payslips management
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=true, can_delete=true, can_export=true
WHERE role = 'admin' AND module_key = 'payslips_management';

-- Dept Lead: can view and generate payslips
UPDATE role_permissions
SET can_view=true, can_create=true, can_edit=false, can_delete=false, can_export=false
WHERE role = 'dept_lead' AND module_key = 'payslips_management';
