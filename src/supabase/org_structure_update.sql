-- 1. Extend System Configuration for Root Node Identity
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT 'Your Company';
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS founder_name TEXT DEFAULT 'Aryan';
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS founder_designation TEXT DEFAULT 'Chief Executive Officer';

-- 2. Restructure Teams for Recursive Department/Team Hierarchy
-- This enables "Main Department" -> "Sub-Team" nesting logic.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('department', 'team')) NOT NULL DEFAULT 'team';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS head_designation TEXT;

-- 3. Ensure RLS allows inserts (assuming super_admin or authenticated for now)
-- Adjust based on your actual auth requirements.
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON "public"."teams"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON "public"."teams"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users only" ON "public"."teams"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (true);

-- 4. Similar policies for system_config
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for config" ON "public"."system_config"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable update for config" ON "public"."system_config"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (true);
