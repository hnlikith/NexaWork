-- ============================================================================
-- 093: Sales Records — monthly achievement tracking per sales employee
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_records (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month        INT           NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         INT           NOT NULL CHECK (year >= 2020),
  amount_achieved NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  entered_by   UUID          REFERENCES employees(id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_sales_records_employee ON sales_records(employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_sales_records_period   ON sales_records(year, month);

ALTER TABLE sales_records ENABLE ROW LEVEL SECURITY;

-- Admin / leads: full read + write
CREATE POLICY "sales_records_lead_all" ON sales_records
  USING     (get_my_role() IN ('admin', 'dept_lead', 'team_lead'))
  WITH CHECK (get_my_role() IN ('admin', 'dept_lead', 'team_lead'));

-- Employee: read own records only
CREATE POLICY "sales_records_self_read" ON sales_records
  FOR SELECT
  USING (employee_id = auth.uid());
