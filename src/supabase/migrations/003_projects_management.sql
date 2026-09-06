-- 03. PROJECTS & CLIENTS MANAGEMENT SCHEMA

-- CLEANUP (Only run if you want to reset these tables)
-- DROP TABLE IF EXISTS project_teams;
-- DROP TABLE IF EXISTS projects;
-- DROP TABLE IF EXISTS clients;

-- 1. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    lead_name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    budget NUMERIC(20,2) NOT NULL DEFAULT 0,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    phase TEXT CHECK (phase IN ('SCOPING', 'IMPLEMENTATION', 'REVIEW', 'COMPLETED')) NOT NULL DEFAULT 'SCOPING',
    due_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PROJECT TEAMS (Junction)
CREATE TABLE IF NOT EXISTS project_teams (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, team_id)
);

-- REALTIME CONFIG
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE project_teams;

-- SEED CLIENTS
INSERT INTO clients (name, lead_name) 
VALUES 
    ('Nexus Holdings', 'Arthur Clarke'),
    ('Axiom Aerospace', 'Elon Reeve'),
    ('Vertex Logistics', 'Sarah Connor')
ON CONFLICT (name) DO NOTHING;

-- TRIGGER FOR UPDATED_AT
DROP TRIGGER IF EXISTS tr_update_projects_at ON projects;
CREATE TRIGGER tr_update_projects_at 
    BEFORE UPDATE ON projects 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();
