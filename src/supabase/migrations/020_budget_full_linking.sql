-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 020: Full Budget Linking
--
-- Wires every money-out event into the budget spend engine:
--   purchases      → team_id added so team-scoped budgets track purchase spend
--   reimbursements → approved reimbursements reduce the employee's dept budget
--   claims         → approved/paid claims reduce the employee's dept budget
--   projects       → budget_id added so a project shows live budget utilisation
--
-- Replaces recalculate_budget_spent() with the full version that includes all
-- four spend sources. All existing triggers from migration 017 remain intact —
-- only the core function and new triggers are added here.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 1. Add team_id to purchases ─────────────────────────────────────────────
-- Allows team-scoped budgets to match purchases directly.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;


-- ─── 2. Add budget_id to projects ────────────────────────────────────────────
-- Lets a project be linked to a named budget so the project page shows
-- live spend vs budget.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL;


-- ─── 3. Add department_name snapshot to reimbursements & claims ──────────────
-- We need the employee's department at submission time (denormalised) so
-- recalculation doesn't need to chase employee records.
ALTER TABLE reimbursements
  ADD COLUMN IF NOT EXISTS department_name TEXT,
  ADD COLUMN IF NOT EXISTS team_id         UUID REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS department_name TEXT,
  ADD COLUMN IF NOT EXISTS team_id         UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Back-fill department from employees for existing rows
UPDATE reimbursements r
   SET department_name = e.department,
       team_id         = e.team_id
  FROM employees e
 WHERE e.id = r.employee_id
   AND r.department_name IS NULL;

UPDATE claims c
   SET department_name = e.department,
       team_id         = e.team_id
  FROM employees e
 WHERE e.id = c.employee_id
   AND c.department_name IS NULL;

-- Auto-populate on future inserts via trigger
CREATE OR REPLACE FUNCTION trg_snapshot_employee_dept()
RETURNS TRIGGER AS $$
BEGIN
  SELECT department, team_id
    INTO NEW.department_name, NEW.team_id
    FROM employees
   WHERE id = NEW.employee_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snapshot_dept_reimbursement ON reimbursements;
CREATE TRIGGER snapshot_dept_reimbursement
  BEFORE INSERT ON reimbursements
  FOR EACH ROW EXECUTE FUNCTION trg_snapshot_employee_dept();

DROP TRIGGER IF EXISTS snapshot_dept_claim ON claims;
CREATE TRIGGER snapshot_dept_claim
  BEFORE INSERT ON claims
  FOR EACH ROW EXECUTE FUNCTION trg_snapshot_employee_dept();


-- ─── 4. Replace recalculate_budget_spent with full 4-source version ──────────
CREATE OR REPLACE FUNCTION recalculate_budget_spent(p_budget_id UUID)
RETURNS VOID AS $$
DECLARE
  v_budget          budgets%ROWTYPE;
  v_purchase_spent  NUMERIC(15,2) := 0;
  v_sub_spent       NUMERIC(15,2) := 0;
  v_reimb_spent     NUMERIC(15,2) := 0;
  v_claims_spent    NUMERIC(15,2) := 0;
  v_months          INT;
  v_old_spent       NUMERIC(15,2);
  v_new_spent       NUMERIC(15,2);
BEGIN
  SELECT * INTO v_budget FROM budgets WHERE id = p_budget_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_months := CASE WHEN v_budget.fiscal_month IS NOT NULL THEN 1 ELSE 12 END;

  -- ── 4a. Purchase spend ────────────────────────────────────────────────────
  SELECT COALESCE(SUM(p.amount), 0)
    INTO v_purchase_spent
    FROM purchases p
   WHERE p.status <> 'cancelled'
     AND EXTRACT(YEAR  FROM p.date)::INT = v_budget.fiscal_year
     AND (v_budget.fiscal_month IS NULL
          OR EXTRACT(MONTH FROM p.date)::INT = v_budget.fiscal_month)
     AND (
           (v_budget.scope_type = 'company')
           OR (v_budget.scope_type = 'department' AND p.filed_by_dept = v_budget.department_name)
           OR (v_budget.scope_type = 'team'       AND p.team_id       = v_budget.team_id)
         );

  -- ── 4b. Subscription spend ────────────────────────────────────────────────
  SELECT COALESCE(SUM(
    CASE
      WHEN s.billing_cycle = 'Annual'    THEN s.cost_per_seat / 12.0
      WHEN s.billing_cycle = 'Quarterly' THEN s.cost_per_seat /  3.0
      WHEN s.billing_cycle = 'One-time'  THEN 0
      ELSE                                    s.cost_per_seat
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

  -- ── 4c. Approved reimbursements ───────────────────────────────────────────
  SELECT COALESCE(SUM(r.amount), 0)
    INTO v_reimb_spent
    FROM reimbursements r
   WHERE r.status IN ('approved','processed','paid')
     AND EXTRACT(YEAR  FROM r.requested_at)::INT = v_budget.fiscal_year
     AND (v_budget.fiscal_month IS NULL
          OR EXTRACT(MONTH FROM r.requested_at)::INT = v_budget.fiscal_month)
     AND (
           (v_budget.scope_type = 'company')
           OR (v_budget.scope_type = 'department' AND r.department_name = v_budget.department_name)
           OR (v_budget.scope_type = 'team'       AND r.team_id         = v_budget.team_id)
         );

  -- ── 4d. Approved / paid claims ────────────────────────────────────────────
  SELECT COALESCE(SUM(c.amount), 0)
    INTO v_claims_spent
    FROM claims c
   WHERE c.status IN ('approved','processed','paid')
     AND EXTRACT(YEAR  FROM c.requested_at)::INT = v_budget.fiscal_year
     AND (v_budget.fiscal_month IS NULL
          OR EXTRACT(MONTH FROM c.requested_at)::INT = v_budget.fiscal_month)
     AND (
           (v_budget.scope_type = 'company')
           OR (v_budget.scope_type = 'department' AND c.department_name = v_budget.department_name)
           OR (v_budget.scope_type = 'team'       AND c.team_id         = v_budget.team_id)
         );

  -- ── Write back ────────────────────────────────────────────────────────────
  v_old_spent := v_budget.purchase_spent + v_budget.sub_spent;
  v_new_spent := ROUND(v_purchase_spent + v_sub_spent + v_reimb_spent + v_claims_spent, 2);

  -- Store reimbursement + claims inside purchase_spent (combined "cash out")
  -- so the generated actual_spent column still = purchase_spent + sub_spent
  UPDATE budgets
     SET purchase_spent = ROUND(v_purchase_spent + v_reimb_spent + v_claims_spent, 2),
         sub_spent      = ROUND(v_sub_spent, 2),
         updated_at     = NOW()
   WHERE id = p_budget_id;

  -- ── Threshold alerts ──────────────────────────────────────────────────────
  IF v_new_spent > v_budget.total_amount AND v_old_spent <= v_budget.total_amount THEN
    INSERT INTO budget_alerts (budget_id, alert_type, message, spent, total)
    VALUES (p_budget_id, 'over_budget',
      'Budget "' || v_budget.name || '" exceeded its total amount.',
      v_new_spent, v_budget.total_amount);

  ELSIF v_new_spent >= (v_budget.total_amount * 0.85)
    AND v_old_spent  < (v_budget.total_amount * 0.85)
    AND v_new_spent  < v_budget.total_amount
  THEN
    INSERT INTO budget_alerts (budget_id, alert_type, message, spent, total)
    VALUES (p_budget_id, 'near_limit',
      'Budget "' || v_budget.name || '" reached 85% utilisation.',
      v_new_spent, v_budget.total_amount);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 5. Triggers on reimbursements ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_reimbursement_update_budget()
RETURNS TRIGGER AS $$
DECLARE
  v_year  INT;
  v_month INT;
  v_dept  TEXT;
  v_team  UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_year := EXTRACT(YEAR  FROM OLD.requested_at)::INT;
    v_month:= EXTRACT(MONTH FROM OLD.requested_at)::INT;
    v_dept := OLD.department_name; v_team := OLD.team_id;
  ELSE
    v_year := EXTRACT(YEAR  FROM NEW.requested_at)::INT;
    v_month:= EXTRACT(MONTH FROM NEW.requested_at)::INT;
    v_dept := NEW.department_name; v_team := NEW.team_id;
  END IF;

  PERFORM recalculate_budget_spent(b.id)
    FROM budgets b
   WHERE b.status = 'active'
     AND b.fiscal_year = v_year
     AND (b.fiscal_month IS NULL OR b.fiscal_month = v_month)
     AND (
           b.scope_type = 'company'
           OR (b.scope_type = 'department' AND b.department_name = v_dept)
           OR (b.scope_type = 'team'       AND b.team_id         = v_team)
         );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS reimbursements_sync_budget ON reimbursements;
CREATE TRIGGER reimbursements_sync_budget
  AFTER INSERT OR UPDATE OF amount, status, department_name, team_id OR DELETE
  ON reimbursements
  FOR EACH ROW EXECUTE FUNCTION trg_reimbursement_update_budget();


-- ─── 6. Triggers on claims ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_claims_update_budget()
RETURNS TRIGGER AS $$
DECLARE
  v_year  INT;
  v_month INT;
  v_dept  TEXT;
  v_team  UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_year := EXTRACT(YEAR  FROM OLD.requested_at)::INT;
    v_month:= EXTRACT(MONTH FROM OLD.requested_at)::INT;
    v_dept := OLD.department_name; v_team := OLD.team_id;
  ELSE
    v_year := EXTRACT(YEAR  FROM NEW.requested_at)::INT;
    v_month:= EXTRACT(MONTH FROM NEW.requested_at)::INT;
    v_dept := NEW.department_name; v_team := NEW.team_id;
  END IF;

  -- Only recalculate when status moves to/from an approved state
  IF TG_OP = 'UPDATE'
     AND OLD.status = NEW.status
     AND OLD.amount = NEW.amount THEN
    RETURN NEW;
  END IF;

  PERFORM recalculate_budget_spent(b.id)
    FROM budgets b
   WHERE b.status = 'active'
     AND b.fiscal_year = v_year
     AND (b.fiscal_month IS NULL OR b.fiscal_month = v_month)
     AND (
           b.scope_type = 'company'
           OR (b.scope_type = 'department' AND b.department_name = v_dept)
           OR (b.scope_type = 'team'       AND b.team_id         = v_team)
         );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS claims_sync_budget ON claims;
CREATE TRIGGER claims_sync_budget
  AFTER INSERT OR UPDATE OF amount, status, department_name, team_id OR DELETE
  ON claims
  FOR EACH ROW EXECUTE FUNCTION trg_claims_update_budget();


-- ─── 7. purchases team_id trigger (existing trigger picks it up already) ─────
-- The purchases_sync_budget trigger from 017 fires on INSERT/UPDATE/DELETE.
-- Now that purchases.team_id exists, re-create it to also fire on team_id changes.
DROP TRIGGER IF EXISTS purchases_sync_budget ON purchases;
CREATE TRIGGER purchases_sync_budget
  AFTER INSERT OR UPDATE OF amount, date, status, filed_by_dept, team_id OR DELETE
  ON purchases
  FOR EACH ROW EXECUTE FUNCTION trg_purchases_update_budget();


-- ─── 8. Enable realtime on reimbursements & claims ───────────────────────────
-- (budget_alerts already added in 017)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE reimbursements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE claims;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;


-- ─── 9. Back-fill all active budgets with the new full spend calculation ──────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM budgets WHERE status IN ('active','draft') LOOP
    PERFORM recalculate_budget_spent(r.id);
  END LOOP;
END;
$$;
