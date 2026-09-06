-- ============================================================================
-- 098: Add Missing Columns (matrix_role, shift_id) to employees
-- ============================================================================

-- Add matrix_role and shift_id directly to employees table
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS matrix_role TEXT,
  ADD COLUMN IF NOT EXISTS shift_id UUID;

-- (Optional) If shifts table exists, add foreign key
DO $$ 
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'shifts'
    ) THEN
        IF NOT EXISTS (
            SELECT FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_employee_shift'
        ) THEN
            ALTER TABLE employees 
            ADD CONSTRAINT fk_employee_shift 
            FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;
