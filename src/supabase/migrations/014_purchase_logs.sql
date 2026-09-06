-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 014: Purchase Filing Log
-- Adds tracking for which employee filed the purchase bill
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS filed_by_emp_id   TEXT,
  ADD COLUMN IF NOT EXISTS filed_by_name     TEXT,
  ADD COLUMN IF NOT EXISTS filed_by_dept     TEXT,
  ADD COLUMN IF NOT EXISTS filed_by_desig    TEXT,
  ADD COLUMN IF NOT EXISTS filed_by_uuid     UUID REFERENCES employees(id) ON DELETE SET NULL;
