-- ============================================================================
-- 094: Real Incentive Grants + Payslips
-- Replaces dummy incentive service with real DB tables.
-- Payslips auto-link base_salary, incentives, and sales commission.
-- ============================================================================

-- ── Incentive Grants ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incentive_grants (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month               INT           NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                INT           NOT NULL CHECK (year >= 2020),
  fixed_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  variable_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  employee_multiplier NUMERIC(5,2)  NOT NULL DEFAULT 1.0,
  company_multiplier  NUMERIC(5,2)  NOT NULL DEFAULT 1.0,
  amount              NUMERIC(15,2) NOT NULL DEFAULT 0,       -- final computed amount
  status              VARCHAR(20)   NOT NULL DEFAULT 'locked'
                      CHECK (status IN ('locked', 'claimable', 'paid')),
  notes               TEXT,
  awarded_by          UUID          REFERENCES employees(id),
  vested_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_incentive_grants_employee ON incentive_grants(employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_incentive_grants_status   ON incentive_grants(status);
CREATE INDEX IF NOT EXISTS idx_incentive_grants_period   ON incentive_grants(year, month);

ALTER TABLE incentive_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ig_admin_all" ON incentive_grants
  USING     (get_my_role() IN ('admin', 'dept_lead'))
  WITH CHECK (get_my_role() IN ('admin', 'dept_lead'));

CREATE POLICY "ig_self_read" ON incentive_grants
  FOR SELECT USING (employee_id = auth.uid());

-- ── Payslips ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payslips (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month               INT           NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                INT           NOT NULL CHECK (year >= 2020),

  -- Earnings breakdown
  base_salary         NUMERIC(15,2) NOT NULL DEFAULT 0,
  hra                 NUMERIC(15,2) NOT NULL DEFAULT 0,
  special_allowance   NUMERIC(15,2) NOT NULL DEFAULT 0,
  incentive_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  sales_commission    NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_earnings      NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_pay           NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Deductions breakdown
  pf_deduction        NUMERIC(15,2) NOT NULL DEFAULT 0,
  professional_tax    NUMERIC(15,2) NOT NULL DEFAULT 0,
  tds_deduction       NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_deductions    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_deductions    NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Net
  net_pay             NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Traceability references
  incentive_grant_ref UUID          REFERENCES incentive_grants(id) ON DELETE SET NULL,

  -- Workflow
  status              VARCHAR(20)   NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'approved', 'released')),
  generated_by        UUID          REFERENCES employees(id),
  approved_by         UUID          REFERENCES employees(id),
  approved_at         TIMESTAMPTZ,
  released_at         TIMESTAMPTZ,
  notes               TEXT,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payslips_status   ON payslips(status);
CREATE INDEX IF NOT EXISTS idx_payslips_period   ON payslips(year, month);

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payslips_admin_all" ON payslips
  USING     (get_my_role() IN ('admin', 'dept_lead'))
  WITH CHECK (get_my_role() IN ('admin', 'dept_lead'));

CREATE POLICY "payslips_self_read" ON payslips
  FOR SELECT USING (employee_id = auth.uid());
