-- Shift Management Infrastructure Patch
-- Namaah Nexus Enterprise Scaling

-- 1. Create Shifts Registry
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    color_code TEXT,
    valid_from DATE, -- Shift validity horizon
    valid_to DATE,
    department TEXT, -- Optional targeting
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Link Employees to Shifts
ALTER TABLE employees ADD COLUMN shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;

-- 3. Seed Default Shifts
INSERT INTO shifts (name, start_time, end_time, color_code) VALUES
('General Shift', '09:00:00', '18:00:00', '#10b981'), -- Emerald
('Morning Shift', '06:00:00', '15:00:00', '#0ea5e9'), -- Sky
('Evenining Shift', '14:00:00', '23:00:00', '#f59e0b'), -- Amber
('Night Shift', '22:00:00', '07:00:00', '#6366f1'); -- Indigo

-- 4. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
