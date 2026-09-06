-- ════════════════════════════════════════════════════════════════════════════
-- Onboarding "Form Builder" permission (full-depth structural editing)
-- Tier 1 (fill the form / "checkbox answering") = the `onboarding` module.
-- Tier 2 (edit questions/options/types/structure) = this `onboarding_builder` module.
-- Admin-only by default; admins can grant it to other roles in /admin/permissions.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  all_roles TEXT[] := ARRAY['admin','dept_lead','team_lead','employee','intern'];
  r TEXT;
BEGIN
  FOREACH r IN ARRAY all_roles LOOP
    INSERT INTO role_permissions
      (role, module_key, can_view, can_create, can_edit, can_delete, can_export)
    VALUES (r, 'onboarding_builder', false, false, false, false, false)
    ON CONFLICT (role, module_key) DO NOTHING;
  END LOOP;
END $$;

-- Admin: full-depth form-builder access.
UPDATE role_permissions
SET can_view = true, can_edit = true
WHERE role = 'admin' AND module_key = 'onboarding_builder';
