-- ============================================================================
-- 096: Seed Namaah Company Structure
-- Source: Namaah_Employee_Directory spreadsheet
-- Tree: Company Root → 15 Departments → 28 Teams
-- ============================================================================

-- Ensure teams table has required columns for tree structure
ALTER TABLE teams ADD COLUMN IF NOT EXISTS type            TEXT    NOT NULL DEFAULT 'team';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS parent_id       UUID    REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS head_designation TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true;

-- Drop the existing type check constraint and replace it with one that includes 'company'
DO $$
BEGIN
  -- Drop whichever check constraint name the table uses for the type column
  ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_type_check;
  ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_type_fkey;
  -- Re-add with full allowed set
  BEGIN
    ALTER TABLE teams ADD CONSTRAINT teams_type_check
      CHECK (type IN ('company', 'department', 'team'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Index for fast parent lookups
CREATE INDEX IF NOT EXISTS idx_teams_parent ON teams(parent_id);
CREATE INDEX IF NOT EXISTS idx_teams_type   ON teams(type);

-- ── Insert full org tree ─────────────────────────────────────────────────────
DO $$
DECLARE
  -- Company root
  root_id UUID;

  -- Department IDs
  d_central       UUID; d_leadership    UUID; d_inno          UUID;
  d_systems       UUID; d_aicontent     UUID; d_creative      UUID;
  d_education     UUID; d_brand         UUID; d_growth        UUID;
  d_delivery      UUID; d_client        UUID; d_people        UUID;
  d_control       UUID; d_governance    UUID; d_armarioh      UUID;

BEGIN

  -- ── 1. Company Root ────────────────────────────────────────────────────────
  INSERT INTO teams (name, type, parent_id, description, head_designation)
  VALUES ('Namaah', 'company', NULL, 'Namaah — Company Root Node', 'Founder & CEO')
  ON CONFLICT (name) DO UPDATE SET type = 'company', description = EXCLUDED.description
  RETURNING id INTO root_id;

  IF root_id IS NULL THEN
    SELECT id INTO root_id FROM teams WHERE name = 'Namaah' LIMIT 1;
  END IF;

  -- ── 2. Departments ─────────────────────────────────────────────────────────

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('CENTRAL', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_central;
  IF d_central IS NULL THEN SELECT id INTO d_central FROM teams WHERE name = 'CENTRAL'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('LEADERSHIP', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_leadership;
  IF d_leadership IS NULL THEN SELECT id INTO d_leadership FROM teams WHERE name = 'LEADERSHIP'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('INTELLIGENCE & INNOVATION', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_inno;
  IF d_inno IS NULL THEN SELECT id INTO d_inno FROM teams WHERE name = 'INTELLIGENCE & INNOVATION'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('SYSTEMS & ENGINEERING', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_systems;
  IF d_systems IS NULL THEN SELECT id INTO d_systems FROM teams WHERE name = 'SYSTEMS & ENGINEERING'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('AI CONTENT PIPELINE', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_aicontent;
  IF d_aicontent IS NULL THEN SELECT id INTO d_aicontent FROM teams WHERE name = 'AI CONTENT PIPELINE'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('CREATIVE', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_creative;
  IF d_creative IS NULL THEN SELECT id INTO d_creative FROM teams WHERE name = 'CREATIVE'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('EDUCATION', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_education;
  IF d_education IS NULL THEN SELECT id INTO d_education FROM teams WHERE name = 'EDUCATION'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('BRAND', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_brand;
  IF d_brand IS NULL THEN SELECT id INTO d_brand FROM teams WHERE name = 'BRAND'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('GROWTH', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_growth;
  IF d_growth IS NULL THEN SELECT id INTO d_growth FROM teams WHERE name = 'GROWTH'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('DELIVERY', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_delivery;
  IF d_delivery IS NULL THEN SELECT id INTO d_delivery FROM teams WHERE name = 'DELIVERY'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('CLIENT', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_client;
  IF d_client IS NULL THEN SELECT id INTO d_client FROM teams WHERE name = 'CLIENT'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('PEOPLE', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_people;
  IF d_people IS NULL THEN SELECT id INTO d_people FROM teams WHERE name = 'PEOPLE'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('CONTROL', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_control;
  IF d_control IS NULL THEN SELECT id INTO d_control FROM teams WHERE name = 'CONTROL'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('GOVERNANCE', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_governance;
  IF d_governance IS NULL THEN SELECT id INTO d_governance FROM teams WHERE name = 'GOVERNANCE'; END IF;

  INSERT INTO teams (name, type, parent_id, head_designation)
  VALUES ('ARMARIOH by Namaah', 'department', root_id, 'Department Lead')
  ON CONFLICT (name) DO UPDATE SET type = 'department', parent_id = root_id
  RETURNING id INTO d_armarioh;
  IF d_armarioh IS NULL THEN SELECT id INTO d_armarioh FROM teams WHERE name = 'ARMARIOH by Namaah'; END IF;

  -- ── 3. Teams ───────────────────────────────────────────────────────────────

  -- CENTRAL
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Namaah HQ', 'team', d_central, 'CENTRAL', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_central, type = 'team';

  -- LEADERSHIP
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Founder''s Office',                    'team', d_leadership, 'LEADERSHIP', 'Team Lead'),
    ('Strategic Initiatives Office',         'team', d_leadership, 'LEADERSHIP', 'Team Lead'),
    ('Capital Strategy & Investor Relations','team', d_leadership, 'LEADERSHIP', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_leadership, type = 'team';

  -- INTELLIGENCE & INNOVATION
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Data & Analytics',                          'team', d_inno, 'INTELLIGENCE & INNOVATION', 'Team Lead'),
    ('Namaah AI Research & Innovation (NARI)',    'team', d_inno, 'INTELLIGENCE & INNOVATION', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_inno, type = 'team';

  -- SYSTEMS & ENGINEERING
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Engineering Leadership',        'team', d_systems, 'SYSTEMS & ENGINEERING', 'Team Lead'),
    ('ATLAS AI Systems',              'team', d_systems, 'SYSTEMS & ENGINEERING', 'Team Lead'),
    ('Core Product Engineering',      'team', d_systems, 'SYSTEMS & ENGINEERING', 'Team Lead'),
    ('Namaah Originals Platform',     'team', d_systems, 'SYSTEMS & ENGINEERING', 'Team Lead'),
    ('Internal Systems & Automation', 'team', d_systems, 'SYSTEMS & ENGINEERING', 'Team Lead'),
    ('Infrastructure & Security',     'team', d_systems, 'SYSTEMS & ENGINEERING', 'Team Lead'),
    ('Creative Technologies',         'team', d_systems, 'SYSTEMS & ENGINEERING', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_systems, type = 'team';

  -- AI CONTENT PIPELINE
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Content Strategy & Programming', 'team', d_aicontent, 'AI CONTENT PIPELINE', 'Team Lead'),
    ('AI Pre-Production',              'team', d_aicontent, 'AI CONTENT PIPELINE', 'Team Lead'),
    ('AI Pipeline & Systems',          'team', d_aicontent, 'AI CONTENT PIPELINE', 'Team Lead'),
    ('AI Production Systems',          'team', d_aicontent, 'AI CONTENT PIPELINE', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_aicontent, type = 'team';

  -- CREATIVE
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Creative & Design Systems', 'team', d_creative, 'CREATIVE', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_creative, type = 'team';

  -- EDUCATION
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('NCTA - Academy',            'team', d_education, 'EDUCATION', 'Team Lead'),
    ('NCTA - Content & Creatives','team', d_education, 'EDUCATION', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_education, type = 'team';

  -- BRAND
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Brand & Digital Marketing Systems', 'team', d_brand, 'BRAND', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_brand, type = 'team';

  -- GROWTH
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Growth, Revenue & Partnerships', 'team', d_growth, 'GROWTH', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_growth, type = 'team';

  -- DELIVERY
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Delivery & PMO', 'team', d_delivery, 'DELIVERY', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_delivery, type = 'team';

  -- CLIENT
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Client Support & Experience', 'team', d_client, 'CLIENT', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_client, type = 'team';

  -- PEOPLE
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('People, Culture & HR', 'team', d_people, 'PEOPLE', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_people, type = 'team';

  -- CONTROL
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Finance Control', 'team', d_control, 'CONTROL', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_control, type = 'team';

  -- GOVERNANCE
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Legal & Compliance', 'team', d_governance, 'GOVERNANCE', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_governance, type = 'team';

  -- ARMARIOH by Namaah
  INSERT INTO teams (name, type, parent_id, department, head_designation) VALUES
    ('Armario H Studio', 'team', d_armarioh, 'ARMARIOH by Namaah', 'Team Lead')
  ON CONFLICT (name) DO UPDATE SET parent_id = d_armarioh, type = 'team';

  RAISE NOTICE 'Namaah org tree seeded: 1 company root, 15 departments, 28 teams';
END $$;
