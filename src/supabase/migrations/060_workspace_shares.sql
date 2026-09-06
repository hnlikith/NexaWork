-- ─── Workspace Shares Table ──────────────────────────────────────────────────
-- Tracks which employees can access workspace items owned by others.
-- Each user only sees their own items + items shared with them.

CREATE TABLE IF NOT EXISTS workspace_shares (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type    TEXT NOT NULL CHECK (item_type IN ('document','spreadsheet','presentation','note')),
  item_id      UUID NOT NULL,
  item_title   TEXT,
  owner_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES employees(id) ON DELETE CASCADE,
  permission   TEXT DEFAULT 'view' CHECK (permission IN ('view','edit','comment')),
  message      TEXT DEFAULT '',
  shared_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_type, item_id, user_id)
);

-- View that joins shares with employee details (used by GET /api/workspace/shares)
CREATE OR REPLACE VIEW workspace_shared_users AS
  SELECT
    ws.id,
    ws.item_type,
    ws.item_id,
    ws.item_title,
    ws.permission,
    ws.message,
    ws.shared_at,
    e.id   AS user_id,
    e.name AS user_name,
    e.employee_id AS user_employee_id,
    e.role AS user_role
  FROM workspace_shares ws
  JOIN employees e ON e.id = ws.user_id;

CREATE INDEX IF NOT EXISTS idx_ws_shares_user  ON workspace_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_ws_shares_item  ON workspace_shares(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_ws_shares_owner ON workspace_shares(owner_id);

ALTER TABLE workspace_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_shares_all" ON workspace_shares FOR ALL USING (true) WITH CHECK (true);
