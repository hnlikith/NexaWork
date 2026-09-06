-- ════════════════════════════════════════════════════════════════════════════
-- Attendance & Leave Engine
-- Adds: expanded attendance_settings, weekly-off cycle/allotment/change tables,
--       and a sick-leave table (certificate stored as a LINK, no storage).
-- Idempotent — safe to run in the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Expanded admin "Attendance Controls" settings (singleton row id = 1) ────
ALTER TABLE attendance_settings
  -- Weekly-off policy
  ADD COLUMN IF NOT EXISTS weekoff_mode            text    NOT NULL DEFAULT 'flexible',      -- 'flexible' | 'fixed_weekend'
  ADD COLUMN IF NOT EXISTS weekoffs_per_month       int     NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS max_weekoffs_per_week    int     NOT NULL DEFAULT 1,               -- 1 or 2
  ADD COLUMN IF NOT EXISTS weekoff_carry_forward    boolean NOT NULL DEFAULT true,            -- week N→N+1 (paired) carry
  ADD COLUMN IF NOT EXISTS recycle_day              int     NOT NULL DEFAULT 25,              -- day-of-month balances reset
  ADD COLUMN IF NOT EXISTS lock_day                 int     NOT NULL DEFAULT 28,              -- pre-allotment deadline
  ADD COLUMN IF NOT EXISTS auto_assign_sundays      boolean NOT NULL DEFAULT true,            -- after lock, un-allotted → every Sunday
  ADD COLUMN IF NOT EXISTS fixed_weekend_days       text[]  NOT NULL DEFAULT ARRAY['Sun','Sat'],
  -- Sick-leave policy
  ADD COLUMN IF NOT EXISTS sick_leave_forward_days  int     NOT NULL DEFAULT 2,               -- today + N selectable
  ADD COLUMN IF NOT EXISTS sick_leave_backward_days int     NOT NULL DEFAULT 2,               -- today - N selectable
  ADD COLUMN IF NOT EXISTS certificate_deadline_days int    NOT NULL DEFAULT 7,               -- days after sick leave to submit cert
  ADD COLUMN IF NOT EXISTS require_cert_approval    boolean NOT NULL DEFAULT true;            -- late cert needs approval before check-in

-- Ensure the singleton row exists.
INSERT INTO attendance_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- ── 2. Weekly-off cycle (one row per employee per month) ──────────────────────
CREATE TABLE IF NOT EXISTS weekoff_cycles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_key     text NOT NULL,                              -- 'YYYY-MM' the cycle belongs to
  allotted      int  NOT NULL DEFAULT 0,                    -- total weekoffs granted for the month
  locked        boolean NOT NULL DEFAULT false,             -- true once lock day passed / employee saved
  auto_assigned boolean NOT NULL DEFAULT false,             -- true if Sundays were auto-filled after lock
  preallotted_at timestamptz,                               -- when the employee saved their picks
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, cycle_key)
);
CREATE INDEX IF NOT EXISTS idx_weekoff_cycles_emp ON weekoff_cycles(employee_id, cycle_key);

-- ── 3. Individual weekly-off days (the picked / assigned off dates) ────────────
CREATE TABLE IF NOT EXISTS weekoff_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_key   text NOT NULL,                                -- 'YYYY-MM'
  off_date    date NOT NULL,
  week_index  int  NOT NULL,                                -- 1..6 week-of-month
  status      text NOT NULL DEFAULT 'allotted',             -- 'allotted' | 'taken' | 'changed'
  source      text NOT NULL DEFAULT 'preallot',             -- 'preallot' | 'auto_sunday' | 'changed' | 'carry'
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, off_date)
);
CREATE INDEX IF NOT EXISTS idx_weekoff_days_emp_cycle ON weekoff_days(employee_id, cycle_key);

-- ── 4. Weekly-off change requests (post-lock date swaps; need approval) ────────
CREATE TABLE IF NOT EXISTS weekoff_change_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  original_date  date NOT NULL,                             -- the allotted off being moved
  requested_date date NOT NULL,                             -- the new off being requested
  reason         text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',           -- 'pending' | 'approved' | 'rejected'
  decided_by     uuid REFERENCES employees(id),
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_weekoff_chg_emp    ON weekoff_change_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_weekoff_chg_status ON weekoff_change_requests(status);

-- ── 5. Sick leave (certificate = LINK, no storage) ────────────────────────────
CREATE TABLE IF NOT EXISTS sick_leaves (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_date                date NOT NULL,
  to_date                  date NOT NULL,
  days                     int  NOT NULL DEFAULT 1,
  reason                   text NOT NULL,
  certificate_url          text,                            -- Drive/Dropbox link — no Supabase storage used
  certificate_deadline     date NOT NULL,                   -- submission date + certificate_deadline_days
  certificate_submitted_at timestamptz,
  cert_status              text NOT NULL DEFAULT 'pending', -- 'pending' | 'submitted' | 'approved' | 'rejected'
  approval_required        boolean NOT NULL DEFAULT false,  -- set when cert submitted late and approval toggle is on
  blocks_checkin           boolean NOT NULL DEFAULT false,  -- true once past deadline with no accepted cert
  decided_by               uuid REFERENCES employees(id),
  decided_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sick_leaves_emp        ON sick_leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_sick_leaves_cert       ON sick_leaves(cert_status);
CREATE INDEX IF NOT EXISTS idx_sick_leaves_emp_dates  ON sick_leaves(employee_id, from_date, to_date);
