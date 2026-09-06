-- ─── Workspace Sharing & UI Enhancements ───────────────────────────────────
-- Adds support for collaborative sharing and premium document UI features.

-- 1. Add cover image support to documents
ALTER TABLE workspace_documents ADD COLUMN IF NOT EXISTS cover_image TEXT DEFAULT NULL;

-- 2. Create Workspace Shares table for robust permission management
-- This replaces the JSONB 'shared_with' field for better relational queries.
CREATE TABLE IF NOT EXISTS workspace_shares (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL, -- References doc, sheet, etc.
  item_type      TEXT NOT NULL CHECK (item_type IN ('document', 'spreadsheet', 'presentation', 'note')),
  user_id        UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  access_level   TEXT NOT NULL CHECK (access_level IN ('read', 'edit')),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, user_id)
);

-- 3. Indexes for sharing performance
CREATE INDEX IF NOT EXISTS idx_workspace_shares_item ON workspace_shares(item_id, item_type);
CREATE INDEX IF NOT EXISTS idx_workspace_shares_user ON workspace_shares(user_id);

-- 4. Activity log additions
-- (Already exists in 059_workspace.sql, just ensuring it's used)

-- 5. RLS Policies for sharing
ALTER TABLE workspace_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_shares_all" ON workspace_shares FOR ALL USING (true) WITH CHECK (true);

-- 6. View for easier sharing management
CREATE OR REPLACE VIEW workspace_shared_users AS
SELECT 
  ws.id as share_id,
  ws.item_id,
  ws.item_type,
  ws.access_level,
  e.id as user_id,
  e.name,
  e.email,
  e.role,
  e.employee_id
FROM workspace_shares ws
JOIN employees e ON ws.user_id = e.id;
