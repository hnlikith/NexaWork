-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 017: Subscription Logging
-- Adds tracking for which employee filed the subscription
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS filed_by_emp_id   TEXT,
  ADD COLUMN IF NOT EXISTS filed_by_name     TEXT,
  ADD COLUMN IF NOT EXISTS filed_by_dept     TEXT,
  ADD COLUMN IF NOT EXISTS filed_by_desig    TEXT,
  ADD COLUMN IF NOT EXISTS filed_by_uuid     UUID REFERENCES employees(id) ON DELETE SET NULL;
