-- ============================================================================
-- 00000002_internship_stipend.sql
-- Internship stipend tracking — standalone from employee payroll.
-- Captures: intern roster + monthly stipend cycles + payment status/refs.
--
-- Rules (from spec):
--   - 30-day flat month (not calendar days)
--   - 6 holidays/month default (4 weekly + 2 paid). Holidays are PAID.
--   - Mid-month start: paid_days = 30 − (billing_date.day − 1)
--   - Buffer = starting_date − joining_date (display only, not deducted)
--   - gross = (stipend_amount / 30) × paid_days
--   - net   = gross − deductions
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─── 1. interns table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  intern_id       TEXT NOT NULL UNIQUE,
  upi_id          TEXT,
  stipend_amount  NUMERIC(12,2) NOT NULL CHECK (stipend_amount >= 0),
  joining_date    DATE NOT NULL,
  starting_date   DATE NOT NULL,
  billing_date    DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_by      UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interns_is_active     ON public.interns(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_interns_billing_date  ON public.interns(billing_date);

-- ─── 2. intern_stipend_cycles table ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intern_payment_status') THEN
    CREATE TYPE intern_payment_status AS ENUM ('pending', 'paid', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.intern_stipend_cycles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id         UUID NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
  month             INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  year              INT  NOT NULL CHECK (year BETWEEN 2020 AND 2100),

  -- Calculation inputs
  paid_days         INT  NOT NULL DEFAULT 30 CHECK (paid_days BETWEEN 0 AND 31),
  holidays_taken    INT  NOT NULL DEFAULT 6  CHECK (holidays_taken >= 0),
  extra_leave_days  INT  NOT NULL DEFAULT 0  CHECK (extra_leave_days >= 0),

  -- Calculation outputs
  gross_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  net_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Payment tracking
  payment_status    intern_payment_status NOT NULL DEFAULT 'pending',
  payment_date      DATE,
  payment_ref       TEXT,
  paid_by           UUID REFERENCES public.employees(id) ON DELETE SET NULL,

  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (intern_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_intern_cycles_month_year     ON public.intern_stipend_cycles(year, month);
CREATE INDEX IF NOT EXISTS idx_intern_cycles_payment_status ON public.intern_stipend_cycles(payment_status);
CREATE INDEX IF NOT EXISTS idx_intern_cycles_intern         ON public.intern_stipend_cycles(intern_id);

-- ─── 3. updated_at trigger ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_interns_touch ON public.interns;
CREATE TRIGGER trg_interns_touch BEFORE UPDATE ON public.interns
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_intern_cycles_touch ON public.intern_stipend_cycles;
CREATE TRIGGER trg_intern_cycles_touch BEFORE UPDATE ON public.intern_stipend_cycles
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ─── 4. RLS — admin + accounts can manage; everyone else blocked ───────────
ALTER TABLE public.interns                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intern_stipend_cycles  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interns_admin_accounts_all"            ON public.interns;
DROP POLICY IF EXISTS "intern_cycles_admin_accounts_all"      ON public.intern_stipend_cycles;

CREATE POLICY "interns_admin_accounts_all"
ON public.interns FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid()
      AND role IN ('admin', 'accounts')
      AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid()
      AND role IN ('admin', 'accounts')
      AND is_active = true
  )
);

CREATE POLICY "intern_cycles_admin_accounts_all"
ON public.intern_stipend_cycles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid()
      AND role IN ('admin', 'accounts')
      AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid()
      AND role IN ('admin', 'accounts')
      AND is_active = true
  )
);

-- ─── 5. Helper view: cycle + intern joined for the UI ──────────────────────
DROP VIEW IF EXISTS public.intern_stipend_cycles_view;
CREATE VIEW public.intern_stipend_cycles_view AS
SELECT
  c.id,
  c.intern_id,
  i.full_name,
  i.intern_id        AS intern_code,
  i.upi_id,
  i.stipend_amount,
  i.joining_date,
  i.starting_date,
  i.billing_date,
  i.is_active        AS intern_is_active,
  c.month,
  c.year,
  c.paid_days,
  c.holidays_taken,
  c.extra_leave_days,
  c.gross_amount,
  c.deductions,
  c.net_amount,
  c.payment_status,
  c.payment_date,
  c.payment_ref,
  c.paid_by,
  c.notes,
  c.created_at,
  c.updated_at
FROM public.intern_stipend_cycles c
JOIN public.interns i ON i.id = c.intern_id;
