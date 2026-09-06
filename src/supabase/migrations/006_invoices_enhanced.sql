-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 006: Enhanced Invoices Schema
-- Adds: project_id, team_id, issued_date, gst columns, invoice_items table
--       company_profile table for GST invoice header details
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Enhance existing invoices table ──────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id      UUID REFERENCES teams(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_date  DATE,
  ADD COLUMN IF NOT EXISTS cgst         NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst         NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst         NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal     NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS client_gstin  TEXT,
  ADD COLUMN IF NOT EXISTS client_email  TEXT,
  ADD COLUMN IF NOT EXISTS terms         TEXT,
  ADD COLUMN IF NOT EXISTS bank_details  TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply TEXT;

-- ─── 2. Invoice Line Items ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT        NOT NULL,
  hsn_sac     TEXT,
  quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
  rate        NUMERIC(15,2) NOT NULL DEFAULT 0,
  gst_rate    NUMERIC(5,2) NOT NULL DEFAULT 18,
  amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  cgst_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total       NUMERIC(15,2) NOT NULL DEFAULT 0,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Company GST Profile (for invoice header) ──────────────────────────────
CREATE TABLE IF NOT EXISTS company_profile (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name  TEXT        NOT NULL DEFAULT '',
  gstin         TEXT        NOT NULL DEFAULT '',
  pan           TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  pincode       TEXT,
  phone         TEXT,
  email         TEXT,
  logo_url      TEXT,
  bank_name     TEXT,
  bank_account  TEXT,
  bank_ifsc     TEXT,
  bank_branch   TEXT,
  default_terms TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE invoice_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_invoice_items_select" ON invoice_items;
DROP POLICY IF EXISTS "auth_invoice_items_insert" ON invoice_items;
DROP POLICY IF EXISTS "auth_invoice_items_update" ON invoice_items;
DROP POLICY IF EXISTS "auth_invoice_items_delete" ON invoice_items;
CREATE POLICY "auth_invoice_items_select" ON invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_invoice_items_insert" ON invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_invoice_items_update" ON invoice_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_invoice_items_delete" ON invoice_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_company_profile_select" ON company_profile;
DROP POLICY IF EXISTS "auth_company_profile_all"    ON company_profile;
CREATE POLICY "auth_company_profile_select" ON company_profile FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_company_profile_all"    ON company_profile FOR ALL    TO authenticated USING (true);

-- ─── 5. Realtime ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'invoice_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE invoice_items;
  END IF;
END $$;
