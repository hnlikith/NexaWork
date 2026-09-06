-- Migration 019: Task Comments + Custom Column Support
-- Removes hard status constraint (allows custom kanban columns)
-- Adds task_comments table for per-task discussion threads

-- ─── 1. Remove hard status check so custom columns can be persisted ──────────
ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_status_check;

-- ─── 2. task_comments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      UUID        NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  author_name  TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tc_select" ON task_comments;
DROP POLICY IF EXISTS "tc_insert" ON task_comments;
DROP POLICY IF EXISTS "tc_delete" ON task_comments;
CREATE POLICY "tc_select" ON task_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "tc_insert" ON task_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tc_delete" ON task_comments FOR DELETE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
