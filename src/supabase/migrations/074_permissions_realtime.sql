-- Migration 074: Enable Realtime for Role Permissions
-- This allows the sidebar to update instantly when an admin changes permissions.

-- Add role_permissions to the realtime publication if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE role_permissions;
  END IF;
END $$;
