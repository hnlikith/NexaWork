-- Migration 012: CRM Address Field
-- Adds Address to leads and clients tables

ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
