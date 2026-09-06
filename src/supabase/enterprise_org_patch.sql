-- =============================================================
-- NAMAAH PULSE: ENTERPRISE ORGANIZATIONAL PATCH (v3 - FINAL)
-- Run this in your Supabase SQL Editor to fix the storage issues
-- and enable the full hierarchy features.
-- =============================================================

-- SECTION 1: EXTEND SYSTEM CONFIGURATION
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_config' AND column_name='company_name') THEN
        ALTER TABLE system_config ADD COLUMN company_name TEXT DEFAULT 'Your Company';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_config' AND column_name='founder_name') THEN
        ALTER TABLE system_config ADD COLUMN founder_name TEXT DEFAULT 'Aryan';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_config' AND column_name='founder_designation') THEN
        ALTER TABLE system_config ADD COLUMN founder_designation TEXT DEFAULT 'Chief Executive Officer';
    END IF;
END $$;

-- SECTION 2: RESTRUCTURE TEAMS (Fixed for successful inserts)
DO $$ 
BEGIN
    -- 2.1 Add Hierarchy columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teams' AND column_name='type') THEN
        ALTER TABLE teams ADD COLUMN type TEXT CHECK (type IN ('department', 'team')) NOT NULL DEFAULT 'team';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teams' AND column_name='parent_id') THEN
        ALTER TABLE teams ADD COLUMN parent_id UUID REFERENCES teams(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='teams' AND column_name='head_designation') THEN
        ALTER TABLE teams ADD COLUMN head_designation TEXT;
    END IF;

    -- 2.2 IMPORTANT: Make legacy 'department' column NULLABLE 
    -- This prevents inserts from failing if 'department' is not provided.
    ALTER TABLE teams ALTER COLUMN department DROP NOT NULL;
END $$;

-- SECTION 3: SECURE ACCESS POLICIES (Syntax Fixed)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Teams') THEN
        CREATE POLICY "Public Read Teams" ON teams FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Config') THEN
        CREATE POLICY "Public Read Config" ON system_config FOR SELECT USING (true);
    END IF;
END $$;

-- SECTION 4: REALTIME ENABLEMENT
DO $$
BEGIN
    -- Ensure the publication exists or add tables to it
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE teams;
        ALTER PUBLICATION supabase_realtime ADD TABLE system_config;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL; -- Table might already be in publication
END $$;
