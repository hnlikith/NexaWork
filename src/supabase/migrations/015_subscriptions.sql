-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 015: Subscriptions & Assignments
-- Creates: subscriptions, subscription_assignments with auto-numbering,
--          RLS, realtime, and email-delivery tracking
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Subscriptions table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_number       TEXT          NOT NULL UNIQUE,
  name             TEXT          NOT NULL,
  provider         TEXT,
  category         TEXT          NOT NULL DEFAULT 'Software',
  logo_url         TEXT,
  cost_per_seat    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_seats      INT           NOT NULL DEFAULT 1,
  billing_cycle    TEXT          NOT NULL DEFAULT 'Monthly'
                                 CHECK (billing_cycle IN ('Monthly','Annual','Quarterly','One-time')),
  currency         TEXT          NOT NULL DEFAULT 'INR',
  renewal_date     DATE,
  status           TEXT          NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','expiring','inactive','cancelled','trial')),
  notes            TEXT,
  website_url      TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── 2. Subscription Assignments table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_assignments (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id   UUID        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  assignment_type   TEXT        NOT NULL CHECK (assignment_type IN ('department','team','employee')),

  -- target (one populated depending on assignment_type)
  department_name   TEXT,
  team_id           UUID        REFERENCES teams(id) ON DELETE SET NULL,
  employee_id       UUID        REFERENCES employees(id) ON DELETE CASCADE,

  -- seat allocation
  seats_allocated   INT         NOT NULL DEFAULT 1,

  -- access credentials
  access_email      TEXT,
  access_login      TEXT,
  access_note       TEXT,

  -- email delivery tracking
  credentials_sent  BOOLEAN     NOT NULL DEFAULT FALSE,
  sent_at           TIMESTAMPTZ,
  sent_by_emp_id    TEXT,
  sent_by_name      TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Auto-generate sub_number ─────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS sub_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_sub_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sub_number IS NULL OR NEW.sub_number = '' THEN
    NEW.sub_number := 'SUB-' || LPAD(nextval('sub_number_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_sub_number ON subscriptions;
CREATE TRIGGER set_sub_number
  BEFORE INSERT ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION generate_sub_number();

-- ─── 4. Auto-update updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

-- ─── 5. Auto-expire subscriptions nearing renewal ────────────────────────────
-- Sets status to 'expiring' if renewal_date is within 30 days and status is 'active'
CREATE OR REPLACE FUNCTION check_subscription_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.renewal_date IS NOT NULL
     AND NEW.renewal_date <= (CURRENT_DATE + INTERVAL '30 days')
     AND NEW.renewal_date >= CURRENT_DATE
     AND NEW.status = 'active' THEN
    NEW.status := 'expiring';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_expiry_check ON subscriptions;
CREATE TRIGGER auto_expiry_check
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION check_subscription_expiry();

-- ─── 6. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE subscriptions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_select"  ON subscriptions;
DROP POLICY IF EXISTS "sub_insert"  ON subscriptions;
DROP POLICY IF EXISTS "sub_update"  ON subscriptions;
DROP POLICY IF EXISTS "sub_delete"  ON subscriptions;
CREATE POLICY "sub_select" ON subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub_insert" ON subscriptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sub_update" ON subscriptions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "sub_delete" ON subscriptions FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "assign_select" ON subscription_assignments;
DROP POLICY IF EXISTS "assign_insert" ON subscription_assignments;
DROP POLICY IF EXISTS "assign_update" ON subscription_assignments;
DROP POLICY IF EXISTS "assign_delete" ON subscription_assignments;
CREATE POLICY "assign_select" ON subscription_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "assign_insert" ON subscription_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "assign_update" ON subscription_assignments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "assign_delete" ON subscription_assignments FOR DELETE TO authenticated USING (true);

-- ─── 7. Realtime publication ──────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE subscription_assignments;
