-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 007: Invoice Settings
-- Extends company_profile with SMTP config, invoice rules, permission controls
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE company_profile
  -- SMTP
  ADD COLUMN IF NOT EXISTS smtp_host           TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port           INTEGER     DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_user           TEXT,
  ADD COLUMN IF NOT EXISTS smtp_pass           TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from_name      TEXT        DEFAULT 'Your Company',
  ADD COLUMN IF NOT EXISTS smtp_from_email     TEXT,
  ADD COLUMN IF NOT EXISTS smtp_secure         BOOLEAN     DEFAULT false,
  -- Invoice Rules
  ADD COLUMN IF NOT EXISTS invoice_prefix      TEXT        DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS default_due_days    INTEGER     DEFAULT 30,
  ADD COLUMN IF NOT EXISTS invoice_footer      TEXT        DEFAULT 'Thank you for your business. Payment due as per agreed terms.',
  ADD COLUMN IF NOT EXISTS auto_numbering      BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_logo           BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_gst_rate    NUMERIC(5,2) DEFAULT 18,
  ADD COLUMN IF NOT EXISTS default_place_of_supply TEXT    DEFAULT 'Karnataka',
  -- Approval & Workflow
  ADD COLUMN IF NOT EXISTS require_approval    BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_on_create      BOOLEAN     DEFAULT false,
  -- Permissions (comma-separated role slugs stored as TEXT[])
  ADD COLUMN IF NOT EXISTS can_create_roles    TEXT[]      DEFAULT ARRAY['super_admin','accounts'],
  ADD COLUMN IF NOT EXISTS can_send_roles      TEXT[]      DEFAULT ARRAY['super_admin','accounts'],
  ADD COLUMN IF NOT EXISTS can_mark_paid_roles TEXT[]      DEFAULT ARRAY['super_admin','accounts'],
  ADD COLUMN IF NOT EXISTS can_delete_roles    TEXT[]      DEFAULT ARRAY['super_admin'],
  ADD COLUMN IF NOT EXISTS can_edit_roles      TEXT[]      DEFAULT ARRAY['super_admin','accounts'];
