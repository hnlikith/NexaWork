-- Robust Update for attendance_protocols
-- This script handles cases where 'time' might or might not exist

DO $$ 
BEGIN
    -- 1. Create table if it doesn't exist (safety first)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance_protocols') THEN
        CREATE TABLE attendance_protocols (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title TEXT NOT NULL,
            check_in_time TIME NOT NULL DEFAULT '09:00:00',
            check_out_time TIME NOT NULL DEFAULT '18:00:00',
            type TEXT NOT NULL DEFAULT 'All',
            days TEXT[] NOT NULL DEFAULT ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    ELSE
        -- 2. If table exists, check for 'time' and rename to 'check_in_time'
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance_protocols' AND column_name='time') THEN
            ALTER TABLE attendance_protocols RENAME COLUMN "time" TO check_in_time;
        END IF;

        -- 3. Add check_in_time if missing (and 'time' didn't exist to rename)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance_protocols' AND column_name='check_in_time') THEN
            ALTER TABLE attendance_protocols ADD COLUMN check_in_time TIME NOT NULL DEFAULT '09:00:00';
        END IF;

        -- 4. Add check_out_time if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance_protocols' AND column_name='check_out_time') THEN
            ALTER TABLE attendance_protocols ADD COLUMN check_out_time TIME NOT NULL DEFAULT '18:00:00';
        END IF;
    END IF;
END $$;
