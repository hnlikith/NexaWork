-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 013: Vendors & Purchases Tables
-- Creates: vendors, purchases tables with full RLS, realtime, and auto-numbering
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Vendors table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT         NOT NULL,
  contact_person TEXT,
  email          TEXT,
  phone          TEXT,
  category       TEXT         NOT NULL DEFAULT 'General',
  total_paid     NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 2. Purchases table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_number  TEXT         NOT NULL UNIQUE,
  vendor_id        UUID         REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name      TEXT         NOT NULL,
  description      TEXT         NOT NULL,
  category         TEXT         NOT NULL DEFAULT 'General',
  amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  date             DATE         NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT         NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'paid', 'cancelled')),
  invoice_id       UUID         REFERENCES invoices(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── 3. Auto-generate purchase_number ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS purchase_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_purchase_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.purchase_number IS NULL OR NEW.purchase_number = '' THEN
    NEW.purchase_number := 'PUR-' || LPAD(nextval('purchase_number_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_purchase_number ON purchases;
CREATE TRIGGER set_purchase_number
  BEFORE INSERT ON purchases
  FOR EACH ROW EXECUTE FUNCTION generate_purchase_number();

-- ─── 4. Auto-update updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_purchases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS purchases_updated_at ON purchases;
CREATE TRIGGER purchases_updated_at
  BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION update_purchases_updated_at();

-- ─── 5. Auto-update vendor total_paid when purchase status changes ────────────
CREATE OR REPLACE FUNCTION sync_vendor_total_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    UPDATE vendors
    SET total_paid = (
      SELECT COALESCE(SUM(amount), 0)
      FROM purchases
      WHERE vendor_id = NEW.vendor_id AND status = 'paid'
    )
    WHERE id = NEW.vendor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_vendor_paid ON purchases;
CREATE TRIGGER sync_vendor_paid
  AFTER INSERT OR UPDATE OF status, amount ON purchases
  FOR EACH ROW EXECUTE FUNCTION sync_vendor_total_paid();

-- ─── 6. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE vendors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Vendors
DROP POLICY IF EXISTS "vendors_select" ON vendors;
DROP POLICY IF EXISTS "vendors_insert" ON vendors;
DROP POLICY IF EXISTS "vendors_update" ON vendors;
DROP POLICY IF EXISTS "vendors_delete" ON vendors;
CREATE POLICY "vendors_select" ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendors_insert" ON vendors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vendors_update" ON vendors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "vendors_delete" ON vendors FOR DELETE TO authenticated USING (true);

-- Purchases
DROP POLICY IF EXISTS "purchases_select" ON purchases;
DROP POLICY IF EXISTS "purchases_insert" ON purchases;
DROP POLICY IF EXISTS "purchases_update" ON purchases;
DROP POLICY IF EXISTS "purchases_delete" ON purchases;
CREATE POLICY "purchases_select" ON purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchases_insert" ON purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchases_update" ON purchases FOR UPDATE TO authenticated USING (true);
CREATE POLICY "purchases_delete" ON purchases FOR DELETE TO authenticated USING (true);

-- ─── 7. Realtime publication ──────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE vendors;
ALTER PUBLICATION supabase_realtime ADD TABLE purchases;
