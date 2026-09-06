-- Migration 001: Add Employment and Salary Structure to Employees

-- 1. Create Enums for new domains
DO $$ BEGIN
    CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'internship');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE salary_type AS ENUM ('fixed_monthly', 'hourly', 'daily', 'stipend');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Add columns to `employees` table natively
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS employment_type employment_type NOT NULL DEFAULT 'full_time',
ADD COLUMN IF NOT EXISTS salary_structure salary_type NOT NULL DEFAULT 'fixed_monthly',
ADD COLUMN IF NOT EXISTS base_salary NUMERIC(15,2) NOT NULL DEFAULT 0;

-- 3. Optionally update existing users backward compatibly (Assuming existing are full_time)
UPDATE employees
SET employment_type = 'full_time',
    salary_structure = 'fixed_monthly'
WHERE employment_type IS NULL OR salary_structure IS NULL;
