-- Add company seal and authorized signatory signature to onboarding settings
ALTER TABLE onboarding_settings
  ADD COLUMN IF NOT EXISTS signatory_signature_url TEXT,
  ADD COLUMN IF NOT EXISTS company_seal_url TEXT;
