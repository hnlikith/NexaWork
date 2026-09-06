-- ============================================================================
-- 00000004_intern_settings_and_lop.sql
--
-- Adds:
--   1. intern_module_settings — single-row table for module-wide settings.
--   2. Computed LOP logic — extra_leave_days > 0 reduces gross.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─── 1. Module settings (singleton row) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intern_module_settings (
  id                          INT PRIMARY KEY DEFAULT 1,
  default_holidays_per_month  INT NOT NULL DEFAULT 6 CHECK (default_holidays_per_month >= 0),
  -- The divisor used for per-day rate (stipend / divisor). Currently 30.
  -- Locked here but configurable for forward-compat in case policy changes.
  per_day_divisor             INT NOT NULL DEFAULT 30 CHECK (per_day_divisor > 0),
  -- When enabled, Generate Cycles auto-creates the buffer-month cycle for
  -- interns whose starting_date precedes their billing_date.
  auto_buffer_cycle           BOOLEAN NOT NULL DEFAULT true,
  -- Free-form internal notes shown on the settings page.
  notes                       TEXT,
  updated_by                  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Enforce singleton: only id = 1 is allowed.
  CONSTRAINT intern_module_settings_singleton CHECK (id = 1)
);

-- Seed the row if missing
INSERT INTO public.intern_module_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.intern_module_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intern_settings_admin_accounts_all" ON public.intern_module_settings;
CREATE POLICY "intern_settings_admin_accounts_all"
ON public.intern_module_settings FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'accounts') AND is_active = true)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('admin', 'accounts') AND is_active = true)
);
