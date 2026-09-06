-- 083_attendance_settings.sql

CREATE TABLE IF NOT EXISTS attendance_settings (
    id SERIAL PRIMARY KEY,
    holiday_is_paid_leave BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES employees(id)
);

-- Seed initial row if not exists
INSERT INTO attendance_settings (id, holiday_is_paid_leave) 
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Enable Realtime for settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'attendance_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_settings;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE attendance_settings ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read settings
CREATE POLICY "Allow all employees to read attendance settings" 
ON attendance_settings FOR SELECT 
TO authenticated 
USING (true);

-- Allow admins to update settings
CREATE POLICY "Allow admins to manage attendance settings" 
ON attendance_settings FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM employees 
    WHERE id = auth.uid() 
    AND role::text IN ('super_admin', 'manager', 'hr')
  )
);
