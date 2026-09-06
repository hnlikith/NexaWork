-- 050_recruitment_interview_system.sql
-- Extension for video interview scheduling

CREATE TABLE IF NOT EXISTS interviews (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  interview_id TEXT UNIQUE NOT NULL DEFAULT ('INT-' || upper(substring(gen_random_uuid()::text from 1 for 8))),
  application_id TEXT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  meeting_link TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_interviews_app ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status);

-- RLS
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR can manage interviews" ON interviews
  FOR ALL TO authenticated USING (true);

-- Anyone with a link can join a meeting (or we can add more security later)
CREATE POLICY "Public can view scheduled interviews" ON interviews
  FOR SELECT USING (true);
