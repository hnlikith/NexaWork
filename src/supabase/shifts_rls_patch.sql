-- ─── SHIFT MANAGEMENT RLS POLICIES ───────────────────────
-- Enable RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Allow all authenticated users to view shift protocols
CREATE POLICY "Enable select for all users" ON shifts
FOR SELECT TO authenticated USING (true);

-- 2. INSERT: Allow authenticated users (Admins) to create new shifts
CREATE POLICY "Enable insert for authenticated" ON shifts
FOR INSERT TO authenticated WITH CHECK (true);

-- 3. UPDATE: Allow authenticated users to modify shifts
CREATE POLICY "Enable update for authenticated" ON shifts
FOR UPDATE TO authenticated USING (true);

-- 4. DELETE: Allow authenticated users to decommission shifts
CREATE POLICY "Enable delete for authenticated" ON shifts
FOR DELETE TO authenticated USING (true);

-- ─── Employee RLS Policy for Shifts ────────────────────
-- Ensure authenticated users can link employees to shifts
-- (Usually covered by general employee update policy, but being explicit helps)
CREATE POLICY "Allow shift assignment" ON employees
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);
