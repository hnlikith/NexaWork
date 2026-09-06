-- Migration 043: Fix Leave Requests Schema and Add Admin Notifications
-- This migration ensures the leave_requests table is compatible with both 
-- the employee dashboard (start_date/end_date) and the admin dashboard (from_date/to_date).

-- 1. Ensure columns exist in leave_requests
DO $$ 
BEGIN
    -- Add start_date if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='start_date') THEN
        ALTER TABLE leave_requests ADD COLUMN start_date DATE;
    END IF;

    -- Add end_date if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='end_date') THEN
        ALTER TABLE leave_requests ADD COLUMN end_date DATE;
    END IF;

    -- Add from_date if missing (for Admin UI compatibility)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='from_date') THEN
        ALTER TABLE leave_requests ADD COLUMN from_date DATE;
    END IF;

    -- Add to_date if missing (for Admin UI compatibility)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='to_date') THEN
        ALTER TABLE leave_requests ADD COLUMN to_date DATE;
    END IF;

    -- Add approved_by if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='approved_by') THEN
        ALTER TABLE leave_requests ADD COLUMN approved_by UUID REFERENCES employees(id);
    END IF;

    -- Add days if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_requests' AND column_name='days') THEN
        ALTER TABLE leave_requests ADD COLUMN days INTEGER DEFAULT 1;
    END IF;
END $$;

UPDATE leave_requests SET 
    from_date = COALESCE(from_date, start_date),
    to_date = COALESCE(to_date, end_date),
    start_date = COALESCE(start_date, from_date),
    end_date = COALESCE(end_date, to_date),
    days = COALESCE(days, 1);

-- 3. Relax and Expand Constraints for maximum flexibility
-- Drop old constraints if they exist
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_type_check;

-- Add updated constraints (case-insensitive for status, expanded for type)
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check 
    CHECK (LOWER(status) IN ('pending', 'approved', 'rejected'));

ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_type_check 
    CHECK (type IN ('PTO', 'Sick', 'Unpaid', 'Weekly Off', 'Request', 'Comp Off', 'On Duty', 'Maternity', 'Paternity'));

-- 4. Update auto_approve_leave RPC to support new columns
CREATE OR REPLACE FUNCTION auto_approve_leave(
    p_employee_id UUID,
    p_type VARCHAR,
    p_start_date DATE,
    p_end_date DATE,
    p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_days INTEGER;
    v_pto NUMERIC;
    v_weekly NUMERIC;
BEGIN
    -- Calculate days (inclusive)
    v_days := (p_end_date - p_start_date) + 1;
    
    IF v_days <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid date range');
    END IF;

    -- Fetch current balances
    SELECT monthly_leave_quota, weekly_off_allotment 
    INTO v_pto, v_weekly
    FROM employees WHERE id = p_employee_id;

    IF p_type = 'PTO' THEN
        IF v_pto < v_days THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient PTO balance');
        END IF;
        
        -- Decrement
        UPDATE employees SET monthly_leave_quota = monthly_leave_quota - v_days WHERE id = p_employee_id;
        
    ELSIF p_type = 'Weekly Off' THEN
        IF v_weekly < v_days THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient Weekly Off balance');
        END IF;
        
        -- Decrement
        UPDATE employees SET weekly_off_allotment = weekly_off_allotment - v_days WHERE id = p_employee_id;
        
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid auto-approval type');
    END IF;

    -- Insert request as Approved
    INSERT INTO leave_requests (employee_id, type, start_date, end_date, from_date, to_date, status, reason, days)
    VALUES (p_employee_id, p_type, p_start_date, p_end_date, p_start_date, p_end_date, 'Approved', p_reason, v_days);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Create System Notifications Table (if not exists)
CREATE TABLE IF NOT EXISTS system_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info', -- 'info', 'warning', 'success', 'danger'
    is_read BOOLEAN DEFAULT false,
    link TEXT, -- Optional link to redirect
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;

-- Policies for notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON system_notifications;
CREATE POLICY "Users can view their own notifications" ON system_notifications 
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own notifications" ON system_notifications;
CREATE POLICY "Users can insert their own notifications" ON system_notifications 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all notifications" ON system_notifications;
CREATE POLICY "Admins can manage all notifications" ON system_notifications 
    FOR ALL USING (
        EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND role IN ('super_admin', 'accounts', 'hr'))
    );

-- 6. Create System Alerts Channel if it doesn't exist
INSERT INTO channels (name, description, type, is_global)
SELECT 'system-alerts', 'Internal system notifications and leave requests', 'text', false
WHERE NOT EXISTS (SELECT 1 FROM channels WHERE name = 'system-alerts');

-- Add admins to system-alerts channel automatically
DO $$
DECLARE
    v_channel_id UUID;
BEGIN
    SELECT id INTO v_channel_id FROM channels WHERE name = 'system-alerts';
    
    IF v_channel_id IS NOT NULL THEN
        INSERT INTO channel_members (channel_id, employee_id)
        SELECT v_channel_id, e.id 
        FROM employees e 
        WHERE e.role IN ('super_admin', 'accounts', 'hr')
        AND NOT EXISTS (
            SELECT 1 FROM channel_members cm 
            WHERE cm.channel_id = v_channel_id AND cm.employee_id = e.id
        );
    END IF;
END $$;
