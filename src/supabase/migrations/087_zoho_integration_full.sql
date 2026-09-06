-- Migration 087: Full Zoho Integration Schema
-- Adds: zoho_email/zoho_user_id/zoho_account_id to employees,
--       account_access table, offboarding fields,
--       zoho_calendar_config, calendar_events cache,
--       and improves audit_logs structure.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Extend employees table with Zoho fields ──────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS zoho_email        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS zoho_user_id      TEXT,
  ADD COLUMN IF NOT EXISTS zoho_account_id   TEXT,
  ADD COLUMN IF NOT EXISTS zoho_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','offboarding','disabled')),
  ADD COLUMN IF NOT EXISTS offboarded_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offboard_reason   TEXT,
  ADD COLUMN IF NOT EXISTS personal_email    TEXT;

-- Copy email → personal_email for existing rows
UPDATE employees SET personal_email = email WHERE personal_email IS NULL;

-- ─── 2. account_access table ─────────────────────────────────────────────────
-- Tracks which Zoho accounts each user can access (owner / shared_read / shared_send)
CREATE TABLE IF NOT EXISTS account_access (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  zoho_account_id TEXT NOT NULL,
  email_address   TEXT NOT NULL,
  display_name    TEXT,
  access_type     TEXT NOT NULL DEFAULT 'owner'
    CHECK (access_type IN ('owner','shared_read','shared_send')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_access_user_account_idx
  ON account_access (user_id, zoho_account_id);

ALTER TABLE account_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_access_own" ON account_access
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "account_access_admin" ON account_access
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- ─── 3. zoho_calendar_config table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zoho_calendar_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token    TEXT,
  refresh_token   TEXT,
  token_expiry    TIMESTAMPTZ,
  calendar_uid    TEXT,   -- default org calendar uid from Zoho
  is_connected    BOOLEAN DEFAULT FALSE,
  client_id       TEXT,
  client_secret   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Only one row needed
INSERT INTO zoho_calendar_config (is_connected)
  SELECT FALSE WHERE NOT EXISTS (SELECT 1 FROM zoho_calendar_config);

-- ─── 4. calendar_events local cache / custom events ──────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_event_id   TEXT,         -- null for local-only events
  title           TEXT NOT NULL,
  description     TEXT,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  all_day         BOOLEAN DEFAULT FALSE,
  location        TEXT,
  calendar_type   TEXT NOT NULL DEFAULT 'personal'
    CHECK (calendar_type IN ('personal','department','statutory')),
  department      TEXT,         -- for dept events
  created_by      UUID REFERENCES employees(id),
  is_recurring    BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,         -- RRULE string
  color           TEXT DEFAULT '#6366f1',
  attendees       JSONB DEFAULT '[]',
  reminder_mins   INT DEFAULT 15,
  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calendar_events_start_idx ON calendar_events (start_time);
CREATE INDEX IF NOT EXISTS calendar_events_type_idx  ON calendar_events (calendar_type);
CREATE INDEX IF NOT EXISTS calendar_events_dept_idx  ON calendar_events (department);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Everyone can read their own + dept + statutory events
CREATE POLICY "calendar_events_read" ON calendar_events
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      calendar_type = 'statutory'
      OR created_by = auth.uid()
      OR calendar_type = 'personal'
      OR (calendar_type = 'department' AND department = (
            SELECT department FROM employees WHERE id = auth.uid()
          ))
    )
  );

CREATE POLICY "calendar_events_insert" ON calendar_events
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    OR (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

CREATE POLICY "calendar_events_update" ON calendar_events
  FOR UPDATE USING (
    created_by = auth.uid()
    OR (SELECT role::text FROM employees WHERE id = auth.uid()) IN ('admin', 'dept_lead')
  );

CREATE POLICY "calendar_events_delete" ON calendar_events
  FOR DELETE USING (
    created_by = auth.uid()
    OR (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- ─── 5. Improve audit_logs table ─────────────────────────────────────────────
-- Create if not exists (may already exist from earlier migrations)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns idempotently in case table already existed without them
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS user_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_type TEXT,
  ADD COLUMN IF NOT EXISTS target_id   TEXT,
  ADD COLUMN IF NOT EXISTS ip_address  TEXT;

CREATE INDEX IF NOT EXISTS audit_logs_user_idx   ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_date_idx   ON audit_logs (created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_admin" ON audit_logs;
CREATE POLICY "audit_logs_admin" ON audit_logs
  FOR ALL USING (
    (SELECT role::text FROM employees WHERE id = auth.uid()) = 'admin'
  );

-- ─── 6. Add zoho_email to zoho_config if not already present ─────────────────
ALTER TABLE zoho_config
  ADD COLUMN IF NOT EXISTS org_domain TEXT,
  ADD COLUMN IF NOT EXISTS zoid       TEXT;   -- Zoho Org ID for provisioning API
