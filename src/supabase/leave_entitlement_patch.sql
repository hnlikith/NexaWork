-- ─── AUTOMATED LEAVE MANAGEMENT SCHEMA ─────────────────
-- Add leave tracking columns to employees matrix
ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_leave_quota NUMERIC DEFAULT 1.5;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS leave_balance NUMERIC DEFAULT 0;

-- Optional: Add a log for leave transactions
CREATE TABLE IF NOT EXISTS leave_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    type TEXT CHECK (type IN ('credit', 'debit')),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for ledger
ALTER TABLE leave_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable select for authenticated" ON leave_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated" ON leave_ledger FOR INSERT TO authenticated WITH CHECK (true);
