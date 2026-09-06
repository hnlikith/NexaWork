-- ════════════════════════════════════════════════════════════════════════════
-- Onboarding approval toggle + submitted-at timestamp.
-- require_approval = true  → non-admin onboardings need admin approval before send.
-- require_approval = false → any role with onboarding access sends for e-sign directly.
-- (Admins always send directly regardless of this setting.)
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE onboarding_settings
  ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT true;

ALTER TABLE onboarding_packets
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
