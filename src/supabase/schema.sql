-- ==========================================
-- NAMAAH PULSE: BASE SCHEMA
-- (Matches src/types/database.types.ts exactly)
-- ==========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ROLES ENUM
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'accounts', 'hr', 'lead', 'employee', 'sales');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 01. EMPLOYEES
CREATE TABLE employees (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    employee_id TEXT UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'employee',
    department TEXT,
    designation TEXT,
    team_id UUID,
    joining_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 02. TEAMS
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    lead_id UUID REFERENCES employees(id),
    member_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE employees ADD CONSTRAINT fk_team FOREIGN KEY (team_id) REFERENCES teams(id);

-- 03. ATTENDANCE LOGS
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    clock_in TIME,
    clock_out TIME,
    status TEXT CHECK (status IN ('present', 'absent', 'late', 'half_day')) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 04. LEAVE REQUESTS
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('casual', 'sick', 'earned', 'unpaid')) NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    days INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 05. KPI SCORES
CREATE TABLE kpi_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    kra_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    kpi_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    behavioral_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    final_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 06. INCENTIVES
CREATE TABLE incentives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    fixed_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    variable_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    status TEXT CHECK (status IN ('locked', 'claimable', 'held', 'claimed')) NOT NULL DEFAULT 'locked',
    vesting_start DATE NOT NULL,
    vesting_end DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 07. PAYROLL RUNS
CREATE TABLE payroll_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    base_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
    incentive_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    deductions NUMERIC(15,2) NOT NULL DEFAULT 0,
    gross_pay NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(15,2) NOT NULL DEFAULT 0,
    status TEXT CHECK (status IN ('draft', 'processed', 'paid')) NOT NULL DEFAULT 'draft',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 08. SYSTEM CONFIG
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    revenue NUMERIC(20,2) NOT NULL DEFAULT 0,
    profit_percentage INTEGER NOT NULL DEFAULT 85,
    expense_percentage INTEGER NOT NULL DEFAULT 15,
    company_stage TEXT NOT NULL DEFAULT 'Early Growth',
    vesting_days INTEGER NOT NULL DEFAULT 30,
    bonus_percentage_1m INTEGER NOT NULL DEFAULT 5,
    bonus_percentage_2m INTEGER NOT NULL DEFAULT 10,
    claim_limit INTEGER NOT NULL DEFAULT 25,
    payout_pool_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
    payout_capacity TEXT CHECK (payout_capacity IN ('HIGH', 'MODERATE', 'LOW')) NOT NULL DEFAULT 'HIGH',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_update_employees_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER tr_update_config_at BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
