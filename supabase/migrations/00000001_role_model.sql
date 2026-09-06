-- ============================================================================
-- 00000001_role_model.sql
-- Final role model for NexaWork.
--
-- Goals:
--   1. Reduce roles to 4: admin, hr, accounts, employee (intern = employee variant)
--   2. Manager-ness becomes a flag on employees, NOT a role
--   3. Per-employee permission overrides (employee_permissions) so admins can
--      grant individual exceptions without changing role
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─── 1. Add new role values to user_role enum (if it exists) ────────────────
-- If user_role enum doesn't exist (fresh DB before baseline), skip — baseline
-- will create the final shape directly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- Add any missing values (no-op if already present)
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hr';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accounts';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ─── 2. Manager-scope flags on employees ────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS is_dept_lead          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_team_lead          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS managed_department_id UUID,
  ADD COLUMN IF NOT EXISTS managed_team_id       UUID;

-- Add FKs if the referenced tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'departments') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_employee_managed_department') THEN
      ALTER TABLE public.employees
        ADD CONSTRAINT fk_employee_managed_department
        FOREIGN KEY (managed_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teams') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_employee_managed_team') THEN
      ALTER TABLE public.employees
        ADD CONSTRAINT fk_employee_managed_team
        FOREIGN KEY (managed_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Helpful indexes for "who's a manager?" lookups
CREATE INDEX IF NOT EXISTS idx_employees_is_dept_lead ON public.employees(is_dept_lead) WHERE is_dept_lead = true;
CREATE INDEX IF NOT EXISTS idx_employees_is_team_lead ON public.employees(is_team_lead) WHERE is_team_lead = true;
CREATE INDEX IF NOT EXISTS idx_employees_managed_dept ON public.employees(managed_department_id) WHERE managed_department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_managed_team ON public.employees(managed_team_id) WHERE managed_team_id IS NOT NULL;

-- ─── 3. Migrate existing dept_lead / team_lead users to flags ───────────────
-- If your current DB still has 'dept_lead' / 'team_lead' role values, convert
-- them: set the appropriate flag, change role to 'employee'. Non-destructive
-- if those role values aren't present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'dept_lead'
  ) THEN
    UPDATE public.employees
      SET is_dept_lead = true,
          role = 'employee'::user_role
      WHERE role::text = 'dept_lead';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'team_lead'
  ) THEN
    UPDATE public.employees
      SET is_team_lead = true,
          role = 'employee'::user_role
      WHERE role::text = 'team_lead';
  END IF;
END $$;

-- ─── 4. Per-employee permission overrides ───────────────────────────────────
-- Effective permission for an employee on a module =
--   COALESCE(employee_permissions.<field>, role_permissions.<field>, false)
-- i.e. if there's an override row, it wins; otherwise fall back to role default.
CREATE TABLE IF NOT EXISTS public.employee_permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  module_key   TEXT NOT NULL,
  can_view     BOOLEAN,
  can_create   BOOLEAN,
  can_edit     BOOLEAN,
  can_delete   BOOLEAN,
  can_export   BOOLEAN,
  reason       TEXT,
  updated_by   UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_employee_permissions_employee ON public.employee_permissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_module   ON public.employee_permissions(module_key);

-- ─── 5. RLS on employee_permissions ─────────────────────────────────────────
ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_employee_permissions"     ON public.employee_permissions;
DROP POLICY IF EXISTS "self_read_employee_permissions"     ON public.employee_permissions;

-- Admin can do anything
CREATE POLICY "admin_all_employee_permissions"
ON public.employee_permissions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  )
);

-- Any authenticated user can read their own overrides (so the client can merge)
CREATE POLICY "self_read_employee_permissions"
ON public.employee_permissions FOR SELECT
USING (employee_id = auth.uid());

-- ─── 6. Convenience view: effective_permissions ─────────────────────────────
-- A view that returns the effective permission for any employee/module pair,
-- merging role defaults with per-employee overrides.
CREATE OR REPLACE VIEW public.effective_permissions AS
SELECT
  e.id AS employee_id,
  rp.module_key,
  COALESCE(ep.can_view,   rp.can_view,   false) AS can_view,
  COALESCE(ep.can_create, rp.can_create, false) AS can_create,
  COALESCE(ep.can_edit,   rp.can_edit,   false) AS can_edit,
  COALESCE(ep.can_delete, rp.can_delete, false) AS can_delete,
  COALESCE(ep.can_export, rp.can_export, false) AS can_export,
  CASE WHEN ep.id IS NOT NULL THEN true ELSE false END AS is_overridden
FROM public.employees e
CROSS JOIN public.role_permissions rp
LEFT JOIN public.employee_permissions ep
  ON ep.employee_id = e.id AND ep.module_key = rp.module_key
WHERE e.is_active = true
  AND e.role::text = rp.role::text;

-- ─── 7. Audit trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_employee_permission_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only log if audit_logs table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    INSERT INTO public.audit_logs (user_id, action, target_type, target_id, metadata)
    VALUES (
      auth.uid(),
      CASE TG_OP
        WHEN 'INSERT' THEN 'employee_permission_override_added'
        WHEN 'UPDATE' THEN 'employee_permission_override_changed'
        WHEN 'DELETE' THEN 'employee_permission_override_removed'
      END,
      'employee',
      COALESCE(NEW.employee_id, OLD.employee_id)::text,
      jsonb_build_object(
        'module_key', COALESCE(NEW.module_key, OLD.module_key),
        'reason',     COALESCE(NEW.reason, OLD.reason)
      )
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_employee_permission_change ON public.employee_permissions;
CREATE TRIGGER trg_log_employee_permission_change
AFTER INSERT OR UPDATE OR DELETE ON public.employee_permissions
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_employee_permission_change();

-- ─── Done. ──────────────────────────────────────────────────────────────────
