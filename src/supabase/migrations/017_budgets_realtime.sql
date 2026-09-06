-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 017: Budget Real-Time Hardening
--
-- STEP 1 → Add spent_amount columns to budgets (persisted, DB-maintained)
-- STEP 2 → Trigger: recalculate spent when a purchase is inserted/updated/deleted
-- STEP 3 → Trigger: recalculate spent when a subscription_assignment changes
-- STEP 4 → Trigger: guard allocations sum ≤ budget total_amount
-- STEP 5 → Trigger: guard allocations sum ≤ total_amount on UPDATE too
-- STEP 6 → Function: full recalculate for one budget (called by all triggers)
-- STEP 7 → Fix billing-cycle math (annual/quarterly per fiscal_month budgets)
-- STEP 8 → Tighten RLS (Finance/Admin full access; others read-only)
-- STEP 9 → Over-budget notification log table + trigger
-- STEP 10 → Back-fill spent_amount for all existing budgets
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── STEP 1: Add persisted spend columns to budgets ──────────────────────────
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS purchase_spent  NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sub_spent       NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_spent    NUMERIC(15,2)
    GENERATED ALWAYS AS (purchase_spent + sub_spent) STORED;


-- ─── STEP 9-prep: Over-budget alert log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_alerts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id   UUID        NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  alert_type  TEXT        NOT NULL CHECK (alert_type IN ('over_budget','near_limit','allocation_rejected')),
  message     TEXT        NOT NULL,
  spent       NUMERIC(15,2),
  total       NUMERIC(15,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alerts_select" ON budget_alerts;
DROP POLICY IF EXISTS "alerts_insert" ON budget_alerts;
CREATE POLICY "alerts_select" ON budget_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts_insert" ON budget_alerts FOR INSERT TO authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE budget_alerts;


-- ─── STEP 6: Core recalculate function ───────────────────────────────────────
-- Recalculates purchase_spent and sub_spent for a single budget row and writes
-- the result back to budgets. Called by all downstream triggers.

CREATE OR REPLACE FUNCTION recalculate_budget_spent(p_budget_id UUID)
RETURNS VOID AS $$
DECLARE
  v_budget         budgets%ROWTYPE;
  v_purchase_spent NUMERIC(15,2) := 0;
  v_sub_spent      NUMERIC(15,2) := 0;
  v_months         INT;
  v_monthly_cost   NUMERIC(15,2);
  v_old_spent      NUMERIC(15,2);
  v_new_spent      NUMERIC(15,2);
BEGIN
  SELECT * INTO v_budget FROM budgets WHERE id = p_budget_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- months this budget covers (1 if monthly, 12 if annual)
  v_months := CASE WHEN v_budget.fiscal_month IS NOT NULL THEN 1 ELSE 12 END;

  -- ── Purchase spend ────────────────────────────────────────────────────────
  -- Match purchases by fiscal year, optional month, and scope
  SELECT COALESCE(SUM(p.amount), 0)
    INTO v_purchase_spent
    FROM purchases p
   WHERE p.status <> 'cancelled'
     AND EXTRACT(YEAR  FROM p.date)::INT = v_budget.fiscal_year
     AND (
           v_budget.fiscal_month IS NULL
           OR EXTRACT(MONTH FROM p.date)::INT = v_budget.fiscal_month
         )
     AND (
           (v_budget.scope_type = 'company')
           OR (v_budget.scope_type = 'department' AND p.filed_by_dept = v_budget.department_name)
           -- team scope: purchases don't carry team_id directly, skip
         );

  -- ── Subscription spend ────────────────────────────────────────────────────
  -- Normalise each billing cycle to a monthly per-seat cost, then × seats × months
  SELECT COALESCE(SUM(
    CASE
      WHEN s.billing_cycle = 'Annual'    THEN (s.cost_per_seat / 12.0)
      WHEN s.billing_cycle = 'Quarterly' THEN (s.cost_per_seat /  3.0)
      WHEN s.billing_cycle = 'One-time'  THEN 0
      ELSE                                    s.cost_per_seat           -- Monthly
    END
    * sa.seats_allocated
    * v_months
  ), 0)
    INTO v_sub_spent
    FROM subscription_assignments sa
    JOIN subscriptions s ON s.id = sa.subscription_id
   WHERE s.status IN ('active','expiring')
     AND (
           (v_budget.scope_type = 'company')
           OR (v_budget.scope_type = 'department' AND sa.department_name = v_budget.department_name)
           OR (v_budget.scope_type = 'team'       AND sa.team_id         = v_budget.team_id)
         );

  -- ── Write back ────────────────────────────────────────────────────────────
  v_old_spent := v_budget.purchase_spent + v_budget.sub_spent;
  v_new_spent := ROUND(v_purchase_spent, 2) + ROUND(v_sub_spent, 2);

  UPDATE budgets
     SET purchase_spent = ROUND(v_purchase_spent, 2),
         sub_spent      = ROUND(v_sub_spent,      2),
         updated_at     = NOW()
   WHERE id = p_budget_id;

  -- ── Over-budget alert (only fire when crossing the threshold) ─────────────
  IF v_new_spent > v_budget.total_amount AND v_old_spent <= v_budget.total_amount THEN
    INSERT INTO budget_alerts (budget_id, alert_type, message, spent, total)
    VALUES (
      p_budget_id,
      'over_budget',
      'Budget "' || v_budget.name || '" has exceeded its total amount.',
      v_new_spent,
      v_budget.total_amount
    );
  ELSIF v_new_spent >= (v_budget.total_amount * 0.85)
    AND v_old_spent  < (v_budget.total_amount * 0.85)
    AND v_new_spent  < v_budget.total_amount
  THEN
    INSERT INTO budget_alerts (budget_id, alert_type, message, spent, total)
    VALUES (
      p_budget_id,
      'near_limit',
      'Budget "' || v_budget.name || '" has reached 85% utilisation.',
      v_new_spent,
      v_budget.total_amount
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── STEP 2: Trigger on purchases ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_purchases_update_budget()
RETURNS TRIGGER AS $$
DECLARE
  v_year  INT;
  v_month INT;
  v_dept  TEXT;
BEGIN
  -- Determine the relevant purchase attributes (NEW on insert/update, OLD on delete)
  IF TG_OP = 'DELETE' THEN
    v_year  := EXTRACT(YEAR  FROM OLD.date)::INT;
    v_month := EXTRACT(MONTH FROM OLD.date)::INT;
    v_dept  := OLD.filed_by_dept;
  ELSE
    v_year  := EXTRACT(YEAR  FROM NEW.date)::INT;
    v_month := EXTRACT(MONTH FROM NEW.date)::INT;
    v_dept  := NEW.filed_by_dept;
  END IF;

  -- Recalculate all budgets that could be affected by this purchase
  PERFORM recalculate_budget_spent(b.id)
    FROM budgets b
   WHERE b.status = 'active'
     AND b.fiscal_year = v_year
     AND (b.fiscal_month IS NULL OR b.fiscal_month = v_month)
     AND (
           b.scope_type = 'company'
           OR (b.scope_type = 'department' AND b.department_name = v_dept)
         );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS purchases_sync_budget ON purchases;
CREATE TRIGGER purchases_sync_budget
  AFTER INSERT OR UPDATE OF amount, date, status, filed_by_dept OR DELETE
  ON purchases
  FOR EACH ROW EXECUTE FUNCTION trg_purchases_update_budget();


-- ─── STEP 3: Trigger on subscription_assignments ─────────────────────────────
CREATE OR REPLACE FUNCTION trg_sub_assignment_update_budget()
RETURNS TRIGGER AS $$
DECLARE
  v_dept TEXT;
  v_team UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_dept := OLD.department_name;
    v_team := OLD.team_id;
  ELSE
    v_dept := NEW.department_name;
    v_team := NEW.team_id;
  END IF;

  PERFORM recalculate_budget_spent(b.id)
    FROM budgets b
   WHERE b.status = 'active'
     AND (
           b.scope_type = 'company'
           OR (b.scope_type = 'department' AND b.department_name = v_dept)
           OR (b.scope_type = 'team'       AND b.team_id         = v_team)
         );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sub_assignments_sync_budget ON subscription_assignments;
CREATE TRIGGER sub_assignments_sync_budget
  AFTER INSERT OR UPDATE OF seats_allocated, department_name, team_id OR DELETE
  ON subscription_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_sub_assignment_update_budget();

-- Also recalculate when subscription cost/status changes
CREATE OR REPLACE FUNCTION trg_subscription_update_budget()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_budget_spent(b.id)
    FROM budgets b
    JOIN subscription_assignments sa ON (
      b.scope_type = 'company'
      OR (b.scope_type = 'department' AND sa.department_name = b.department_name)
      OR (b.scope_type = 'team'       AND sa.team_id         = b.team_id)
    )
   WHERE sa.subscription_id = NEW.id
     AND b.status = 'active';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS subscriptions_sync_budget ON subscriptions;
CREATE TRIGGER subscriptions_sync_budget
  AFTER UPDATE OF cost_per_seat, billing_cycle, status
  ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trg_subscription_update_budget();


-- ─── STEP 4 & 5: Allocation ceiling guard ────────────────────────────────────
-- Prevents any allocation INSERT/UPDATE from pushing total allocations above
-- the parent budget's total_amount. Raises a user-visible error.

CREATE OR REPLACE FUNCTION trg_guard_allocation_ceiling()
RETURNS TRIGGER AS $$
DECLARE
  v_budget        budgets%ROWTYPE;
  v_existing_sum  NUMERIC(15,2);
  v_this_alloc    NUMERIC(15,2);
  v_projected     NUMERIC(15,2);
BEGIN
  SELECT * INTO v_budget FROM budgets WHERE id = NEW.budget_id;

  -- Sum of all OTHER allocations for this budget
  SELECT COALESCE(SUM(allocated), 0)
    INTO v_existing_sum
    FROM budget_allocations
   WHERE budget_id = NEW.budget_id
     AND id IS DISTINCT FROM NEW.id;  -- exclude self on UPDATE

  v_this_alloc := COALESCE(NEW.allocated, 0);
  v_projected  := v_existing_sum + v_this_alloc;

  IF v_projected > v_budget.total_amount THEN
    -- Log a rejected alert
    INSERT INTO budget_alerts (budget_id, alert_type, message, spent, total)
    VALUES (
      NEW.budget_id,
      'allocation_rejected',
      'Allocation of ₹' || v_this_alloc::TEXT || ' rejected — would exceed budget total of ₹' || v_budget.total_amount::TEXT,
      v_projected,
      v_budget.total_amount
    );
    RAISE EXCEPTION 'Allocation exceeds budget total. Projected: %, Limit: %',
      v_projected, v_budget.total_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS guard_allocation_ceiling ON budget_allocations;
CREATE TRIGGER guard_allocation_ceiling
  BEFORE INSERT OR UPDATE OF allocated
  ON budget_allocations
  FOR EACH ROW EXECUTE FUNCTION trg_guard_allocation_ceiling();


-- ─── STEP 8: Tighten RLS ─────────────────────────────────────────────────────
-- Finance role and Admin role → full CRUD
-- All other authenticated users → SELECT only

-- budgets
DROP POLICY IF EXISTS "budgets_select"         ON budgets;
DROP POLICY IF EXISTS "budgets_insert"         ON budgets;
DROP POLICY IF EXISTS "budgets_update"         ON budgets;
DROP POLICY IF EXISTS "budgets_delete"         ON budgets;
DROP POLICY IF EXISTS "budgets_insert_finance" ON budgets;
DROP POLICY IF EXISTS "budgets_update_finance" ON budgets;
DROP POLICY IF EXISTS "budgets_delete_finance" ON budgets;

-- Everyone can read
CREATE POLICY "budgets_select" ON budgets
  FOR SELECT TO authenticated USING (true);

-- Only Finance / Admin can write
CREATE POLICY "budgets_insert_finance" ON budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.id = auth.uid()
         AND e.role IN ('super_admin','accounts')
    )
  );

CREATE POLICY "budgets_update_finance" ON budgets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.id = auth.uid()
         AND e.role IN ('super_admin','accounts')
    )
  );

CREATE POLICY "budgets_delete_finance" ON budgets
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.id = auth.uid()
         AND e.role IN ('super_admin','accounts')
    )
  );

-- budget_allocations (same pattern)
DROP POLICY IF EXISTS "alloc_select"         ON budget_allocations;
DROP POLICY IF EXISTS "alloc_insert"         ON budget_allocations;
DROP POLICY IF EXISTS "alloc_update"         ON budget_allocations;
DROP POLICY IF EXISTS "alloc_delete"         ON budget_allocations;
DROP POLICY IF EXISTS "alloc_insert_finance" ON budget_allocations;
DROP POLICY IF EXISTS "alloc_update_finance" ON budget_allocations;
DROP POLICY IF EXISTS "alloc_delete_finance" ON budget_allocations;

CREATE POLICY "alloc_select" ON budget_allocations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "alloc_insert_finance" ON budget_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.id = auth.uid()
         AND e.role IN ('super_admin','accounts')
    )
  );

CREATE POLICY "alloc_update_finance" ON budget_allocations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.id = auth.uid()
         AND e.role IN ('super_admin','accounts')
    )
  );

CREATE POLICY "alloc_delete_finance" ON budget_allocations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.id = auth.uid()
         AND e.role IN ('super_admin','accounts')
    )
  );


-- ─── STEP 10: Back-fill spent_amount for all existing active budgets ─────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM budgets WHERE status IN ('active','draft') LOOP
    PERFORM recalculate_budget_spent(r.id);
  END LOOP;
END;
$$;
