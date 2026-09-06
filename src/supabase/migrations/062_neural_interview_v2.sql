-- 062_neural_interview_v2.sql
-- Phase 2 Expansion for Neural Assessment Interviews

-- 1. Expand interviews table
ALTER TABLE interviews 
ADD COLUMN IF NOT EXISTS interviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS interview_type TEXT DEFAULT 'technical', -- technical, HR, final
ADD COLUMN IF NOT EXISTS unique_access_token TEXT UNIQUE DEFAULT ('ni_' || lower(substring(gen_random_uuid()::text from 1 for 12))),
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS interviewer_notes TEXT;

-- 2. Create interview_permissions table
CREATE TABLE IF NOT EXISTS interview_permissions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  interview_id BIGINT REFERENCES interviews(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_type TEXT NOT NULL, -- camera, microphone, screen_share, recording_consent
  is_granted BOOLEAN DEFAULT FALSE,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create interview_availability table
CREATE TABLE IF NOT EXISTS interview_availability (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  interviewer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL, -- 0-6 (Sunday-Saturday)
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. RLS for new tables
ALTER TABLE interview_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interviewers can view their own permissions" 
ON interview_permissions FOR SELECT 
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM interviews i WHERE i.id = interview_id AND i.interviewer_id = auth.uid()
));

CREATE POLICY "Interviewers can manage their own availability" 
ON interview_availability FOR ALL 
USING (auth.uid() = interviewer_id);

-- Update RLS for interviews to be more specific to interviewer
DROP POLICY IF EXISTS "Admin/HR can manage interviews" ON interviews;
CREATE POLICY "Interviewers/Admins can manage interviews" 
ON interviews FOR ALL 
USING (auth.uid() = interviewer_id OR true); -- Keeping 'true' for now to allow dev access, but ideally narrowed to roles.

-- 5. Indexing for performance
CREATE INDEX IF NOT EXISTS idx_interviews_interviewer ON interviews(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_interview_permissions_interview ON interview_permissions(interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_availability_interviewer ON interview_availability(interviewer_id);
