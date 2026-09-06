-- Migration 090: Reset permissions to "Disabled by Default"
-- Goal: Ensure all modules are hidden initially, even for Admin.
-- Only 'admin_dashboard' and 'permissions_control' stay visible for Admin to prevent lockout.

-- 1. Set all existing permissions to FALSE for all modules
UPDATE role_permissions
SET can_view = false, can_create = false, can_edit = false, can_delete = false, can_export = false;

-- 2. Restore essential access for Admin so they can actually use the dashboard and this page
UPDATE role_permissions
SET can_view = true, can_create = true, can_edit = true, can_delete = true, can_export = true
WHERE role = 'admin' AND module_key IN ('admin_dashboard', 'permissions_control');

-- 3. Restore basic self-service for all roles (My Profile, etc.) if you want them to be able to at least see their profile
-- Actually, the user said "dashboards disable first", so I'll be strict.
-- They can go and enable them manually now.
