-- 04. CRM & SALES PIPELINE REALTIME INTEGRATION

-- 1. REPAIR LEADS TABLE (Ensures all CRM columns exist and match existing schema)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='leads') THEN
        CREATE TABLE leads (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name TEXT NOT NULL,
            company TEXT NOT NULL,
            value NUMERIC(20,2) NOT NULL DEFAULT 0,
            lead_name TEXT,
            lead_phone TEXT,
            emp_id UUID REFERENCES employees(id) ON DELETE SET NULL,
            stage TEXT CHECK (stage IN ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost')) NOT NULL DEFAULT 'new',
            priority TEXT CHECK (priority IN ('Critical', 'High', 'Medium')) NOT NULL DEFAULT 'Medium',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ELSE
        -- Add missing columns to existing table
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='name') THEN
            ALTER TABLE leads ADD COLUMN name TEXT;
            UPDATE leads SET name = company WHERE name IS NULL;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='company') THEN
            ALTER TABLE leads ADD COLUMN company TEXT;
            UPDATE leads SET company = name WHERE company IS NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='value') THEN
            ALTER TABLE leads ADD COLUMN value NUMERIC(20,2) DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='lead_name') THEN
            ALTER TABLE leads ADD COLUMN lead_name TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='lead_phone') THEN
            ALTER TABLE leads ADD COLUMN lead_phone TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='emp_id') THEN
            ALTER TABLE leads ADD COLUMN emp_id UUID REFERENCES employees(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='emp_name') THEN
            ALTER TABLE leads ADD COLUMN emp_name TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='stage') THEN
            ALTER TABLE leads ADD COLUMN stage TEXT CHECK (stage IN ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost')) DEFAULT 'new';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='priority') THEN
            ALTER TABLE leads ADD COLUMN priority TEXT CHECK (priority IN ('Critical', 'High', 'Medium')) DEFAULT 'Medium';
        END IF;
    END IF;
END $$;

-- 2. ENRICH CLIENTS TABLE 
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='value') THEN
        ALTER TABLE clients ADD COLUMN value NUMERIC(20,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='emp_id') THEN
        ALTER TABLE clients ADD COLUMN emp_id UUID REFERENCES employees(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='from_pipeline') THEN
        ALTER TABLE clients ADD COLUMN from_pipeline BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3. REALTIME ENABLEMENT
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- Add tables if not already present
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'leads') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE leads;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'clients') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE clients;
        END IF;
    END IF;
END $$;

-- 4. SYNC CLIENTS SCHEMA FOR CRM CONVERSION
-- Ensure clients table has all fields required for pipeline conversion
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS value NUMERIC(20,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS emp_id UUID REFERENCES employees(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'Standard';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS from_pipeline BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- 5. SEED DATA (Sample Leads)
INSERT INTO leads (name, company, value, lead_name, lead_phone, stage, priority)
VALUES 
    ('Reliance Industries Ltd', 'Reliance Industries Ltd', 12500000.00, 'Mukesh Ambani', '+91 22 4477 7000', 'negotiation', 'Critical'),
    ('Infosys Digital', 'Infosys Digital', 4500000.00, 'Narayana M.', '+91 80 2852 0261', 'contacted', 'High'),
    ('HDFC Bank', 'HDFC Bank', 8500000.00, 'Sashidhar J.', '+91 22 6652 1000', 'new', 'Medium')
ON CONFLICT DO NOTHING;
