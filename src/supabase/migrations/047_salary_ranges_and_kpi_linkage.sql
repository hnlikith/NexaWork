-- ============================================================
-- SALARY RANGES & KPI LINKAGE SYSTEM
-- ============================================================

-- 1. ALTER EMPLOYEES TABLE TO ADD SALARY RANGES & KPI FIELDS
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS salary_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS salary_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS salary_step NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS stipend_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS kpi_weight NUMERIC(3,1) DEFAULT 40,
  ADD COLUMN IF NOT EXISTS kra_weight NUMERIC(3,1) DEFAULT 40,
  ADD COLUMN IF NOT EXISTS behavioral_weight NUMERIC(3,1) DEFAULT 20,
  ADD COLUMN IF NOT EXISTS kpi_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_salary_linkage BOOLEAN DEFAULT false;

-- 2. CONSTRAINT: Ensure KPI weights sum to 100
DO $$
BEGIN
  ALTER TABLE public.employees
    ADD CONSTRAINT check_kpi_weights_sum
    CHECK ((kpi_weight + kra_weight + behavioral_weight) = 100);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 3. CREATE SALARY BRACKETS TABLE (for salary ranges per designation/level)
CREATE TABLE IF NOT EXISTS salary_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designation TEXT NOT NULL,
  level TEXT NOT NULL,
  min_salary NUMERIC(10,2) NOT NULL,
  max_salary NUMERIC(10,2) NOT NULL,
  step_increment NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(designation, level)
);

-- 4. CREATE SALARY PERFORMANCE MAPPING TABLE
CREATE TABLE IF NOT EXISTS salary_performance_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  kpi_score NUMERIC(5,2),
  kra_score NUMERIC(5,2),
  behavioral_score NUMERIC(5,2),
  final_performance_score NUMERIC(5,2),
  adjusted_salary NUMERIC(10,2),
  salary_increase_percent NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_salary_brackets_designation ON salary_brackets(designation);
CREATE INDEX IF NOT EXISTS idx_salary_performance_mapping_employee_id ON salary_performance_mapping(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_performance_mapping_effective_date ON salary_performance_mapping(effective_date);

-- 6. ENABLE REALTIME
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE salary_brackets;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE salary_performance_mapping;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 7. ROW LEVEL SECURITY
DO $$
BEGIN
  ALTER TABLE public.salary_brackets ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.salary_performance_mapping ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN
  NULL;
END $$;

DROP POLICY IF EXISTS "employees_view_salary_brackets" ON public.salary_brackets;
CREATE POLICY "employees_view_salary_brackets" ON public.salary_brackets FOR SELECT USING (true);

DROP POLICY IF EXISTS "employees_view_own_salary_performance" ON public.salary_performance_mapping;
CREATE POLICY "employees_view_own_salary_performance" ON public.salary_performance_mapping FOR SELECT
  USING (employee_id = auth.uid());

DROP POLICY IF EXISTS "admins_manage_salary_performance" ON public.salary_performance_mapping;
CREATE POLICY "admins_manage_salary_performance" ON public.salary_performance_mapping FOR ALL
  USING ((SELECT role FROM public.employees WHERE id = auth.uid()) IN ('super_admin', 'hr', 'accounts'));

-- 8. FUNCTION TO CALCULATE SALARY BASED ON PERFORMANCE
CREATE OR REPLACE FUNCTION calculate_performance_adjusted_salary(
  p_employee_id UUID,
  p_min_salary NUMERIC,
  p_max_salary NUMERIC,
  p_performance_score NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  v_adjusted_salary NUMERIC;
  v_salary_range NUMERIC;
  v_percentile NUMERIC;
BEGIN
  -- Performance score should be 0-100
  IF p_performance_score < 0 THEN p_performance_score := 0; END IF;
  IF p_performance_score > 100 THEN p_performance_score := 100; END IF;

  -- Calculate salary range
  v_salary_range := p_max_salary - p_min_salary;

  -- Calculate percentile in range (0-100 performance maps to min-max salary)
  v_percentile := (p_performance_score / 100.0);

  -- Calculate adjusted salary
  v_adjusted_salary := p_min_salary + (v_salary_range * v_percentile);

  RETURN v_adjusted_salary;
END;
$$ LANGUAGE plpgsql;

-- 9. SEED SALARY BRACKETS (Disabled - Add data manually through admin panel)
-- Sample data removed. Use admin panel to add salary brackets as needed.

-- 10. TRIGGER FOR UPDATED_AT ON SALARY TABLES
DO $$
BEGIN
  DROP TRIGGER IF EXISTS tr_update_salary_brackets_at ON salary_brackets;
  CREATE TRIGGER tr_update_salary_brackets_at
    BEFORE UPDATE ON salary_brackets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN others THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS tr_update_salary_performance_mapping_at ON salary_performance_mapping;
  CREATE TRIGGER tr_update_salary_performance_mapping_at
    BEFORE UPDATE ON salary_performance_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN others THEN
  NULL;
END $$;
