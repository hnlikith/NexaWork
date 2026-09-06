-- Migration: Add GSTIN and PAN to Clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS pan   TEXT;
