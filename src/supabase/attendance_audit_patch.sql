-- EXPAND ATTENDANCE STATUS AND ADD AUDIT FIELDS
-- =============================================

-- 1. Drop old constraint
ALTER TABLE attendance_logs 
DROP CONSTRAINT IF EXISTS attendance_logs_status_check;

-- 2. Add new constraint with expanded states
ALTER TABLE attendance_logs 
ADD CONSTRAINT attendance_logs_status_check 
CHECK (status IN ('present', 'absent', 'late', 'half_day', 'on_duty', 'leave', 'holiday'));

-- 3. Add audit columns
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES employees(id),
ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS modification_reason TEXT;
