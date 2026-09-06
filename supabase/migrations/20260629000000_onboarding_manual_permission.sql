-- ════════════════════════════════════════════════════════════════════════════
-- Onboarding "Manual Entry" permission.
-- Controls the Manual Entry tab in Start New Onboarding (add a candidate by hand,
-- bypassing the interview pipeline). Admin-only by default; admins can grant it
-- to other roles in /admin/permissions. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  all_roles TEXT[] := ARRAY['admin','dept_lead','team_lead','employee','intern'];
  r TEXT;
BEGIN
  FOREACH r IN ARRAY all_roles LOOP
    INSERT INTO role_permissions
      (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
    VALUES (r, 'onboarding_manual', false, false, false, false, false)
    ON CONFLICT (role, module_key) DO NOTHING;
  END LOOP;
END $$;

-- Admin: can use Manual Entry.
UPDATE role_permissions
SET can_view = true
WHERE role = 'admin' AND module_key = 'onboarding_manual';
