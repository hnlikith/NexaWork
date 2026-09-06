-- Migration 077: Support System Data Integrity & Real-time Permissions
-- This migration ensures that the employees table is fully accessible to the Support Hub
-- and that real-time changes are broadcast correctly to all authenticated users.

-- 1. Ensure RLS is configured for public directory access
-- Employees need to see each other to assign tickets
DO $$ 
BEGIN
  -- Enable RLS if not already (standard practice)
  ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
EXCEPTION 
  WHEN OTHERS THEN NULL;
END $$;

-- 2. Create a permissive policy for authenticated users to see the directory
-- This allows the Support Hub to fetch the list of assignees
DROP POLICY IF EXISTS "allow_auth_directory_read" ON employees;
CREATE POLICY "allow_auth_directory_read" 
ON employees FOR SELECT 
TO authenticated 
USING (true);

-- 3. Ensure Service Role can do everything (usually default, but being explicit)
DROP POLICY IF EXISTS "service_role_all" ON employees;
CREATE POLICY "service_role_all" 
ON employees FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 4. Verify Real-time Publication
-- The user already added it to supabase_realtime, but let's ensure it's there
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'employees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE employees;
  END IF;
EXCEPTION 
  WHEN OTHERS THEN NULL;
END $$;

-- 5. Fix potential 'is_active' null issues by enforcing the default
ALTER TABLE employees ALTER COLUMN is_active SET DEFAULT true;
UPDATE employees SET is_active = true WHERE is_active IS NULL;

-- 6. Add 'manager' to user_role if it somehow disappeared (legacy recovery)
DO $$ 
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager';
EXCEPTION 
  WHEN OTHERS THEN NULL;
END $$;
