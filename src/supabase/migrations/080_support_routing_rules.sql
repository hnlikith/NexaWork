CREATE TABLE IF NOT EXISTS support_routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL UNIQUE,
    target_role TEXT NOT NULL,
    target_department UUID REFERENCES teams(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS
ALTER TABLE support_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Access routing_rules"
ON support_routing_rules FOR SELECT USING (true);

CREATE POLICY "Admin Full Access routing_rules"
ON support_routing_rules FOR ALL USING (
  EXISTS (
    SELECT 1 FROM employees e 
    WHERE e.id = auth.uid() AND e.role = 'super_admin'
  )
);
