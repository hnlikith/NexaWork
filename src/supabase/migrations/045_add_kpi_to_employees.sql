-- ============================================================
-- ADD KPI FIELDS TO EMPLOYEES TABLE
-- ============================================================

-- Add KPI-related columns to employees table
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS current_kpi_score NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_kra_score NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_behavioral_score NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_final_score NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_rating TEXT DEFAULT 'Meets',
  ADD COLUMN IF NOT EXISTS ytd_average NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS performance_trend TEXT DEFAULT 'stable' CHECK (performance_trend IN ('improving', 'stable', 'declining')),
  ADD COLUMN IF NOT EXISTS last_kpi_update TIMESTAMPTZ;

-- Trigger to auto-update employee KPI fields from kpi_metrics
CREATE OR REPLACE FUNCTION sync_employee_kpi()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.employees
  SET
    current_kpi_score = NEW.kpi_score,
    current_kra_score = NEW.kra_score,
    current_behavioral_score = NEW.behavioral_score,
    current_final_score = NEW.final_score,
    current_rating = NEW.rating_label,
    last_kpi_update = NOW()
  WHERE id = NEW.employee_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_employee_kpi_trigger ON public.kpi_metrics;
CREATE TRIGGER sync_employee_kpi_trigger
AFTER INSERT OR UPDATE ON public.kpi_metrics
FOR EACH ROW
EXECUTE FUNCTION sync_employee_kpi();

-- Grant permissions
GRANT ALL ON public.employees TO authenticated;

-- Refresh schema
NOTIFY pgrst, 'reload schema';
