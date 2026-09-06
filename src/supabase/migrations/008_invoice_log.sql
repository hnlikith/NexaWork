-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 008: Invoice Internal Log
-- Adds created-by employee tracking to invoices table
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS created_by_emp_id   TEXT,
  ADD COLUMN IF NOT EXISTS created_by_name     TEXT,
  ADD COLUMN IF NOT EXISTS created_by_dept     TEXT,
  ADD COLUMN IF NOT EXISTS created_by_team     TEXT,
  ADD COLUMN IF NOT EXISTS created_by_desig    TEXT;
