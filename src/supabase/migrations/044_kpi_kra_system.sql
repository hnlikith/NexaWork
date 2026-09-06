-- ============================================================
-- KPI/KRA PERFORMANCE TRACKING SYSTEM
-- Real-time employee performance metrics
-- ============================================================

-- KPI Metrics Table
CREATE TABLE IF NOT EXISTS public.kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,

  -- KPI Scores
  kpi_score NUMERIC(5,2) DEFAULT 0 CHECK (kpi_score >= 0 AND kpi_score <= 100),
  kpi_entries JSONB DEFAULT '[]', -- Array of {label, weight, score}

  -- KRA (Key Result Areas) Scores
  kra_score NUMERIC(5,2) DEFAULT 0 CHECK (kra_score >= 0 AND kra_score <= 100),
  kra_metrics JSONB DEFAULT '{"ownership": 0, "quality": 0, "initiative": 0}',

  -- Behavioral Metrics
  behavioral_score NUMERIC(5,2) DEFAULT 0 CHECK (behavioral_score >= 0 AND behavioral_score <= 100),
  behavioral_metrics JSONB DEFAULT '{"attendance": 0, "discipline": 0, "communication": 0}',

  -- Final Score & Rating
  final_score NUMERIC(5,2) DEFAULT 0 CHECK (final_score >= 0 AND final_score <= 100),
  rating_label TEXT DEFAULT 'Meets' CHECK (rating_label IN ('Outstanding', 'Exceeds', 'Meets', 'Needs Improvement', 'Poor')),

  -- Metadata
  remarks TEXT,
  incentive_hint NUMERIC(10,2),
  entered_by UUID REFERENCES public.employees(id),
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one entry per employee per period
  UNIQUE(employee_id, month, year)
);

-- Performance History Table (for tracking changes)
CREATE TABLE IF NOT EXISTS public.kpi_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES public.kpi_metrics(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id),

  -- Previous values
  prev_kpi_score NUMERIC(5,2),
  prev_kra_score NUMERIC(5,2),
  prev_behavioral_score NUMERIC(5,2),
  prev_final_score NUMERIC(5,2),

  -- New values
  new_kpi_score NUMERIC(5,2),
  new_kra_score NUMERIC(5,2),
  new_behavioral_score NUMERIC(5,2),
  new_final_score NUMERIC(5,2),

  -- Change metadata
  changed_by UUID REFERENCES public.employees(id),
  change_reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Dashboard Summary (materialized view for quick access)
CREATE TABLE IF NOT EXISTS public.kpi_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Current period
  current_month INTEGER,
  current_year INTEGER,
  current_score NUMERIC(5,2),
  current_rating TEXT,

  -- 3-month average
  avg_3month NUMERIC(5,2),

  -- 6-month average
  avg_6month NUMERIC(5,2),

  -- Year-to-date
  ytd_average NUMERIC(5,2),

  -- Performance trend
  trend TEXT CHECK (trend IN ('improving', 'stable', 'declining')),

  -- Last updated
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(employee_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_employee ON public.kpi_metrics(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_period ON public.kpi_metrics(year, month);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_employee_period ON public.kpi_metrics(employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_kpi_history_kpi ON public.kpi_history(kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_summary_employee ON public.kpi_summary(employee_id);

-- Realtime subscriptions enabled
ALTER TABLE public.kpi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_summary ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Employees can view their own KPI
CREATE POLICY "employees_view_own_kpi" ON public.kpi_metrics
  FOR SELECT USING (employee_id = auth.uid());

-- HR and Admins can view all
CREATE POLICY "hr_view_all_kpi" ON public.kpi_metrics
  FOR SELECT USING (
    (SELECT role FROM public.employees WHERE id = auth.uid())
    IN ('super_admin', 'hr', 'lead')
  );

-- Only HR/Admins can create/update/delete
CREATE POLICY "hr_manage_kpi" ON public.kpi_metrics
  FOR ALL USING (
    (SELECT role FROM public.employees WHERE id = auth.uid())
    IN ('super_admin', 'hr', 'lead')
  );

-- Trigger to update performance summary
CREATE OR REPLACE FUNCTION update_kpi_summary()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.kpi_summary (
    employee_id,
    current_month,
    current_year,
    current_score,
    current_rating,
    updated_at
  ) VALUES (
    NEW.employee_id,
    NEW.month,
    NEW.year,
    NEW.final_score,
    NEW.rating_label,
    NOW()
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    current_month = EXCLUDED.current_month,
    current_year = EXCLUDED.current_year,
    current_score = EXCLUDED.current_score,
    current_rating = EXCLUDED.current_rating,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kpi_summary_trigger
AFTER INSERT OR UPDATE ON public.kpi_metrics
FOR EACH ROW
EXECUTE FUNCTION update_kpi_summary();

-- Trigger to record history
CREATE OR REPLACE FUNCTION log_kpi_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.kpi_history (
      kpi_id,
      employee_id,
      prev_kpi_score,
      prev_kra_score,
      prev_behavioral_score,
      prev_final_score,
      new_kpi_score,
      new_kra_score,
      new_behavioral_score,
      new_final_score,
      changed_by,
      changed_at
    ) VALUES (
      NEW.id,
      NEW.employee_id,
      OLD.kpi_score,
      OLD.kra_score,
      OLD.behavioral_score,
      OLD.final_score,
      NEW.kpi_score,
      NEW.kra_score,
      NEW.behavioral_score,
      NEW.final_score,
      (SELECT id FROM public.employees WHERE id = auth.uid()),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kpi_history_trigger
AFTER UPDATE ON public.kpi_metrics
FOR EACH ROW
EXECUTE FUNCTION log_kpi_change();

-- Grant permissions
GRANT ALL ON public.kpi_metrics TO authenticated;
GRANT ALL ON public.kpi_history TO authenticated;
GRANT ALL ON public.kpi_summary TO authenticated;

-- Refresh schema
NOTIFY pgrst, 'reload schema';
