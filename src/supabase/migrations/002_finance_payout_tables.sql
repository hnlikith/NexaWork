-- src/supabase/migrations/002_finance_payout_tables.sql

-- Claims Table (Usually claims are requested by employees for particular tasks/bounties/incentives)
CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  incentive_id UUID REFERENCES public.incentives(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, processed, paid, rejected
  cycle INT DEFAULT 1,
  queue_position INT DEFAULT 0,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reimbursements Table (Expenses incurred out of pocket)
CREATE TABLE IF NOT EXISTS public.reimbursements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  receipt_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, processed, paid, rejected
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Priority Payouts Table (Advances / emergency funds requested by employees)
CREATE TABLE IF NOT EXISTS public.priority_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  urgency VARCHAR(20) NOT NULL DEFAULT 'high', -- high, critical
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, processed, paid, rejected
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Run permissions mapping if needed for the UI, simplified
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priority_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read claims" ON public.claims FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated insert claims" ON public.claims FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update claims" ON public.claims FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read reimbursements" ON public.reimbursements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated insert reimbursements" ON public.reimbursements FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update reimbursements" ON public.reimbursements FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read priority_payouts" ON public.priority_payouts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated insert priority_payouts" ON public.priority_payouts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update priority_payouts" ON public.priority_payouts FOR UPDATE USING (auth.role() = 'authenticated');
