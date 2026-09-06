-- ============================================================================
-- 20260703000000_intern_amount_paid.sql
--
-- Adds `amount_paid` to intern_stipend_cycles: the amount ACTUALLY credited to
-- the intern for that month (vs net_amount = what is owed). This is what powers
-- the Interns Summary badges:
--   amount_paid = 0            -> Not Paid
--   0 < amount_paid < net      -> Half / Less Paid  (balance still due)
--   amount_paid = net          -> Paid
--   amount_paid > net          -> Over Paid          (excess)
--
-- Idempotent. Safe to re-run.
-- ============================================================================

ALTER TABLE public.intern_stipend_cycles
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (amount_paid >= 0);

-- Backfill: any cycle already marked paid is treated as fully paid.
UPDATE public.intern_stipend_cycles
   SET amount_paid = net_amount
 WHERE payment_status = 'paid' AND amount_paid = 0;
