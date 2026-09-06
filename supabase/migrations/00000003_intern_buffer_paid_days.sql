-- ============================================================================
-- 00000003_intern_buffer_paid_days.sql
--
-- Adds `buffer_paid_days` to intern_stipend_cycles.
--
-- Default 0 (informational only — buffer days are unpaid).
-- Admin can override per-cycle to credit buffer days as paid (typically only
-- on the first cycle of an intern). Gross then becomes:
--   gross = (stipend / 30) × (paid_days + buffer_paid_days)
--
-- Idempotent. Safe to re-run.
-- ============================================================================

ALTER TABLE public.intern_stipend_cycles
  ADD COLUMN IF NOT EXISTS buffer_paid_days INT NOT NULL DEFAULT 0
    CHECK (buffer_paid_days >= 0);

-- Refresh view to include the new column
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
  c.buffer_paid_days,
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
