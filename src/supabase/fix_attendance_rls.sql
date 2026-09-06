-- Fix RLS for attendance_logs to allow users to manage their own logs
-- And cleanup any accidental records for April 25, 2026

-- 1. Enable RLS
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own logs" ON attendance_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON attendance_logs;
DROP POLICY IF EXISTS "Users can update own logs" ON attendance_logs;

-- 3. Create fresh policies
CREATE POLICY "Users can view own logs" ON attendance_logs
  FOR SELECT USING (auth.uid() = employee_id);

CREATE POLICY "Users can insert own logs" ON attendance_logs
  FOR INSERT WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Users can update own logs" ON attendance_logs
  FOR UPDATE USING (auth.uid() = employee_id);

-- 4. Cleanup the "false info" record for April 25, 2026
-- This allows the user to perform a fresh Check In
DELETE FROM attendance_logs 
WHERE date = '2026-04-25' 
AND (clock_in = clock_out OR clock_out IS NOT NULL);

-- 5. Ensure the table has the correct unique constraint for upsert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_logs_emp_date_key'
    ) THEN
        ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_emp_date_key UNIQUE (employee_id, date);
    END IF;
END $$;
