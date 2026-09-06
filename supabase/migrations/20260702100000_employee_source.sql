-- Track how each employee was added to the system
-- Values: 'direct' (Admin → Add Personnel), 'onboarding' (from completed onboarding e-sign)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'direct';

COMMENT ON COLUMN employees.source IS 'How this employee was created: direct | onboarding';
