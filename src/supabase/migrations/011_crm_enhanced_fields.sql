-- Migration 011: CRM Enhanced Fields
-- Adds Email to leads and clients
-- Adds GSTIN and PAN to leads (clients already have them)

ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS pan TEXT;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS pan TEXT;
