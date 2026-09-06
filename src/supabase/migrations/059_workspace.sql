-- ─── Workspace Feature Migration ─────────────────────────────────────────────
-- Adds Coda.io-inspired document workspace: Documents, Spreadsheets,
-- Presentations, and Notes with folders, activity, and sharing support.

-- Folders (shared hierarchy for all workspace types)
CREATE TABLE IF NOT EXISTS workspace_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES workspace_folders(id) ON DELETE CASCADE,
  owner_id    UUID REFERENCES employees(id) ON DELETE SET NULL,
  color       TEXT DEFAULT '#6B7280',
  icon        TEXT DEFAULT '📁',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Documents (Word/rich-text)
CREATE TABLE IF NOT EXISTS workspace_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL DEFAULT 'Untitled Document',
  content         TEXT DEFAULT '',
  folder_id       UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  owner_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_pinned       BOOLEAN DEFAULT false,
  is_template     BOOLEAN DEFAULT false,
  icon            TEXT DEFAULT '📄',
  cover_color     TEXT DEFAULT NULL,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  shared_with     JSONB DEFAULT '[]',
  is_public       BOOLEAN DEFAULT false,
  tags            TEXT[] DEFAULT '{}',
  last_edited_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  last_edited_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Spreadsheets (Excel-like)
CREATE TABLE IF NOT EXISTS workspace_spreadsheets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL DEFAULT 'Untitled Spreadsheet',
  sheets          JSONB DEFAULT '[{"name":"Sheet 1","data":[],"colWidths":[]}]',
  folder_id       UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  owner_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_pinned       BOOLEAN DEFAULT false,
  is_template     BOOLEAN DEFAULT false,
  icon            TEXT DEFAULT '📊',
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  shared_with     JSONB DEFAULT '[]',
  is_public       BOOLEAN DEFAULT false,
  tags            TEXT[] DEFAULT '{}',
  last_edited_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  last_edited_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Presentations (PowerPoint-like)
CREATE TABLE IF NOT EXISTS workspace_presentations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL DEFAULT 'Untitled Presentation',
  slides          JSONB DEFAULT '[{"id":"slide-1","background":"#FFFFFF","layout":"title","elements":[{"id":"el-title","type":"text","content":"Click to add title","x":10,"y":35,"width":80,"height":15,"style":{"fontSize":"2rem","fontWeight":"bold","color":"#1e293b","textAlign":"center"}},{"id":"el-sub","type":"text","content":"Click to add subtitle","x":15,"y":55,"width":70,"height":10,"style":{"fontSize":"1.1rem","color":"#64748b","textAlign":"center"}}]}]',
  theme           JSONB DEFAULT '{"primary":"#6366f1","secondary":"#e2e8f0","font":"Inter","bg":"#FFFFFF"}',
  folder_id       UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  owner_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_pinned       BOOLEAN DEFAULT false,
  is_template     BOOLEAN DEFAULT false,
  icon            TEXT DEFAULT '📑',
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  shared_with     JSONB DEFAULT '[]',
  is_public       BOOLEAN DEFAULT false,
  tags            TEXT[] DEFAULT '{}',
  last_edited_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  last_edited_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Notes (Google Keep-like)
CREATE TABLE IF NOT EXISTS workspace_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL DEFAULT 'Untitled Note',
  content         TEXT DEFAULT '',
  folder_id       UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  owner_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_pinned       BOOLEAN DEFAULT false,
  color           TEXT DEFAULT '#ffffff',
  icon            TEXT DEFAULT '📝',
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  shared_with     JSONB DEFAULT '[]',
  is_public       BOOLEAN DEFAULT false,
  tags            TEXT[] DEFAULT '{}',
  last_edited_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  last_edited_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log across all workspace types
CREATE TABLE IF NOT EXISTS workspace_activity (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type    TEXT NOT NULL CHECK (item_type IN ('document','spreadsheet','presentation','note')),
  item_id      UUID NOT NULL,
  item_title   TEXT,
  employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  action       TEXT NOT NULL CHECK (action IN ('created','edited','shared','viewed','archived','deleted')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspace_docs_owner    ON workspace_documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_docs_project  ON workspace_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_workspace_docs_status   ON workspace_documents(status);
CREATE INDEX IF NOT EXISTS idx_workspace_sheets_owner  ON workspace_spreadsheets(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_ppts_owner    ON workspace_presentations(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_owner   ON workspace_notes(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_item ON workspace_activity(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_emp  ON workspace_activity(employee_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION workspace_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ws_docs_updated_at') THEN
    CREATE TRIGGER trg_ws_docs_updated_at
      BEFORE UPDATE ON workspace_documents
      FOR EACH ROW EXECUTE FUNCTION workspace_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ws_sheets_updated_at') THEN
    CREATE TRIGGER trg_ws_sheets_updated_at
      BEFORE UPDATE ON workspace_spreadsheets
      FOR EACH ROW EXECUTE FUNCTION workspace_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ws_ppts_updated_at') THEN
    CREATE TRIGGER trg_ws_ppts_updated_at
      BEFORE UPDATE ON workspace_presentations
      FOR EACH ROW EXECUTE FUNCTION workspace_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ws_notes_updated_at') THEN
    CREATE TRIGGER trg_ws_notes_updated_at
      BEFORE UPDATE ON workspace_notes
      FOR EACH ROW EXECUTE FUNCTION workspace_set_updated_at();
  END IF;
END $$;

-- RLS (Row Level Security) - disabled by default, enable per deployment policy
ALTER TABLE workspace_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_spreadsheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_folders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_activity     ENABLE ROW LEVEL SECURITY;

-- Permissive policies (service role bypasses RLS anyway via getSupabaseAdmin)
CREATE POLICY "workspace_docs_all"    ON workspace_documents    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "workspace_sheets_all"  ON workspace_spreadsheets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "workspace_ppts_all"    ON workspace_presentations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "workspace_notes_all"   ON workspace_notes        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "workspace_folders_all" ON workspace_folders      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "workspace_activity_all" ON workspace_activity    FOR ALL USING (true) WITH CHECK (true);
